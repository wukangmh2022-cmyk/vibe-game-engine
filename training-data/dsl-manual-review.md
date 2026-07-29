# VGE-DSL/1 人工语义审查台账

规则：逐条阅读用户 query、资源目录和 DSL。`PASS` 只表示本轮人工语义审查通过。所有修订必须按 sample ID 手工给出，禁止规则批量改写。

最终准入是双门槛，缺一不可：

1. 人工语义审查确认 query、资源、控制流和可见行为一致。
2. 修订后的样本逐条通过 DSL parse、DSL→JSON 编译、静态校验和真实 runtime。

任何 runtime 失败项都不得进入 train/validation；runtime 通过也不能覆盖人工发现的语义缺陷。

最终人工审查及二次语义复审覆盖记录 1–1334，零缺号、零重复：`PASS 677`、`DSL_FIX 196`、`QUERY_FIX 76`、`BOTH_FIX 333`、`EXCLUDE 52`。605 个可修样本均已按 sample ID 显式写入修复台账；52 个无法可靠自包含的样本明确排除。

最终正式视图为 1282 条：DSL parse 与 serialize→reparse 结构往返全部通过，静态硬错误为 0，真实 JS runtime 为 `1282/1282`。二次复审修正了 BGM/SE 资源角色、立即覆盖文本、伪交互、死分支和无依据阈值；逐批“尚未应用修订”文字保留首轮审查时点含义，最终准入状态以本段、repair ledger、manifest 和 quality report 为准。

资源引用复审：共发现 47 个空资源引用，分布在 34 条样本；19 个非空但未在该条 asset catalog 声明的引用，分布在 19 条样本。另有 42 条样本的 catalog 使用纯下划线资源 ID。空资源参数必须省略，未声明资源必须删除或补入真实 catalog；纯下划线 ID 在修订时改为逐样本语义别名，并同步更新 catalog、DSL 和 runtime 资源映射。

状态：`PASS`、`QUERY_FIX`、`DSL_FIX`、`BOTH_FIX`、`EXCLUDE`。

## Batch 001：记录 1–50

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 1 | phase1-g0000 | BOTH_FIX | “描述”文件位于音效目录，不应作为 BGM；改用真实项目 BGM 资源并同步修正任务。 |
| 2 | phase1-g0002 | PASS | 先显示失败弹窗再调整透明度/缩放，顺序一致。 |
| 3 | phase1-g0004 | BOTH_FIX | 原 query 没给过渡时长，DSL 又瞬时隐藏；补齐两阶段时长并用真实离场动画。 |
| 4 | phase1-g0005 | PASS | 等待 800ms 一致。 |
| 5 | phase1-g0008 | DSL_FIX | 只递增 `focusIndex`，没有任何焦点元素或切换行为，未实现“焦点一个个切换”。 |
| 6 | phase1-g0010 | BOTH_FIX | 原答案臆造衣橱主题且立即覆盖首句；query 明确两段文案与停留时间。 |
| 7 | phase1-g0011 | DSL_FIX | `JUMP_ID win_flow` 是补丁外悬空目标；该 query 可直接用 `NEXT` 表达进入通关页面。 |
| 8 | phase1-g0012 | DSL_FIX | 保留 800ms，删除未给出的音量、循环、淡入、延迟和打断参数。 |
| 9 | phase1-g0013 | BOTH_FIX | BGM 播放后立即停止，不能表达“庆祝结束后”；query 应给出庆祝时长，DSL 在该时长后停止。 |
| 10 | phase1-g0015 | DSL_FIX | 原答案臆造衣橱主题和大量样式；改成通用通关文案。 |
| 11 | phase1-g0016 | DSL_FIX | “弹出提示文案”被实现为无人监听的 `SIGNAL toast`，且 data 多包了一层引号；应创建可见 TEXT 或提供完整事件。 |
| 12 | phase1-g0017 | PASS | 加分、门槛和 NEXT 一致。 |
| 13 | phase1-g0018 | BOTH_FIX | “游戏结束”位于音效目录且用于短促失败反馈，应使用 SE 而不是 BGM。 |
| 14 | phase1-g0019 | PASS | 显示、移动、样式强调的轨迹一致。 |
| 15 | phase1-g0020 | PASS | 全屏蒙层尺寸和资源一致。 |
| 16 | phase1-g0022 | PASS | 弹窗后样式强化一致。 |
| 17 | phase1-g0024 | DSL_FIX | 三张图片在 LOOP 每轮被重复创建；应在循环前创建一次，循环内只切换样式并更新轮次。 |
| 18 | phase1-g0028 | BOTH_FIX | 原答案立即改写，首节拍不可见；query 补 1000ms，DSL 加 WAIT。 |
| 19 | phase1-g0029 | BOTH_FIX | 跳转目标只是设置 `combo_celebrated`，没有“播放庆祝节奏”；无音频资源时 query 不应声称播放，或必须补真实资源与播放命令。 |
| 20 | phase1-g0030 | PASS | 单次系统提示音一致。 |
| 21 | phase1-g0031 | BOTH_FIX | “游戏结束”是短促结算音效；改为 SE 并保留 1200ms 可感知阶段。 |
| 22 | phase1-g0032 | BOTH_FIX | query 未给门槛却硬编码 3 且滥用 IFEXPR；明确 3 后改用普通 IF。 |
| 23 | phase1-g0033 | DSL_FIX | query 明确“一直重复”，DSL 只有一次显示、等待、提示，没有 LOOP 或可重复事件。 |
| 24 | phase1-g0034 | EXCLUDE | 要求重新开始当前关卡，但输入没有真实场景 URL 或既有流程上下文；不得伪造目标。 |
| 25 | phase1-g0035 | PASS | 单步加 2 分一致。 |
| 26 | phase1-g0036 | BOTH_FIX | “游戏结束”位于音效目录且用于短促离场反馈，应使用 SE。 |
| 27 | phase1-g0038 | PASS | 弹窗、等待和指定红色提示顺序一致。 |
| 28 | phase1-g0040 | PASS | 图片显示后放大并提高层级。 |
| 29 | phase1-g0041 | PASS | 音效后等待 400ms。 |
| 30 | phase1-g0045 | PASS | 跳转入口场景技能培训页与 URL/level 参数一致。 |
| 31 | phase1-g0049 | BOTH_FIX | 背景氛围必须引用真实 BGM，而不是系统音效；保留 3000ms 播放阶段和淡出。 |
| 32 | phase1-g0050 | PASS | 单一 NEXT 与需求一致。 |
| 33 | phase1-g0054 | BOTH_FIX | “游戏结束”是短促错误反馈音效，应使用 SE。 |
| 34 | phase1-g0055 | PASS | 显示、移动、透明度轨迹一致。 |
| 35 | phase1-g0058 | PASS | 蒙层创建和透明度刷新一致。 |
| 36 | phase1-g0001 | BOTH_FIX | 自递归重复会阻塞 runtime；query 改为抵达中央后持续悬浮，用内置 ANIM_LOOP 表达。 |
| 37 | phase1-g0014 | PASS | 正确数加一、门槛和 NEXT 一致。 |
| 38 | phase1-g0026 | BOTH_FIX | query 未给轮播内容；补三条具体提示，循环更新文本并在 3 条后退出。 |
| 39 | phase1-g0037 | PASS | 资源揭示、移动和放大一致。 |
| 40 | phase1-g0042 | BOTH_FIX | query 没给出几条提示的内容；DSL 反复显示同一图片，不是“几条提示轮流出现”。需补具体提示内容并逐条更新。 |
| 41 | phase1-g0046 | BOTH_FIX | 原 TEXT 后立即 TEXT_SET，初始提示不可见且没有分支触发；补两个真实选项。 |
| 42 | phase1-g0048 | PASS | 音效和 800ms 停留一致。 |
| 43 | phase1-g0052 | DSL_FIX | 分支行为成立，但包含 6 个空动画 `animId`；空 entry/loop 块必须删除。 |
| 44 | phase1-g0053 | PASS | 正确数、门槛和 NEXT 一致。 |
| 45 | phase1-g0056 | DSL_FIX | IMAGE 的 animation 引用了未在 asset catalog 中提供的 `___4`，属于资源幻觉；应删除该动画或补真实资源。 |
| 46 | phase1-g0064 | BOTH_FIX | 原 query 未给具体步骤且 DSL 立即覆盖首句；明确两段文案和 800ms 停留。 |
| 47 | phase1-g0065 | EXCLUDE | `ambient-tick` 是补丁外目标，而训练 query 没提供现有命令上下文；不能作为独立监督样本。 |
| 48 | phase1-g0066 | PASS | 错误提示音和 500ms 停顿一致。 |
| 49 | phase1-g0067 | BOTH_FIX | 掌声误用 BGM，且“淡出结束”指代含糊；改为单次 SE 后等待 500ms。 |
| 50 | phase1-g0068 | PASS | 分数累加、门槛和 NEXT 一致。 |

Batch 001 汇总：`PASS 32`、`DSL_FIX 12`、`BOTH_FIX 5`、`EXCLUDE 1`、`QUERY_FIX 0`。本批尚未应用修订。

## Batch 002：记录 51–100

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 51 | phase1-g0070 | DSL_FIX | 删除未要求的状态变量、音效默认参数和弹窗精确尺寸，只保留条件内三项反馈。 |
| 52 | phase1-g0071 | PASS | 加 10、30 分门槛和 NEXT 一致。 |
| 53 | phase1-g0072 | BOTH_FIX | “问题”语音是焦点提示音效，不是背景音乐；改用 SE。 |
| 54 | phase1-g0073 | PASS | 图片从左向右移动并降低透明度。 |
| 55 | phase1-g0076 | PASS | 时钟显示后降低不透明度并加橙色边框。 |
| 56 | phase1-g0077 | PASS | 掌声后等待 500ms。 |
| 57 | phase1-g0082 | BOTH_FIX | 原答案立即覆盖首句且猜测大量样式；query 补 800ms，DSL 只保留文案切换。 |
| 58 | phase1-g0083 | EXCLUDE | `correct_feedback` 是补丁外目标，query 未提供现有命令上下文，不能作为独立监督样本。 |
| 59 | phase1-g0084 | PASS | 音效后等待 800ms。 |
| 60 | phase1-g0085 | BOTH_FIX | loop BGM 下一行立即淡出停止；query 必须给出可执行的播放时长/停止触发，再补等待或事件。 |
| 61 | phase1-g0086 | PASS | 减分后按当前分数判断 NEXT，与明确需求一致。 |
| 62 | phase1-g0087 | BOTH_FIX | 初始分类状态会被立即覆盖；补 800ms 可见阶段后再更新。 |
| 63 | phase1-g0089 | PASS | 加分、6 分门槛和 NEXT 一致。 |
| 64 | phase1-g0091 | PASS | 分数图标显示、上移和放大提亮一致。 |
| 65 | phase1-g0092 | PASS | 时钟资源及两个已声明动画资源均匹配。 |
| 66 | phase1-g0094 | PASS | 蓝色药品显示后缩放和提高层级。 |
| 67 | phase1-g0095 | PASS | 仅等待 1500ms，符合已有胜利弹窗播放期间的局部 patch。 |
| 68 | phase1-g0047 | QUERY_FIX | query 必须明确本轮固定获得 10 分，DSL 本身可保留。 |
| 69 | phase1-g0051 | PASS | 文本创建后按指定绿色大字高亮。 |
| 70 | phase1-g0074 | DSL_FIX | IMAGE 引用了目录外动画 `_____6`；删除动画引用或补真实 animation 资源。 |
| 71 | phase1-g0090 | BOTH_FIX | 背景氛围必须引用真实 BGM，不能把描述语音当作音乐。 |
| 72 | phase1-g0102 | BOTH_FIX | 倒计时 3 秒会被立即覆盖；等待 1000ms 后再显示 2 秒。 |
| 73 | phase1-g0103 | PASS | 连击加一、门槛和 NEXT 一致。 |
| 74 | phase1-g0104 | PASS | 记忆分数加一、门槛和 NEXT 一致。 |
| 75 | phase1-g0105 | DSL_FIX | “播放一次掌声”应使用 `SE`，不应把掌声当 `BGM`；音量保留 0.7。 |
| 76 | phase1-g0106 | PASS | 物品显示并移动到目标分类位置。 |
| 77 | phase1-g0107 | DSL_FIX | 循环动画有效，但同时携带空 entry `animId`，必须删除空动画块。 |
| 78 | phase1-g0109 | PASS | 勾选图标显示、移动、放大高亮一致。 |
| 79 | phase1-g0110 | PASS | 600ms 离场等待一致。 |
| 80 | phase1-g0111 | DSL_FIX | 一次性门闩不能在入口重置；首次显示后递增，后续执行保持为 1，避免重复亮出。 |
| 81 | phase1-g0113 | BOTH_FIX | query 未提供五件农具资源，DSL 也只递增索引，没有显示任何农具；需要具体资源/文本后逐件展示。 |
| 82 | phase1-g0114 | PASS | 进度、门槛和明确场景/level 重定向一致。 |
| 83 | phase1-g0115 | BOTH_FIX | 初始进度会被立即覆盖；补 800ms 可见阶段。 |
| 84 | phase1-g0116 | BOTH_FIX | 进度固定为 3 后跳回同一个永真 IF，会形成无状态变化的跳转循环；必须定义刷新步骤和终止/复位条件。 |
| 85 | phase1-g0117 | PASS | 分数图、400ms 等待和掌声顺序一致。 |
| 86 | phase1-g0118 | BOTH_FIX | 倒计时背景音乐改用真实 BGM，并保留明确 3000ms 生命周期。 |
| 87 | phase1-g0120 | PASS | 单条分支说明文本一致。 |
| 88 | phase1-g0121 | QUERY_FIX | “在‘这一关’这一关”是模板残留，应改成自然用户表达；DSL 正确。 |
| 89 | phase1-g0122 | PASS | 引导进度、门槛和 NEXT 一致。 |
| 90 | phase1-g0123 | BOTH_FIX | 循环背景音乐改用真实 BGM，不能把系统提示音循环伪装成音乐。 |
| 91 | phase1-g0124 | PASS | 重试图片显示并移动到盘子 A 坐标。 |
| 92 | phase1-g0125 | PASS | 单独显示胜利弹窗。 |
| 93 | phase1-g0127 | DSL_FIX | 原透明度默认已为 1，再设为 1 没有提亮变化；初始降低透明度，移动后恢复为 1 并放大。 |
| 94 | phase1-g0128 | PASS | 失败弹窗后等待 800ms。 |
| 95 | phase1-g0131 | PASS | 初始化、每轮递增、达到 4 后 BREAK，循环有界。 |
| 96 | phase1-g0132 | EXCLUDE | 要求重载本场景，但输入没有真实场景 URL；不得用 `this` 或虚构 URL 监督模型。 |
| 97 | phase1-g0133 | BOTH_FIX | query 未说明增加多少分，DSL 却猜成 10；明确答对加 10 分并留出首帧可见时间。 |
| 98 | phase1-g0134 | EXCLUDE | `success_beat` 是补丁外目标且无现有命令上下文，不能作为独立监督样本。 |
| 99 | phase1-g0135 | PASS | 单次掌声音效一致。 |
| 100 | phase1-g0136 | BOTH_FIX | 分支阶段背景音乐改用真实 BGM；删除无法由资源保证的“紧张”风格描述。 |

Batch 002 汇总：`PASS 33`、`DSL_FIX 6`、`BOTH_FIX 7`、`QUERY_FIX 2`、`EXCLUDE 2`。本批尚未应用修订。

## Batch 003：记录 101–150

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 101 | phase1-g0138 | PASS | 农具展示、800ms 停顿和观察提示一致。 |
| 102 | phase1-g0139 | PASS | 分数加一、门槛和 NEXT 一致。 |
| 103 | phase1-g0140 | PASS | 单步清零重试次数一致。 |
| 104 | phase1-g0141 | BOTH_FIX | query 说“稍等片刻”，DSL 却立即淡出；需明确时长并 WAIT，掌声也更适合 SE。 |
| 105 | phase1-g0142 | PASS | 物品显示后移出右侧画布。 |
| 106 | phase1-g0143 | DSL_FIX | 删除未声明动画引用后仍缺“弹到”的可见动作；改用内置 scaleIn，再停留 800ms。 |
| 107 | phase1-g0145 | PASS | 牛图移动、缩小和半透明消除状态一致。 |
| 108 | phase1-g0146 | PASS | 问号图、停顿和文字提示一致。 |
| 109 | phase1-g0147 | DSL_FIX | 文本从 0 开始但 `cnt` 未初始化；应先 `VAR cnt = 0`，再进入有界循环。 |
| 110 | phase1-g0149 | BOTH_FIX | 循环门槛 5 必须写进 query，不能用模糊“目标”掩盖 DSL 数值。 |
| 111 | phase1-g0150 | EXCLUDE | 要求重开当前关，但输入没有真实场景 URL，无法构造自包含正确答案。 |
| 112 | phase1-g0151 | BOTH_FIX | 两段庆祝文案同帧覆盖，首句不可见；明确停留 800ms 后再更新。 |
| 113 | phase1-g0152 | EXCLUDE | `pass-branch` 是未提供上下文的外部目标。 |
| 114 | phase1-g0153 | PASS | 胜利弹窗、600ms 停顿、掌声顺序一致。 |
| 115 | phase1-g0154 | BOTH_FIX | 持续背景音乐改用真实 BGM，并保留明确 tutorial_finished 停止边界。 |
| 116 | phase1-g0155 | PASS | 单步 NEXT 一致。 |
| 117 | phase1-g0156 | PASS | 重试文字创建后改为橙色大字。 |
| 118 | phase1-g0157 | PASS | 加分、门槛和 NEXT 一致。 |
| 119 | phase1-g0158 | PASS | 设置 3 分后判断并 NEXT。 |
| 120 | phase1-g0159 | BOTH_FIX | 描述语音应作为 SE 播放；保留 reveal_finished 信号停止边界。 |
| 121 | phase1-g0160 | PASS | 失败弹窗显示后移动到中上区域。 |
| 122 | phase1-g0161 | PASS | 虫子从左侧移动到右侧目标点。 |
| 123 | phase1-g0163 | DSL_FIX | 图片默认透明度已为 1，末尾再设 1 没有提亮变化；初始降低透明度，移动后恢复为 1 并放大。 |
| 124 | phase1-g0164 | PASS | 问题提示图后等待 800ms。 |
| 125 | phase1-g0165 | PASS | 每轮先检查 100 分门槛，否则加 10，循环有界。 |
| 126 | phase1-g0168 | PASS | 设置答对数、等于 3 后跳到明确场景。 |
| 127 | phase1-g0169 | BOTH_FIX | 首句结算文案会被立即覆盖；规范字号并补 800ms 可见阶段。 |
| 128 | phase1-g0170 | EXCLUDE | `tutorial-hint-start` 是外部命令，训练输入未提供现有命令上下文。 |
| 129 | phase1-g0171 | PASS | 云图、600ms 等待和循环环境音一致。 |
| 130 | phase1-g0172 | BOTH_FIX | 重试阶段背景音乐改用真实 BGM，并保留 retry_confirmed 停止边界。 |
| 131 | phase1-g0176 | PASS | 扣 10 后按 60 分门槛 NEXT。 |
| 132 | phase1-g0177 | BOTH_FIX | 描述语音不是背景音乐；改用 SE 并保留 round_settled 停止边界。 |
| 133 | phase1-g0178 | PASS | 物品显示并移动到中央。 |
| 134 | phase1-g0179 | PASS | 进度图上移、放大、高亮。 |
| 135 | phase1-g0181 | PASS | 分数图上移并调整缩放/透明度。 |
| 136 | phase1-g0182 | BOTH_FIX | query 有“《这一关》这一关”模板残留；DSL 还混入多余 `id` 参数，应同时清理。 |
| 137 | phase1-g0186 | PASS | 分数、门槛和明确入口场景跳转一致。 |
| 138 | phase1-g0187 | BOTH_FIX | 首句环境文案会被立即覆盖；补 800ms 可见阶段。 |
| 139 | phase1-g0188 | EXCLUDE | `retry_start` 是未提供上下文的外部目标。 |
| 140 | phase1-g0189 | PASS | 对勾、350ms 等待和掌声一致。 |
| 141 | phase1-g0192 | BOTH_FIX | 初始答错提示会被立即覆盖；补 800ms 可见阶段。 |
| 142 | phase1-g0193 | PASS | 设置进度 3 后判断并 NEXT。 |
| 143 | phase1-g0194 | PASS | 记忆分数加一、6 分门槛和 NEXT。 |
| 144 | phase1-g0195 | BOTH_FIX | “掌声背景音乐”是不自然且错误的能力描述；应改成单次掌声音效并使用 SE。 |
| 145 | phase1-g0196 | PASS | 提示图显示并移动到目标位置。 |
| 146 | phase1-g0197 | DSL_FIX | 图片默认透明度已为 1，末尾再设 1 没有提亮变化；初始降低透明度，再放大并恢复为 1。 |
| 147 | phase1-g0199 | PASS | 食材图显示、滑动、放大提层级。 |
| 148 | phase1-g0204 | PASS | 系统音效后等待 400ms。 |
| 149 | phase1-g0207 | BOTH_FIX | 初始分数会被立即覆盖；补 800ms 可见阶段。 |
| 150 | phase1-g0202 | BOTH_FIX | 核对文案会被立即覆盖；规范字号并补 800ms 可见阶段。 |

