import * as PIXI from 'pixi.js';
import { GameCommand, CommandType } from '../types';

export type UiBridge = {
  showChoices: (title: string, choices: string[]) => Promise<number>;
};

export class PixiRuntime {
  private app: PIXI.Application;
  private elements: Map<string, PIXI.DisplayObject> = new Map();
  private container: HTMLElement;

  // 简易全局状态（P0）：变量与开关
  private variables: Map<string, any> = new Map();
  private switches: Map<string, boolean> = new Map();

  // UI 桥接（由外部 UI 提供）
  private uiBridge?: UiBridge;

  // 运行控制
  private aborted = false;
  private abortResolvers: Set<() => void> = new Set();

  constructor(container: HTMLElement, width: number = 800, height: number = 600) {
    this.container = container;
    this.app = new PIXI.Application({
      width,
      height,
      backgroundColor: 0x1099bb,
      antialias: true
    });
    container.appendChild(this.app.view as HTMLCanvasElement);
    
    // Set initial canvas size from constructor parameters
    this.resize(width, height);
  }

  setUiBridge(bridge?: UiBridge) {
    this.uiBridge = bridge;
  }

  // 停止当前执行
  stop(): void {
    this.aborted = true;
    // 唤醒所有等待者（例如选择框、点击等待）
    this.abortResolvers.forEach((fn) => fn());
    this.abortResolvers.clear();
  }

  // 顺序执行一段指令（含可选起止）
  async runCommands(commands: GameCommand[], fromIndex: number = 0, toIndex?: number): Promise<void> {
    this.aborted = false;
    const end = toIndex === undefined ? commands.length : Math.min(toIndex, commands.length);
    let i = Math.max(0, fromIndex);

    while (!this.aborted && i < end) {
      const cmd = commands[i];
      const result = await this.executeCommand(cmd);
      if (this.aborted) break;
      if (result && typeof (result as any).jumpToIndex === 'number') {
        const j = (result as any).jumpToIndex as number;
        if (j >= 0 && j < commands.length) {
          i = j;
          continue;
        }
      }
      i++;
    }
  }

  // 执行单条指令
  private async executeCommand(command: GameCommand): Promise<{ jumpToIndex?: number } | void> {
    if (this.aborted) return;

    const commandType = command.type.toLowerCase();

    switch (commandType) {
      case 'show_image':
        await this.showImage(command);
        break;
      case 'show_text':
        await this.showText(command);
        break;
      case 'move_to':
        await this.moveTo(command);
        break;
      case 'scale_to':
        await this.scaleTo(command);
        break;
      case 'rotate_to':
        await this.rotateTo(command);
        break;
      case 'hide_elements':  // 修改为复数形式，匹配实际使用
        this.hideElement(command);
        break;
      case 'wait':
        await this.wait(command);
        break;
      case 'set_variable': {
        const { name, value } = command.parameters;
        if (name !== undefined) this.variables.set(String(name), value);
        break;
      }
      case 'set_switch': {
        const { name, value } = command.parameters;
        if (name !== undefined) this.switches.set(String(name), Boolean(value));
        break;
      }
      case 'jump_to': {
        const { targetIndex } = command.parameters;
        if (typeof targetIndex === 'number') {
          return { jumpToIndex: targetIndex };
        }
        break;
      }
      case 'enable_click': {
        const j = await this.enableClick(command);
        if (typeof j === 'number') return { jumpToIndex: j };
        break;
      }
      case 'show_choices':
      case 'show_button':  // 添加对按钮的支持
        await this.showChoices(command);
        break;
      case 'if_condition':
        // 条件分支暂时不处理
        break;
      case 'update_text':
        // TODO: 实现更新文本功能
        break;
      default:
        console.warn(`Unsupported command type: ${command.type}`);
    }
  }

