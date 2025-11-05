type Listener = () => void;

class VarLiveStore {
  private vars: Record<string, any> = {};
  private switches: Record<string, boolean> = {};
  private listeners = new Set<Listener>();

  setFromSnapshot(st: { variables?: Record<string, any>; switches?: Record<string, boolean> } | null | undefined) {
    if (!st) return;
    if (st.variables && typeof st.variables === 'object') this.vars = { ...this.vars, ...st.variables };
    if (st.switches && typeof st.switches === 'object') this.switches = { ...this.switches, ...st.switches };
    this.emit();
  }
  updateVar(key: string, value: any) { if (!key) return; this.vars = { ...this.vars, [key]: value }; this.emit(); }
  updateSwitch(key: string, value: boolean) { if (!key) return; this.switches = { ...this.switches, [key]: !!value }; this.emit(); }
  getVars(): Record<string, any> { return { ...this.vars }; }
  getSwitches(): Record<string, boolean> { return { ...this.switches }; }
  subscribe(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const fn of this.listeners) fn(); }
}

export const varLiveStore = new VarLiveStore();

