import { renderLevelDslUserPrompt } from '../level-editor/src/utils/levelDslPrompt';

describe('VGE DSL user prompt', () => {
  test('renders the canonical training and editor resource format', () => {
    expect(renderLevelDslUserPrompt('显示胜利弹窗', 800, 600, [
      { id: '胜利弹窗', type: 'image', path: 'images/胜利弹窗.png' },
      { id: 'dialog-default-9slice', type: 'skin', path: 'images/ui-blue.svg' },
    ])).toBe(`TASK
显示胜利弹窗
CANVAS 800 600
ASSETS id | type | path
胜利弹窗 | image | images/胜利弹窗.png
dialog-default-9slice | skin | images/ui-blue.svg`);
  });

  test('marks an empty catalog explicitly', () => {
    expect(renderLevelDslUserPrompt('等待一秒', 800, 600, [])).toContain('ASSETS id | type | path\n(none)');
  });
});
