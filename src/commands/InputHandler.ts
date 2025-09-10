import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 输入交互指令处理器
 * 处理用户输入事件，包括键盘输入、文本输入等
 */
export class InputHandler extends BaseCommandHandler {
  readonly type = CommandType.WAIT_FOR_INPUT;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { inputType, elementId, placeholder, validation, timeout } = command.parameters;
    
    if (!inputType) {
      return this.createErrorResult('Missing required parameter: inputType');
    }

    try {
      // 通过渲染管理器获取输入适配器
      const renderManager = context.renderManager;
      if (!renderManager) {
        return this.createErrorResult('Render manager not available');
      }
      
      // 注意：这里需要扩展渲染管理器接口来支持输入事件
      const inputAdapter = (renderManager as any).inputAdapter;
      if (!inputAdapter) {
        return this.createErrorResult('Input adapter not available');
      }

      // 处理不同类型的输入
      switch (inputType) {
        case 'text':
          return await this.handleTextInput(elementId, placeholder, validation, timeout, inputAdapter, context);
        
        case 'keyboard':
          return await this.handleKeyboardInput(validation, timeout, inputAdapter, context);
        
        case 'number':
          return await this.handleNumberInput(elementId, placeholder, validation, timeout, inputAdapter, context);
        
        default:
          return this.createErrorResult(`Unsupported input type: ${inputType}`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to handle input: ${errorMessage}`);
    }
  }

  /**
   * 处理文本输入
   */
  private async handleTextInput(
    elementId: string,
    placeholder: string,
    validation: any,
    timeout: number,
    inputAdapter: any,
    context: CommandContext
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const timeoutId = timeout ? setTimeout(() => {
        resolve(this.createErrorResult('Input timeout'));
      }, timeout) : null;

      const inputCallback = (value: string) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        // 验证输入
        if (validation) {
          const isValid = this.validateInput(value, validation);
          if (!isValid) {
            resolve(this.createErrorResult('Input validation failed'));
            return;
          }
        }
        
        context.logger.debug(`Text input received: ${value}`);
        resolve(this.createSuccessResult({ 
          inputType: 'text',
          value,
          elementId
        }));
      };

      // 注册文本输入监听器
      inputAdapter.registerTextInput(elementId, placeholder, inputCallback);
    });
  }

  /**
   * 处理键盘输入
   */
  private async handleKeyboardInput(
    validation: any,
    timeout: number,
    inputAdapter: any,
    context: CommandContext
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const timeoutId = timeout ? setTimeout(() => {
        resolve(this.createErrorResult('Input timeout'));
      }, timeout) : null;

      const keyCallback = (event: any) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        // 验证按键
        if (validation && validation.allowedKeys) {
          if (!validation.allowedKeys.includes(event.key)) {
            return; // 忽略不允许的按键
          }
        }
        
        context.logger.debug(`Key input received: ${event.key}`);
        resolve(this.createSuccessResult({ 
          inputType: 'keyboard',
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey
        }));
      };

      // 注册键盘输入监听器
      inputAdapter.onKeyDown(keyCallback);
    });
  }

  /**
   * 处理数字输入
   */
  private async handleNumberInput(
    elementId: string,
    placeholder: string,
    validation: any,
    timeout: number,
    inputAdapter: any,
    context: CommandContext
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const timeoutId = timeout ? setTimeout(() => {
        resolve(this.createErrorResult('Input timeout'));
      }, timeout) : null;

      const inputCallback = (value: string) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
          resolve(this.createErrorResult('Invalid number input'));
          return;
        }
        
        // 验证数字范围
        if (validation) {
          if (validation.min !== undefined && numValue < validation.min) {
            resolve(this.createErrorResult(`Number too small (min: ${validation.min})`));
            return;
          }
          if (validation.max !== undefined && numValue > validation.max) {
            resolve(this.createErrorResult(`Number too large (max: ${validation.max})`));
            return;
          }
        }
        
        context.logger.debug(`Number input received: ${numValue}`);
        resolve(this.createSuccessResult({ 
          inputType: 'number',
          value: numValue,
          elementId
        }));
      };

      // 注册数字输入监听器
      inputAdapter.registerNumberInput(elementId, placeholder, inputCallback);
    });
  }

  /**
   * 验证输入值
   */
  private validateInput(value: string, validation: any): boolean {
    if (validation.required && !value.trim()) {
      return false;
    }
    
    if (validation.minLength && value.length < validation.minLength) {
      return false;
    }
    
    if (validation.maxLength && value.length > validation.maxLength) {
      return false;
    }
    
    if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
      return false;
    }
    
    return true;
  }

  protected getRequiredParameters(): string[] {
    return ['inputType'];
  }
}