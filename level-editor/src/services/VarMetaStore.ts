import { GameProject } from '../types';
import { scanVarMeta, VarMode, VarType } from '../utils/varMeta';

type Listener = () => void;

class Store {
  private types = new Map<string, VarType>();
  private modes = new Map<string, VarMode>();
  private listeners = new Set<Listener>();

  set(project: GameProject | null | undefined) {
    const { types, modes } = scanVarMeta(project || null);
    this.types = types; this.modes = modes;
    this.emit();
  }

  getType(key: string): VarType | undefined { return this.types.get(key); }
  getMode(key: string): VarMode | undefined { return this.modes.get(key); }
  getAll() { return { types: this.types, modes: this.modes }; }

  subscribe(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const fn of this.listeners) fn(); }
}

export const VarMetaStore = new Store();
export type { VarMode, VarType };