Batch 003 汇总：`PASS 34`、`DSL_FIX 4`、`BOTH_FIX 7`、`QUERY_FIX 2`、`EXCLUDE 3`。本批尚未应用修订。

## Batch 004：记录 151–200

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 151 | phase1-g0215 | PASS | 答对后等待 1500ms。 |
| 152 | phase1-g0212 | PASS | 引导底板显示后调整透明度和缩放。 |
| 153 | phase1-g0210 | BOTH_FIX | 问诊语音不应循环作为背景音乐；分支阶段改用真实 BGM。 |
| 154 | phase1-g0223 | BOTH_FIX | “过一会儿”没有时长，DSL 立即淡出；应明确等待时长，掌声宜使用 SE。 |
| 155 | phase1-g0220 | BOTH_FIX | 首个焦点提示会被立即覆盖；删除空资源并补 800ms 可见阶段。 |
| 156 | phase1-g0206 | PASS | 提示进度、3 分门槛和 NEXT。 |
| 157 | phase1-g0307 | BOTH_FIX | 两段资源揭示文案同帧覆盖；明确首句显示 1000ms 后再更新。 |
| 158 | phase1-g0315 | BOTH_FIX | 将掌声称为背景音乐并用 BGM 不自然；改为单次掌声音效 SE。 |
| 159 | phase1-g0302 | PASS | 题卡、1.2 秒观察和顺序提示一致。 |
| 160 | phase1-g0301 | PASS | 弹窗从画布下方 600ms 上移、放大置前。 |
| 161 | phase1-g0306 | DSL_FIX | 条件可由普通 IF 直接表达，不应违反 Guidance 滥用 IFEXPR；保留加分、门槛和入口跳转。 |
| 162 | phase1-g0313 | PASS | 设置 80 分并判断 NEXT。 |
| 163 | phase1-g0309 | DSL_FIX | IMAGE 引用目录外动画 `___4`；删除或补真实资源。 |
| 164 | phase1-g0312 | BOTH_FIX | 首句顺序提示会被立即覆盖；补 800ms 可见阶段。 |
| 165 | phase1-g0317 | DSL_FIX | 胜利 IMAGE 引用目录外动画 `_____3`；当前 catalog 只有弹窗图片。 |
| 166 | phase1-g0320 | PASS | 重试前等待 900ms。 |
| 167 | phase1-g0314 | PASS | 匹配进度、3 分门槛和 NEXT。 |
| 168 | phase1-g0325 | BOTH_FIX | 派对状态更新应由 query 明确的 party_started signal 触发。 |
| 169 | phase1-g0331 | PASS | 连击计数、5 次门槛和 NEXT。 |
| 170 | phase1-g0328 | BOTH_FIX | 问题语音是一次性刷新提示，应使用 SE 并保留 800ms 反馈阶段。 |
| 171 | phase1-g0333 | BOTH_FIX | 游戏结束文件是短促结算音效，应使用 SE 并保留 1200ms 反馈阶段。 |
| 172 | phase1-g0319 | DSL_FIX | 位移和淡化缩小成立，但 query 明确要求“一直重复”和漂浮闪烁；需补持续 pulse 动画。 |
| 173 | phase1-g0316 | PASS | 果图显示并移动到水果篮。 |
| 174 | phase1-g0341 | BOTH_FIX | DSL 自己把 `syncState` 从 0 改为 1，并没有等待外部物品准备事件；query 和程序必须定义真实 readiness 信号。 |
| 175 | phase1-g0339 | DSL_FIX | elementId 使用 `{wardrobe_reveal_idx}` 插值，但只有 TEXT 支持插值；应展开为合法稳定元素 ID 或使用同一元素更新。 |
| 176 | phase1-g0337 | PASS | 红色药品显示、滑动、放大提亮。 |
| 177 | phase1-g0349 | PASS | 进度加一、门槛和 NEXT。 |
| 178 | phase1-g0345 | PASS | 得分时单次掌声。 |
| 179 | phase1-g0324 | EXCLUDE | 要求重载本关但输入未提供真实场景 URL，不能构造自包含监督答案。 |
| 180 | phase1-g0355 | PASS | 小笼包显示、移动和样式轨迹一致。 |
| 181 | phase1-g0327 | PASS | 勾选图、400ms 和系统音效一致。 |
| 182 | phase1-g0326 | EXCLUDE | `focus-shift-ready` 是未提供上下文的外部目标。 |
| 183 | phase1-g0353 | PASS | 对勾、500ms 和指定正确提示一致。 |
| 184 | phase1-g0365 | PASS | 单步 NEXT。 |
| 185 | phase1-g0363 | PASS | 胜利弹窗、400ms 和掌声一致。 |
| 186 | phase1-g0373 | DSL_FIX | 图片默认透明度已为 1，末尾再设 1 没有提高；初始降低透明度，移动后恢复为 1 并放大。 |
| 187 | phase1-g0334 | DSL_FIX | 未给果图左侧起点和移动时长，无法形成“从左侧移动到右侧”的引导轨迹。 |
| 188 | phase1-g0361 | BOTH_FIX | 规范字号，并由 answer_correct signal 触发得分更新。 |
| 189 | phase1-g0335 | DSL_FIX | 语义正确且动画已声明，但 IMAGE 混入多余 `id` 参数，应删除。 |
| 190 | phase1-g0371 | PASS | 食材显示并移动到目标位置。 |
| 191 | phase1-g0330 | PASS | TEXT 中 `{countdown}` 插值合法，位置和内容一致。 |
| 192 | phase1-g0332 | PASS | 每次加一且等于 3 后 NEXT，与门槛语义一致。 |
| 193 | phase1-g0381 | PASS | 胜利弹窗、400ms 和掌声一致。 |
| 194 | phase1-g0379 | BOTH_FIX | 连击升级应由 combo_five signal 触发，不能立即覆盖 x2。 |
| 195 | phase1-g0369 | BOTH_FIX | 掌声被写成 BGM 且立即淡出；应使用 SE，若要求持续则明确反馈时长。 |
| 196 | phase1-g0342 | PASS | 焦点进度、6 分门槛和明确入口第 2 关。 |
| 197 | phase1-g0387 | BOTH_FIX | 描述语音属于揭示提示音，应使用 SE 并保留结束事件。 |
| 198 | phase1-g0389 | PASS | 食材显示、移动、半透明放大。 |
| 199 | phase1-g0350 | PASS | 单步设置引导提示标记。 |
| 200 | phase1-g0343 | BOTH_FIX | 药品进度更新应由 medicine_checked signal 触发。 |

Batch 004 汇总：`PASS 35`、`DSL_FIX 7`、`BOTH_FIX 7`、`QUERY_FIX 0`、`EXCLUDE 1`。本批尚未应用修订。

## Batch 005：记录 201–250

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 201 | phase1-g0397 | BOTH_FIX | 结算完成文案应由 settlement_finished signal 触发。 |
| 202 | phase1-g0351 | BOTH_FIX | 派对背景音乐应引用真实 BGM 资源，不能循环系统提示音。 |
| 203 | phase1-g0352 | QUERY_FIX | “目标位置”未在 query 中定义却硬编码坐标；改为明确向下移动 80 像素回到待分类位置。 |
| 204 | phase1-g0346 | BOTH_FIX | 系统提示音用于一次计时节拍，应使用 SE 而不是循环 BGM。 |
| 205 | phase1-g0360 | EXCLUDE | 要求重新加载当前场景但输入未提供真实 URL。 |
| 206 | phase1-g0366 | BOTH_FIX | query 有“在‘这一关’这一关”残留，style 的 `fontSize:"26px"` 也应规范。 |
| 207 | phase1-g0368 | PASS | 正确次数、3 次门槛和 NEXT，未达标自然留在本关。 |
| 208 | phase1-g0374 | PASS | 羽绒服、800ms 和指定提示一致。 |
| 209 | phase1-g0382 | BOTH_FIX | 描述语音属于引导提示音，应使用 SE 并保留结束事件。 |
| 210 | phase1-g0367 | PASS | 进度加一、3 分门槛和 NEXT。 |
| 211 | phase1-g0398 | BOTH_FIX | 进度固定为 3 后跳回永真 IF，形成无状态变化跳转循环；需定义后续步骤和终止条件。 |
| 212 | phase1-g0370 | PASS | 水果显示后移动到画布外。 |
| 213 | phase1-g0364 | BOTH_FIX | 路径选择阶段的持续背景音乐改用真实 BGM，并保留选择完成事件。 |
| 214 | phase1-g0402 | BOTH_FIX | 问诊语音用于一次刷新提示，应使用 SE 并保留 800ms 等待。 |
| 215 | phase1-g0400 | QUERY_FIX | 无图片资源可用于显示；query 改为在 towel/soap 状态间切换。 |
| 216 | phase1-g0404 | PASS | 时钟显示、移动、放大强调一致。 |
| 217 | phase1-g0406 | QUERY_FIX | “在《这一关》这一关”模板残留；按钮图片和放大行为正确。 |
| 218 | phase1-g0403 | PASS | 胶囊滑到分数区后缩小半透明。 |
| 219 | phase1-g0401 | PASS | 设置进度 3 后 NEXT。 |
| 220 | phase1-g0413 | PASS | LABEL 绑定进度加一，低于 3 时回跳，最终可退出。 |
| 221 | phase1-g0414 | PASS | 系统音效后等待 800ms。 |
| 222 | phase1-g0408 | BOTH_FIX | `tutorial_done` 没有任何玩家交互会把它设为 1，循环永不退出；需完整点击/信号路径。 |
| 223 | phase1-g0422 | PASS | 红色药选项显示后放大提亮。 |
| 224 | phase1-g0421 | DSL_FIX | 图片默认透明度已为 1，末尾再设 1 没有提高；初始降低透明度，上移后恢复为 1 并放大。 |
| 225 | phase1-g0412 | BOTH_FIX | 修正模板文案后仍立即覆盖；补 800ms 离场过渡。 |
| 226 | phase1-g0430 | BOTH_FIX | 修正文案后，由 result_checked signal 触发判定结果，避免立即覆盖。 |
| 227 | phase1-g0419 | PASS | 加 10、50 分门槛和 NEXT。 |
| 228 | phase1-g0512 | DSL_FIX | query 明确中央展示，但 IMAGE 无布局；补居中尺寸和坐标，保留 800ms 辨认时间。 |
| 229 | phase1-g0507 | BOTH_FIX | 问题语音是一次性导航提示，应使用 SE 并保留 800ms 阶段。 |
| 230 | phase1-g0500 | EXCLUDE | `question-round-start` 是无上下文外部命令。 |
| 231 | phase1-g0509 | PASS | 星星上移到分数区后缩小淡出。 |
| 232 | phase1-g0526 | PASS | 农具显示并在 800ms 内移动到中央。 |
| 233 | phase1-g0517 | BOTH_FIX | 两段答对反馈同帧覆盖；明确首句停留 700ms 后再更新。 |
| 234 | phase1-g0529 | PASS | 胜利弹窗滑到中央后放大提亮。 |
| 235 | phase1-g0522 | BOTH_FIX | 初始提示位于上方且同帧被覆盖；改为中部显示 1000ms 后再切换焦点文案。 |
| 236 | phase1-g0530 | QUERY_FIX | “这一关这一关”模板重复；WAIT 1500 正确。 |
| 237 | phase1-g0525 | BOTH_FIX | 掌声不应称为背景音乐或使用 BGM；改为单次 SE。 |
| 238 | phase1-g0538 | BOTH_FIX | 问诊语音是焦点切换提示，应使用 SE 并保留 800ms 阶段。 |
| 239 | phase1-g0537 | PASS | 状态图、400ms 和系统音效一致。 |
| 240 | phase1-g0516 | EXCLUDE | query 文本损坏且要求重载当前场景，输入又没有真实 URL，无法可靠修复。 |
| 241 | phase1-g0534 | PASS | 规划得分、门槛和明确入口场景。 |
| 242 | phase1-g0519 | DSL_FIX | “弹出来”缺少入场效果；补内置 scaleIn 后保留 500ms 与音效。 |
| 243 | phase1-g0606 | PASS | 系统音效和 800ms 重试等待。 |
| 244 | phase1-g0605 | EXCLUDE | `ambient_loop` 是未提供上下文的外部目标。 |
| 245 | phase1-g0604 | BOTH_FIX | “先弹出再改写”却同帧覆盖；明确首句与操作说明并停留 800ms。 |
| 246 | phase1-g0614 | PASS | 星星显示、移动、放大提亮。 |
| 247 | phase1-g0607 | BOTH_FIX | 答对后的系统反馈属于一次性 SE。 |
| 248 | phase1-g0613 | PASS | 蝴蝶标记移动并放大提亮。 |
| 249 | phase1-g0622 | BOTH_FIX | 两段重试提示同帧覆盖；明确首句停留 800ms 后再更新。 |
| 250 | phase1-g0630 | BOTH_FIX | 描述语音是一次性提示，应使用 SE 并保留 1000ms 阶段。 |

Batch 005 汇总：`PASS 28`、`DSL_FIX 1`、`BOTH_FIX 14`、`QUERY_FIX 5`、`EXCLUDE 2`。本批尚未应用修订。

## Batch 006：记录 251–300

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 251 | phase1-g0611 | PASS | 进度加一、3 分门槛和 NEXT。 |
| 252 | phase1-g0612 | BOTH_FIX | 描述语音是一次性题面提示，应使用 SE。 |
| 253 | phase1-g0629 | PASS | 设置进度 3 并 NEXT。 |
| 254 | phase1-g0608 | PASS | 衣橱进度、门槛和 NEXT。 |
| 255 | phase1-g0646 | DSL_FIX | 两个提示都用无人监听的 `SIGNAL toast`，data 还多一层引号；应使用可见 TEXT 或完整事件。 |
| 256 | phase1-g0616 | PASS | 时钟显示后缩放和透明度强调。 |
| 257 | phase1-g0624 | PASS | 游戏结束音效后等待 800ms。 |
| 258 | phase1-g0627 | BOTH_FIX | 服药状态更新应由 medication_synced signal 触发。 |
| 259 | phase1-g0635 | PASS | 结算等待 1500ms。 |
| 260 | phase1-g0632 | PASS | 时钟显示后放大提层级。 |
| 261 | phase1-g0645 | BOTH_FIX | query 有“在‘这一关’的这一关”残留，style 的 `fontSize:"24px"` 也应规范。 |
| 262 | phase1-g0617 | PASS | 掌声后等待 500ms。 |
| 263 | phase1-g0631 | PASS | 蝴蝶移动到计分区后缩小变淡。 |
| 264 | phase1-g0643 | BOTH_FIX | 描述语音不应循环作 BGM；改用 SE 并保留状态事件。 |
| 265 | phase1-g0705 | PASS | 每轮先检查 10 分门槛，否则加 2，循环有界。 |
| 266 | phase1-g0700 | PASS | 失败弹窗显示并移动到中央。 |
| 267 | phase1-g0704 | PASS | 问题图展示并等待 800ms。 |
| 268 | phase1-g0703 | PASS | 星星移动到进度区后放大提亮。 |
| 269 | phase1-g0701 | PASS | 药柜图显示并移动到右侧。 |
| 270 | phase1-g0711 | PASS | 盘子、400ms 和循环环境音一致。 |
| 271 | phase1-g0712 | BOTH_FIX | 问诊语音属于重试提示音效，不应循环作 BGM。 |
| 272 | phase1-g0721 | DSL_FIX | 语义正确，但 IMAGE 混入多余 `id` 参数。 |
| 273 | phase1-g0709 | BOTH_FIX | 修正文案与字号后，由 result_checked signal 触发通关结果。 |
| 274 | phase1-g0710 | EXCLUDE | `show-drag-guide` 是无现有命令上下文的外部目标。 |
| 275 | phase1-g0715 | DSL_FIX | 条件行为成立，但莴笋图片携带空 entry/loop `animId`，必须删除。 |
| 276 | phase1-g0708 | PASS | 消除得分、门槛和明确入口场景。 |
| 277 | phase1-g0729 | QUERY_FIX | “在《这一关》这一关”模板残留；DSL 的莴笋、500ms 和掌声正确。 |
| 278 | phase1-g0719 | PASS | 数字图移动、放大提亮。 |
| 279 | phase1-g0718 | PASS | 蓝色药品从左侧移动到中央。 |
| 280 | phase1-g0737 | DSL_FIX | 统一使用 Guidance/runtime 已验证的 STYLE scale/alpha，避免训练非规范 transform/opacity 写法。 |
| 281 | phase1-g0727 | QUERY_FIX | 实际只做一次环境文案切换，并非“一直重复”；应删除模板化循环措辞。 |
| 282 | phase1-g0717 | BOTH_FIX | 描述语音属于咨询提示音效，应使用 SE 并保留结束事件。 |
| 283 | phase1-g0726 | EXCLUDE | 要求重启本关但输入没有真实场景 URL，不能构造自包含答案。 |
| 284 | phase1-g0745 | PASS | 核对文本、600ms 和正确反馈更新。 |
| 285 | phase1-g0735 | BOTH_FIX | “掌声背景音乐”应改成掌声音效并使用 SE。 |
| 286 | phase1-g0728 | BOTH_FIX | 先把 `retry_score` 清零再判断是否为 3，条件永远不成立；query 的重试计分生命周期也需重写。 |
| 287 | phase1-g0716 | PASS | 扣 1 后按 3 分门槛 NEXT。 |
| 288 | phase1-g0723 | PASS | 临时计数清零、递增、4 次后 BREAK。 |
| 289 | phase1-g0753 | BOTH_FIX | 掌声被当 BGM 且下一行立即淡出；应使用 SE 或明确持续时长。 |
| 290 | phase1-g0734 | PASS | 焦点进度设 3 后 NEXT。 |
| 291 | phase1-g0736 | PASS | 蓝色药品显示并移动到药柜目标。 |
| 292 | phase1-g0739 | DSL_FIX | 原 IMAGE 没有中央起点，无法保证从中央上移；补位置、尺寸和最终完全显示。 |
| 293 | phase1-g0751 | PASS | 进度加一、3 分门槛和 NEXT。 |
| 294 | phase1-g0800 | PASS | 单步 NEXT。 |
| 295 | phase1-g0802 | DSL_FIX | 提示通过无人监听 `SIGNAL toast`，并非玩家可见反馈；改为 TEXT 或完整事件。 |
| 296 | phase1-g0806 | PASS | 失败弹窗滑到中央。 |
| 297 | phase1-g0804 | BOTH_FIX | 游戏结束资源是一次性离场音效，应使用 SE。 |
| 298 | phase1-g0805 | PASS | 食材滑到锅底后放大。 |
| 299 | phase1-g0808 | PASS | 药柜显示后放大提高层级。 |
| 300 | phase1-g0814 | BOTH_FIX | “玩家可选分支”不能只改文字；必须生成真实 CHOICES 和分支状态。 |

Batch 006 汇总：`PASS 34`、`DSL_FIX 4`、`BOTH_FIX 9`、`QUERY_FIX 2`、`EXCLUDE 1`。本批尚未应用修订。

