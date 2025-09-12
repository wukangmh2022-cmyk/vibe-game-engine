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
      const { title: rawTitle, timeout, elementId } = command.parameters;
      // 兼容V2：options 字段与 text 作为标题
      // 选项可来自 parameters.choices / parameters.options / 顶层 options（V2）
      let choices = command.parameters.choices || command.parameters.options || (command as any).options;
      const title = rawTitle || command.parameters.text;

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
      choices.forEach((choice: any, index: number) => {
        console.log(`${index + 1}. ${choice.text}`);
        if (choice.description) {
          console.log(`   ${choice.description}`);
        }
      });
      console.log('===============\n');

      // 监听一次选择事件并执行被选项的子指令（先挂监听，再发展示事件，避免竞态）
      const onSelect = async (payload: any) => {
        if (!payload || (payload.commandId && payload.commandId !== command.id) || (payload.elementId && payload.elementId !== elementId)) {
          return; // 非本次选择
        }
        const optId = payload.optionId ?? payload.id;
        let selected: any = null;
        if (optId != null) {
          selected = choices.find((c: any) => c.id === optId);
        } else if (typeof payload.index === 'number') {
          selected = choices[payload.index];
        }
        if (!selected) {
          context.logger?.warn('choice_selected payload did not match an option', payload);
          return;
        }
        const child = Array.isArray(selected.commands) ? selected.commands : [];
        if (child.length > 0) {
          const exec = (context as any).executor;
          await exec.executeCommands(child);
        }
        // 通知 UI 该选择组件生命周期结束，应该被移除
        context.eventManager?.emit('choices_dismissed', { commandId: command.id, elementId, selected: selected.id || selected.text });
      };
      // 默认单次选择即结束生命周期
      context.eventManager?.once('choice_selected', onSelect);

      // 触发选择显示事件（供上层渲染）
      const ui = {
        rowMax: (command.parameters?.rowMax ?? command.parameters?.ui?.rowMax) || 1,
        theme: command.parameters?.theme || command.parameters?.ui?.theme || 'orange',
        buttonResourceId: command.parameters?.buttonResourceId || command.parameters?.ui?.buttonResourceId,
        fontSize: command.parameters?.fontSize || command.parameters?.ui?.fontSize || 16,
        minWidth: command.parameters?.minWidth || command.parameters?.ui?.minWidth || 140,
        height: command.parameters?.height || command.parameters?.ui?.height || 44,
        paddingX: command.parameters?.paddingX || command.parameters?.ui?.paddingX || 18,
        color: command.parameters?.color || command.parameters?.ui?.color || '#fff'
      };

      context.eventManager?.emit('choices_displayed', {
        commandId: command.id,
        elementId,
        title: title || 'Please choose:',
        choices,
        timeout,
        ui
      });

      return this.createSuccessResult({
        message: `Displayed ${choices.length} choices`,
        choiceCount: choices.length,
        title: title || 'Please choose:',
        choices,
        elementId
      });
    } catch (error) {
      context.logger?.error('Error in ShowChoicesHandler', error);
      return this.createErrorResult(`Failed to display choices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
