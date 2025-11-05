import { COMMAND_TEMPLATES, createNewCommand } from './commandTemplates';
import { jsonToTree, treeToJson } from './commandTree';

export type TemplateCheck = {
  type: string;
  ok: boolean;
  messages: string[];
};

export function runTemplateSanityChecks(): { ok: boolean; results: TemplateCheck[] } {
  const results: TemplateCheck[] = [];

  const hasParam = (tpl: any, name: string) => !!(tpl.parameters || []).find((p: any) => p.name === name);
  const getParam = (tpl: any, name: string) => (tpl.parameters || []).find((p: any) => p.name === name);

  for (const tpl of COMMAND_TEMPLATES) {
    const messages: string[] = [];
    let ok = true;
    try {
      // 1) create default command from template
      const cmd: any = createNewCommand(tpl.type as any);
      if (!cmd || typeof cmd !== 'object') {
        ok = false; messages.push('createNewCommand returned invalid command');
      }

      // 2) required param names exist in template
      const reqs = (tpl.parameters || []).filter((p: any) => p.required);
      for (const r of reqs) {
        if (!hasParam(tpl, r.name)) { ok = false; messages.push(`required param missing in template: ${r.name}`); }
      }

      // 3) resource-typed fields should produce string defaults via createNewCommand
      for (const p of (tpl.parameters || [])) {
        if (p.type === 'resource') {
          const v = getByPath(cmd.parameters, p.name);
          if (v === undefined) { ok = false; messages.push(`resource param not initialized: ${p.name}`); }
          if (v !== '' && typeof v !== 'string') { ok = false; messages.push(`resource param should be string: ${p.name}`); }
        }
      }

      // 4) simple conventions by type
      const up = String(tpl.type).toUpperCase();
      const mustHaveElement = new Set(['SHOW_IMAGE','SHOW_TEXT','ANIMATE_IN','ANIMATE_OUT','ANIMATE_LOOP','SET_CLICKABLE','SET_DRAGGABLE','FLIP_CARD']);
      if (mustHaveElement.has(up)) {
        if (!hasParam(tpl, 'elementId')) { ok = false; messages.push('missing elementId field'); }
      }
      if (up === 'SHOW_IMAGE') {
        ['position.x','position.y','zIndex','visible','animation.entry.animId','animation.loop.animId'].forEach(n => { if (!hasParam(tpl, n)) { ok = false; messages.push(`missing field: ${n}`); } });
      }
      if (up === 'BGM_PLAY') {
        const p = getParam(tpl, 'musicId');
        if (!p || p.type !== 'resource') { ok = false; messages.push('musicId should be type: resource'); }
      }
      if (up === 'SE_PLAY') {
        const p = getParam(tpl, 'soundId');
        if (!p || p.type !== 'resource') { ok = false; messages.push('soundId should be type: resource'); }
      }
      if (up === 'IF_CONDITION') {
        ['condition.type','condition.key','condition.operator','condition.value','condition.expression'].forEach(n => { if (!hasParam(tpl, n)) { ok = false; messages.push(`missing field: ${n}`); } });
      }

      // 5) tree roundtrip
      try {
        const tree = jsonToTree([cmd]);
        const json = treeToJson(tree);
        if (!Array.isArray(json)) { ok = false; messages.push('treeToJson did not return array'); }
      } catch (e) {
        ok = false; messages.push('tree roundtrip failed: ' + (e as any)?.message);
      }
    } catch (e) {
      ok = false; messages.push('exception: ' + (e as any)?.message);
    }

    results.push({ type: String(tpl.type), ok, messages });
  }

  const allOk = results.every(r => r.ok);
  try { if (typeof window !== 'undefined') (window as any).__TEMPLATE_SANITY__ = results; } catch {}
  return { ok: allOk, results };
}

// dot-path getter (copy of the editor utils)
function getByPath(obj: any, path: string): any {
  try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); } catch { return undefined; }
}

// Quick console runner for convenience
export function runAndLogTemplateSanity(): void {
  const res = runTemplateSanityChecks();
  const bad = res.results.filter(r => !r.ok);
  if (bad.length) {
    // eslint-disable-next-line no-console
    console.warn(`[TemplateSanity] ${bad.length} templates failed`, bad);
  } else {
    // eslint-disable-next-line no-console
    console.info('[TemplateSanity] All templates passed');
  }
}
