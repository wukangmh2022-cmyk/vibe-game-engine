export interface CompiledLevelPatch {
  intent?: string;
  asset_catalog?: any[];
  commands: any[];
  extra_events: any[];
}

type Spec = { type: string; positional: string[]; block?: string };

const SPECS: Record<string, Spec> = {
  VAR: { type: 'SET_VARIABLE', positional: [] }, SWITCH: { type: 'SET_SWITCH', positional: ['key', 'value'] },
  WAIT: { type: 'WAIT', positional: ['duration'] }, JUMP: { type: 'JUMP_TO', positional: ['target'] },
  SIGNAL: { type: 'EMIT_SIGNAL', positional: ['signal'] }, LOOP: { type: 'LOOP', positional: [], block: 'commands' },
  BREAK: { type: 'BREAK', positional: [] }, CONTINUE: { type: 'CONTINUE', positional: [] }, RETURN: { type: 'RETURN', positional: [] },
  IMAGE: { type: 'SHOW_IMAGE', positional: ['elementId', 'resourceId'] }, TEXT: { type: 'SHOW_TEXT', positional: ['elementId', 'text'] },
  TEXT_SET: { type: 'UPDATE_TEXT', positional: ['elementId', 'text'] }, BUTTON: { type: 'SHOW_CHOICES', positional: ['elementId', 'text'] },
  MEDIA: { type: 'SHOW_MEDIA', positional: ['elementId', 'mediaType', 'resourceId'] }, CHOICES: { type: 'SHOW_CHOICES', positional: ['elementId'], block: 'options' },
  STYLE: { type: 'SET_ELEMENT_STYLE', positional: ['elementId', 'style'] }, MOVE: { type: 'MOVE_TO', positional: ['elementId', 'x', 'y'] },
  SCALE: { type: 'SCALE_TO', positional: ['elementId', 'scaleX', 'scaleY'] }, ROTATE: { type: 'ROTATE_TO', positional: ['elementId', 'rotation'] },
  FLIP: { type: 'FLIP_CARD', positional: ['elementId', 'backResourceId'] }, CLICK: { type: 'SET_CLICKABLE', positional: ['elementId'], block: 'commands' },
  SELECT: { type: 'SET_SELECTABLE', positional: ['elementId'], block: 'onSelectedCommands' }, DRAG: { type: 'SET_DRAGGABLE', positional: ['elementId'] },
  AREA: { type: 'CHECK_IN_AREA', positional: [], block: 'commands' }, SELECT_STATE: { type: 'CHANGE_SELECTED_STATE', positional: ['elementId', 'selected'] },
  ANIM_IN: { type: 'ANIMATE_IN', positional: ['elementId', 'preset'] }, ANIM_LOOP: { type: 'ANIMATE_LOOP', positional: ['elementId', 'loopType'] },
  ANIM_OUT: { type: 'ANIMATE_OUT', positional: ['elementId', 'preset'] }, ANIM_STOP: { type: 'STOP_ANIMATION', positional: ['elementId'] },
  FIREWORK: { type: 'FIREWORK_BURST', positional: [] }, BGM: { type: 'BGM_PLAY', positional: ['musicId'] },
  BGM_PAUSE: { type: 'BGM_PAUSE', positional: [] }, BGM_STOP: { type: 'BGM_STOP', positional: [] },
  SE: { type: 'SE_PLAY', positional: ['soundId'] }, SE_STOP: { type: 'SE_STOP', positional: [] }, VOLUME: { type: 'SET_VOLUME', positional: ['target', 'volume'] },
  NEXT: { type: 'NEXT_LEVEL', positional: [] }, SCENE: { type: 'SCENE_REDIRECT', positional: ['url'] },
};

