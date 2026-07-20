import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import RemoteUser from '../core/RemoteUser';
import UserDataStore from '../core/UserDataStore';
import { resolveFromBraces, interpolateBraces } from '../utils/ParamResolver';

/**
 * SET_USER_DATA: 写入用户变量（跨场景）。
 * 使用 localStorage('user_data_sheet') 作为本地缓存，内部按 sceneId(当前场景ID_关卡索引) 分组。
 * 远端同步由 UserDataStore 以后台队列顺序发送，指令不阻塞。
 */
export class SetUserDataHandler extends BaseCommandHandler {
  readonly type = (CommandType as any).SET_USER_DATA || ('set_user_data' as any);

  async execute(command: GameCommand, _context: CommandContext): Promise<CommandResult> {
    try {
      const p = command.parameters || {};
      const sm: any = ( _context as any).stateManager;
      // 统一隐藏 sceneId 概念：内部计算 = 当前场景ID + '_' + 关卡序号
      const gameId = (() => { try { return String((globalThis as any).__GAME_JSON?.id || 'scene'); } catch { return 'scene'; } })();
      const idxVar = sm?.getVariable?.('levelIndex') ?? sm?.getVariable?.('currentLevelIndex') ?? sm?.getVariable?.('__level_index__');
      const idx = (idxVar != null && idxVar !== '') ? String(idxVar) : '0';
      const sceneId: string = `${gameId}_${idx}`;
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

      const sid = sceneId || '__default__';
      const store = UserDataStore.instance;
      const finalVal = store.applyOp(sid, key, (op as any), value);
      // Non‑blocking background sync via queue happens inside applyOp
      return this.createSuccessResult({ sceneId: sid, key, op, value: finalVal });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.createErrorResult(`Failed to set user data: ${msg}`);
    }
  }
}
