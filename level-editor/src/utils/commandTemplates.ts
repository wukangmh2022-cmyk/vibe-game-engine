import { CommandType, CommandTemplate } from '../types';

export enum CommandCategory {
  FLOW_CONTROL = '【流程控制】',
  DISPLAY = '【显示】', 
  AUDIO = '【音效】',
  INTERACTION = '【用户交互】',
  ANIMATION = '【动画效果】',
  GAME_LOGIC = '【游戏逻辑】',
  SYSTEM = '【系统相关】'
}

// 指令模板配置
export const COMMAND_TEMPLATES: CommandTemplate[] = [
  {
    type: CommandType.SET_ELEMENT_STYLE,
    name: '显隐元素',
    description: '变更元素的显示/隐藏',
    category: CommandCategory.DISPLAY,
    icon: '🎨',
    color: '#607D8B',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true, description: '目标元素ID' },
      { name: 'style.display', label: '显示(display)', type: 'select', required: false, defaultValue: '', options: [
        { value: '', label: '不修改' }, { value: 'block', label: 'block' }, { value: 'none', label: 'none' }
      ], description: '是否显示该元素' }
    ]
  },
  {
    type: CommandType.FIREWORK_BURST,
    name: '烟花特效',
    description: '在元素中心或坐标处生成烟花粒子',
    category: CommandCategory.ANIMATION,
    icon: '🧨',
    color: '#FF9800',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: false },
      { name: 'elementIdVar', label: '元素ID变量', type: 'variable', required: false },
      { name: 'attachToId', label: '挂载到元素', type: 'text', required: false },
      { name: 'attachToIdVar', label: '挂载元素变量', type: 'variable', required: false },
      { name: 'resourceId', label: '粒子资源', type: 'resource', required: false },
      { name: 'count', label: '粒子数量', type: 'number', required: false, defaultValue: 24 },
      { name: 'life', label: '寿命(ms)', type: 'number', required: false, defaultValue: 900 },
      { name: 'gravity', label: '重力', type: 'number', required: false, defaultValue: 0.35 },
      { name: 'zIndex', label: '层级', type: 'number', required: false, defaultValue: 50 }
    ]
  },
  {
    type: CommandType.BGM_PLAY,
    name: '播放BGM',
    description: '播放背景音乐',
    category: CommandCategory.AUDIO,
    icon: '🎵',
    color: '#9C27B0',
    parameters: [
      { name: 'musicId', label: '音乐ID', type: 'text', required: true },
      { name: 'volume', label: '音量(0-1)', type: 'number', required: false, defaultValue: 0.8, min: 0, max: 1 },
      { name: 'loop', label: '循环', type: 'boolean', required: false, defaultValue: true },
      { name: 'fadeIn', label: '淡入(ms)', type: 'number', required: false, defaultValue: 0, min: 0 }
    ]
  },
  {
    type: CommandType.BGM_STOP,
    name: '停止BGM',
    description: '停止背景音乐',
    category: CommandCategory.AUDIO,
    icon: '⏹️',
    color: '#9C27B0',
    parameters: [
      { name: 'fadeOut', label: '淡出(ms)', type: 'number', required: false, defaultValue: 0, min: 0 }
    ]
  },
  {
    type: CommandType.SE_PLAY,
    name: '播放音效SE',
    description: '播放一次性音效',
    category: CommandCategory.AUDIO,
    icon: '🔈',
    color: '#9C27B0',
    parameters: [
      { name: 'soundId', label: '音效ID', type: 'text', required: true },
      { name: 'volume', label: '音量(0-1)', type: 'number', required: false, defaultValue: 1.0, min: 0, max: 1 },
      { name: 'loop', label: '循环', type: 'boolean', required: false, defaultValue: false },
      { name: 'fadeIn', label: '淡入(ms)', type: 'number', required: false, defaultValue: 0, min: 0 },
      { name: 'delay', label: '延迟(ms)', type: 'number', required: false, defaultValue: 0, min: 0 },
      { name: 'interrupt', label: '中断同类音效', type: 'boolean', required: false, defaultValue: false }
    ]
  },
  {
    type: CommandType.ANIMATE_IN,
    name: '入场动画',
    description: '为元素添加一次性入场动画',
    category: CommandCategory.ANIMATION,
    icon: '✨',
    color: '#FF9800',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true, description: '目标元素ID' },
      { name: 'preset', label: '动画预设', type: 'select', required: false, defaultValue: 'fade', options: [
        { value: 'fade', label: '淡入' },
        { value: 'scaleIn', label: '缩放进入' },
        { value: 'bounce', label: '弹跳' },
        { value: 'moveIn', label: '位移进入' }
      ] },
      { name: 'duration', label: '时长(ms)', type: 'number', required: false, defaultValue: 600 }
    ]
  },
  {
    type: CommandType.ANIMATE_LOOP,
    name: '循环动画',
    description: '循环播放元素动画（悬浮/呼吸）',
    category: CommandCategory.ANIMATION,
    icon: '🔁',
    color: '#FF9800',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true, description: '目标元素ID' },
      { name: 'loopType', label: '循环类型', type: 'select', required: false, defaultValue: 'hoverY', options: [
        { value: 'hoverY', label: '上下悬浮' },
        { value: 'pulse', label: '呼吸缩放' }
      ] },
      { name: 'duration', label: '单次时长(ms)', type: 'number', required: false, defaultValue: 1200 }
    ]
  },
  {
    type: CommandType.SET_SELECTABLE,
    name: '设置可选中',
    description: '为元素开启可选中，支持选中/取消分支与选中特效/覆盖图',
    category: CommandCategory.INTERACTION,
    icon: '✅',
    color: '#3F51B5',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true },
      { name: 'selectable', label: '启用可选中', type: 'boolean', required: false, defaultValue: true },
      { name: 'variableKey', label: '绑定变量名', type: 'text', required: false, description: '自动把选中状态写入此变量(true/false)' },
      { name: 'overlayResourceId', label: '选中覆盖图', type: 'resource', required: false },
      { name: 'effect', label: '选中特效', type: 'select', required: false, defaultValue: '', options: [
        { value: '', label: '无' },
        { value: 'pulse', label: '呼吸' }
      ] }
      // 子命令 onSelected/onCancelSelected 在指令树中编辑
    ]
  },
  // 检测区域内（简化版）
  {
    type: CommandType.CHECK_IN_AREA,
    name: '检测区域内',
    description: '以元素中心点检测是否进入指定区域，命中则执行子命令，并设置系统变量',
    category: CommandCategory.INTERACTION,
    icon: '📐',
    color: '#3F51B5',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true, description: '被检测的元素ID（其中心点）' },
      { name: 'area.x', label: '区域X', type: 'number', required: true, defaultValue: 0 },
      { name: 'area.y', label: '区域Y', type: 'number', required: true, defaultValue: 0 },
      { name: 'area.width', label: '区域宽', type: 'number', required: true, defaultValue: 100 },
      { name: 'area.height', label: '区域高', type: 'number', required: true, defaultValue: 100 }
      // 子命令 commands[] 在指令树中编辑，不在此面板
      // 命中时会写入：last_drop_element_ID, last_drop_resource_ID
    ]
  },
  {
    type: CommandType.SET_CLICKABLE,
    name: '设置可点击',
    description: '为元素开启/配置点击行为（可执行子命令）',
    category: CommandCategory.INTERACTION,
    icon: '🖱️',
    color: '#3F51B5',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true, description: '目标元素ID' },
      { name: 'clickable', label: '启用点击', type: 'boolean', required: false, defaultValue: true, description: '是否可被点击' },
      { name: 'onClick', label: '点击动作', type: 'select', required: false, defaultValue: 'commands', options: [
        { value: 'commands', label: '执行子命令' },
        { value: 'flip', label: '翻牌 (flip)' },
        { value: 'toggle_selected', label: '切换选中状态' }
      ], description: '点击后的行为' },
      { name: 'backResourceId', label: '背面资源ID', type: 'resource', required: false, description: 'onClick=flip 时可选' },
      { name: 'frontResourceId', label: '正面资源ID', type: 'resource', required: false, description: 'onClick=flip 时可选' },
      { name: 'showBack', label: '翻到背面', type: 'boolean', required: false, defaultValue: true, description: 'onClick=flip 时有效' },
      { name: 'effect', label: '选中特效', type: 'text', required: false, description: 'onClick=toggle_selected 时可选，如 pulse' }
      // 注意：子命令 commands[] 在指令树中编辑，不在此面板
    ]
  },
  {
    type: CommandType.SET_DRAGGABLE,
    name: '设置可拖拽',
    description: '开启/关闭拖拽或设置拖拽类型',
    category: CommandCategory.INTERACTION,
    icon: '🖐️',
    color: '#3F51B5',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true, description: '目标元素ID' },
      { name: 'draggable', label: '启用拖拽', type: 'boolean', required: false, defaultValue: true, description: '是否可拖拽' },
      { name: 'dragType', label: '拖拽类型', type: 'text', required: false, description: '用于与掉落区匹配（可选）' }
    ]
  },
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
        name: 'parentId',
        label: '父元素ID',
        type: 'text',
        required: false,
        description: '可选：挂载到已有元素下（相对其坐标）'
      },
      {
        name: 'align',
        label: '对齐',
        type: 'select',
        required: false,
        options: [
          { value: '', label: '左上' },
          { value: 'center', label: '居中' }
        ],
        description: '与父元素的对齐方式（需设置父元素）'
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
    type: CommandType.NEXT_LEVEL,
    name: '下一关',
    description: '进入下一关（同一场景内的下一关卡）',
    category: CommandCategory.GAME_LOGIC,
    icon: '⏭️',
    color: '#00BCD4',
    parameters: []
  },
  {
    type: CommandType.SCENE_REDIRECT,
    name: '场景跳转',
    description: '跳转到指定场景（JSON 路径）',
    category: CommandCategory.GAME_LOGIC,
    icon: '🧭',
    color: '#9C27B0',
    parameters: [
      { name: 'url', label: '目标场景', type: 'text', required: true, placeholder: 'scene/xxx.json', description: '可填绝对URL或相对工程根的 scene/...' }
    ]
  },
  {
    type: CommandType.SHOW_CHOICES,
    name: '显示选项（阻塞）',
    description: '显示用户可选择的多个选项（默认阻塞后续，blocking=false 可改为非阻塞）',
    category: CommandCategory.DISPLAY,
    icon: '📋',
    color: '#3F51B5',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: false, description: '元素ID（可选）' },
      { name: 'blocking', label: '阻塞后续', type: 'boolean', required: false, defaultValue: true },
      { name: 'optionsCount', label: '选项数量', type: 'number', required: false, defaultValue: 2, description: '用于生成分支的选项数量（保存后生效）' },
      { name: 'position.x', label: 'X坐标', type: 'number', required: false, defaultValue: 0 },
      { name: 'position.y', label: 'Y坐标', type: 'number', required: false, defaultValue: 0 },
      { name: 'ui.rowMax', label: '每行最大按钮数', type: 'number', required: false, defaultValue: 1 },
      { name: 'ui.minWidth', label: '最小按钮宽', type: 'number', required: false },
      { name: 'ui.buttonResourceId', label: '按钮资源', type: 'resource', required: false },
      { name: 'ui.buttonSkinId', label: '按钮样式ID', type: 'text', required: false }
    ]
  },
  {
    type: CommandType.FLIP_CARD,
    name: '翻牌动画',
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
    description: '显示视频等媒体',
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
      },
      { name: 'skinId', label: '背景框样式', type: 'text', required: false, description: '九宫格背景皮肤ID（如 dialog-default-9slice）' },
      { name: 'padding', label: '内边距', type: 'number', required: false, description: '皮肤背景内边距' },
      { name: 'backgroundResourceId', label: '背景资源ID', type: 'resource', required: false, description: '兼容：图片背景资源ID' },
      { name: 'backgroundPadding', label: '背景内边距', type: 'number', required: false, description: '兼容：图片背景的内边距' },
      { name: 'blocking', label: '阻塞继续', type: 'boolean', required: false, defaultValue: false, description: '是否阻塞流程直到用户继续' },
      { name: 'dismissOnContinue', label: '继续时关闭', type: 'boolean', required: false, defaultValue: true, description: '继续后自动移除该文本' }
    ]
  },
  // {
  //   type: CommandType.SHOW_BUTTON,
  //   name: '显示按钮',
  //   description: '显示一个可点击的按钮',
  //   category: CommandCategory.DISPLAY,
  //   icon: '🔘',
  //   color: '#3F51B5',
  //   parameters: [
  //     {
  //       name: 'elementId',
  //       label: '元素ID',
  //       type: 'text',
  //       required: true,
  //       description: '元素ID'
  //     },
  //     {
  //       name: 'position.x',
  //       label: 'X坐标',
  //       type: 'number',
  //       required: false,
  //       defaultValue: 0,
  //       description: 'X坐标位置'
  //     },
  //     {
  //       name: 'position.y',
  //       label: 'Y坐标',
  //       type: 'number',
  //       required: false,
  //       defaultValue: 0,
  //       description: 'Y坐标位置'
  //     },
  //     { name: 'ui.buttonResourceId', label: '按钮资源', type: 'resource', required: false, description: '按钮底图资源ID' },
  //     { name: 'ui.yesResourceId', label: '“是”按钮资源', type: 'resource', required: false, description: 'YES 按钮资源ID' },
  //     { name: 'ui.noResourceId', label: '“否”按钮资源', type: 'resource', required: false, description: 'NO 按钮资源ID' },
  //     { name: 'ui.buttonSkinId', label: '按钮样式ID', type: 'text', required: false, description: '按钮样式' }
  //   ]
  // },
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
    icon: '👁️',
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
    name: '设置变量/开关',
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
      { name: 'op', label: '操作', type: 'select', required: false, defaultValue: 'set', options: [
        { value: 'set', label: '设为 (set)' },
        { value: 'add', label: '加 (add)' },
        { value: 'sub', label: '减 (sub)' }
      ] },
      { name: 'value', label: '值', type: 'text', required: true, description: '支持数字/布尔/字符串/null' }
    ]
  },
  // {
  //   type: CommandType.SET_SWITCH,
  //   name: '设置开关',
  //   description: '设置游戏开关的状态',
  //   category: CommandCategory.SYSTEM,
  //   icon: '🔏',
  //   color: '#607D8B',
  //   parameters: [
  //     {
  //       name: 'key',
  //       label: '开关名',
  //       type: 'switch',
  //       required: true,
  //       description: '要设置的开关名称'
  //     },
  //     {
  //       name: 'value',
  //       label: '开关状态',
  //       type: 'boolean',
  //       required: true,
  //       defaultValue: true,
  //       description: '开关的新状态(开启/关闭)'
  //     }
  //   ]
  // },
  {
    type: CommandType.IF_CONDITION,
    name: '条件分支',
    description: '根据条件执行不同的指令',
    category: CommandCategory.FLOW_CONTROL,
    icon: '🔀',
    color: '#9C27B0',
    parameters: [
      {
        name: 'condition',
        label: '条件',
        type: 'expression',
        required: true,
        description: '选择变量/开关或编写表达式'
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
    type: CommandType.LOOP,
    name: '循环 (While)',
    description: '基于条件的 While 循环',
    category: CommandCategory.FLOW_CONTROL,
    icon: '🔁',
    color: '#9C27B0',
    parameters: [
      { name: 'condition', label: '循环条件', type: 'expression', required: true, description: 'While 循环的条件' }
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
        name: 'condition',
        label: '跳出条件',
        type: 'expression',
        required: false,
        description: '满足此条件时才跳出循环'
      }
    ]
  },
  // {
  //   type: CommandType.CONTINUE,
  //   name: '继续循环',
  //   description: '跳过当前迭代，继续下一次循环',
  //   category: CommandCategory.FLOW_CONTROL,
  //   icon: '⏭️',
  //   color: '#9C27B0',
  //   parameters: [
  //     {
  //       name: 'condition',
  //       label: '继续条件',
  //       type: 'expression',
  //       required: false,
  //       description: '满足此条件时才继续循环'
  //     }
  //   ]
  // },
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
  }
  //,
  // {
  //   type: CommandType.EVENT_GROUP,
  //   name: '事件组',
  //   description: '组织相关事件的容器',
  //   category: CommandCategory.FLOW_CONTROL,
  //   icon: '📋',
  //   color: '#8e44ad',
  //   parameters: [
  //     {
  //       name: 'name',
  //       label: '事件名称',
  //       type: 'text',
  //       required: true,
  //       description: '事件组的名称'
  //     },
  //     {
  //       name: 'trigger',
  //       label: '触发条件',
  //       type: 'textarea',
  //       required: false,
  //       description: '事件的触发条件'
  //     }
  //   ]
  // }
];

// 根据类型获取指令模板
export function getCommandTemplate(type: CommandType): CommandTemplate | undefined {
  return COMMAND_TEMPLATES.find(template => template.type === type);
}

// 创建新指令
export function createNewCommand(type: CommandType): any {
  const template = getCommandTemplate(type);
  if (!template) return null;

  // helpers: set nested value by dot-path
  const setByPath = (obj: any, path: string, val: any): any => {
    const segs = path.split('.');
    const root = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
    let cur: any = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = segs[i];
      const next = cur[k];
      cur[k] = (next && typeof next === 'object') ? { ...next } : {};
      cur = cur[k];
    }
    cur[segs[segs.length - 1]] = val;
    return root;
  };
  const fallbackByType = (t: string | undefined) => {
    switch (t) {
      case 'number': return 0;
      case 'boolean': return false;
      default: return '';
    }
  };

  let parameters: Record<string, any> = {};
  for (const param of template.parameters) {
    const v = (param as any).defaultValue !== undefined ? (param as any).defaultValue : fallbackByType((param as any).type);
    parameters = setByPath(parameters, (param as any).name, v);
  }

  return {
    id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    parameters,
    enabled: true,
    description: template.name
  };
}
