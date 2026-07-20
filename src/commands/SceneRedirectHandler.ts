import { GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { interpolateBraces } from '../utils/ParamResolver';

// 场景跳转：跳转到指定场景JSON（相对工程根/scene/... 或绝对URL）
export class SceneRedirectHandler extends BaseCommandHandler {
  // 采用小写字符串，便于与运行时的大小写兼容匹配
  readonly type = 'scene_redirect' as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = (command.parameters || {}) as any;
    const rawUrl = p.url || p.scene || p.path;
    const resolvedUrl = interpolateBraces(rawUrl, context);
    const url: string | undefined = typeof resolvedUrl === 'string' ? resolvedUrl : undefined;
    const resolvedLevelIndex = interpolateBraces(p.levelIndex, context);
    const levelIndex: number | undefined = (typeof resolvedLevelIndex === 'number') ? resolvedLevelIndex : (resolvedLevelIndex != null ? Number(resolvedLevelIndex) : undefined);
    const fromLevel: string | undefined = (context?.stateManager?.getCurrentLevel?.() as any) || context?.stateManager?.getVariable?.('currentLevel');
    // Hardcoded console log for debugging scene redirects
    console.info('[SceneRedirectCommand] execute', {
      time: new Date().toISOString(),
      fromLevel,
      url,
      levelIndex,
      commandId: (command as any)?.id
    });
    try { context.logger?.info('SCENE_REDIRECT', { url, levelIndex, from: context?.stateManager?.getVariable?.('currentLevel') }); } catch {}
    // 通过事件总线发出跳转请求，由浏览器壳层负责真正重载
    context.eventManager.emit('scene_redirect', { url, levelIndex });
    return this.createSuccessResult({ url, levelIndex });
  }

  validate(): { valid: boolean; errors: any[] } {
    return { valid: true, errors: [] };
  }
}

export default SceneRedirectHandler;
