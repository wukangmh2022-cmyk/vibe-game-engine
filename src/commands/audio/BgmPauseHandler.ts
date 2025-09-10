/**
 * BGM暂停指令处理器
 * 负责暂停当前播放的背景音乐
 */

import { CommandType, GameCommand, CommandContext, CommandResult } from '../../types';
import { BaseCommandHandler } from '../../core/CommandExecutor';

export class BgmPauseHandler extends BaseCommandHandler {
  readonly type = CommandType.BGM_PAUSE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { fadeOut = 0 } = command.parameters;

    // 参数验证
    if (fadeOut < 0) {
      return this.createErrorResult('fadeOut must be greater than or equal to 0');
    }

    try {
      // 获取当前播放的BGM
      const currentBgm = context.stateManager.getVariable('current_bgm');
      const isBgmPlaying = context.stateManager.getVariable('bgm_playing');

      if (!currentBgm || !isBgmPlaying) {
        return this.createErrorResult('No BGM is currently playing');
      }

      // 暂停BGM
      // 注意：IAudioManager接口中没有pause方法，我们使用stopAudio来模拟暂停
      // 在实际实现中，可能需要扩展IAudioManager接口来支持暂停功能
      context.audioManager.stopAudio(currentBgm);

      // 更新状态
      context.stateManager.setVariable('bgm_playing', false);
      context.stateManager.setVariable('bgm_paused', true);
      context.stateManager.setVariable('bgm_pause_time', Date.now());

      context.logger.info('BGM暂停成功', { musicId: currentBgm, fadeOut });

      return this.createSuccessResult({
        musicId: currentBgm,
        fadeOut,
        pausedAt: Date.now()
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('BGM暂停失败', error);
      return this.createErrorResult(`Failed to pause BGM: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return []; // 暂停不需要必需参数
  }
}

export default BgmPauseHandler;