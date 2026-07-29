# Human Scene First-Level DSL Export

Purpose: compact source material for DeepSeek to inspect real human-authored level trajectories without sending full scene JSON.

Scene count: 15

## 1. 新场景

- scene_file: `农具速记.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `8` top-level commands, `4` events
- omitted unsupported old commands: `2`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-____ | image | images/G1001-农具速记挑战/intro-农具速记.png | intro-农具速记 |
| 1001-__ | audio | audio/se/1001-描述.mp3 | 1001-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______2 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___1 | image | images/返回.png | 返回 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| 1001-___2 | audio | audio/se/1001-问诊.mp3 | 1001-问诊 |
| _____8 | image | images/old/继续按钮.png | 继续按钮 |
| __05 | image | images/G1001-农具速记挑战/农具05.png | 农具05 |
| 1001-___1 | audio | audio/se/1001-问题.mp3 | 1001-问题 |
| __01 | image | images/G1001-农具速记挑战/农具01.png | 农具01 |
| check-circle | image | images/测试资源/check-circle.svg | check-circle |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |

### First-Level DSL

```vge-dsl
VAR cntveg = 0
VAR cntfruit = 0
VAR victory = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=399 h=490 z=0 vis=true parent=""
BGM 1001-__ vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON start "倒计时"
    VAR countdown = 21
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"32","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=710 y=5 block=false dismiss=true pad=20
    IMAGE clockbg _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IFEXPR "getVar('victory') == false"
            WAIT 1000
            VAR countdown - 1
            TEXT_SET countdown-text ${countdown}s
            JUMP L1
    ELSE
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=102 vis=true parent=""
        IMAGE failwindow _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=103 vis=true parent=""
        CLICK failwindow effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this

ON gameloop "读题阶段"
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    BGM 1001-___2 vol=0.8 loop=false fade=0
    TEXT story-text "请记住下图中的农具：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=180 block=false dismiss=true skin="" pad=14
    SIGNAL start data=""
    IMAGE submit-btn _____8 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_13_3smw x=300 y=500 w=170 h=40 z=3 vis=true parent=""
    IMAGE item1 __05 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=286 y=264 w=159 h=88 z=0 vis=true parent="" rot=0
    CLICK submit-btn effect="" enabled=true front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        STYLE submit_btn {"display":"none","zIndex":0,"scale":0}
        STYLE item1 {"display":"none","zIndex":0,"scale":0}
        SIGNAL answer data=""

ON answer "作答阶段"
    TEXT_SET story-text "请问刚才出现的农具是以下哪一个？"
    BGM 1001-___1 vol=0.8 loop=false fade=0
    STYLE submit-btn {"display":"none"}
    IMAGE submit-btn2 _____8 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_13_3smw x=300 y=500 w=170 h=40 z=3 vis=true parent=""
    IMAGE show_image_1 __05 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=188 y=264 w=142 h=142 z=0 vis=true parent="" rot=0
    IMAGE show_image_2 __01 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=500 y=264 w=174 h=96 z=0 vis=true parent="" rot=0
    SELECT show_image_1 effect=___5 onCancelSelectedCommands=[] enabled=true var=card1_selected single=true overlay=check-circle
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    SELECT show_image_2 effect=___5 onCancelSelectedCommands=[] enabled=true var=card2_selected single=true overlay=check-circle
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    CLICK submit-btn2 effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        IFEXPR "getVar('card1_selected') == false &&\ngetVar('card2_selected') == false &&\ngetVar('card3_selected') == false"
            SIGNAL toast data="'请点击图片，选择一个物品。'"
        ELSE
            IF card1_selected == true
                VAR victory = true
                IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=100 vis=true parent=""
                IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=100 vis=true parent=""
                SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
                CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                    NEXT
            ELSE
                IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=102 vis=true parent=""
                IMAGE failwindow _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=103 vis=true parent=""
                CLICK failwindow effect="" enabled=true block=true front="" back="" showBack=true
                    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
                    SCENE this

ON toast toast
    IF toast_init != true
        TEXT toast ${$1} id=show_text_1 style={"fontSize":"24px","color":"#ff0000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":999,"textAlign":"left"} x=260 y=275 block=false dismiss=true skin="" pad=20
        VAR toast_init = true
    VAR toast_running = true
    WAIT 100
    TEXT_SET toast ${$1}
    VAR toast_running = false
```

## 2. 新场景

- scene_file: `各就各位.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `6` top-level commands, `3` events
- omitted unsupported old commands: `0`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-1008____ | image | images/G1008-各就各位/intro-1008各就各位.png | intro-1008各就各位 |
| 1008-__ | audio | audio/se/1008-描述.mp3 | 1008-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| ___1 | image | images/返回.png | 返回 |
| _______2 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| 1008-___1 | audio | audio/se/1008-问诊.mp3 | 1008-问诊 |
| ____2 | image | images/G1008-各就各位/晾衣绳.png | 晾衣绳 |
| _____2 | animation | animations/基础效果/上下悬浮.json | 上下悬浮 |
| ___ | image | images/G1008-各就各位/保温杯.png | 保温杯 |
| ____ | animation | animations/基础效果/从零放大.json | 从零放大 |
| ___7 | image | images/G1008-各就各位/肥皂.png | 肥皂 |
| ____1 | image | images/G1008-各就各位/垃圾桶.png | 垃圾桶 |
| ___8 | image | images/G1008-各就各位/毛巾.png | 毛巾 |
| ______ | image | images/old/通用继续按钮.png | 通用继续按钮 |
| 1008-__-___3 | audio | audio/se/1008-问题-第一.mp3 | 1008-问题-第一 |
| ___11 | image | images/G1008-各就各位/问号.png | 问号 |
| _____9 | image | images/G1008-各就各位/选择背景.png | 选择背景 |
| ___9 | image | images/G1008-各就各位/木桶.png | 木桶 |
| ____4 | image | images/G1008-各就各位/喷雾剂.png | 喷雾剂 |
| ____3 | image | images/G1008-各就各位/马桶杯.png | 马桶杯 |
| ___10 | image | images/G1008-各就各位/纸巾.png | 纸巾 |
| check-circle | image | images/测试资源/check-circle.svg | check-circle |

### First-Level DSL

```vge-dsl
VAR "已胜利" = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-1008____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=399 h=490 z=0 vis=true parent="" rot=0
BGM 1008-__ vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON "倒计时" "倒计时&胜负判定"
    VAR "是否结束读题" = false
    VAR countdown = 10
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"28","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=715 y=10 block=false dismiss=true pad=20
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    IMAGE clockbg _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "分数" == 6
            WAIT 2000
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        WAIT 1000
        VAR countdown - 1
        IFEXPR "getVar('countdown') > 9"
            TEXT_SET countdown-text ${countdown}s
        ELSE
            TEXT_SET countdown-text 0${countdown}s
        JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL fail data=""
            SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
            IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
            VAR "失败已执行" = true
            CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
                SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
                SCENE this

ON gameloop "读题阶段"
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    BGM 1008-___1 vol=0.8 loop=false fade=0
    TEXT story-text "请记住以下物品的摆放顺序：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=160 block=false dismiss=true skin="" pad=14
    SIGNAL "倒计时" data=""
    VAR "分数" = 0
    IMAGE bg2 ____2 animation={"loop":{"animId":""},"entry":{"animId":"_____2","duration":300}} id=show-c1 x=210 y=200 w=375 h=138 z=1 vis=true
    IMAGE c1 ___ align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=240 y=240 w=32 h=81 z=1 vis=true parent=""
    WAIT 444
    IMAGE c2 ___7 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=310 y=240 w=81 h=80 z=1 vis=true parent=""
    WAIT 444
    IMAGE c3 ____1 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=420 y=230 w=66 h=78 z=1 vis=true parent=""
    WAIT 444
    IMAGE c4 ___8 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=500 y=240 w=78 h=78 z=1 vis=true parent=""
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=326 y=545 w=146 h=36 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "作答阶段"
    VAR countdown = 30
    TEXT_SET countdown-text ${countdown}s
    STYLE con {"display":"none","zIndex":"","scale":""}
    STYLE foodtext {"display":"none","zIndex":"","scale":""}
    BGM 1008-__-___3 vol=0.8 loop=false fade=0
    TEXT_SET story-text "请选择第1个位置出现的物品（单选）"
    VAR "选择正确" = false temporary=false
    IMAGE cardmask ___11 animation={"entry":{"animId":"","duration":0},"loop":{"animId":"","duration":0}} id=show_image_3 x=210 y=230 w=90 h=90 z=90 vis=true parent="" rot=0
    WAIT 400
    IMAGE bg _____9 animation={"loop":{"animId":""},"entry":{"animId":"_____2","duration":333}} id=show-c1 x=215 y=345 w=355 h=197 z=1 vis=true
    IMAGE b1 ___9 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=220 y=360 w=93 h=79 z=1 vis=true parent="" rot=0
    WAIT 100
    IMAGE b2 ___7 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=310 y=360 w=81 h=80 z=1 vis=true parent=""
    WAIT 100
    IMAGE b3 ____1 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=410 y=360 w=66 h=78 z=1 vis=true parent=""
    WAIT 100
    IMAGE b4 ___8 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=500 y=360 w=78 h=78 z=1 vis=true parent=""
    WAIT 100
    IMAGE b5 ___ align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=250 y=460 w=31 h=80 z=1 vis=true parent="" rot=0
    WAIT 100
    IMAGE b6 ____4 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=330 y=450 w=40 h=80 z=1 vis=true parent=""
    WAIT 100
    IMAGE b7 ____3 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=420 y=450 w=52 h=80 z=1 vis=true parent=""
    WAIT 100
    IMAGE b8 ___10 align="" animation={"entry":{"animId":"____"},"loop":{"animId":""}} id=show_image_1 x=490 y=475 w=80 h=54 z=1 vis=true parent=""
    SELECT b1 clickGuardMs=0 effect=___5 onCancelSelectedCommands=[] enabled=true var="" single=true overlay=check-circle
    SELECT b2 clickGuardMs=0 effect=___5 onCancelSelectedCommands=[] enabled=true var="" single=true overlay=check-circle
    SELECT b3 clickGuardMs=0 effect=___5 onCancelSelectedCommands=[] enabled=true var="" single=true overlay=check-circle
    SELECT b4 clickGuardMs=0 effect=___5 onCancelSelectedCommands=[] enabled=true var="" single=true overlay=check-circle
    SELECT b5 clickGuardMs=0 effect=___5 onCancelSelectedCommands=[{"id":"set_variable_6","type":"SET_VARIABLE","parameters":{"key":"选择正确","op":"set","value":false,"temporary":false}}] enabled=true var="" single=true overlay=check-circle
        VAR "选择正确" = true temporary=false
    SELECT b6 clickGuardMs=0 effect=___5 onCancelSelectedCommands=[] enabled=true var="" single=true overlay=check-circle
    SELECT b7 clickGuardMs=0 effect=___5 onCancelSelectedCommands=[] enabled=true var="" single=true overlay=check-circle
    SELECT b8 clickGuardMs=0 effect=___5 onCancelSelectedCommands=[] enabled=true var="" single=true overlay=check-circle
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=330 y=545 w=141 h=35 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        IF "选择正确" == true
            VAR victory = true
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=100 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=100 vis=true parent=""
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        ELSE
            SIGNAL fail data=""
            SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
            IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
            VAR "失败已执行" = true
            CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
                SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
                SCENE this
```

