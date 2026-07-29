import { LevelDslError, parseLevelDsl } from '../level-editor/src/utils/levelDsl';

describe('VGE level DSL browser compiler', () => {
  test('binds a label to the following command and resolves forward jumps', () => {
    const patch = parseLevelDsl(`JUMP finish
LABEL retry
VAR count + 1
IF count < 3
    JUMP retry
LABEL finish
TEXT result "完成"
`);

    expect(patch.commands[0].parameters.target).toBe(patch.commands[3].id);
    expect(patch.commands[2].parameters.trueCommands[0].parameters.target).toBe(patch.commands[1].id);
  });

  test('resolves labels across event and main command streams', () => {
    const patch = parseLevelDsl(`ON retry "重试事件"
    JUMP start
LABEL start
TEXT title "开始"
`);

    expect(patch.extra_events[0].commands[0].parameters.target).toBe(patch.commands[0].id);
  });

  test('rejects dangling, duplicate, and incorrectly indented labels', () => {
    expect(() => parseLevelDsl('JUMP missing\n')).toThrow(LevelDslError);
    expect(() => parseLevelDsl('LABEL a\nLABEL b\nWAIT 1\n')).toThrow(/duplicate LABEL/);
    expect(() => parseLevelDsl('LABEL a\n    WAIT 1\n')).toThrow(/same indentation/);
  });

  test('rejects unsafe generic commands', () => {
    expect(() => parseLevelDsl('CMD SCRIPT code="danger"\n')).toThrow(LevelDslError);
  });

  test('maps explicit choice skins into nested UI parameters', () => {
    const patch = parseLevelDsl(`CHOICES menu skin=btn-primary-9slice selectedSkin=btn-primary-9slice-highlight
    OPTION yes "确认"
`);
    expect(patch.commands[0].parameters.ui).toEqual({
      buttonSkinId: 'btn-primary-9slice',
      selectedSkinId: 'btn-primary-9slice-highlight',
    });
  });

  test('accepts quoted and bare Unicode resource IDs equivalently', () => {
    const quoted = parseLevelDsl('SE "掌声" vol=0.8\n');
    const bare = parseLevelDsl('SE 掌声 vol=0.8\n');
    expect(quoted.commands[0].parameters).toEqual(bare.commands[0].parameters);
  });

  test('lowers BUTTON plus CLICK into a single runtime choice', () => {
    const patch = parseLevelDsl(`BUTTON exit_continue "继续" x=350 y=360
CLICK exit_continue enabled=true block=false
    NEXT
`);
    expect(patch.commands).toHaveLength(1);
    expect(patch.commands[0]).toMatchObject({
      type: 'SHOW_CHOICES',
      parameters: {
        elementId: 'exit_continue',
        position: { x: 350, y: 360 },
        blocking: false,
        options: [{ id: 'exit_continue', text: '继续', commands: [{ type: 'NEXT_LEVEL' }] }],
      },
    });
  });
});
