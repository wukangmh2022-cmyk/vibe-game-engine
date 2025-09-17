import React, { useState, useEffect } from 'react';
import { EditorState, LevelConfig, GameCommand, GameProject, CommandType } from './types';
import { CommandListPanel } from './components/CommandListPanel';
import { EventListPanel } from './components/EventListPanel';
import { VariableSwitchManager } from './components/VariableSwitchManager';
import { PixiCanvas } from './components/PixiCanvas';
import { TopStatusBar } from './components/TopStatusBar';
import { FloatingPanel } from './components/FloatingPanel';
import { CommandTreePanel } from './components/CommandTreePanel';
import { CombinedLibraryPanel } from './components/CombinedLibraryPanel';
import { ProjectHome } from './components/ProjectHome';
import { TriggerModalEditor } from './components/TriggerModalEditor';
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
  // 新：用于运行时预览的完整 JSON
  runtimeGameData?: any | null;
  // 初始页/工程选择
  isHome?: boolean;
  projectBase?: string;
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
      resources: []
    },
    currentLevelId: 'level1',
    selectedCommandIndex: -1,
    selectedEventId: null,
    middlePanelTab: 'commands',
    isPlaying: false,
    // 初始化触发器编辑器状态
    isTriggerEditorOpen: false,
    editingTrigger: null,
    runtimeGameData: null,
    isHome: true,
    projectBase: '/default-project/'
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
      // 首先构建资源映射（支持对象格式：images/audios/animations/videos）
      const resourceMap = new Map();
      const base = (window as any).__ASSET_BASE__ || (window as any).__PROJECT_BASE__ || '/00project/';
      const isAbs = (p: string) => /^(https?:|blob:|data:|file:)/.test(p) || p.startsWith('/') || p.startsWith('../');
      const join = (p: string) => isAbs(p) ? p : (base.endsWith('/') ? `${base}${p.replace(/^\.\//,'')}` : `${base}/${p.replace(/^\.\//,'')}`);
      const resObj = (gameData.resources && typeof gameData.resources === 'object') ? gameData.resources : {};
      const imgs = Array.isArray((resObj as any).images) ? (resObj as any).images : [];
      imgs.forEach((r: any) => { if (r?.id && r?.src) resourceMap.set(r.id, join(r.src)); });

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
        const levelWithEvents: any = {
          id: level.id || `level${index + 1}`,
          name: level.name || `关卡${index + 1}`,
          commands,
          resources: level.resources || [],
          events: level.events || [],
          canvasWidth: level.canvasWidth || 800,
          canvasHeight: level.canvasHeight || 600,
          rawCommands: Array.isArray(level.commands) ? level.commands : [] // 保留原始JSON命令用于树编辑
        };
        return levelWithEvents as LevelConfig;
      });
      
      // 构建编辑器资源列表（扁平化）
      const editorResources: any[] = [];
      try {
        const r = resObj as any;
        (r.images || []).forEach((x: any) => editorResources.push({ id: x.id, type: 'image', src: join(x.src), name: x.name || x.id }));
        (r.audios || []).forEach((x: any) => editorResources.push({ id: x.id, type: 'audio', src: join(x.src), name: x.name || x.id }));
        (r.animations || []).forEach((x: any) => editorResources.push({ id: x.id, type: 'animation', src: join(x.src), name: x.name || x.id }));
        (r.videos || []).forEach((x: any) => editorResources.push({ id: x.id, type: 'video', src: join(x.src), name: x.name || x.id }));
      } catch {}
      
      setAppState({
        currentProject: {
          id: gameData.id || 'loaded-game',
          name: gameData.name || gameData.title || '加载的游戏',
          version: gameData.version || '1.0.0',
          levels,
          globalVariables: gameData.globalVariables || {},
          globalSwitches: gameData.globalSwitches || {},
          resources: editorResources
        },
        currentLevelId: levels[0]?.id || 'level1',
        selectedCommandIndex: -1,
        selectedEventId: null,
        middlePanelTab: 'commands',
        isPlaying: false,
        runtimeGameData: gameData,
        isHome: false,
        projectBase: (window as any).__ASSET_BASE__ || appState.projectBase || '/default-project/'
      });
    }
  };

  // 关卡属性更新（例如画布宽高）
  const handleLevelUpdate = (levelId: string, updates: Partial<LevelConfig>) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const nextLevels = prev.currentProject.levels.map(l => l.id === levelId ? ({ ...l, ...updates }) : l);
      return { ...prev, currentProject: { ...prev.currentProject, levels: nextLevels } };
    });
  };

  // 指令树变更：更新当前关卡的原始命令和运行时JSON
  const handleTreeCommandsChange = (newJsonCommands: any[]) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const curLevelId = prev.currentLevelId;
      const editingEventId = prev.selectedEventId;
      const nextLevels = prev.currentProject.levels.map(l => {
        if (l.id !== curLevelId) return l;
        const lv: any = { ...l };
        if (editingEventId) {
          // update target event commands
          const evs = Array.isArray(lv.events) ? lv.events.map((e: any) => {
            if (e?.id === editingEventId) return { ...e, commands: Array.isArray(newJsonCommands) ? newJsonCommands : [] };
            return e;
          }) : [];
          lv.events = evs;
        } else {
          lv.rawCommands = Array.isArray(newJsonCommands) ? newJsonCommands : [];
        }
        return lv;
      });

      // 同步到运行时JSON
      let nextRuntime = prev.runtimeGameData;
      try {
        if (nextRuntime && Array.isArray((nextRuntime as any).levels)) {
          const clone = JSON.parse(JSON.stringify(nextRuntime));
          const li = clone.levels.findIndex((lv: any) => (lv.id || '') === curLevelId);
          if (li >= 0) {
            if (editingEventId) {
              const evs = Array.isArray(clone.levels[li].events) ? clone.levels[li].events : [];
              const idx = evs.findIndex((e: any) => e?.id === editingEventId);
              if (idx >= 0) evs[idx].commands = newJsonCommands;
              else clone.levels[li].events = evs;
            } else {
              clone.levels[li].commands = newJsonCommands;
            }
          } else if (!editingEventId && clone.levels.length > 0) {
            clone.levels[0].commands = newJsonCommands;
          }
          nextRuntime = clone;
        }
      } catch {}

      return { ...prev, currentProject: { ...prev.currentProject, levels: nextLevels }, runtimeGameData: nextRuntime };
    });
  };

  const handleSaveJson = () => {
    if (!appState.currentProject) return;
    
    const gameData = {
      id: appState.currentProject.id,
      name: appState.currentProject.name,
      version: appState.currentProject.version,
      globalVariables: appState.currentProject.globalVariables,
      levels: appState.currentProject.levels,
      resources: appState.currentProject.resources
    };
    
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
      const response = await fetch('/00project/scene/adventure-choice-game-v2.json');
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

  return (
    <div className="app">
      {appState.isHome ? (
        <ProjectHome
          onOpenScene={(base, sceneRel, data) => {
            try { (window as any).__ASSET_BASE__ = base; } catch {}
            setAppState(prev => ({ ...prev, projectBase: base }));
            handleLoadJson(data);
          }}
        />
      ) : (
      <>
      <TopStatusBar
        currentLevel={currentLevel}
        levels={appState.currentProject?.levels || []}
        onLevelChange={handleLevelChange}
        onLevelUpdate={handleLevelUpdate}
        onLoadJson={handleLoadJson}
        onSaveJson={handleSaveJson}
        isPlaying={appState.isPlaying}
        onPlayToggle={(playing: boolean) => setAppState(prev => ({ ...prev, isPlaying: playing }))}
        onLoadTestData={handleLoadTestData}
        onExitToHome={() => setAppState(prev => ({ ...prev, isHome: true, runtimeGameData: null, isPlaying: false }))}
      />
      
      <div className="editor-content" style={{ position: 'relative' }}>
        {/* 浮动面板：预览（游戏画面） */}
        <FloatingPanel
          id="panel-preview"
          title="预览"
          defaultX={560}
          defaultY={80}
          defaultWidth={(currentLevel as any).canvasWidth ? Math.min(900, Math.max(320, Math.round(((currentLevel as any).canvasWidth as any) * 0.8))) : 640}
          defaultHeight={(currentLevel as any).canvasHeight ? Math.min(700, Math.max(240, Math.round(((currentLevel as any).canvasHeight as any) * 0.8))) : 400}
        >
          <PixiCanvas
            commands={currentCommands}
            selectedCommandIndex={appState.selectedCommandIndex}
            isPlaying={appState.isPlaying}
            canvasWidth={(currentLevel as any).canvasWidth || 800}
            canvasHeight={(currentLevel as any).canvasHeight || 600}
            gameData={appState.runtimeGameData}
          />
        </FloatingPanel>

        {/* 浮动面板：事件列表 */}
        <FloatingPanel id="panel-events" title="事件" defaultX={16} defaultY={80} defaultWidth={240} defaultHeight={260}>
          <EventListPanel
            level={currentLevel}
            selectedEventId={appState.selectedEventId}
            onEventSelect={handleEventSelect}
            onOpenTriggerEditor={handleOpenTriggerEditor}
          />
        </FloatingPanel>

        {/* 浮动面板：指令树编辑器 */}
        <FloatingPanel id="panel-commands" title="指令树" defaultX={270} defaultY={80} defaultWidth={520} defaultHeight={520}>
          <CommandTreePanel
            key={appState.selectedEventId || (currentLevel as any).id}
            project={appState.currentProject}
            initialCommandsJson={(() => {
              const lv: any = currentLevel as any;
              if (appState.selectedEventId) {
                const ev = Array.isArray(lv?.events) ? lv.events.find((e: any) => e?.id === appState.selectedEventId) : null;
                return (ev && Array.isArray(ev.commands)) ? ev.commands : [];
              }
              return (lv?.rawCommands || []);
            })()}
            onChange={handleTreeCommandsChange}
          />
        </FloatingPanel>

        {/* 浮动面板：综合库面板（变量/开关 + 资源） */}
        <FloatingPanel id="panel-library" title="综合库面板" defaultX={16} defaultY={360} defaultWidth={360} defaultHeight={360}>
          <CombinedLibraryPanel
            project={appState.currentProject}
            onVariableChange={handleVariableChange}
            onSwitchChange={handleSwitchChange}
            onVariableAdd={handleVariableAdd}
            onSwitchAdd={handleSwitchAdd}
            onVariableDelete={handleVariableDelete}
            onSwitchDelete={handleSwitchDelete}
          />
        </FloatingPanel>
      </div>
      
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
      </>
      )}
    </div>
  );
};

export default App;