## Batch 007：记录 301–350

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 301 | phase1-g0803 | PASS | score 加一、3 分门槛和 NEXT。 |
| 302 | phase1-g0801 | BOTH_FIX | query 有“《这一关》这一关”残留，style 的 `fontSize:"24px"` 需规范；环境文本和半透明语义正确。 |
| 303 | phase1-g0822 | BOTH_FIX | 游戏结束资源是一次性答错音效，应使用 SE。 |
| 304 | phase1-g0816 | PASS | 描述音效后等待 1.5 秒。 |
| 305 | phase1-g0815 | EXCLUDE | `tick` 是无现有命令上下文的外部目标。 |
| 306 | phase1-g0824 | PASS | 小笼包从侧边滑到中央并放大提层级。 |
| 307 | phase1-g0809 | PASS | 系统音效后等待 500ms。 |
| 308 | phase1-g0832 | DSL_FIX | 文本更新一致，但 `skinId=""` 是空资源引用，必须省略。 |
| 309 | phase1-g0840 | BOTH_FIX | 持续背景音乐应引用真实 BGM，不能循环系统提示音。 |
| 310 | phase1-g0821 | PASS | 设置揭示数 3 后 NEXT。 |
| 311 | phase1-g0817 | BOTH_FIX | 描述语音不应循环作环境 BGM；改用 SE 并保留结束事件。 |
| 312 | phase1-g0823 | PASS | 食材移动后设半透明。 |
| 313 | phase1-g0838 | DSL_FIX | 答错流程成立，但弹窗携带空 loop `animId`，必须删除空资源引用。 |
| 314 | phase1-g0818 | QUERY_FIX | “为‘这一关’这一关”模板残留；DSL 的计分和 NEXT 正确。 |
| 315 | phase1-g0826 | PASS | 指引图显示后降低透明度并放大。 |
| 316 | phase1-g0856 | DSL_FIX | 分支资源有效，但两个图片各携带空 loop `animId`，必须删除。 |
| 317 | phase1-g0839 | QUERY_FIX | “在‘这一关’的这一关”模板残留；进度和 NEXT 正确。 |
| 318 | phase1-g0834 | PASS | 游戏结束音效后等待 800ms。 |
| 319 | phase1-g0833 | BOTH_FIX | 达到 3 后回跳且进度不复位，会无限加分回跳；query 和控制流需定义终止目标。 |
| 320 | phase1-g0837 | BOTH_FIX | 删除模板残留，并由 resource_collected signal 触发收集状态。 |
| 321 | phase1-g0845 | PASS | 单步等待 700ms。 |
| 322 | phase1-g0842 | PASS | 提示框显示后放大提高层级。 |
| 323 | phase1-g0900 | EXCLUDE | 只要求刷新当前场景却未提供真实 URL。 |
| 324 | phase1-g0905 | QUERY_FIX | “在‘这一关’这一关里”模板残留；NEXT 正确。 |
| 325 | phase1-g0903 | DSL_FIX | “弹出”只有静态 IMAGE；补 scaleIn 入场后再等待和播放掌声。 |
| 326 | phase1-g0906 | PASS | 引导文本后调整字号和颜色。 |
| 327 | phase1-g0911 | PASS | 喷雾剂显示并移动到货架。 |
| 328 | phase1-g0902 | QUERY_FIX | “在《这一关》这一关中”模板残留；LABEL/JUMP 累计到 6 可终止。 |
| 329 | phase1-g0907 | PASS | 环境轮次计分、3 分门槛和 NEXT。 |
| 330 | phase1-g0914 | PASS | 分类物品、800ms 和焦点提示一致。 |
| 331 | phase1-g0908 | PASS | 包子进度、门槛和 NEXT。 |
| 332 | phase1-g0913 | PASS | 小笼包移动后放大半透明。 |
| 333 | phase1-g0904 | BOTH_FIX | 问诊分支阶段的背景音乐改用真实 BGM，并保留确认事件。 |
| 334 | phase1-g0919 | BOTH_FIX | 连击升级应由 combo_five signal 触发。 |
| 335 | phase1-g0922 | BOTH_FIX | 问诊语音属于讲解提示，不应循环作 BGM；改用 SE。 |
| 336 | phase1-g0910 | PASS | 黄色药剂右滑出画布。 |
| 337 | phase1-g0901 | BOTH_FIX | 规范字号，并由 answer_correct signal 触发得分更新。 |
| 338 | phase1-g0927 | BOTH_FIX | 问诊语音属于揭示提示，不应循环作 BGM；改用 SE。 |
| 339 | phase1-g0921 | QUERY_FIX | “为《这一关》这一关”模板残留；弹窗、800ms 和掌声正确。 |
| 340 | phase1-g0915 | PASS | 进度每轮加一并在 5 时 BREAK。 |
| 341 | phase1-g0918 | PASS | 节拍分数、3 分门槛和明确场景第 9 关。 |
| 342 | phase1-g0929 | QUERY_FIX | “在‘这一关’这一关中”模板残留；毛巾归位动画正确。 |
| 343 | phase1-g0909 | BOTH_FIX | 掌声被当 BGM 且立即停止；应使用 SE 或明确反馈时长。 |
| 344 | phase1-g0938 | EXCLUDE | `tutorial_hint_done` 是无上下文外部目标。 |
| 345 | phase1-g0946 | PASS | 药柜显示并移动到中央。 |
| 346 | phase1-g0937 | QUERY_FIX | “为《这一关》这一关”及占位文案残留；应与实际“记忆衣橱”文本对齐。 |
| 347 | phase1-g0926 | PASS | 设置本轮得分 3 并 NEXT。 |
| 348 | phase1-g0931 | PASS | 蓝色药品移动到进度区并放大。 |
| 349 | phase1-g0920 | EXCLUDE | `correct-choice-feedback` 是无上下文外部目标。 |
| 350 | phase1-g0945 | BOTH_FIX | 顺序记忆阶段的持续背景音乐应引用真实 BGM，不能循环问诊语音。 |

Batch 007 汇总：`PASS 28`、`DSL_FIX 5`、`BOTH_FIX 7`、`QUERY_FIX 7`、`EXCLUDE 3`。本批尚未应用修订。

## Batch 008：记录 351–400

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 351 | phase1-g0954 | EXCLUDE | 要求返回本场景但输入没有真实 URL。 |
| 352 | phase1-g0943 | PASS | 包子进度、3 个门槛和 NEXT。 |
| 353 | phase1-g0928 | PASS | 失败弹窗从上方滑到中央。 |
| 354 | phase1-g0962 | PASS | score 加一、3 分门槛和 NEXT。 |
| 355 | phase1-g0208 | BOTH_FIX | query 没说明 30 秒或具体分支；DSL 只等待一次，既不递减也不是计时节拍。 |
| 356 | phase1-g0258 | QUERY_FIX | “反馈音效/背景音”含糊，应明确为掌声音效；SE 后 500ms 行为可保留。 |
| 357 | phase1-g0344 | BOTH_FIX | 达到 3 后只跳到清零变量，未实现“展示下一轮提示”；需要具体提示刷新命令。 |
| 358 | phase1-g0356 | DSL_FIX | 等待时长正确，但未实现 query 明确要求的画面中央布局；补居中尺寸和坐标。 |
| 359 | phase1-g0338 | DSL_FIX | query 明确“短暂出现”，原答案等待后从不隐藏药品；应淡出后再显示收纳提示。 |
| 360 | phase1-g0348 | PASS | 粉色药片、600ms 和分支提示一致。 |
| 361 | phase1-g0375 | PASS | 进度低于 3 时递增，达到后 BREAK。 |
| 362 | phase1-g0380 | EXCLUDE | `tick` 是无上下文外部目标，query 也没有具体目标语义。 |
| 363 | phase1-g0362 | EXCLUDE | `timer-beat` 是无现有命令上下文的外部目标。 |
| 364 | phase1-g0424 | QUERY_FIX | 开头缺字“央创建”，应为“在画面中央创建”；DSL 行为正确。 |
| 365 | phase1-g0425 | QUERY_FIX | query 补齐等待 1000ms 的用途；DSL 可保留。 |
| 366 | phase1-g0417 | BOTH_FIX | 进度 100% 应由 progress_synced signal 触发。 |
| 367 | phase1-g0420 | BOTH_FIX | 资源 `___2` 是掌声，却被当计时 BGM；需使用真实背景音资源或改成提示音效。 |
| 368 | phase1-g0435 | BOTH_FIX | query 没给文案，DSL 擅自生成“分数变化已发生”，输入图片资源也未使用。 |
| 369 | phase1-g0434 | BOTH_FIX | query 没给分数值和门槛，DSL 擅自设置 100、阈值 50 并 NEXT。 |
| 370 | phase1-g0440 | PASS | 单张引导图片使用已声明资源。 |
| 371 | phase1-g0438 | BOTH_FIX | 分支选择的背景音乐应引用真实 BGM，而不是问诊语音。 |
| 372 | phase1-g0442 | BOTH_FIX | query 开头缺“在画面中”，DSL 还混入多余 `id` 参数。 |
| 373 | phase1-g0437 | PASS | 设置连击 3 并 NEXT。 |
| 374 | phase1-g0439 | DSL_FIX | MOVE 没有时长会瞬移，无法形成 query 要求的结算动画；补移动时长并在抵达后缩放。 |
| 375 | phase1-g0448 | BOTH_FIX | 删除多余参数，并给首句焦点提示 800ms 可见阶段。 |
| 376 | phase1-g0450 | PASS | 单次音效符合局部提示刷新要求。 |
| 377 | phase1-g0451 | BOTH_FIX | 分数变化是一次性系统反馈，应使用 SE 而不是循环 BGM。 |
| 378 | phase1-g0455 | PASS | 单步设置通关标记。 |
| 379 | phase1-g0453 | PASS | 胜利图、600ms 和庆祝文字一致。 |
| 380 | phase1-g0457 | BOTH_FIX | query 过度泛化且声称环境循环；DSL 只有一次移动/样式，两个 animation 资源也未使用。 |
| 381 | phase1-g0449 | EXCLUDE | `victory-checkpoint` 是无现有命令上下文的外部目标。 |
| 382 | phase1-g0452 | PASS | 设置 80 分并 NEXT。 |
| 383 | phase1-g0458 | DSL_FIX | 语义正确，但 IMAGE 混入多余 `id` 参数。 |
| 384 | phase1-g0456 | BOTH_FIX | 问诊语音用于一次新手引导提示，应使用 SE。 |
| 385 | phase1-g0466 | BOTH_FIX | 补齐位置后，首句仍会被立即覆盖；增加 800ms 可见阶段。 |
| 386 | phase1-g0465 | EXCLUDE | query 未给跳转目标，答案又是非规范伪 URL，无法可靠修复。 |
| 387 | phase1-g0461 | PASS | 掌声后等待 500ms。 |
| 388 | phase1-g0460 | BOTH_FIX | 补回中央位置描述；原图刚显示即隐藏，没有可见离场，改用 scaleOut 动画缩小并隐藏。 |
| 389 | phase1-g0468 | PASS | 提示音后等待 500ms。 |
| 390 | phase1-g0471 | QUERY_FIX | query 补齐结算文案和视觉规格；DSL 可保留。 |
| 391 | phase1-g0470 | DSL_FIX | NEXT 不支持 `targetLevelKey`；query 只要求下一关，应删除伪参数。 |
| 392 | phase1-g0469 | BOTH_FIX | 掌声资源被作为循环欢快 BGM，且下一行立即 stop；资源和生命周期都不成立。 |
| 393 | phase1-g0473 | PASS | 环境轮次积分加一、3 分门槛和 NEXT。 |
| 394 | phase1-g0467 | BOTH_FIX | 达到 3 后回跳计分会无新答题直接加到 4；不是“处理后续答题”，需真实答题事件边界。 |
| 395 | phase1-g0474 | BOTH_FIX | 短促重试提示属于 SE，不应使用 BGM。 |
| 396 | phase1-g0475 | PASS | 胜利图从下方到中央并略透明。 |
| 397 | phase1-g0478 | PASS | 失败弹窗显示后半透明置前。 |
| 398 | phase1-g0476 | QUERY_FIX | “目标位置”未定义却硬编码坐标；明确目标为左上角 (100,100)，保留图片显示与移动。 |
| 399 | phase1-g0484 | BOTH_FIX | query 未给具体文案/时长；DSL 擅自生成内容，TEXT 的 `duration` 也不是该命令标准参数。 |
| 400 | phase1-g0486 | PASS | 选择确认音效后等待 300ms。 |

Batch 008 汇总：`PASS 24`、`DSL_FIX 4`、`BOTH_FIX 15`、`QUERY_FIX 4`、`EXCLUDE 3`。本批尚未应用修订。

## Batch 009：记录 401–450

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 401 | phase1-g0487 | BOTH_FIX | “播放一段”与“立即停止”矛盾，掌声资源也不应作 BGM；改为 SE 或给明确时长。 |
| 402 | phase1-g0485 | EXCLUDE | `se_play_2` 是无上下文外部目标，query 也未说明跳转语义。 |
| 403 | phase1-g0488 | QUERY_FIX | 完成门槛 1 必须写进 query。 |
| 404 | phase1-g0492 | BOTH_FIX | 游戏结束文件是一次性离场音效，应使用 SE。 |
| 405 | phase1-g0491 | PASS | 积分加一、1 分门槛和 NEXT。 |
| 406 | phase1-g0496 | BOTH_FIX | query 未说明两个元素、颜色或位置，DSL 擅自生成一整套焦点视觉。 |
| 407 | phase1-g0493 | PASS | 药柜左侧滑到中央后放大提亮。 |
| 408 | phase1-g0494 | DSL_FIX | 语义正确，但 IMAGE 混入多余 `id` 参数。 |
| 409 | phase1-g0497 | PASS | 确认音效后等待 500ms。 |
| 410 | phase1-g0501 | PASS | 成功图、500ms 和掌声。 |
| 411 | phase1-g0508 | QUERY_FIX | “目标位置”未定义却硬编码 (400,200)；明确为上方目标位 (400,200)，保留图片显示与移动。 |
| 412 | phase1-g0502 | BOTH_FIX | 问诊语音属于提示音效，应使用 SE 并保留离场停止事件。 |
| 413 | phase1-g0506 | PASS | 完成数加一、等于 4 后 NEXT。 |
| 414 | phase1-g0524 | PASS | 提示进度加一、3 分门槛和 NEXT。 |
| 415 | phase1-g0511 | DSL_FIX | 原图片没有初始坐标，无法验证“向上移动”；补下方起点和上方目标位，保留放大与略透明。 |
| 416 | phase1-g0527 | PASS | 星星显示后放大提层级。 |
| 417 | phase1-g0523 | QUERY_FIX | 完成值和通关门槛 100 必须写进 query。 |
| 418 | phase1-g0535 | BOTH_FIX | 明确文案后，由 resource_found signal 触发资源发现更新。 |
| 419 | phase1-g0540 | PASS | 指定操作提示文本一致。 |
| 420 | phase1-g0543 | BOTH_FIX | 掌声资源被当欢快 BGM，且下一行立即停止；庆祝时长也未定义。 |
| 421 | phase1-g0536 | EXCLUDE | `wrong-feedback` 是无上下文外部目标。 |
| 422 | phase1-g0542 | PASS | 节拍进度加一、10 次门槛和 NEXT。 |
| 423 | phase1-g0545 | PASS | 单张胜利弹窗与要求一致。 |
| 424 | phase1-g0547 | DSL_FIX | 运动轨迹成立，但图片同时携带空 entry/loop `animId`，必须删除。 |
| 425 | phase1-g0548 | PASS | 失败面板后等待 1 秒。 |
| 426 | phase1-g0541 | QUERY_FIX | query 补齐 120 分和 100 分门槛；DSL 可保留。 |
| 427 | phase1-g0553 | BOTH_FIX | query 没给文本内容，DSL 擅自生成“关卡1/状态已同步”。 |
| 428 | phase1-g0544 | PASS | 农具从左候选移动到右目标。 |
| 429 | phase1-g0555 | PASS | 单次系统提示音。 |
| 430 | phase1-g0552 | EXCLUDE | 要求重试当前场景但没有真实场景 URL。 |
| 431 | phase1-g0554 | BOTH_FIX | LABEL 回到“重新设为 3”，条件永真，形成无限跳转；需真实后续焦点步骤和终止条件。 |
| 432 | phase1-g0556 | BOTH_FIX | 描述语音属于刷新提示音效，应使用 SE 并保留结束事件。 |
| 433 | phase1-g0559 | BOTH_FIX | query 要求庆祝，答案却直接 NEXT；补明确庆祝文案、600ms 展示与跳关。 |
| 434 | phase1-g0560 | PASS | 单步设置分支选择状态。 |
| 435 | phase1-g0562 | BOTH_FIX | query 只说“做个图片”，未指定资源、起终点；DSL 擅自决定实现细节。 |
| 436 | phase1-g0563 | QUERY_FIX | 开头缺“在画面中央”；衣物、1 秒和文案正确。 |
| 437 | phase1-g0558 | QUERY_FIX | 开头缺“在画面中央”；药图、1 秒和倒计时文案正确。 |
| 438 | phase1-g0570 | EXCLUDE | 要求重置当前场景焦点但没有真实场景 URL。 |
| 439 | phase1-g0566 | DSL_FIX | IMAGE 多余 `id`，style `fontSize:"28px"` 应规范。 |
| 440 | phase1-g0571 | BOTH_FIX | 分类完成边界未提供，答案同帧覆盖；改为明确 800ms 后完成下一次分类并刷新。 |
| 441 | phase1-g0561 | BOTH_FIX | 掌声资源被当庆祝 BGM，且“结算结束”没有事件边界。 |
| 442 | phase1-g0574 | BOTH_FIX | 系统节拍资源是 SE；可循环播放但应由 timer_finished 停止。 |
| 443 | phase1-g0573 | PASS | 成功图、400ms 和得分音效。 |
| 444 | phase1-g0576 | PASS | 分支提示后改成橙色大字。 |
| 445 | phase1-g0565 | PASS | 成功图滑到中央后放大提亮。 |
| 446 | phase1-g0577 | PASS | 积分设 100 后 NEXT。 |
| 447 | phase1-g0578 | PASS | 引导进度加一、3 次门槛和 NEXT。 |
| 448 | phase1-g0579 | BOTH_FIX | 持续环境背景音乐应引用真实 BGM，并保留停止事件。 |
| 449 | phase1-g0581 | PASS | 衣物显示并移动到右侧收纳位。 |
| 450 | phase1-g0572 | BOTH_FIX | 每次回跳都会重新设为 80，条件永真；需定义刷新步骤和终止状态。 |

Batch 009 汇总：`PASS 27`、`DSL_FIX 5`、`BOTH_FIX 14`、`QUERY_FIX 2`、`EXCLUDE 2`。本批尚未应用修订。

