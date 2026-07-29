import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 显示选择选项的指令处理器
 * 允许玩家从多个选项中进行选择
 */
export class ShowChoicesHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_CHOICES;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { title: rawTitle, timeout, elementId } = command.parameters as any;
      const multiSelect: boolean = !!((command.parameters as any)?.multiSelect || (command.parameters as any)?.ui?.multiSelect);
      const blocking: boolean = multiSelect ? false : ((command.parameters as any)?.blocking !== false);
      // 位置（供运行时渲染器决定放置处）
      const pos = command.parameters.position || {};
      const px: number | undefined = (command.parameters.x ?? pos.x);
      const py: number | undefined = (command.parameters.y ?? pos.y);
      // 兼容V2：options 字段与 text 作为标题
      // 选项可来自 parameters.choices / parameters.options / 顶层 options（V2）
      let choices = command.parameters.choices || command.parameters.options || (command as any).options;
      const title = rawTitle || command.parameters.text || '';

      // 验证必需参数
      if (!choices || !Array.isArray(choices) || choices.length === 0) {
        return this.createErrorResult('ShowChoices command requires a non-empty choices array');
      }

      // 验证选项格式
      for (const choice of choices) {
        if (!choice.text || typeof choice.text !== 'string') {
          return this.createErrorResult('Each choice must have a text property');
        }
      }

      context.logger?.info('Displaying choices', {
        title: title || '',
        choiceCount: choices.length,
        choices: choices.map((choice, index) => `${index + 1}. ${choice.text}`)
      });

      // 初始化系统变量：sys_choice_N（N 从 1 开始）为 false，确保变量面板可见
      try {
        const sm: any = (context as any).stateManager;
        if (sm && typeof sm.setVariable === 'function') {
          for (let i = 0; i < choices.length; i++) {
            sm.setVariable(`sys_choice_${i + 1}`, false);
          }
        }
      } catch {}

      // 模拟显示选择界面
      console.log('\n=== CHOICES ===');
      // no title output
      choices.forEach((choice: any, index: number) => {
        console.log(`${index + 1}. ${choice.text}`);
        if (choice.description) {
          console.log(`   ${choice.description}`);
        }
      });
      console.log('===============\n');

      // 监听选择事件
      let resolveChoice: (() => void) | null = null;
      const choicePromise = new Promise<void>((res) => { resolveChoice = res; });
      if (multiSelect) {
        // 多选：监听切换事件，仅在选中时执行子命令；不自动关闭
        const onToggle = async (payload: any) => {
          if (!payload || (payload.commandId && payload.commandId !== command.id) || (payload.elementId && payload.elementId !== elementId)) return;
          const idx: number = typeof payload.index === 'number' ? payload.index : -1;
          const sel = (idx >= 0 && idx < choices.length) ? choices[idx] : null;
          if (!sel) return;
          const isSelected = !!payload.selected;
          if (isSelected) {
            const child = Array.isArray((sel as any).commands) ? (sel as any).commands : [];
            if (child.length > 0) {
              const exec = (context as any).executor;
              await exec.executeCommands(child);
            }
          }
        };
        context.eventManager?.on('choice_toggled', onToggle);
      } else {
        const onSelect = async (payload: any) => {
          if (!payload || (payload.commandId && payload.commandId !== command.id) || (payload.elementId && payload.elementId !== elementId)) {
            return; // 非本次选择
          }
          const optId = payload.optionId ?? payload.id;
          let selected: any = null;
          if (optId != null) {
            selected = choices.find((c: any) => c.id === optId);
          } else if (typeof payload.index === 'number') {
            selected = choices[payload.index];
          }
          if (!selected) {
            context.logger?.warn('choice_selected payload did not match an option', payload);
            return;
          }
          // 单选：写入 sys_choice_N，选中的置 true，其他置 false
          try {
            const sm: any = (context as any).stateManager;
            if (sm && typeof sm.setVariable === 'function') {
              const selIdx = (typeof payload.index === 'number') ? payload.index : Math.max(0, choices.findIndex((c: any) => c === selected));
              for (let i = 0; i < choices.length; i++) sm.setVariable(`sys_choice_${i + 1}`, i === selIdx);
            }
          } catch {}
          const child = Array.isArray(selected.commands) ? selected.commands : [];
          if (child.length > 0) {
            const exec = (context as any).executor;
            await exec.executeCommands(child);
          }
          // 通知 UI 该选择组件生命周期结束，应该被移除
          context.eventManager?.emit('choices_dismissed', { commandId: command.id, elementId, selected: selected.id || selected.text });
          // resolve blocking if needed
          try { resolveChoice?.(); } catch {}
        };
        // 默认单次选择即结束生命周期
        context.eventManager?.once('choice_selected', onSelect);
      }

      // 触发选择显示事件（供上层渲染）
      const pick = (obj: any, keys: string[]) => {
        if (!obj) return undefined;
        for (const k of keys) { if (obj[k] != null) return obj[k]; }
        return undefined;
      };

      const ui: any = {};
      const assignIf = (k: string, v: any) => { if (v != null) (ui as any)[k] = v; };
      assignIf('rowMax', (command.parameters?.rowMax ?? (command.parameters as any)?.maxrow ?? (command.parameters as any)?.maxRow ?? command.parameters?.ui?.rowMax ?? (command.parameters as any)?.ui?.maxrow ?? (command.parameters as any)?.ui?.maxRow));
      const explicitButtonSkinId = command.parameters?.buttonSkinId || command.parameters?.ui?.buttonSkinId;
      const defaultButtonSkinId = (context.resourceManager as any)?.getSkin?.('btn-primary-9slice')
        ? 'btn-primary-9slice'
        : ((context.resourceManager as any)?.getSkin?.('dialog-default-9slice') ? 'dialog-default-9slice' : undefined);
      assignIf('buttonSkinId', explicitButtonSkinId || defaultButtonSkinId);
      assignIf('selectedSkinId', (command.parameters as any)?.selectedSkinId || (command.parameters as any)?.ui?.selectedSkinId);
      assignIf('buttonResourceId', command.parameters?.buttonResourceId || command.parameters?.ui?.buttonResourceId);
      assignIf('fontSize', command.parameters?.fontSize || command.parameters?.ui?.fontSize);
      assignIf('minWidth', command.parameters?.minWidth || command.parameters?.ui?.minWidth);
      assignIf('maxWidth', (command.parameters as any)?.maxWidth || (command.parameters as any)?.ui?.maxWidth);
      assignIf('height', command.parameters?.height || command.parameters?.ui?.height);
      assignIf('paddingX', command.parameters?.paddingX || command.parameters?.ui?.paddingX);
      assignIf('paddingY', (command.parameters as any)?.paddingY || (command.parameters as any)?.ui?.paddingY);
      assignIf('color', command.parameters?.color || command.parameters?.ui?.color);
      assignIf('gapX', pick(command.parameters?.ui, ['gapX','gapx','gap_x','gap-x']) ?? pick(command.parameters, ['gapX','gapx','gap_x','gap-x']));
      assignIf('gapY', pick(command.parameters?.ui, ['gapY','gapy','gap_y','gap-y']) ?? pick(command.parameters, ['gapY','gapy','gap_y','gap-y']));
      assignIf('zIndex', command.parameters?.zIndex ?? command.parameters?.ui?.zIndex);
      assignIf('tileNineSlice', (command.parameters as any)?.tileNineSlice != null ? !!(command.parameters as any)?.tileNineSlice : ((command.parameters as any)?.ui?.tileNineSlice != null ? !!(command.parameters as any)?.ui?.tileNineSlice : undefined));

      context.eventManager?.emit('choices_displayed', {
        commandId: command.id,
        elementId,
        position: (px != null && py != null) ? { x: Number(px), y: Number(py) } : undefined,
        title: '',
        choices,
        timeout,
        blocking: blocking,
        multiSelect,
        ui
      });

      // 单选且阻塞：等待选择后再返回；多选或非阻塞：直接返回
      if (!multiSelect && blocking) {
        await choicePromise;
      }

      return this.createSuccessResult({
        message: `Displayed ${choices.length} choices`,
        choiceCount: choices.length,
        title: '',
        choices,
        elementId
      });
    } catch (error) {
      context.logger?.error('Error in ShowChoicesHandler', error);
      return this.createErrorResult(`Failed to display choices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
