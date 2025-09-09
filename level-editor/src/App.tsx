import React, { useState, useEffect } from 'react';
import { EditorState, LevelConfig, GameCommand, GameProject, CommandType } from './types';
import { CommandListPanel } from './components/CommandListPanel';
import { EventListPanel } from './components/EventListPanel';
import { VariableSwitchManager } from './components/VariableSwitchManager';
import { PixiCanvas } from './components/PixiCanvas';
import { TopStatusBar } from './components/TopStatusBar';
import { TriggerModalEditor } from './components/TriggerModalEditor';
import { FloatingPanel } from './components/FloatingPanel';
import BlueprintGraph from './components/BlueprintGraph';
import './App.css';

interface AppState {
  currentProject: GameProject | null;
  currentLevelId: string;
  selectedCommandIndex: number;
  selectedEventId: string | null;
  middlePanelTab: 'commands' | 'variables';
  isPlaying: boolean;
  // 添加触发器编辑器状态
  isTriggerEditorOpen: boolean;
  editingTrigger: {
    eventId: string;
    triggerIndex: number;
    triggerData: any;
  } | null;
  // 保存原始导入的 JSON 数据
  originalJsonData: any;
  // 蓝图预览状态
  isBlueprintOpen: boolean;
  // 面板状态管理
  panels: {
    events: {
      x: number;
      y: number;
      width: number;
      height: number;
      isMinimized: boolean;
      isMaximized: boolean;
    };
    commands: {
      x: number;
      y: number;
      width: number;
      height: number;
      isMinimized: boolean;
      isMaximized: boolean;
    };
    canvas: {
      x: number;
      y: number;
      width: number;
      height: number;
      isMinimized: boolean;
      isMaximized: boolean;
    };
  };
}

// 添加事件触发条件更新函数的类型定义
interface UpdateEventTriggerParams {
  eventId: string;
  triggerIndex: number;
  updatedTrigger: any;
}

