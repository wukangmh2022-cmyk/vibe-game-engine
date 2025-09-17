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
  UPDATE_TEXT = 'UPDATE_TEXT',
  SHOW_BUTTON = 'SHOW_BUTTON',
  
  // 移动动画
  MOVE_TO = 'MOVE_TO',
  SCALE_TO = 'SCALE_TO',
  ROTATE_TO = 'ROTATE_TO',
  FLIP_CARD = 'FLIP_CARD',
  
  // 状态控制
  SET_VARIABLE = 'SET_VARIABLE',
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
  INPUT = 'INPUT',
  
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
}
