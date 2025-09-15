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
      // 位置（供运行时渲染器决定放置处）
      const pos = command.parameters.position || {};
      const px: number | undefined = (command.parameters.x ?? pos.x);
      const py: number | undefined = (command.parameters.y ?? pos.y);
      // 兼容V2：options 字段与 text 作为标题
      // 选项可来自 parameters.choices / parameters.options / 顶层 options（V2）
      let choices = command.parameters.choices || command.parameters.options || (command as any).options;
      const title = rawTitle || command.parameters.text || '';

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
        title: title || '',
        choiceCount: choices.length,
        choices: choices.map((choice, index) => `${index + 1}. ${choice.text}`)
      });

      // 模拟显示选择界面
      console.log('\n=== CHOICES ===');
      // no title output
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
      const pick = (obj: any, keys: string[]) => {
        if (!obj) return undefined;
        for (const k of keys) { if (obj[k] != null) return obj[k]; }
        return undefined;
      };

      const ui: any = {};
      const assignIf = (k: string, v: any) => { if (v != null) (ui as any)[k] = v; };
      assignIf('rowMax', (command.parameters?.rowMax ?? (command.parameters as any)?.maxrow ?? (command.parameters as any)?.maxRow ?? command.parameters?.ui?.rowMax ?? (command.parameters as any)?.ui?.maxrow ?? (command.parameters as any)?.ui?.maxRow));
      assignIf('buttonSkinId', command.parameters?.buttonSkinId || command.parameters?.ui?.buttonSkinId);
      assignIf('buttonResourceId', command.parameters?.buttonResourceId || command.parameters?.ui?.buttonResourceId);
      assignIf('fontSize', command.parameters?.fontSize || command.parameters?.ui?.fontSize);
      assignIf('minWidth', command.parameters?.minWidth || command.parameters?.ui?.minWidth);
      assignIf('maxWidth', (command.parameters as any)?.maxWidth || (command.parameters as any)?.ui?.maxWidth);
      assignIf('height', command.parameters?.height || command.parameters?.ui?.height);
      assignIf('paddingX', command.parameters?.paddingX || command.parameters?.ui?.paddingX);
      assignIf('paddingY', (command.parameters as any)?.paddingY || (command.parameters as any)?.ui?.paddingY);
      assignIf('color', command.parameters?.color || command.parameters?.ui?.color);
      assignIf('gapX', pick(command.parameters?.ui, ['gapX','gapx','gap_x','gap-x']) ?? pick(command.parameters, ['gapX','gapx','gap_x','gap-x']));
      assignIf('gapY', pick(command.parameters?.ui, ['gapY','gapy','gap_y','gap-y']) ?? pick(command.parameters, ['gapY','gapy','gap_y','gap-y']));
      assignIf('tileNineSlice', (command.parameters as any)?.tileNineSlice != null ? !!(command.parameters as any)?.tileNineSlice : ((command.parameters as any)?.ui?.tileNineSlice != null ? !!(command.parameters as any)?.ui?.tileNineSlice : undefined));

      context.eventManager?.emit('choices_displayed', {
        commandId: command.id,
        elementId,
        position: (px != null && py != null) ? { x: Number(px), y: Number(py) } : undefined,
        title: '',
        choices,
        timeout,
        ui
      });

      return this.createSuccessResult({
        message: `Displayed ${choices.length} choices`,
        choiceCount: choices.length,
        title: '',
        choices,
        elementId
      });
    } catch (error) {
      context.logger?.error('Error in ShowChoicesHandler', error);
      return this.createErrorResult(`Failed to display choices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
