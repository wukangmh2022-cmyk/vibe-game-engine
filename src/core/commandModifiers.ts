import { GameCommand } from '../types';

export interface CommandModifierEntry {
  filter?: Record<string, any>;
  commands: GameCommand[];
}

export type CommandModifierConfig = Record<string, CommandModifierEntry[]>;

export const COMMAND_MODIFIER_FLAG = '__from_command_modifier__';

export function normalizeCommandKey(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  return trimmed.replace(/[\s-]+/g, '_').toUpperCase();
}

const isPlainObject = (val: any): val is Record<string, any> => {
  return !!val && typeof val === 'object' && !Array.isArray(val);
};

const looksLikeCommand = (val: any): val is GameCommand => {
  return isPlainObject(val) && typeof (val as any).type === 'string';
};

const cloneFilter = (raw?: Record<string, any>): Record<string, any> | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const result: Record<string, any> = {};
  Object.keys(raw).forEach((key) => {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) return;
    result[cleanKey] = (raw as any)[key];
  });
  return Object.keys(result).length ? result : undefined;
};

export function buildModifierMap(raw: any): CommandModifierConfig {
  const dict: CommandModifierConfig = {};
  const source = extractMapping(raw);
  Object.entries(source).forEach(([key, value]) => {
    const normalized = normalizeCommandKey(key);
    if (!normalized) return;
    const entries = toEntries(value);
    if (!entries.length) return;
    dict[normalized] = entries;
  });
  return dict;
}

function extractMapping(raw: any): Record<string, any> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const map: Record<string, any> = {};
    raw.forEach((entry: any) => {
      if (!entry) return;
      const key = entry.match || entry.type || entry.command || entry.name;
      if (!key) return;
      // entry.commands expected for object-form array
      if (Array.isArray(entry.commands)) {
        map[key] = entry.commands;
      } else {
        map[key] = entry;
      }
    });
    return map;
  }
  if (isPlainObject(raw)) {
    if (isPlainObject(raw.commands)) {
      return raw.commands as Record<string, any>;
    }
    return raw as Record<string, any>;
  }
  return {};
}

function toEntries(value: any): CommandModifierEntry[] {
  if (!value) return [];
  const entries: CommandModifierEntry[] = [];
  if (Array.isArray(value)) {
    if (value.length && value.every(looksLikeCommand)) {
      entries.push({ commands: value.map(cloneCommand) });
      return entries;
    }
    value.forEach((item) => {
      const normalized = normalizeEntryObject(item);
      if (normalized) entries.push(normalized);
    });
    return entries;
  }
  if (looksLikeCommand(value)) {
    entries.push({ commands: [cloneCommand(value)] });
    return entries;
  }
  const normalized = normalizeEntryObject(value);
  if (normalized) entries.push(normalized);
  return entries;
}

function normalizeEntryObject(value: any): CommandModifierEntry | null {
  if (!isPlainObject(value)) return null;
  const list = Array.isArray(value.commands) ? value.commands : null;
  if (!list || !list.length) return null;
  return {
    filter: cloneFilter(value.filter),
    commands: list.map(cloneCommand)
  };
}

export function cloneCommand(command: GameCommand): GameCommand {
  return JSON.parse(JSON.stringify(command));
}

export function setGlobalCommandModifiers(map: CommandModifierConfig | null | undefined): void {
  try {
    (globalThis as any).__COMMAND_MODIFIERS__ = map || null;
  } catch {}
}

export function getGlobalCommandModifiers(): CommandModifierConfig | null {
  try {
    const raw = (globalThis as any).__COMMAND_MODIFIERS__;
    return raw || null;
  } catch {
    return null;
  }
}

const getValueByPath = (obj: any, path: string): any => {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
};

export function matchesModifierFilter(command: GameCommand, filter?: Record<string, any>): boolean {
  if (!filter) return true;
  const params = (command && (command as any).parameters) || {};
  return Object.entries(filter).every(([rawKey, expected]) => {
    const key = String(rawKey || '').trim();
    if (!key) return true;
    let actual: any;
    if (key.includes('.')) {
      actual = getValueByPath(command, key);
    } else {
      actual = params[key];
    }
    return actual === expected;
  });
}
