// 复用运行时的核心类型定义
export type GameId = string;
export type LevelId = string;
export type CommandId = string;
export type ResourceId = string;

// 指令类型枚举
export enum CommandType {
  // 显示控制
  SHOW_IMAGE = 'SHOW_IMAGE',
  SHOW_TEXT = 'SHOW_TEXT',
  SHOW_MEDIA = 'SHOW_MEDIA',
  HIDE_ELEMENT = 'HIDE_ELEMENT',
  HIDE_ELEMENTS = 'HIDE_ELEMENTS',
  SET_ELEMENT_STYLE = 'SET_ELEMENT_STYLE',
  UPDATE_TEXT = 'UPDATE_TEXT',
  SHOW_BUTTON = 'SHOW_BUTTON',
  
  // 移动动画
  MOVE_TO = 'MOVE_TO',
  SCALE_TO = 'SCALE_TO',
  ROTATE_TO = 'ROTATE_TO',
  FLIP_CARD = 'FLIP_CARD',
  ANIMATE_IN = 'ANIMATE_IN',
  ANIMATE_LOOP = 'ANIMATE_LOOP',
  
  // 状态控制
  SET_VARIABLE = 'SET_VARIABLE',
  SET_USER_DATA = 'SET_USER_DATA',
  SET_SWITCH = 'SET_SWITCH',
  
  // 流程控制
  WAIT = 'WAIT',
  JUMP_TO = 'JUMP_TO',
  IF_CONDITION = 'if_condition',
  LOOP = 'LOOP',
  BREAK = 'BREAK',
  CONTINUE = 'CONTINUE',
  EMIT_SIGNAL = 'EMIT_SIGNAL',
  RETURN = 'RETURN',
  
  // 用户交互
  SHOW_CHOICES = 'SHOW_CHOICES',
  ENABLE_CLICK = 'ENABLE_CLICK',
  SET_CLICKABLE = 'SET_CLICKABLE',
  SET_DRAGGABLE = 'SET_DRAGGABLE',
  SET_SELECTABLE = 'SET_SELECTABLE',
  CHECK_IN_AREA = 'CHECK_IN_AREA',
  INPUT = 'INPUT',
  
  // 音频/特效
  PLAY_SOUND = 'PLAY_SOUND',
  BGM_PLAY = 'BGM_PLAY',
  BGM_PAUSE = 'BGM_PAUSE',
  BGM_STOP = 'BGM_STOP',
  SE_PLAY = 'SE_PLAY',
  SET_VOLUME = 'SET_VOLUME',
  FIREWORK_BURST = 'FIREWORK_BURST',

  // 游戏逻辑
  ADD_SCORE = 'ADD_SCORE',
  NEXT_LEVEL = 'NEXT_LEVEL',
  SCENE_REDIRECT = 'SCENE_REDIRECT',
  
  // 事件组 (用于组织事件)
  EVENT_GROUP = 'EVENT_GROUP'
}

// 指令接口
export interface GameCommand {
  id: string;
  type: CommandType;
  parameters: any;
  enabled?: boolean;
  description?: string;
  depth?: number;
  parentId?: string;
  children?: GameCommand[];
  groupName?: string;  // 添加分组名称字段
}

// 关卡配置接口
export interface LevelConfig {
  id: LevelId;
  name: string;
  description?: string;
  commands: GameCommand[];
  resources: ResourceId[];
  canvasWidth?: number; // 画布宽度配置，可选
  canvasHeight?: number; // 画布高度配置，可选
}

// 游戏项目接口
export interface GameProject {
  id: GameId;
  name: string;
  version: string;
  levels: LevelConfig[];
  globalVariables: Record<string, any>;
  globalSwitches?: Record<string, boolean>;
  resources: ResourceConfig[];
}

// 资源配置接口
export interface ResourceConfig {
  id: ResourceId;
  type: 'image' | 'audio' | 'video';
  src: string;
  name: string;
}

// 编辑器状态接口
export interface EditorState {
  currentProject: GameProject | null;
  currentLevelId: LevelId | null;
  selectedCommand: GameCommand | null;
  isCommandEditorOpen: boolean;
}

// 选项定义
export interface SelectOption {
  value: string;
  label: string;
}

// 指令参数定义
export interface CommandParameterDef {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'color' | 'variable' | 'switch' | 'expression' | 'resource';
  label: string;
  required?: boolean;
  defaultValue?: any;
  options?: SelectOption[];
  min?: number;
  max?: number;
  description?: string;
  placeholder?: string;
  // 编辑器扩展：隐藏该字段（依然保留参数结构，用于兼容老数据或运行时）
  editorHidden?: boolean;
  // 可选：根据其他参数值决定是否显示该字段
  showIf?: {
    path: string;            // 依赖的参数路径，如 'condition.type' 或 'onClick'
    equals?: any;            // 等于时显示
    notEquals?: any;         // 不等于时显示
    in?: any[];              // 值包含于集合时显示
    truthy?: boolean;        // 值为 truthy 时显示（非空字符串/非 0/true）
    notEmpty?: boolean;      // 字符串非空、数组长度>0 或对象键数>0 时显示
  };
  // 资源类型过滤（仅当 type === 'resource' 有效）：'image' | 'audio' | 'video' | 'animation'
  resourceKind?: string | string[];
}

// 指令模板定义
export interface CommandTemplate {
  type: CommandType;
  name: string;
  description: string;
  parameters: CommandParameterDef[];
  category: string;
  icon: string;
  color: string;
  // 标记：该指令会“创建/产生一个元素”，编辑器据此隐藏 elementId 字段，并默认把 commandId 写入参数 id
  spawnsElement?: boolean;
}