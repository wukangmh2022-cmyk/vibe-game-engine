import { resourceIdFromPath, resourceNameFromPath } from '../level-editor/src/utils/resourceId';

describe('resource IDs', () => {
  test('preserves meaningful Chinese file names', () => {
    expect(resourceIdFromPath('images/胜利弹窗.png', new Set())).toBe('胜利弹窗');
  });

  test('removes only the final extension', () => {
    expect(resourceNameFromPath('images/boss.phase.two.webp')).toBe('boss.phase.two');
    expect(resourceIdFromPath('images/boss.phase.two.webp', new Set())).toBe('boss.phase.two');
  });

  test('supports POSIX and Windows paths', () => {
    expect(resourceIdFromPath('audios/victory.mp3', new Set())).toBe('victory');
    expect(resourceIdFromPath('audios\\战斗胜利.wav', new Set())).toBe('战斗胜利');
  });

  test('numbers duplicate IDs from two', () => {
    const used = new Set(['胜利弹窗', '胜利弹窗_2']);
    expect(resourceIdFromPath('胜利弹窗.png', used)).toBe('胜利弹窗_3');
  });

  test('normalizes whitespace and DSL delimiters', () => {
    expect(resourceIdFromPath('images/final boss#1.png', new Set())).toBe('final_boss_1');
  });

  test('uses a stable fallback for empty or unsafe names', () => {
    expect(resourceIdFromPath('images/___.png', new Set())).toBe('resource');
    expect(resourceIdFromPath('images/.png', new Set(['resource']))).toBe('resource_2');
  });
});