## 3. 新场景

- scene_file: `小小药剂师.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `16` top-level commands, `4` events
- omitted unsupported old commands: `0`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ____a | image | images/全局背景a.png | 全局背景a |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| _______2 | image | images/游戏规则背景.png | 游戏规则背景 |
| 1002-__ | unknown |  | 1002-__ |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| 0001_01-___1 | audio | audio/se/0001_01-问诊.mp3 | 0001_01-问诊 |
| __01 | image | images/G0001-小小药剂师/咨询01.png | 咨询01 |
| ______ | image | images/old/通用继续按钮.png | 通用继续按钮 |
| 0001_01-__ | audio | audio/se/0001_01-问题.mp3 | 0001_01-问题 |
| ____01 | image | images/G0001-小小药剂师/咨询药柜01.png | 咨询药柜01 |
| btn-primary-9slice | unknown |  | btn-primary-9slice |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| _____9 | image | images/old/返回图标.png | 返回图标 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |

### First-Level DSL

```vge-dsl
IMAGE background ____a align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce _______2 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=210 y=90 w=396 h=440 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_1 "欢迎来到 《小小药剂师》 您的健康守护者! 游戏简介: 在《小小药剂师》中，您 将扮演药剂师的角色，帮 助人们识别和使用药物。" id=show_text_1 style={"fontSize":"24","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=270 y=170 block=false dismiss=true skin="" pad=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE introduce {"display":"none","scale":0}
STYLE show_text_1 {"display":"none","scale":0}
IMAGE introduce2 _______2 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=210 y=90 w=396 h=440 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_2 "在本轮游戏中，您将扮 演一名药剂师， 需要根 据患者提供的取药需求， 帮助患者找到对应的药 物！ 准备好了吗?" id=show_text_1 style={"fontSize":"27","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=270 y=170 block=false dismiss=true skin="" pad=0
CLICK introduce2 effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE show_text_2 {"display":"none","scale":0}
STYLE introduce2 {"display":"none","scale":0}
STYLE mask {"display":"none","scale":0}
SIGNAL gamestart data=""

ON gamestart "读题阶段"
    VAR "是否结束读题" = false
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#ffffff","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":true,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=10 block=false dismiss=true skin="" pad=14
    BGM 0001_01-___1 vol=0.8 loop=false fade=0
    TEXT story-text "医生，您好，我是张三，请帮我拿这个药。  处方单：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=40 y=110 block=false dismiss=true skin="" pad=14
    SIGNAL "计时开始" data=""
    IMAGE "咨询" __01 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=170 y=160 w=334 h=388 z=0 vis=true parent=""
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=555 y=300 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "答题阶段"
    VAR countdown = 30
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    BGM 0001_01-__ vol=0.8 loop=false fade=0
    TEXT_SET story-text "请从以下药品中选择出张三需要的药。（单选）"
    IMAGE "咨询" ____01 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=170 y=160 w=381 h=271 z=0 vis=true parent=""
    STYLE con {"display":"none"}
    CHOICES show_choices_1 id=show_choices_1 ui={"rowMax":3,"gapX":16,"gapY":12,"minWidth":30,"fontSize":32,"maxWidth":300,"paddingX":24,"paddingY":16,"color":"#ffffff"} x=130 y=450 block=false skin=btn-primary-9slice
        OPTION option_1 "第一瓶"
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            VAR "已胜利" = true
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=110 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        OPTION option_2 "第二瓶"
            SIGNAL fail data=""
        OPTION option_3 "第三瓶"
            SIGNAL fail data=""

ON fail "失败处理"
    IF "失败已执行" != true
        SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
        VAR "失败已执行" = true
        CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this

ON "计时开始" "倒计时"
    VAR countdown = 20
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"20","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=735 y=10 block=false dismiss=true pad=20
    IMAGE fanhui _____9 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=20 y=10 w=25 h=40 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "已胜利" == true
            WAIT 0
        ELSE
            WAIT 1000
            VAR countdown - 1
            IFEXPR "getVar('countdown') > 9"
                TEXT_SET countdown-text ${countdown}s
            ELSE
                TEXT_SET countdown-text 0${countdown}s
            JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL fail data=""
```

## 4. 新场景

- scene_file: `小笼包派对.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `6` top-level commands, `5` events
- omitted unsupported old commands: `0`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-_____ | image | images/G1007-小笼包派对/intro-小笼包派对.png | intro-小笼包派对 |
| 1007-__ | audio | audio/se/1007-描述.mp3 | 1007-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| ___1 | image | images/返回.png | 返回 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____15 | image | images/G1007-小笼包派对/桌子背景.png | 桌子背景 |
| ____1 | image | images/G1007-小笼包派对/小笼包.png | 小笼包 |
| ______Q_ | animation | animations/复合动画/包子下滑入_Q弹.json | 包子下滑入_Q弹 |
| _______2 | image | images/old/通用按钮背景.png | 通用按钮背景 |
| btn-primary-9slice | unknown |  | btn-primary-9slice |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |

### First-Level DSL

```vge-dsl
VAR "已胜利" = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-_____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=399 h=490 z=0 vis=true parent=""
BGM 1007-__ vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON "倒计时" "倒计时"
    VAR "是否结束读题" = false
    VAR countdown = 10
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"28","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=715 y=10 block=false dismiss=true pad=20
    TEXT cnt2 " ${countdown}秒后游戏开始" id=countdown-text-show style={"fontSize":"24","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":0,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=495 y=315 block=false dismiss=true pad=20
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "分数" == 6
            WAIT 2000
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        WAIT 1000
        VAR countdown - 1
        IFEXPR "getVar('countdown') > 9"
            TEXT_SET countdown-text ${countdown}s
            IF "是否结束读题" == false
                TEXT_SET cnt2 " ${countdown}秒后游戏开始"
            ELSE
                TEXT_SET cnt2 " ${countdown}秒后游戏结束"
        ELSE
            TEXT_SET countdown-text 0${countdown}s
            IF "是否结束读题" == false
                TEXT_SET cnt2 " 0${countdown}秒后游戏开始"
            ELSE
                TEXT_SET cnt2 " 0${countdown}秒后游戏结束"
        JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL lose data=""

ON gameloop "读题阶段"
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    TEXT story-text "请问图上一共有多少个包子？" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=160 block=false dismiss=true skin="" pad=14
    SIGNAL "倒计时" data=""
    VAR cnt = 0 temporary=false
    VAR "cnt-不需要" = 0 temporary=false
    IMAGE "桌子" _____15 animation={"loop":{"animId":""}} id=show-c1 x=120 y=340 w=283 h=161 z=1 vis=true
    WAIT 600
    IMAGE baozi ____1 animation={"loop":{"animId":""},"entry":{"animId":"______Q_","duration":420}} id=show-c1 x=215 y=300 w=90 h=68 z=1 vis=true rot=0
    IMAGE submit-btn _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_13_3smw x=480 y=350 w=203 h=46 z=3 vis=true parent=""
    CLICK submit-btn effect="" enabled=true block=false front="" back="" showBack=true
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "作答阶段"
    VAR countdown = 30
    TEXT_SET cnt2 " ${countdown}秒后游戏结束"
    STYLE submit-btn {"display":"none","zIndex":0,"scale":0}
    CHOICES show_choices_1 id=show_choices_1 ui={"rowMax":1,"gapX":20,"gapY":12,"minWidth":120,"fontSize":24,"maxWidth":300,"paddingX":12,"paddingY":8,"color":"#ffffff"} x=570 y=270 block=false multi=false skin=btn-primary-9slice selectedSkin=""
        OPTION option_1 "1个"
            SIGNAL lose data=""
        OPTION option_2 "2个"
            SIGNAL lose data=""
        OPTION option_3 "3个"
            SIGNAL lose data=""
        OPTION option_4 "4个"
            SIGNAL win data=""

ON win "胜"
    VAR victory = true
    IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
    IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=101 vis=true parent=""
    SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
    CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
        NEXT

ON lose "负"
    SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
    IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
    IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
    VAR "失败已执行" = true
    CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE this
```

## 5. 新场景

- scene_file: `手疾眼快.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `9` top-level commands, `4` events
- omitted unsupported old commands: `5`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-1006____ | image | images/G1006-眼疾手快分类赛/intro-1006眼疾手快.png | intro-1006眼疾手快 |
| 1006-__ | audio | audio/se/1006-描述.mp3 | 1006-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______3 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___1 | image | images/返回.png | 返回 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |
| 1006-___1 | audio | audio/se/1006-问题.mp3 | 1006-问题 |
| _____ | image | images/G1006-眼疾手快分类赛/购物车背景.png | 购物车背景 |
| ___3 | animation | animations/基础效果/弹入.json | 弹入 |
| __01 | image | images/G1006-眼疾手快分类赛/物品01.png | 物品01 |
| __02 | image | images/G1006-眼疾手快分类赛/物品02.png | 物品02 |
| __03 | image | images/G1006-眼疾手快分类赛/物品03.png | 物品03 |
| __A | image | images/G1006-眼疾手快分类赛/盘子A.png | 盘子A |
| __B | image | images/G1006-眼疾手快分类赛/盘子B.png | 盘子B |
| __C | image | images/G1006-眼疾手快分类赛/盘子C.png | 盘子C |
| _______2 | image | images/old/通用按钮背景.png | 通用按钮背景 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |

### First-Level DSL

```vge-dsl
VAR cnt1 = 0 temporary=false
VAR cnt2 = 0 temporary=false
VAR cnt3 = 0 temporary=false
VAR victory = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-1006____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=399 h=490 z=0 vis=true parent=""
BGM 1006-__ vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON start "倒计时"
    VAR countdown = 30 temporary=false
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"32","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=710 y=5 block=false dismiss=true pad=20
    IMAGE clockbg _______3 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    TEXT cnt2 " ${countdown}秒后游戏结束" id=countdown-text-show style={"fontSize":"26","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":0,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=240 y=480 block=false dismiss=true pad=20
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IFEXPR "getVar('victory') == false"
            WAIT 1000
            VAR countdown - 1
            TEXT_SET countdown-text ${countdown}s
            TEXT_SET cnt2 " ${countdown}秒后游戏结束"
            JUMP L1
    ELSE
        SIGNAL final data=""

ON gameloop gameloop
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    BGM 1006-___1 vol=0.8 loop=false fade=0
    TEXT story-text "请将购物车物品放置到对应餐盘：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=180 block=false dismiss=true skin="" pad=14
    SIGNAL start data=""
    IMAGE bg _____ align="" animation={"entry":{"animId":"___3"},"loop":{"animId":""}} id=cmd_mfvtmst5_95xu_0_i7ja x=50 y=250 w=409 h=231 z=2 vis=true parent=""
    VAR ycurindex = 1 temporary=false
    VAR rcurindex = 20 temporary=false
    VAR gcurindex = 60 temporary=false
    LOOP
        BREAK ycurindex >= 1
        IMAGE dyn_ycurindex __01 align="" animation={"entry":{"animId":"___3"},"loop":{"animId":""}} id=cmd_mfvtmst5_95xu_0_i7ja x=180 y=300 w=69 h=74 z=2 vis=true parent="" rot=0
        DRAG dyn_ycurindex enabled=true
        VAR ycurindex + 1 temporary=false
    IMAGE dyn_rcurindex __02 align="" animation={"entry":{"animId":"___3"},"loop":{"animId":""}} id=cmd_mfvtmst5_95xu_0_i7ja x=180 y=300 w=69 h=74 z=2 vis=true parent="" rot=0
    DRAG dyn_rcurindex enabled=true
    IMAGE dyn_gcurindex __03 align="" animation={"entry":{"animId":"___3"},"loop":{"animId":""}} id=cmd_mfvtmst5_95xu_0_i7ja x=180 y=300 w=69 h=74 z=2 vis=true parent="" rot=0
    DRAG dyn_gcurindex enabled=true
    IMAGE veg-basket __A align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_3_v2py x=550 y=180 w=153 h=115 z=1 vis=true parent=""
    IMAGE veg-basket2 __B align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_3_v2py x=550 y=300 w=153 h=115 z=1 vis=true parent=""
    IMAGE veg-basket3 __C align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_3_v2py x=550 y=430 w=153 h=115 z=1 vis=true parent=""
    IMAGE submit-btn _______2 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_13_3smw x=220 y=520 w=217 h=49 z=3 vis=true parent=""
    CLICK submit-btn effect="" enabled=true block=false front="" back="" showBack=true
        SIGNAL final data=""
    AREA dyn_last_drop_element_ID 0 0 540 600
        STYLE dyn_last_drop_element_ID {"scale":1,"display":""}
    AREA dyn_last_drop_element_ID 540 180 160 120
        IFEXPR "parseInt(getVar('last_drop_element_ID'))<20"
            STYLE dyn_last_drop_element_ID {"scale":0.6}
            DRAG dyn_last_drop_element_ID enabled=false
            VAR cnt1 + 1 temporary=false
        ELSE
            STYLE dyn_last_drop_element_ID {"scale":0.6}
            DRAG dyn_last_drop_element_ID enabled=true
    AREA dyn_last_drop_element_ID 540 300 160 120
        IFEXPR "20<=parseInt(getVar('last_drop_element_ID')) && parseInt(getVar('last_drop_element_ID'))<60"
            STYLE dyn_last_drop_element_ID {"scale":0.6}
            DRAG dyn_last_drop_element_ID enabled=false
            VAR cnt2 + 1 temporary=false
        ELSE
            STYLE dyn_last_drop_element_ID {"scale":0.6}
            DRAG dyn_last_drop_element_ID enabled=true
    AREA dyn_last_drop_element_ID 540 440 160 120
        IFEXPR "60<=parseInt(getVar('last_drop_element_ID'))"
            STYLE dyn_last_drop_element_ID {"scale":0.6}
            DRAG dyn_last_drop_element_ID enabled=false
            VAR cnt3 + 1 temporary=false
        ELSE
            STYLE dyn_last_drop_element_ID {"scale":0.6}
            DRAG dyn_last_drop_element_ID enabled=true

ON toast toast
    IF toast_init != true
        TEXT toast ${toastval} id=show_text_1 style={"fontSize":"24px","color":"#ff0000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":999,"textAlign":"left"} x=260 y=275 block=false dismiss=true skin="" pad=20
        VAR toast_init = true
    VAR toast_running = true
    WAIT 100
    TEXT_SET toast ${toastval}
    VAR toast_running = false

ON final "胜负判断"
    IFEXPR "getVar('cnt1') === 1 &&\ngetVar('cnt2') === 1 &&\ngetVar('cnt3') === 1 "
        VAR victory = true
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE show_image_2 _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=101 vis=true parent="" rot=0
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        CLICK show_image_2 effect="" enabled=true block=true front="" back="" showBack=true
            NEXT
    ELSE
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE show_image_2 _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=101 vis=true parent=""
        CLICK show_image_2 effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this
```

## 6. 新场景

- scene_file: `服药小管家.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `16` top-level commands, `4` events
- omitted unsupported old commands: `0`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ____a | image | images/全局背景a.png | 全局背景a |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| _______2 | image | images/游戏规则背景.png | 游戏规则背景 |
| 1002-__ | unknown |  | 1002-__ |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _____9 | image | images/old/返回图标.png | 返回图标 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |
| 0003_01-___1 | audio | audio/se/0003_01-问诊.mp3 | 0003_01-问诊 |
| __01 | image | images/G0003-服药小管家/病人01.png | 病人01 |
| ______ | image | images/old/通用继续按钮.png | 通用继续按钮 |
| _____15 | image | images/G0003-服药小管家/蓝色药品.png | 蓝色药品 |
| _____18 | image | images/G0003-服药小管家/棕色药品.png | 棕色药品 |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| ____2 | image | images/失败弹窗2.png | 失败弹窗2 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| 0003_01-__ | audio | audio/se/0003_01-问题.mp3 | 0003_01-问题 |
| _____16 | image | images/G0003-服药小管家/药柜背景.png | 药柜背景 |
| btn-primary-9slice | unknown |  | btn-primary-9slice |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| ____2_1 | image | images/胜利弹窗2.png | 胜利弹窗2 |

### First-Level DSL

```vge-dsl
IMAGE background ____a align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce _______2 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=180 y=75 w=425 h=471 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_1 "欢迎来到 《服药小管家》 您的健康守护者! 游戏简介:在《服药小管家》 中，您将扮演一名患者，需 要根据医生交代的内容，安 排好自己服药的频次！" id=show_text_1 style={"fontSize":"25","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=240 y=160 block=false dismiss=true skin="" pad=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE introduce {"display":"none","scale":0}
STYLE show_text_1 {"display":"none","scale":0}
IMAGE introduce2 _______2 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=90 w=396 h=440 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_2 "您将收到一些常见药物 的服药时间和顺序，请 您记忆后，将正确的图 片与药品和相关信息匹 配吧！" id=show_text_1 style={"fontSize":"27","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=260 y=170 block=false dismiss=true skin="" pad=0
CLICK introduce2 effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE show_text_2 {"display":"none","scale":0}
STYLE introduce2 {"display":"none","scale":0}
STYLE mask {"display":"none","scale":0}
SIGNAL gameloop data=""

ON start "倒计时"
    VAR countdown = 20
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"20","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=735 y=10 block=false dismiss=true pad=20
    IMAGE fanhui _____9 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=20 y=10 w=25 h=40 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "已胜利" == true
            WAIT 0
        ELSE
            WAIT 1000
            VAR countdown - 1
            IFEXPR "getVar('countdown') > 9"
                TEXT_SET countdown-text ${countdown}s
            ELSE
                TEXT_SET countdown-text 0${countdown}s
            JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL fail data=""

ON gameloop "读题阶段"
    VAR "是否结束读题" = false
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#ffffff","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":true,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=10 block=false dismiss=true skin="" pad=14
    BGM 0003_01-___1 vol=0.8 loop=false fade=0
    TEXT story-text "请记清每个时段应服用几种药品。下面是处方单：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=40 y=90 block=false dismiss=true skin="" pad=14
    SIGNAL start data=""
    IMAGE "咨询" __01 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=40 y=140 w=432 h=166 z=0 vis=true parent=""
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=555 y=450 w=200 h=49 z=0 vis=true parent=""
    IMAGE pill1 _____15 animation={"entry":{"animId":"","duration":0},"loop":{"animId":"","duration":0}} id=show_image_1 x=50 y=320 w=89 h=89 z=0 vis=true parent=""
    IMAGE pill2 _____18 animation={"entry":{"animId":"","duration":0},"loop":{"animId":"","duration":0}} id=show_image_1 x=50 y=420 w=88 h=88 z=0 vis=true parent=""
    TEXT info1 "每天一次，早餐后" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=155 y=345 block=false dismiss=true skin="" pad=14
    TEXT info2 "每天一次，晚上睡前" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=155 y=445 block=false dismiss=true skin="" pad=14
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON fail "失败处理"
    IF "失败已执行" != true
        SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE fail-window ____2 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
        VAR "失败已执行" = true
        CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this

ON answer "答题阶段"
    VAR countdown = 30
    TEXT_SET info1 " "
    TEXT_SET info2 " "
    BGM 0003_01-__ vol=0.8 loop=false fade=0
    TEXT_SET story-text "请问在晚上睡前需要服用几种药？（单选）"
    IMAGE "咨询" _____16 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=190 y=140 w=385 h=445 z=0 vis=true parent=""
    STYLE pill1 {"display":"none"}
    STYLE pill2 {"display":"none"}
    STYLE con {"display":"none"}
    CHOICES show_choices_1 id=show_choices_1 ui={"rowMax":1,"gapX":16,"gapY":32,"minWidth":150,"fontSize":24,"maxWidth":300,"paddingX":24,"paddingY":16,"color":"#ffffff"} x=300 y=200 block=false skin=btn-primary-9slice
        OPTION option_1 "A:4种"
            SIGNAL fail data=""
        OPTION option_2 "B:3种"
            SIGNAL fail data=""
        OPTION option_3 "C:2种"
            SIGNAL fail data=""
        OPTION option_4 "D:1种"
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            VAR "已胜利" = true
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=120 vis=true parent=""
            IMAGE vv ____2_1 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=121 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
```

## 7. 新场景

- scene_file: `瓜果分类.json`
- level: `关卡1-1`
- canvas: `800 x 600`
- commands/events: `8` top-level commands, `3` events
- omitted unsupported old commands: `2`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-____ | image | images/G1002-瓜果分类达人/intro-瓜果分类.png | intro-瓜果分类 |
| 1002-__ | audio | audio/se/1002-描述.mp3 | 1002-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______2 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___1 | image | images/返回.png | 返回 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _12 | image | images/G1002-瓜果分类达人/果12.png | 果12 |
| ___3 | animation | animations/基础效果/弹入.json | 弹入 |
| _08 | image | images/G1002-瓜果分类达人/果08.png | 果08 |
| _09 | image | images/G1002-瓜果分类达人/果09.png | 果09 |
| _11 | image | images/G1002-瓜果分类达人/蔬11.png | 蔬11 |
| __01_1 | image | images/G1002-瓜果分类达人/篮子01.png | 篮子01 |
| _____2 | animation | animations/基础效果/上下悬浮.json | 上下悬浮 |
| _____8 | image | images/old/继续按钮.png | 继续按钮 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |

### First-Level DSL

```vge-dsl
VAR cntveg = 0
VAR cntfruit = 0
VAR victory = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=332 h=509 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON start "倒计时"
    VAR countdown = 21
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"32","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=710 y=5 block=false dismiss=true pad=20
    IMAGE clockbg _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=20 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IFEXPR "getVar('victory') == false"
            WAIT 1000
            VAR countdown - 1
            TEXT_SET countdown-text ${countdown}s
            JUMP L1
    ELSE
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=102 vis=true parent=""
        IMAGE show_image_2 _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=103 vis=true parent=""
        CLICK show_image_2 effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this

ON gameloop gameloop
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    TEXT story-text "请将以下水果装入水果篮" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=180 block=false dismiss=true skin="" pad=14
    SIGNAL start data=""
    IMAGE veg1 _12 align="" animation={"entry":{"animId":"___3"},"loop":{"animId":""}} id=cmd_mfvtmst5_95xu_0_i7ja x=100 y=230 w=100 h=100 z=2 vis=true parent=""
    DRAG veg1 enabled=true
    IMAGE veg2 _08 align="" animation={"entry":{"animId":"___3"},"loop":{"animId":""}} id=cmd_mfvtmst5_95xu_2_tyji x=259 y=230 w=100 h=100 z=2 vis=true parent=""
    DRAG veg2 enabled=true
    IMAGE veg3 _09 align="" animation={"entry":{"animId":"___3"},"loop":{"animId":""}} id=cmd_mfvtmst5_95xu_4_o6bt x=401 y=230 w=100 h=100 z=2 vis=true parent=""
    DRAG veg3 enabled=true
    IMAGE fru1 _11 align="" animation={"entry":{"animId":"___3"},"loop":{"animId":""}} id=cmd_mfvtmst5_95xu_6_mvam x=617 y=230 w=100 h=100 z=2 vis=true parent="" rot=0
    DRAG fru1 enabled=true
    IMAGE veg-basket __01_1 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":"_____2"}} id=cmd_mfuv240j_gg42_3_v2py x=50 y=416 w=273 h=184 z=1 vis=true parent=""
    IMAGE submit-btn _____8 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_13_3smw x=300 y=500 w=170 h=40 z=3 vis=true parent=""
    AREA dyn_last_drop_element_ID 100 416 210 100
        IFEXPR "getVar('last_drop_element_ID').includes('veg')"
            STYLE dyn_last_drop_element_ID {"scale":0.6}
            DRAG dyn_last_drop_element_ID enabled=false
            VAR cntveg + 1
            MOVE dyn_last_drop_element_ID -1 420 ms=100 keep=true
        ELSE
            MOVE dyn_last_drop_element_ID 400 130 ms=200 keep=true
    CLICK submit-btn effect="" enabled=true front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        IF cntveg == 3
            IF cntfruit == 0
                VAR victory = true
                IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=102 vis=true parent=""
                IMAGE show_image_2 _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=103 vis=true parent=""
                CLICK show_image_2 effect="" enabled=true block=true front="" back="" showBack=true
                    SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
                    NEXT
            ELSE
                VAR toastval = "分类错误，请重试。"
                SIGNAL toast data=""
        ELSE
            VAR toastval = "分类错误，请重试。"
            SIGNAL toast data=""

ON toast toast
    IF toast_init != true
        TEXT toast ${toastval} id=show_text_1 style={"fontSize":"24px","color":"#ff0000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":999,"textAlign":"left"} x=260 y=275 block=false dismiss=true skin="" pad=20
        VAR toast_init = true
    VAR toast_running = true
    WAIT 100
    TEXT_SET toast ${toastval}
    VAR toast_running = false
```

## 8. 新场景

- scene_file: `老火锅记忆.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `6` top-level commands, `3` events
- omitted unsupported old commands: `0`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-1004_____ | image | images/G1004-老火锅忆食记/intro-1004老火锅记忆.png | intro-1004老火锅记忆 |
| 1004-__ | audio | audio/se/1004-描述.mp3 | 1004-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______2 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___1 | image | images/返回.png | 返回 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| 1004-___2 | audio | audio/se/1004-问诊.mp3 | 1004-问诊 |
| _____13 | image | images/G1004-老火锅忆食记/便签背景.png | 便签背景 |
| ______ | image | images/old/通用继续按钮.png | 通用继续按钮 |
| 1004-___1 | audio | audio/se/1004-问题.mp3 | 1004-问题 |
| _____14 | image | images/G1004-老火锅忆食记/锅底背景.png | 锅底背景 |
| __01_1 | image | images/G1004-老火锅忆食记/食材01.png | 食材01 |
| __02_2 | image | images/G1004-老火锅忆食记/食材02.png | 食材02 |
| __03_2 | image | images/G1004-老火锅忆食记/食材03.png | 食材03 |
| __04 | image | images/G1004-老火锅忆食记/食材04.png | 食材04 |
| __08 | image | images/G1004-老火锅忆食记/食材08.png | 食材08 |
| __06 | image | images/G1004-老火锅忆食记/食材06.png | 食材06 |
| check-circle | image | images/测试资源/check-circle.svg | check-circle |

### First-Level DSL

```vge-dsl
VAR "已胜利" = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-1004_____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=399 h=490 z=0 vis=true parent=""
BGM 1004-__ vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON "倒计时" "倒计时&胜负判定"
    VAR "是否结束读题" = false
    VAR countdown = 10
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"32","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=710 y=5 block=false dismiss=true pad=20
    IMAGE clockbg _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "分数" == 6
            WAIT 2000
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        WAIT 1000
        VAR countdown - 1
        IFEXPR "getVar('countdown') > 9"
            TEXT_SET countdown-text ${countdown}s
        ELSE
            TEXT_SET countdown-text 0${countdown}s
        JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL fail data=""
            SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
            IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
            VAR "失败已执行" = true
            CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
                SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
                SCENE this

ON gameloop "读题阶段"
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    BGM 1004-___2 vol=0.8 loop=false fade=0
    TEXT story-text "请记住客人的菜单：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=160 block=false dismiss=true skin="" pad=14
    SIGNAL "倒计时" data=""
    VAR "分数" = 0
    IMAGE guodi _____13 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=244 y=200 w=287 h=323 z=0 vis=true parent=""
    TEXT foodtext "大虾" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=310 y=250 block=false dismiss=true skin="" pad=14
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=290 y=525 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "作答阶段"
    VAR countdown = 30
    STYLE con {"display":"none","zIndex":0,"scale":0}
    STYLE foodtext {"display":"none","zIndex":0,"scale":0}
    BGM 1004-___1 vol=0.8 loop=false fade=0
    TEXT_SET story-text "请问刚才客人点了啥菜："
    IMAGE guodi _____14 animation={"loop":{"animId":""}} id=show-c1 x=200 y=200 w=394 h=285 z=1 vis=true
    IMAGE card-1 __01_1 animation={"loop":{"animId":""}} id=show-c1 x=230 y=230 w=103 h=97 z=1 vis=true
    IMAGE card-2 __02_2 id=show-c2 x=350 y=230 w=108 h=88 z=1 vis=true
    IMAGE card-3 __03_2 id=show-c3 x=230 y=370 w=99 h=94 z=1 vis=true
    IMAGE card-4 __04 id=show-c4 x=360 y=400 w=98 h=46 z=1 vis=true
    IMAGE card-5 __08 id=show-c3 x=470 y=250 w=120 h=74 z=1 vis=true
    IMAGE card-6 __06 id=show-c4 x=470 y=390 w=92 h=65 z=1 vis=true
    SELECT card-1 clickGuardMs=299 effect=___5 onCancelSelectedCommands=[] enabled=true var=card1_selected single=false overlay=check-circle
    SELECT card-2 clickGuardMs=299 effect=___5 onCancelSelectedCommands=[] enabled=true var=card2_selected single=false overlay=check-circle
    SELECT card-3 clickGuardMs=299 effect=___5 onCancelSelectedCommands=[] enabled=true var=card3_selected single=false overlay=check-circle
    SELECT card-4 clickGuardMs=299 effect=___5 onCancelSelectedCommands=[] enabled=true var=card4_selected single=false overlay=check-circle
    SELECT card-5 clickGuardMs=299 effect=___5 onCancelSelectedCommands=[] enabled=true var=card5_selected single=false overlay=check-circle
    SELECT card-6 clickGuardMs=299 effect=___5 onCancelSelectedCommands=[] enabled=true var=card6_selected single=false overlay=check-circle
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=290 y=525 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        IFEXPR "getVar('card5_selected') == true &&\ngetVar('card6_selected') == false &&\ngetVar('card1_selected') == false &&\ngetVar('card2_selected') == false &&\ngetVar('card3_selected') == false &&\ngetVar('card4_selected') == false\n"
            VAR victory = true
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=100 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=100 vis=true parent=""
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        ELSE
            SIGNAL fail data=""
            SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
            IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
            VAR "失败已执行" = true
            CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
                SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
                SCENE this
```

## 9. 新场景

- scene_file: `药品规划家.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `16` top-level commands, `6` events
- omitted unsupported old commands: `3`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ____a | image | images/全局背景a.png | 全局背景a |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| _______2 | image | images/游戏规则背景.png | 游戏规则背景 |
| 1002-__ | unknown |  | 1002-__ |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| 0002_01-___1 | audio | audio/se/0002_01-问诊.mp3 | 0002_01-问诊 |
| __01-1 | image | images/G0002-药品规划家/咨询01-1.png | 咨询01-1 |
| ______ | image | images/old/通用继续按钮.png | 通用继续按钮 |
| 0002_01-__ | audio | audio/se/0002_01-问题.mp3 | 0002_01-问题 |
| ____04 | image | images/G0002-药品规划家/咨询药柜04.png | 咨询药柜04 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| ____2_1 | image | images/胜利弹窗2.png | 胜利弹窗2 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| btn-primary-9slice | unknown |  | btn-primary-9slice |
| btn-primary-9slice-highlight | unknown |  | btn-primary-9slice-highlight |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| ____2 | image | images/失败弹窗2.png | 失败弹窗2 |
| _____9 | image | images/old/返回图标.png | 返回图标 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |
| res_mosquito | unknown |  | res_mosquito |

### First-Level DSL

```vge-dsl
IMAGE background ____a align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce _______2 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=210 y=90 w=396 h=440 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_1 "欢迎来到 《药品规划家》 您的健康守护者! 游戏简介:在《药品规划家 》中，由一位专业的医生， 为您安排服药的时间和顺 序，请您要记住哦。" id=show_text_1 style={"fontSize":"24","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=270 y=170 block=false dismiss=true skin="" pad=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE introduce {"display":"none","scale":0}
STYLE show_text_1 {"display":"none","scale":0}
IMAGE introduce2 _______2 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=210 y=90 w=396 h=440 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_2 "您将收到一些常见药物 的服药时间和顺序，请 您记忆后，将正确的图 片与药品和相关信息匹 配吧！" id=show_text_1 style={"fontSize":"27","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=270 y=170 block=false dismiss=true skin="" pad=0
CLICK introduce2 effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE show_text_2 {"display":"none","scale":0}
STYLE introduce2 {"display":"none","scale":0}
STYLE mask {"display":"none","scale":0}
SIGNAL gamestart data=""

ON gamestart "读题阶段"
    VAR "是否结束读题" = false
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#ffffff","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":true,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=10 block=false dismiss=true skin="" pad=14
    BGM 0002_01-___1 vol=0.8 loop=false fade=0
    TEXT story-text "请记住以下药物的服用方法。" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=40 y=90 block=false dismiss=true skin="" pad=14
    SIGNAL "计时开始" data=""
    IMAGE "咨询" __01-1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=170 y=140 w=367 h=371 z=0 vis=true parent=""
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=555 y=300 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=true front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "答题阶段"
    VAR countdown = 30
    BGM 0002_01-__ vol=0.8 loop=false fade=0
    TEXT_SET story-text "请问这个药怎么服用呢？（多选）"
    IMAGE "咨询" ____04 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=170 y=120 w=374 h=418 z=0 vis=true parent="" rot=0
    STYLE con {"display":"none"}
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=555 y=300 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        IFEXPR "getVar('sys_choice_1') !== true && getVar('sys_choice_2') !== true && \ngetVar('sys_choice_3') !== true && \ngetVar('sys_choice_4') !== true "
            VAR toastval = "请至少选择一个选项！"
            SIGNAL toast data=""
        ELSE
            IFEXPR "getVar('sys_choice_1') !== true && getVar('sys_choice_2') !== true && \ngetVar('sys_choice_3') !== true && \ngetVar('sys_choice_4') === true "
                SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
                VAR "已胜利" = true
                IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=110 vis=true parent=""
                IMAGE vv ____2_1 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
                CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                    NEXT
            ELSE
                SIGNAL fail data=""
    CHOICES show_choices_1 id=show_choices_1 ui={"rowMax":2,"gapX":16,"gapY":12,"minWidth":30,"fontSize":22,"maxWidth":300,"paddingX":24,"paddingY":16,"color":"#ffffff"} x=234 y=380 block=false multi=true skin=btn-primary-9slice selectedSkin=btn-primary-9slice-highlight
        OPTION option_1 "早餐后"
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        OPTION option_2 "午餐后"
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        OPTION option_3 "晚餐后"
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        OPTION option_4 "晚上睡前"
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false

ON fail "失败处理"
    IF "失败已执行" != true
        SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE fail-window ____2 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
        VAR "失败已执行" = true
        CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this

ON "计时开始" "倒计时"
    VAR countdown = 40
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"20","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=735 y=10 block=false dismiss=true pad=20
    IMAGE fanhui _____9 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=20 y=10 w=25 h=40 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=11 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "已胜利" == true
            WAIT 0
        ELSE
            WAIT 1000
            VAR countdown - 1
            IFEXPR "getVar('countdown') > 9"
                TEXT_SET countdown-text ${countdown}s
            ELSE
                TEXT_SET countdown-text 0${countdown}s
            JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL fail data=""

ON toast toast
    IF toast_init != true
        TEXT toast ${toastval} id=show_text_1 style={"fontSize":"24px","color":"#ff0000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":999,"textAlign":"left"} x=260 y=275 block=false dismiss=true skin="" pad=20
        VAR toast_init = true
    VAR toast_running = true
    WAIT 100
    TEXT_SET toast ${toastval}
    VAR toast_running = false

ON never "新事件"
    VAR score = 0
    VAR total = 0
    LOOP loopType=while variable=outerIter
        BREAK total >= 20
        VAR pairCount = 0
        LOOP loopType=while variable=innerIter
            BREAK pairCount >= 2
            BREAK total >= 20
            VAR curIndex = "${total} + 1" expression=true
            VAR total + 1
            IMAGE dyn_curIndex res_mosquito style={"anchorX":0.5,"anchorY":0.5} vis=true
            CLICK dyn_curIndex enabled=true
                STYLE dyn_curIndex {"display":"none"}
                VAR score + 1
            VAR pairCount + 1
        WAIT 2000
```

## 10. 新场景

- scene_file: `药片领航员.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `16` top-level commands, `5` events
- omitted unsupported old commands: `0`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ____a | image | images/全局背景a.png | 全局背景a |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| ______-_ | image | images/游戏规则背景-宽.png | 游戏规则背景-宽 |
| 1002-__ | unknown |  | 1002-__ |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______2 | image | images/游戏规则背景.png | 游戏规则背景 |
| 0004_01-___1 | audio | audio/se/0004_01-问诊.mp3 | 0004_01-问诊 |
| __01_2 | image | images/G0004-药品领航员/咨询01.png | 咨询01 |
| ______ | image | images/old/通用继续按钮.png | 通用继续按钮 |
| 0004_01-__ | audio | audio/se/0004_01-问题.mp3 | 0004_01-问题 |
| __01_1 | image | images/G0004-药品领航员/头像01.png | 头像01 |
| ____01 | image | images/G0004-药品领航员/咨询药柜01.png | 咨询药柜01 |
| 0004_01-__-1 | audio | audio/se/0004_01-位置-1.mp3 | 0004_01-位置-1 |
| ___6 | image | images/G0004-药品领航员/药瓶.png | 药瓶 |
| _____4 | animation | animations/基础效果/向下滑入.json | 向下滑入 |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____9 | image | images/old/返回图标.png | 返回图标 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |
| _____14 | image | images/G0004-药品领航员/成功背景.png | 成功背景 |
| __01-1 | image | images/G0004-药品领航员/成功01-1.png | 成功01-1 |
| _____6 | animation | animations/基础效果/向左滑入.json | 向左滑入 |
| __01-2 | image | images/G0004-药品领航员/成功01-2.png | 成功01-2 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |

### First-Level DSL

```vge-dsl
IMAGE background ____a align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce ______-_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=70 y=90 w=660 h=420 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_1 "        欢迎来到 《药片领航员》您的健康守护者! 游戏简介:     在《药片领航员》中，您的角色为药剂师。您需 要在相应关卡中将图片中的药品找出来。然后记住 药品所在位置。当药品被覆盖时，请您根据记忆依 次找出该药品对应的药瓶。期待您的精彩表现！" id=show_text_1 style={"fontSize":"23","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=145 y=160 block=false dismiss=true skin="" pad=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE introduce {"display":"none","scale":0}
STYLE show_text_1 {"display":"none","scale":0}
IMAGE introduce2 _______2 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=210 y=90 w=396 h=440 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_2 "您将收到一些常见药物 的外观图片和所在位置， 请您记忆后，将正确的 图片与药品和相关信息 匹配吧!" id=show_text_1 style={"fontSize":"27","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=270 y=170 block=false dismiss=true skin="" pad=0
CLICK introduce2 effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE show_text_2 {"display":"none","scale":0}
STYLE introduce2 {"display":"none","scale":0}
STYLE mask {"display":"none","scale":0}
SIGNAL gamestart data=""

ON gamestart "读题阶段"
    VAR "是否结束读题" = false
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#ffffff","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":true,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=10 block=false dismiss=true skin="" pad=14
    BGM 0004_01-___1 vol=0.8 loop=false fade=0
    TEXT story-text "请记住以下药品的外观" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=40 y=110 block=false dismiss=true skin="" pad=14
    SIGNAL "计时开始" data=""
    IMAGE "咨询" __01_2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=170 y=160 w=338 h=366 z=0 vis=true parent=""
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=555 y=300 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=true front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    BGM 0004_01-__ vol=0.8 loop=false fade=0
    TEXT_SET story-text "请观察以下药物的位置顺序"
    IMAGE "人" __01_1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=50 y=220 w=137 h=139 z=0 vis=true parent=""
    IMAGE "咨询" ____01 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=188 y=160 w=505 h=255 z=0 vis=true parent=""
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=555 y=440 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "答题阶段"
    VAR countdown = 30
    BGM 0004_01-__-1 vol=0.8 loop=false fade=0
    TEXT_SET story-text "请选出该女士所需药物"
    IMAGE "人" __01_1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=50 y=220 w=137 h=139 z=0 vis=true parent=""
    IMAGE "咨询" ____01 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=188 y=160 w=505 h=255 z=0 vis=true parent=""
    STYLE con {"display":"none"}
    IMAGE "问号1" ___6 align="" animation={"entry":{"animId":"_____4"},"loop":{"animId":""}} id=show_image_1 x=236 y=210 w=90 h=142 z=0 vis=true parent=""
    IMAGE "问号2" ___6 align="" animation={"entry":{"animId":"_____4"},"loop":{"animId":""}} id=show_image_1 x=390 y=210 w=90 h=142 z=0 vis=true parent=""
    IMAGE "问号3" ___6 align="" animation={"entry":{"animId":"_____4"},"loop":{"animId":""}} id=show_image_1 x=550 y=210 w=90 h=142 z=0 vis=true parent=""
    CLICK "问号1" effect="" enabled=true block=false front="" back="" showBack=true
        MOVE "问号1" -1 -300 ms=1000 keep=true
        WAIT 2000
        SIGNAL fail data=""
    CLICK "问号2" effect="" enabled=true block=false front="" back="" showBack=true
        MOVE "问号2" -1 -300 ms=1000 keep=true
        WAIT 2000
        SIGNAL success data=""
    CLICK "问号3" effect="" enabled=true block=false front="" back="" showBack=true
        MOVE "问号3" -1 -300 ms=1000 keep=true
        WAIT 2000
        SIGNAL fail data=""

ON fail "失败处理"
    IF "失败已执行" != true
        SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
        VAR "失败已执行" = true
        CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this

ON "计时开始" "倒计时"
    VAR countdown = 20
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"20","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=735 y=10 block=false dismiss=true pad=20
    IMAGE fanhui _____9 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=20 y=10 w=25 h=40 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "已胜利" == true
            WAIT 0
        ELSE
            WAIT 1000
            VAR countdown - 1
            IFEXPR "getVar('countdown') > 9"
                TEXT_SET countdown-text ${countdown}s
            ELSE
                TEXT_SET countdown-text 0${countdown}s
            JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL fail data=""

ON success "胜利处理"
    VAR "已胜利" = true
    IMAGE "剧情背景" _____14 align="" animation={"entry":{"animId":"___4","duration":1000},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=109 vis=true parent=""
    WAIT 1000
    IMAGE "对话1" __01-1 align="" animation={"entry":{"animId":"_____6","duration":1000},"loop":{"animId":""}} id=show_image_1 x=300 y=150 w=389 h=99 z=110 vis=true parent=""
    WAIT 1000
    IMAGE "对话2" __01-2 align="" animation={"entry":{"animId":"_____6","duration":1000},"loop":{"animId":""}} id=show_image_1 x=50 y=333 w=400 h=113 z=110 vis=true parent=""
    WAIT 1000
    IMAGE con2 ______ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=show_image_1 x=555 y=480 w=200 h=49 z=111 vis=true parent=""
    CLICK con2 effect="" enabled=true block=false front="" back="" showBack=true
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
        IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
        CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
            NEXT
```

## 11. 新场景

- scene_file: `虫虫大作战.json`
- level: `关卡1 -1`
- canvas: `800 x 600`
- commands/events: `6` top-level commands, `4` events
- omitted unsupported old commands: `3`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-_____ | image | images/G1005-虫虫大作战/intro-虫虫大作战.png | intro-虫虫大作战 |
| 1004-__ | unknown |  | 1004-__ |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______2 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___1 | image | images/返回.png | 返回 |
| ___2 | image | images/G1005-虫虫大作战/虫子.png | 虫子 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____12 | image | images/G1005-虫虫大作战/网子背景.png | 网子背景 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| 1005-__ | audio | audio/se/1005-描述.mp3 | 1005-描述 |
| _____9 | image | images/G1005-虫虫大作战/草地背景.png | 草地背景 |
| _____5 | animation | animations/基础效果/向右滑入.json | 向右滑入 |

### First-Level DSL

```vge-dsl
VAR "已胜利" = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-_____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=399 h=490 z=0 vis=true parent=""
BGM 1004-__ vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL answer data=""

ON "倒计时" "倒计时&胜负判定"
    VAR "是否结束读题" = false
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"32","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=710 y=5 block=false dismiss=true pad=20
    IMAGE clockbg _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        WAIT 1000
        VAR countdown - 1
        IFEXPR "getVar('countdown') > 9"
            TEXT_SET countdown-text ${countdown}s
        ELSE
            TEXT_SET countdown-text 0${countdown}s
        JUMP L1
    ELSE
        IF "分数" > 7
            WAIT 2000
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        ELSE
            SIGNAL fail data=""
            SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
            IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
            VAR "失败已执行" = true
            CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
                SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
                SCENE this

ON answer "作答阶段"
    TEXT "guan'ka" "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    SIGNAL "倒计时" data=""
    VAR countdown = 20 temporary=false
    BGM 1005-__ vol=0.8 loop=false fade=0
    TEXT story-text "请将田里的害虫清除：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=160 block=false dismiss=true skin="" pad=14
    IMAGE guodi _____9 animation={"loop":{"animId":""}} id=show-c1 x=30 y=440 w=288 h=135 z=1 vis=true
    IMAGE guodi2 _____9 animation={"loop":{"animId":""}} id=show-c1 x=300 y=440 w=267 h=135 z=1 vis=true
    IMAGE guodi3 _____9 animation={"loop":{"animId":""}} id=show-c1 x=500 y=440 w=267 h=135 z=1 vis=true
    VAR "分数" = 0 temporary=false
    SIGNAL "蚊子生成" data=""

ON "蚊子生成" "蚊子生成"
    VAR total = 0 temporary=false
    LOOP
        VAR curIndex = "${total} + 1" expression=true
        VAR total + 1 temporary=false
        IMAGE dyn_curIndex ___2 animation={"entry":{"animId":"___4"}} id=show_one_mosquito style={"anchorX":0.5,"anchorY":0.5} x=0 y=0 w=77 h=52 z=0 vis=true
        BREAK total >= 13
        CLICK dyn_curIndex enabled=true
            SIGNAL "动画" data=""
        WAIT 2400

ON "动画" "捕捉蚊子"
    VAR myID = xx temporary=true
    IMAGE "网_{myID}" _____12 animation={"entry":{"animId":"_____5"}} id=show_one_mosquito style={"anchorX":0.5,"anchorY":0.5} x=300 y=300 w=181 h=109 z=99 vis=true
    VAR "分数" + 1 temporary=false
    WAIT 100
    ANIM_OUT dyn_myID fade animId="" mode=preset offset=60 ms=400 dir=up hide=true
    ANIM_OUT "网_{myID}" fade animId="" mode=preset offset=60 ms=500 dir=up hide=true
```

## 12. 新场景

- scene_file: `记忆衣橱.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `6` top-level commands, `4` events
- omitted unsupported old commands: `1`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-____ | image | images/G1003-记忆衣橱/intro-记忆衣橱.png | intro-记忆衣橱 |
| 1003-__ | audio | audio/se/1003-描述.mp3 | 1003-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______2 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___1 | image | images/返回.png | 返回 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| 1003-___1 | audio | audio/se/1003-问题.mp3 | 1003-问题 |
| __01 | image | images/G1003-记忆衣橱/衣物01.png | 衣物01 |
| __03 | image | images/G1003-记忆衣橱/衣物03.png | 衣物03 |
| __04 | image | images/G1003-记忆衣橱/衣物04.png | 衣物04 |
| ______ | image | images/old/通用继续按钮.png | 通用继续按钮 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |
| _____14 | image | images/G1003-记忆衣橱/物品背景.png | 物品背景 |
| check-circle | image | images/测试资源/check-circle.svg | check-circle |
| star | image | images/测试资源/star.svg | star |

### First-Level DSL

```vge-dsl
VAR "已胜利" = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=399 h=490 z=0 vis=true parent=""
BGM 1003-__ vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON "倒计时" "倒计时&胜负判定"
    VAR "是否结束读题" = false
    VAR countdown = 20 temporary=false
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"32","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=710 y=5 block=false dismiss=true pad=20
    IMAGE clockbg _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "分数" == 6
            WAIT 300
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        WAIT 1000
        VAR countdown - 1
        IFEXPR "getVar('countdown') > 9"
            TEXT_SET countdown-text ${countdown}s
        ELSE
            TEXT_SET countdown-text 0${countdown}s
        JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL fail data=""
            SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
            IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
            VAR "失败已执行" = true
            CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
                SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
                SCENE this

ON gameloop "读题阶段"
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    BGM 1003-___1 vol=0.8 loop=false fade=0
    TEXT story-text "请把以下的服装进行配对：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=160 block=false dismiss=true skin="" pad=14
    SIGNAL "倒计时" data=""
    VAR "分数" = 0
    IMAGE card-1 __01 animation={"loop":{"animId":""}} id=show-c1 x=200 y=200 w=106 h=147 z=1 vis=true
    IMAGE card-2 __01 id=show-c2 x=360 y=200 w=106 h=147 z=1 vis=true
    IMAGE card-3 __03 id=show-c3 x=200 y=360 w=106 h=147 z=1 vis=true rot=0
    IMAGE card-4 __04 id=show-c4 x=360 y=360 w=106 h=147 z=1 vis=true
    IMAGE card-5 __03 id=show-c3 x=520 y=200 w=106 h=147 z=1 vis=true
    IMAGE card-6 __04 id=show-c4 x=520 y=360 w=106 h=147 z=1 vis=true
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=290 y=525 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "作答阶段"
    VAR countdown = 35 temporary=false
    STYLE con {"display":"none","zIndex":0,"scale":0}
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=11 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    FLIP card-1 _____14 duration=222 easing=easeInOutQuad frontResourceId="" showBack=true
    FLIP card-2 _____14 duration=222 easing=easeInOutQuad frontResourceId="" showBack=true
    FLIP card-5 _____14 duration=222 easing=easeInOutQuad frontResourceId="" showBack=true
    FLIP card-3 _____14 duration=222 easing=easeInOutQuad frontResourceId="" showBack=true
    FLIP card-4 _____14 duration=222 easing=easeInOutQuad frontResourceId="" showBack=true
    FLIP card-6 _____14 duration=222 easing=easeInOutQuad frontResourceId="" showBack=true
    SELECT card-1 clickGuardMs=299 effect="" onCancelSelectedCommands=[{"id":"flip_card_13","type":"FLIP_CARD","parameters":{"elementId":"card-1","backResourceId":"_____14","frontResourceId":"","duration":222,"easing":"easeInOutQuad","showBack":true}}] enabled=true var=card1_selected single=false overlay=check-circle
        SIGNAL check_2cards_matchs data=""
    SELECT card-2 clickGuardMs=299 effect="" onCancelSelectedCommands=[{"id":"flip_card_14","type":"FLIP_CARD","parameters":{"elementId":"card-2","backResourceId":"_____14","frontResourceId":"","duration":222,"easing":"easeInOutQuad","showBack":true}}] enabled=true var=card2_selected single=false overlay=check-circle
        SIGNAL check_2cards_matchs data=""
    SELECT card-3 clickGuardMs=299 effect="" onCancelSelectedCommands=[{"id":"flip_card_15","type":"FLIP_CARD","parameters":{"elementId":"card-3","backResourceId":"_____14","frontResourceId":"","duration":222,"easing":"easeInOutQuad","showBack":true}}] enabled=true var=card3_selected single=false overlay=check-circle
        SIGNAL check_2cards_matchs data=""
    SELECT card-4 clickGuardMs=299 effect="" onCancelSelectedCommands=[{"id":"flip_card_16","type":"FLIP_CARD","parameters":{"elementId":"card-4","backResourceId":"_____14","frontResourceId":"","duration":222,"easing":"easeInOutQuad","showBack":true}}] enabled=true var=card4_selected single=false overlay=check-circle
        SIGNAL check_2cards_matchs data=""
    SELECT card-5 clickGuardMs=299 effect="" onCancelSelectedCommands=[{"id":"flip_card_17","type":"FLIP_CARD","parameters":{"elementId":"card-5","backResourceId":"_____14","frontResourceId":"","duration":222,"easing":"easeInOutQuad","showBack":true}}] enabled=true var=card5_selected single=false overlay=check-circle
        SIGNAL check_2cards_matchs data=""
    SELECT card-6 clickGuardMs=299 effect="" onCancelSelectedCommands=[{"id":"flip_card_18","type":"FLIP_CARD","parameters":{"elementId":"card-6","backResourceId":"_____14","frontResourceId":"","duration":222,"easing":"easeInOutQuad","showBack":true}}] enabled=true var=card6_selected single=false overlay=check-circle
        SIGNAL check_2cards_matchs data=""

ON check_2cards_matchs "翻开卡片处理逻辑"
    VAR "翻开ID" = dyn_lastChangingSelectStateID temporary=true
    VAR "翻开数量" = 0 temporary=true
    FLIP "dyn_翻开ID" _____14 duration=255 easing=easeInOutQuad frontResourceId="" showBack=false
    IF "翻开数量" == 2
        VAR "是否需要复位所有牌盖住" = true temporary=true
        IFEXPR "getVar('card1_selected') == true &&\ngetVar('card2_selected') == true "
            VAR "分数" + 2
            VAR "是否需要复位所有牌盖住" = false temporary=true
            FIREWORK attachToId=card-1 count=24 elementId=card-1 gravity=0.35 life=900 resourceId=star zIndex=50
            FIREWORK attachToId=card-2 count=24 elementId=card-2 gravity=0.35 life=900 resourceId=star zIndex=50
            VAR card1_selected = false temporary=false
            VAR card2_selected = false temporary=false
            ANIM_OUT card-1 fade animId=___6 mode=resource offset=60 ms=600 dir=up hide=true
            ANIM_OUT card-2 fade animId=___6 mode=resource offset=60 ms=600 dir=up hide=true
        IFEXPR "getVar('card3_selected') === true &&\ngetVar('card5_selected') === true "
            VAR "分数" + 2
            VAR "是否需要复位所有牌盖住" = false temporary=true
            FIREWORK attachToId=card-3 count=24 elementId=card-3 gravity=0.35 life=900 resourceId=star zIndex=50
            FIREWORK attachToId=card-5 count=24 elementId=card-5 gravity=0.35 life=900 resourceId=star zIndex=50
            VAR card3_selected = false temporary=false
            VAR card5_selected = false temporary=false
            ANIM_OUT card-3 fade animId=___6 mode=resource offset=60 ms=600 dir=up hide=true
            ANIM_OUT card-5 fade animId=___6 mode=resource offset=60 ms=600 dir=up hide=true
        IFEXPR "getVar('card4_selected') === true &&\ngetVar('card6_selected') === true "
            VAR "分数" + 2
            VAR "是否需要复位所有牌盖住" = false temporary=true
            FIREWORK attachToId=card-4 count=24 elementId=card-4 gravity=0.35 life=900 resourceId=star zIndex=50
            FIREWORK attachToId=card-6 count=24 elementId=card-6 gravity=0.35 life=900 resourceId=star zIndex=50
            VAR card4_selected = false temporary=false
            VAR card6_selected = false temporary=false
            ANIM_OUT card-4 fade animId=___6 mode=resource offset=60 ms=600 dir=up hide=true
            ANIM_OUT card-6 fade animId=___6 mode=resource offset=60 ms=600 dir=up hide=true
        IF "是否需要复位所有牌盖住" == true
            SELECT_STATE card-1 false
            SELECT_STATE card-2 false
            SELECT_STATE card-3 false
            SELECT_STATE card-4 false
            SELECT_STATE card-5 false
            SELECT_STATE card-6 false
    IF "翻开数量" > 2
        SELECT_STATE card-1 false
        SELECT_STATE card-2 false
        SELECT_STATE card-3 false
        SELECT_STATE card-4 false
        SELECT_STATE card-5 false
        SELECT_STATE card-6 false
```

## 13. 新场景

- scene_file: `谁知盘中餐.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `6` top-level commands, `4` events
- omitted unsupported old commands: `0`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-_____ | image | images/G1009-谁知盘中餐/intro-谁知盘中餐.png | intro-谁知盘中餐 |
| 1009-___1 | audio | audio/se/1009-描述.mp3 | 1009-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______3 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___1 | image | images/返回.png | 返回 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| 1009-__ | audio | audio/se/1009-问诊.mp3 | 1009-问诊 |
| ___9 | image | images/G1009-谁知盘中餐/盘子.png | 盘子 |
| _____14 | image | images/G1004-老火锅忆食记/锅底背景.png | 锅底背景 |
| __03 | image | images/G1009-谁知盘中餐/蔬菜03.png | 蔬菜03 |
| __06 | image | images/G1009-谁知盘中餐/蔬菜06.png | 蔬菜06 |
| _______2 | image | images/old/通用按钮背景.png | 通用按钮背景 |
| __01 | image | images/G1009-谁知盘中餐/蔬菜01.png | 蔬菜01 |
| __02 | image | images/G1009-谁知盘中餐/蔬菜02.png | 蔬菜02 |
| __04 | image | images/G1009-谁知盘中餐/蔬菜04.png | 蔬菜04 |
| __05 | image | images/G1009-谁知盘中餐/蔬菜05.png | 蔬菜05 |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |

### First-Level DSL

```vge-dsl
VAR "已胜利" = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-_____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=399 h=490 z=0 vis=true parent=""
BGM 1009-___1 vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON "倒计时" "倒计时"
    VAR "是否结束读题" = false
    VAR countdown = 10
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"32","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=710 y=5 block=false dismiss=true pad=20
    IMAGE clockbg _______3 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    TEXT cnt2 " ${countdown}秒后游戏开始" id=countdown-text-show style={"fontSize":"24","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":0,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=290 y=490 block=false dismiss=true pad=20
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "分数" == 6
            WAIT 2000
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        WAIT 1000
        VAR countdown - 1
        IFEXPR "getVar('countdown') > 9"
            TEXT_SET countdown-text ${countdown}s
            IF "是否结束读题" == false
                TEXT_SET cnt2 " ${countdown}秒后游戏开始"
            ELSE
                TEXT_SET cnt2 " ${countdown}秒后游戏结束"
        ELSE
            TEXT_SET countdown-text 0${countdown}s
            IF "是否结束读题" == false
                TEXT_SET cnt2 " 0${countdown}秒后游戏开始"
            ELSE
                TEXT_SET cnt2 " 0${countdown}秒后游戏结束"
        JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL final data=""

ON gameloop "读题阶段"
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    BGM 1009-__ vol=0.8 loop=false fade=0
    TEXT story-text "请根据提示找出餐盘中对应的食物：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=160 block=false dismiss=true skin="" pad=14
    SIGNAL "倒计时" data=""
    VAR cnt = 0 temporary=false
    VAR "cnt-不需要" = 0 temporary=false
    IMAGE panzi-0 ___9 animation={"loop":{"animId":""}} id=show-c1 x=150 y=290 w=184 h=123 z=1 vis=true
    IMAGE guodi _____14 animation={"loop":{"animId":""}} id=show-c1 x=400 y=313 w=282 h=204 z=1 vis=true
    IMAGE panzi ___9 animation={"loop":{"animId":""}} id=show-c1 x=450 y=180 w=184 h=123 z=1 vis=true
    IMAGE need1 __03 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=170 y=320 w=61 h=61 z=1 vis=true
    IMAGE need2 __06 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=230 y=330 w=64 h=46 z=1 vis=true
    IMAGE submit-btn _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_13_3smw x=275 y=525 w=203 h=46 z=3 vis=true parent=""
    CLICK submit-btn effect="" enabled=true block=false front="" back="" showBack=true
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "作答阶段"
    VAR countdown = 30
    TEXT_SET cnt2 " ${countdown}秒后游戏结束"
    STYLE submit-btn {"display":"none","zIndex":0,"scale":0}
    STYLE foodtext {"display":"none","zIndex":0,"scale":0}
    IMAGE card-1 __01 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=405 y=335 w=97 h=63 z=1 vis=true
    IMAGE card-2 __02 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=510 y=335 w=63 h=70 z=1 vis=true
    IMAGE card-3 __03 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=590 y=335 w=81 h=81 z=1 vis=true
    IMAGE card-4 __04 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=415 y=430 w=67 h=70 z=1 vis=true
    IMAGE card-5 __05 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=510 y=440 w=63 h=49 z=1 vis=true
    IMAGE card-6 __06 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=590 y=440 w=80 h=58 z=1 vis=true
    DRAG card-1 enabled=true
    DRAG card-2 enabled=true
    DRAG card-3 enabled=true
    DRAG card-4 enabled=true
    DRAG card-5 enabled=true
    DRAG card-6 enabled=true
    IMAGE con _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=275 y=525 w=203 h=46 z=0 vis=true parent=""
    AREA dyn_last_drop_element_ID 444 172 190 130 enter=true outside=false
        STYLE dyn_last_drop_element_ID {"scale":0.6}
        IFEXPR "getVar('last_drop_element_ID').includes('3') ||\ngetVar('last_drop_element_ID').includes('6') "
            VAR cnt + 1 temporary=false
        ELSE
            VAR "cnt-不需要" + 1 temporary=false
    AREA dyn_last_drop_element_ID 444 172 190 130 enter=true outside=true
        STYLE dyn_last_drop_element_ID {"scale":1,"display":""}
        IFEXPR "getVar('last_drop_element_ID').includes('3') ||\ngetVar('last_drop_element_ID').includes('6') "
            VAR cnt - 1 temporary=false
        ELSE
            VAR "cnt-不需要" - 1 temporary=false
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SIGNAL final data=""

ON final "胜负判断"
    IFEXPR "getVar('cnt-不需要') == 0 && getVar('cnt') == 2 "
        VAR victory = true
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=101 vis=true parent=""
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
            NEXT
    ELSE
        SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
        VAR "失败已执行" = true
        CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this
```

## 14. 新场景

- scene_file: `速记消除战.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `6` top-level commands, `4` events
- omitted unsupported old commands: `1`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ______2_ | image | images/通用背景 (2).png | 通用背景 (2) |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| intro-1010_____ | image | images/G1010-速记消除战/intro-1010速记消除战.png | intro-1010速记消除战 |
| 1010-___1 | audio | audio/se/1010-描述.mp3 | 1010-描述 |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______3 | image | images/old/时钟下拉背景.png | 时钟下拉背景 |
| _____7 | image | images/old/时钟组件.png | 时钟组件 |
| ___1 | image | images/返回.png | 返回 |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| 1010-__ | audio | audio/se/1010-问诊.mp3 | 1010-问诊 |
| _____14 | image | images/G1010-速记消除战/指导文本.png | 指导文本 |
| _____13 | image | images/G1010-速记消除战/物品背景.png | 物品背景 |
| __01 | image | images/G1010-速记消除战/物品01.png | 物品01 |
| _______2 | image | images/old/通用按钮背景.png | 通用按钮背景 |
| count-overlay | image | images/测试资源/count-overlay.svg | count-overlay |
| ____ | animation | animations/基础效果/从零放大.json | 从零放大 |
| star | image | images/测试资源/star.svg | star |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |

### First-Level DSL

```vge-dsl
VAR "已胜利" = false
IMAGE background ______2_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce intro-1010_____ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=399 h=490 z=0 vis=true parent=""
BGM 1010-___1 vol=0.8 loop=false fade=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    STYLE mask {"display":"none","scale":0}
    STYLE introduce {"display":"none","scale":0}
    SIGNAL gameloop data=""

ON "倒计时" "倒计时"
    VAR "是否结束读题" = false
    VAR countdown = 7 temporary=false
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"32","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=710 y=5 block=false dismiss=true pad=20
    IMAGE clockbg _______3 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=17 w=100 h=35 z=0 vis=true parent=""
    IMAGE clock _____7 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=670 y=10 w=39 h=44 z=0 vis=true parent=""
    TEXT cnt2 " ${countdown}秒后游戏开始" id=countdown-text-show style={"fontSize":"24","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":0,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=290 y=490 block=false dismiss=true pad=20
    IMAGE fanhui ___1 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=0 y=0 w=59 h=59 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json level=1
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "分数" == 1
            WAIT 2000
            SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
            IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
            CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
                NEXT
        WAIT 1000
        VAR countdown - 1
        IFEXPR "getVar('countdown') > 9"
            TEXT_SET countdown-text ${countdown}s
            IF "是否结束读题" == false
                TEXT_SET cnt2 " ${countdown}秒后游戏开始"
            ELSE
                TEXT_SET cnt2 " ${countdown}秒后游戏结束"
        ELSE
            TEXT_SET countdown-text 0${countdown}s
            IF "是否结束读题" == false
                TEXT_SET cnt2 " 0${countdown}秒后游戏开始"
            ELSE
                TEXT_SET cnt2 " 0${countdown}秒后游戏结束"
        JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL final data=""

ON gameloop "读题阶段"
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#917373","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=45 block=false dismiss=true skin="" pad=14
    BGM 1010-__ vol=0.8 loop=false fade=0
    TEXT story-text "请将以下物品全部消除：" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"22","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=40 y=160 block=false dismiss=true skin="" pad=14
    SIGNAL "倒计时" data=""
    VAR cnt = 0 temporary=false
    VAR "cnt-不需要" = 0 temporary=false
    IMAGE "gui'de" _____14 animation={"loop":{"animId":""}} id=show-c1 x=160 y=470 w=413 h=48 z=1 vis=true
    IMAGE bg1 _____13 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=330 y=290 w=77 h=79 z=1 vis=true rot=0
    IMAGE bg2 _____13 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 x=420 y=290 w=77 h=79 z=1 vis=true rot=0
    IMAGE icon7 __01 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 style={"alignCenter":true,"anchorX":0.5,"anchorY":0.5} x=0 y=0 w=80 h=35 z=1 vis=true parent=bg1 rot=0
    IMAGE icon8 __01 animation={"loop":{"animId":""},"entry":{"animId":"___4"}} id=show-c1 style={"alignCenter":true,"anchorX":0.5,"anchorY":0.5} x=0 y=0 w=80 h=35 z=1 vis=true parent=bg2 rot=0
    IMAGE submit-btn _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_13_3smw x=275 y=525 w=203 h=46 z=3 vis=true parent=""
    CLICK submit-btn effect="" enabled=true block=false front="" back="" showBack=true
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "作答阶段"
    VAR countdown = 30
    TEXT_SET cnt2 " ${countdown}秒后游戏结束"
    STYLE submit-btn {"display":"none","zIndex":0,"scale":0}
    STYLE foodtext {"display":"none","zIndex":0,"scale":0}
    VAR score = 0 temporary=false
    VAR "上次点击元素" = empty temporary=false
    VAR iii = 0 temporary=false
    LOOP
        VAR iii + 1 temporary=true
        CLICK bg{iii} effect="" enabled=true block=false front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            IMAGE bg{iii}_select count-overlay animation={"entry":{"animId":"____","duration":0},"loop":{"animId":"","duration":0}} id=show_image_2 x=0 y=0 w=120 h=120 z=0 vis=true parent=bg{iii}
            VAR temp = false temporary=false
            IF temp == true
                VAR score + 1 temporary=false
                FIREWORK attachToId="" count=24 elementId=bg{iii} gravity=0.15 life=900 resourceId=star zIndex=50
                FIREWORK attachToId="" count=24 elementId="dyn_上次点击元素" gravity=0.15 life=900 resourceId=star zIndex=50
                ANIM_OUT dyn_lastClickID fade animId="" mode=preset offset=60 ms=600 dir=up hide=true
                ANIM_OUT "dyn_上次点击元素" fade animId="" mode=preset offset=60 ms=600 dir=up hide=true
                ANIM_OUT bg{iii}_select fade animId="" mode=preset offset=60 ms=600 dir=up hide=true
                VAR "上次点击元素" = empty temporary=false
                IF score == 1
                    WAIT 1000
                    SIGNAL final data=""
            ELSE
                IF "上次点击元素" != empty
                    ANIM_OUT bg{iii}_select fade animId=_____16 mode=resource offset=60 ms=800 dir=up hide=true
                    ANIM_OUT "{上次点击元素}_select" fade animId=_____16 mode=resource offset=60 ms=800 dir=up hide=true
                    VAR "上次点击元素" = empty temporary=false
                    VAR lastClickID = empty temporary=false
                ELSE
                    VAR "上次点击元素" = dyn_lastClickID temporary=false
        BREAK iii == 2
    IMAGE con _______2 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=275 y=525 w=203 h=46 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SIGNAL final data=""

ON final "胜负判断"
    IF score == 1
        VAR victory = true
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=224 y=40 w=401 h=509 z=101 vis=true parent=""
        SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
        CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
            NEXT
    ELSE
        SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
        VAR "失败已执行" = true
        CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this
```

## 15. 新场景

- scene_file: `顺序记忆师.json`
- level: `关卡1`
- canvas: `800 x 600`
- commands/events: `16` top-level commands, `5` events
- omitted unsupported old commands: `0`

### Level Resources

| id | type | path | name |
|---|---|---|---|
| ____a | image | images/全局背景a.png | 全局背景a |
| ___4 | animation | animations/基础效果/淡入.json | 淡入 |
| __ | image | images/测试资源/蒙层.png | 蒙层 |
| ______-_ | image | images/游戏规则背景-宽.png | 游戏规则背景-宽 |
| 1002-__ | unknown |  | 1002-__ |
| 001-System01 | audio | audio/se/001-System01.ogg | 001-System01 |
| _______2 | image | images/游戏规则背景.png | 游戏规则背景 |
| 0005_01-___1 | audio | audio/se/0005_01-问诊.mp3 | 0005_01-问诊 |
| _______ | image | images/G0005-顺序记忆师/顺序师读题背景.png | 顺序师读题背景 |
| __01 | image | images/G0005-顺序记忆师/咨询01.png | 咨询01 |
| _____15 | image | images/G0005-顺序记忆师/蓝色药品.png | 蓝色药品 |
| _____16 | image | images/G0005-顺序记忆师/棕色药品.png | 棕色药品 |
| ______ | image | images/old/通用继续按钮.png | 通用继续按钮 |
| 0005_01-__ | audio | audio/se/0005_01-问题.mp3 | 0005_01-问题 |
| ____01 | image | images/G0005-顺序记忆师/咨询药柜01.png | 咨询药柜01 |
| btn-primary-9slice | unknown |  | btn-primary-9slice |
| _____12 | audio | audio/se/游戏结束.mp3 | 游戏结束 |
| _____11 | image | images/失败弹窗.png | 失败弹窗 |
| _____3 | animation | animations/基础效果/向上滑入.json | 向上滑入 |
| _____9 | image | images/old/返回图标.png | 返回图标 |
| count-3_1 | image | images/测试资源/count-3.svg | count-3 |
| count-2_1 | image | images/测试资源/count-2.svg | count-2 |
| count-1_1 | image | images/测试资源/count-1.svg | count-1 |
| count-go_1 | image | images/测试资源/count-go.svg | count-go |
| ___2 | audio | audio/se/掌声.mp3 | 掌声 |
| _____10 | image | images/胜利弹窗.png | 胜利弹窗 |

### First-Level DSL

```vge-dsl
IMAGE background ____a align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=0 vis=true parent=""
IMAGE introduce ______-_ align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=70 y=90 w=660 h=420 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_1 "    欢迎来到 《顺序记忆师》您的健康守护者! 游戏简介:     在《顺序记忆师》中，您将扮演不同角色， 帮助那些随着岁月流逝可能面临健康挑战的 人们识别和使用药物。" id=show_text_1 style={"fontSize":"26","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=145 y=170 block=false dismiss=true skin="" pad=0
CLICK introduce effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE introduce {"display":"none","scale":0}
STYLE show_text_1 {"display":"none","scale":0}
IMAGE introduce2 _______2 align="" animation={"entry":{"animId":"___4"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=210 y=90 w=396 h=440 z=0 vis=true parent=""
BGM 1002-__ vol=0.8 loop=false fade=0
TEXT show_text_2 "在本轮游戏中，请您根 据要求选择药物服用的 先后顺序。游戏关卡和 难度是逐级匹配的，准 备好了吗?快来挑战吧!" id=show_text_1 style={"fontSize":"27","color":"#000000","stroke":"","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2,"maxWidth":"999","textAlign":"left"} x=270 y=170 block=false dismiss=true skin="" pad=0
CLICK introduce2 effect="" enabled=true block=true front="" back="" showBack=true
    SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
STYLE show_text_2 {"display":"none","scale":0}
STYLE introduce2 {"display":"none","scale":0}
STYLE mask {"display":"none","scale":0}
SIGNAL gamestart data=""

ON gamestart "读题阶段"
    VAR "是否结束读题" = false
    TEXT story-text "第1关" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"32","color":"#ffffff","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":true,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"center"} x=360 y=10 block=false dismiss=true skin="" pad=14
    BGM 0005_01-___1 vol=0.8 loop=false fade=0
    TEXT story-text "请您记住以下药品服用的先后顺序。（单选）" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=40 y=90 block=false dismiss=true skin="" pad=14
    SIGNAL "计时开始" data=""
    IMAGE "咨询背景" _______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=100 y=120 w=623 h=431 z=0 vis=true parent=""
    IMAGE "人信息" __01 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=220 y=200 w=386 h=97 z=0 vis=true parent=""
    IMAGE "药1" _____15 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=160 y=320 w=65 h=82 z=0 vis=true parent=""
    TEXT "药描述1" "每天一次，早餐后" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=240 y=335 block=false dismiss=true skin="" pad=14
    IMAGE "药2" _____16 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=160 y=400 w=65 h=82 z=0 vis=true parent=""
    TEXT "药描述2" "每天一次，晚餐后" id=cmd_mfvul71f_xkqs_0_nv23 style={"fontSize":"28","color":"#000000","fontFamily":"Arial, Helvetica, sans-serif","stroke":"#1e3a8a","strokeThickness":0,"dropShadow":false,"dropShadowColor":"#000000","dropShadowBlur":2,"dropShadowAngle":1.2,"dropShadowDistance":2,"lineHeight":28,"zIndex":12,"maxWidth":999,"textAlign":"left"} x=240 y=415 block=false dismiss=true skin="" pad=14
    IMAGE con ______ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=310 y=533 w=200 h=49 z=0 vis=true parent=""
    CLICK con effect="" enabled=true block=true front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        VAR "是否结束读题" = true
        SIGNAL answer data=""

ON answer "答题阶段"
    VAR countdown = 30
    TEXT_SET "药描述1" " "
    TEXT_SET "药描述2" " "
    STYLE "人信息" {"display":"none"}
    STYLE "药1" {"display":"none"}
    STYLE "咨询背景" {"display":"none"}
    STYLE "药2" {"display":"none"}
    STYLE con {"display":"none"}
    BGM 0005_01-__ vol=0.8 loop=false fade=0
    TEXT_SET story-text "请您为药品服用时间排序吧!（单选）"
    IMAGE "咨询" ____01 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=90 y=100 w=495 h=390 z=0 vis=true parent=""
    CHOICES show_choices_1 id=show_choices_1 ui={"rowMax":1,"gapX":16,"gapY":93,"minWidth":30,"fontSize":35,"maxWidth":300,"paddingX":24,"paddingY":16,"color":"#ffffff"} x=160 y=179 block=false multi=false skin=btn-primary-9slice
        OPTION option_1 "选A"
            SIGNAL success data=""
        OPTION option_2 "选B"
            SIGNAL fail data=""

ON fail "失败处理"
    IF "失败已执行" != true
        SE _____12 vol=1 loop=false fade=0 delay=0 interrupt=false
        IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=101 vis=true parent=""
        IMAGE fail-window _____11 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=102 vis=true parent=""
        VAR "失败已执行" = true
        CLICK fail-window effect="" enabled=true block=true front="" back="" showBack=true
            SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
            SCENE this

ON "计时开始" "倒计时"
    VAR countdown = 20
    TEXT countdown-text ${countdown}s id=countdown-text-show style={"fontSize":"20","color":"#ffffff","fill":"#ffffff","stroke":"#000000","strokeThickness":3,"textAlign":"right","maxWidth":"120","dropShadow":false,"zIndex":100,"dropShadowColor":"#000000","dropShadowBlur":0,"dropShadowAngle":1.2,"dropShadowDistance":2} x=735 y=10 block=false dismiss=true pad=20
    IMAGE fanhui _____9 align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_2 x=20 y=10 w=25 h=40 z=0 vis=true parent=""
    CLICK fanhui effect="" enabled=true block=false front="" back="" showBack=true
        SE 001-System01 vol=1 loop=false fade=0 delay=0 interrupt=false
        SCENE scene/entry.json
    IMAGE countdown-3 count-3_1 id=count-3-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-3 scaleIn ms=260
    WAIT 740
    STYLE countdown-3 {"display":"none"}
    IMAGE countdown-2 count-2_1 id=count-2-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-2 scaleIn ms=260
    WAIT 740
    STYLE countdown-2 {"display":"none"}
    IMAGE countdown-1 count-1_1 id=count-1-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-1 scaleIn ms=260
    WAIT 740
    STYLE countdown-1 {"display":"none"}
    IMAGE countdown-go count-go_1 id=count-go-show style={"anchorCenter":true} x=270 y=160 w=240 h=240 z=110 vis=true
    ANIM_IN countdown-go scaleIn ms=220
    WAIT 740
    STYLE countdown-go {"display":"none"}
    LABEL L1
    IFEXPR "getVar('countdown') > 0"
        IF "已胜利" == true
            WAIT 0
        ELSE
            WAIT 1000
            VAR countdown - 1
            IFEXPR "getVar('countdown') > 9"
                TEXT_SET countdown-text ${countdown}s
            ELSE
                TEXT_SET countdown-text 0${countdown}s
            JUMP L1
    ELSE
        IF "是否结束读题" == false
            VAR "是否结束读题" = true
            SIGNAL answer data=""
            JUMP L1
        ELSE
            SIGNAL fail data=""

ON success "胜利处理"
    VAR "已胜利" = true
    SE ___2 vol=1 loop=false fade=0 delay=0 interrupt=false
    IMAGE mask __ align="" animation={"entry":{"animId":""},"loop":{"animId":""}} id=show_image_1 x=0 y=0 w=800 h=600 z=113 vis=true parent=""
    IMAGE vv _____10 align="" animation={"entry":{"animId":"_____3"},"loop":{"animId":""}} id=cmd_mfuv240j_gg42_1_h0nb x=200 y=40 w=401 h=509 z=120 vis=true parent=""
    CLICK vv effect="" enabled=true block=true front="" back="" showBack=true
        NEXT
```
