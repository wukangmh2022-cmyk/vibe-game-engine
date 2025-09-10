/**
 * 音量设置指令处理器
 * 负责设置全局音量、BGM音量或SE音量
 */

import { CommandType, GameCommand, CommandContext, CommandResult } from '../../types';
import { BaseCommandHandler } from '../../core/CommandExecutor';

/**
 * 音量类型枚举
 */
enum VolumeType {
  GLOBAL = 'global',
  BGM = 'bgm',
  SE = 'se'
}

/**
 * 音量设置参数接口
 */
interface SetVolumeParams {
  type: VolumeType;       // 音量类型
  volume: number;         // 音量值 (0-1)
  fadeTime?: number;      // 淡入淡出时间（毫秒）
  immediate?: boolean;    // 是否立即生效
}

export class SetVolumeHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_VOLUME;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const params = command.parameters as SetVolumeParams;
    const { type, volume, fadeTime = 0, immediate = true } = params;

    // 参数验证
    const validationResult = this.validateParameters(params);
    if (!validationResult.isValid) {
      return this.createErrorResult(validationResult.errors.join(', '));
    }

    try {
      let previousVolume: number;
      
      switch (type) {
        case VolumeType.GLOBAL:
          previousVolume = context.stateManager.getVariable('global_volume') || 1.0;
          
          // 设置全局音量
          context.audioManager.setGlobalVolume(volume);
          
          // 更新状态
          context.stateManager.setVariable('global_volume', volume);
          context.stateManager.setVariable('global_volume_changed_at', Date.now());
          
          context.logger.info('全局音量设置成功', { 
            previousVolume, 
            newVolume: volume, 
            fadeTime 
          });
          break;

        case VolumeType.BGM:
          previousVolume = context.stateManager.getVariable('bgm_volume') || 1.0;
          
          // 获取当前BGM
          const currentBgm = context.stateManager.getVariable('current_bgm');
          
          if (currentBgm) {
            // 如果有BGM在播放，调整其音量
            // 注意：IAudioManager接口中没有直接设置特定音频音量的方法
            // 这里我们只更新状态，实际音量调整可能需要重新播放或扩展接口
            context.stateManager.setVariable('bgm_volume', volume);
          } else {
            // 如果没有BGM在播放，只更新状态
            context.stateManager.setVariable('bgm_volume', volume);
          }
          
          context.stateManager.setVariable('bgm_volume_changed_at', Date.now());
          
          context.logger.info('BGM音量设置成功', { 
            previousVolume, 
            newVolume: volume, 
            fadeTime,
            currentBgm 
          });
          break;

        case VolumeType.SE:
          previousVolume = context.stateManager.getVariable('se_volume') || 1.0;
          
          // 设置SE音量
          context.stateManager.setVariable('se_volume', volume);
          context.stateManager.setVariable('se_volume_changed_at', Date.now());
          
          // 获取当前播放的音效列表
          const currentSounds = context.stateManager.getVariable('current_sounds') || [];
          
          context.logger.info('SE音量设置成功', { 
            previousVolume, 
            newVolume: volume, 
            fadeTime,
            activeSounds: currentSounds.length 
          });
          break;

        default:
          return this.createErrorResult(`Unsupported volume type: ${type}`);
      }

      return this.createSuccessResult({
        type,
        previousVolume,
        newVolume: volume,
        fadeTime,
        immediate,
        changedAt: Date.now()
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('音量设置失败', error);
      return this.createErrorResult(`Failed to set volume: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['type', 'volume'];
  }

  private validateParameters(params: SetVolumeParams): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.type || !Object.values(VolumeType).includes(params.type)) {
      errors.push(`type is required and must be one of: ${Object.values(VolumeType).join(', ')}`);
    }

    if (params.volume === undefined || typeof params.volume !== 'number' || params.volume < 0 || params.volume > 1) {
      errors.push('volume is required and must be a number between 0 and 1');
    }

    if (params.fadeTime !== undefined && (typeof params.fadeTime !== 'number' || params.fadeTime < 0)) {
      errors.push('fadeTime must be a non-negative number');
    }

    if (params.immediate !== undefined && typeof params.immediate !== 'boolean') {
      errors.push('immediate must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export { VolumeType };
export default SetVolumeHandler;