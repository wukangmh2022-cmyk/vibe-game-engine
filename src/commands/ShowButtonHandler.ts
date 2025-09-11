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
    const { elementId, text } = command.parameters || {};
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
    context.eventManager.emit('button_displayed', { commandId: command.id, elementId, text, branches });

    return this.createSuccessResult({ elementId, text });
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
