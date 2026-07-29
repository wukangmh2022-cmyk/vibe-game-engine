import { LevelDslError, parseLevelDsl } from './levelDsl';

describe('VGE level DSL', () => {
  test('resolves LABEL to the following generated command id', () => {
    const patch = parseLevelDsl(`VAR count = 0
LABEL retry
VAR count + 1
IF count < 3
    JUMP retry
`);
    const target = patch.commands[1].id;
    expect(patch.commands[2].parameters.trueCommands[0].parameters.target).toBe(target);
  });

  test('compiles nested choices and signal events', () => {
    const patch = parseLevelDsl(`CHOICES menu
    OPTION yes "确认"
        SIGNAL accepted

ON accepted "确认事件"
    VAR done = true
`, { intent: '确认', asset_catalog: [] });
    expect(patch.commands[0].parameters.options[0].commands[0].type).toBe('EMIT_SIGNAL');
    expect(patch.extra_events[0].triggers[0].target).toBe('accepted');
    expect(patch.intent).toBe('确认');
  });

  test('rejects invalid indentation and unsafe generic commands', () => {
    expect(() => parseLevelDsl('TEXT a x\n  WAIT 1\n')).toThrow(LevelDslError);
    expect(() => parseLevelDsl('CMD SCRIPT code="danger"\n')).toThrow(LevelDslError);
  });

  test('accepts quoted and bare Unicode resource IDs equivalently', () => {
    const quoted = parseLevelDsl('SE "掌声" vol=0.8\n');
    const bare = parseLevelDsl('SE 掌声 vol=0.8\n');
    expect(quoted.commands[0].parameters).toEqual(bare.commands[0].parameters);
  });
});
