/**
 * 音频指令处理器测试
 * 测试BGM播放、暂停、停止、SE播放和音量设置功能
 */

import { BgmPlayHandler } from './BgmPlayHandler';
import { BgmPauseHandler } from './BgmPauseHandler';
import { BgmStopHandler } from './BgmStopHandler';
import { SePlayHandler } from './SePlayHandler';
import { SetVolumeHandler } from './SetVolumeHandler';
import { CommandType, GameCommand, CommandContext, IAudioManager, IStateManager, ILogger } from '../../types';

// 模拟音频管理器
class MockAudioManager implements IAudioManager {
  private playingAudios: Set<string> = new Set();
  private globalVolume = 1.0;
  private muted = false;

  playSound(soundId: string, options?: any): void {
    console.log(`Playing sound: ${soundId}`, options);
    this.playingAudios.add(soundId);
  }

  playMusic(musicId: string, options?: any): void {
    console.log(`Playing music: ${musicId}`, options);
    this.playingAudios.add(musicId);
  }

  stopAudio(audioId: string): void {
    console.log(`Stopping audio: ${audioId}`);
    this.playingAudios.delete(audioId);
  }

  setGlobalVolume(volume: number): void {
    console.log(`Setting global volume: ${volume}`);
    this.globalVolume = volume;
  }

  mute(): void {
    console.log('Muting audio');
    this.muted = true;
  }

  unmute(): void {
    console.log('Unmuting audio');
    this.muted = false;
  }

  isPlaying(audioId: string): boolean {
    return this.playingAudios.has(audioId);
  }

  getGlobalVolume(): number {
    return this.globalVolume;
  }

  isMuted(): boolean {
    return this.muted;
  }
}

// 模拟状态管理器
class MockStateManager implements IStateManager {
  private variables: Map<string, any> = new Map();

  setVariable(name: string, value: any): void {
    console.log(`Setting variable: ${name} = ${value}`);
    this.variables.set(name, value);
  }

  getVariable(name: string): any {
    return this.variables.get(name);
  }

  hasVariable(name: string): boolean {
    return this.variables.has(name);
  }

  removeVariable(name: string): void {
    this.variables.delete(name);
  }

  clearVariables(): void {
    this.variables.clear();
  }

  getVariables(): Record<string, any> {
    return Object.fromEntries(this.variables);
  }
}

// 模拟日志记录器
class MockLogger implements ILogger {
  info(message: string, data?: any): void {
    console.log(`[INFO] ${message}`, data || '');
  }

  warn(message: string, data?: any): void {
    console.warn(`[WARN] ${message}`, data || '');
  }

  error(message: string, data?: any): void {
    console.error(`[ERROR] ${message}`, data || '');
  }

  debug(message: string, data?: any): void {
    console.debug(`[DEBUG] ${message}`, data || '');
  }
}

// 创建测试上下文
function createTestContext(): CommandContext {
  return {
    audioManager: new MockAudioManager(),
    stateManager: new MockStateManager(),
    logger: new MockLogger(),
    renderAdapter: null as any,
    eventManager: null as any
  };
}

// 测试BGM播放
async function testBgmPlay() {
  console.log('\n=== 测试BGM播放 ===');
  const handler = new BgmPlayHandler();
  const context = createTestContext();
  
  const command: GameCommand = {
    id: 'test-bgm-play-1',
    type: CommandType.BGM_PLAY,
    parameters: {
      musicId: 'background_music_01',
      volume: 0.8,
      loop: true,
      fadeIn: 1000
    }
  };

  const result = await handler.execute(command, context);
  console.log('BGM播放结果:', result);
}

// 测试BGM暂停
async function testBgmPause() {
  console.log('\n=== 测试BGM暂停 ===');
  const handler = new BgmPauseHandler();
  const context = createTestContext();
  
  // 先设置一个正在播放的BGM
  context.stateManager.setVariable('current_bgm', 'background_music_01');
  context.stateManager.setVariable('bgm_playing', true);
  
  const command: GameCommand = {
    id: 'test-bgm-pause-1',
    type: CommandType.BGM_PAUSE,
    parameters: {
      fadeOut: 500
    }
  };

  const result = await handler.execute(command, context);
  console.log('BGM暂停结果:', result);
}

