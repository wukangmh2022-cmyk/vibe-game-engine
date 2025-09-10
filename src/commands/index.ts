/**
 * 指令处理器导出文件
 */

// 基础指令处理器
export { SetVariableHandler } from './SetVariableHandler';
export { SetSwitchHandler } from './SetSwitchHandler';
export { WaitHandler } from './WaitHandler';
export { ShowImageHandler } from './ShowImageHandler';
export { ShowTextHandler } from './ShowTextHandler';
export { PlaySoundHandler } from './PlaySoundHandler';
export { AddScoreHandler } from './AddScoreHandler';
export { NextLevelHandler } from './NextLevelHandler';
export { IfConditionHandler } from './IfConditionHandler';
export { JumpToHandler } from './JumpToHandler';
export { ShowChoicesHandler } from './ShowChoicesHandler';
export { InputHandler } from './InputHandler';
export { CallEventHandler } from './CallEventHandler';
export { ClickHandler } from './ClickHandler';
export { ContinueHandler } from './ContinueHandler';
export { BreakHandler } from './BreakHandler';
export { ReturnHandler } from './ReturnHandler';
export { LoopHandler } from './LoopHandler';
export { MoveToHandler } from './MoveToHandler';
export { RotateToHandler } from './RotateToHandler';
export { ScaleToHandler } from './ScaleToHandler';
export { SetDraggableHandler } from './SetDraggableHandler';

// 音频指令处理器
export { BgmPlayHandler } from './audio/BgmPlayHandler';
export { BgmPauseHandler } from './audio/BgmPauseHandler';
export { BgmStopHandler } from './audio/BgmStopHandler';
export { SePlayHandler } from './audio/SePlayHandler';
export { SetVolumeHandler } from './audio/SetVolumeHandler';

// 游戏结束指令处理器
export { GameOverHandler } from './GameOverHandler';

// 基础类
export { BaseCommandHandler } from '../core/CommandExecutor';

// 工厂函数
export * from './factory';