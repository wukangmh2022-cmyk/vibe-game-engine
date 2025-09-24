import { GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

// 场景跳转：跳转到指定场景JSON（相对工程根/scene/... 或绝对URL）
export class SceneRedirectHandler extends BaseCommandHandler {
  // 采用小写字符串，便于与运行时的大小写兼容匹配
  readonly type = 'scene_redirect' as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = (command.parameters || {}) as any;
    const url: string | undefined = p.url || p.scene || p.path;
    const levelIndex: number | undefined = (typeof p.levelIndex === 'number') ? p.levelIndex : (p.levelIndex != null ? Number(p.levelIndex) : undefined);
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