const GENERIC_ALLOWED = new Set(['SET_USER_DATA', 'ADD_SCORE', 'PLAY_SOUND', 'SET_POSITION', 'GET_POSITION', 'CREATE_DROP_ZONE']);
const OPS: Record<string, string> = { '=': 'set', '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '==': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte' };
const CONDITION_OPS = new Set(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'contains']);
const OPTION_ALIASES: Record<string, Record<string, string>> = {
  SHOW_IMAGE: { x: 'position.x', y: 'position.y', w: 'size.width', h: 'size.height', z: 'zIndex', vis: 'visible', parent: 'parentId', rot: 'rotation' },
  SHOW_TEXT: { x: 'position.x', y: 'position.y', z: 'zIndex', block: 'blocking', dismiss: 'dismissOnContinue', skin: 'skinId', pad: 'padding', vis: 'visible' },
  SHOW_CHOICES: { x: 'position.x', y: 'position.y', block: 'blocking', multi: 'multiSelect', skin: 'ui.buttonSkinId', selectedSkin: 'ui.selectedSkinId' },
  MOVE_TO: { ms: 'duration', rel: 'relative', keep: 'keepOnMinusOne' },
  ANIMATE_IN: { ms: 'duration', dir: 'direction' }, ANIMATE_LOOP: { ms: 'duration' }, ANIMATE_OUT: { ms: 'duration', dir: 'direction', hide: 'hideAfter' },
  BGM_PLAY: { vol: 'volume', loop: 'loop', fade: 'fadeIn' }, BGM_STOP: { fade: 'fadeOut' },
  SE_PLAY: { vol: 'volume', loop: 'loop', fade: 'fadeIn', delay: 'delay', interrupt: 'interrupt' },
  SET_CLICKABLE: { enabled: 'clickable', block: 'blocking', action: 'onClick', front: 'frontResourceId', back: 'backResourceId', showBack: 'showBack' },
  SET_SELECTABLE: { enabled: 'selectable', var: 'variableKey', single: 'singleSelect', overlay: 'overlayResourceId' },
  SET_DRAGGABLE: { enabled: 'draggable' }, CHECK_IN_AREA: { mode: 'triggerMode', enter: 'requireEnter', outside: 'outside' },
  SCENE_REDIRECT: { level: 'levelIndex' },
};

export class LevelDslError extends Error {
  constructor(public line: number, message: string) {
    super(`DSL line ${line}: ${message}`);
    this.name = 'LevelDslError';
  }
}

type SourceLine = { number: number; indent: number; text: string };

function lex(text: string, line: number): string[] {
  const tokens: string[] = [];
  let start = 0, depth = 0, quote = '', escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') { depth -= 1; if (depth < 0) throw new LevelDslError(line, 'unbalanced closing bracket'); }
    else if (/\s/.test(char) && depth === 0) {
      if (start < i) tokens.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (quote) throw new LevelDslError(line, 'unterminated string');
  if (depth) throw new LevelDslError(line, 'unbalanced JSON value');
  if (start < text.length) tokens.push(text.slice(start));
  return tokens;
}

function value(token: string, line: number): any {
  if (token.startsWith("'")) return token.slice(1, -1);
  const container = (token.startsWith('{') && token.endsWith('}')) || (token.startsWith('[') && token.endsWith(']'));
  const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?)$/.test(token);
  if (token.startsWith('"') || container || primitive) {
    try { return JSON.parse(token); } catch (error: any) { throw new LevelDslError(line, `invalid JSON value: ${error?.message || error}`); }
  }
  return token;
}

function setPath(target: any, path: string, item: any): void {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = item;
}

function sourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim() || raw.trimStart().startsWith('#')) return;
    const leading = raw.match(/^\s*/)?.[0] || '';
    if (leading.includes('\t')) throw new LevelDslError(index + 1, 'tabs are not allowed');
    if (leading.length % 4) throw new LevelDslError(index + 1, 'indentation must use four spaces');
    lines.push({ number: index + 1, indent: leading.length / 4, text: raw.trim() });
  });
  return lines;
}

function walk(commands: any[], events: any[] = []): any[] {
  const result: any[] = [];
  const visit = (items: any[]) => (items || []).forEach(command => {
    result.push(command);
    const p = command?.parameters || {};
    ['commands', 'trueCommands', 'falseCommands', 'onSelectedCommands', 'onCancelSelectedCommands'].forEach(field => visit(p[field] || []));
    (p.options || []).forEach((option: any) => visit(option?.commands || []));
  });
  visit(commands);
  (events || []).forEach(event => visit(event?.commands || []));
  return result;
}

