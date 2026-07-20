import {
  GameConfig,
  LevelConfig,
  GameState,
  GameCommand,
  CommandResult,
  IEventManager,
  IStateManager,
  IResourceManager,
  IRendererManager,
  IAudioManager,
  ILogger,
  TechStackAdapter
} from '../types';

import { StateManager } from './StateManager';
import { EventManager } from './EventManager';
import { CommandExecutor } from './CommandExecutor';
import { Logger } from '../utils/Logger';
import { getGlobalCommandModifiers } from './commandModifiers';

/**
 * 游戏运行时引擎
 * 核心类，负责协调所有子系统
 */
export class GameRuntime {
  private config: GameConfig | null = null;
  private currentLevel: LevelConfig | null = null;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  
  // 核心管理器
  private eventManager: IEventManager;
  private stateManager: IStateManager;
  private commandExecutor: CommandExecutor;
  private logger: ILogger;
  
  // 外部依赖
  private resourceManager: IResourceManager;
  private renderManager: IRendererManager;
  private audioManager: IAudioManager;
  private techStackAdapter: TechStackAdapter;

  constructor(
    resourceManager: IResourceManager,
    renderManager: IRendererManager,
    audioManager: IAudioManager,
    techStackAdapter: TechStackAdapter,
    logger?: ILogger
  ) {
    this.logger = logger || new Logger();
    this.eventManager = new EventManager();
    this.stateManager = new StateManager(this.eventManager);
    
    this.resourceManager = resourceManager;
    this.renderManager = renderManager;
    this.audioManager = audioManager;
    this.techStackAdapter = techStackAdapter;
    
    this.commandExecutor = new CommandExecutor(
      this.stateManager,
      this.eventManager,
      this.resourceManager,
      this.renderManager,
      this.audioManager,
      this.logger
    );
    try {
      this.commandExecutor.setCommandModifiers(getGlobalCommandModifiers());
    } catch {}

    this.setupEventListeners();
    this.logger.info('GameRuntime created');
  }

