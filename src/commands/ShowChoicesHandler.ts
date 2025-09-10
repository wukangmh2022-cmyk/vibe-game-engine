import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 显示选择选项的指令处理器
 * 允许玩家从多个选项中进行选择
 */
export class ShowChoicesHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_CHOICES;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { choices, title, timeout } = command.parameters;

      // 验证必需参数
      if (!choices || !Array.isArray(choices) || choices.length === 0) {
        return this.createErrorResult('ShowChoices command requires a non-empty choices array');
      }

      // 验证选项格式
      for (const choice of choices) {
        if (!choice.text || typeof choice.text !== 'string') {
          return this.createErrorResult('Each choice must have a text property');
        }
      }

      context.logger?.info('Displaying choices', {
        title: title || 'Please choose:',
        choiceCount: choices.length,
        choices: choices.map((choice, index) => `${index + 1}. ${choice.text}`)
      });

      // 模拟显示选择界面
      console.log('\n=== CHOICES ===');
      if (title) {
        console.log(`Title: ${title}`);
      }
      choices.forEach((choice, index) => {
        console.log(`${index + 1}. ${choice.text}`);
        if (choice.description) {
          console.log(`   ${choice.description}`);
        }
      });
      console.log('===============\n');

      // 触发选择显示事件
      context.eventManager?.emit('choices_displayed', {
        commandId: command.id,
        title: title || 'Please choose:',
        choices,
        timeout
      });

      return this.createSuccessResult({
        message: `Displayed ${choices.length} choices`,
        choiceCount: choices.length,
        title: title || 'Please choose:',
        choices
      });
    } catch (error) {
      context.logger?.error('Error in ShowChoicesHandler', error);
      return this.createErrorResult(`Failed to display choices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}