const App: React.FC = () => {
  const [commands, setCommands] = useState<GameCommand[]>([]);
  const [currentCommand, setCurrentCommand] = useState<GameCommand | null>(null);
  const [resourceMap] = useState<Map<string, string>>(new Map());
  const [appState, setAppState] = useState<AppState>({
    currentProject: {
      id: 'default-game',
      name: '默认游戏',
      version: '1.0.0',
      levels: [{
        id: 'level1',
        name: '关卡1',
        commands: [],
        resources: []
      }],
      globalVariables: {},
      globalSwitches: {},
      resources: [
        // 默认资源
        { id: 'forest-bg', type: 'image', src: '/images/forest-background.svg', name: '森林背景' },
        { id: 'cave-entrance', type: 'image', src: '/images/cave-entrance.svg', name: '洞穴入口' },
        { id: 'village-shop', type: 'image', src: '/images/village-shop.svg', name: '村庄商店' },
        { id: 'treasure-room', type: 'image', src: '/images/treasure-room.svg', name: '宝藏房间' },
        { id: 'game-over-screen', type: 'image', src: '/images/game-over.svg', name: '游戏结束画面' }
      ]
    },
    currentLevelId: 'level1',
    selectedCommandIndex: -1,
    selectedEventId: null,
    middlePanelTab: 'commands',
    isPlaying: false,
    // 初始化触发器编辑器状态
    isTriggerEditorOpen: false,
    editingTrigger: null,
    originalJsonData: null, // 初始化为 null
    isBlueprintOpen: false, // 初始化为 false
    // 初始化面板状态
    panels: {
      events: { x: 20, y: 100, width: 250, height: 400, isMinimized: false, isMaximized: false },
      commands: { x: 300, y: 100, width: 500, height: 500, isMinimized: false, isMaximized: false },
      canvas: { x: 820, y: 100, width: 400, height: 500, isMinimized: false, isMaximized: false }
    }
  });

  const currentLevel = appState.currentProject?.levels.find(l => l.id === appState.currentLevelId) || appState.currentProject?.levels[0];

  // 获取当前关卡的事件列表
  const getCurrentLevelEvents = () => {
    if (!appState.currentProject) return [];
    const level = appState.currentProject.levels.find(l => l.id === appState.currentLevelId);
    if (!level || !(level as any).events) return [];
    return (level as any).events.map((e: any) => ({id: e.id, name: e.name}));
  };

  // 获取当前显示的指令列表（主流程或事件指令）
  const getCurrentCommands = (): GameCommand[] => {
    if (!currentLevel) return [];
    
    if (appState.selectedEventId === null) {
      // 显示主流程指令
      return currentLevel.commands;
    } else {
      // 显示指定事件的指令，需要进行转换处理
      const levelData = currentLevel as any;
      if (levelData.events && Array.isArray(levelData.events)) {
        const event = levelData.events.find((e: any) => e.id === appState.selectedEventId);
        if (event && event.commands) {
          // 处理事件指令，应用与主流程相同的转换逻辑
          return event.commands.map((cmd: any, index: number) => {
            const parameters = { ...cmd.parameters };
            // 将小写的指令类型转换为大写
            let commandType = cmd.type;
            if (typeof commandType === 'string') {
              if (commandType === 'set_variable') {
                commandType = 'SET_VARIABLE';
              } else if (commandType === 'set_switch') {
                commandType = 'SET_SWITCH';
              } else {
                commandType = commandType.toUpperCase();
              }
            }
            
            // 处理if条件分支中的指令
            let children: GameCommand[] = [];
            if (commandType === 'IF_CONDITION' && parameters) {
              if (parameters.trueCommands) {
                children = children.concat(parameters.trueCommands.map((c: any, i: number) => {
                  const trueCmdParams = { ...c.parameters };
                  let trueCmdType = c.type;
                  if (typeof trueCmdType === 'string') {
                    if (trueCmdType === 'set_variable') {
                      trueCmdType = 'SET_VARIABLE';
                    } else if (trueCmdType === 'set_switch') {
                      trueCmdType = 'SET_SWITCH';
                    } else {
                      trueCmdType = trueCmdType.toUpperCase();
                    }
                  }
                  return {
                    id: c.id || `event_true_cmd_${appState.selectedEventId}_${index}_${i}_${Date.now()}`,
                    type: trueCmdType as CommandType,
                    parameters: trueCmdParams,
                    enabled: c.enabled !== undefined ? c.enabled : true,
                    description: c.description || '',
                    depth: 1,
                    children: []
                  } as GameCommand;
                }));
              }
              if (parameters.falseCommands) {
                children = children.concat(parameters.falseCommands.map((c: any, i: number) => {
                  const falseCmdParams = { ...c.parameters };
                  let falseCmdType = c.type;
                  if (typeof falseCmdType === 'string') {
                    if (falseCmdType === 'set_variable') {
                      falseCmdType = 'SET_VARIABLE';
                    } else if (falseCmdType === 'set_switch') {
                      falseCmdType = 'SET_SWITCH';
                    } else {
                      falseCmdType = falseCmdType.toUpperCase();
                    }
                  }
                  return {
                    id: c.id || `event_false_cmd_${appState.selectedEventId}_${index}_${i}_${Date.now()}`,
                    type: falseCmdType as CommandType,
                    parameters: falseCmdParams,
                    enabled: c.enabled !== undefined ? c.enabled : true,
                    description: c.description || '',
                    depth: 1,
                    children: []
                  } as GameCommand;
                }));
              }
              // 移除trueCommands和falseCommands，避免重复显示
              delete parameters.trueCommands;
              delete parameters.falseCommands;
            }
            
            return {
              id: cmd.id || `event_cmd_${appState.selectedEventId}_${index}_${Date.now()}`,
              type: commandType as CommandType,
              parameters,
              enabled: cmd.enabled !== undefined ? cmd.enabled : true,
              description: cmd.description || '',
              depth: 0,
              children
            } as GameCommand;
          });
        }
      }
    }
    
    return [];
  };

  const currentCommands = getCurrentCommands();

  const handleCommandsChange = (commands: GameCommand[]) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      
      const updatedLevels = prev.currentProject.levels.map(level => {
        if (level.id !== prev.currentLevelId) return level;
        
        if (prev.selectedEventId === null) {
          // 更新主流程指令
          return { ...level, commands };
        } else {
          // 更新事件指令，需要转换回原始格式
          const levelData = level as any;
          if (levelData.events && Array.isArray(levelData.events)) {
            const updatedEvents = levelData.events.map((event: any) => {
              if (event.id === prev.selectedEventId) {
                // 将GameCommand转换回原始格式
                const convertedCommands = commands.map(cmd => {
                  let originalType = cmd.type;
                  // 将大写转换回小写
                  if (originalType === 'SET_VARIABLE') {
                    originalType = 'set_variable';
                  } else if (originalType === 'SET_SWITCH') {
                    originalType = 'set_switch';
                  } else {
                    originalType = originalType.toLowerCase();
                  }
                  
                  const convertedCmd: any = {
                    id: cmd.id,
                    type: originalType,
                    parameters: cmd.parameters,
                    enabled: cmd.enabled,
                    description: cmd.description
                  };
                  
                  // 处理条件分支指令的子指令
                  if (originalType === 'if_condition' && cmd.children && cmd.children.length > 0) {
                    const trueCommands: any[] = [];
                    const falseCommands: any[] = [];
                    
                    cmd.children.forEach(child => {
                      let childType = child.type;
                      if (childType === 'SET_VARIABLE') {
                        childType = 'set_variable';
                      } else if (childType === 'SET_SWITCH') {
                        childType = 'set_switch';
                      } else {
                        childType = childType.toLowerCase();
                      }
                      
                      const childCmd = {
                        id: child.id,
                        type: childType,
                        parameters: child.parameters,
                        enabled: child.enabled,
                        description: child.description
                      };
                      
                      // 根据groupName判断是trueCommands还是falseCommands
                      if (child.groupName === '条件成立时') {
                        trueCommands.push(childCmd);
                      } else if (child.groupName === '条件不成立时') {
                        falseCommands.push(childCmd);
                      }
                    });
                    
                    if (trueCommands.length > 0) {
                      convertedCmd.parameters.trueCommands = trueCommands;
                    }
                    if (falseCommands.length > 0) {
                      convertedCmd.parameters.falseCommands = falseCommands;
                    }
                  }
                  
                  return convertedCmd;
                });
                
                return { ...event, commands: convertedCommands };
              }
              return event;
            });
            return { ...level, events: updatedEvents };
          }
        }
        
        return level;
      });
      
      return {
        ...prev,
        currentProject: {
          ...prev.currentProject,
          levels: updatedLevels
        }
      };
    });
  };

  const handleCommandSelect = (index: number) => {
    setAppState(prev => ({
      ...prev,
      selectedCommandIndex: index
    }));
  };

  const handleLevelChange = (levelId: string) => {
    setAppState(prev => ({
      ...prev,
      currentLevelId: levelId,
      selectedCommandIndex: -1,
      selectedEventId: null // 切换关卡时重置为主流程
    }));
  };

  // 新增：关卡更新处理函数
  const handleLevelUpdate = (levelId: string, updates: any) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      
      const updatedLevels = prev.currentProject.levels.map(level => {
        if (level.id === levelId) {
          return { ...level, ...updates };
        }
        return level;
      });
      
      return {
        ...prev,
        currentProject: {
          ...prev.currentProject,
          levels: updatedLevels
        }
      };
    });
  };

  // 面板状态更新处理函数
  const handlePanelStateChange = (panelName: 'events' | 'commands' | 'canvas', state: any) => {
    setAppState(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [panelName]: state
      }
    }));
  };

  // 新增：事件选择处理函数
  const handleEventSelect = (eventId: string | null) => {
    setAppState(prev => ({
      ...prev,
      selectedEventId: eventId,
      selectedCommandIndex: -1 // 切换事件时重置选中的指令
    }));
  };

  const handleLoadJson = (gameData: any) => {
    if (gameData.levels && Array.isArray(gameData.levels)) {
      // 首先构建资源映射
      const resourceMap = new Map();
      if (gameData.resources && Array.isArray(gameData.resources)) {
        gameData.resources.forEach((resource: any) => {
          resourceMap.set(resource.id, resource.url);
        });
      }

      // 递归处理指令，包括事件和条件分支中的指令
      interface GameEvent {
        id: string;
        name: string;
        triggers?: Array<{
          condition?: {
            expression?: string;
          };
        }>;
        commands: any[];
      }

      const processCommand = (cmd: any, depth: number = 0, parentId?: string, groupName?: string): GameCommand => {
        const parameters = { ...cmd.parameters };
        // 将小写的指令类型转换为大写
        let commandType = cmd.type;
        if (typeof commandType === 'string') {
          // 特殊情况处理
          if (commandType === 'set_variable') {
            commandType = 'SET_VARIABLE';
          } else if (commandType === 'set_switch') {
            commandType = 'SET_SWITCH';
          } else {
            // 其他情况转换为大写
            commandType = commandType.toUpperCase();
          }
        }
        const id = cmd.id || `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 处理图片资源
        if (commandType === 'SHOW_IMAGE' && parameters.resourceId) {
          parameters.src = resourceMap.get(parameters.resourceId) || parameters.resourceId;
        }

        // 处理按钮转换为选项
        if (commandType === 'SHOW_BUTTON') {
          parameters.choices = parameters.text ? [parameters.text] : [];
          parameters.title = parameters.text;
        }

        const command: GameCommand = {
          id,
          type: commandType as CommandType,  // 使用原始类型
          parameters,
          enabled: cmd.enabled !== undefined ? cmd.enabled : true,
          description: cmd.description || '',
          parentId,
          depth,
          groupName,
          children: [] as GameCommand[]
        };

        // 处理if条件分支中的指令
        if (commandType === 'if_condition') {
          if (parameters.trueCommands) {
            parameters.trueCommands.forEach((c: any) => {
              command.children!.push(processCommand(c, depth + 1, id, '条件成立时'));
            });
          }
          if (parameters.falseCommands) {
            parameters.falseCommands.forEach((c: any) => {
              command.children!.push(processCommand(c, depth + 1, id, '条件不成立时'));
            });
          }
          delete parameters.trueCommands;
          delete parameters.falseCommands;
        }

        return command;
      };

      // 创建事件映射，将按钮的onClick事件名映射到对应的事件处理器
      const createEventMap = (level: any): Map<string, GameEvent> => {
        const eventMap = new Map<string, GameEvent>();
        if (level.events && Array.isArray(level.events)) {
          level.events.forEach((event: GameEvent) => {
            const trigger = event.triggers?.[0]?.condition?.expression;
            if (trigger) {
              const match = trigger.match(/event\.action === '(.+)'/);
              if (match) {
                const actionName = match[1];
                eventMap.set(actionName, event);
              }
            }
          });
        }
        return eventMap;
      };

      // 处理所有指令，但不在主流程中展示按钮事件的子指令
      const processLevelCommands = (level: any): GameCommand[] => {
        const commands: GameCommand[] = [];
        const eventMap = createEventMap(level);
        
        // 首先处理主指令列表
        if (level.commands && Array.isArray(level.commands)) {
          level.commands.forEach((cmd: any) => {
            const processedCmd = processCommand(cmd, 0);
            
            // 在主流程中，不展示按钮事件的子指令，但保持条件分支的嵌套
            // 不在这里添加按钮事件的子指令
            
            commands.push(processedCmd);
          });
        }
        
        // 处理独立事件（不是选项或按钮关联的事件）
        if (level.events && Array.isArray(level.events)) {
          level.events.forEach((event: GameEvent) => {
            const isOptionEvent = Array.from(eventMap.entries()).some(
              ([key, value]) => value === event
            );
            
            if (!isOptionEvent && event.commands && Array.isArray(event.commands)) {
              const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const eventCommand = processCommand({
                type: 'EVENT_GROUP',
                parameters: {
                  name: event.name,
                  trigger: event.triggers?.[0]?.condition?.expression || ''
                },
                id: eventId,
                description: `事件: ${event.name || '未命名事件'}`,
                commands: event.commands
              }, 0);
              
              // 直接处理事件中的子指令
              event.commands.forEach((cmd: any) => {
                eventCommand.children!.push(
                  processCommand(cmd, 1, eventId, event.name)
                );
              });
              
              commands.push(eventCommand);
            }
          });
        }

        // 展平树状结构，保持层级关系
        const flattenedCommands: GameCommand[] = [];
        const flatten = (cmd: GameCommand, baseDepth: number = 0) => {
          // 设置当前指令的深度
          cmd.depth = baseDepth;
          flattenedCommands.push(cmd);
          
          // 递归处理子指令（仅处理条件分支类型的子指令）
          if (cmd.children && cmd.children.length > 0) {
            cmd.children.forEach(child => {
              child.parentId = cmd.id;
              child.groupName = child.groupName || cmd.parameters?.name;
              flatten(child, baseDepth + 1);
            });
          }
        };

        commands.forEach(cmd => flatten(cmd, cmd.depth || 0));
        return flattenedCommands;
      };

      const levels: LevelConfig[] = gameData.levels.map((level: any, index: number) => {
        const commands = processLevelCommands(level);
        
        // 保存原始的events数据到level中，以便事件列表组件可以访问
        const levelWithEvents = {
          id: level.id || `level${index + 1}`,
          name: level.name || `关卡${index + 1}`,
          commands,
          resources: level.resources || [],
          events: level.events || [], // 保存原始事件数据
          canvasWidth: level.canvasWidth || 800, // 添加画布宽度
          canvasHeight: level.canvasHeight || 600 // 添加画布高度
        };
        
        return levelWithEvents;
      });
      
      // 合并默认资源和加载的资源
      const defaultResources = [
        { id: 'forest-bg', type: 'image', src: '/images/forest-background.svg', name: '森林背景' },
        { id: 'cave-entrance', type: 'image', src: '/images/cave-entrance.svg', name: '洞穴入口' },
        { id: 'village-shop', type: 'image', src: '/images/village-shop.svg', name: '村庄商店' },
        { id: 'treasure-room', type: 'image', src: '/images/treasure-room.svg', name: '宝藏房间' },
        { id: 'game-over-screen', type: 'image', src: '/images/game-over.svg', name: '游戏结束画面' }
      ];
      
      const loadedResources = gameData.resources || [];
      const allResources = [...defaultResources, ...loadedResources];
      
      setAppState({
        currentProject: {
          id: gameData.id || 'loaded-game',
          name: gameData.name || gameData.title || '加载的游戏',
          version: gameData.version || '1.0.0',
          levels,
          globalVariables: gameData.globalVariables || {},
          globalSwitches: gameData.globalSwitches || {},
          resources: allResources
        },
        currentLevelId: levels[0]?.id || 'level1',
        selectedCommandIndex: -1,
        selectedEventId: null,
        middlePanelTab: 'commands',
        isPlaying: false,
        isTriggerEditorOpen: false,
        editingTrigger: null,
        originalJsonData: gameData // 保存原始导入的 JSON 数据
      });
    }
  };

  const handleSaveJson = () => {
    if (!appState.currentProject) return;
    
    // 将当前处理后的数据转换回原始格式
    const convertToOriginalFormat = () => {
      // 转换levels数据，确保包含画布宽高信息
      const levelsData = appState.currentProject!.levels.map(level => {
        const levelData: any = {
          id: level.id,
          name: level.name,
          resources: level.resources || [],
          canvasWidth: level.canvasWidth || 800,
          canvasHeight: level.canvasHeight || 600
        };
        
        // 转换commands回原始格式
        const convertCommandsToOriginal = (commands: GameCommand[]): any[] => {
          return commands.map(cmd => {
            let originalType = cmd.type;
            // 将大写转换回小写
            if (originalType === 'SET_VARIABLE') {
              originalType = 'set_variable';
            } else if (originalType === 'SET_SWITCH') {
              originalType = 'set_switch';
            } else if (originalType === 'if_condition') {
              originalType = 'if_condition';
            } else {
              originalType = originalType.toLowerCase();
            }
            
            const convertedCmd: any = {
              id: cmd.id,
              type: originalType,
              parameters: cmd.parameters,
              enabled: cmd.enabled,
              description: cmd.description
            };
            
            // 处理条件分支指令的子指令
            if (originalType === 'if_condition' && cmd.children && cmd.children.length > 0) {
              const trueCommands: any[] = [];
              const falseCommands: any[] = [];
              
              cmd.children.forEach(child => {
                let childType = child.type;
                if (childType === 'SET_VARIABLE') {
                  childType = 'set_variable';
                } else if (childType === 'SET_SWITCH') {
                  childType = 'set_switch';
                } else {
                  childType = childType.toLowerCase();
                }
                
                const childCmd = {
                  id: child.id,
                  type: childType,
                  parameters: child.parameters,
                  enabled: child.enabled,
                  description: child.description
                };
                
                // 根据groupName判断是trueCommands还是falseCommands
                if (child.groupName === '条件成立时') {
                  trueCommands.push(childCmd);
                } else if (child.groupName === '条件不成立时') {
                  falseCommands.push(childCmd);
                }
              });
              
              if (trueCommands.length > 0) {
                convertedCmd.parameters.trueCommands = trueCommands;
              }
              if (falseCommands.length > 0) {
                convertedCmd.parameters.falseCommands = falseCommands;
              }
            }
            
            return convertedCmd;
          });
        };
        
        levelData.commands = convertCommandsToOriginal(level.commands);
        
        // 如果有events数据，也需要保存并转换
        if ((level as any).events) {
          levelData.events = (level as any).events;
        }
        
        return levelData;
      });
      
      return {
        id: appState.currentProject!.id,
        name: appState.currentProject!.name,
        version: appState.currentProject!.version,
        globalVariables: appState.currentProject!.globalVariables,
        globalSwitches: appState.currentProject!.globalSwitches,
        audio: {
          globalVolume: 0.8,
          soundVolume: 1.0,
          musicVolume: 0.6,
          muted: false
        },
        levels: levelsData,
        resources: appState.currentProject!.resources
      };
    };
    
    // 获取转换后的数据
    const gameData = convertToOriginalFormat();
    
    // 更新originalJsonData以便下次导出时使用最新数据
    setAppState(prev => ({
      ...prev,
      originalJsonData: gameData
    }));
    
    const dataStr = JSON.stringify(gameData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'game-data.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  // 新增：加载测试数据
  const handleLoadTestData = async () => {
    try {
      const response = await fetch('/adventure-choice-game.json');
      if (response.ok) {
        const gameData = await response.json();
        handleLoadJson(gameData);
      } else {
        alert('测试数据文件未找到');
      }
    } catch (error) {
      console.error('加载测试数据失败:', error);
      alert('加载测试数据失败');
    }
  };

  // 蓝图相关处理函数
  const handleShowBlueprint = () => {
    setAppState(prev => ({
      ...prev,
      isBlueprintOpen: true
    }));
  };

  const handleCloseBlueprint = () => {
    setAppState(prev => ({
      ...prev,
      isBlueprintOpen: false
    }));
  };

  // 新增：更新事件触发条件
  const handleUpdateEventTrigger = (eventId: string, triggerIndex: number, updatedTrigger: any) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      
      const updatedLevels = prev.currentProject.levels.map(level => {
        if (level.id !== prev.currentLevelId) return level;
        
        const levelData = level as any;
        if (levelData.events && Array.isArray(levelData.events)) {
          const updatedEvents = levelData.events.map((event: any) => {
            if (event.id === eventId) {
              // 更新指定索引的触发条件
              const updatedTriggers = [...event.triggers];
              if (updatedTriggers[triggerIndex]) {
                updatedTriggers[triggerIndex] = updatedTrigger;
              }
              return { ...event, triggers: updatedTriggers };
            }
            return event;
          });
          return { ...level, events: updatedEvents };
        }
        
        return level;
      });
      
      return {
        ...prev,
        currentProject: {
          ...prev.currentProject,
          levels: updatedLevels
        }
      };
    });
  };

  // 新增：打开触发器编辑器
  const handleOpenTriggerEditor = (eventId: string, triggerIndex: number, triggerData: any) => {
    setAppState(prev => ({
      ...prev,
      isTriggerEditorOpen: true,
      editingTrigger: {
        eventId,
        triggerIndex,
        triggerData
      }
    }));
  };

  // 新增：关闭触发器编辑器
  const handleCloseTriggerEditor = () => {
    setAppState(prev => ({
      ...prev,
      isTriggerEditorOpen: false,
      editingTrigger: null
    }));
  };

  // 新增：保存触发器编辑
  const handleSaveTriggerEdit = (updatedTrigger: any) => {
    if (appState.editingTrigger) {
      // 确保触发器数据格式正确
      // 触发器的产物应该是一个表达式
      const triggerToSave = {
        ...updatedTrigger,
        condition: updatedTrigger.condition || undefined,
        conditions: updatedTrigger.conditions || undefined
      };
      
      handleUpdateEventTrigger(
        appState.editingTrigger.eventId,
        appState.editingTrigger.triggerIndex,
        triggerToSave
      );
    }
    handleCloseTriggerEditor();
  };

  // 变量管理函数
  const handleVariableChange = (key: string, value: any) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      return {
        ...prev,
        currentProject: {
          ...prev.currentProject,
          globalVariables: {
            ...prev.currentProject.globalVariables,
            [key]: value
          }
        }
      };
    });
  };

  const handleVariableAdd = (key: string, value: any) => {
    handleVariableChange(key, value);
  };

  const handleVariableDelete = (key: string) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const newVariables = { ...prev.currentProject.globalVariables };
      delete newVariables[key];
      return {
        ...prev,
        currentProject: {
          ...prev.currentProject,
          globalVariables: newVariables
        }
      };
    });
  };

  // 开关管理函数
  const handleSwitchChange = (key: string, value: boolean) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const globalSwitches = prev.currentProject.globalSwitches || {};
      return {
        ...prev,
        currentProject: {
          ...prev.currentProject,
          globalSwitches: {
            ...globalSwitches,
            [key]: value
          }
        }
      };
    });
  };

  const handleSwitchAdd = (key: string, value: boolean) => {
    handleSwitchChange(key, value);
  };

  const handleSwitchDelete = (key: string) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const newSwitches = { ...(prev.currentProject.globalSwitches || {}) };
      delete newSwitches[key];
      return {
        ...prev,
        currentProject: {
          ...prev.currentProject,
          globalSwitches: newSwitches
        }
      };
    });
  };

  if (!currentLevel) {
    return <div>加载中...</div>;
  }

  return (
    <div className="app">
      <TopStatusBar
        currentLevel={currentLevel}
        levels={appState.currentProject?.levels || []}
        onLevelChange={handleLevelChange}
        onLevelUpdate={handleLevelUpdate}
        onLoadJson={handleLoadJson}
        onSaveJson={handleSaveJson}
        isPlaying={appState.isPlaying}
        onPlayToggle={(playing: boolean) => setAppState(prev => ({ ...prev, isPlaying: playing }))}
        onShowBlueprint={handleShowBlueprint}
      />
      
      {/* 浮动事件面板 */}
      <FloatingPanel
        id="events-panel"
        title="📋 事件列表"
        defaultX={appState.panels.events.x}
        defaultY={appState.panels.events.y}
        defaultWidth={appState.panels.events.width}
        defaultHeight={appState.panels.events.height}
        minWidth={200}
        minHeight={150}
        onStateChange={(state) => handlePanelStateChange('events', state)}
      >
        <EventListPanel
          level={currentLevel}
          selectedEventId={appState.selectedEventId}
          onEventSelect={handleEventSelect}
          onOpenTriggerEditor={handleOpenTriggerEditor}
        />
      </FloatingPanel>
      
      {/* 浮动指令面板 */}
      <FloatingPanel
        id="commands-panel"
        title="⚡ 指令编辑器"
        defaultX={appState.panels.commands.x}
        defaultY={appState.panels.commands.y}
        defaultWidth={appState.panels.commands.width}
        defaultHeight={appState.panels.commands.height}
        minWidth={300}
        minHeight={200}
        onStateChange={(state) => handlePanelStateChange('commands', state)}
      >
        <div className="panel-tabs">
          <div className="tab-header">
            <button 
              className={`tab-btn ${appState.middlePanelTab === 'commands' ? 'active' : ''}`}
              onClick={() => setAppState(prev => ({ ...prev, middlePanelTab: 'commands' }))}
            >
              📋 指令列表
            </button>
            <button 
              className={`tab-btn ${appState.middlePanelTab === 'variables' ? 'active' : ''}`}
              onClick={() => setAppState(prev => ({ ...prev, middlePanelTab: 'variables' }))}
            >
              📊 变量开关
            </button>
          </div>
          <div className="tab-content">
            {appState.middlePanelTab === 'commands' ? (
              <CommandListPanel
                commands={currentCommands}
                selectedIndex={appState.selectedCommandIndex}
                project={appState.currentProject}
                onCommandsChange={handleCommandsChange}
                onCommandSelect={handleCommandSelect}
              />
            ) : (
              <VariableSwitchManager
                project={appState.currentProject}
                onVariableChange={handleVariableChange}
                onSwitchChange={handleSwitchChange}
                onVariableAdd={handleVariableAdd}
                onSwitchAdd={handleSwitchAdd}
                onVariableDelete={handleVariableDelete}
                onSwitchDelete={handleSwitchDelete}
              />
            )}
          </div>
        </div>
      </FloatingPanel>
      
      {/* 浮动画面面板 */}
      <FloatingPanel
        id="canvas-panel"
        title="🎮 游戏预览"
        defaultX={appState.panels.canvas.x}
        defaultY={appState.panels.canvas.y}
        defaultWidth={appState.panels.canvas.width}
        defaultHeight={appState.panels.canvas.height}
        minWidth={300}
        minHeight={200}
        onStateChange={(state) => handlePanelStateChange('canvas', state)}
      >
        <PixiCanvas
          commands={currentCommands}
          selectedCommandIndex={appState.selectedCommandIndex}
          isPlaying={appState.isPlaying}
          canvasWidth={(currentLevel as any).canvasWidth || 800}
          canvasHeight={(currentLevel as any).canvasHeight || 600}
        />
      </FloatingPanel>
      
      {/* 触发器编辑器模态框 */}
      <TriggerModalEditor
        isOpen={appState.isTriggerEditorOpen}
        trigger={appState.editingTrigger?.triggerData || {}}
        variables={appState.currentProject?.globalVariables || {}}
        switches={appState.currentProject?.globalSwitches || {}}
        events={getCurrentLevelEvents()}
        onSave={handleSaveTriggerEdit}
        onCancel={handleCloseTriggerEditor}
      />
      
      {/* 蓝图预览组件 */}
      {currentLevel && (
        <BlueprintGraph
          level={currentLevel}
          isOpen={appState.isBlueprintOpen}
          onClose={handleCloseBlueprint}
        />
      )}
    </div>
  );
};

export default App;