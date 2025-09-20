import { COMMAND_TEMPLATES, createNewCommand } from '../level-editor/src/utils/commandTemplates';
import { jsonToTree, treeToJson } from '../level-editor/src/utils/commandTree';

const setByPath = (obj: any, path: string, val: any): any => {
  const segs = path.split('.');
  const root = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  let cur: any = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = segs[i];
    const next = cur[k];
    cur[k] = (next && typeof next === 'object') ? { ...next } : {};
    cur = cur[k];
  }
  cur[segs[segs.length - 1]] = val;
  return root;
};

const getByPath = (obj: any, path: string): any => {
  try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); } catch { return undefined; }
};

const sampleForType = (t: string, def?: any) => {
  switch (t) {
    case 'text':
    case 'textarea':
      return 'TEST_TEXT';
    case 'number':
      return typeof def === 'number' ? def + 7 : 123;
    case 'boolean':
      return typeof def === 'boolean' ? !def : true;
    case 'select':
      return undefined; // will be filled by options if any
    case 'color':
      return '#abcdef';
    case 'variable':
    case 'switch':
      return 'var_test';
    case 'expression':
      return { type: 'variable', key: 'x', operator: 'eq', value: 1 };
    case 'resource':
      return 'res_test';
    default:
      return 'TEST';
  }
};

describe('Parameter editing roundtrip', () => {
  it('updates JSON when parameters change in tree', () => {
    for (const tpl of COMMAND_TEMPLATES) {
      const cmd = createNewCommand(tpl.type as any);
      expect(cmd).toBeTruthy();
      let updatedParams: Record<string, any> = { ...(cmd.parameters || {}) };
      for (const p of (tpl.parameters || [])) {
        let val = sampleForType((p as any).type, (p as any).defaultValue);
        if ((p as any).type === 'select') {
          const opts = (p as any).options || [];
          if (Array.isArray(opts) && opts.length) val = opts[0].value;
          else val = 'opt_test';
        }
        updatedParams = setByPath(updatedParams, (p as any).name, val);
      }
      const tree = jsonToTree([{ ...cmd, parameters: updatedParams }]);
      const json = treeToJson(tree);
      const back = (json || []).find((x: any) => x?.id === cmd.id);
      expect(back).toBeTruthy();
      for (const p of (tpl.parameters || [])) {
        const expected = getByPath(updatedParams, (p as any).name);
        const actual = getByPath(back.parameters || {}, (p as any).name);
        // only assert when our expected is not undefined
        if (expected !== undefined) {
          expect(actual).toEqual(expected);
        }
      }
    }
  });
});
