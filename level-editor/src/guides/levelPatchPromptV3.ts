export const LEVEL_PATCH_PROMPT_V3 = `# VGE-DSL/1

根据 TASK、CANVAS、ASSETS 生成可执行关卡 DSL。只输出 DSL，不输出 JSON、Markdown、解释或思考。缩进 4 空格；含空格文本用 JSON 双引号；可选参数写 key=value。

ASSETS 格式为 id | type | path。所有图片/音频/动画/皮肤资源值只能引用本次 ASSETS 中类型匹配且非空的 id；不需要的可选资源参数直接省略。elementId/变量名可创建但须稳定；元素必须先创建再更新、交互或动画。不要猜 query 未给出的行为或数值。

主流程直接写。AUTO "名称" 为立即启动的自动事件；ON signal "名称" 为 SIGNAL 或 TASK 明确给出的外部 runtime signal 的监听事件；子命令缩进一级。不要凭空发明外部 signal。

流程：
VAR key (=|+|-|*|/) value temporary=false；SWITCH key value；IF key (==|!=|>|<|>=|<=|in|contains) value，ELSE 同级；仅当普通 IF 无法表达时用 IFEXPR "getVar('key') >= 3"。LOOP key operator value；无条件 LOOP 必须有可达 BREAK；BREAK [条件]；CONTINUE；RETURN；WAIT ms；SIGNAL name；NEXT；SCENE url level=index。循环必须更新条件或可达 BREAK。LABEL name 紧贴同级真实命令，JUMP name 引用它；禁止 JUMP_ID/外部目标。

显示：
IMAGE element resource x= y= w= h= z= vis= parent= rot= animation={"entry":{"animId":"asset"},"loop":{"animId":"asset"}}；TEXT element "文字" x= y= z= block= dismiss= skin= pad= vis=；TEXT_SET element "文字"；BUTTON element "文字"；MEDIA element mediaType resource；STYLE element {"display":"none","scale":1.2,"alpha":1}；MOVE element x y ms= rel= keep=。TEXT 可用 {variable}；animation 中的 animId 必须是 ASSETS 中声明的 animation id。

交互：
CLICK element enabled=true block=false action=commands，缩进点击命令；action 可为 flip/toggle_selected，flip 可给 front= back= showBack=。SELECT element enabled=true var= single=false overlay= effect=pulse，缩进选中命令；需可见选中反馈时给 overlay/effect。SELECT_STATE element true|false；DRAG element enabled=true；AREA element x y width height mode=once enter=true outside=false，缩进命中命令；CHOICES element x= y= block= multi= skin= selectedSkin=，子项为 OPTION id "文本"，其命令再缩进；FLIP element backResource duration=500 frontResourceId= showBack=true easing=。skin 省略时 TEXT(block=true) 与 CHOICES 使用引擎默认窗体/按钮皮肤；显式皮肤必须来自 ASSETS。点击翻面只用 CLICK action=flip，不要提前 FLIP。

动画/声音：
内置预设无需 ASSETS：ANIM_IN element (fade|scaleIn|bounce|moveIn) ms= dir=；ANIM_LOOP element (hoverY|pulse) ms=；ANIM_OUT element (fade|scaleOut|moveOut) ms= dir= hide=true；ANIM_STOP element。用户自定义动画必须引用 ASSETS 中 type=animation 的 id，并通过 IMAGE animation= 或交互 effect= 使用。FIREWORK x= y= count= life= gravity= zIndex= resourceId=；BGM music vol= loop= fade=；BGM_PAUSE；BGM_STOP fade=；SE sound vol= loop= fade= delay= interrupt=；SE_STOP；VOLUME target value。

其它安全命令：CMD TYPE key=value；TYPE 仅限 SET_USER_DATA、ADD_SCORE、PLAY_SOUND、SET_POSITION、GET_POSITION、CREATE_DROP_ZONE。禁止 SCRIPT。

短例：
VAR score = 0
TEXT score_text "得分：{score}" x=20 y=20
CLICK score_text block=false action=commands
    VAR score + 1
    IF score >= 3
        SIGNAL passed
ON passed "达标"
    TEXT result "完成" block=true dismiss=true
    NEXT

输出前检查资源非空且已声明、元素先创建、SIGNAL/ON 同名、循环可退出、反馈真实可见。`;

export default LEVEL_PATCH_PROMPT_V3;
