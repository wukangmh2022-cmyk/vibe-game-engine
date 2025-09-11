import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class PixiCreateDropZoneHandler extends BaseCommandHandler {
  readonly type = CommandType.CREATE_DROP_ZONE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const id: string = p.dropZoneId;
    const pos = p.position || {}; const size = p.size || {};
    const rect = { x: Number(pos.x||0), y: Number(pos.y||0), w: Number(size.width||0), h: Number(size.height||0), accept: Array.isArray(p.acceptTypes) ? p.acceptTypes.slice() : undefined };
    if (!id) return this.createErrorResult('Missing required parameter: dropZoneId');
    const rm: any = context.renderManager as any;
    if (rm?.addDropZone) {
      rm.addDropZone(id, rect);
      return this.createSuccessResult({ id, rect });
    }
    return this.createErrorResult('Renderer does not support drop zones');
  }

  protected getRequiredParameters(): string[] { return ['dropZoneId']; }
}

