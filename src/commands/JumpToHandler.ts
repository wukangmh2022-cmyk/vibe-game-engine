import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class JumpToHandler extends BaseCommandHandler {
  readonly type = CommandType.JUMP_TO;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { target } = command.parameters;
    
    if (!target) {
      return this.createErrorResult('Missing required parameter: target');
    }

    try {
      // 触发跳转事件（由运行时负责从目标位置继续顺序执行）
      context.eventManager.emit('jump_to_requested', { target });
      // 返回一个可识别的动作标记，供上层（如 LOOP）在同一迭代中及时停止后续命令
      return this.createSuccessResult({ action: 'jump', target });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to jump to target: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['target'];
  }
}
