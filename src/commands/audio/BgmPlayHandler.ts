/**
 * BGM播放指令处理器
 * 负责播放背景音乐
 */

import { CommandType, GameCommand, CommandContext, CommandResult } from '../../types';
import { BaseCommandHandler } from '../../core/CommandExecutor';

export class BgmPlayHandler extends BaseCommandHandler {
  readonly type = CommandType.BGM_PLAY;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { musicId, volume = 0.8, loop = true, fadeIn = 0 } = command.parameters;
    if (!musicId) {
      return this.createErrorResult('Missing required parameter: musicId');
    }

    // 参数验证
    if (volume < 0 || volume > 1) {
      return this.createErrorResult('volume must be between 0 and 1');
    }

    if (fadeIn < 0) {
      return this.createErrorResult('fadeIn must be greater than or equal to 0');
    }

    try {
      // 停止现有BGM：优先调用音频管理器的全量音乐停止（跨场景时 state 可能被重置）
      try { (context.audioManager as any).stopAllMusic?.(); } catch {}
      // 兼容旧逻辑：如果 state 中记录了当前 BGM，也尝试按 id 停止一次
      try {
        const currentBgm = context.stateManager.getVariable('current_bgm');
        if (currentBgm) context.audioManager.stopAudio(currentBgm);
      } catch {}

      // 播放新的BGM
      const options = { volume, loop, fadeIn };
      context.audioManager.playMusic(musicId, options);

      // 记录当前播放的BGM状态
      context.stateManager.setVariable('current_bgm', musicId);
      context.stateManager.setVariable('bgm_volume', volume);
      context.stateManager.setVariable('bgm_playing', true);
      context.stateManager.setVariable('bgm_loop', loop);

      context.logger.info('BGM播放成功', { musicId, volume, loop });

      return this.createSuccessResult({
        musicId,
        volume,
        loop,
        fadeIn
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('BGM播放失败', error);
      return this.createErrorResult(`Failed to play BGM: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['musicId'];
  }
}

export default BgmPlayHandler;
