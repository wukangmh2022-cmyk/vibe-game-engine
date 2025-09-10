import { CommandType, GameCommand, CommandContext, CommandResult, ValidationResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 游戏结束指令处理器
 * 处理游戏结束逻辑，包括显示结束画面、保存分数、重置游戏状态等
 */
export class GameOverHandler extends BaseCommandHandler {
  readonly type = CommandType.GAME_OVER;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { stateManager, logger } = context;
      const { reason, showScore, resetGame, message, redirectTo } = command.parameters || {};

      logger.info(`游戏结束: ${reason || '未知原因'}`);

      // 获取当前游戏状态
      const currentScore = stateManager.getVariable('score') || 0;
      const currentLevel = stateManager.getVariable('currentLevel') || 1;
      const gameTime = stateManager.getVariable('gameTime') || 0;

      // 设置游戏结束状态
      stateManager.setVariable('gameOver', true);
      stateManager.setVariable('gameEndReason', reason || 'unknown');
      stateManager.setVariable('finalScore', currentScore);
      stateManager.setVariable('finalLevel', currentLevel);
      stateManager.setVariable('gameEndTime', Date.now());

      // 构建游戏结束信息
      const gameOverData = {
        reason: reason || 'unknown',
        score: currentScore,
        level: currentLevel,
        gameTime,
        timestamp: Date.now()
      };

      // 如果指定了自定义消息，使用自定义消息
      let endMessage = message;
      if (!endMessage) {
        // 根据结束原因生成默认消息
        switch (reason) {
          case 'victory':
            endMessage = `🎉 恭喜通关！最终得分: ${currentScore}`;
            break;
          case 'defeat':
            endMessage = `💀 游戏失败！最终得分: ${currentScore}`;
            break;
          case 'timeout':
            endMessage = `⏰ 时间到！最终得分: ${currentScore}`;
            break;
          case 'quit':
            endMessage = `👋 游戏退出！最终得分: ${currentScore}`;
            break;
          default:
            endMessage = `🎮 游戏结束！最终得分: ${currentScore}`;
        }
      }

      // 保存游戏结束数据到状态管理器
      stateManager.setVariable('gameOverData', gameOverData);

      // 如果需要显示分数统计
      if (showScore !== false) {
        const scoreDetails = {
          finalScore: currentScore,
          level: currentLevel,
          gameTime,
          reason
        };
        stateManager.setVariable('scoreDetails', scoreDetails);
      }

      // 如果需要重置游戏状态
      if (resetGame === true) {
        // 保留游戏结束相关的状态，重置其他游戏状态
        const preservedKeys = ['gameOver', 'gameEndReason', 'finalScore', 'finalLevel', 'gameEndTime', 'gameOverData'];
        
        // 重置分数和生命值等游戏状态
        stateManager.setVariable('score', 0);
        stateManager.setVariable('health', 100);
        stateManager.setVariable('level', 1);
        
        logger.info('游戏状态已重置');
      }

      // 触发游戏结束事件
      const gameOverEvent = {
        type: 'game:over',
        data: gameOverData,
        message: endMessage
      };

      logger.info(`游戏结束处理完成: ${JSON.stringify(gameOverData)}`);

      return {
        success: true,
        data: {
          gameOverData,
          redirectTo: redirectTo || null,
          event: gameOverEvent,
          message: endMessage
        }
      };

    } catch (error) {
      const errorMessage = `游戏结束处理失败: ${error instanceof Error ? error.message : String(error)}`;
      context.logger.error(errorMessage);
      
      return {
        success: false,
        data: {
          message: errorMessage,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * 验证游戏结束指令
   */
  validate(command: GameCommand): ValidationResult {
    if (command.type !== CommandType.GAME_OVER) {
      return { 
        valid: false, 
        errors: [{ field: 'type', message: 'Invalid command type for GAME_OVER handler', code: 'INVALID_TYPE' }] 
      };
    }
    const paramValidation = this.validateParameters(command.parameters || {});
    if (!paramValidation) {
      return { 
        valid: false, 
        errors: [{ field: 'parameters', message: 'Invalid parameters for GAME_OVER command', code: 'INVALID_PARAMS' }] 
      };
    }
    return { valid: true, errors: [] };
  }

  /**
   * 验证游戏结束指令参数
   */
  validateParameters(parameters: any): boolean {
    if (!parameters) return true; // 参数是可选的

    const { reason, showScore, resetGame, message, redirectTo } = parameters;

    // reason 应该是字符串
    if (reason !== undefined && typeof reason !== 'string') {
      return false;
    }

    // showScore 应该是布尔值
    if (showScore !== undefined && typeof showScore !== 'boolean') {
      return false;
    }

    // resetGame 应该是布尔值
    if (resetGame !== undefined && typeof resetGame !== 'boolean') {
      return false;
    }

    // message 应该是字符串
    if (message !== undefined && typeof message !== 'string') {
      return false;
    }

    // redirectTo 应该是字符串
    if (redirectTo !== undefined && typeof redirectTo !== 'string') {
      return false;
    }

    return true;
  }
}

export default GameOverHandler;