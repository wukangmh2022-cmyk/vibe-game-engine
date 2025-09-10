/**
 * SE音效播放指令处理器
 * 负责播放音效（Sound Effect）
 */

import { CommandType, GameCommand, CommandContext, CommandResult } from '../../types';
import { BaseCommandHandler } from '../../core/CommandExecutor';

/**
 * SE播放参数接口
 */
interface SePlayParams {
  soundId: string;        // 音效ID
  volume?: number;        // 音量 (0-1)
  loop?: boolean;         // 是否循环播放
  fadeIn?: number;        // 淡入时间（毫秒）
  delay?: number;         // 延迟播放时间（毫秒）
  interrupt?: boolean;    // 是否中断同类音效
}

export class SePlayHandler extends BaseCommandHandler {
  readonly type = CommandType.SE_PLAY;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const params = command.parameters as SePlayParams;
    const { 
      soundId, 
      volume = 1.0, 
      loop = false, 
      fadeIn = 0, 
      delay = 0,
      interrupt = false
    } = params;

    // 参数验证
    const validationResult = this.validateParameters(params);
    if (!validationResult.isValid) {
      return this.createErrorResult(validationResult.errors.join(', '));
    }

    try {
      // 如果设置了中断，停止同类音效
      if (interrupt) {
        const currentSounds = context.stateManager.getVariable('current_sounds') || [];
        const sameSounds = currentSounds.filter((sound: any) => sound.soundId === soundId);
        for (const sound of sameSounds) {
          context.audioManager.stopAudio(sound.instanceId);
        }
      }

      // 延迟播放
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 播放音效
      const instanceId = `se_${soundId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 使用playSound方法播放音效
      context.audioManager.playSound(soundId, {
        volume,
        loop
      });

      // 记录音效状态
      const currentSounds = context.stateManager.getVariable('current_sounds') || [];
      const soundInfo = {
        instanceId,
        soundId,
        volume,
        loop,
        startTime: Date.now(),
        fadeIn
      };
      
      currentSounds.push(soundInfo);
      context.stateManager.setVariable('current_sounds', currentSounds);
      context.stateManager.setVariable('last_se_played', soundId);
      context.stateManager.setVariable('se_play_count', 
        (context.stateManager.getVariable('se_play_count') || 0) + 1
      );

      context.logger.info('SE音效播放成功', { 
        soundId, 
        instanceId, 
        volume, 
        loop, 
        fadeIn, 
        delay 
      });

      return this.createSuccessResult({
        soundId,
        instanceId,
        volume,
        loop,
        fadeIn,
        delay,
        startedAt: Date.now()
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('SE音效播放失败', error);
      return this.createErrorResult(`Failed to play SE: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['soundId'];
  }

  private validateParameters(params: SePlayParams): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.soundId || typeof params.soundId !== 'string') {
      errors.push('soundId is required and must be a string');
    }

    if (params.volume !== undefined && (typeof params.volume !== 'number' || params.volume < 0 || params.volume > 1)) {
      errors.push('volume must be a number between 0 and 1');
    }

    if (params.loop !== undefined && typeof params.loop !== 'boolean') {
      errors.push('loop must be a boolean');
    }

    if (params.fadeIn !== undefined && (typeof params.fadeIn !== 'number' || params.fadeIn < 0)) {
      errors.push('fadeIn must be a non-negative number');
    }

    if (params.delay !== undefined && (typeof params.delay !== 'number' || params.delay < 0)) {
      errors.push('delay must be a non-negative number');
    }

    if (params.interrupt !== undefined && typeof params.interrupt !== 'boolean') {
      errors.push('interrupt must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default SePlayHandler;