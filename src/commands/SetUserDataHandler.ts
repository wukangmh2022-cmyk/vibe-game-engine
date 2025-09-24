import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';

/**
 * SET_USER_DATA: 写入用户数据（跨场景）。
 * 现阶段将数据持久化到 localStorage('user_data_sheet')，结构与 config.json 一致：
 * { user_nickname: string, scene_data: Record<string, any> }
 */
export class SetUserDataHandler extends BaseCommandHandler {
  readonly type = (CommandType as any).SET_USER_DATA || ('set_user_data' as any);

  async execute(command: GameCommand, _context: CommandContext): Promise<CommandResult> {
    try {
      const p = command.parameters || {};
      // 单一类别：统一写入 user_data_sheet.scene_data[sceneId]
      const sceneId: string = String(p.sceneId || p.levelId || p.level || '__default__');
      const key: string = String(p.key || '').trim();
      const op: string = String(p.op || 'set');
      const value: any = p.value;
      if (!key) return this.createErrorResult('Missing required parameter: key');

      // load existing
      let sheet: any = null;
      try { sheet = JSON.parse(localStorage.getItem('user_data_sheet') || ''); } catch { sheet = null; }
      if (!sheet || typeof sheet !== 'object') sheet = { user_nickname: 'default', scene_data: {} };

      const applyOp = (oldVal: any) => {
        if (op === 'add') return (Number(oldVal) || 0) + (Number(value) || 0);
        if (op === 'sub') return (Number(oldVal) || 0) - (Number(value) || 0);
        if (op === 'mul') return (Number(oldVal) || 0) * (Number(value) || 0);
        if (op === 'div') { const v = Number(value) || 0; return v === 0 ? oldVal : (Number(oldVal) || 0) / v; }
        return value;
      };

      const sid = sceneId || '__default__';
      sheet.scene_data = sheet.scene_data || {};
      const group = sheet.scene_data[sid] || {};
      const old = group[key];
      group[key] = applyOp(old);
      sheet.scene_data[sid] = group;

      try { localStorage.setItem('user_data_sheet', JSON.stringify(sheet)); } catch {}
      return this.createSuccessResult({ sceneId: sid, key, op, value });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.createErrorResult(`Failed to set user data: ${msg}`);
    }
  }
}