## Batch 010：记录 451–500

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 451 | phase1-g0575 | PASS | 单步 NEXT。 |
| 452 | phase1-g0584 | DSL_FIX | 语义正确，但 IMAGE 混入多余 `id` 参数。 |
| 453 | phase1-g0590 | EXCLUDE | `timer-beat` 是无现有命令上下文的外部目标。 |
| 454 | phase1-g0580 | PASS | 农具从左下移动到中央。 |
| 455 | phase1-g0591 | PASS | 成功图、500ms 和掌声。 |
| 456 | phase1-g0588 | DSL_FIX | expression 没有使用 `getVar`，随后又 `SCENE this`；条件读取和场景跳转都不可靠。 |
| 457 | phase1-g0589 | BOTH_FIX | 获得金币文案同帧不可见；明确停留 800ms 后再显示分数变化。 |
| 458 | phase1-g0596 | PASS | 重试得分设 3 后 NEXT。 |
| 459 | phase1-g0592 | BOTH_FIX | 掌声资源不适合作轻快 BGM，“玩家选择后”也缺事件边界。 |
| 460 | phase1-g0583 | DSL_FIX | 默认 alpha=1，原答案改成 0.9 实际是变暗；先设半透明，抵达后升到 1。 |
| 461 | phase1-g0597 | BOTH_FIX | 掌声被当 BGM 且立即淡出；应使用 SE。 |
| 462 | phase1-g0598 | PASS | 农具显示后移出右侧画布。 |
| 463 | phase1-g0595 | BOTH_FIX | query 未说明具体操作，DSL 擅自决定播放掌声。 |
| 464 | phase1-g0599 | PASS | 衣物显示、移动、提亮放大。 |
| 465 | phase1-g0623 | EXCLUDE | query 缺具体数值且 `next-level` 是外部目标，不宜修成独立监督。 |
| 466 | phase1-g0625 | BOTH_FIX | 揭示后的系统反馈属于一次性 SE。 |
| 467 | phase1-g0626 | PASS | 扣 1 后按 3 分门槛 NEXT。 |
| 468 | phase1-g0634 | PASS | 分支图显示后放大提层级。 |
| 469 | phase1-g0640 | BOTH_FIX | 两句离场文案同帧覆盖；明确首句停留 600ms 后再过渡。 |
| 470 | phase1-g0642 | PASS | 错误音效后等待 500ms。 |
| 471 | phase1-g0641 | EXCLUDE | `resource_reveal_start` 是无现有命令上下文的外部目标。 |
| 472 | phase1-g0648 | BOTH_FIX | 系统节拍提示属于一次性 SE。 |
| 473 | phase1-g0647 | PASS | 加 15、60 分门槛和 NEXT。 |
| 474 | phase1-g0650 | PASS | 使用已声明介绍图做分支引导。 |
| 475 | phase1-g0652 | PASS | 全屏蒙层后设半透明。 |
| 476 | phase1-g0649 | PASS | 庆祝图滑到中央后放大提亮。 |
| 477 | phase1-g0653 | QUERY_FIX | query 改为单次音效和 1200ms 等待；DSL 可保留。 |
| 478 | phase1-g0644 | PASS | 焦点进度加一、8 分门槛和 NEXT。 |
| 479 | phase1-g0658 | BOTH_FIX | 答错文案应由 answer_wrong signal 触发。 |
| 480 | phase1-g0664 | BOTH_FIX | 不应先把 countdown 固定为 60 再判断，否则 ELSE 永远不可达；改为检查 runtime 已有变量。 |
| 481 | phase1-g0665 | PASS | 单步设置连击庆祝状态。 |
| 482 | phase1-g0666 | BOTH_FIX | 掌声应使用 SE，不应作 BGM；800ms 等待可保留。 |
| 483 | phase1-g0668 | PASS | 指导图、900ms 和引导文字一致。 |
| 484 | phase1-g0670 | PASS | 失败弹窗后设八成透明并略放大。 |
| 485 | phase1-g0667 | PASS | 胜利弹窗上移并提亮放大。 |
| 486 | phase1-g0663 | BOTH_FIX | query 要播放掌声，但 catalog 没有音频且 DSL 完全遗漏；应补真实资源或删除该要求。 |
| 487 | phase1-g0659 | EXCLUDE | `settle_flow` 是无现有命令上下文的外部目标。 |
| 488 | phase1-g0676 | BOTH_FIX | 初始提示缺少可见时间且位置不在画面中部；明确 800ms 焦点停留。 |
| 489 | phase1-g0678 | PASS | 掌声音效后等待 500ms。 |
| 490 | phase1-g0680 | PASS | 单步 NEXT。 |
| 491 | phase1-g0675 | EXCLUDE | query 没有目标场景，答案擅自跳转且输入资源未使用，无法唯一修复。 |
| 492 | phase1-g0679 | BOTH_FIX | 分数变化应播放一次系统反馈 SE；启动 BGM 后立即停止是无效监督。 |
| 493 | phase1-g0681 | PASS | 连击文案后改为金色大字描边。 |
| 494 | phase1-g0682 | BOTH_FIX | DSL 把选择结果硬编码为正确，错误分支永远不可达；需由真实选择状态驱动。 |
| 495 | phase1-g0677 | EXCLUDE | `pass_flow` 是无现有命令上下文的外部目标。 |
| 496 | phase1-g0684 | BOTH_FIX | 描述语音属于一次新手提示，应使用 SE。 |
| 497 | phase1-g0685 | QUERY_FIX | query 改为一次单向环境轨迹；DSL 可保留。 |
| 498 | phase1-g0686 | PASS | 失败图滑到中央。 |
| 499 | phase1-g0688 | PASS | 衣物缩小并接近透明离场。 |
| 500 | phase1-g0689 | PASS | 掌声音效后等待 800ms。 |

Batch 010 汇总：`PASS 32`、`DSL_FIX 2`、`BOTH_FIX 11`、`QUERY_FIX 0`、`EXCLUDE 5`。本批尚未应用修订。

## Batch 011：记录 501–550

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 501 | phase1-g0683 | BOTH_FIX | query 要把“本关得分”累加到总分，DSL 却硬编码 `+10`；需明确本关得分就是 10 或支持变量值。 |
| 502 | phase1-g0694 | BOTH_FIX | 初始提示同帧被刷新内容覆盖；明确展示 800ms 后更新。 |
| 503 | phase1-g0692 | BOTH_FIX | 焦点循环目标 3 必须写进 query，并保留真实可见切换。 |
| 504 | phase1-g0696 | PASS | 系统节拍音后等待 800ms。 |
| 505 | phase1-g0698 | PASS | 记忆进度加 10、30 门槛和 NEXT。 |
| 506 | phase1-g0695 | EXCLUDE | `score_change_1` 是无上下文外部目标，query 也没有具体跳转语义。 |
| 507 | phase1-g0690 | DSL_FIX | `wrong_flash` 未初始化；应先设 0，再执行两轮失败图/音效/等待并递增。 |
| 508 | phase1-g0697 | BOTH_FIX | 连击庆祝的系统反馈属于一次性 SE。 |
| 509 | phase1-g0722 | DSL_FIX | 语义正确，style 的 `fontSize:"22px"` 应规范。 |
| 510 | phase1-g0732 | BOTH_FIX | “等玩家答错后”没有可执行边界；显式声明 wrong_answer signal 并在 ON 中更新。 |
| 511 | phase1-g0707 | PASS | 连击计数清零、五轮掌声节奏后 BREAK。 |
| 512 | phase1-g0733 | BOTH_FIX | query 未给通关门槛，答案猜成 10；明确 10 分门槛并使用普通 IF。 |
| 513 | phase1-g0740 | BOTH_FIX | `WAIT 100` 不是等待玩家输入，而 WAIT_FOR_INPUT 在当前浏览器 runtime 未注册；将需求明确为可执行的阻塞 CHOICES。 |
| 514 | phase1-g0730 | BOTH_FIX | 游戏结束资源是 SE；启动后立即停止没有可感知反馈，改为单次离场音效。 |
| 515 | phase1-g0744 | EXCLUDE | 要求重新进入本关但没有真实场景 URL。 |
| 516 | phase1-g0746 | EXCLUDE | `exit-transition` 是无现有命令上下文的外部目标。 |
| 517 | phase1-g0748 | BOTH_FIX | 游戏结束资源属于答错音效，应使用 SE 并保留 800ms 阶段。 |
| 518 | phase1-g0750 | QUERY_FIX | 开头缺“在画面中央”；DSL 文案正确。 |
| 519 | phase1-g0747 | QUERY_FIX | 开头缺“在画面中央”；莴笋、700ms 和音效正确。 |
| 520 | phase1-g0755 | PASS | 单张庆祝通关图片。 |
| 521 | phase1-g0754 | PASS | 时钟从中央移到右上角。 |
| 522 | phase1-g0752 | PASS | 提示进度加一、3 次门槛和 NEXT。 |
| 523 | phase1-g0757 | PASS | 胜利图从上方滑到中央后半透明突出。 |
| 524 | phase1-g0758 | PASS | 兔子、1.2 秒和引导文字一致。 |
| 525 | phase1-g0763 | BOTH_FIX | query 没给文案，DSL 擅自生成具体“速记消除战”内容。 |
| 526 | phase1-g0762 | DSL_FIX | expression 直接写 `progressScore` 且使用 `SCENE this`；变量读取和场景跳转都不可靠。 |
| 527 | phase1-g0765 | PASS | 单次确认音效。 |
| 528 | phase1-g0766 | BOTH_FIX | 系统提示属于焦点切换 SE，并保留 focus_ready 停止事件。 |
| 529 | phase1-g0768 | PASS | 指导图、800ms 和刷新提示一致。 |
| 530 | phase1-g0764 | EXCLUDE | `wrong_feedback_start` 是无现有命令上下文的外部目标。 |
| 531 | phase1-g0769 | PASS | 加 20、100 分门槛和 NEXT。 |
| 532 | phase1-g0770 | PASS | 单步设置 0.5 秒节拍状态。 |
| 533 | phase1-g0771 | BOTH_FIX | 掌声被当庆祝 BGM 且立即淡出；应使用 SE 或明确时长。 |
| 534 | phase1-g0772 | PASS | 蓝色药品移动到右侧选择位。 |
| 535 | phase1-g0773 | PASS | 胜利弹窗、800ms 和恭喜文字。 |
| 536 | phase1-g0776 | PASS | 农具提示卡后等待 1 秒。 |
| 537 | phase1-g0775 | BOTH_FIX | query 声称“一直重复动效”，DSL 只有一次移动；应删循环措辞或实现循环。 |
| 538 | phase1-g0781 | BOTH_FIX | 状态切换同帧覆盖且初始位置偏上；明确中部展示 800ms 后更新。 |
| 539 | phase1-g0780 | EXCLUDE | 要求答错后重进本场景但没有真实场景 URL。 |
| 540 | phase1-g0782 | EXCLUDE | `focus-shift` 是无现有命令上下文的外部目标。 |
| 541 | phase1-g0783 | PASS | 蔬菜、500ms 和确认音效。 |
| 542 | phase1-g0787 | PASS | 连击加一、5 次门槛和 NEXT。 |
| 543 | phase1-g0785 | PASS | 单步 NEXT。 |
| 544 | phase1-g0788 | PASS | 连对分设 3 后 NEXT。 |
| 545 | phase1-g0789 | BOTH_FIX | 掌声资源被当结算 BGM，且下一行立即 stop。 |
| 546 | phase1-g0784 | BOTH_FIX | 问诊语音属于一次性刷新提示，应使用 SE。 |
| 547 | phase1-g0791 | QUERY_FIX | query 改为一次药柜横移；DSL 可保留。 |
| 548 | phase1-g0786 | QUERY_FIX | 开头缺“在画面中央”；倒计时大号橙字正确。 |
| 549 | phase1-g0790 | QUERY_FIX | “帮我做个一个”语病，应改为“显示一个”；DSL 行为正确。 |
| 550 | phase1-g0794 | PASS | 结束图、1 秒和离场提示。 |

Batch 011 汇总：`PASS 25`、`DSL_FIX 7`、`BOTH_FIX 10`、`QUERY_FIX 4`、`EXCLUDE 4`。本批尚未应用修订。

## Batch 012：记录 551–600

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 551 | phase1-g0793 | DSL_FIX | 缺少答题区上方起点与移动时长，无法形成移动轨迹；补齐后用规范 scale/alpha。 |
| 552 | phase1-g0795 | PASS | 三张已声明蔬菜依次显示和等待，并按 query 无限轮播。 |
| 553 | phase1-g0798 | BOTH_FIX | 达标后应发出 query 明确命名的 switch_focus signal，不能凭空生成 signal 名。 |
| 554 | phase1-g0799 | BOTH_FIX | query 未给两段进度文案，DSL 擅自生成关卡7的 50%/75%，图片资源也未使用。 |
| 555 | phase1-g0812 | PASS | 每秒递增，达到 8 后 BREAK。 |
| 556 | phase1-g0836 | BOTH_FIX | query 要把本轮得分累加到总分，DSL 却硬编码 score `+10`。 |
| 557 | phase1-g0841 | PASS | 进度图左侧移动到中央后放大提亮。 |
| 558 | phase1-g0844 | PASS | 右上时钟放大提亮。 |
| 559 | phase1-g0835 | BOTH_FIX | 正确反馈应播放一次系统 SE；启动 BGM 后立即停止是无效监督。 |
| 560 | phase1-g0850 | BOTH_FIX | 首句重试提示会被立即覆盖；补 800ms 可见阶段。 |
| 561 | phase1-g0852 | PASS | 结束音效后等待 800ms。 |
| 562 | phase1-g0855 | PASS | TEXT 的两个变量插值合法且内容一致。 |
| 563 | phase1-g0819 | PASS | 鼓励文案、800ms、下一步提示。 |
| 564 | phase1-g0851 | BOTH_FIX | score 到 3 后回跳计分会无新答题直接加到 4；缺少真实答题事件边界。 |
| 565 | phase1-g0858 | BOTH_FIX | 描述语音不应循环；改为一次性 SE 并保留 800ms 等待。 |
| 566 | phase1-g0857 | PASS | 进度加一、3 分门槛和 NEXT。 |
| 567 | phase1-g0854 | BOTH_FIX | 答错一次直接 NEXT 是错误业务监督；改为累计并显示重试提示。 |
| 568 | phase1-g0853 | BOTH_FIX | 描述语音属于提示音效，应使用 SE 并保留结束事件。 |
| 569 | phase1-g0862 | PASS | 分支图显示后放大提层级。 |
| 570 | phase1-g0860 | QUERY_FIX | 开头缺“在画面中央”；时钟图片正确。 |
| 571 | phase1-g0859 | DSL_FIX | 缺左下起点、移动时长和低透明度初态，无法表现“移动后提高”。 |
| 572 | phase1-g0870 | PASS | 单次系统错误提示音。 |
| 573 | phase1-g0871 | BOTH_FIX | 关卡持续背景音乐改用真实 BGM，并保留状态同步事件。 |
| 574 | phase1-g0872 | PASS | score 加一、3 分门槛和 NEXT。 |
| 575 | phase1-g0868 | QUERY_FIX | 开头缺“在画面中央”；离场文本更新正确。 |
| 576 | phase1-g0869 | PASS | 进度设 3 后跳到紧随标签的奖励准备步骤。 |
| 577 | phase1-g0873 | DSL_FIX | 语义正确，style 的 `fontSize:"22px"` 应规范。 |
| 578 | phase1-g0875 | PASS | 单步 score 加 2。 |
| 579 | phase1-g0878 | DSL_FIX | “弹出提示框”只有静态 IMAGE；补 scaleIn 入场效果。 |
| 580 | phase1-g0876 | BOTH_FIX | 系统节拍提示属于一次性 SE。 |
| 581 | phase1-g0881 | PASS | 系统音效后等待 1.2 秒。 |
| 582 | phase1-g0880 | PASS | 引导图显示后提层级放大。 |
| 583 | phase1-g0877 | PASS | 食材滑向中央后放大略透明。 |
| 584 | phase1-g0885 | EXCLUDE | 只要求场景跳转但没有目标 URL 或可执行上下文。 |
| 585 | phase1-g0886 | BOTH_FIX | 补齐文案后仍立即覆盖；补 800ms 可见阶段。 |
| 586 | phase1-g0882 | PASS | 重试计数清零、三轮递增后 BREAK。 |
| 587 | phase1-g0888 | PASS | 系统音效后等待 400ms。 |
| 588 | phase1-g0890 | PASS | 单步 NEXT。 |
| 589 | phase1-g0892 | BOTH_FIX | query 未定义一整拍需要几次，答案猜成 4；明确四次为一整拍。 |
| 590 | phase1-g0889 | BOTH_FIX | 问诊语音属于进度提示，不应循环作 BGM；改用 SE。 |
| 591 | phase1-g0891 | QUERY_FIX | query 补齐分数文案与样式；DSL 可保留。 |
| 592 | phase1-g0894 | BOTH_FIX | 掌声应使用 SE，不应作为 BGM；1.2 秒等待可保留。 |
| 593 | phase1-g0895 | PASS | 胜利弹窗滑到中央后放大提亮。 |
| 594 | phase1-g0887 | DSL_FIX | IFEXPR 直接写 `score` 而非 `getVar('score')`；其余 LABEL 目标语义成立。 |
| 595 | phase1-g0896 | PASS | 提示框显示并移动到引导位置。 |
| 596 | phase1-g0893 | PASS | 连击分加一、3 次门槛和 NEXT。 |
| 597 | phase1-g0898 | BOTH_FIX | query 用“帮我做个”且没给具体样式，DSL 擅自生成红色、缩放和 transition 对象。 |
| 598 | phase1-g0932 | PASS | 衣物展示后等待 800ms。 |
| 599 | phase1-g0936 | EXCLUDE | 要求同场景第 2 关但没有真实场景 URL。 |
| 600 | phase1-g0939 | PASS | 场景图、600ms 和循环问诊环境音。 |

Batch 012 汇总：`PASS 33`、`DSL_FIX 5`、`BOTH_FIX 10`、`QUERY_FIX 2`、`EXCLUDE 0`。本批尚未应用修订。

## Batch 013：记录 601–650

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 601 | phase1-g0942 | BOTH_FIX | 首句离场提示会被立即覆盖；补 800ms 可见阶段。 |
| 602 | phase1-g0947 | DSL_FIX | query 要初始“半透明”，IMAGE 却未设置初始 alpha，随后直接设 1；需补初始样式。 |
| 603 | phase1-g0944 | PASS | 扣 5 后按 60 分门槛 NEXT。 |
| 604 | phase1-g0950 | PASS | 单步等待 600ms。 |
| 605 | phase1-g0949 | BOTH_FIX | query 开头缺“在画面中央”，IMAGE 还混入多余 `id` 参数。 |
| 606 | phase1-g0955 | QUERY_FIX | 实际只做一次文案更新，不是环境“一直重复”；删除循环模板措辞。 |
| 607 | phase1-g0956 | PASS | 重试次数加一，少于 3 时回跳，达到上限退出。 |
| 608 | phase1-g0957 | PASS | 胜利图、400ms 和掌声。 |
| 609 | phase1-g0958 | BOTH_FIX | 游戏结束资源属于一次性离场音效，应使用 SE。 |
| 610 | phase1-g0960 | PASS | 指定答错文字一致。 |
| 611 | phase1-g0964 | PASS | 提示图显示并移动。 |
| 612 | phase1-g0965 | DSL_FIX | query 明确画面中央，原 IMAGE 没有位置；补中央坐标与尺寸。 |
| 613 | phase1-g0961 | PASS | 进度设 80 后 NEXT。 |
| 614 | phase1-g0963 | BOTH_FIX | 系统提示音可循环作刷新节拍，但应使用 SE 并由事件停止。 |
| 615 | phase1-g0967 | DSL_FIX | 缺左下起点与移动时长，无法形成“快速移动”轨迹；同时规范 scale/alpha。 |
| 616 | phase1-g0973 | QUERY_FIX | 开头缺“在画面中央”；两段正确反馈文本一致。 |
| 617 | phase1-g0968 | PASS | 已声明介绍图后等待 500ms。 |
| 618 | phase1-g0972 | EXCLUDE | 要求重新进入本关但没有真实场景 URL。 |
| 619 | phase1-g0976 | BOTH_FIX | 答错系统提示属于一次性 SE。 |
| 620 | phase1-g0974 | BOTH_FIX | progress 固定 3 后跳回永真 IF，形成无限跳转；需真实后续过渡步骤。 |
| 621 | phase1-g0975 | PASS | 单次提示音。 |
| 622 | phase1-g0978 | BOTH_FIX | query 开头缺“在画面中央”，style `fontSize:"28px"` 需规范。 |
| 623 | phase1-g0979 | PASS | round_score 设 80 后 NEXT。 |
| 624 | phase1-g0980 | PASS | 单步设置提示刷新状态。 |
| 625 | phase1-g0982 | PASS | 药丸从左侧移动到右侧。 |
| 626 | phase1-g0981 | BOTH_FIX | 得分变化系统提示属于一次性 SE。 |
| 627 | phase1-g0986 | DSL_FIX | query 明确中央展示，原 IMAGE 未给位置；补中央坐标与尺寸。 |
| 628 | phase1-g0983 | PASS | 胜利图、700ms 和连击文字。 |
| 629 | phase1-g0985 | PASS | 胜利弹窗由下方移到中央后置前。 |
| 630 | phase1-g0991 | BOTH_FIX | query 未给文案，DSL 使用“测试文本/演示”等占位内容，不能进入正式监督。 |
| 631 | phase1-g0990 | PASS | 明确入口场景跳转。 |
| 632 | phase1-g0995 | PASS | 单步 NEXT。 |
| 633 | phase1-g0994 | BOTH_FIX | 持续氛围背景音乐改用真实 BGM，并保留焦点事件。 |
| 634 | phase1-g0998 | PASS | 节拍进度加一、3 次门槛和 NEXT。 |
| 635 | phase1-g0997 | DSL_FIX | IFEXPR 直接写 `score`，应通过 `getVar('score')` 读取。 |
| 636 | phase1-g0999 | BOTH_FIX | 掌声资源被当庆祝 BGM，且没有短暂播放时长；应使用 SE/WAIT。 |
| 637 | phase1-g0996 | QUERY_FIX | 开头缺“在画面中央”；提示和醒目样式正确。 |
| 638 | phase1-g0992 | PASS | 得分设 0 后跳到紧随标签的反馈结束标记。 |
| 639 | phase1-g0993 | QUERY_FIX | 开头缺“在画面中央”；卡片、1 秒和提示音正确。 |
| 640 | phase1-g0100 | DSL_FIX | query 只要求停止已有 BGM，DSL 却先启动一段新 BGM；应只输出 BGM_STOP。 |
| 641 | phase1-g0203 | EXCLUDE | `reward-flow` 是无现有命令上下文的外部目标。 |
| 642 | phase1-g0211 | PASS | 胜利图从左侧滑到中央后放大。 |
| 643 | phase1-g0214 | PASS | 重试图调整为醒目半透明大图。 |
| 644 | phase1-g0209 | PASS | comboProgress 设 3 后 NEXT。 |
| 645 | phase1-g0221 | BOTH_FIX | progress 固定 3 后跳回永真 IF，形成无限跳转。 |
| 646 | phase1-g0222 | PASS | 系统音效后等待 400ms。 |
| 647 | phase1-g0190 | BOTH_FIX | 离场背景音乐改用真实 BGM，并保留 exit_started 停止边界。 |
| 648 | phase1-g0225 | QUERY_FIX | “先来一个一条”语病，应为“显示一条”；DSL 文案正确。 |
| 649 | phase1-g0227 | PASS | 分类正确数加一、3 分门槛和 NEXT。 |
| 650 | phase1-g0205 | BOTH_FIX | 进度刷新背景音乐改用真实 BGM，并保留明确 1000ms 生命周期。 |

