import { runTemplateSanityChecks } from '../level-editor/src/utils/templateSanity';

describe('Command template sanity', () => {
  it('all templates should pass creation and tree roundtrip', () => {
    const res = runTemplateSanityChecks();
    if (!res.ok) {
      // Helpful output on failure
      const messages = res.results.filter(r => !r.ok).map(r => ({ type: r.type, messages: r.messages }));
      // eslint-disable-next-line no-console
      console.warn('Template sanity failed:', messages);
    }
    expect(res.ok).toBe(true);
  });
});

