import { GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveNumberFromBraces, interpolateBraces } from '../utils/ParamResolver';

// 场景跳转：跳转到指定场景JSON（相对工程根/scene/... 或绝对URL）
export class SceneRedirectHandler extends BaseCommandHandler {
  // 采用小写字符串，便于与运行时的大小写兼容匹配
  readonly type = 'scene_redirect' as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = (command.parameters || {}) as any;
    const rawUrl: any = p.url || p.scene || p.path;
    let url: string | undefined;
    if (typeof rawUrl === 'string') {
      const interpolated = interpolateBraces(rawUrl, context);
      const trimmed = String(interpolated || '').trim();
      url = trimmed.length ? trimmed : undefined;
    } else if (rawUrl != null) {
      url = String(rawUrl);
    }
    let levelIndex: number | undefined;
    if (typeof p.levelIndex === 'number') {
      levelIndex = p.levelIndex;
    } else if (p.levelIndex != null && p.levelIndex !== '') {
      const resolved = resolveNumberFromBraces(p.levelIndex, context);
      if (typeof resolved === 'number') {
        levelIndex = resolved;
      } else {
        const numeric = Number(p.levelIndex);
        levelIndex = Number.isFinite(numeric) ? numeric : undefined;
      }
    }
    const fromLevel: string | undefined = (context?.stateManager?.getCurrentLevel?.() as any) || context?.stateManager?.getVariable?.('currentLevel');
    // Debug logs (only when DEBUG_RUNTIME=1)
    {
      const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1';
      if (dbg) console.info('[SceneRedirectCommand] execute', {
        time: new Date().toISOString(),
        fromLevel,
        url,
        levelIndex,
        commandId: (command as any)?.id
      });
      if (dbg) context.logger?.info?.('SCENE_REDIRECT', { url, levelIndex, from: context?.stateManager?.getVariable?.('currentLevel') });
    }
    // 通过事件总线发出跳转请求，由浏览器壳层负责真正重载
    context.eventManager.emit('scene_redirect', { url, levelIndex });
    return this.createSuccessResult({ url, levelIndex });
  }

  validate(): { valid: boolean; errors: any[] } {
    return { valid: true, errors: [] };
  }
}

export default SceneRedirectHandler;