Batch 013 汇总：`PASS 27`、`DSL_FIX 4`、`BOTH_FIX 13`、`QUERY_FIX 5`、`EXCLUDE 1`。本批尚未应用修订。

## Batch 014：记录 651–700

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 651 | phase1-g0224 | PASS | timerProgress 设 3 后 NEXT。 |
| 652 | phase1-g0228 | BOTH_FIX | 问诊语音用于一次新手提示，应使用 SE，不能循环作为 BGM。 |
| 653 | phase1-g0230 | PASS | 单张失败提示图。 |
| 654 | phase1-g0233 | PASS | 提示音后等待 600ms。 |
| 655 | phase1-g0229 | PASS | 蔬菜漂移后降低透明度。 |
| 656 | phase1-g0232 | BOTH_FIX | 补回中央位置描述；为卡片设置明确中央尺寸坐标，并用标准 alpha=0 实现立即透明。 |
| 657 | phase1-g0238 | BOTH_FIX | 首句巡逻提示会被立即覆盖；补 800ms 可见阶段。 |
| 658 | phase1-g0240 | PASS | 单次倒计时提示音。 |
| 659 | phase1-g0241 | BOTH_FIX | 掌声被当欢呼 BGM，且“庆祝结束”无时长/事件。 |
| 660 | phase1-g0243 | PASS | 胜利面板、600ms 和通关文案。 |
| 661 | phase1-g0242 | DSL_FIX | 未达标时 query 要留在当前流程，DSL 却额外无条件设置 `scoreGateChecked`；删除未请求副作用。 |
| 662 | phase1-g0245 | PASS | 单步设置夜间环境状态。 |
| 663 | phase1-g0239 | EXCLUDE | query 无具体数值且 `next` 是无上下文外部目标。 |
| 664 | phase1-g0244 | DSL_FIX | 新手提示使用无人监听的 `SIGNAL toast` 且 data 多层引号，应改可见 TEXT/完整事件。 |
| 665 | phase1-g0248 | DSL_FIX | 原答案没有坐标，无法保证提示位于胜利图下方；补明确图片布局与下方文字位置。 |
| 666 | phase1-g0246 | BOTH_FIX | 系统反馈音用于短促重试提示，应使用 SE。 |
| 667 | phase1-g0247 | DSL_FIX | 原图标没有下方起点，MOVE 也没有时长，无法形成“从下方滑到中央”的轨迹。 |
| 668 | phase1-g0250 | PASS | 答错弹窗显示后放大置前。 |
| 669 | phase1-g0255 | PASS | 明确场景第 2 关跳转。 |
| 670 | phase1-g0257 | EXCLUDE | `combo-celebration` 是无现有命令上下文的外部目标。 |
| 671 | phase1-g0259 | BOTH_FIX | 游戏结束文件属于结算音效，应使用 SE 并保留结束事件。 |
| 672 | phase1-g0260 | PASS | 单步 NEXT。 |
| 673 | phase1-g0256 | BOTH_FIX | query 未给两段文案/时长，DSL 擅自生成内容，TEXT `duration` 也不是标准参数。 |
| 674 | phase1-g0261 | PASS | 环境提示显示后改为醒目青绿色。 |
| 675 | phase1-g0263 | BOTH_FIX | query 未给数值和门槛；DSL 还在 NEXT 后无条件执行 `SCENE this`，控制流错误。 |
| 676 | phase1-g0266 | PASS | 失败图显示并移动到中央。 |
| 677 | phase1-g0265 | DSL_FIX | “滑向”应有可感知时长；补 800ms MOVE，并在抵达后再缩放。 |
| 678 | phase1-g0264 | BOTH_FIX | 离场背景音乐应引用真实 BGM，并明确 1000ms 后停止。 |
| 679 | phase1-g0269 | PASS | 确认音效后等待 500ms。 |
| 680 | phase1-g0275 | EXCLUDE | `clear-settlement` 是无上下文外部目标。 |
| 681 | phase1-g0268 | DSL_FIX | IMAGE 引用未声明动画 `_____3`；当前 catalog 只有虫子图片。 |
| 682 | phase1-g0274 | BOTH_FIX | 不能用立即改字假装玩家选择；改成真实恢复药剂按钮与点击更新。 |
| 683 | phase1-g0276 | PASS | 提示音后等待 500ms。 |
| 684 | phase1-g0277 | BOTH_FIX | 持续环境音乐应引用真实 BGM，而不是循环问诊语音。 |
| 685 | phase1-g0278 | PASS | retryProgress 设 3 后 NEXT。 |
| 686 | phase1-g0282 | BOTH_FIX | 答错时的系统提示属于一次性 SE。 |
| 687 | phase1-g0286 | BOTH_FIX | query 开头缺字，且“初始半透明”未在 IMAGE/STYLE 中实现。 |
| 688 | phase1-g0283 | PASS | 红薯移动后调整透明度和缩放。 |
| 689 | phase1-g0284 | PASS | 蓝色药品移到中央并放大。 |
| 690 | phase1-g0288 | PASS | beatCount 从 0 递增到 8 后 BREAK。 |
| 691 | phase1-g0281 | PASS | resourceProgress 设 3 后 NEXT。 |
| 692 | phase1-g0293 | BOTH_FIX | 达到 3 后回跳但不复位/终止，形成无限递增跳转；query 控制流本身需修。 |
| 693 | phase1-g0294 | PASS | 重试提示音后等待 600ms。 |
| 694 | phase1-g0296 | PASS | completionScore 设 3 后 NEXT。 |
| 695 | phase1-g0292 | BOTH_FIX | 修正事实后仍立即覆盖首句；补 800ms 可见阶段。 |
| 696 | phase1-g0299 | DSL_FIX | NEXT 后额外设置 `progressSynced` 是未请求且可能仍执行的副作用，应删除。 |
| 697 | phase1-g0297 | BOTH_FIX | query 要求点明具体瓜果与肉类却未提供名称，答案只写泛称；补明确清单和阅读停留。 |
| 698 | phase1-g0298 | BOTH_FIX | query 表达累计答错次数，DSL 却直接硬设为 3；应对已有计数加一再分支。 |
| 699 | phase1-g0308 | EXCLUDE | `wrong_feedback` 是无现有命令上下文的外部目标。 |
| 700 | phase1-g0303 | PASS | 环境循环次数清零、三轮递增后 BREAK。 |

Batch 014 汇总：`PASS 32`、`DSL_FIX 4`、`BOTH_FIX 9`、`QUERY_FIX 1`、`EXCLUDE 4`。本批尚未应用修订。

## Batch 015：记录 701–750

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 701 | phase1-g0323 | DSL_FIX | 三轮控制流成立，但循环图片携带空 loop `animId`，必须删除。 |
| 702 | phase1-g0378 | DSL_FIX | `SCENE this` 不是可靠“本场景下一流程”。 |
| 703 | phase1-g0386 | PASS | exitProgress 设 3 后 NEXT。 |
| 704 | phase1-g0388 | PASS | 蔬菜显示并移动到右下提示位。 |
| 705 | phase1-g0392 | BOTH_FIX | 补回中央位置描述；IMAGE 也必须给出与尺寸一致的中央坐标，保留 1 秒等待。 |
| 706 | phase1-g0391 | PASS | 进度图滑到目标后缩小半透明。 |
| 707 | phase1-g0396 | DSL_FIX | `SCENE this` 不是可靠下一段场景跳转。 |
| 708 | phase1-g0377 | PASS | score 清零、十轮递增后 BREAK。 |
| 709 | phase1-g0399 | PASS | 桌面图、600ms 和循环环境音。 |
| 710 | phase1-g0431 | EXCLUDE | `settle_flow` 是无现有命令上下文的外部目标。 |
| 711 | phase1-g0432 | PASS | 系统音效后等待 450ms。 |
| 712 | phase1-g0433 | BOTH_FIX | 系统提示音用于一次进度反馈，应使用 SE 而不是 BGM。 |
| 713 | phase1-g0520 | BOTH_FIX | 问题语音是一次性答错提示；启动 BGM 后立即停止是无效监督。 |
| 714 | phase1-g0551 | DSL_FIX | 三轮控制流成立，但循环图片携带空 loop `animId`，必须删除。 |
| 715 | phase1-g0660 | PASS | 单次焦点切换提示音。 |
| 716 | phase1-g0661 | BOTH_FIX | 进度刷新阶段背景音乐改用真实 BGM，并保留完成事件。 |
| 717 | phase1-g0662 | PASS | hintProgress 设 3 后 NEXT。 |
| 718 | phase1-g0594 | PASS | 引导文字、900ms 和两个指定选项。 |
| 719 | phase1-g0637 | DSL_FIX | 交互语义成立，但 `dialog-default-9slice` 未在 asset catalog 声明。 |
| 720 | phase1-g0699 | QUERY_FIX | query 补齐通关文案、1.5 秒和两个选项；DSL 可保留。 |
| 721 | phase1-g0619 | PASS | 通关提示、800ms 和指定两个选项，皮肤资源均已声明。 |
| 722 | phase1-g0691 | PASS | 同步提示、1 秒和两个确认选项。 |
| 723 | phase1-g0609 | DSL_FIX | TEXT/CHOICES 混入多余 `id`，fontSize 带 `px`；语义正确。 |
| 724 | phase1-g0671 | DSL_FIX | 语义正确，style 的 `fontSize:"30px"` 应规范。 |
| 725 | phase1-g0673 | BOTH_FIX | query 未给具体文本/选项，DSL 使用“资源1/2/3”占位，引用未声明按钮皮肤且输入资源未使用。 |
| 726 | phase1-g0601 | PASS | 庆祝文字、500ms 和两个选项。 |
| 727 | phase1-g0714 | DSL_FIX | 语义正确，style `fontSize:"28px"` 应规范。 |
| 728 | phase1-g0706 | BOTH_FIX | query 有“帮我做个一个”语病；DSL 还携带空 `buttonSkinId`，必须省略。 |
| 729 | phase1-g0724 | DSL_FIX | 分支状态正确，但 `dialog-default-9slice` 未在 asset catalog 声明。 |
| 730 | phase1-g0811 | PASS | 得分提示、1 秒和两个选项。 |
| 731 | phase1-g0760 | EXCLUDE | DSL 没有重启当前关命令，输入也没有场景 URL；空 OPTION 不是可执行重试入口。 |
| 732 | phase1-g0829 | PASS | 连击提示、800ms 和两个选择。 |
| 733 | phase1-g0847 | PASS | 奖励提示、1 秒和两个选择。 |
| 734 | phase1-g0796 | DSL_FIX | 缺少题目 TEXT，并且无论选锄头还是错误项都会在菜单后无条件写“答错”；必须按 OPTION 分支记录。 |
| 735 | phase1-g0865 | PASS | 三个环境选择一致。 |
| 736 | phase1-g0827 | DSL_FIX | 选项文字承诺 `+3分/不加分`，但两个 OPTION 都没有更新分数。 |
| 737 | phase1-g0863 | PASS | 通关提示、1 秒和三个结算选项。 |
| 738 | phase1-g0916 | DSL_FIX | blocking 顺序成立，但空 `buttonSkinId` 是无效资源字段，必须省略。 |
| 739 | phase1-g0924 | PASS | 失败提示、1 秒和两个重试选择。 |
| 740 | phase1-g0899 | PASS | 正确提示、700ms 和两个选项。 |
| 741 | phase1-g0742 | DSL_FIX | query 要先显示新手提示，DSL 只有选项，遗漏提示 TEXT。 |
| 742 | phase1-g0778 | PASS | 两个离场选项后设置 exitReady。 |
| 743 | phase1-g0970 | DSL_FIX | 选项语义一致，但 `dialog-default-9slice` 未在 asset catalog 声明。 |
| 744 | phase1-g0952 | DSL_FIX | 菜单后只写“已选择”，丢失保留/捐出的真实分支结果；应在各 OPTION 中写具体值。 |
| 745 | phase1-g0007 | PASS | 同步提示、1 秒和两个选项。 |
| 746 | phase1-g0025 | PASS | 三个整理去向选项一致。 |
| 747 | phase1-g0023 | PASS | 顺序提示、1 秒和两个确认选项。 |
| 748 | phase1-g0988 | DSL_FIX | 分支状态正确，但空 `buttonSkinId` 是无效资源字段，必须省略。 |
| 749 | phase1-g0883 | BOTH_FIX | query 未给文案/选项，DSL 擅自生成；`nextCommands` 不是 OPTION.commands，且 `NEXT_SCENE/RESTART` 非法。 |
| 750 | phase1-g0059 | PASS | 指定积分提示、1 秒和两个选项。 |

Batch 015 汇总：`PASS 27`、`DSL_FIX 16`、`BOTH_FIX 5`、`QUERY_FIX 1`、`EXCLUDE 1`。本批尚未应用修订。

## Batch 016：记录 751–800

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 751 | phase1-g0079 | PASS | 完成提示、1.5 秒和两个结算选择。 |
| 752 | phase1-g0069 | PASS | 记录卡提示、1 秒和两个选择。 |
| 753 | phase1-g0061 | DSL_FIX | 提示和选项成立，但空 `buttonSkinId` 是无效资源字段，必须省略。 |
| 754 | phase1-g0097 | PASS | 环境提示、1 秒和三个节奏选择。 |
| 755 | phase1-g0934 | PASS | 两个节拍选项后记录进入选择阶段。 |
| 756 | phase1-g0130 | BOTH_FIX | 补回 query 的中央位置描述，并给标题与 CHOICES 明确中央布局坐标。 |
| 757 | phase1-g0043 | DSL_FIX | 分支加减分正确，但空 `buttonSkinId` 是无效资源字段，必须省略。 |
| 758 | phase1-g0112 | DSL_FIX | 缺少题目 TEXT，并在菜单后无条件把任何选择都标成 wrong；需按正确/错误 OPTION 分支记录。 |
| 759 | phase1-g0148 | DSL_FIX | 原答案未显示问题文案，且刷新状态在 CHOICES 后无条件写入；应在各 OPTION 分支中记录类别并置刷新状态。 |
| 760 | phase1-g0235 | PASS | 三个状态同步选择。 |
| 761 | phase1-g0184 | BOTH_FIX | 输入没有火锅图片资源却要求“摆出”；自然化为火锅前选择，并把已开启状态写入各 OPTION 分支。 |
| 762 | phase1-g0253 | PASS | 进度提示、1 秒和两个去向选择。 |
| 763 | phase1-g0251 | PASS | 同步提示、1 秒和两个操作选择。 |
| 764 | phase1-g0166 | BOTH_FIX | query 开头缺字，CHOICES 混入多余 `id`；菜单后记录节拍 1 的顺序成立。 |
| 765 | phase1-g0217 | DSL_FIX | 选项逻辑正确，但 `buttonSkinId=dialog-default-9slice` 未在 catalog 声明，应移除或提供资源。 |
| 766 | phase1-g0279 | PASS | 正确提示、1.2 秒和两个选择。 |
| 767 | phase1-g0289 | DSL_FIX | 提示和选项成立，但 `btn-primary-9slice` 未在 asset catalog 声明。 |
| 768 | phase1-g0287 | PASS | 问题、1.5 秒和三个答案选项。 |
| 769 | phase1-g0340 | DSL_FIX | 两个反馈选项成立，但 `dialog-default-9slice` 未在 asset catalog 声明。 |
| 770 | phase1-g0304 | DSL_FIX | OPTION1 写 true 后，菜单外无条件写 false，会覆盖“再试一次”；应初始化在菜单前并按 OPTION 分别写值。 |
| 771 | phase1-g0322 | DSL_FIX | 菜单后无条件写 leave，选择“再检查一次”也被记成离开；状态应写在各 OPTION 中。 |
| 772 | phase1-g0376 | DSL_FIX | “我已记住”也被无条件记为请求刷新；两个 OPTION 应分别写 true/false。 |
| 773 | phase1-g0174 | PASS | 离场提示、1.2 秒和两个确认选项。 |
| 774 | phase1-g0384 | PASS | 重试提示、1 秒和两个选择。 |
| 775 | phase1-g0358 | BOTH_FIX | query 未给具体选项，DSL 用占位“选项A/B”；`onSelectedCommands` 不是 OPTION.commands，状态不会按选项写入。 |
| 776 | phase1-g0407 | PASS | 通关提示、1 秒和两个选择。 |
| 777 | phase1-g0409 | PASS | 环境提示、1 秒和两个选择。 |
| 778 | phase1-g0427 | PASS | 正确提示、900ms 和两个学习选择。 |
| 779 | phase1-g0463 | PASS | 状态提示、1 秒和两个确认选择。 |
| 780 | phase1-g0443 | PASS | 答对提示、900ms 和两个选择。 |
| 781 | phase1-g0479 | PASS | 同步提示、1 秒和两个选择。 |
| 782 | phase1-g0489 | PASS | 环境提示、1 秒和两个选择。 |
| 783 | phase1-g0499 | PASS | 得分翻倍提示、700ms 和两个选择。 |
| 784 | phase1-g0394 | DSL_FIX | 三个 OPTION 写入 1/2/3 后，菜单外又无条件重设为 2；默认值必须移到 CHOICES 前。 |
| 785 | phase1-g0514 | DSL_FIX | `tutorialHintSeen` 原本在菜单外立即写入；必须缩进到“我已了解”选项的命令块。 |
| 786 | phase1-g0271 | PASS | 能量变化提示、1 秒和两个选择。 |
| 787 | phase1-g0550 | PASS | 两个离场确认选项。 |
| 788 | phase1-g0504 | PASS | 答错提示、1 秒和两个选择。 |
| 789 | phase1-g0532 | PASS | 两个失败行动选择后记录重试路径。 |
| 790 | phase1-g0655 | DSL_FIX | query 要选择绿色对勾后显示正确反馈，三个 OPTION 均无子命令，核心反馈缺失。 |
| 791 | phase1-g0586 | DSL_FIX | 选项状态逻辑成立，但引用未声明 `dialog-default-9slice` 皮肤，应移除。 |
| 792 | phase1-g0445 | DSL_FIX | 三个图片分支正确，但引用未声明 `btn-primary-9slice` 皮肤，应移除。 |
| 793 | phase1-g0481 | BOTH_FIX | query 未给文案/选项；DSL 用图片 ID 当 TEXT elementId，`trueCommands` 字段和 `NEXT_SCENE/RESTART` 类型均非法。 |
| 794 | phase1-g0568 | BOTH_FIX | query 未说明哪瓶正确，DSL 却在任何选项后无条件写答错；必须补标准答案并按 OPTION 分支。 |
| 795 | phase3-interaction-v3-001 | PASS | 卡片显示、点击后记录 clicked。 |
| 796 | phase3-interaction-v3-002 | PASS | 卡片显示、点击后记录已查看。 |
| 797 | phase3-interaction-v3-003 | PASS | 卡片显示、点击后记录操作。 |
| 798 | phase3-interaction-v3-004 | PASS | 卡片显示、点击后记录看过。 |
| 799 | phase3-interaction-v3-005 | PASS | 卡片显示、点击后记录。 |
| 800 | phase3-interaction-v3-006 | PASS | 卡片显示、点击后记录已查看。 |

