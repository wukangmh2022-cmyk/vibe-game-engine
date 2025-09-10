/**
 * BGM停止指令处理器
 * 负责停止当前播放的背景音乐
 */

import { CommandType, GameCommand, CommandContext, CommandResult } from '../../types';
import { BaseCommandHandler } from '../../core/CommandExecutor';

export class BgmStopHandler extends BaseCommandHandler {
  readonly type = CommandType.BGM_STOP;

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

      if (!currentBgm) {
        return this.createErrorResult('No BGM is currently set');
      }

      // 停止BGM
      context.audioManager.stopAudio(currentBgm);

      // 清除BGM状态
      context.stateManager.setVariable('current_bgm', null);
      context.stateManager.setVariable('bgm_playing', false);
      context.stateManager.setVariable('bgm_paused', false);
      context.stateManager.setVariable('bgm_volume', 1.0);
      context.stateManager.setVariable('bgm_stop_time', Date.now());

      context.logger.info('BGM停止成功', { musicId: currentBgm, fadeOut });

      return this.createSuccessResult({
        musicId: currentBgm,
        fadeOut,
        stoppedAt: Date.now()
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('BGM停止失败', error);
      return this.createErrorResult(`Failed to stop BGM: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return []; // 停止不需要必需参数
  }
}

export default BgmStopHandler;