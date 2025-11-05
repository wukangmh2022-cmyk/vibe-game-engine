export const PROMPT_GUIDE_INLINE = String.raw`# 指南

本指南以现有项目JSON为准，列出 Vibe 引擎能正确识别的关卡 JSON 结构、指令与事件写法。请在提示词中严格遵循以下格式，避免生成无法导入的内容。

---

## 1. 顶层 JSON 框架

一个场景文件的根节点必须包含下列字段，字段名及大小写不可更改：

【示例 JSON】
{
  "id": "scene-id",
  "name": "显示名称",
  "version": "1.0.0",
  "schema": "v2",
  "resources": {
    "images": [ { "id": "image-id", "src": "images/path.png" } ],
    "audios": [ { "id": "bgm-main", "src": "audios/bgm.mp3" } ]
    // 需要时再补充 animations / videos 等数组
  },
  "levels": [ { ... 单个关卡对象 ... } ]
}
【示例结束】

> 常见错误：将 images、audios 直接放在顶层数组，或使用 schema 的 URL；这些写法会导致加载失败。务必保持 resources 对象这一层级，并将 schema 写成 "v2"（与演示文件一致）。

---

## 2. level 对象结构

每个 levels 元素都遵循以下模板：

【示例 JSON】
{
  "id": "level-id",
  "name": "关卡名",
  "canvasWidth": 800,
  "canvasHeight": 600,
  "initialState": { "score": 0 },
  "commands": [ ... 主流程指令 ... ],
  "events": [ ... 并行事件，可选 ... ]
}
【示例结束】

- canvasWidth / canvasHeight 必须是数字。
- initialState 若无变量可写 {}。
- commands、events 内的每条指令都必须使用 id + type + parameters 结构，详见下一节。

> 注意：当前编辑器在加载后不会在关卡对象中保留 initialState 字段，使用“保存关卡”导出时也不会写回。若业务需要，请在导出 JSON 后自行合并该字段。

---

## 3. 指令写法与必填参数

    指令中的坐标参数都是基于画布左上角的，另外图片坐标的锚点是左上角。

### 3.1 通用规则

所有指令（无论在主流程、事件还是选项、交互子命令中）统一格式：

【示例 JSON】
{
  "id": "cmd-unique-id",
  "type": "SHOW_IMAGE",
  "parameters": { ... 对应指令参数 ... }
}
【示例结束】

- id：建议使用 snake-case，须在本关内唯一。
- type：大小写固定，需与引擎支持的名称一致（如下表）。
- parameters：即使没有参数，也写成空对象 {}。某些指令（如 IF_CONDITION、SET_CLICKABLE）parameters 还会带有 falseCommands、commands、trueCommands 等子数组参数，是可以多次嵌套组成复杂逻辑的，但建议不超过 4 层。
> 说明：SHOW_IMAGE 的 elementId/parentId 以及 position.x/position.y 支持写 "{var}"，会在运行时从变量中取值。

### 3.2 资源展示类

| 指令 type | 必填参数（写在 parameters 内） | 备注与常用默认值 |
| --- | --- | --- |
| SHOW_IMAGE | elementId, resourceId | 可选：position.{x,y}, size.{width,height}, zIndex, parentId, align, visible，以及动画：animation.entry.animId、animation.loop.animId |
| SHOW_TEXT | elementId, text | 常用：style.fontSize（建议写字符串如 "16px"）、style.color、blocking(默认 false，开启将独占交互)、dismissOnContinue(默认 true)、skinId（九宫格皮肤ID）、padding |
| UPDATE_TEXT | elementId, text | 更新已存在的文本元素内容 |
| SET_ELEMENT_STYLE | elementId | 通过 style.display = 'block|none'设置显(block)隐(none) |
| SHOW_MEDIA | elementId, mediaType, resourceId | 可选：autoplay, loop, muted, controls |

其中显示文本指令支持 \${gameState.gold} 这种嵌入变量，通常用于一些状态文字渲染如角色属性、倒计时等。
如提示中出现皮肤资源（type:"skin"），以下要求必须满足：
- SHOW_TEXT 应设置 skinId（如 dialog-default-9slice）并给出合理 padding。
- SHOW_CHOICES 应设置 parameters.ui.buttonSkinId 作为按钮皮肤；若无皮肤则可留空。
- 若存在多个皮肤，请选择与场景风格最贴近者（可依据皮肤命名/上下文描述进行匹配）。

### 3.3 动画与特效

| 指令 type | 必填参数 | 可选参数 |
| --- | --- | --- |
| ANIMATE_IN | elementId | preset（示例：scaleIn、fade）、duration |
| ANIMATE_LOOP | elementId | loopType（如 hoverY、pulse）、duration |
| FLIP_CARD | elementId, backResourceId | frontResourceId, showBack(true/false), duration, easing |
| FIREWORK_BURST | （无必填） | 常用：elementId（支持"{var}"）/ attachToId（支持"{var}"）, resourceId, count, life, gravity, zIndex |
| MOVE_TO | elementId, x, y | duration, easing |

### 3.4 交互与控件

| 指令 type | 必填参数 | 说明 |
| --- | --- | --- |
| SET_CLICKABLE | elementId | 可选：clickable(默认 true)、blocking(阻塞其他交互，直到子命令执行完)、onClick(commands/flip/toggle_selected)、frontResourceId, backResourceId, showBack, effect；若 onClick 为 commands，需提供 "commands": [ ...子指令... ] 子数组。|
| SET_SELECTABLE | elementId | 可选：selectable、variableKey、overlayResourceId、effect，并可定义 onSelected / onCancelSelected 子命令。|
| SET_DRAGGABLE | elementId | 可选：draggable（布尔）。拖拽落下后的逻辑通过 CHECK_IN_AREA 或自定义事件处理。|
| CHECK_IN_AREA | area.x, area.y, area.width, area.height | 命中后写入 last_drop_element_ID / last_drop_resource_ID，并执行 commands 子数组。|
| SHOW_CHOICES | elementId | 使用 options 数组定义按钮；每个选项包含 id, text, （可选）commands。blocking(默认 true，开启将独占交互)。支持多选：parameters.multiSelect=true 时，阻塞失效且点击后不自动消失，选中状态写入变量 sys_choice_N（N 从1开始）。parameters.ui 可设置按钮样式，如 rowMax, fontSize, buttonSkinId、selectedSkinId。|

### 3.5 音频与系统

| 指令 type | 必填参数 | 常用可选 |
| --- | --- | --- |
| BGM_PLAY | musicId | volume(0~1), loop(默认 true), fadeIn |
| BGM_STOP | （无） | fadeOut |
| SE_PLAY | soundId | volume, loop, fadeIn, delay, interrupt |
| NEXT_LEVEL | （无） | 用于主线推进 |
| SCENE_REDIRECT | url | 目标 JSON 路径，如 entry.json（将自动加 scene/ 前缀）或 this（重启当前场景） |
| SET_VARIABLE | key, value | op 默认 set，也支持 add / sub / mul / div；value 可为数字、字符串、布尔或 null |

### 3.6 流程控制

| 指令 type | 必填参数 | 写法要点 |
| --- | --- | --- |
| WAIT | duration(ms) |  |
| IF_CONDITION | condition | condition 支持两种：type:"variable"（需 key、operator、value），或 type:"expression"（写在 expression 字段）。需提供 trueCommands、falseCommands 子数组（可为空数组）。|
| LOOP | （无） | 循环体写在 commands 子数组；退出请在体内用 IF_CONDITION+BREAK 或 JUMP_TO。|
| BREAK | （可选）condition | 当条件满足时跳出最近的 LOOP；若省略 condition，立即跳出。|
| EMIT_SIGNAL | signal | 可额外携带 data（字符串或对象）。事件通过 custom 触发器监听该信号。|
| JUMP_TO | targetIndex | 指向主流程指令索引（从 0 开始）。|

### 3.7 补充规则（务必遵守）

- IF_CONDITION.condition 使用规范结构：{ type:"variable"|"expression", key, operator, value } 或 { type:"expression", expression }；不要混入 condition.variable。
- IF_CONDITION 条件推荐：优先使用变量型（布尔变量可作为“开关”使用），不要把简单等值判断写成 expression。错误示例：{ type:"expression", expression:"last_drop_element_ID == 'veg4'" }；正确示例：{ type:"variable", key:"last_drop_element_ID", operator:"eq", value:"veg4" }。
 - 如确需使用 expression：字符串判断支持 .includes()，例如 context.stateManager.getVariable('last_drop_element_ID').includes('veg')（本身已返回布尔值，可不写 === true）。在事件上下文中也可用 event.xxx。
 - 注意：expression 不会自动把裸变量名解析为状态变量，不能直接写 xxstring.includes('xx')；需通过 context.stateManager.getVariable('xxstring') 或 event.xxstring 获取再调用 includes。
- operator 仅可为 eq/ne/gt/lt/gte/lte；若出现 ==/!=/>/</>=/<=，请映射为上述枚举。
- SHOW_CHOICES 必须完整提供 parameters.ui 的关键字段：rowMax、gapX、gapY、fontSize、maxWidth、paddingX、paddingY、color、buttonSkinId（未指定请给出合理默认）。多选模式可选提供 selectedSkinId 作为选中态皮肤。
- 独占交互（顶层优先）：当下列任一成立时，将临时禁用其他元素的点击/拖拽，仅保留当前控件可交互，控件结束后恢复——
  - SHOW_TEXT: parameters.blocking === true
  - SHOW_CHOICES: parameters.blocking !== false（默认独占）
  - SET_CLICKABLE: parameters.blocking === true（直到其子命令全部执行完毕）
- SET_DRAGGABLE 仅接受 draggable（布尔）；不要输出未定义字段（如 dragType）。
- CHECK_IN_AREA 的 commands 表示“命中时”的子流程：
  - 可放到提交按钮（SET_CLICKABLE：onClick=commands）的子命令里统一检查；
  - 或者用 EMIT_SIGNAL + custom 事件，将检查逻辑解耦到事件（推荐在提示中写清触发关系）。
- 不再在 CHECK_IN_AREA 中传入元素 ID，使用系统变量 last_drop_element_ID / last_drop_resource_ID 即可得知当前命中的元素与资源。
- 拖拽命中后，判断正确投递资源ID后，建议更新 varCount 等变量；提交时只做汇总校验（例如 varCount>=2）。
- 可用系统变量：命中后 last_drop_element_ID、last_drop_resource_ID；切换选中时 lastChangingSelectStateID（SET_SELECTABLE 或 SET_CLICKABLE: toggle_selected 时）；点击时 lastClickID（SET_CLICKABLE）。
- 输出前删除未知字段与空壳对象，保持字段命名与类型严格符合模板。

### 3.8 资源与皮肤使用准则（示例）

【示例 JSON - 文本对话】
{
  "id": "dialog_1",
  "type": "SHOW_TEXT",
  "parameters": {
    "elementId": "dialog-1",
    "text": "欢迎进入关卡！",
    "style": { "fontSize": "20px", "color": "#000000" },
    "position": { "x": 0, "y": 0 },
    "skinId": "dialog-default-9slice",
    "padding": 20,
    "blocking": true,
    "dismissOnContinue": true
  }
}

【示例 JSON - 选项按钮】
{
  "id": "choices_1",
  "type": "SHOW_CHOICES",
  "parameters": {
    "elementId": "",
    "blocking": true,
    "position": { "x": 200, "y": 300 },
    "ui": {
      "rowMax": 1,
      "gapX": 16,
      "gapY": 12,
      "fontSize": 16,
      "maxWidth": 300,
      "paddingX": 12,
      "paddingY": 8,
      "color": "#ffffff",
      "buttonSkinId": "dialog-default-9slice"
    },
    "options": [ { "id": "opt-start", "text": "开始", "commands": [] } ]
  }
}

---

## 3.9 脚本指令（仅文本脚本）

用于在流程中执行一小段脚本来修改变量或元素属性（不调用其他指令）。支持 if/for/while 等原生语法。

【指令概览】
- type: "SCRIPT" 或 "script"
- parameters:
  - code: 必填，脚本文本
  - unsafe: 可选，布尔；为 true 时开放更多元素便捷接口

【脚本可用 API】
- 安全模式（默认）：
  - setVar(key, value), getVar(key)
  - rand(min, max), randInt(min, max)
  - updateElement(elementId, updates)
  - args（从 parameters.args 透传的对象）
- 不受限模式（unsafe=true）：在安全模式基础上，额外提供便捷元素接口 E：
  - E.get(id), E.exists(id)
  - E.pos(id) → { x, y }
  - E.setPos(id, x, y)
  - E.moveBy(id, dx, dy)
  - E.setVisible(id, bool)
  - E.setAlpha(id, a)
  - E.setScale(id, sx[, sy])
  - E.setZIndex(id, z)
  - 读取：
    - E.getPos(id) / E.pos(id) → { x, y }
    - E.getVisible(id) → boolean | undefined
    - E.getAlpha(id) → number | undefined
    - E.getScale(id) → { x, y } | undefined    // 渲染后缩放
    - E.getZIndex(id) → number | undefined
    - E.getRotation(id) → number | undefined   // 渲染后旋转
    - E.getSize(id) → { width, height } | undefined // 渲染后尺寸
    - E.getResourceId(id) → string | undefined
  - E.getFirstChild(id) → 返回第一个元素子节点（不存在则 undefined）
  - E.update(id, updates)

【示例 JSON - 随机定位已创建元素】
{
  "id": "place_random",
  "type": "SCRIPT",
  "parameters": {
    "unsafe": true,
    "code": "const id='actor_1'; E.setPos(id, randInt(0,1280), randInt(0,720));"
  }
}

【示例 JSON - 生成随机坐标写入变量】
{
  "id": "rand_xy",
  "type": "SCRIPT",
  "parameters": {
    "code": "setVar('randX', randInt(0,1280)); setVar('randY', randInt(0,720));"
  }
}

> 提醒：脚本仅用于便捷地设置变量或更新元素属性；不要在脚本内部尝试触发其他引擎指令。

---

## 4. 事件与触发器

events 数组中的每个对象：

【示例 JSON】
{
  "id": "event-countdown",
  "name": "开局倒计时",
  "triggers": [ { "type": "auto", "start": "immediate" } ],
  "commands": [ ... 与主流程相同格式的指令 ... ]
}
【示例结束】

触发器写法：
- auto：关卡加载后自动执行。常用 start:"immediate"，也可以设置 delay（毫秒）。
- custom：等待 EMIT_SIGNAL 发出的自定义信号，需要填写 target。例如按钮点击命令内 EMIT_SIGNAL 的 signal 为 "card_flipped"，则事件 triggers 写 { "type": "custom", "target": "card_flipped" }。
- timer：当前编辑器未提供该触发器，请勿生成。

事件内指令完全遵循第 3 节的格式，同样可以包含条件分支、音频、动画等。

---

## 5. 指令组合与经验提示

为便于在提示词中指导 LLM 选择最贴近需求的交互方案，可参考以下经验总结：

### 5.1 选项型交互（基于文字的选择）

- 常用指令：SHOW_TEXT（题干/提示）、SHOW_CHOICES（选项）、SET_VARIABLE（记分/记录选择）、WAIT（节奏控制）。
- 模式建议：
  1) SHOW_TEXT 显示题干/说明（blocking=true，dismissOnContinue=true）。
  2) SHOW_CHOICES 显示选项，务必完整提供 parameters.ui：rowMax、gapX、gapY、fontSize、maxWidth、paddingX、paddingY、color、buttonSkinId。
  3) 在每个选项的 commands 内编写后续逻辑（如加分/跳转下一题/显示反馈文本）。
  4) 必要时用 SET_VARIABLE 记录选择结果或累计得分。

### 5.2 拖拽/点选分类（二分类/多分类）

- 常用指令：SHOW_IMAGE、SET_ELEMENT_STYLE、ANIMATE_IN、SET_DRAGGABLE、CHECK_IN_AREA、SET_VARIABLE、IF_CONDITION、SHOW_TEXT。
- 模式建议：
  1) SHOW_IMAGE 批量创建待分类元素。
  2) 进入游戏后：对每个元素执行 SET_ELEMENT_STYLE(display:"block") + ANIMATE_IN；然后对每个元素 SET_DRAGGABLE(draggable:true)。
  3) “提交”交互：
     - 方案A：提交按钮（SHOW_IMAGE）+ SET_CLICKABLE(onClick=commands)，在其 commands 内、使用 CHECK_IN_AREA可以监听不同的资源ID落入此区域（命中目标区域时执行子命令，根据last_drop_element_ID、last_drop_resource_ID变量可获取元素ID、资源ID）。
  4) 最后用 IF_CONDITION（例如 varCount >= 目标数量）判断是否完成，true 分支显示胜利文本 + NEXT_LEVEL，false 分支显示失败提示。
  5) CHECK_IN_AREA可用系统变量 last_drop_element_ID / last_drop_resource_ID；若用 SET_SELECTABLE 或 SET_CLICKABLE(toggle_selected) 进行点选/选中，切换时会写入系统变量：lastChangingSelectStateID；若用 SET_CLICKABLE 进行点击（onClick 任意），点击时会写入：lastClickID。

### 5.3 翻牌/记忆类（翻卡匹配）

- 常用指令：SHOW_IMAGE（卡牌正反面资源）、SET_CLICKABLE（onClick:"flip" 或 "toggle_selected"）、SET_VARIABLE、IF_CONDITION、ANIMATE_IN、WAIT。
- 模式建议：
  1) SHOW_IMAGE 创建网格卡牌，正面图为卡面，背面图为统一背板。
  2) 对每张卡牌 SET_CLICKABLE（onClick:"flip" + frontResourceId/backResourceId；或 onClick:"toggle_selected"）。
  3) 当翻开两张卡牌：使用记录的两张卡牌 ID 进行匹配判断（IF_CONDITION）。成功：SET_VARIABLE 累计 matchedCount，并对两张卡牌做 ANIMATE_IN/SET_ELEMENT_STYLE(display:"none")；失败：WAIT 后翻回。
  4) 所有临时状态都用 SET_VARIABLE 记录（例如 firstCardId/secondCardId/matchedCount），条件判断只读这些变量。

> 提醒：以上三类只是模板，生成时按“用户需求 + 资源 + 规范”综合选择；不要输出分析说明，只输出最终的 commands JSON。`;

export default PROMPT_GUIDE_INLINE;