Batch 016 汇总：`PASS 32`、`DSL_FIX 13`、`BOTH_FIX 4`、`QUERY_FIX 1`、`EXCLUDE 0`。本批尚未应用修订。

## Batch 017：记录 801–850

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 801 | phase3-interaction-v3-007 | PASS | 卡片显示、点击后记录 `clicked_7=true`。 |
| 802 | phase3-interaction-v3-008 | PASS | 卡片显示、点击后记录 `clicked_8=true`。 |
| 803 | phase3-interaction-v3-009 | PASS | 卡片显示、点击后记录 `clicked_9=true`。 |
| 804 | phase3-interaction-v3-010 | PASS | 卡片显示、点击后记录 `clicked_10=true`。 |
| 805 | phase3-interaction-v3-011 | PASS | 卡片显示、点击后记录 `clicked_11=true`。 |
| 806 | phase3-interaction-v3-012 | PASS | 卡片显示、点击后记录 `clicked_12=true`。 |
| 807 | phase3-interaction-v3-013 | PASS | 卡片显示、点击后记录 `clicked_13=true`。 |
| 808 | phase3-interaction-v3-014 | PASS | 卡片显示、点击后记录 `clicked_14=true`。 |
| 809 | phase3-interaction-v3-015 | PASS | 卡片显示、点击后记录 `clicked_15=true`。 |
| 810 | phase3-interaction-v3-016 | PASS | 卡片显示、点击后记录 `clicked_16=true`。 |
| 811 | phase3-interaction-v3-017 | PASS | 卡片显示、点击后记录 `clicked_17=true`。 |
| 812 | phase3-interaction-v3-018 | PASS | 卡片显示、点击后记录 `clicked_18=true`。 |
| 813 | phase3-interaction-v3-019 | PASS | 卡片显示、点击后记录 `clicked_19=true`。 |
| 814 | phase3-interaction-v3-020 | PASS | 卡片显示、点击后记录 `clicked_20=true`。 |
| 815 | phase3-interaction-v3-021 | PASS | 卡片显示、点击后记录 `clicked_21=true`。 |
| 816 | phase3-interaction-v3-022 | PASS | 卡片显示、点击后记录 `clicked_22=true`。 |
| 817 | phase3-interaction-v3-023 | PASS | 卡片显示、点击后记录 `clicked_23=true`。 |
| 818 | phase3-interaction-v3-024 | PASS | 卡片显示、点击后记录 `clicked_24=true`。 |
| 819 | phase3-interaction-v3-025 | PASS | 卡片显示、点击后记录 `clicked_25=true`。 |
| 820 | phase3-interaction-v3-026 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 821 | phase3-interaction-v3-027 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 822 | phase3-interaction-v3-028 | PASS | query 只要求柔和出现，淡入动画一致。 |
| 823 | phase3-interaction-v3-029 | DSL_FIX | query 要求先出现再消失，DSL 只有 `ANIM_IN`。 |
| 824 | phase3-interaction-v3-030 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 825 | phase3-interaction-v3-031 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 826 | phase3-interaction-v3-032 | PASS | query 只要求柔和出现，淡入动画一致。 |
| 827 | phase3-interaction-v3-033 | DSL_FIX | query 要求先出现再消失，DSL 只有 `ANIM_IN`。 |
| 828 | phase3-interaction-v3-034 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 829 | phase3-interaction-v3-035 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 830 | phase3-interaction-v3-036 | PASS | query 只要求柔和出现，淡入动画一致。 |
| 831 | phase3-interaction-v3-037 | DSL_FIX | query 要求先出现再消失，DSL 只有 `ANIM_IN`。 |
| 832 | phase3-interaction-v3-038 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 833 | phase3-interaction-v3-039 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 834 | phase3-interaction-v3-040 | PASS | query 只要求柔和出现，淡入动画一致。 |
| 835 | phase3-interaction-v3-041 | DSL_FIX | query 要求先出现再消失，DSL 只有 `ANIM_IN`。 |
| 836 | phase3-interaction-v3-042 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 837 | phase3-interaction-v3-043 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 838 | phase3-interaction-v3-044 | PASS | query 只要求柔和出现，淡入动画一致。 |
| 839 | phase3-interaction-v3-045 | DSL_FIX | query 要求先出现再消失，DSL 只有 `ANIM_IN`。 |
| 840 | phase3-interaction-v3-046 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 841 | phase3-interaction-v3-047 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 842 | phase3-interaction-v3-048 | PASS | query 只要求柔和出现，淡入动画一致。 |
| 843 | phase3-interaction-v3-049 | DSL_FIX | query 要求先出现再消失，DSL 只有 `ANIM_IN`。 |
| 844 | phase3-interaction-v3-050 | DSL_FIX | query 要求出现和离开动画，DSL 只有 `ANIM_IN`。 |
| 845 | phase3-interaction-v3-051 | DSL_FIX | `SELECT` 只改变量，未提供 overlay/effect，画面上没有 query 要求的明显选中状态。 |
| 846 | phase3-interaction-v3-052 | DSL_FIX | `SELECT` 只改变量，玩家看不出已选中；`single=true` 本身不妨碍再次点击取消。 |
| 847 | phase3-interaction-v3-053 | PASS | 选择可切换取消，绑定变量随状态变化。 |
| 848 | phase3-interaction-v3-054 | PASS | 当前元素再次点击仍会取消；`single=true` 仅负责取消其他已选元素。 |
| 849 | phase3-interaction-v3-055 | DSL_FIX | `SELECT` 缺少 overlay/effect，未实现明显可见的选中状态。 |
| 850 | phase3-interaction-v3-056 | DSL_FIX | `SELECT` 缺少 overlay/effect，玩家无法从画面判断已选中。 |

Batch 017 汇总：`PASS 27`、`DSL_FIX 23`、`BOTH_FIX 0`、`QUERY_FIX 0`、`EXCLUDE 0`。本批尚未应用修订。

## Batch 018：记录 851–900

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 851 | phase3-interaction-v3-057 | PASS | 可选中、再次点击取消，绑定变量随状态变化。 |
| 852 | phase3-interaction-v3-058 | PASS | `single=true` 不阻止当前卡再次点击取消，变量会同步变化。 |
| 853 | phase3-interaction-v3-059 | DSL_FIX | 只有选择变量，没有 overlay/effect，未实现明显选中状态。 |
| 854 | phase3-interaction-v3-060 | DSL_FIX | 玩家无法从画面看出选中，需补 overlay/effect。 |
| 855 | phase3-interaction-v3-061 | PASS | 可选中和取消，状态变量同步。 |
| 856 | phase3-interaction-v3-062 | PASS | 可选择并再次点击取消，状态变量同步。 |
| 857 | phase3-interaction-v3-063 | BOTH_FIX | query 有“路线选择选择效果”重复；DSL 又缺少明显可见的选中反馈。 |
| 858 | phase3-interaction-v3-064 | DSL_FIX | 只有内部变量变化，玩家看不出选中。 |
| 859 | phase3-interaction-v3-065 | PASS | 可选中、取消并更新状态变量。 |
| 860 | phase3-interaction-v3-066 | PASS | 可选择并再次点击取消，状态变量同步。 |
| 861 | phase3-interaction-v3-067 | DSL_FIX | query 要明显选中，DSL 未配置任何视觉反馈。 |
| 862 | phase3-interaction-v3-068 | DSL_FIX | query 要玩家看出选中，DSL 只有变量变化。 |
| 863 | phase3-interaction-v3-069 | PASS | 可选中和取消，状态变量同步。 |
| 864 | phase3-interaction-v3-070 | PASS | 可选择并再次点击取消，状态变量同步。 |
| 865 | phase3-interaction-v3-071 | DSL_FIX | query 要明显选中，DSL 未配置视觉反馈。 |
| 866 | phase3-interaction-v3-072 | DSL_FIX | query 要玩家看出选中，DSL 只有变量变化。 |
| 867 | phase3-interaction-v3-073 | PASS | 可选中和取消，状态变量同步。 |
| 868 | phase3-interaction-v3-074 | PASS | 可选择并再次点击取消，状态变量同步。 |
| 869 | phase3-interaction-v3-075 | DSL_FIX | query 要明显选中，DSL 未配置视觉反馈。 |
| 870 | phase3-interaction-v3-076 | PASS | 图片元素显示并启用拖拽。 |
| 871 | phase3-interaction-v3-077 | DSL_FIX | 只有 `DRAG`，缺少目标区域检测和成功记录。 |
| 872 | phase3-interaction-v3-078 | DSL_FIX | 只有 `DRAG`，未实现放对位置即完成。 |
| 873 | phase3-interaction-v3-079 | DSL_FIX | 只有 `DRAG`，缺少指定位置检测和完成记录。 |
| 874 | phase3-interaction-v3-080 | PASS | 图片元素显示并启用拖拽。 |
| 875 | phase3-interaction-v3-081 | DSL_FIX | 只有 `DRAG`，缺少目标区域检测和成功记录。 |
| 876 | phase3-interaction-v3-082 | DSL_FIX | 只有 `DRAG`，未实现放对位置即完成。 |
| 877 | phase3-interaction-v3-083 | DSL_FIX | 只有 `DRAG`，缺少指定位置检测和完成记录。 |
| 878 | phase3-interaction-v3-084 | PASS | 图片元素显示并启用拖拽。 |
| 879 | phase3-interaction-v3-085 | DSL_FIX | 只有 `DRAG`，缺少目标区域检测和成功记录。 |
| 880 | phase3-interaction-v3-086 | DSL_FIX | 只有 `DRAG`，未实现放对位置即完成。 |
| 881 | phase3-interaction-v3-087 | DSL_FIX | 只有 `DRAG`，缺少指定位置检测和完成记录。 |
| 882 | phase3-interaction-v3-088 | PASS | 图片元素显示并启用拖拽。 |
| 883 | phase3-interaction-v3-089 | DSL_FIX | 只有 `DRAG`，缺少目标区域检测和成功记录。 |
| 884 | phase3-interaction-v3-090 | DSL_FIX | 只有 `DRAG`，未实现放对位置即完成。 |
| 885 | phase3-interaction-v3-091 | DSL_FIX | 只有 `DRAG`，缺少指定位置检测和完成记录。 |
| 886 | phase3-interaction-v3-092 | PASS | 图片元素显示并启用拖拽。 |
| 887 | phase3-interaction-v3-093 | DSL_FIX | 只有 `DRAG`，缺少目标区域检测和成功记录。 |
| 888 | phase3-interaction-v3-094 | DSL_FIX | 只有 `DRAG`，未实现放对位置即完成。 |
| 889 | phase3-interaction-v3-095 | DSL_FIX | 只有 `DRAG`，缺少指定位置检测和完成记录。 |
| 890 | phase3-interaction-v3-096 | PASS | 图片元素显示并启用拖拽。 |
| 891 | phase3-interaction-v3-097 | DSL_FIX | 只有 `DRAG`，缺少目标区域检测和成功记录。 |
| 892 | phase3-interaction-v3-098 | DSL_FIX | 只有 `DRAG`，未实现放对位置即完成。 |
| 893 | phase3-interaction-v3-099 | DSL_FIX | 只有 `DRAG`，缺少指定位置检测和完成记录。 |
| 894 | phase3-interaction-v3-100 | PASS | 图片元素显示并启用拖拽。 |
| 895 | phase3-interaction-v3-101 | PASS | 拖拽、目标区域检测和成功变量记录完整。 |
| 896 | phase3-interaction-v3-102 | PASS | 拖拽、放对位置检测和完成记录完整。 |
| 897 | phase3-interaction-v3-103 | PASS | 拖拽、指定位置检测和完成记录完整。 |
| 898 | phase3-interaction-v3-104 | PASS | 虽然 query 只要求可拖，额外目标区成功记录不改变基础交互且可执行。 |
| 899 | phase3-interaction-v3-105 | PASS | 拖拽、目标区域检测和成功记录完整。 |
| 900 | phase3-interaction-v3-106 | PASS | 拖拽、放对位置检测和完成记录完整。 |

Batch 018 汇总：`PASS 23`、`DSL_FIX 26`、`BOTH_FIX 1`、`QUERY_FIX 0`、`EXCLUDE 0`。本批尚未应用修订。

## Batch 019：记录 901–950

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 901 | phase3-interaction-v3-107 | PASS | 拖拽、指定位置检测和完成记录完整。 |
| 902 | phase3-interaction-v3-108 | PASS | 图片可拖；附加目标区成功记录可执行且不破坏基础需求。 |
| 903 | phase3-interaction-v3-109 | PASS | 拖拽、目标区域检测和成功记录完整。 |
| 904 | phase3-interaction-v3-110 | PASS | 拖拽、放对位置检测和完成记录完整。 |
| 905 | phase3-interaction-v3-111 | PASS | 拖拽、指定位置检测和完成记录完整。 |
| 906 | phase3-interaction-v3-112 | PASS | 图片可拖；附加目标区成功记录可执行。 |
| 907 | phase3-interaction-v3-113 | PASS | 拖拽、目标区域检测和成功记录完整。 |
| 908 | phase3-interaction-v3-114 | PASS | 拖拽、放对位置检测和完成记录完整。 |
| 909 | phase3-interaction-v3-115 | PASS | 拖拽、指定位置检测和完成记录完整。 |
| 910 | phase3-interaction-v3-116 | PASS | 图片可拖；附加目标区成功记录可执行。 |
| 911 | phase3-interaction-v3-117 | PASS | 拖拽、目标区域检测和成功记录完整。 |
| 912 | phase3-interaction-v3-118 | PASS | 拖拽、放对位置检测和完成记录完整。 |
| 913 | phase3-interaction-v3-119 | PASS | 拖拽、指定位置检测和完成记录完整。 |
| 914 | phase3-interaction-v3-120 | PASS | 图片可拖；附加目标区成功记录可执行。 |
| 915 | phase3-interaction-v3-121 | PASS | 拖拽、目标区域检测和成功记录完整。 |
| 916 | phase3-interaction-v3-122 | PASS | 拖拽、放对位置检测和完成记录完整。 |
| 917 | phase3-interaction-v3-123 | PASS | 拖拽、指定位置检测和完成记录完整。 |
| 918 | phase3-interaction-v3-124 | PASS | 图片可拖；附加目标区成功记录可执行。 |
| 919 | phase3-interaction-v3-125 | PASS | 拖拽、目标区域检测和成功记录完整。 |
| 920 | phase3-interaction-v3-126 | DSL_FIX | query 要进出动画，DSL 只有立即离场 `ANIM_OUT`。 |
| 921 | phase3-interaction-v3-127 | DSL_FIX | query 要出现和离开都顺滑，DSL 只有离场动画。 |
| 922 | phase3-interaction-v3-128 | DSL_FIX | query 只要柔和出现，DSL 却执行离场动画，方向相反。 |
| 923 | phase3-interaction-v3-129 | DSL_FIX | query 要慢慢出现再消失，DSL 只有离场动画。 |
| 924 | phase3-interaction-v3-130 | DSL_FIX | query 要进出动画，DSL 只有离场动画。 |
| 925 | phase3-interaction-v3-131 | DSL_FIX | query 要出现和离开都顺滑，DSL 只有离场动画。 |
| 926 | phase3-interaction-v3-132 | DSL_FIX | query 只要柔和出现，DSL 却执行离场动画。 |
| 927 | phase3-interaction-v3-133 | DSL_FIX | query 要慢慢出现再消失，DSL 只有离场动画。 |
| 928 | phase3-interaction-v3-134 | DSL_FIX | query 要进出动画，DSL 只有离场动画。 |
| 929 | phase3-interaction-v3-135 | DSL_FIX | query 要出现和离开都顺滑，DSL 只有离场动画。 |
| 930 | phase3-interaction-v3-136 | DSL_FIX | query 只要柔和出现，DSL 却执行离场动画。 |
| 931 | phase3-interaction-v3-137 | DSL_FIX | query 要慢慢出现再消失，DSL 只有离场动画。 |
| 932 | phase3-interaction-v3-138 | DSL_FIX | query 要进出动画，DSL 只有离场动画。 |
| 933 | phase3-interaction-v3-139 | DSL_FIX | query 要出现和离开都顺滑，DSL 只有离场动画。 |
| 934 | phase3-interaction-v3-140 | DSL_FIX | query 只要柔和出现，DSL 却执行离场动画。 |
| 935 | phase3-interaction-v3-141 | DSL_FIX | query 要慢慢出现再消失，DSL 只有离场动画。 |
| 936 | phase3-interaction-v3-142 | DSL_FIX | query 要进出动画，DSL 只有离场动画。 |
| 937 | phase3-interaction-v3-143 | DSL_FIX | query 要出现和离开都顺滑，DSL 只有离场动画。 |
| 938 | phase3-interaction-v3-144 | DSL_FIX | query 只要柔和出现，DSL 却执行离场动画。 |
| 939 | phase3-interaction-v3-145 | DSL_FIX | query 要慢慢出现再消失，DSL 只有离场动画。 |
| 940 | phase3-interaction-v3-146 | DSL_FIX | query 要进出动画，DSL 只有离场动画。 |
| 941 | phase3-interaction-v3-147 | DSL_FIX | query 要出现和离开都顺滑，DSL 只有离场动画。 |
| 942 | phase3-interaction-v3-148 | DSL_FIX | query 只要柔和出现，DSL 却执行离场动画。 |
| 943 | phase3-interaction-v3-149 | DSL_FIX | query 要慢慢出现再消失，DSL 只有离场动画。 |
| 944 | phase3-interaction-v3-150 | DSL_FIX | query 要进出动画，DSL 只有离场动画。 |
| 945 | phase3-interaction-v3-151 | PASS | 使用给定正反面资源立即执行 500ms 翻面。 |
| 946 | phase3-interaction-v3-152 | PASS | 正面到背面翻转及过渡完整。 |
| 947 | phase3-interaction-v3-153 | DSL_FIX | query 明确“点开后”翻面，DSL 立即翻转且没有注册 `CLICK`。 |
| 948 | phase3-interaction-v3-154 | PASS | 给定两张图片作为正反面并执行翻转。 |
| 949 | phase3-interaction-v3-155 | PASS | 使用给定资源执行翻面效果。 |
| 950 | phase3-interaction-v3-156 | PASS | 正面到背面翻转及 500ms 过渡完整。 |

Batch 019 汇总：`PASS 24`、`DSL_FIX 26`、`BOTH_FIX 0`、`QUERY_FIX 0`、`EXCLUDE 0`。本批尚未应用修订。

