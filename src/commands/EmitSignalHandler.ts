import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 发送信号指令处理器
 * 支持 JSON 中的大写类型（通过 CommandExecutor 的类型归一化），参数：
 * - signal: string (必填) 要发送的信号名称
 * - data?: any (可选) 附带的数据载荷
 */
export class EmitSignalHandler extends BaseCommandHandler {
  readonly type = CommandType.EMIT_SIGNAL;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { signal, data } = command.parameters || {};

    if (typeof signal !== 'string' || signal.trim().length === 0) {
      return this.createErrorResult('Missing required parameter: signal');
    }

    try {
      context.logger.debug(`Emitting signal: ${signal}`, { data });
      context.eventManager.emit(signal, data);

      return this.createSuccessResult({ signal, emitted: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to emit signal: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['signal'];
  }
}