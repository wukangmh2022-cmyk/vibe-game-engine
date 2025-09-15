import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 显示“是/否”按钮并处理分支执行
 *
 * 兼容 V2 JSON：
 * {
 *   id: 'enter-forest-question',
 *   type: 'BUTTON' | 'show_button',
 *   parameters: { elementId, text, ... },
 *   branches: {
 *     yes: { label?: string, commands?: GameCommand[] },
 *     no:  { label?: string, commands?: GameCommand[] }
 *   }
 * }
 *
 * 交互事件契约：
 * - 监听 'button_clicked' 事件，payload: { commandId, elementId, branch: 'yes'|'no'|boolean|string }
 *   - branch 为 true/'yes' → 执行 yes.commands
 *   - branch 为 false/'no'  → 执行 no.commands
 */
export class ShowButtonHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_BUTTON;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const params = command.parameters || {};
    const { elementId, text } = params;
    const pos = params.position || {};
    const px: number | undefined = params.x ?? pos.x;
    const py: number | undefined = params.y ?? pos.y;
    const pui = params.ui || {};
    const pick = (obj: any, keys: string[]) => {
      if (!obj) return undefined;
      for (const k of keys) { if (obj[k] != null) return obj[k]; }
      return undefined;
    };
    const ui: any = {};
    // only forward provided values; do NOT inject defaults here
    const assignIf = (k: string, v: any) => { if (v != null) ui[k] = v; };
    assignIf('theme', pui.theme ?? params.theme);
    assignIf('buttonResourceId', pui.buttonResourceId ?? params.buttonResourceId);
    assignIf('yesResourceId', pui.yesResourceId ?? params.yesResourceId);
    assignIf('noResourceId', pui.noResourceId ?? params.noResourceId);
    assignIf('buttonSkinId', pui.buttonSkinId ?? params.buttonSkinId);
    assignIf('autosize', (pui.autosize != null ? !!pui.autosize : (params.autosize != null ? !!params.autosize : undefined)));
    assignIf('minWidth', pui.minWidth ?? params.minWidth);
    // height/maxWidth intentionally not forwarded by default
    assignIf('height', pui.height ?? params.height);
    assignIf('maxWidth', pui.maxWidth ?? (params as any).maxWidth);
    assignIf('paddingX', pui.paddingX ?? params.paddingX);
    assignIf('paddingY', pui.paddingY ?? (params as any).paddingY);
    assignIf('fontSize', pui.fontSize ?? params.fontSize);
    assignIf('color', pui.color ?? params.color);
    assignIf('tileNineSlice', (pui.tileNineSlice != null ? !!pui.tileNineSlice : (params.tileNineSlice != null ? !!params.tileNineSlice : undefined)));
    assignIf('rowMax', pui.rowMax ?? (pui as any).maxrow ?? (pui as any).maxRow ?? params.rowMax ?? (params as any).maxrow ?? (params as any).maxRow);
    assignIf('gapX', pick(pui, ['gapX','gapx','gap_x','gap-x']) ?? pick(params, ['gapX','gapx','gap_x','gap-x']));
    assignIf('gapY', pick(pui, ['gapY','gapy','gap_y','gap-y']) ?? pick(params, ['gapY','gapy','gap_y','gap-y']));
    const branches = (command as any).branches || {};

    // 基础校验
    if (!elementId || typeof elementId !== 'string') {
      return this.createErrorResult("ShowButton requires 'elementId' in parameters");
    }

    // 一次性监听点击结果事件（先挂监听，再发展示事件，避免竞态）
    const onClick = async (payload: any) => {
      if (!payload || (payload.commandId && payload.commandId !== command.id) || (payload.elementId && payload.elementId !== elementId)) {
        return; // 非本按钮事件
      }

      // 解析分支
      const branchRaw = payload.branch;
      const branch: 'yes' | 'no' = branchRaw === true || branchRaw === 'yes' ? 'yes' : 'no';
      const branchCfg = branches?.[branch] || {};
      const childCommands: any[] = Array.isArray(branchCfg.commands) ? branchCfg.commands : [];

      context.logger?.info('Button clicked', { elementId, branch, childCount: childCommands.length });

      if (childCommands.length > 0) {
        const exec = (context as any).executor;
        await exec.executeCommands(childCommands);
      }

      // 通知 UI 该按钮生命周期结束，应该被移除
      context.eventManager.emit('button_dismissed', { commandId: command.id, elementId, branch });
    };

    context.eventManager.once('button_clicked', onClick);

    // 打印/记录（实际渲染由上层适配器完成，这里只负责行为与事件契约）
    context.logger?.info('Displaying yes/no button', { elementId, text, branches });
    // 发射一个展示事件，供上层渲染 UI
    context.eventManager.emit('button_displayed', { commandId: command.id, elementId, text, branches, ui, position: (px != null && py != null) ? { x: Number(px), y: Number(py) } : undefined });

    return this.createSuccessResult({ elementId, text, ui });
  }

  validate(command: GameCommand) {
    const errors: any[] = [];
    const { elementId } = command.parameters || {};
    if (!elementId || typeof elementId !== 'string') {
      errors.push({ field: 'parameters.elementId', message: 'elementId is required', code: 'REQUIRED' });
    }
    return { valid: errors.length === 0, errors };
  }
}