## Batch 020：记录 951–1000

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 951 | phase3-interaction-v3-157 | DSL_FIX | query 明确“点开后”翻面，DSL 立即翻转且没有 `CLICK`。 |
| 952 | phase3-interaction-v3-158 | PASS | 使用给定正反面图片执行翻转。 |
| 953 | phase3-interaction-v3-159 | PASS | 使用给定资源执行翻面效果。 |
| 954 | phase3-interaction-v3-160 | PASS | 正面到背面翻转及过渡完整。 |
| 955 | phase3-interaction-v3-161 | DSL_FIX | query 明确“点开后”翻面，DSL 没有点击触发。 |
| 956 | phase3-interaction-v3-162 | PASS | 使用给定正反面图片执行翻转。 |
| 957 | phase3-interaction-v3-163 | PASS | 使用给定资源执行翻面效果。 |
| 958 | phase3-interaction-v3-164 | PASS | 正面到背面翻转及过渡完整。 |
| 959 | phase3-interaction-v3-165 | DSL_FIX | query 明确“点开后”翻面，DSL 没有点击触发。 |
| 960 | phase3-interaction-v3-166 | PASS | 使用给定正反面图片执行翻转。 |
| 961 | phase3-interaction-v3-167 | PASS | 使用给定资源执行翻面效果。 |
| 962 | phase3-interaction-v3-168 | PASS | 正面到背面翻转及过渡完整。 |
| 963 | phase3-interaction-v3-169 | DSL_FIX | query 明确“点开后”翻面，DSL 没有点击触发。 |
| 964 | phase3-interaction-v3-170 | PASS | 使用给定正反面图片执行翻转。 |
| 965 | phase3-interaction-v3-171 | PASS | 使用给定资源执行翻面效果。 |
| 966 | phase3-interaction-v3-172 | PASS | 正面到背面翻转及过渡完整。 |
| 967 | phase3-interaction-v3-173 | DSL_FIX | query 明确“点开后”翻面，DSL 没有点击触发。 |
| 968 | phase3-interaction-v3-174 | PASS | 使用给定正反面图片执行翻转。 |
| 969 | phase3-interaction-v3-175 | PASS | 使用给定资源执行翻面效果。 |
| 970 | phase3-interaction-v3-176 | DSL_FIX | 初始设为选中但没有 overlay/effect，玩家仍看不出选中。 |
| 971 | phase3-interaction-v3-177 | PASS | 初始选中，点击可取消，变量随状态变化。 |
| 972 | phase3-interaction-v3-178 | PASS | 初始选中，后续点击可取消，变量同步。 |
| 973 | phase3-interaction-v3-179 | DSL_FIX | 没有任何选中视觉反馈，不满足“明显选中”。 |
| 974 | phase3-interaction-v3-180 | DSL_FIX | 只有内部选中状态，玩家无法从画面判断。 |
| 975 | phase3-interaction-v3-181 | PASS | 初始选中，点击可取消，变量随状态变化。 |
| 976 | phase3-interaction-v3-182 | PASS | 初始选中，后续点击可取消，变量同步。 |
| 977 | phase3-interaction-v3-183 | BOTH_FIX | query 有“路线选择选择效果”重复；DSL 也缺明显选中反馈。 |
| 978 | phase3-interaction-v3-184 | DSL_FIX | 只有内部选中状态，玩家无法从画面判断。 |
| 979 | phase3-interaction-v3-185 | PASS | 初始选中，点击可取消，变量随状态变化。 |
| 980 | phase3-interaction-v3-186 | PASS | 初始选中，后续点击可取消，变量同步。 |
| 981 | phase3-interaction-v3-187 | DSL_FIX | 没有任何选中视觉反馈，不满足“明显选中”。 |
| 982 | phase3-interaction-v3-188 | DSL_FIX | 只有内部选中状态，玩家无法从画面判断。 |
| 983 | phase3-interaction-v3-189 | PASS | 初始选中，点击可取消，变量随状态变化。 |
| 984 | phase3-interaction-v3-190 | PASS | 初始选中，后续点击可取消，变量同步。 |
| 985 | phase3-interaction-v3-191 | DSL_FIX | 没有任何选中视觉反馈，不满足“明显选中”。 |
| 986 | phase3-interaction-v3-192 | DSL_FIX | 只有内部选中状态，玩家无法从画面判断。 |
| 987 | phase3-interaction-v3-193 | PASS | 初始选中，点击可取消，变量随状态变化。 |
| 988 | phase3-interaction-v3-194 | PASS | 初始选中，后续点击可取消，变量同步。 |
| 989 | phase3-interaction-v3-195 | DSL_FIX | 没有任何选中视觉反馈，不满足“明显选中”。 |
| 990 | phase3-interaction-v3-196 | DSL_FIX | 只有内部选中状态，玩家无法从画面判断。 |
| 991 | phase3-interaction-v3-197 | PASS | 初始选中，点击可取消，变量随状态变化。 |
| 992 | phase3-interaction-v3-198 | PASS | 初始选中，后续点击可取消，变量同步。 |
| 993 | phase3-interaction-v3-199 | DSL_FIX | 没有任何选中视觉反馈，不满足“明显选中”。 |
| 994 | phase3-interaction-v3-200 | DSL_FIX | 只有内部选中状态，玩家无法从画面判断。 |
| 995 | phase3-interaction-v3-201 | BOTH_FIX | query 过于抽象；DSL 擅自选择交互、预设选中并立即淡出，且无清晰完成语义。 |
| 996 | phase3-interaction-v3-202 | BOTH_FIX | query 未定义操作方式/成功条件；DSL 擅自生成拖拽目标区和正确变量。 |
| 997 | phase3-interaction-v3-203 | BOTH_FIX | query 未定义具体完成行为；DSL 先立即翻到背面，点击又固定翻到背面，交互状态错误。 |
| 998 | phase3-interaction-v3-204 | BOTH_FIX | query 未定义具体交互；点击仅改内部 `seen`，并非“操作后给出”可见反馈。 |
| 999 | phase3-interaction-v3-205 | BOTH_FIX | query 过于抽象；DSL 擅自选择交互、预设选中并立即淡出，且无清晰完成语义。 |
| 1000 | phase3-interaction-v3-206 | BOTH_FIX | query 未定义操作方式/成功条件；DSL 擅自生成拖拽目标区和正确变量。 |

Batch 020 汇总：`PASS 26`、`DSL_FIX 17`、`BOTH_FIX 7`、`QUERY_FIX 0`、`EXCLUDE 0`。本批尚未应用修订。

## Batch 021：记录 1001–1050

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 1001 | phase3-interaction-v3-207 | BOTH_FIX | query 未定义具体完成行为；DSL 已先翻到背面，点击仍固定翻到背面。 |
| 1002 | phase3-interaction-v3-208 | BOTH_FIX | query 未定义具体交互；点击只写内部变量，没有操作后的可见反馈。 |
| 1003 | phase3-interaction-v3-209 | BOTH_FIX | query 过于抽象；DSL 擅自预选并立即淡出，无清晰完成语义。 |
| 1004 | phase3-interaction-v3-210 | BOTH_FIX | query 未定义操作/成功条件；DSL 擅自生成拖拽目标和正确变量。 |
| 1005 | phase3-interaction-v3-211 | BOTH_FIX | query 未定义具体完成行为；DSL 已先翻背，点击仍固定翻背。 |
| 1006 | phase3-interaction-v3-212 | BOTH_FIX | query 未定义具体交互；点击只写内部变量，没有可见反馈。 |
| 1007 | phase3-interaction-v3-213 | BOTH_FIX | query 过于抽象；DSL 擅自预选并立即淡出。 |
| 1008 | phase3-interaction-v3-214 | BOTH_FIX | query 未定义操作/成功条件；DSL 擅自生成拖拽判对。 |
| 1009 | phase3-interaction-v3-215 | BOTH_FIX | query 未定义具体完成行为；立即翻背破坏后续点击翻牌状态。 |
| 1010 | phase3-interaction-v3-216 | BOTH_FIX | query 未定义具体交互；点击只写 `seen`，不构成相应可见反馈。 |
| 1011 | phase3-interaction-v3-217 | BOTH_FIX | query 过于抽象；DSL 擅自预选并立即淡出。 |
| 1012 | phase3-interaction-v3-218 | BOTH_FIX | query 未定义操作/成功条件；DSL 擅自生成拖拽判对。 |
| 1013 | phase3-interaction-v3-219 | BOTH_FIX | query 未定义具体完成行为；立即翻背使点击翻牌状态错误。 |
| 1014 | phase3-interaction-v3-220 | BOTH_FIX | query 未定义具体交互；点击只写内部变量，没有可见反馈。 |
| 1015 | phase3-interaction-v3-221 | BOTH_FIX | query 过于抽象；DSL 擅自预选并立即淡出。 |
| 1016 | phase3-interaction-v3-222 | BOTH_FIX | query 未定义操作/成功条件；DSL 擅自生成拖拽目标和正确变量。 |
| 1017 | phase3-interaction-v3-223 | BOTH_FIX | query 未定义具体完成行为；立即翻背破坏点击翻牌状态。 |
| 1018 | phase3-interaction-v3-224 | BOTH_FIX | query 未定义具体交互；点击只写内部变量，没有可见反馈。 |
| 1019 | phase3-interaction-v3-225 | BOTH_FIX | query 过于抽象；DSL 擅自预选并立即淡出。 |
| 1020 | phase3-interaction-v3-226 | BOTH_FIX | query 未定义操作/成功条件；DSL 擅自生成拖拽判对。 |
| 1021 | phase3-interaction-v3-227 | BOTH_FIX | query 未定义具体完成行为；立即翻背使点击翻牌状态错误。 |
| 1022 | phase3-interaction-v3-228 | BOTH_FIX | query 未定义具体交互；点击只写内部变量，没有可见反馈。 |
| 1023 | phase3-interaction-v3-229 | BOTH_FIX | query 过于抽象；DSL 擅自预选并立即淡出。 |
| 1024 | phase3-interaction-v3-230 | BOTH_FIX | query 未定义操作/成功条件；DSL 擅自生成拖拽判对。 |
| 1025 | phase3-interaction-v3-231 | BOTH_FIX | query 未定义具体完成行为；立即翻背破坏点击翻牌状态。 |
| 1026 | phase3-interaction-v3-232 | BOTH_FIX | query 未定义具体交互；点击只写内部变量，没有可见反馈。 |
| 1027 | phase3-interaction-v3-233 | BOTH_FIX | query 过于抽象；DSL 擅自预选并立即淡出。 |
| 1028 | phase3-interaction-v3-234 | BOTH_FIX | query 未定义操作/成功条件；DSL 擅自生成拖拽判对。 |
| 1029 | phase3-interaction-v3-235 | BOTH_FIX | query 未定义具体完成行为；立即翻背使点击翻牌状态错误。 |
| 1030 | phase3-interaction-v3-236 | BOTH_FIX | query 未定义具体交互；点击只写内部变量，没有可见反馈。 |
| 1031 | phase3-interaction-v3-237 | BOTH_FIX | query 过于抽象；DSL 擅自预选并立即淡出。 |
| 1032 | phase3-interaction-v3-238 | BOTH_FIX | query 未定义操作/成功条件；DSL 擅自生成拖拽判对。 |
| 1033 | phase3-interaction-v3-239 | BOTH_FIX | query 未定义具体完成行为；立即翻背破坏点击翻牌状态。 |
| 1034 | phase3-interaction-v3-240 | BOTH_FIX | query 未定义具体交互；点击只写内部变量，没有可见反馈。 |
| 1035 | phase2-event-coordination-v3-001 | PASS | 15 秒独立事件每秒递减，答题点击非阻塞。 |
| 1036 | phase2-event-coordination-v3-002 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1037 | phase2-event-coordination-v3-003 | PASS | 25 秒独立倒计时且点击不阻塞。 |
| 1038 | phase2-event-coordination-v3-004 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1039 | phase2-event-coordination-v3-005 | PASS | 15 秒独立事件每秒递减，答题点击非阻塞。 |
| 1040 | phase2-event-coordination-v3-006 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1041 | phase2-event-coordination-v3-007 | PASS | 25 秒独立倒计时且点击不阻塞。 |
| 1042 | phase2-event-coordination-v3-008 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1043 | phase2-event-coordination-v3-009 | PASS | 15 秒独立事件每秒递减，答题点击非阻塞。 |
| 1044 | phase2-event-coordination-v3-010 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1045 | phase2-event-coordination-v3-011 | PASS | 25 秒独立倒计时且点击不阻塞。 |
| 1046 | phase2-event-coordination-v3-012 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1047 | phase2-event-coordination-v3-013 | PASS | 15 秒独立事件每秒递减，答题点击非阻塞。 |
| 1048 | phase2-event-coordination-v3-014 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1049 | phase2-event-coordination-v3-015 | PASS | 25 秒独立倒计时且点击不阻塞。 |
| 1050 | phase2-event-coordination-v3-016 | PASS | 10 秒逐秒倒计时与答题并行。 |

Batch 021 汇总：`PASS 16`、`DSL_FIX 0`、`BOTH_FIX 34`、`QUERY_FIX 0`、`EXCLUDE 0`。本批尚未应用修订。

## Batch 022：记录 1051–1100

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 1051 | phase2-event-coordination-v3-017 | PASS | 15 秒独立倒计时，答题点击非阻塞。 |
| 1052 | phase2-event-coordination-v3-018 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1053 | phase2-event-coordination-v3-019 | PASS | 25 秒独立倒计时且不打断答题。 |
| 1054 | phase2-event-coordination-v3-020 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1055 | phase2-event-coordination-v3-021 | PASS | 15 秒独立倒计时，答题点击非阻塞。 |
| 1056 | phase2-event-coordination-v3-022 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1057 | phase2-event-coordination-v3-023 | PASS | 25 秒独立倒计时且不打断答题。 |
| 1058 | phase2-event-coordination-v3-024 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1059 | phase2-event-coordination-v3-025 | PASS | 15 秒独立倒计时，答题点击非阻塞。 |
| 1060 | phase2-event-coordination-v3-026 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1061 | phase2-event-coordination-v3-027 | PASS | 25 秒独立倒计时且不打断答题。 |
| 1062 | phase2-event-coordination-v3-028 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1063 | phase2-event-coordination-v3-029 | PASS | 15 秒独立倒计时，答题点击非阻塞。 |
| 1064 | phase2-event-coordination-v3-030 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1065 | phase2-event-coordination-v3-031 | PASS | 25 秒独立倒计时且不打断答题。 |
| 1066 | phase2-event-coordination-v3-032 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1067 | phase2-event-coordination-v3-033 | PASS | 15 秒独立倒计时，答题点击非阻塞。 |
| 1068 | phase2-event-coordination-v3-034 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1069 | phase2-event-coordination-v3-035 | PASS | 25 秒独立倒计时且不打断答题。 |
| 1070 | phase2-event-coordination-v3-036 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1071 | phase2-event-coordination-v3-037 | PASS | 15 秒独立倒计时，答题点击非阻塞。 |
| 1072 | phase2-event-coordination-v3-038 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1073 | phase2-event-coordination-v3-039 | PASS | 25 秒独立倒计时且不打断答题。 |
| 1074 | phase2-event-coordination-v3-040 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1075 | phase2-event-coordination-v3-041 | PASS | 15 秒独立倒计时，答题点击非阻塞。 |
| 1076 | phase2-event-coordination-v3-042 | PASS | 20 秒计时与答题并行，HUD 每秒更新。 |
| 1077 | phase2-event-coordination-v3-043 | PASS | 25 秒独立倒计时且不打断答题。 |
| 1078 | phase2-event-coordination-v3-044 | PASS | 10 秒逐秒倒计时与答题并行。 |
| 1079 | phase2-event-coordination-v3-045 | PASS | 15 秒独立倒计时，答题点击非阻塞。 |
| 1080 | phase2-event-coordination-v3-046 | BOTH_FIX | 移除凭空创建的题目 UI；query 明确完成 signal，并改用真实 `audio/bgm/bgm.mp3`。 |
| 1081 | phase2-event-coordination-v3-047 | BOTH_FIX | 移除凭空创建的题目 UI；query 明确完成 signal，并改用真实 BGM。 |
| 1082 | phase2-event-coordination-v3-048 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，替换掌声资源。 |
| 1083 | phase2-event-coordination-v3-049 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，循环资源改为真实 BGM。 |
| 1084 | phase2-event-coordination-v3-050 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，掌声改为真实 BGM。 |
| 1085 | phase2-event-coordination-v3-051 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，并改用真实 BGM。 |
| 1086 | phase2-event-coordination-v3-052 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，替换掌声资源。 |
| 1087 | phase2-event-coordination-v3-053 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，循环资源改为真实 BGM。 |
| 1088 | phase2-event-coordination-v3-054 | BOTH_FIX | 移除虚构题目 UI；query 明确完成 signal，描述旁白改为真实 BGM。 |
| 1089 | phase2-event-coordination-v3-055 | BOTH_FIX | 移除虚构题目 UI；query 明确完成 signal，替换掌声资源。 |
| 1090 | phase2-event-coordination-v3-056 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，替换掌声资源。 |
| 1091 | phase2-event-coordination-v3-057 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，描述音频改为真实 BGM。 |
| 1092 | phase2-event-coordination-v3-058 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，掌声改为真实 BGM。 |
| 1093 | phase2-event-coordination-v3-059 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，替换掌声资源。 |
| 1094 | phase2-event-coordination-v3-060 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，替换掌声资源。 |
| 1095 | phase2-event-coordination-v3-061 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，循环资源改为真实 BGM。 |
| 1096 | phase2-event-coordination-v3-062 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，掌声改为真实 BGM。 |
| 1097 | phase2-event-coordination-v3-063 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，替换掌声资源。 |
| 1098 | phase2-event-coordination-v3-064 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，替换掌声资源。 |
| 1099 | phase2-event-coordination-v3-065 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，循环资源改为真实 BGM。 |
| 1100 | phase2-event-coordination-v3-066 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，掌声改为真实 BGM。 |

Batch 022 汇总：`PASS 29`、`DSL_FIX 0`、`BOTH_FIX 21`、`QUERY_FIX 0`、`EXCLUDE 0`。BGM 二次审计修订已落账。

## Batch 023：记录 1101–1150

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 1101 | phase2-event-coordination-v3-067 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，替换掌声资源。 |
| 1102 | phase2-event-coordination-v3-068 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，替换掌声资源。 |
| 1103 | phase2-event-coordination-v3-069 | BOTH_FIX | 移除虚构题目 UI；query 明确完成 signal，描述旁白改为真实 BGM。 |
| 1104 | phase2-event-coordination-v3-070 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，掌声改为真实 BGM。 |
| 1105 | phase2-event-coordination-v3-071 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，替换掌声资源。 |
| 1106 | phase2-event-coordination-v3-072 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，描述旁白改为真实 BGM。 |
| 1107 | phase2-event-coordination-v3-073 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，循环资源改为真实 BGM。 |
| 1108 | phase2-event-coordination-v3-074 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，掌声改为真实 BGM。 |
| 1109 | phase2-event-coordination-v3-075 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，替换掌声资源。 |
| 1110 | phase2-event-coordination-v3-076 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，替换掌声资源。 |
| 1111 | phase2-event-coordination-v3-077 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，循环资源改为真实 BGM。 |
| 1112 | phase2-event-coordination-v3-078 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，掌声改为真实 BGM。 |
| 1113 | phase2-event-coordination-v3-079 | BOTH_FIX | 移除虚构答案卡；query 明确完成 signal，替换掌声资源。 |
| 1114 | phase2-event-coordination-v3-080 | BOTH_FIX | 只保留 BGM 协调；query 明确完成 signal，替换掌声资源。 |
| 1115 | phase2-event-coordination-v3-081 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1116 | phase2-event-coordination-v3-082 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1117 | phase2-event-coordination-v3-083 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1118 | phase2-event-coordination-v3-084 | PASS | 提示持续呼吸，答题点击非阻塞。 |
| 1119 | phase2-event-coordination-v3-085 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1120 | phase2-event-coordination-v3-086 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1121 | phase2-event-coordination-v3-087 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1122 | phase2-event-coordination-v3-088 | PASS | 提示持续呼吸，答题点击非阻塞。 |
| 1123 | phase2-event-coordination-v3-089 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1124 | phase2-event-coordination-v3-090 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1125 | phase2-event-coordination-v3-091 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1126 | phase2-event-coordination-v3-092 | PASS | 提示持续呼吸，答题点击非阻塞。 |
| 1127 | phase2-event-coordination-v3-093 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1128 | phase2-event-coordination-v3-094 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1129 | phase2-event-coordination-v3-095 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1130 | phase2-event-coordination-v3-096 | PASS | 提示持续呼吸，答题点击非阻塞。 |
| 1131 | phase2-event-coordination-v3-097 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1132 | phase2-event-coordination-v3-098 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1133 | phase2-event-coordination-v3-099 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1134 | phase2-event-coordination-v3-100 | PASS | 提示持续呼吸，答题点击非阻塞。 |
| 1135 | phase2-event-coordination-v3-101 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1136 | phase2-event-coordination-v3-102 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1137 | phase2-event-coordination-v3-103 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1138 | phase2-event-coordination-v3-104 | PASS | 提示持续呼吸，答题点击非阻塞。 |
| 1139 | phase2-event-coordination-v3-105 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1140 | phase2-event-coordination-v3-106 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1141 | phase2-event-coordination-v3-107 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1142 | phase2-event-coordination-v3-108 | PASS | 提示持续呼吸，答题点击非阻塞。 |
| 1143 | phase2-event-coordination-v3-109 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1144 | phase2-event-coordination-v3-110 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1145 | phase2-event-coordination-v3-111 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1146 | phase2-event-coordination-v3-112 | PASS | 提示持续呼吸，答题点击非阻塞。 |
| 1147 | phase2-event-coordination-v3-113 | PASS | 背景提示独立上下浮动，答题点击非阻塞。 |
| 1148 | phase2-event-coordination-v3-114 | PASS | 提示独立呼吸动画，答题操作照常。 |
| 1149 | phase2-event-coordination-v3-115 | PASS | 背景提示独立上下浮动且不影响点击。 |
| 1150 | phase2-event-coordination-v3-116 | PASS | 点击加 5 分，事件立即更新文本并播放短音效。 |

