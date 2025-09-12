/**
 * 游戏运行时引擎核心类型定义
 */

// 基础类型
export type GameId = string;
export type LevelId = string;
export type CommandId = string;
export type EventId = string;
export type ResourceId = string;

// 指令类型枚举
export enum CommandType {
  // 状态控制
  SET_VARIABLE = 'set_variable',
  SET_SWITCH = 'set_switch',
  
  // 流程控制
  WAIT = 'wait',
  JUMP_TO = 'jump_to',
  EMIT_SIGNAL = 'emit_signal',
  
  // 条件分支
  IF_CONDITION = 'if_condition',
  LOOP = 'loop',
  BREAK = 'break',
  CONTINUE = 'continue',
  RETURN = 'return',
  
  // 显示控制
  SHOW_IMAGE = 'show_image',
  SHOW_TEXT = 'show_text',
  UPDATE_TEXT = 'update_text',
  SHOW_BUTTON = 'show_button',
  SET_ELEMENT_STYLE = 'set_element_style',
  HIDE_ELEMENT = 'hide_element',
  SHOW_MEDIA = 'show_media',
  
  // 移动动画
  MOVE_TO = 'move_to',
  SCALE_TO = 'scale_to',
  ROTATE_TO = 'rotate_to',
  FLIP_CARD = 'flip_card',

  // 音频控制
  PLAY_SOUND = 'play_sound',
  PLAY_MUSIC = 'play_music',
  STOP_AUDIO = 'stop_audio',
  
  // BGM控制
  BGM_PLAY = 'bgm_play',
  BGM_PAUSE = 'bgm_pause',
  BGM_STOP = 'bgm_stop',
  BGM_RESUME = 'bgm_resume',
  
  // SE音效控制
  SE_PLAY = 'se_play',
  SE_STOP = 'se_stop',
  
  // 音量控制
  SET_VOLUME = 'set_volume',
  SET_BGM_VOLUME = 'set_bgm_volume',
  SET_SE_VOLUME = 'set_se_volume',
  MUTE_AUDIO = 'mute_audio',
  UNMUTE_AUDIO = 'unmute_audio',
  
  // 用户交互
  SHOW_CHOICES = 'show_choices',
  ENABLE_CLICK = 'enable_click',
  WAIT_FOR_INPUT = 'wait_for_input',
  
  // 元素交互
  SET_DRAGGABLE = 'set_draggable',
  SET_CLICKABLE = 'set_clickable',
  SET_SELECTED = 'set_selected',

  // 拖拽控制
  DRAG_START = 'drag_start',
  DRAG_END = 'drag_end',
  CHECK_DROP_ZONE = 'check_drop_zone',
  CREATE_DROP_ZONE = 'create_drop_zone',
  
  // 位置控制
  SET_POSITION = 'set_position',
  GET_POSITION = 'get_position',
  CHECK_IN_AREA = 'check_in_area',
  ANIMATE_IN = 'animate_in',
  ANIMATE_LOOP = 'animate_loop',
  STOP_ANIMATION = 'stop_animation',
  SET_SIZE = 'set_size',
  SET_ROTATION = 'set_rotation',
  
  // 特效动画
  FADE_IN = 'fade_in',
  FADE_OUT = 'fade_out',
  SHAKE = 'shake',
  FIREWORK_BURST = 'firework_burst',
  
  // 游戏逻辑
  CHECK_ANSWER = 'check_answer',
  ADD_SCORE = 'add_score',
  NEXT_LEVEL = 'next_level',
  GAME_OVER = 'game_over'
}

// 游戏配置接口
export interface GameConfig {
  id: GameId;
  name: string;
  version: string;
  levels: LevelConfig[];
  globalVariables: Record<string, any>;
  globalSwitches: Record<string, boolean>;
  resources: ResourceConfig[];
  audio: AudioConfig;
}

// 关卡配置接口
export interface LevelConfig {
  id: LevelId;
  name: string;
  description?: string;
  initialState: GameState;
  commands: GameCommand[];
  events: EventConfig[];
  resources: ResourceId[];
  validation: ValidationRule[];
  canvasWidth?: number; // 画布宽度配置，可选
  canvasHeight?: number; // 画布高度配置，可选
}

// 游戏状态接口
export interface GameState {
  currentLevel: LevelId;
  variables: Record<string, any>;
  switches: Record<string, boolean>;
  score: number;
  progress: number;
  timestamp: number;
}

// 指令接口
export interface GameCommand {
  id: CommandId;
  type: CommandType;
  parameters: Record<string, any>;
  conditions?: Condition[];
  metadata?: CommandMetadata;
}

// 指令元数据
export interface CommandMetadata {
  description?: string;
  tags?: string[];
  priority?: number;
  timeout?: number;
  continueOnError?: boolean;
}

// 条件接口
export interface Condition {
  type: 'variable' | 'switch' | 'expression';
  key?: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
  value: any;
  expression?: string;
}

// 事件配置接口
export interface EventConfig {
  id: EventId;
  name: string;
  triggers: EventTrigger[];
  commands: GameCommand[];
  conditions?: Condition[];
}

// 事件触发器
export interface EventTrigger {
  type: 'timer' | 'custom';
  target?: string;
  delay?: number;
  condition?: Condition;
}

// 资源配置接口
export interface ResourceConfig {
  id: ResourceId;
  type: 'image' | 'audio' | 'video' | 'text' | 'json';
  url: string;
  preload?: boolean;
  metadata?: Record<string, any>;
}

// 音频配置接口
export interface AudioConfig {
  globalVolume: number;
  soundVolume: number;
  musicVolume: number;
  muted: boolean;
}