  // 工具：延时
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private waitAbortable<T>(promise: Promise<T>): Promise<T | undefined> {
    if (this.aborted) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      let settled = false;
      const onAbort = () => {
        if (!settled) {
          settled = true;
          resolve(undefined);
        }
      };
      this.abortResolvers.add(onAbort);
      promise.then((v) => {
        if (!settled) {
          settled = true;
          this.abortResolvers.delete(onAbort);
          resolve(v);
        }
      }).catch(() => {
        if (!settled) {
          settled = true;
          this.abortResolvers.delete(onAbort);
          resolve(undefined);
        }
      });
    });
  }

  // 工具：通用动画（线性）
  private animate(duration: number, update: (t: number) => void): Promise<void> {
    return new Promise(resolve => {
      const start = Date.now();
      const step = () => {
        if (this.aborted) return resolve();
        const elapsed = Date.now() - start;
        const t = Math.min(1, duration <= 0 ? 1 : elapsed / duration);
        update(t);
        if (t < 1 && !this.aborted) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  // 显示图片
  private async showImage(command: GameCommand): Promise<void> {
    const { src, x = 0, y = 0, width, height, id } = command.parameters;
    if (!src) {
      console.error('Missing required parameter: src');
      return;
    }
    const elementId = id || `image_${Date.now()}`;
    try {
      const texture = PIXI.Texture.from(src);
      const sprite = new PIXI.Sprite(texture);
      sprite.x = x; sprite.y = y;
      if (width && height) { sprite.width = width; sprite.height = height; }
      if (this.elements.has(elementId)) {
        const old = this.elements.get(elementId)!;
        this.app.stage.removeChild(old);
      }
      this.app.stage.addChild(sprite);
      this.elements.set(elementId, sprite);
    } catch (e) {
      console.error('Failed to load image:', src, e);
    }
  }

  // 显示文本
  private async showText(command: GameCommand): Promise<void> {
    const { text, x = 0, y = 0, fontSize = 16, color = '#000000', fontFamily = 'Arial', id } = command.parameters;
    if (!text) {
      console.error('Missing required parameter: text');
      return;
    }
    const elementId = id || `text_${Date.now()}`;
    const textObj = new PIXI.Text(text, { fontSize, fill: color, fontFamily });
    textObj.x = x; textObj.y = y;
    if (this.elements.has(elementId)) {
      const old = this.elements.get(elementId)!;
      this.app.stage.removeChild(old);
    }
    this.app.stage.addChild(textObj);
    this.elements.set(elementId, textObj);
  }

  // 移动元素
  private async moveTo(command: GameCommand): Promise<void> {
    const { elementId, x, y, duration = 1000 } = command.parameters;
    if (!elementId || x === undefined || y === undefined) {
      console.error('Missing required parameters for moveTo');
      return;
    }
    const element = this.elements.get(elementId);
    if (!element) {
      console.error(`Element not found: ${elementId}`);
      return;
    }
    const startX = (element as any).x ?? 0;
    const startY = (element as any).y ?? 0;
    const dx = x - startX;
    const dy = y - startY;
    await this.animate(duration, (t) => {
      (element as any).x = startX + dx * t;
      (element as any).y = startY + dy * t;
    });
  }

  // 缩放到
  private async scaleTo(command: GameCommand): Promise<void> {
    const { elementId, scaleX = 1, scaleY = 1, duration = 1000 } = command.parameters;
    if (!elementId) return console.error('Missing required parameter: elementId');
    const element = this.elements.get(elementId) as any;
    if (!element) return console.error(`Element not found: ${elementId}`);
    const startSX = element.scale?.x ?? 1;
    const startSY = element.scale?.y ?? 1;
    const dSX = scaleX - startSX;
    const dSY = scaleY - startSY;
    await this.animate(duration, (t) => {
      if (!element.scale) return;
      element.scale.x = startSX + dSX * t;
      element.scale.y = startSY + dSY * t;
    });
  }

  // 旋转到（角度）
  private async rotateTo(command: GameCommand): Promise<void> {
    const { elementId, rotation = 0, duration = 1000 } = command.parameters;
    if (!elementId) return console.error('Missing required parameter: elementId');
    const element = this.elements.get(elementId) as any;
    if (!element) return console.error(`Element not found: ${elementId}`);
    const targetRad = (rotation * Math.PI) / 180;
    const startR = element.rotation ?? 0;
    const dR = targetRad - startR;
    await this.animate(duration, (t) => {
      element.rotation = startR + dR * t;
    });
  }

  // 隐藏元素
  private hideElement(command: GameCommand): void {
    const { elementId } = command.parameters;
    if (!elementId) return console.error('Missing required parameter: elementId');
    const element = this.elements.get(elementId);
    if (element) {
      this.app.stage.removeChild(element);
      this.elements.delete(elementId);
    }
  }

  // 等待
  private async wait(command: GameCommand): Promise<void> {
    const { duration = 0 } = command.parameters;
    await this.delay(Math.max(0, Number(duration)));
  }

  // 等待点击并跳转
  private async enableClick(command: GameCommand): Promise<number | undefined> {
    const { elementId, targetIndex } = command.parameters;
    if (!elementId || typeof targetIndex !== 'number') {
      console.error('Missing required parameters for ENABLE_CLICK');
      return;
    }
    const element = this.elements.get(elementId) as any;
    if (!element) {
      console.error(`Element not found: ${elementId}`);
      return;
    }
    element.interactive = true;
    element.buttonMode = true;

    const clickPromise = new Promise<number>((resolve) => {
      const handler = () => {
        element.off('pointertap', handler);
        element.interactive = false;
        element.buttonMode = false;
        resolve(targetIndex);
      };
      element.on('pointertap', handler);
    });

    const val = await this.waitAbortable(clickPromise);
    // 如果被中止，移除监听
    if (val === undefined) {
      try { element.removeAllListeners && element.removeAllListeners('pointertap'); } catch {}
      element.interactive = false;
      element.buttonMode = false;
    }
    return val;
  }

  // 显示选择框并等待选择
  private async showChoices(command: GameCommand): Promise<void> {
    const { title = '请选择', choices } = command.parameters;
    const list: string[] = Array.isArray(choices)
      ? choices
      : typeof choices === 'string'
        ? String(choices).split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    if (!this.uiBridge) {
      console.warn('SHOW_CHOICES called but no uiBridge provided');
      return;
    }
    const choicePromise = this.uiBridge.showChoices(String(title), list);
    await this.waitAbortable(choicePromise);
  }

  // 清空画布
  clearCanvas(): void {
    this.app.stage.removeChildren();
    this.elements.clear();
  }

  // 调整画布大小
  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  // 销毁运行时
  destroy(): void {
    this.aborted = true;
    this.abortResolvers.forEach((fn) => fn());
    this.abortResolvers.clear();
    this.app.destroy(true, true);
    this.elements.clear();
    this.variables.clear();
    this.switches.clear();
  }
}