Batch 023 汇总：`PASS 36`、`DSL_FIX 0`、`BOTH_FIX 14`、`QUERY_FIX 0`、`EXCLUDE 0`。BGM 二次审计修订已落账。

## Batch 024：记录 1151–1200

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 1151 | phase2-event-coordination-v3-117 | PASS | 点击加 10 分，文本和声明音效同步反馈。 |
| 1152 | phase2-event-coordination-v3-118 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1153 | phase2-event-coordination-v3-119 | PASS | 完成后加 20 分并立即更新显示、播放音效。 |
| 1154 | phase2-event-coordination-v3-120 | PASS | 点击加 5 分，文本和短音效同步反馈。 |
| 1155 | phase2-event-coordination-v3-121 | PASS | 点击加 10 分，分数与声音同步。 |
| 1156 | phase2-event-coordination-v3-122 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1157 | phase2-event-coordination-v3-123 | PASS | 完成后加 20 分并同步显示、音效。 |
| 1158 | phase2-event-coordination-v3-124 | PASS | 点击加 5 分，分数与短音效同步。 |
| 1159 | phase2-event-coordination-v3-125 | PASS | 点击加 10 分，分数与声音同步。 |
| 1160 | phase2-event-coordination-v3-126 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1161 | phase2-event-coordination-v3-127 | PASS | 完成后加 20 分并同步显示、音效。 |
| 1162 | phase2-event-coordination-v3-128 | PASS | 点击加 5 分，分数与短音效同步。 |
| 1163 | phase2-event-coordination-v3-129 | PASS | 点击加 10 分并使用声明音效反馈。 |
| 1164 | phase2-event-coordination-v3-130 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1165 | phase2-event-coordination-v3-131 | PASS | 完成后加 20 分并同步显示、音效。 |
| 1166 | phase2-event-coordination-v3-132 | PASS | 点击加 5 分并使用声明短音效。 |
| 1167 | phase2-event-coordination-v3-133 | PASS | 点击加 10 分，分数与声音同步。 |
| 1168 | phase2-event-coordination-v3-134 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1169 | phase2-event-coordination-v3-135 | PASS | 完成后加 20 分并同步显示、音效。 |
| 1170 | phase2-event-coordination-v3-136 | PASS | 点击加 5 分，分数与短音效同步。 |
| 1171 | phase2-event-coordination-v3-137 | PASS | 点击加 10 分，分数与声音同步。 |
| 1172 | phase2-event-coordination-v3-138 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1173 | phase2-event-coordination-v3-139 | PASS | 完成后加 20 分并同步显示、音效。 |
| 1174 | phase2-event-coordination-v3-140 | PASS | 点击加 5 分，分数与短音效同步。 |
| 1175 | phase2-event-coordination-v3-141 | PASS | 点击加 10 分，分数与声音同步。 |
| 1176 | phase2-event-coordination-v3-142 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1177 | phase2-event-coordination-v3-143 | PASS | 完成后加 20 分并同步显示、音效。 |
| 1178 | phase2-event-coordination-v3-144 | PASS | 点击加 5 分并使用声明短音效。 |
| 1179 | phase2-event-coordination-v3-145 | PASS | 点击加 10 分，分数与声音同步。 |
| 1180 | phase2-event-coordination-v3-146 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1181 | phase2-event-coordination-v3-147 | PASS | 完成后加 20 分并使用声明音效。 |
| 1182 | phase2-event-coordination-v3-148 | PASS | 点击加 5 分，分数与短音效同步。 |
| 1183 | phase2-event-coordination-v3-149 | PASS | 点击加 10 分，分数与声音同步。 |
| 1184 | phase2-event-coordination-v3-150 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1185 | phase2-event-coordination-v3-151 | PASS | 完成后加 20 分并同步显示、音效。 |
| 1186 | phase2-event-coordination-v3-152 | PASS | 点击加 5 分，分数与短音效同步。 |
| 1187 | phase2-event-coordination-v3-153 | PASS | 点击加 10 分，分数与声音同步。 |
| 1188 | phase2-event-coordination-v3-154 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1189 | phase2-event-coordination-v3-155 | PASS | 完成后加 20 分并同步显示、音效。 |
| 1190 | phase2-event-coordination-v3-156 | PASS | 点击加 5 分，分数与短音效同步。 |
| 1191 | phase2-event-coordination-v3-157 | PASS | 点击加 10 分，分数与声音同步。 |
| 1192 | phase2-event-coordination-v3-158 | DSL_FIX | 点击加分、显示和提示音成立，但遗漏“分数跳一下”的 bounce 动画。 |
| 1193 | phase2-event-coordination-v3-159 | PASS | 完成后加 20 分并使用声明音效。 |
| 1194 | phase2-event-coordination-v3-160 | PASS | 点击加 5 分，分数与短音效同步。 |
| 1195 | phase2-event-coordination-v3-161 | BOTH_FIX | 补答对清零，并在 query 明确 `answer_wrong_161` / `answer_correct_161` signals。 |
| 1196 | phase2-event-coordination-v3-162 | PASS | 错误累计到 2 后只提示一次。 |
| 1197 | phase2-event-coordination-v3-163 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1198 | phase2-event-coordination-v3-164 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1199 | phase2-event-coordination-v3-165 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1200 | phase2-event-coordination-v3-166 | PASS | 错误累计到 2 后只提示一次。 |

Batch 024 汇总：`PASS 46`、`DSL_FIX 0`、`BOTH_FIX 4`、`QUERY_FIX 0`、`EXCLUDE 0`。signal 二次审计修订已落账。

## Batch 025：记录 1201–1250

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 1201 | phase2-event-coordination-v3-167 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1202 | phase2-event-coordination-v3-168 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1203 | phase2-event-coordination-v3-169 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1204 | phase2-event-coordination-v3-170 | PASS | query 明确累计错 2 次，门槛与一次性提示正确。 |
| 1205 | phase2-event-coordination-v3-171 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1206 | phase2-event-coordination-v3-172 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1207 | phase2-event-coordination-v3-173 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1208 | phase2-event-coordination-v3-174 | PASS | query 明确累计错 2 次，门槛与一次性提示正确。 |
| 1209 | phase2-event-coordination-v3-175 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1210 | phase2-event-coordination-v3-176 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1211 | phase2-event-coordination-v3-177 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1212 | phase2-event-coordination-v3-178 | PASS | query 明确累计错 2 次，门槛与一次性提示正确。 |
| 1213 | phase2-event-coordination-v3-179 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1214 | phase2-event-coordination-v3-180 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1215 | phase2-event-coordination-v3-181 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1216 | phase2-event-coordination-v3-182 | PASS | query 明确累计错 2 次，门槛与一次性提示正确。 |
| 1217 | phase2-event-coordination-v3-183 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1218 | phase2-event-coordination-v3-184 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1219 | phase2-event-coordination-v3-185 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1220 | phase2-event-coordination-v3-186 | PASS | query 明确累计错 2 次，门槛与一次性提示正确。 |
| 1221 | phase2-event-coordination-v3-187 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1222 | phase2-event-coordination-v3-188 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1223 | phase2-event-coordination-v3-189 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1224 | phase2-event-coordination-v3-190 | PASS | query 明确累计错 2 次，门槛与一次性提示正确。 |
| 1225 | phase2-event-coordination-v3-191 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1226 | phase2-event-coordination-v3-192 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1227 | phase2-event-coordination-v3-193 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1228 | phase2-event-coordination-v3-194 | PASS | query 明确累计错 2 次，门槛与一次性提示正确。 |
| 1229 | phase2-event-coordination-v3-195 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1230 | phase2-event-coordination-v3-196 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1231 | phase2-event-coordination-v3-197 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1232 | phase2-event-coordination-v3-198 | PASS | query 明确累计错 2 次，门槛与一次性提示正确。 |
| 1233 | phase2-event-coordination-v3-199 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1234 | phase2-event-coordination-v3-200 | BOTH_FIX | 补答对清零，并在 query 明确两个答题 signals。 |
| 1235 | phase2-event-coordination-v3-201 | PASS | 每次加 5，10 分触发一次音效和烟花，门闩防重复。 |
| 1236 | phase2-event-coordination-v3-202 | PASS | 15 分触发一次烟花和声音，答题保持非阻塞。 |
| 1237 | phase2-event-coordination-v3-203 | PASS | 20 分触发一次庆祝，门闩正确。 |
| 1238 | phase2-event-coordination-v3-204 | PASS | 每次加 5，10 分触发声明音效和一次烟花。 |
| 1239 | phase2-event-coordination-v3-205 | PASS | 15 分触发一次庆祝，门闩防重复。 |
| 1240 | phase2-event-coordination-v3-206 | PASS | 20 分触发一次烟花和声音，继续答题不受阻。 |
| 1241 | phase2-event-coordination-v3-207 | PASS | 10 分触发一次声明音效和烟花。 |
| 1242 | phase2-event-coordination-v3-208 | PASS | 每次加 5，15 分触发一次庆祝。 |
| 1243 | phase2-event-coordination-v3-209 | PASS | 20 分触发一次庆祝，门闩防重复。 |
| 1244 | phase2-event-coordination-v3-210 | PASS | 10 分触发一次烟花和声音，答题非阻塞。 |
| 1245 | phase2-event-coordination-v3-211 | PASS | 15 分触发一次庆祝，门闩正确。 |
| 1246 | phase2-event-coordination-v3-212 | PASS | 每次加 5，20 分触发一次烟花和音效。 |
| 1247 | phase2-event-coordination-v3-213 | PASS | 10 分触发一次庆祝，门闩防重复。 |
| 1248 | phase2-event-coordination-v3-214 | PASS | 15 分触发一次烟花和声音，答题非阻塞。 |
| 1249 | phase2-event-coordination-v3-215 | PASS | 20 分触发一次庆祝，门闩正确。 |
| 1250 | phase2-event-coordination-v3-216 | PASS | 每次加 5，10 分触发一次烟花和音效。 |

Batch 025 汇总：`PASS 24`、`DSL_FIX 0`、`BOTH_FIX 26`、`QUERY_FIX 0`、`EXCLUDE 0`。signal 二次审计修订已全部落账。

## Batch 026：记录 1251–1300

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 1251 | phase2-event-coordination-v3-217 | PASS | 15 分触发一次庆祝，门闩防重复。 |
| 1252 | phase2-event-coordination-v3-218 | PASS | 20 分触发一次烟花和声音，答题非阻塞。 |
| 1253 | phase2-event-coordination-v3-219 | PASS | 10 分触发一次声明音效和烟花。 |
| 1254 | phase2-event-coordination-v3-220 | PASS | 每次加 5，15 分触发一次庆祝。 |
| 1255 | phase2-event-coordination-v3-221 | PASS | 20 分触发一次庆祝，门闩防重复。 |
| 1256 | phase2-event-coordination-v3-222 | PASS | 10 分触发一次声明音效和烟花。 |
| 1257 | phase2-event-coordination-v3-223 | PASS | 15 分触发一次庆祝，门闩正确。 |
| 1258 | phase2-event-coordination-v3-224 | PASS | 每次加 5，20 分触发一次庆祝。 |
| 1259 | phase2-event-coordination-v3-225 | PASS | 10 分触发一次庆祝，门闩防重复。 |
| 1260 | phase2-event-coordination-v3-226 | PASS | 15 分触发一次烟花和声音，答题非阻塞。 |
| 1261 | phase2-event-coordination-v3-227 | PASS | 20 分触发一次庆祝，门闩正确。 |
| 1262 | phase2-event-coordination-v3-228 | PASS | 每次加 5，10 分触发一次庆祝。 |
| 1263 | phase2-event-coordination-v3-229 | PASS | 15 分触发一次庆祝，门闩防重复。 |
| 1264 | phase2-event-coordination-v3-230 | PASS | 20 分触发一次烟花和声音，答题非阻塞。 |
| 1265 | phase2-event-coordination-v3-231 | PASS | 完成 3 次后仅触发一次 `NEXT`。 |
| 1266 | phase2-event-coordination-v3-232 | PASS | 每次推进 1，第 2 步仅跳关一次。 |
| 1267 | phase2-event-coordination-v3-233 | PASS | 第 3 次进度后自动进入下一关。 |
| 1268 | phase2-event-coordination-v3-234 | PASS | 每轮推进，第 2 阶段切换关卡。 |
| 1269 | phase2-event-coordination-v3-235 | PASS | 完成 3 次后仅触发一次 `NEXT`。 |
| 1270 | phase2-event-coordination-v3-236 | PASS | 每次推进 1，第 2 步仅跳关一次。 |
| 1271 | phase2-event-coordination-v3-237 | PASS | 第 3 次进度后自动进入下一关。 |
| 1272 | phase2-event-coordination-v3-238 | PASS | 每轮推进，第 2 阶段切换关卡。 |
| 1273 | phase2-event-coordination-v3-239 | PASS | 完成 3 次后仅触发一次 `NEXT`。 |
| 1274 | phase2-event-coordination-v3-240 | PASS | 每次推进 1，第 2 步仅跳关一次。 |
| 1275 | phase2-event-coordination-v3-241 | PASS | 第 3 次进度后自动进入下一关。 |
| 1276 | phase2-event-coordination-v3-242 | PASS | 每轮推进，第 2 阶段切换关卡。 |
| 1277 | phase2-event-coordination-v3-243 | PASS | 完成 3 次后仅触发一次 `NEXT`。 |
| 1278 | phase2-event-coordination-v3-244 | PASS | 每次推进 1，第 2 步仅跳关一次。 |
| 1279 | phase2-event-coordination-v3-245 | PASS | 第 3 次进度后自动进入下一关。 |
| 1280 | phase2-event-coordination-v3-246 | PASS | 每轮推进，第 2 阶段切换关卡。 |
| 1281 | phase2-event-coordination-v3-247 | PASS | 完成 3 次后仅触发一次 `NEXT`。 |
| 1282 | phase2-event-coordination-v3-248 | PASS | 每次推进 1，第 2 步仅跳关一次。 |
| 1283 | phase2-event-coordination-v3-249 | PASS | 第 3 次进度后自动进入下一关。 |
| 1284 | phase2-event-coordination-v3-250 | PASS | 每轮推进，第 2 阶段切换关卡。 |
| 1285 | phase2-event-coordination-v3-251 | PASS | 完成 3 次后仅触发一次 `NEXT`。 |
| 1286 | phase2-event-coordination-v3-252 | PASS | 每次推进 1，第 2 步仅跳关一次。 |
| 1287 | phase2-event-coordination-v3-253 | PASS | 第 3 次进度后自动进入下一关。 |
| 1288 | phase2-event-coordination-v3-254 | PASS | 每轮推进，第 2 阶段切换关卡。 |
| 1289 | phase2-event-coordination-v3-255 | PASS | 完成 3 次后仅触发一次 `NEXT`。 |
| 1290 | phase2-event-coordination-v3-256 | PASS | 15 秒并行计时、每次加 5、15 分一次庆祝均匹配。 |
| 1291 | phase2-event-coordination-v3-257 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5；补齐数值可消除歧义。 |
| 1292 | phase2-event-coordination-v3-258 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 10 秒。 |
| 1293 | phase2-event-coordination-v3-259 | QUERY_FIX | query 未给倒计时、加分和高分门槛，DSL 的 15/5/15 无唯一依据。 |
| 1294 | phase2-event-coordination-v3-260 | PASS | 20 秒并行计时、每次加 5、20 分一次庆祝均匹配。 |
| 1295 | phase2-event-coordination-v3-261 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1296 | phase2-event-coordination-v3-262 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 15 秒。 |
| 1297 | phase2-event-coordination-v3-263 | QUERY_FIX | query 未给倒计时、加分和门槛，DSL 的 20/5/20 无唯一依据。 |
| 1298 | phase2-event-coordination-v3-264 | PASS | 10 秒并行计时、每次加 5、10 分一次庆祝均匹配。 |
| 1299 | phase2-event-coordination-v3-265 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1300 | phase2-event-coordination-v3-266 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 20 秒。 |

Batch 026 汇总：`PASS 42`、`DSL_FIX 0`、`BOTH_FIX 0`、`QUERY_FIX 8`、`EXCLUDE 0`。本批尚未应用修订。

## Batch 027：记录 1301–1334

| # | sample_id | 状态 | 人工结论 |
|---:|---|---|---|
| 1301 | phase2-event-coordination-v3-267 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛，DSL 的 10/5/10 无唯一依据。 |
| 1302 | phase2-event-coordination-v3-268 | PASS | 15 秒计时、每次加 5、15 分一次庆祝均匹配。 |
| 1303 | phase2-event-coordination-v3-269 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1304 | phase2-event-coordination-v3-270 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 10 秒。 |
| 1305 | phase2-event-coordination-v3-271 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛。 |
| 1306 | phase2-event-coordination-v3-272 | PASS | 20 秒计时、每次加 5、20 分一次庆祝均匹配。 |
| 1307 | phase2-event-coordination-v3-273 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1308 | phase2-event-coordination-v3-274 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 15 秒。 |
| 1309 | phase2-event-coordination-v3-275 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛。 |
| 1310 | phase2-event-coordination-v3-276 | PASS | 10 秒计时、每次加 5、10 分一次庆祝均匹配。 |
| 1311 | phase2-event-coordination-v3-277 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1312 | phase2-event-coordination-v3-278 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 20 秒。 |
| 1313 | phase2-event-coordination-v3-279 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛。 |
| 1314 | phase2-event-coordination-v3-280 | PASS | 15 秒计时、每次加 5、15 分一次庆祝均匹配。 |
| 1315 | phase2-event-coordination-v3-281 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1316 | phase2-event-coordination-v3-282 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 10 秒。 |
| 1317 | phase2-event-coordination-v3-283 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛。 |
| 1318 | phase2-event-coordination-v3-284 | PASS | 20 秒计时、每次加 5、20 分一次庆祝均匹配。 |
| 1319 | phase2-event-coordination-v3-285 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1320 | phase2-event-coordination-v3-286 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 15 秒。 |
| 1321 | phase2-event-coordination-v3-287 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛。 |
| 1322 | phase2-event-coordination-v3-288 | PASS | 10 秒计时、每次加 5、10 分一次庆祝均匹配。 |
| 1323 | phase2-event-coordination-v3-289 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1324 | phase2-event-coordination-v3-290 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 20 秒。 |
| 1325 | phase2-event-coordination-v3-291 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛。 |
| 1326 | phase2-event-coordination-v3-292 | PASS | 15 秒计时、每次加 5、15 分一次庆祝均匹配。 |
| 1327 | phase2-event-coordination-v3-293 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1328 | phase2-event-coordination-v3-294 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 10 秒。 |
| 1329 | phase2-event-coordination-v3-295 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛。 |
| 1330 | phase2-event-coordination-v3-296 | PASS | 20 秒计时、每次加 5、20 分一次庆祝均匹配。 |
| 1331 | phase2-event-coordination-v3-297 | QUERY_FIX | query 未说明每次加分值，DSL 固定为 5。 |
| 1332 | phase2-event-coordination-v3-298 | QUERY_FIX | query 未给倒计时长度，DSL 任意选择 15 秒。 |
| 1333 | phase2-event-coordination-v3-299 | QUERY_FIX | query 未给倒计时、加分值和庆祝门槛。 |
| 1334 | phase2-event-coordination-v3-300 | PASS | 10 秒计时、每次加 5、10 分一次庆祝均匹配。 |

Batch 027 汇总：`PASS 9`、`DSL_FIX 0`、`BOTH_FIX 0`、`QUERY_FIX 25`、`EXCLUDE 0`。本批尚未应用修订。