// 测试BGM停止
async function testBgmStop() {
  console.log('\n=== 测试BGM停止 ===');
  const handler = new BgmStopHandler();
  const context = createTestContext();
  
  // 先设置一个正在播放的BGM
  context.stateManager.setVariable('current_bgm', 'background_music_01');
  context.stateManager.setVariable('bgm_playing', true);
  
  const command: GameCommand = {
    id: 'test-bgm-stop-1',
    type: CommandType.BGM_STOP,
    parameters: {
      fadeOut: 1000
    }
  };

  const result = await handler.execute(command, context);
  console.log('BGM停止结果:', result);
}

// 测试SE播放
async function testSePlay() {
  console.log('\n=== 测试SE播放 ===');
  const handler = new SePlayHandler();
  const context = createTestContext();
  
  const command: GameCommand = {
    id: 'test-se-play-1',
    type: CommandType.SE_PLAY,
    parameters: {
      soundId: 'button_click',
      volume: 0.6,
      loop: false,
      fadeIn: 200,
      delay: 100,
      interrupt: true
    }
  };

  const result = await handler.execute(command, context);
  console.log('SE播放结果:', result);
}

// 测试音量设置
async function testSetVolume() {
  console.log('\n=== 测试音量设置 ===');
  const handler = new SetVolumeHandler();
  const context = createTestContext();
  
  // 测试全局音量设置
  const globalVolumeCommand: GameCommand = {
    id: 'test-set-global-volume-1',
    type: CommandType.SET_VOLUME,
    parameters: {
      type: 'global',
      volume: 0.7,
      fadeTime: 500
    }
  };

  const globalResult = await handler.execute(globalVolumeCommand, context);
  console.log('全局音量设置结果:', globalResult);

  // 测试BGM音量设置
  const bgmVolumeCommand: GameCommand = {
    id: 'test-set-bgm-volume-1',
    type: CommandType.SET_VOLUME,
    parameters: {
      type: 'bgm',
      volume: 0.5,
      immediate: true
    }
  };

  const bgmResult = await handler.execute(bgmVolumeCommand, context);
  console.log('BGM音量设置结果:', bgmResult);

  // 测试SE音量设置
  const seVolumeCommand: GameCommand = {
    id: 'test-set-se-volume-1',
    type: CommandType.SET_VOLUME,
    parameters: {
      type: 'se',
      volume: 0.9
    }
  };

  const seResult = await handler.execute(seVolumeCommand, context);
  console.log('SE音量设置结果:', seResult);
}

// 测试错误情况
async function testErrorCases() {
  console.log('\n=== 测试错误情况 ===');
  
  // 测试BGM暂停时没有正在播放的BGM
  const pauseHandler = new BgmPauseHandler();
  const context = createTestContext();
  
  const pauseCommand: GameCommand = {
    id: 'test-invalid-pause-1',
    type: CommandType.BGM_PAUSE,
    parameters: {}
  };

  const pauseResult = await pauseHandler.execute(pauseCommand, context);
  console.log('暂停不存在BGM的结果:', pauseResult);

  // 测试无效的音量值
  const volumeHandler = new SetVolumeHandler();
  const invalidVolumeCommand: GameCommand = {
    id: 'test-invalid-volume-1',
    type: CommandType.SET_VOLUME,
    parameters: {
      type: 'global',
      volume: 1.5 // 无效值
    }
  };

  const volumeResult = await volumeHandler.execute(invalidVolumeCommand, context);
  console.log('无效音量设置结果:', volumeResult);

  // 测试SE播放缺少必需参数
  const seHandler = new SePlayHandler();
  const invalidSeCommand: GameCommand = {
    id: 'test-invalid-se-1',
    type: CommandType.SE_PLAY,
    parameters: {
      // 缺少soundId
      volume: 0.5
    }
  };

  const seResult = await seHandler.execute(invalidSeCommand, context);
  console.log('SE播放缺少参数结果:', seResult);
}

// 运行所有测试
export async function runAudioCommandTests() {
  console.log('开始音频指令处理器测试...');
  
  try {
    await testBgmPlay();
    await testBgmPause();
    await testBgmStop();
    await testSePlay();
    await testSetVolume();
    await testErrorCases();
    
    console.log('\n音频指令处理器测试完成！');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 如果直接运行此文件，执行测试
if (typeof window === 'undefined') {
  runAudioCommandTests();
}