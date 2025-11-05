import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { resolveFromBraces, interpolateBraces } from '../utils/ParamResolver';
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
    const { signal } = command.parameters || {};
    let { data } = command.parameters || {};

    if (typeof signal !== 'string' || signal.trim().length === 0) {
      return this.createErrorResult('Missing required parameter: signal');
    }

    try {
      // Accept simple comma-separated payload like: 1,true,'text',{var},'name_{var}'
      // → { args: [1, true, 'text', <resolved>, 'name_XX'] }
      if (typeof data === 'string') {
        const raw = String(data).trim();
        if (raw.length) {
          const parts = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
          const norm = parts.map(tok => {
            // Quoted string
            if ((tok.startsWith("'") && tok.endsWith("'")) || (tok.startsWith('"') && tok.endsWith('"'))) {
              const inner = tok.slice(1, -1);
              const interp = interpolateBraces(inner, context);
              return String(interp);
            }
            // Pure {var}
            if (/^\{[^}]+\}$/.test(tok)) {
              const v = resolveFromBraces<any>(tok, context);
              return v as any;
            }
            // Inline braces without quotes
            if (/\{[^}]+\}/.test(tok)) {
              const s = interpolateBraces(tok, context);
              // try coerce number/bool
              if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
              if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
              if (/^null$/i.test(s)) return null;
              return s;
            }
            // Primitives: number/boolean/null
            if (/^-?\d+(?:\.\d+)?$/.test(tok)) return Number(tok);
            if (/^(true|false)$/i.test(tok)) return /^true$/i.test(tok);
            if (/^null$/i.test(tok)) return null;
            return tok; // bare string token
          });
          data = { args: norm };
        } else {
          data = undefined;
        }
      } else if (Array.isArray(data)) {
        data = { args: data };
      }
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
