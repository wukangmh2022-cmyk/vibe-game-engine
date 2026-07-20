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
    name: '显隐元素(缩放/透明度等)',
    description: '变更元素的显示/隐藏，以及缩放、透明度等参数',
    category: CommandCategory.DISPLAY,
    icon: '🎨',
    color: '#607D8B',
    parameters: [
      { name: 'elementId', label: '元素ID（支持 {var} 内插）', type: 'text', required: true, description: '目标元素ID' },
      { name: 'style.display', label: '显示(display)', type: 'select', required: false, defaultValue: '', options: [
        { value: '', label: '不修改' },
        { value: 'block', label: '显示(block)' },
        { value: 'none', label: '隐藏(none)' }
      ], description: '是否显示该元素' },
      { name: 'style.alpha', label: '透明度(alpha)', type: 'text', required: false, placeholder: '不修改（0~1）', description: '0~1 之间；留空=不修改' },
      { name: 'style.scale', label: '缩放(scale)', type: 'text', required: false, placeholder: '不修改（例如 0.6）', description: '统一缩放；留空=不修改' },
      { name: 'style.zIndex', label: '层级(zIndex)', type: 'text', required: false, placeholder: '不修改', description: '显示层级，数值越大越靠上；留空=不修改' }
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
      { name: 'elementId', label: '元素ID（支持 {var} 内插）', type: 'text', required: false, description: '作为起点与挂载目标（仅需填一次）' },
      { name: 'attachToId', label: '挂载到元素', type: 'text', required: false, editorHidden: true },
      { name: 'parentId', label: '父元素ID', type: 'text', required: false, description: '可选：挂载到已有元素（相对中心）。支持 {var} 与内插，如 bg{iii}' },
      { name: 'x', label: 'X 坐标(可选)', type: 'number', required: false, description: '未指定元素ID时使用坐标' },
      { name: 'y', label: 'Y 坐标(可选)', type: 'number', required: false, description: '未指定元素ID时使用坐标' },
      { name: 'resourceId', label: '粒子资源', type: 'resource', required: false, resourceKind: 'image' },
      { name: 'count', label: '粒子数量', type: 'number', required: false, defaultValue: 24 },
      { name: 'speedMin', label: '最小初速', type: 'number', required: false, defaultValue: 3 },
      { name: 'speedMax', label: '最大初速', type: 'number', required: false, defaultValue: 6 },
      { name: 'life', label: '寿命(ms)', type: 'number', required: false, defaultValue: 900 },
      { name: 'gravity', label: '重力/加速度', type: 'number', required: false, defaultValue: 0.35 },
      { name: 'fadeOut', label: '淡出', type: 'boolean', required: false, defaultValue: true },
      { name: 'scaleMin', label: '最小缩放', type: 'number', required: false, defaultValue: 0.4 },
      { name: 'scaleMax', label: '最大缩放', type: 'number', required: false, defaultValue: 0.9 },
      { name: 'rotation', label: '随机旋转', type: 'boolean', required: false, defaultValue: true },
      { name: 'blendMode', label: '混合模式', type: 'select', required: false, defaultValue: 'normal', options: [
        { value: 'normal', label: 'normal' }, { value: 'add', label: 'add' }, { value: 'screen', label: 'screen' }, { value: 'multiply', label: 'multiply' }, { value: 'overlay', label: 'overlay' }, { value: 'lighten', label: 'lighten' }, { value: 'darken', label: 'darken' }
      ] },
      { name: 'tint', label: '颜色(tint)', type: 'text', required: false, description: '单色或多色，逗号分隔。例如：0xffee88 或 0xffaa00,0x88ccff' },
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
      { name: 'musicId', label: '音乐ID', type: 'resource', required: true, resourceKind: 'audio' },
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
      { name: 'soundId', label: '音效ID', type: 'resource', required: true, resourceKind: 'audio' },
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
      { name: 'elementId', label: '元素ID（支持 {var} 内插）', type: 'text', required: true, description: '目标元素ID' },
      { name: 'mode', label: '动画来源', type: 'select', required: false, defaultValue: 'preset', options: [
        { value: 'preset', label: '预设动画' },
        { value: 'resource', label: '资源动画' }
      ] },
      { name: 'animId', label: '动画资源ID', type: 'resource', required: false, resourceKind: 'animation', showIf: { path: 'mode', equals: 'resource' } },
      { name: 'preset', label: '动画预设', type: 'select', required: false, defaultValue: 'fade', options: [
        { value: 'fade', label: '淡入' },
        { value: 'scaleIn', label: '缩放进入' },
        { value: 'bounce', label: '弹跳' },
        { value: 'moveIn', label: '位移进入' }
      ], showIf: { path: 'mode', equals: 'preset' } },
      { name: 'duration', label: '时长(ms)', type: 'number', required: false, defaultValue: 600, description: '预设：动画时长；资源：覆盖时间轴总时长（可选）' },
      { name: 'direction', label: '方向', type: 'select', required: false, defaultValue: 'up', options: [
        { value: 'up', label: '自下向上' },
        { value: 'down', label: '自上向下' },
        { value: 'left', label: '自右向左' },
        { value: 'right', label: '自左向右' }
      ], showIf: { path: 'preset', equals: 'moveIn' } },
      { name: 'offset', label: '位移距离(px)', type: 'number', required: false, defaultValue: 60, showIf: { path: 'preset', equals: 'moveIn' } }
    ]
  },
  {
    type: CommandType.ANIMATE_OUT,
    name: '出场动画',
    description: '为元素添加一次性出场动画（可选：结束后隐藏）',
    category: CommandCategory.ANIMATION,
    icon: '💨',
    color: '#FF9800',
    parameters: [
      { name: 'elementId', label: '元素ID（支持 {var} 内插）', type: 'text', required: true, description: '目标元素ID' },
      { name: 'mode', label: '动画来源', type: 'select', required: false, defaultValue: 'preset', options: [
        { value: 'preset', label: '预设动画' },
        { value: 'resource', label: '资源动画' }
      ] },
      { name: 'animId', label: '动画资源ID', type: 'resource', required: false, resourceKind: 'animation', showIf: { path: 'mode', equals: 'resource' } },
      { name: 'preset', label: '动画预设', type: 'select', required: false, defaultValue: 'fade', options: [
        { value: 'fade', label: '淡出' },
        { value: 'scaleOut', label: '缩小离场' },
        { value: 'moveOut', label: '位移离场' }
      ], showIf: { path: 'mode', equals: 'preset' } },
      { name: 'duration', label: '时长(ms)', type: 'number', required: false, defaultValue: 600, description: '预设：动画时长；资源：覆盖时间轴总时长（可选）' },
      { name: 'direction', label: '方向', type: 'select', required: false, defaultValue: 'up', options: [
        { value: 'up', label: '向上移出' },
        { value: 'down', label: '向下移出' },
        { value: 'left', label: '向左移出' },
        { value: 'right', label: '向右移出' }
      ], showIf: { path: 'preset', equals: 'moveOut' } },
      { name: 'offset', label: '位移距离(px)', type: 'number', required: false, defaultValue: 60, showIf: { path: 'preset', equals: 'moveOut' } },
      { name: 'hideAfter', label: '结束后隐藏元素', type: 'boolean', required: false, defaultValue: true, description: '参考“显隐元素”指令，等动画结束后将 display 设为 none' }
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
      { name: 'elementId', label: '元素ID（支持 {var} 内插）', type: 'text', required: true, description: '目标元素ID' },
      { name: 'mode', label: '动画来源', type: 'select', required: false, defaultValue: 'preset', options: [
        { value: 'preset', label: '预设动画' },
        { value: 'resource', label: '资源动画' }
      ] },
      { name: 'loopType', label: '循环类型', type: 'select', required: false, defaultValue: 'hoverY', options: [
        { value: 'hoverY', label: '上下悬浮' },
        { value: 'pulse', label: '呼吸缩放' }
      ], showIf: { path: 'mode', equals: 'preset' } },
      { name: 'duration', label: '单次时长(ms)', type: 'number', required: false, defaultValue: 1200, description: '预设：单次周期；资源：覆盖时间轴总时长（可选）' },
      { name: 'animId', label: '循环动画ID', type: 'resource', required: false, resourceKind: 'animation', description: '使用资源动画循环播放', showIf: { path: 'mode', equals: 'resource' } }
    ]
  },
  {
    type: CommandType.SET_SELECTABLE,
    name: '设置可选中',
    description: '为元素开启可选中，支持选中/取消分支与选中特效/覆盖图。提示：分支子命令里若使用 {临时变量}（如 name_{val}），会在绑定时固定为当时的值。',
    category: CommandCategory.INTERACTION,
    icon: '✅',
    color: '#3F51B5',
    parameters: [
      { name: 'elementId', label: '元素ID（支持 {var} 内插）', type: 'text', required: true, description: '支持 {var} 与前后缀内插，如 card_{i}' },
      { name: 'selectable', label: '启用可选中', type: 'boolean', required: false, defaultValue: true },
      { name: 'variableKey', label: '绑定变量名', type: 'text', required: false, placeholder: '不填则不绑定', description: '自动把选中状态写入此变量(true/false)。支持 {var} 与内插，如 sel_{i}' },
      { name: 'singleSelect', label: '单选', type: 'boolean', required: false, defaultValue: false, description: '开启后，新的选中会自动取消上一个元素的选中（基于上次变更的元素ID）' },
      { name: 'overlayResourceId', label: '选中覆盖图', type: 'resource', required: false, resourceKind: 'image' },
      { name: 'effect', label: '选中特效动画', type: 'resource', required: false, resourceKind: 'animation', description: '可选：选中时播放的动画资源（留空为无特效）' },
      { name: 'clickGuardMs', label: '互斥点击等待(ms)', type: 'number', required: false, defaultValue: 0, description: '本交互指令运行后，在该时长内同类交互不可响应（全局对“可选中”类生效）' }
      // 子命令 onSelected/onCancelSelected 在指令树中编辑
    ]
  },
  {
    type: CommandType.CHANGE_SELECTED_STATE,
    name: '变更选中状态',
    description: '切换或设置元素的选中/取消选中，并自动执行“设置可选中”配置中的系统与用户分支',
    category: CommandCategory.INTERACTION,
    icon: '🔁',
    color: '#3F51B5',
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: true },
      { name: 'selected', label: '设为选中', type: 'boolean', required: false, description: '留空=自动切换；true=设为选中；false=取消选中' }
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
      { name: 'elementId', label: '元素ID（可选）', type: 'text', required: false, description: '不填：全局检测（可多次触发）；填写：仅检测该元素（一次触发）' },
      { name: 'area.x', label: '区域X', type: 'number', required: true, defaultValue: 0, description: '' },
      { name: 'area.y', label: '区域Y', type: 'number', required: true, defaultValue: 0, description: '' },
      { name: 'area.width', label: '区域宽', type: 'number', required: true, defaultValue: 100, description: '' },
      { name: 'area.height', label: '区域高', type: 'number', required: true, defaultValue: 100, description: '提示：右下坐标 = (X + 宽, Y + 高)' },
      { name: 'outside', label: '是否区域外', type: 'boolean', required: false, defaultValue: false, description: '开启后，命中条件改为“元素中心在区域外”' },
      { name: 'requireEnter', label: '仅进入触发', type: 'boolean', required: false, defaultValue: false, description: '仅在穿越边界“进入目标空间”时触发：当未勾选“是否区域外”时，需要从区域外进入区域内；勾选后需要从区域内进入区域外' }
      // 子命令 commands[] 在指令树中编辑，不在此面板
      // 命中时会写入：last_drop_element_ID, last_drop_resource_ID
    ]
  },
  {
    type: CommandType.SET_CLICKABLE,
    name: '设置可点击',
    description: '为元素开启/配置点击行为（可执行子命令）。提示：子命令里若使用 {临时变量}（如 bg{iii}），会在绑定时固定为当时的值。',
    category: CommandCategory.INTERACTION,
    icon: '🖱️',
    color: '#3F51B5',
    parameters: [
      { name: 'elementId', label: '元素ID（支持 {var} 内插）', type: 'text', required: true, description: '目标元素ID；支持 {var} 或前后缀内插，如 card_{i}' },
      { name: 'clickable', label: '启用点击', type: 'boolean', required: false, defaultValue: true, description: '是否可被点击' },
      { name: 'blocking', label: '阻塞其他交互', type: 'boolean', required: false, defaultValue: false, description: '开启后，仅此元素可交互，直到子命令执行完毕' },
      { name: 'onClick', label: '点击动作', type: 'select', required: false, defaultValue: 'commands', options: [
        { value: 'commands', label: '执行子命令' },
        { value: 'flip', label: '翻牌 (flip)' },
        { value: 'toggle_selected', label: '切换选中状态' }
      ], description: '点击后的行为' },
      { name: 'backResourceId', label: '背面资源ID', type: 'resource', required: false, description: 'onClick=flip 时可选', showIf: { path: 'onClick', equals: 'flip' }, resourceKind: 'image' },
      { name: 'frontResourceId', label: '正面资源ID', type: 'resource', required: false, description: 'onClick=flip 时可选', showIf: { path: 'onClick', equals: 'flip' }, resourceKind: 'image' },
      { name: 'showBack', label: '翻到背面', type: 'boolean', required: false, defaultValue: true, description: 'onClick=flip 时有效', showIf: { path: 'onClick', equals: 'flip' } },
      { name: 'effect', label: '选中特效动画', type: 'resource', required: false, description: 'onClick=toggle_selected 时可选：选中时播放的动画资源（留空为无特效）', showIf: { path: 'onClick', equals: 'toggle_selected' }, resourceKind: 'animation' }
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
      { name: 'elementId', label: '元素ID（支持 {var} 内插）', type: 'text', required: true, description: '目标元素ID；支持 {var} 与内插，如 card_{i}' },
      { name: 'draggable', label: '启用拖拽', type: 'boolean', required: false, defaultValue: true, description: '是否可拖拽' }
    ]
  },
  {
    type: CommandType.SHOW_IMAGE,
    name: '显示图片',
    description: '在画布上显示一张图片',
    category: CommandCategory.DISPLAY,
    icon: '🖼️',
    color: '#4CAF50',
    spawnsElement: true,
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: false, description: '目标元素ID（支持 {var} 与内插，如 card_{i}；默认等于指令ID）' },
      { name: 'resourceId', label: '资源ID', type: 'resource', required: true, description: '图片资源ID', resourceKind: 'image' },
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
        placeholder: '不填则无父元素',
        description: '可选：挂载到已有元素下（相对其坐标）。支持 {var} 与内插，如 bg{iii}'
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
        name: 'visible',
        label: '初始可见',
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: '取消勾选则初始隐藏（可后续通过显隐或样式指令显示）'
      },
      {
        name: 'zIndex',
        label: 'Z索引',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: '层级'
      },
      {
        name: 'rotation',
        label: '旋转(度)',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: '顺时针旋转角度（度）'
      },
      { name: 'animation.entry.animId', label: '入场动画ID', type: 'resource', required: false, resourceKind: 'animation', description: '动画资源ID或URL。默认非阻塞，如需等待请在后续添加 WAIT 指令。' },
      { name: 'animation.entry.duration', label: '入场时长(ms)', type: 'number', required: false, description: '覆盖资源时间轴总时长（可选）' },
      { name: 'animation.loop.animId', label: '循环动画ID', type: 'resource', required: false, resourceKind: 'animation', description: '循环动画资源ID或URL。若同时设置入场动画，将在入场结束后自动开始循环。' },
      { name: 'animation.loop.duration', label: '循环时长(ms)', type: 'number', required: false, description: '覆盖循环动画的单次周期（可选）' }
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
    type: CommandType.SET_USER_DATA as any,
    name: '设置用户变量',
    description: '写入用户变量（本地立即生效；后台按队列顺序同步远端；无需填写 sceneId）',
    category: CommandCategory.SYSTEM,
    icon: '🗂️',
    color: '#607D8B',
    parameters: [
      { name: 'key', label: '键名', type: 'text', required: true, description: '支持 {var} 与内插（如 score_{_sceneName}_{_levelIndex}）' },
      { name: 'op', label: '操作', type: 'select', required: false, defaultValue: 'set', options: [
        { value: 'set', label: '设为' },
        { value: 'add', label: '加' },
        { value: 'sub', label: '减' },
        { value: 'mul', label: '乘' },
        { value: 'div', label: '除' }
      ]},
      { name: 'value', label: '值', type: 'text', required: true, description: '支持数字/布尔/字符串；支持 {var} 与内插（如 name_{i}）' }
    ]
  },
  {
    type: CommandType.SCENE_REDIRECT,
    name: '场景跳转',
    description: '跳转到指定场景（JSON 路径）',
    category: CommandCategory.GAME_LOGIC,
    icon: '🧭',
    color: '#9C27B0',
    parameters: [
      { name: 'url', label: '目标场景', type: 'text', required: true, placeholder: 'entry.json 或 this', description: '可填绝对URL、相对路径（自动加 scene/ 前缀），或填 this 重启进入当前场景' },
      { name: 'levelIndex', label: '关卡索引', type: 'text', required: false, description: '可选：进入目标场景中的第几个关卡（从 0 开始，支持 {var} 或内插）' }
    ]
  },
  {
    type: CommandType.SHOW_CHOICES,
    name: '显示选项',
    description: '显示用户可选择的多个选项。支持单选/多选：多选开启后将不阻塞且不自动消失。',
    category: CommandCategory.DISPLAY,
    icon: '📋',
    color: '#3F51B5',
    spawnsElement: true,
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: false, description: '目标元素ID（默认等于指令ID，可修改）' },
      { name: 'blocking', label: '阻塞后续', type: 'boolean', required: false, defaultValue: true },
      { name: 'multiSelect', label: '开启多选', type: 'boolean', required: false, defaultValue: false, description: '开启后：不阻塞、不自动消失；每个选项将切换变量 sys_choice_N（N 为选项序号，从 1 开始）。' },
      { name: 'position.x', label: 'X坐标', type: 'number', required: false, defaultValue: 0 },
      { name: 'position.y', label: 'Y坐标', type: 'number', required: false, defaultValue: 0 },
      { name: 'ui.rowMax', label: '每行最大按钮数', type: 'number', required: false, defaultValue: 1 },
      { name: 'ui.gapX', label: '水平间距', type: 'number', required: false, defaultValue: 16 },
      { name: 'ui.gapY', label: '垂直间距', type: 'number', required: false, defaultValue: 12 },
      { name: 'ui.minWidth', label: '最小按钮宽', type: 'number', required: false, defaultValue: 30 },
      { name: 'ui.fontSize', label: '按钮文字字号', type: 'number', required: false, defaultValue: 16 },
      { name: 'ui.maxWidth', label: '按钮最大宽', type: 'number', required: false, defaultValue: 300 },
      { name: 'ui.paddingX', label: '按钮左右内边距', type: 'number', required: false, defaultValue: 12 },
      { name: 'ui.paddingY', label: '按钮上下内边距', type: 'number', required: false, defaultValue: 8 },
      { name: 'ui.color', label: '按钮文字颜色', type: 'color', required: false, defaultValue: '#ffffff' },
      { name: 'ui.zIndex', label: 'Z 轴层级', type: 'number', required: false, defaultValue: 100, description: '控制显示层级，数值越大越靠上' },
      { name: 'ui.buttonSkinId', label: '按钮样式ID', type: 'text', required: false },
      { name: 'ui.selectedSkinId', label: '选中态皮肤ID', type: 'text', required: false, showIf: { path: 'multiSelect', equals: true }, description: '用于多选模式下显示选中高亮皮肤。提示：sys_choice_N 为系统提供的选中态变量（true/false）。' }
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
      { name: 'backResourceId', label: '背面资源ID', type: 'resource', required: true, description: '翻转后显示的背面图片', resourceKind: 'image' },
      { name: 'frontResourceId', label: '正面资源ID', type: 'resource', required: false, description: '可选：明确正面图片（默认取当前）', resourceKind: 'image' },
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
    spawnsElement: true,
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: false, description: '目标元素ID（默认等于指令ID，可修改）' },
      { name: 'mediaType', label: '媒体类型', type: 'select', required: true, defaultValue: 'video', options: [
        { value: 'video', label: '视频' }
      ], description: '媒体类型' },
      { name: 'resourceId', label: '资源ID', type: 'resource', required: true, description: '媒体资源ID', resourceKind: 'video' },
      { name: 'position.x', label: 'X坐标', type: 'number', required: false, defaultValue: 0, description: 'X 坐标' },
      { name: 'position.y', label: 'Y坐标', type: 'number', required: false, defaultValue: 0, description: 'Y 坐标' },
      { name: 'size.width', label: '宽度', type: 'number', required: false, description: '宽度' },
      { name: 'size.height', label: '高度', type: 'number', required: false, description: '高度' },
      { name: 'autoplay', label: '自动播放', type: 'boolean', required: false, defaultValue: true, description: '是否自动播放', showIf: { path: 'mediaType', equals: 'video' } },
      { name: 'loop', label: '循环', type: 'boolean', required: false, defaultValue: false, description: '是否循环', showIf: { path: 'mediaType', equals: 'video' } },
      { name: 'muted', label: '静音', type: 'boolean', required: false, defaultValue: false, description: '是否静音', showIf: { path: 'mediaType', equals: 'video' } },
      { name: 'controls', label: '显示控件', type: 'boolean', required: false, defaultValue: true, description: '是否显示控件（预留）', showIf: { path: 'mediaType', equals: 'video' } }
    ]
  },
  
  {
    type: CommandType.SHOW_TEXT,
    name: '显示文本',
    description: '在画布上显示文本',
    category: CommandCategory.DISPLAY,
    icon: '💬',
    color: '#2196F3',
    spawnsElement: true,
    parameters: [
      { name: 'elementId', label: '元素ID', type: 'text', required: false, description: '目标元素ID（默认等于指令ID，可修改）' },
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
      { name: 'style.stroke', label: '描边颜色', type: 'color', required: false, description: '文本描边颜色' },
      { name: 'style.strokeThickness', label: '描边粗细', type: 'number', required: false, defaultValue: 0 },
      { name: 'style.dropShadow', label: '投影', type: 'boolean', required: false, defaultValue: false },
      { name: 'style.dropShadowColor', label: '投影颜色', type: 'color', required: false, defaultValue: '#000000' },
      { name: 'style.dropShadowBlur', label: '投影模糊', type: 'number', required: false, defaultValue: 0 },
      { name: 'style.dropShadowAngle', label: '投影角度', type: 'number', required: false, defaultValue: 1.2 },
      { name: 'style.dropShadowDistance', label: '投影距离', type: 'number', required: false, defaultValue: 2 },
      { name: 'style.maxWidth', label: '最大宽度(px)', type: 'text', required: false, defaultValue: 999, description: '如 600 或 600px' },
      { name: 'style.textAlign', label: '对齐', type: 'select', required: false, defaultValue: 'left', options: [ { value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' } ] },
      { name: 'style.zIndex', label: 'Z 轴层级', type: 'number', required: false, defaultValue: 5, description: '控制文本层级，数值越大越靠上' },
      { name: 'skinId', label: '背景框样式', type: 'text', required: false, description: '九宫格背景皮肤ID（如 dialog-default-9slice）' },
      { name: 'padding', label: '内边距', type: 'number', required: false, defaultValue: 20, description: '皮肤背景内边距' },
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
        required: false,
        description: '目标X坐标（留空或 -1 表示不修改）'
      },
      {
        name: 'y',
        label: 'Y坐标',
        type: 'number',
        required: false,
        description: '目标Y坐标（留空或 -1 表示不修改）'
      },
      {
        name: 'duration',
        label: '持续时间',
        type: 'number',
        required: false,
        defaultValue: 1000,
        description: '动画持续时间(毫秒)'
      },
      {
        name: 'keepOnMinusOne',
        label: 'X/Y 为 -1 不修改',
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: '开启后，当 X 或 Y 为 -1 时保持该轴不变'
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
        description: '变量名；若勾选“临时变量”，此变量可被“可点击/可选中”的子命令用作 {变量} 内插并在绑定时固定（类似捕获当前值）'
      },
      { name: 'op', label: '操作', type: 'select', required: false, defaultValue: 'set', options: [
        { value: 'set', label: '设为 (set)' },
        { value: 'add', label: '加 (add)' },
        { value: 'sub', label: '减 (sub)' },
        { value: 'mul', label: '乘 (mul)' },
        { value: 'div', label: '除以 (div)' }
      ] },
      { name: 'value', label: '值', type: 'text', required: true, description: '支持数字/布尔/字符串/null/{变量}花括号引用变量值/${var}_name内嵌写法需要多一个$' },
      { name: 'temporary', label: '临时变量', type: 'boolean', required: false, defaultValue: false, description: '仅在当前事件页内有效；且若被“可点击/可选中”的子命令写在 {变量} 中，会在绑定时固定为当前值。' }
    ]
  },
  {
    type: 'script' as any,
    name: '脚本',
    description: '仅文本脚本：支持 if/for/while，默认提供 setVar/getVar、rand/randInt、updateElement（不调用其他指令）',
    category: CommandCategory.SYSTEM,
    icon: '🧩',
    color: '#607D8B',
    parameters: [
      { name: 'code', label: '脚本文本', type: 'textarea', required: true, description: '可写 if/for/while 等。API: setVar/getVar/setTempVar, rand/randInt, updateElement, args。开启 unsafe=true 可用 E/RM。' },
      { name: 'unsafe', label: '启用自由模式（可操作元素属性）', type: 'boolean', required: false, defaultValue: false, description: '允许使用 E/RM（E.setPos/E.moveBy/E.setScale…），请确保脚本来源可信' }
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
      { name: 'condition.type', label: '条件类型', type: 'select', required: true, defaultValue: 'variable', options: [
        { value: 'variable', label: '变量' },
        { value: 'expression', label: '表达式' }
      ], description: '默认按“变量”比较，必要时使用表达式' },
      { name: 'condition.key', label: '变量名', type: 'text', required: false, placeholder: '例如: score', showIf: { path: 'condition.type', equals: 'variable' } },
      { name: 'condition.operator', label: '比较运算', type: 'select', required: false, defaultValue: 'eq', options: [
        { value: 'eq', label: '等于 (==)' },
        { value: 'ne', label: '不等于 (!=)' },
        { value: 'gt', label: '大于 (>)' },
        { value: 'lt', label: '小于 (<)' },
        { value: 'gte', label: '大于等于 (>=)' },
        { value: 'lte', label: '小于等于 (<=)' }
      ], description: '当类型为变量时生效', showIf: { path: 'condition.type', equals: 'variable' } },
      { name: 'condition.value', label: '比较值', type: 'text', required: false, placeholder: '例如: 10 / true / text', showIf: { path: 'condition.type', equals: 'variable' } },
      { name: 'condition.expression', label: '表达式', type: 'textarea', required: false, placeholder: '如需表达式，请在此编写：例如 getVal(\'score\') > 100', showIf: { path: 'condition.type', equals: 'expression' } }
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
    description: '跳转到指定指令ID（更稳，不受索引变动影响）',
    category: CommandCategory.FLOW_CONTROL,
    icon: '↗️',
    color: '#9C27B0',
    parameters: [
      {
        name: 'target',
        label: '目标指令ID',
        type: 'text',
        required: true,
        placeholder: '例如：cmd_xxx_yyy',
        description: '填写要跳转的指令ID（建议在指令树复制该ID粘贴）'
      }
    ]
  },
  {
    type: CommandType.LOOP,
    name: '循环',
    description: '无限循环（在循环体内自行用 IF_CONDITION + BREAK/JUMP 控制退出）',
    category: CommandCategory.FLOW_CONTROL,
    icon: '🔁',
    color: '#9C27B0',
    parameters: []
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
        label: '数据载荷(逗号分隔)',
        type: 'text',
        required: false,
        placeholder: '例如：\'apple\', 12, true',
        description: '使用逗号分隔参数，触发的事件页里时使用局部变量 $1..$n 来访问'
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

  // Generate predictable unique id: <type>_<counter>
  const typeKey = String(type).toLowerCase();
  const counters: any = (createNewCommand as any).__counters || ((createNewCommand as any).__counters = {});
  const next = (counters[typeKey] = (counters[typeKey] || 0) + 1);
  const genId = `${typeKey}_${next}`;

  return {
    id: genId,
    type,
    parameters,
    enabled: true,
    description: template.name
  };
}