class Parser {
  private lines: SourceLine[];
  private index = 0;
  private commandIndex = 0;
  private eventIndex = 0;
  private ids = new Set<string>();
  private labels = new Map<string, string>();
  private externalTargets = new Set<string>();

  constructor(text: string) { this.lines = sourceLines(text); }

  parse(): { commands: any[]; extra_events: any[] } {
    const commands: any[] = [], events: any[] = [];
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent !== 0) throw new LevelDslError(line.number, 'top-level line must not be indented');
      const head = lex(line.text, line.number)[0].toUpperCase();
      if (['ON', 'AUTO', 'EVENT'].includes(head)) events.push(this.parseEvent());
      else commands.push(...this.parseCommands(0, true));
    }
    walk(commands, events).forEach(command => {
      if (command.type !== 'JUMP_TO') return;
      const params = command.parameters || {};
      if (this.labels.has(params.target)) params.target = this.labels.get(params.target);
      if (!this.ids.has(params.target) && !this.externalTargets.has(params.target)) throw new LevelDslError(0, `JUMP target does not exist: ${params.target}`);
    });
    return { commands, extra_events: events };
  }

  private parseCommands(indent: number, stopAtEvent = false): any[] {
    const result: any[] = [];
    let pendingLabel: { name: string; line: number } | null = null;
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent < indent) break;
      if (line.indent > indent) {
        if (pendingLabel) throw new LevelDslError(pendingLabel.line, 'LABEL must be followed by a command at the same indentation');
        throw new LevelDslError(line.number, 'unexpected indentation');
      }
      const tokens = lex(line.text, line.number), head = tokens[0].toUpperCase();
      if (['ELSE', 'OPTION', 'CANCEL'].includes(head)) break;
      if (stopAtEvent && ['ON', 'AUTO', 'EVENT'].includes(head)) break;
      if (head === 'LABEL') {
        if (tokens.length !== 2) throw new LevelDslError(line.number, 'LABEL requires exactly one name');
        const name = String(value(tokens[1], line.number));
        if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) throw new LevelDslError(line.number, 'invalid LABEL name');
        if (pendingLabel || this.labels.has(name)) throw new LevelDslError(line.number, `duplicate LABEL ${name}`);
        pendingLabel = { name, line: line.number }; this.index += 1; continue;
      }
      const parsed = this.parseCommand(tokens, line);
      if (pendingLabel) { this.labels.set(pendingLabel.name, parsed.command.id); pendingLabel = null; }
      this.index += 1;
      const command = parsed.command;
      if (command.type === 'IF_CONDITION') {
        command.parameters.trueCommands = this.requiredChild(indent, line, 'IF');
        command.parameters.falseCommands = [];
        const next = this.lines[this.index];
        if (next && next.indent === indent && next.text.toUpperCase() === 'ELSE') {
          this.index += 1; command.parameters.falseCommands = this.requiredChild(indent, next, 'ELSE');
        }
      } else if (command.type === 'SHOW_CHOICES' && head === 'CHOICES') command.parameters.options = this.parseOptions(indent, line);
      else if (parsed.block) {
        const hasChild = !!this.lines[this.index] && this.lines[this.index].indent === indent + 1;
        if (hasChild) {
          command.parameters[parsed.block] = this.parseCommands(indent + 1);
          if (command.type === 'SET_CLICKABLE' && !command.parameters.onClick) command.parameters.onClick = 'commands';
        } else if (!['SET_CLICKABLE', 'SET_SELECTABLE'].includes(command.type)) throw new LevelDslError(line.number, `${head} requires an indented command block`);
      }
      const previous = result[result.length - 1];
      if (command.type === 'SET_CLICKABLE'
          && previous?.parameters?.__dslButton === true
          && previous.parameters.elementId === command.parameters.elementId
          && (!command.parameters.onClick || command.parameters.onClick === 'commands')) {
        previous.parameters.options[0].commands = command.parameters.commands || [];
        if (command.parameters.blocking != null) previous.parameters.blocking = command.parameters.blocking;
        delete previous.parameters.__dslButton;
        this.ids.delete(command.id);
        this.labels.forEach((target, name) => { if (target === command.id) this.labels.set(name, previous.id); });
      } else {
        if (previous?.parameters?.__dslButton === true) delete previous.parameters.__dslButton;
        result.push(command);
      }
    }
    if (pendingLabel) throw new LevelDslError(pendingLabel.line, 'LABEL must be followed by a command at the same indentation');
    if (result[result.length - 1]?.parameters?.__dslButton === true) delete result[result.length - 1].parameters.__dslButton;
    return result;
  }

  private requiredChild(indent: number, parent: SourceLine, label: string): any[] {
    if (!this.lines[this.index] || this.lines[this.index].indent !== indent + 1) throw new LevelDslError(parent.number, `${label} requires an indented block`);
    return this.parseCommands(indent + 1);
  }

  private parseOptions(indent: number, parent: SourceLine): any[] {
    if (!this.lines[this.index] || this.lines[this.index].indent !== indent + 1) throw new LevelDslError(parent.number, 'CHOICES requires OPTION children');
    const options: any[] = [];
    while (this.lines[this.index] && this.lines[this.index].indent === indent + 1) {
      const line = this.lines[this.index], tokens = lex(line.text, line.number);
      if (tokens[0]?.toUpperCase() !== 'OPTION' || tokens.length < 3) throw new LevelDslError(line.number, 'expected OPTION id text');
      const option: any = { id: String(value(tokens[1], line.number)), text: String(value(tokens[2], line.number)) };
      this.applyOptions(option, tokens.slice(3), line.number);
      this.index += 1;
      if (this.lines[this.index] && this.lines[this.index].indent === indent + 2) option.commands = this.parseCommands(indent + 2);
      options.push(option);
    }
    return options;
  }

  private parseEvent(): any {
    const line = this.lines[this.index], tokens = lex(line.text, line.number), kind = tokens.shift()!.toUpperCase();
    const event: any = { id: `dsl_event_${String(++this.eventIndex).padStart(3, '0')}`, name: '', triggers: [], commands: [] };
    if (kind === 'ON') {
      if (!tokens.length) throw new LevelDslError(line.number, 'ON requires a signal');
      const signal = String(value(tokens.shift()!, line.number));
      event.name = tokens.length && !tokens[0].includes('=') ? String(value(tokens.shift()!, line.number)) : signal;
      event.triggers = [{ type: 'custom', target: signal }];
    } else if (kind === 'AUTO') {
      event.name = tokens.length && !tokens[0].includes('=') ? String(value(tokens.shift()!, line.number)) : '自动事件';
      event.triggers = [{ type: 'auto', start: 'immediate' }];
    } else event.name = tokens.length && !tokens[0].includes('=') ? String(value(tokens.shift()!, line.number)) : '事件';
    this.applyOptions(event, tokens, line.number);
    if (!event.triggers.length) throw new LevelDslError(line.number, 'EVENT requires triggers=[...]');
    this.index += 1;
    event.commands = this.requiredChild(0, line, kind);
    return event;
  }

  private parseCommand(tokens: string[], line: SourceLine): { command: any; block?: string } {
    let explicitId = '';
    if (tokens[0].startsWith('@')) explicitId = tokens.shift()!.slice(1);
    const alias = tokens.shift()?.toUpperCase();
    if (!alias) throw new LevelDslError(line.number, 'missing command');
    if (alias === 'IF' || alias === 'IFEXPR') {
      const command = this.newCommand('IF_CONDITION', explicitId, line.number);
      if (alias === 'IFEXPR') {
        if (tokens.length !== 1) throw new LevelDslError(line.number, 'IFEXPR requires one expression');
        command.parameters.condition = { type: 'expression', expression: value(tokens[0], line.number) };
      } else command.parameters.condition = this.condition(tokens, line.number);
      return { command, block: 'trueCommands' };
    }
    if (alias === 'JUMP_ID') {
      if (tokens.length !== 1) throw new LevelDslError(line.number, 'JUMP_ID requires one runtime id');
      const target = String(value(tokens[0], line.number)); this.externalTargets.add(target);
      const command = this.newCommand('JUMP_TO', explicitId, line.number); command.parameters.target = target; return { command };
    }
    if (alias === 'CMD') {
      const type = tokens.shift()?.toUpperCase() || '';
      if (!GENERIC_ALLOWED.has(type)) throw new LevelDslError(line.number, `CMD type is not allowed: ${type}`);
      const command = this.newCommand(type, explicitId, line.number); this.applyOptions(command.parameters, tokens, line.number, type);
      const block = command.parameters.block ? String(command.parameters.block) : undefined; delete command.parameters.block;
      return { command, block };
    }
    const spec = SPECS[alias];
    if (!spec) throw new LevelDslError(line.number, `unknown command ${alias}`);
    const command = this.newCommand(spec.type, explicitId, line.number), params = command.parameters;
    if (alias === 'VAR') {
      if (tokens.length < 3) throw new LevelDslError(line.number, 'VAR requires key operator value');
      params.key = value(tokens.shift()!, line.number); const op = tokens.shift()!; params.op = OPS[op] || op; params.value = value(tokens.shift()!, line.number);
    } else if (alias === 'LOOP' && tokens.length && !tokens[0].includes('=')) {
      params.loopType = 'while'; params.condition = this.condition(tokens, line.number); tokens = [];
    } else if (alias === 'BREAK' && tokens.length && !tokens[0].includes('=')) {
      params.condition = this.condition(tokens, line.number); tokens = [];
    } else if (alias === 'AREA') {
      if (tokens.length < 5) throw new LevelDslError(line.number, 'AREA requires elementId x y width height');
      params.elementId = value(tokens.shift()!, line.number); params.area = {};
      ['x', 'y', 'width', 'height'].forEach(field => { params.area[field] = value(tokens.shift()!, line.number); });
    } else spec.positional.forEach(field => {
      if (!tokens.length || tokens[0].includes('=')) throw new LevelDslError(line.number, `${alias} requires ${field}`);
      params[field] = value(tokens.shift()!, line.number);
    });
    this.applyOptions(params, tokens, line.number, spec.type);
    if (alias === 'BUTTON') {
      const text = params.text;
      delete params.text;
      params.options = [{ id: String(params.elementId), text: String(text) }];
      params.__dslButton = true;
    }
    return { command, block: spec.block };
  }

  private newCommand(type: string, explicitId: string, line: number): any {
    const id = explicitId || `dsl_${String(++this.commandIndex).padStart(4, '0')}_${type.toLowerCase()}`;
    if (this.ids.has(id)) throw new LevelDslError(line, `duplicate command id ${id}`);
    this.ids.add(id); return { id, type, parameters: {} };
  }

  private condition(tokens: string[], line: number): any {
    if (tokens.length !== 3) throw new LevelDslError(line, 'condition must be variable operator value');
    const operator = OPS[tokens[1]] || tokens[1];
    if (!CONDITION_OPS.has(operator)) throw new LevelDslError(line, `unsupported condition operator ${tokens[1]}`);
    return { type: 'variable', key: String(value(tokens[0], line)), operator, value: value(tokens[2], line) };
  }

  private applyOptions(target: any, tokens: string[], line: number, type = ''): void {
    const aliases = OPTION_ALIASES[type] || {};
    tokens.forEach(token => {
      const split = token.indexOf('=');
      if (split <= 0 || split === token.length - 1) throw new LevelDslError(line, `optional argument must be key=value: ${token}`);
      const key = token.slice(0, split), raw = token.slice(split + 1);
      setPath(target, aliases[key] || key, value(raw, line));
    });
  }
}

export function parseLevelDsl(text: string, context: { intent?: string; asset_catalog?: any[] } = {}): CompiledLevelPatch {
  const program = new Parser(text).parse();
  return { intent: context.intent, asset_catalog: context.asset_catalog || [], ...program };
}
