# 游戏运行时引擎 MVP

数据驱动的游戏运行时引擎MVP版本，专注于核心功能实现和架构验证。

## 项目概述

本项目实现了一个轻量级、可扩展的游戏运行时引擎，支持：

- 🎮 数据驱动的游戏逻辑
- 📝 完整的指令系统
- 🔄 状态管理和持久化
- 🎯 事件驱动架构
- 🎵 音频管理
- 🖼️ 渲染抽象层
- ✅ 配置验证

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 构建项目
npm run build

# 监听模式构建
npm run build:watch

# 运行示例
npm run dev
```

### 测试

```bash
# 运行所有测试
npm test

# 监听模式测试
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 代码质量

```bash
# 代码检查
npm run lint

# 自动修复
npm run lint:fix
```

## 项目结构

```
dev/
├── src/                    # 源代码
│   ├── core/              # 核心模块
│   │   ├── GameRuntime.ts # 主引擎类
│   │   ├── StateManager.ts# 状态管理
│   │   ├── EventManager.ts# 事件管理
│   │   └── ...
│   ├── commands/          # 指令实现
│   │   ├── base/         # 基础指令
│   │   ├── flow/         # 流程控制
│   │   ├── state/        # 状态控制
│   │   └── ...
│   ├── types/            # 类型定义
│   ├── utils/            # 工具函数
│   ├── adapters/         # 技术栈适配器
│   ├── examples/         # 示例代码
│   └── index.ts          # 入口文件
├── tests/                # 测试文件
├── docs/                 # 文档
└── dist/                 # 构建输出
```

## 核心概念

### 游戏运行时 (GameRuntime)

主引擎类，负责协调所有子系统：

```typescript
const runtime = new GameRuntime(adapter, config);
await runtime.initialize();
await runtime.loadLevel(levelConfig);
runtime.start();
```

### 指令系统 (Commands)

支持多种指令类型：

- **状态控制**: `set_variable`, `set_switch`
- **流程控制**: `wait`, `jump_to`, `emit_signal`
- **条件分支**: `if_condition`, `loop`
- **显示控制**: `show_image`, `show_text`
- **音频控制**: `play_sound`, `play_music`
- **用户交互**: `show_choices`, `enable_click`
- **游戏逻辑**: `check_answer`, `add_score`

### 状态管理 (StateManager)

管理游戏状态和变量：

```typescript
stateManager.setVariable('score', 100);
stateManager.setSwitch('level1_completed', true);
const score = stateManager.getVariable('score');
```

### 事件系统 (EventManager)

支持事件驱动的游戏逻辑：

```typescript
eventManager.on('player_answer', (data) => {
  // 处理玩家答题事件
});

eventManager.emit('level_complete', { level: 1 });
```

## 配置示例

### 游戏配置

```json
{
  "id": "basic-game",
  "name": "基础问答游戏",
  "version": "1.0.0",
  "levels": [
    {
      "id": "level1",
      "name": "第一关",
      "initialState": {
        "score": 0,
        "lives": 3
      },
      "commands": [
        {
          "id": "show_question",
          "type": "show_text",
          "parameters": {
            "text": "1 + 1 = ?",
            "position": { "x": 100, "y": 100 }
          }
        }
      ]
    }
  ]
}
```

## API 文档

详细的API文档请参考 [docs/api.md](docs/api.md)

## 开发指南

### 添加新指令

1. 在 `src/commands/` 下创建指令类
2. 实现 `ICommandHandler` 接口
3. 在 `CommandExecutor` 中注册

### 添加新适配器

1. 在 `src/adapters/` 下创建适配器类
2. 实现对应的适配器接口
3. 在 `TechStackAdapter` 中集成

## 测试策略

- **单元测试**: 每个模块的核心功能
- **集成测试**: 模块间的协作
- **端到端测试**: 完整的游戏流程
- **性能测试**: 关键路径的性能指标

## 性能指标

- 指令执行延迟: < 10ms
- 状态更新延迟: < 5ms
- 内存使用: 合理范围内
- 测试覆盖率: > 80%

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

## 更新日志

### v1.0.0
- 初始MVP版本
- 核心引擎实现
- 基础指令系统
- 状态和事件管理
- 技术栈适配器
