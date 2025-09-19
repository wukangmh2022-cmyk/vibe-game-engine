import { ICommandHandler } from '../types';
import { SetVariableHandler } from './SetVariableHandler';
import { SetSwitchHandler } from './SetSwitchHandler';
import { WaitHandler } from './WaitHandler';
import { ShowImageHandler } from './ShowImageHandler';
import { ShowTextHandler } from './ShowTextHandler';
import { UpdateTextHandler } from './UpdateTextHandler';
import { ShowChoicesHandler } from './ShowChoicesHandler';
import { ShowButtonHandler } from './ShowButtonHandler';
import { PlaySoundHandler } from './PlaySoundHandler';
import { AddScoreHandler } from './AddScoreHandler';
import { NextLevelHandler } from './NextLevelHandler';
import { IfConditionHandler } from './IfConditionHandler';
import { JumpToHandler } from './JumpToHandler';
import { LoopHandler } from './LoopHandler';
import { BreakHandler } from './BreakHandler';
import { ContinueHandler } from './ContinueHandler';
import { EmitSignalHandler } from './EmitSignalHandler';
import { ReturnHandler } from './ReturnHandler';
import { SetPositionHandler } from '../handlers/SetPositionHandler';
import { GetPositionHandler } from '../handlers/GetPositionHandler';
import { CheckInAreaHandler } from '../handlers/CheckInAreaHandler';
import { BgmPlayHandler } from './audio/BgmPlayHandler';
import { BgmPauseHandler } from './audio/BgmPauseHandler';
import { BgmStopHandler } from './audio/BgmStopHandler';
import { SePlayHandler } from './audio/SePlayHandler';
import { SetVolumeHandler } from './audio/SetVolumeHandler';
import SceneRedirectHandler from './SceneRedirectHandler';
import { SetElementStyleHandler } from './SetElementStyleHandler';

/**
 * 创建默认的指令处理器集合
 */
export function createDefaultHandlers(): ICommandHandler[] {
  return [
    new SetVariableHandler(),
    new SetSwitchHandler(),
    new WaitHandler(),
    new ShowImageHandler(),
    new ShowTextHandler(),
    new UpdateTextHandler(),
    new ShowButtonHandler(),
    new ShowChoicesHandler(),
    new SetElementStyleHandler(),
    new PlaySoundHandler(),
    new AddScoreHandler(),
    new NextLevelHandler(),
    new IfConditionHandler(),
    new JumpToHandler(),
    new LoopHandler(),
    new BreakHandler(),
    new ContinueHandler(),
    new EmitSignalHandler(),
    new ReturnHandler(),
    new SetPositionHandler(null as any),
    new GetPositionHandler(null as any),
    new CheckInAreaHandler(),
    new BgmPlayHandler(),
    new BgmPauseHandler(),
    new BgmStopHandler(),
    new SePlayHandler(),
    new SetVolumeHandler(),
    new SceneRedirectHandler()
  ];
}

/**
 * 创建基础指令处理器集合（不包含复杂逻辑）
 */
export function createBasicHandlers(): ICommandHandler[] {
  return [
    new SetVariableHandler(),
    new SetSwitchHandler(),
    new WaitHandler(),
    new ShowTextHandler(),
    new AddScoreHandler()
  ];
}

/**
 * 创建渲染相关指令处理器
 */
export function createRenderHandlers(): ICommandHandler[] {
  return [
    new ShowImageHandler(),
    new ShowTextHandler(),
    new UpdateTextHandler(),
    new ShowButtonHandler(),
    new ShowChoicesHandler(),
    new SetElementStyleHandler()
  ];
}

/**
 * 创建音频相关指令处理器
 */
export function createAudioHandlers(): ICommandHandler[] {
  return [
    new PlaySoundHandler(),
    new BgmPlayHandler(),
    new BgmPauseHandler(),
    new BgmStopHandler(),
    new SePlayHandler(),
    new SetVolumeHandler()
  ];
}

/**
 * 创建流程控制指令处理器
 */
export function createFlowControlHandlers(): ICommandHandler[] {
  return [
    new IfConditionHandler(),
    new JumpToHandler(),
    new NextLevelHandler(),
    new LoopHandler(),
    new BreakHandler(),
    new ContinueHandler(),
    new EmitSignalHandler(),
    new ReturnHandler(),
    new SceneRedirectHandler(),
  ];
}

/**
 * 创建位置相关指令处理器
 */
export function createPositionHandlers(): ICommandHandler[] {
  return [
    new SetPositionHandler(null as any),
    new GetPositionHandler(null as any),
    new CheckInAreaHandler()
  ];
}
