# Level Editor Prompt 指南（结构精确版）

本指南以现有演示项目 `00project/scene/*.json` 为基准，列出 Vibe 引擎能正确识别的关卡 JSON 结构、指令与事件写法。请在提示词中严格遵循以下格式，避免生成无法导入的内容。

---

## 1. 顶层 JSON 框架

一个场景文件的根节点必须包含下列字段，字段名及大小写不可更改：

```json
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
```

> 常见错误：将 `images`、`audios` 直接放在顶层数组，或使用 `schema` 的 URL；这些写法会导致加载失败。务必保持 `resources` 对象这一层级，并将 `schema` 写成 `"v2"`（与演示文件一致）。

---

## 2. level 对象结构

每个 `levels` 元素都遵循以下模板：

```json
{
  "id": "level-id",
  "name": "关卡名",
  "canvasWidth": 800,
  "canvasHeight": 600,
  "initialState": { "score": 0 },
  "commands": [ ... 主流程指令 ... ],
  "events": [ ... 并行事件，可选 ... ]
}
```

- `canvasWidth` / `canvasHeight` 必须是数字。
- `initialState` 若无变量可写 `{}`。
- `commands`、`events` 内的每条指令都必须使用 `id` + `type` + `parameters` 结构，详见下一节。

---

## 3. 指令写法与必填参数

### 3.1 通用规则

所有指令（无论在主流程、事件还是选项、交互子命令中）统一格式：

```json
{
  "id": "cmd-unique-id",
  "type": "SHOW_IMAGE",
  "parameters": { ... 对应指令参数 ... }
}
```

- `id`：建议使用 `snake-case`，须在本关内唯一。
- `type`：大小写固定，需与引擎支持的名称一致（如下表）。
- `parameters`：即使没有参数，也写成空对象 `{}`。某些指令（如 `if_condition`、`set_clickable`）`parameters`还会带有 `falseCommands`、`commands`、`trueCommands` 等子数组参数，是可以多次嵌套组成复杂逻辑的，但建议不超过4层。

### 3.2 资源展示类

| 指令 `type` | 必填参数（写在 `parameters` 内） | 备注与常用默认值 |
| --- | --- | --- |
| `SHOW_IMAGE` | `elementId`, `resourceId` | 可选：`position.{x,y}`, `size.{width,height}`, `zIndex`, `parentId`, `align` |
| `SHOW_TEXT` | `elementId`, `text` | 常用：`style.fontSize` 数字或字符串、`style.color`、`blocking` (默认 `false`)、`dismissOnContinue` (默认 `true`)、`backgroundResourceId` |
| `UPDATE_TEXT` | `elementId`, `text` | 用于更新已存在的文本元素内容 |
| `SET_ELEMENT_STYLE` | `elementId` | 通过 `style` 对象设置 `display`, `opacity` 等 |
| `SHOW_MEDIA` | `elementId`, `mediaType`, `resourceId` | `autoplay`, `loop`, `muted`, `controls` 等为可选字段 |

其中显示文本指令支持${gameState.gold} 这种嵌入变量，通常用于一些状态文字渲染如角色属性、倒计时等。

### 3.3 动画与特效

| 指令 `type` | 必填参数 | 可选参数 |
| --- | --- | --- |
| `ANIMATE_IN` | `elementId` | `preset`（示例：`scaleIn`、`fade`）、`duration` |
| `ANIMATE_LOOP` | `elementId` | `loopType`（如 `hoverY`、`pulse`）、`duration` |
| `FLIP_CARD` | `elementId`, `backResourceId` | `frontResourceId`, `showBack` (`true` 翻到背面, `false` 翻回正面), `duration`, `easing` |
| `firework_burst` | （无必填） | 常用：`elementId` / `elementIdVar`, `attachToId` / `attachToIdVar`, `resourceId`, `count`, `life`, `gravity`, `zIndex` |
| `MOVE_TO` | `elementId`, `x`, `y` | `duration`, `easing` |

### 3.4 交互与控件

