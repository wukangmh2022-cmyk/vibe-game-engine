import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import RemoteUser from '../core/RemoteUser';
import { resolveFromBraces, interpolateBraces } from '../utils/ParamResolver';

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
      const sm: any = ( _context as any).stateManager;
      // sceneId: 默认 = 当前场景ID + '_' + 关卡序号（若取不到序号，则仅场景ID）
      let sceneId: string = String(p.sceneId || p.levelId || p.level || '').trim();
      if (!sceneId) {
        const gameId = (() => { try { return String((globalThis as any).__GAME_JSON?.id || 'scene'); } catch { return 'scene'; } })();
        const idxVar = sm?.getVariable?.('levelIndex') ?? sm?.getVariable?.('currentLevelIndex') ?? sm?.getVariable?.('__level_index__');
        const idx = (idxVar != null && idxVar !== '') ? String(idxVar) : '0';
        sceneId = `${gameId}_${idx}`;
      }
      // key/value 支持 {var} 与内插
      let key: string = String(p.key || '').trim();
      if (/^\{[^}]+\}$/.test(key)) { const v = resolveFromBraces<any>(key, _context); key = v != null ? String(v) : key; }
      else if (/\{[^}]+\}/.test(key)) { key = String(interpolateBraces(key, _context)); }
      const op: string = String(p.op || 'set');
      let value: any = p.value;
      if (typeof value === 'string') {
        if (/^\{[^}]+\}$/.test(value)) { value = resolveFromBraces<any>(value, _context); }
        else if (/\{[^}]+\}/.test(value)) { value = interpolateBraces(value, _context); }
      }
      if (!key) return this.createErrorResult('Missing required parameter: key');

      // load existing
      let sheet: any = null;
      try { sheet = JSON.parse(localStorage.getItem('user_data_sheet') || ''); } catch { sheet = null; }
      if (!sheet || typeof sheet !== 'object') sheet = { user_nickname: 'default', scene_data: {} };

      const coerce = (val: any) => {
        if (typeof val !== 'string') return val;
        const s = val.trim();
        if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
        if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
        if (/^null$/i.test(s)) return null;
        return val;
      };
      const applyOp = (oldVal: any) => {
        if (op === 'add') return (Number(oldVal) || 0) + (Number(value) || 0);
        if (op === 'sub') return (Number(oldVal) || 0) - (Number(value) || 0);
        if (op === 'mul') return (Number(oldVal) || 0) * (Number(value) || 0);
        if (op === 'div') { const v = Number(value) || 0; return v === 0 ? oldVal : (Number(oldVal) || 0) / v; }
        return coerce(value);
      };

      const sid = sceneId || '__default__';
      sheet.scene_data = sheet.scene_data || {};
      const group = sheet.scene_data[sid] || {};
      const old = group[key];
      group[key] = applyOp(old);
      sheet.scene_data[sid] = group;

      try { localStorage.setItem('user_data_sheet', JSON.stringify(sheet)); } catch {}
      // Fire-and-forget remote sync (if logged in); do not block game flow
      try {
        const RU: any = (RemoteUser as any)?.instance || (RemoteUser as any);
        const finalVal = group[key];
        if (RU && typeof RU.writeData === 'function' && RU.token) {
          setTimeout(() => { try { RU.writeData(sid, key, finalVal); } catch {} }, 0);
        }
      } catch {}
      return this.createSuccessResult({ sceneId: sid, key, op, value });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.createErrorResult(`Failed to set user data: ${msg}`);
    }
  }
}
