import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 点击交互指令处理器
 * 处理元素点击事件的注册和触发
 */
export class ClickHandler extends BaseCommandHandler {
  readonly type = CommandType.ENABLE_CLICK;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementId, action, eventData } = command.parameters;
    
    if (!elementId) {
      return this.createErrorResult('Missing required parameter: elementId');
    }

    try {
      // 通过渲染管理器获取输入适配器
      const renderManager = context.renderManager;
      if (!renderManager) {
        return this.createErrorResult('Render manager not available');
      }
      
      // 注意：这里需要扩展渲染管理器接口来支持输入事件
      // 目前先模拟实现
      const inputAdapter = (renderManager as any).inputAdapter;
      if (!inputAdapter) {
        return this.createErrorResult('Input adapter not available');
      }

      // 注册点击事件监听器
      if (action === 'register') {
        const callback = (event: any) => {
          context.logger.debug(`Click event triggered on element: ${elementId}`);
          
          // 触发后续指令或事件
          if (eventData?.nextCommands) {
            context.eventManager?.emit('commandSequence', {
              commands: eventData.nextCommands,
              context
            });
          }
        };

        inputAdapter.registerClickHandler(elementId, callback);
        context.logger.debug(`Click handler registered for element: ${elementId}`);
        
        return this.createSuccessResult({ 
          elementId, 
          action: 'registered',
          message: `Click handler registered for ${elementId}`
        });
      }
      
      // 模拟点击事件
      if (action === 'trigger') {
        inputAdapter.triggerClick(elementId, eventData);
        context.logger.debug(`Click event triggered for element: ${elementId}`);
        
        return this.createSuccessResult({ 
          elementId, 
          action: 'triggered',
          message: `Click event triggered for ${elementId}`
        });
      }

      // 移除点击事件监听器
      if (action === 'unregister') {
        inputAdapter.unregisterClickHandler(elementId);
        context.logger.debug(`Click handler unregistered for element: ${elementId}`);
        
        return this.createSuccessResult({ 
          elementId, 
          action: 'unregistered',
          message: `Click handler unregistered for ${elementId}`
        });
      }

      return this.createErrorResult(`Unknown action: ${action}`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to handle click event: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['elementId'];
  }
}