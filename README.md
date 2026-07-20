# Vibe Game Engine

Vibe Game Engine 是一个数据驱动的 2D 游戏运行时和 Web 关卡编辑器。它把游戏拆成 JSON 场景、资源、事件和指令，让游戏内容可以由编辑器、AI 或配置文件组织，而不是写死在业务代码里。

## 在线使用

- [在线编辑器](https://wukangmh2022-cmyk.github.io/vibe-game-engine/editor/)
  打开本地项目文件夹后即可编辑场景、资源和事件。工程会保存在浏览器缓存或用户授权的本地文件夹中，可在之后继续开发，并随时导出完整 `project.zip`。
- [智慧健脑客户示例](https://wukangmh2022-cmyk.github.io/vibe-game-engine/)
  面向客户的静态试玩版，已移除登录、账号、进度同步和分数上传。

## AI 生成关卡

编辑器的 AI 面板将关卡需求、画布尺寸、当前指令树和已选资源整理为符合引擎规范的提示词。填写自己的 OpenRouter API Key 后，可直接生成可写入关卡的 `commands` JSON；密钥只保存在当前浏览器，不会提交到项目或 GitHub Pages。生成结果仍可在指令树中逐条调整，并立刻在右侧 Pixi 画布预览。

典型流程：描述玩法 -> 选择要引用的图片、音频或动画资源 -> 生成关卡指令 -> 在预览中验证 -> 保存或导出工程。

## 功能概览

- 自动组织资源：读取项目资源、类型、路径和图片尺寸，降低资源引用错误。
- 指令化游戏逻辑：通过 `show_text`、`show_image`、`show_button`、`show_choices`、`set_variable`、`if_condition`、`loop`、`scene_redirect` 等指令组织玩法。
- 可视化编辑器：提供项目首页、场景列表、命令树、事件面板、变量/开关管理、资源选择和 Pixi 预览画布。
- 运行时预览：同一份 JSON 可在编辑器中预览，也可通过独立 runtime 页面运行。
- 事件和交互：支持按钮、选择项、拖拽、区域检测、条件分支、变量状态和场景跳转。
- RPG 图片地图：主分支包含实验性图片地图、角色移动、碰撞遮罩和前景遮挡层，详见 [RPG 图片地图运行时](docs/rpg-image-map-runtime.md)。

## Screenshots

### 可视化关卡编辑

![Vibe Game Engine 编辑器工作台](docs/images/editor-workspace.png)

### AI 生成关卡指令

![AI 关卡生成与资源引用面板](docs/images/ai-level-generation.png)

## 技术栈

- TypeScript
- React
- PixiJS runtime/editor integration
- Webpack editor build
- Jest + ts-jest
- AJV schema validation
- EventEmitter3

## 工程结构

```text
src/
├── core/                       # GameRuntime、CommandExecutor、状态、事件、资源管理
├── commands/                   # 通用命令处理器
├── browser/                    # Pixi 浏览器渲染与交互处理器
├── handlers/                   # 拖拽、区域检测等扩展处理器
└── types/                      # 运行时类型定义

level-editor/
├── src/App.tsx                 # 编辑器主界面
├── src/components/             # 命令、事件、变量、资源、AI 生成等面板
├── src/runtime/                # 编辑器内 Pixi 预览运行时
└── public/                     # 编辑器和 runtime HTML 模板
```

## 本地开发

```bash
npm install
npm run build
npm start
```

## GitHub Pages 发布

`customer-demo/` 是智慧健脑的静态客户版本，默认进入健脑训练菜单，全部本地关卡可用，且不含登录、账号、进度同步和分数上传指令。GitHub Actions 会在 `main` 每次推送后构建客户示例与在线编辑器，并发布到 GitHub Pages。

本地构建 Pages 产物：

```bash
npm run build:customer-demo
```

产物位于 `gh-pages/`，部署工作流见 `.github/workflows/deploy-customer-demo.yml`。首次启用时，请在仓库 Settings 的 **Pages > Build and deployment** 中选择 **GitHub Actions**。