| 指令 `type` | 必填参数 | 说明 |
| --- | --- | --- |
| `set_clickable` | `elementId` | 可选：`clickable`(默认 `true`)、`onClick` (`commands`/`flip`/`toggle_selected`)、`frontResourceId`, `backResourceId`, `showBack`, `effect`。若 `onClick` 为 `commands`，需提供 `"commands": [ ...子指令... ]` 子数组。|
| `SET_SELECTABLE` | `elementId` | 可选：`selectable`、`variableKey`、`overlayResourceId`、`effect`、并可定义 `onSelected` / `onCancelSelected` 子命令。|
| `SET_DRAGGABLE` | `elementId` | 可选：`draggable`、`dragType`。拖拽落下后的逻辑通过 `CHECK_IN_AREA` 或自定义事件处理。|
| `CHECK_IN_AREA` | `elementId`, `area.x`, `area.y`, `area.width`, `area.height` | 命中后可附带 `commands` 子数组。|
| `CHOICES` | `elementId` | 使用 `options` 数组定义按钮；每个选项包含 `id`, `text`, （可选）`commands`。`parameters.ui` 可设置按钮样式，如 `rowMax`, `fontSize`, `buttonSkinId`。|

### 3.5 音频与系统

| 指令 `type` | 必填参数 | 常用可选 |
| --- | --- | --- |
| `BGM_PLAY` | `musicId` | `volume`(0~1), `loop`(默认 `true`), `fadeIn` |
| `BGM_STOP` | （无） | `fadeOut` |
| `SE_PLAY` | `soundId` | `volume`, `loop`, `fadeIn`, `delay`, `interrupt` |
| `GAME_OVER` | `reason` | `message`, `resetGame` |
| `NEXT_LEVEL` | （无） | 用于主线推进 |
| `SCENE_REDIRECT` | `url` | 目标 JSON 路径，如 `scene/entry.json` |
| `set_variable` | `key`, `value` | `op` 默认 `set`，也支持 `add` / `sub` / `mul` / `div` ；`value` 可为数字、字符串、布尔或 `null` |

### 3.6 流程控制

| 指令 `type` | 必填参数 | 写法要点 |
| --- | --- | --- |
| `WAIT` | `duration` (毫秒) | |
| `if_condition` | `condition` | `condition` 可为：`{ "type": "variable", "key": "var", "operator": "eq", "value": 1 }` 。需要提供 `trueCommands`、`falseCommands` 子数组（可为空数组）。|
| `LOOP` | `condition` | 循环体写在 `commands` 子数组；如需跳出使用 `BREAK`。|
| `BREAK` | （可选）`condition` | 当条件满足时跳出最近的 `LOOP`；若省略 `condition`，立即跳出。|
| `EMIT_SIGNAL` | `signal` | 可额外携带 `data`（字符串或对象）。事件通过 `custom` 触发器监听该信号。|
| `JUMP_TO` | `targetIndex` | 指向主流程指令索引（从 0 开始）。|

---

## 4. 事件与触发器

`events` 数组中的每个对象：

```json
{
  "id": "event-countdown",
  "name": "开局倒计时",
  "triggers": [ { "type": "auto", "start": "immediate" } ],
  "commands": [ ... 与主流程相同格式的指令 ... ]
}
```

触发器写法：

- `auto`：关卡加载后自动执行。常用 `start: "immediate"`，也可以设置 `delay`（毫秒）。
- `custom`：等待 `EMIT_SIGNAL` 发出的自定义信号，需要填写 `target`。例如按钮点击命令内 `EMIT_SIGNAL` 的 `signal` 为 `"card_flipped"`，则事件 `triggers` 写 `{ "type": "custom", "target": "card_flipped" }`。
- `timer`（若需循环定时器）：`{ "type": "timer", "interval": 1000, "autoStart": true }` —— 请在提示词中明确要求时再生成。

事件内指令完全遵循第 3 节的格式，同样可以包含条件分支、音频、动画等。

---

## 5. 指令组合与经验提示

为便于在提示词中指导 LLM 选择最贴近需求的交互方案，可参考以下经验总结：

### 5.1 选项型交互的三种主流写法

1. **`CHOICES` 一次性展示多个按钮**
   - 适合剧情分支、问答选择等需要并排展示多个备选项的场景。
   - 在提示中明确 `options` 数组、每个选项的 `id`/`text`，以及选项被点击后要执行的 `commands`（若无可给空数组）。
   - 建议指定 `parameters.ui.rowMax`（默认 2）和 `parameters.ui.fontSize`（默认 24）以控制布局。

