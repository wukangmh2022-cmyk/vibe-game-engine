import { CommandType, CommandTemplate } from '../types';

export enum CommandCategory {
  FLOW_CONTROL = 'flow_control',
  DISPLAY = 'display', 
  AUDIO = 'audio',
  INTERACTION = 'interaction',
  ANIMATION = 'animation',
  GAME_LOGIC = 'game_logic',
  SYSTEM = 'system'
}

// 指令模板配置
export const COMMAND_TEMPLATES: CommandTemplate[] = [
  {
    type: CommandType.SHOW_IMAGE,
    name: '显示图片',
    description: '在画布上显示一张图片',
    category: CommandCategory.DISPLAY,
    icon: '🖼️',
    color: '#4CAF50',
    parameters: [
      {
        name: 'elementId',
        label: '元素ID',
        type: 'text',
        required: true,
        description: '元素ID'
      },
      {
        name: 'resourceId',
        label: '资源ID',
        type: 'resource',
        required: true,
        description: '图片资源ID'
      },
      {
        name: 'position.x',
        label: 'X坐标',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'X坐标位置'
      },
      {
        name: 'position.y',
        label: 'Y坐标',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Y坐标位置'
      },
      {
        name: 'size.width',
        label: '宽度',
        type: 'number',
        required: false,
        description: '图片宽度'
      },
      {
        name: 'size.height',
        label: '高度',
        type: 'number',
        required: false,
        description: '图片高度'
      },
      {
        name: 'zIndex',
        label: 'Z索引',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: '层级'
      }
    ]
  },
  {
    type: CommandType.FLIP_CARD,
    name: '翻牌（水平翻转）',
    description: '将指定元素做水平翻转并在中点切换图片（卡牌正反面）',
    category: CommandCategory.ANIMATION,
    icon: '🃏',
    color: '#795548',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true, description: '要翻转的元素ID' },
      { name: 'backResourceId', label: '背面资源ID', type: 'resource', required: true, description: '翻转后显示的背面图片' },
      { name: 'frontResourceId', label: '正面资源ID', type: 'resource', required: false, description: '可选：明确正面图片（默认取当前）' },
      { name: 'duration', label: '时长(ms)', type: 'number', required: false, defaultValue: 600, description: '总时长，默认600ms' },
      { name: 'easing', label: '缓动', type: 'text', required: false, defaultValue: 'easeInOutQuad', description: '缓动函数' },
      { name: 'showBack', label: '翻到背面', type: 'boolean', required: false, defaultValue: true, description: '是否翻到背面（否则翻回正面）' }
    ]
  },
  {
    type: CommandType.SHOW_MEDIA,
    name: '显示媒体',
    description: '显示视频等媒体（无动画）',
    category: CommandCategory.DISPLAY,
    icon: '🎬',
    color: '#9C27B0',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true, description: '元素ID' },
      { name: 'mediaType', label: '媒体类型', type: 'select', required: true, defaultValue: 'video', options: [
        { value: 'video', label: '视频' }
      ], description: '媒体类型' },
      { name: 'resourceId', label: '资源ID', type: 'resource', required: true, description: '媒体资源ID' },
      { name: 'position.x', label: 'X坐标', type: 'number', required: false, defaultValue: 0, description: 'X 坐标' },
      { name: 'position.y', label: 'Y坐标', type: 'number', required: false, defaultValue: 0, description: 'Y 坐标' },
      { name: 'size.width', label: '宽度', type: 'number', required: false, description: '宽度' },
      { name: 'size.height', label: '高度', type: 'number', required: false, description: '高度' },
      { name: 'autoplay', label: '自动播放', type: 'boolean', required: false, defaultValue: true, description: '是否自动播放' },
      { name: 'loop', label: '循环', type: 'boolean', required: false, defaultValue: false, description: '是否循环' },
      { name: 'muted', label: '静音', type: 'boolean', required: false, defaultValue: false, description: '是否静音' },
      { name: 'controls', label: '显示控件', type: 'boolean', required: false, defaultValue: true, description: '是否显示控件（预留）' }
    ]
  },
  {
    type: CommandType.SHOW_TEXT,
    name: '显示文本',
    description: '在画布上显示文本',
    category: CommandCategory.DISPLAY,
    icon: '💬',
    color: '#2196F3',
    parameters: [
      {
        name: 'elementId',
        label: '元素ID',
        type: 'text',
        required: true,
        description: '元素ID'
      },
      {
        name: 'text',
        label: '文本内容',
        type: 'textarea',
        required: true,
        description: '要显示的文本内容'
      },
      {
        name: 'position.x',
        label: 'X坐标',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'X坐标位置'
      },
      {
        name: 'position.y',
        label: 'Y坐标',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Y坐标位置'
      },
      {
        name: 'style.fontSize',
        label: '字体大小',
        type: 'text',
        required: false,
        defaultValue: '16px',
        description: '字体大小'
      },
      {
        name: 'style.color',
        label: '文本颜色',
        type: 'color',
        required: false,
        defaultValue: '#000000',
        description: '文本颜色'
      }
    ]
  },
  {
    type: CommandType.SHOW_BUTTON,
    name: '显示按钮',
    description: '显示一个可点击的按钮',
    category: CommandCategory.INTERACTION,
    icon: '🔘',
    color: '#3F51B5',
    parameters: [
      {
        name: 'elementId',
        label: '元素ID',
        type: 'text',
        required: true,
        description: '元素ID'
      },
      {
        name: 'text',
        label: '按钮文本',
        type: 'text',
        required: true,
        description: '按钮显示的文本'
      },
      {
        name: 'position.x',
        label: 'X坐标',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'X坐标位置'
      },
      {
        name: 'position.y',
        label: 'Y坐标',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Y坐标位置'
      },
      {
        name: 'onClick',
        label: '点击事件',
        type: 'text',
        required: false,
        description: '点击后触发的事件'
      }
    ]
  },
  {
    type: CommandType.UPDATE_TEXT,
    name: '更新文本',
    description: '更新已存在元素的文本内容',
    category: CommandCategory.DISPLAY,
    icon: '✏️',
    color: '#FF9800',
    parameters: [
      {
        name: 'elementId',
        label: '元素ID',
        type: 'text',
        required: true,
        description: '要更新的元素ID'
      },
      {
        name: 'text',
        label: '新文本内容',
        type: 'textarea',
        required: true,
        description: '新的文本内容'
      }
    ]
  },
  {
    type: CommandType.HIDE_ELEMENTS,
    name: '隐藏元素',
    description: '隐藏指定的元素',
    category: CommandCategory.DISPLAY,
    icon: '👁️‍🗯t',
    color: '#795548',
    parameters: [
      {
        name: 'elementIds',
        label: '元素ID列表',
        type: 'text',
        required: true,
        description: '要隐藏的元素ID列表（逗号分隔）'
      }
    ]
  },
  {
    type: CommandType.MOVE_TO,
    name: '移动到',
    description: '将元素移动到指定位置',
    category: CommandCategory.ANIMATION,
    icon: '🏃',
    color: '#FF9800',
    parameters: [
      {
        name: 'elementId',
        label: '元素ID',
        type: 'text',
        required: true,
        description: '要移动的元素ID'
      },
      {
        name: 'x',
        label: 'X坐标',
        type: 'number',
        required: true,
        description: '目标X坐标'
      },
      {
        name: 'y',
        label: 'Y坐标',
        type: 'number',
        required: true,
        description: '目标Y坐标'
      },
      {
        name: 'duration',
        label: '持续时间',
        type: 'number',
        required: false,
        defaultValue: 1000,
        description: '动画持续时间(毫秒)'
      }
    ]
  },
  {
    type: CommandType.SET_VARIABLE,
    name: '设置变量',
    description: '设置游戏变量的值',
    category: CommandCategory.SYSTEM,
    icon: '📊',
    color: '#607D8B',
    parameters: [
      {
        name: 'key',
        label: '变量名',
        type: 'text',
        required: true,
        description: '变量名'
      },
      {
        name: 'value',
        label: '变量值',
        type: 'text',
        required: true,
        description: '变量值或表达式'
      },
      {
        name: 'expression',
        label: '是否为表达式',
        type: 'boolean',
        required: false,
        defaultValue: false,
        description: '是否为表达式计算'
      }
    ]
  },
  {
    type: CommandType.SET_SWITCH,
    name: '设置开关',
    description: '设置游戏开关的状态',
    category: CommandCategory.SYSTEM,
    icon: '🔏',
    color: '#607D8B',
    parameters: [
      {
        name: 'key',
        label: '开关名',
        type: 'switch',
        required: true,
        description: '要设置的开关名称'
      },
      {
        name: 'value',
        label: '开关状态',
        type: 'boolean',
        required: true,
        defaultValue: true,
        description: '开关的新状态(开启/关闭)'
      }
    ]
  },
  {
    type: CommandType.IF_CONDITION,
    name: '条件分支',
    description: '根据条件执行不同的指令',
    category: CommandCategory.FLOW_CONTROL,
    icon: '🔀',
    color: '#9C27B0',
    parameters: [
      {
        name: 'condition.type',
        label: '条件类型',
        type: 'select',
        required: true,
        defaultValue: 'expression',
        description: '条件类型',
        options: [
          { value: 'expression', label: '表达式' },
          { value: 'variable', label: '变量比较' },
          { value: 'switch', label: '开关状态' }
        ]
      },
      {
        name: 'condition.expression',
        label: '条件表达式',
        type: 'textarea',
        required: true,
        description: '条件表达式'
      }
    ]
  },
  {
    type: CommandType.WAIT,
    name: '等待',
    description: '等待指定时间',
    category: CommandCategory.FLOW_CONTROL,
    icon: '⏰',
    color: '#9C27B0',
    parameters: [
      {
        name: 'duration',
        label: '等待时间',
        type: 'number',
        required: true,
        description: '等待时间(毫秒)'
      }
    ]
  },
  {
    type: CommandType.JUMP_TO,
    name: '跳转到',
    description: '跳转到指定的指令位置',
    category: CommandCategory.FLOW_CONTROL,
    icon: '↗️',
    color: '#9C27B0',
    parameters: [
      {
        name: 'targetIndex',
        label: '目标指令索引',
        type: 'number',
        required: true,
        description: '目标指令索引'
      }
    ]
  },
  {
    type: CommandType.GAME_OVER,
    name: '游戏结束',
    description: '结束游戏',
    category: CommandCategory.GAME_LOGIC,
    icon: '🔚',
    color: '#FFC107',
    parameters: [
      {
        name: 'reason',
        label: '结束原因',
        type: 'text',
        required: false,
        defaultValue: 'normal',
        description: '游戏结束原因'
      },
      {
        name: 'message',
        label: '结束消息',
        type: 'text',
        required: false,
        defaultValue: '游戏结束',
        description: '结束消息'
      },
      {
        name: 'resetGame',
        label: '重置游戏',
        type: 'boolean',
        required: false,
        defaultValue: false,
        description: '是否重置游戏状态'
      }
    ]
  },
  {
    type: CommandType.LOOP,
    name: '循环',
    description: '执行循环逻辑，支持for和while循环',
    category: CommandCategory.FLOW_CONTROL,
    icon: '🔁',
    color: '#9C27B0',
    parameters: [
      {
        name: 'loopType',
        label: '循环类型',
        type: 'select',
        required: true,
        defaultValue: 'for',
        options: [
          { value: 'for', label: 'For循环' },
          { value: 'while', label: 'While循环' }
        ]
      },
      {
        name: 'count',
        label: '循环次数',
        type: 'number',
        required: false,
        defaultValue: 1,
        description: 'For循环的次数'
      },
      {
        name: 'condition.expression',
        label: '循环条件',
        type: 'textarea',
        required: false,
        description: 'While循环的条件表达式'
      }
    ]
  },
  {
    type: CommandType.BREAK,
    name: '跳出循环',
    description: '跳出当前循环',
    category: CommandCategory.FLOW_CONTROL,
    icon: '⏹️',
    color: '#9C27B0',
    parameters: [
      {
        name: 'condition.expression',
        label: '跳出条件',
        type: 'textarea',
        required: false,
        description: '满足此条件时才跳出循环'
      }
    ]
  },
  {
    type: CommandType.CONTINUE,
    name: '继续循环',
    description: '跳过当前迭代，继续下一次循环',
    category: CommandCategory.FLOW_CONTROL,
    icon: '⏭️',
    color: '#9C27B0',
    parameters: [
      {
        name: 'condition.expression',
        label: '继续条件',
        type: 'textarea',
        required: false,
        description: '满足此条件时才继续循环'
      }
    ]
  },
  {
    type: CommandType.EMIT_SIGNAL,
    name: '发送信号',
    description: '向事件系统发送一个信号，可附带数据',
    category: CommandCategory.FLOW_CONTROL,
    icon: '📡',
    color: '#9C27B0',
    parameters: [
      {
        name: 'signal',
        label: '信号名称',
        type: 'text',
        required: true,
        description: '要发送的信号名称'
      },
      {
        name: 'data',
        label: '数据载荷',
        type: 'textarea',
        required: false,
        description: '随信号发送的数据(JSON格式)'
      }
    ]
  },
  {
    type: CommandType.RETURN,
    name: '返回',
    description: '从当前事件或函数返回',
    category: CommandCategory.FLOW_CONTROL,
    icon: '⬅️',
    color: '#9C27B0',
    parameters: [
      {
        name: 'value',
        label: '返回值',
        type: 'text',
        required: false,
        description: '返回的值'
      }
    ]
  },
  {
    type: CommandType.EVENT_GROUP,
    name: '事件组',
    description: '组织相关事件的容器',
    category: CommandCategory.FLOW_CONTROL,
    icon: '📋',
    color: '#8e44ad',
    parameters: [
      {
        name: 'name',
        label: '事件名称',
        type: 'text',
        required: true,
        description: '事件组的名称'
      },
      {
        name: 'trigger',
        label: '触发条件',
        type: 'textarea',
        required: false,
        description: '事件的触发条件'
      }
    ]
  }
];

// 根据类型获取指令模板
export function getCommandTemplate(type: CommandType): CommandTemplate | undefined {
  return COMMAND_TEMPLATES.find(template => template.type === type);
}

// 创建新指令
export function createNewCommand(type: CommandType): any {
  const template = getCommandTemplate(type);
  if (!template) return null;

  const parameters: Record<string, any> = {};
  template.parameters.forEach(param => {
    if (param.defaultValue !== undefined) {
      parameters[param.name] = param.defaultValue;
    }
  });

  return {
    id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    parameters,
    enabled: true,
    description: template.name
  };
}