// 验证规则接口
export interface ValidationRule {
  id: string;
  type: 'required' | 'type' | 'range' | 'custom';
  field: string;
  message: string;
  validator?: (value: any) => boolean;
}

// 验证结果接口
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// 验证错误接口
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// 指令执行上下文接口
export interface CommandContext {
  gameState: GameState;
  stateManager: IStateManager;
  eventManager: IEventManager;
  resourceManager: IResourceManager;
  renderManager: IRendererManager;
  audioManager: IAudioManager;
  logger: ILogger;
  executor?: any; // CommandExecutor instance
}

// 指令执行结果接口
export interface CommandResult {
  success: boolean;
  data?: any;
  error?: string;
  nextCommand?: CommandId;
}

// 指令处理器接口
export interface ICommandHandler {
  readonly type: CommandType;
  execute(command: GameCommand, context: CommandContext): Promise<CommandResult>;
  validate(command: GameCommand): ValidationResult;
}

// 事件管理器接口
export interface IEventManager {
  on(event: string, listener: EventListener): void;
  off(event: string, listener: EventListener): void;
  emit(event: string, data?: any): void;
  once(event: string, listener: EventListener): void;
  removeAllListeners(event?: string): void;
}

// 事件监听器类型
export type EventListener = (data?: any) => void | Promise<void>;

// 状态管理器接口
export interface IStateManager {
  getVariable(key: string): any;
  setVariable(key: string, value: any): void;
  getSwitch(key: string): boolean;
  setSwitch(key: string, value: boolean): void;
  saveState(): GameState;
  loadState(state: GameState): void;
  reset(): void;
  setVariables(variables: Record<string, any>): void;
  setSwitches(switches: Record<string, boolean>): void;
  getCurrentLevel(): string;
  setCurrentLevel(levelId: string): void;
  getScore(): number;
  setScore(score: number): void;
  addScore(points: number): void;
  getProgress(): number;
  setProgress(progress: number): void;
}

// 资源管理器接口
export interface IResourceManager {
  loadResource(config: ResourceConfig): Promise<any>;
  getResource(id: ResourceId): any;
  preloadResources(configs: ResourceConfig[]): Promise<void>;
  unloadResource(id: ResourceId): void;
}

// 渲染管理器接口
export interface IRendererManager {
  createElement(config: ElementConfig): RenderElement;
  updateElement(id: string, updates: Partial<ElementConfig>): void;
  removeElement(id: string): void;
  render(): void;
}

// 音频管理器接口
export interface IAudioManager {
  playSound(id: ResourceId, options?: AudioOptions): AudioInstance;
  playMusic(id: ResourceId, options?: AudioOptions): void;
  stopAudio(id: ResourceId): void;
  setGlobalVolume(volume: number): void;
  mute(): void;
  unmute(): void;
}

// 日志接口
export interface ILogger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
}

// 渲染元素配置
export interface ElementConfig {
  id: string;
  type: 'image' | 'text' | 'container' | 'button';
  position: { x: number; y: number };
  size?: { width: number; height: number };
  rotation?: number;
  scale?: { x: number; y: number };
  visible?: boolean;
  interactive?: boolean;
  style?: Record<string, any>;
  content?: string;
  src?: string;
  parentId?: string;
}

// 渲染元素接口
export interface RenderElement {
  readonly id: string;
  readonly type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  scale: { x: number; y: number };
  visible: boolean;
  interactive: boolean;
  
  update(config: Partial<ElementConfig>): void;
  destroy(): void;
}

// 音频选项
export interface AudioOptions {
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

// 音频实例接口
export interface AudioInstance {
  readonly id: ResourceId;
  readonly type: 'sound' | 'music';
  volume: number;
  loop: boolean;
  playing: boolean;
  paused: boolean;
  
  play(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setVolume(volume: number): void;
  setLoop(loop: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  seek(time: number): void;
}

// 技术栈适配器接口
export interface TechStackAdapter {
  renderAdapter: RenderAdapter;
  audioAdapter: AudioAdapter;
  inputAdapter: InputAdapter;
}

// 渲染适配器接口
export interface RenderAdapter {
  createContainer(config: ContainerConfig): RenderContainer;
  createElement(config: ElementConfig): RenderElement;
  updateElement(element: RenderElement, updates: Partial<ElementConfig>): void;
  removeElement(element: RenderElement): void;
  render(): void;
}

// 音频适配器接口
export interface AudioAdapter {
  loadAudio(id: ResourceId, url: string): Promise<AudioResource>;
  playSound(id: ResourceId, options?: AudioOptions): AudioInstance;
  playMusic(id: ResourceId, options?: AudioOptions): AudioInstance;
  stopAudio(id: ResourceId): void;
  setVolume(volume: number): void;
}

// 输入适配器接口
export interface InputAdapter {
  onPointerDown(callback: (event: PointerEvent) => void): void;
  onPointerUp(callback: (event: PointerEvent) => void): void;
  onPointerMove(callback: (event: PointerEvent) => void): void;
  onKeyDown(callback: (event: KeyboardEvent) => void): void;
  onKeyUp(callback: (event: KeyboardEvent) => void): void;
}

// 容器配置
export interface ContainerConfig {
  id: string;
  width: number;
  height: number;
  backgroundColor?: string;
}

// 渲染容器接口
export interface RenderContainer {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  
  addChild(element: RenderElement): void;
  removeChild(element: RenderElement): void;
  clear(): void;
}

// 音频资源接口
export interface AudioResource {
  readonly id: ResourceId;
  readonly url: string;
  readonly duration: number;
  readonly loaded: boolean;
}

// 指针事件接口
export interface PointerEvent {
  x: number;
  y: number;
  button: number;
  target?: RenderElement;
}

// 键盘事件接口
export interface KeyboardEvent {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}