2. **图片 + `set_clickable` 构建自由布局按钮**
   - 当按钮需要自定义位置、尺寸、样式时，先用 `SHOW_IMAGE` 或 `SHOW_TEXT` 生成元素，再用 `set_clickable` 赋予点击逻辑。
   - 提示词中说明点击后执行 `onClick: "commands"` 并提供 `"commands": [ ... ]` 子数组；若仅需翻面效果，可使用 `onClick: "flip"` 并给出正反面资源。
   - 可选字段：`clickable`（默认 `true`）、`effect`（如 `scale`）。

3. **图片 + `SET_SELECTABLE` 实现单/多选状态**
   - 用于需要“选中保持状态”的选项（例如装备选择、收集卡牌）。
   - 提示中指明 `parameters.variableKey` 记录选中结果，指定 `onSelected` / `onCancelSelected` 子命令处理后续逻辑。
   - 可通过 `overlayResourceId` 或 `effect` 添加视觉反馈。

> 经验建议：若选项需要同时展示、一次性选择，优先 `CHOICES`；若需要高度定制位置或翻卡效果，优先 `set_clickable`；若要记忆选中状态并允许取消，选择 `SET_SELECTABLE`。

### 5.2 并行事件的使用策略

- **主流程保持线性**：将开场动画、剧情推进写在 `commands` 主数组内，便于阅读和调试。
- **把周期性或异步逻辑拆到 `events`**：例如倒计时、背景循环动画、监听自定义信号的得分结算等。
- **在提示中描述触发条件**：指出事件触发器类型及参数（`auto` + `delay`、`timer.interval`、`custom.target` 等），以及事件内需执行的关键指令。
- **避免指令冲突**：提醒模型确保同一元素不会同时在主流程和事件中被不同动画覆盖；必要时在事件中先调用 `SET_ELEMENT_STYLE` 或 `WAIT` 控制时机。
- **描述并行意图**：示例提示语——“使用 `auto` 事件在后台每 1 秒更新倒计时文本，同时主流程继续运行”；“在按钮点击的子命令里 `EMIT_SIGNAL`，由 `custom` 事件完成奖励动画”。

通过在提示词里体现上述经验，模型更容易挑选与目标玩法相符的指令组合。

---

## 5. 诊断示例：错误 vs 正确

| 问题 | 错误示例（来自模型输出） | 正确写法提示 |
| --- | --- | --- |
| 顶层资源结构错误 | `"images": [ {"id": "bg", "src": "..."} ]` | 改为 `"resources": { "images": [ ... ] }` |
| 指令缺少包装 | `{ "command": "SHOW_IMAGE", "resourceId": "bg" }` | 必须写 `{ "id": "show-bg", "type": "SHOW_IMAGE", "parameters": { "elementId": "bg", "resourceId": "bg" } }` |
| 更新文本 | `"command": "UPDATE_TEXT"` | 正确为 `"type": "UPDATE_TEXT"`，放在 `parameters.text` 内 |

---

## 6. Prompt 撰写建议

1. 在提示词开头明确要求输出“符合 Vibe 引擎 `schema: "v2"` 的完整 JSON 文件”，并强调 `resources` / `commands` / `events` 的结构。
2. 逐条描述主流程指令：
   - 给出元素 ID、资源 ID、坐标、尺寸、层级等具体数值。
   - 指明哪些指令需要子命令（例如 `set_clickable` 使用 `commands`，`CHOICES` 配置 `options`）。
3. 对变量与条件逻辑，直接给出示例表达式，如 `context.stateManager.getVariable('cards_matched') >= 2`。
4. 若需要事件，请在提示词中写明触发器种类与信号名称，例如：“创建 `custom` 事件监听 `card_flipped` 信号，处理得分结算”。
5. 告诉模型沿用统一命名规范（`card-1`、`score-text`、`event-card-flip` 等），确保所有引用一致。
6. 生成后检查：
   - 所有资源 ID 均存在于 `resources` 中。
   - 指令的 `parameters` 不为空缺字段。
   - 触发器与 `EMIT_SIGNAL` / `set_clickable` 子命令引用的信号、变量名前后一致。

通过遵循以上规范，可使大语言模型产出的 JSON 与 `00project/scene` 中的真实示例保持一致，从而被引擎顺利解析与运行。