import { CommandContext } from '../types';

/**
 * Resolve elementId-like parameters that may reference a state variable using the syntax `{varName}`.
 * If value is a string like "{foo}", it resolves to context.stateManager.getVariable('foo').
 * Otherwise returns the original value.
 */
export function resolveIdFromBraces(value: any, context: CommandContext): string | undefined {
  if (typeof value !== 'string') return value as any;
  const m = value.match(/^\{([^}]+)\}$/);
  if (!m) return value;
  const varName = m[1].trim();
  try {
    const sm: any = (context as any).stateManager;
    const v = sm?.getVariable?.(varName);
    return typeof v === 'string' ? v : (v != null ? String(v) : undefined);
  } catch {
    return undefined;
  }
}