  /**
   * 初始化游戏运行时
   */
  async initialize(config: GameConfig): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('GameRuntime is already initialized');
      return;
    }

    try {
      this.logger.info('Initializing GameRuntime', { gameId: config.id });
      
      this.config = config;
      
      // 初始化全局状态
      this.stateManager.setVariables(config.globalVariables);
      this.stateManager.setSwitches(config.globalSwitches);
      
      // 预加载资源
      await this.preloadResources();
      
      // 初始化音频配置
      this.audioManager.setGlobalVolume(config.audio.globalVolume);
      if (config.audio.muted) {
        this.audioManager.mute();
      }
      
      this.isInitialized = true;
      this.eventManager.emit('runtime_initialized', { config });
      
      this.logger.info('GameRuntime initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize GameRuntime', { error });
      throw error;
    }
  }

  /**
   * 启动游戏
   */
  async start(levelId?: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('GameRuntime must be initialized before starting');
    }

    if (this.isRunning) {
      this.logger.warn('GameRuntime is already running');
      return;
    }

    try {
      this.logger.info('Starting game', { levelId });
      
      // 加载指定关卡或第一个关卡
      const targetLevelId = levelId || this.config!.levels[0]?.id;
      if (!targetLevelId) {
        throw new Error('No levels available to start');
      }
      
      await this.loadLevel(targetLevelId);
      
      this.isRunning = true;
      this.isPaused = false;
      
      this.eventManager.emit('game_started', { levelId: targetLevelId });
      
      this.logger.info('Game started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start game', { error });
      throw error;
    }
  }

  /**
   * 暂停游戏
   */
  pause(): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    this.isPaused = true;
    this.eventManager.emit('game_paused');
    this.logger.info('Game paused');
  }

  /**
   * 恢复游戏
   */
  resume(): void {
    if (!this.isRunning || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    this.eventManager.emit('game_resumed');
    this.logger.info('Game resumed');
  }

  /**
   * 停止游戏
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.isPaused = false;
    
    // 清空指令队列
    this.commandExecutor.clearQueue();
    
    // Ensure all audio is stopped at runtime stop (framework-level)
    try { (this.audioManager as any)?.stopAll?.(); } catch {}
    this.eventManager.emit('game_stopped');
    this.logger.info('Game stopped');
  }

  /**
   * 重置游戏
   */
  reset(): void {
    this.stop();
    this.stateManager.reset();
    this.currentLevel = null;
    
    if (this.config) {
      this.stateManager.setVariables(this.config.globalVariables);
      this.stateManager.setSwitches(this.config.globalSwitches);
    }
    
    this.eventManager.emit('game_reset');
    this.logger.info('Game reset');
  }

  /**
   * 加载关卡
   */
  async loadLevel(levelId: string): Promise<void> {
    if (!this.config) {
      throw new Error('Game config not loaded');
    }

    const level = this.config.levels.find(l => l.id === levelId);
    if (!level) {
      throw new Error(`Level not found: ${levelId}`);
    }

    try {
      this.logger.info('Loading level', { levelId });
      
      // 加载关卡资源
      await this.loadLevelResources(level);
      
      // 设置关卡状态
      this.stateManager.loadState(level.initialState);
      this.stateManager.setCurrentLevel(levelId);
      
      this.currentLevel = level;
      
      // 执行关卡初始化指令
      if (level.commands.length > 0) {
        this.commandExecutor.queueCommands(level.commands);
      }
      
      this.eventManager.emit('level_loaded', { level });
      
      this.logger.info('Level loaded successfully', { levelId });
      
    } catch (error) {
      this.logger.error('Failed to load level', { levelId, error });
      throw error;
    }
  }

  /**
   * 下一关
   */
  async nextLevel(): Promise<void> {
    if (!this.config || !this.currentLevel) {
      throw new Error('No current level to advance from');
    }

    const currentIndex = this.config.levels.findIndex(l => l.id === this.currentLevel!.id);
    const nextLevel = this.config.levels[currentIndex + 1];
    
    if (!nextLevel) {
      this.eventManager.emit('game_completed');
      this.logger.info('Game completed - no more levels');
      return;
    }

    await this.loadLevel(nextLevel.id);
  }

  /**
   * 游戏结束
   */
  gameOver(): void {
    this.stop();
    this.eventManager.emit('game_over', {
      score: this.stateManager.getScore(),
      level: this.currentLevel?.id
    });
    this.logger.info('Game over');
  }

  /**
   * 执行指令
   */
  async executeCommand(command: GameCommand): Promise<CommandResult> {
    if (!this.isRunning || this.isPaused) {
      return {
        success: false,
        error: 'Game is not running or is paused'
      };
    }

    return await this.commandExecutor.executeCommand(command);
  }

  /**
   * 执行指令队列
   */
  async executeCommandQueue(): Promise<CommandResult[]> {
    if (!this.isRunning || this.isPaused) {
      return [];
    }

    return await this.commandExecutor.executeQueue();
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): GameState {
    return this.stateManager.saveState();
  }

  /**
   * 获取当前关卡
   */
  getCurrentLevel(): LevelConfig | null {
    return this.currentLevel;
  }

  /**
   * 获取游戏配置
   */
  getConfig(): GameConfig | null {
    return this.config;
  }

  /**
   * 获取运行时状态
   */
  getStatus(): {
    isInitialized: boolean;
    isRunning: boolean;
    isPaused: boolean;
    currentLevel: string | null;
    score: number;
    progress: number;
  } {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentLevel: this.currentLevel?.id || null,
      score: this.stateManager.getScore(),
      progress: this.stateManager.getProgress()
    };
  }

  /**
   * 获取指令执行器
   */
  getCommandExecutor(): CommandExecutor {
    return this.commandExecutor;
  }

  /**
   * 获取事件管理器
   */
  getEventManager(): IEventManager {
    return this.eventManager;
  }

  /**
   * 获取状态管理器
   */
  getStateManager(): IStateManager {
    return this.stateManager;
  }

  /**
   * 预加载资源
   */
  private async preloadResources(): Promise<void> {
    if (!this.config) return;

    const preloadResources = this.config.resources.filter(r => r.preload);
    if (preloadResources.length > 0) {
      this.logger.info(`Preloading ${preloadResources.length} resources`);
      await this.resourceManager.preloadResources(preloadResources);
    }
  }

  /**
   * 加载关卡资源
   */
  private async loadLevelResources(level: LevelConfig): Promise<void> {
    if (!this.config) return;

    const levelResources = this.config.resources.filter(r => 
      level.resources.includes(r.id)
    );
    
    if (levelResources.length > 0) {
      this.logger.info(`Loading ${levelResources.length} level resources`);
      await this.resourceManager.preloadResources(levelResources);
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听状态变化
    this.eventManager.on('variable_changed', (data) => {
      this.logger.debug('Variable changed', data);
    });

    this.eventManager.on('switch_changed', (data) => {
      this.logger.debug('Switch changed', data);
    });

    this.eventManager.on('level_changed', (data) => {
      this.logger.info('Level changed', data);
    });

    this.eventManager.on('score_changed', (data) => {
      this.logger.debug('Score changed', data);
    });

    // 监听指令执行
    this.eventManager.on('command_error', (data) => {
      this.logger.error('Command execution error', data);
    });

    // 监听游戏事件
    this.eventManager.on('game_completed', () => {
      this.logger.info('Game completed!');
    });

    this.eventManager.on('game_over', (data) => {
      this.logger.info('Game over', data);
    });
  }

  /**
   * 销毁运行时
   */
  destroy(): void {
    this.stop();
    // Extra safety: dispose audio context/resources
    try { (this.audioManager as any)?.dispose?.(); } catch {}
    this.eventManager.removeAllListeners();
    this.isInitialized = false;
    this.config = null;
    this.currentLevel = null;
    
    this.logger.info('GameRuntime destroyed');
  }
}
