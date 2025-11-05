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

/**
 * Resolve any value that may reference a state variable using the syntax `{varName}`.
 * Returns the resolved value with original type preserved when possible.
 */
export function resolveFromBraces<T = any>(value: any, context: CommandContext): T {
  if (typeof value !== 'string') return value as T;
  const m = value.match(/^\{([^}]+)\}$/);
  if (!m) return value as any;
  const varName = m[1].trim();
  try {
    const sm: any = (context as any).stateManager;
    return sm?.getVariable?.(varName);
  } catch {
    return undefined as any;
  }
}

/**
 * Resolve a number possibly wrapped as `{var}`; returns undefined if not resolvable to number.
 */
export function resolveNumberFromBraces(value: any, context: CommandContext): number | undefined {
  const v: any = resolveFromBraces<any>(value, context);
  const n = (typeof v === 'number') ? v : (v != null ? Number(v) : undefined);
  return (n != null && !Number.isNaN(n)) ? n : undefined;
}

/**
 * Interpolate all occurrences of {var} inside a string using variables from stateManager.
 * Non-string inputs are returned as-is.
 */
export function interpolateBraces(value: any, context: CommandContext): any {
  if (typeof value !== 'string') return value;
  try {
    const sm: any = (context as any).stateManager;
    return value.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const key = String(name || '').trim();
      const v = sm?.getVariable?.(key);
      if (v == null) return '';
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
      try { return JSON.stringify(v); } catch { return String(v); }
    });
  } catch { return value; }
}

/**
 * Resolve elementId-like string supporting both pure {var} and inline interpolation like prefix_{var}_suffix.
 */
export function resolveElementId(value: any, context: CommandContext): string | undefined {
  if (typeof value !== 'string') return value as any;
  const m = value.match(/^\{([^}]+)\}$/);
  if (m) {
    const varName = m[1].trim();
    try {
      const sm: any = (context as any).stateManager;
      const v = sm?.getVariable?.(varName);
      return typeof v === 'string' ? v : (v != null ? String(v) : undefined);
    } catch { return undefined; }
  }
  return String(interpolateBraces(value, context) || '').trim() || undefined;
}
