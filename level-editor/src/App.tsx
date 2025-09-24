import React, { useState, useEffect } from 'react';
import { EditorState, LevelConfig, GameCommand, GameProject, CommandType } from './types';
import { CommandListPanel } from './components/CommandListPanel';
import { EventListPanel } from './components/EventListPanel';
import { VariableSwitchManager } from './components/VariableSwitchManager';
import { PixiCanvas } from './components/PixiCanvas';
import { TopStatusBar } from './components/TopStatusBar';
import { setCurrentProjectKey as psSetKey, upsertScene as psUpsert } from './utils/projectStore';
import { LevelTabs } from './components/LevelTabs';
import { FloatingPanel } from './components/FloatingPanel';
import { CommandTreePanel } from './components/CommandTreePanel';
import { CombinedLibraryPanel } from './components/CombinedLibraryPanel';
import { ProjectHome } from './components/ProjectHome';
import { TriggerModalEditor } from './components/TriggerModalEditor';
import { AIGenerateModal } from './components/AIGenerateModal';
import './App.css';
import { runAndLogTemplateSanity } from './utils/templateSanity';
import vfs from './utils/vfs';

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
  sessionScenes?: Array<{ path: string; data: any; lastEditedAt?: number }>;
  currentScenePath?: string | null;
  unsaved?: boolean;
  hasOpenedProject?: boolean;
  // AI 生成弹窗开关
  isAIGenerateOpen?: boolean;
}

// 添加事件触发条件更新函数的类型定义
interface UpdateEventTriggerParams {
  eventId: string;
  triggerIndex: number;
  updatedTrigger: any;
}

const App: React.FC = () => {
  try { (window as any).runTemplateSanityChecks = runAndLogTemplateSanity; } catch {}
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
    projectBase: '/default-project/',
    sessionScenes: (() => {
      try { const s = localStorage.getItem('editor:sessionScenes'); return s ? JSON.parse(s) : []; } catch { return []; }
    })(),
    currentScenePath: null,
    unsaved: false,
    hasOpenedProject: false,
    isAIGenerateOpen: false
  });

  const currentLevel = appState.currentProject?.levels.find(l => l.id === appState.currentLevelId) || appState.currentProject?.levels[0];
  
  // 预览缩放：由 PixiCanvas 自适应浮窗大小，无固定 0.7 缩放

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

  // 新增：事件增删
  const handleAddEvent = () => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const levels = prev.currentProject.levels.map((l: any) => {
        if (l.id !== prev.currentLevelId) return l;
        const evs = Array.isArray(l.events) ? l.events.slice() : [];
        const id = `event_${Date.now().toString(36)}`;
        evs.push({ id, name: '新事件', triggers: [{ type: 'auto', start: 'immediate' }], commands: [] });
        return { ...l, events: evs };
      });
      return { ...prev, currentProject: { ...prev.currentProject, levels }, unsaved: true };
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const levels = prev.currentProject.levels.map((l: any) => {
        if (l.id !== prev.currentLevelId) return l;
        const evs = (Array.isArray(l.events) ? l.events : []).filter((e: any) => e?.id !== eventId);
        return { ...l, events: evs };
      });
      const selectedEventId = prev.selectedEventId === eventId ? null : prev.selectedEventId;
      return { ...prev, currentProject: { ...prev.currentProject, levels }, selectedEventId, unsaved: true };
    });
  };

  const handleRenameEvent = (eventId: string, newName: string) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const levels = prev.currentProject.levels.map((l: any) => {
        if (l.id !== prev.currentLevelId) return l;
        const evs = Array.isArray(l.events) ? l.events.map((e: any) => e?.id === eventId ? { ...e, name: newName } : e) : [];
        return { ...l, events: evs };
      });
      return { ...prev, currentProject: { ...prev.currentProject, levels }, unsaved: true };
    });
  };

  // 粘贴事件（从事件面板剪贴板），支持跨关卡粘贴
  const handlePasteEvent = (eventData: any) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const levels = prev.currentProject.levels.map((l: any) => {
        if (l.id !== prev.currentLevelId) return l;
        const evs = Array.isArray(l.events) ? l.events.slice() : [];
        const id = `event_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
        const safe = (src: any) => ({
          id,
          name: (src?.name ? String(src.name) : '粘贴的事件'),
          triggers: Array.isArray(src?.triggers) ? src.triggers : [],
          commands: Array.isArray(src?.commands) ? src.commands : []
        });
        evs.push(safe(eventData));
        return { ...l, events: evs };
      });
      return { ...prev, currentProject: { ...prev.currentProject, levels }, unsaved: true };
    });
  };

  const handleLoadJson = async (gameData: any, baseOverride?: string) => {
    if (gameData.levels && Array.isArray(gameData.levels)) {
      // 规范化：将 if_condition 的开关型与可识别的表达式型条件统一为变量型
      const normalizeConditionsDeep = (list: any[]): any[] => {
        const mapOp = (sym: string) => ({ '==': 'eq', '===': 'eq', '!=': 'ne', '!==': 'ne', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte' }[sym] || 'eq');
        const parseLiteral = (raw: string) => {
          const s = String(raw).trim();
          if (/^true$/i.test(s)) return true; if (/^false$/i.test(s)) return false; if (/^null$/i.test(s)) return null;
          if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
          const m = s.match(/^['\"](.*)['\"]$/); if (m) return m[1];
          return raw;
        };
        const normOne = (cmd: any): any => {
          const c = Array.isArray(cmd?.parameters?.trueCommands) || Array.isArray(cmd?.parameters?.falseCommands) ? { ...cmd, parameters: { ...cmd.parameters } } : { ...cmd };
          // unify condition
          const cond = c?.parameters?.condition;
          if (cond && typeof cond === 'object') {
            if (cond.type === 'switch') {
              const key = cond.key;
              const val = typeof cond.value === 'boolean' ? cond.value : String(cond.value) === 'true';
              c.parameters.condition = { type: 'variable', key, operator: 'eq', value: val };
            } else if (cond.type === 'expression' && typeof cond.expression === 'string') {
              const re = /context\.stateManager\.getVariable\(['\"](.+?)['\"]\)\s*(===|==|!==|!=|>=|<=|>|<)\s*([^\s].*?)$/;
              const m = cond.expression.match(re);
              if (m) {
                const key = m[1];
                const op = mapOp(m[2]);
                const rawVal = m[3];
                c.parameters.condition = { type: 'variable', key, operator: op, value: parseLiteral(rawVal) };
              }
            }
          }
          // recurse branches/options
          const p: any = c.parameters || {};
          if (Array.isArray(p.trueCommands)) p.trueCommands = normalizeConditionsDeep(p.trueCommands);
          if (Array.isArray(p.falseCommands)) p.falseCommands = normalizeConditionsDeep(p.falseCommands);
          if (Array.isArray(p.commands)) p.commands = normalizeConditionsDeep(p.commands);
          const opts = Array.isArray(p.options) ? p.options : (Array.isArray((c as any).options) ? (c as any).options : []);
          if (Array.isArray(opts)) opts.forEach((o: any) => { if (Array.isArray(o?.commands)) o.commands = normalizeConditionsDeep(o.commands); });
          const branches = (c as any).branches || p.branches;
          if (branches) {
            if (Array.isArray(branches.yes?.commands)) branches.yes.commands = normalizeConditionsDeep(branches.yes.commands);
            if (Array.isArray(branches.no?.commands)) branches.no.commands = normalizeConditionsDeep(branches.no.commands);
          }
          return c;
        };
        return (list || []).map(normOne);
      };
      // 首先构建资源映射（支持对象格式：images/audios/animations/videos）
      const resourceMap = new Map();
      const base = (window as any).__ASSET_BASE__ || (window as any).__PROJECT_BASE__ || '/00project/';
      const isAbs = (p: string) => /^(https?:|blob:|data:|file:)/.test(p) || p.startsWith('/') || p.startsWith('../');
      const join = (p: string) => isAbs(p) ? p : (base.endsWith('/') ? `${base}${p.replace(/^\.\//,'')}` : `${base}/${p.replace(/^\.\//,'')}`);
      const resObj = (gameData.resources && typeof gameData.resources === 'object') ? gameData.resources : {};
      const imgs = Array.isArray((resObj as any).images) ? (resObj as any).images : [];
      imgs.forEach((r: any) => {
        if (r?.id && r?.src) {
          const p = String(r.src).replace(/^\.\//,'');
          const url = vfs.getResourceURL(p) || join(p);
          resourceMap.set(r.id, url);
        }
      });

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
          rawCommands: Array.isArray(level.commands) ? normalizeConditionsDeep(level.commands) : [] // 保留原始JSON命令用于树编辑（并统一条件）
        };
        return levelWithEvents as LevelConfig;
      });
      
      // 构建编辑器资源列表（扁平化）
      const editorResources: any[] = [];
      try {
        const r = resObj as any;
        const mapSrc = (s: any) => {
          const p = String(s || '').replace(/^\.\//,'');
          return vfs.getResourceURL(p) || join(p);
        };
        const toRel = (s: any) => {
          const raw = String(s || '').replace(/^\.\//,'');
          // Strip project base if present
          if (raw && base && raw.startsWith(base)) return raw.slice(base.length).replace(/^\/+/, '');
          return raw;
        };
        const pushWithPath = (type: string, x: any) => {
          const rel = toRel(x.src);
          editorResources.push({ id: x.id, type, src: mapSrc(x.src), path: rel, name: x.name || x.id });
        };
        (r.images || []).forEach((x: any) => pushWithPath('image', x));
        (r.audios || []).forEach((x: any) => pushWithPath('audio', x));
        (r.animations || []).forEach((x: any) => pushWithPath('animation', x));
        (r.videos || []).forEach((x: any) => pushWithPath('video', x));

        // 支持数组形式的 resources（兼容旧数据）
        if (Array.isArray(gameData.resources)) {
          (gameData.resources as any[]).forEach((x: any) => {
            if (!x || typeof x !== 'object') return;
            const t = x.type || 'image';
            const rel = toRel(x.src);
            editorResources.push({ id: x.id, type: t, src: mapSrc(x.src), path: rel, name: x.name || x.id });
          });
        }
      } catch {}

      // 读取项目级 skins（来自 config.json），并注入到编辑器资源列表，供参数面板选择
      try {
        const cfg = await vfs.readJSON<any>('config.json');
        const skins = (cfg && (cfg.skins || (cfg.resources && cfg.resources.skins))) || [];
        const list: Array<{ id: string; imageId?: string; url?: string; slice?: any; name?: string }> = Array.isArray(skins) ? skins : [];
        list.forEach(s => { editorResources.push({ id: s.id, type: 'skin', name: s.name || s.id, imageId: (s as any).imageId, url: (s as any).url, slice: s.slice }); });
      } catch {}
      
      setAppState(prev => ({
        ...prev,
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
        // 优先使用调用方传入的 base（允许空字符串表示本地工程）；否则保持已有 base；
        // 再否则用 __ASSET_BASE__（若为字符串），最后才回退默认工程
        projectBase: (typeof baseOverride === 'string')
          ? baseOverride
          : (prev.projectBase || (typeof (window as any).__ASSET_BASE__ === 'string' ? (window as any).__ASSET_BASE__ : '/default-project/')),
        hasOpenedProject: true
      }));
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

  // 打开/关闭 AI 生成弹窗
  const openAIGenerate = () => setAppState(prev => ({ ...prev, isAIGenerateOpen: true }));
  const closeAIGenerate = () => setAppState(prev => ({ ...prev, isAIGenerateOpen: false }));

  // 新增：关卡增删
  const handleCreateLevel = () => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const id = `level_${Date.now().toString(36)}`;
      let name = '新关卡';
      try {
        const v = prompt('输入新关卡名称', '新关卡');
        if (v != null && v.trim()) name = v.trim();
      } catch {}
      const newLevel: any = { id, name, canvasWidth: 800, canvasHeight: 600, commands: [], resources: [], events: [] };
      const levels = [...prev.currentProject.levels, newLevel];
      // sync runtime JSON
      let nextRuntime = prev.runtimeGameData;
      try {
        if (nextRuntime && Array.isArray((nextRuntime as any).levels)) {
          const clone = JSON.parse(JSON.stringify(nextRuntime));
          clone.levels = [...(clone.levels || []), { ...newLevel }];
          nextRuntime = clone;
        }
      } catch {}
      return { ...prev, currentProject: { ...prev.currentProject, levels }, runtimeGameData: nextRuntime, currentLevelId: id, selectedEventId: null, selectedCommandIndex: -1, unsaved: true };
    });
  };

  const handleDeleteLevel = (levelId: string) => {
    setAppState(prev => {
      if (!prev.currentProject) return prev;
      const levels = prev.currentProject.levels.filter(l => l.id !== levelId);
      if (levels.length === 0) return prev; // 至少保留一个
      const nextLevelId = (levels[0] || {}).id;
      // sync runtime JSON
      let nextRuntime = prev.runtimeGameData;
      try {
        if (nextRuntime && Array.isArray((nextRuntime as any).levels)) {
          const clone = JSON.parse(JSON.stringify(nextRuntime));
          clone.levels = (clone.levels || []).filter((lv: any) => (lv.id || '') !== levelId);
          nextRuntime = clone;
        }
      } catch {}
      return { ...prev, currentProject: { ...prev.currentProject, levels }, runtimeGameData: nextRuntime, currentLevelId: nextLevelId, selectedEventId: null, selectedCommandIndex: -1, unsaved: true };
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
              // 当编辑事件命令时：若运行时副本还不存在该事件，直接用最新的项目事件数组覆盖（包含 triggers/新事件）
              const projectLevel = nextLevels.find((lv: any) => (lv.id || '') === curLevelId) as any;
              const latestEvents = Array.isArray(projectLevel?.events) ? projectLevel.events : [];
              if (!Array.isArray(clone.levels[li].events) || !clone.levels[li].events.length) {
                clone.levels[li].events = JSON.parse(JSON.stringify(latestEvents));
              }
              const evs = Array.isArray(clone.levels[li].events) ? clone.levels[li].events : [];
              const idx = evs.findIndex((e: any) => e?.id === editingEventId);
              if (idx >= 0) evs[idx].commands = newJsonCommands;
              else clone.levels[li].events = JSON.parse(JSON.stringify(latestEvents));
            } else {
              clone.levels[li].commands = newJsonCommands;
            }
          } else if (!editingEventId && clone.levels.length > 0) {
            clone.levels[0].commands = newJsonCommands;
          }
          nextRuntime = clone;
        }
      } catch {}

      return { ...prev, currentProject: { ...prev.currentProject, levels: nextLevels }, runtimeGameData: nextRuntime, unsaved: true };
    });
  };

  // 持久化会话场景缓存，避免回初始页后丢失
  useEffect(() => {
    try { localStorage.setItem('editor:sessionScenes', JSON.stringify(appState.sessionScenes || [])); } catch {}
  }, [appState.sessionScenes]);

  const handleSaveJson = () => {
    if (!appState.currentProject) return;

    // 1) 组装最新的场景 JSON（优先使用 rawCommands 树结构）
    const levels = (appState.currentProject.levels || []).map((lv: any) => {
      const out: any = { ...lv };
      if (Array.isArray(lv.rawCommands)) out.commands = lv.rawCommands;
      delete out.rawCommands;
      return out;
    });
    // 资源打包为对象形式，确保重载时可解析
    const packResources = (list: any[]) => {
      const out: any = { images: [], audios: [], animations: [], videos: [] };
      const base = (window as any).__ASSET_BASE__ || appState.projectBase || '';
      const isAbs = (p: string) => /^(https?:|blob:|data:|file:)/.test(p) || p.startsWith('/') || p.startsWith('../');
      const strip = (s: string) => {
        const p = String(s || '');
        if (base && p.startsWith(base)) return p.slice(base.length).replace(/^\/+/, '');
        if (/^(blob:|data:)/.test(p)) return p; // 无法还原，保留
        return p.replace(/^\.\//,'');
      };
      (list || []).forEach((r: any) => {
        const pathRaw = String((r as any).path || '');
        // Prefer recorded path when it is a relative project path; otherwise derive from src
        const rel = pathRaw && !isAbs(pathRaw) ? pathRaw : strip(r.src);
        const item = { id: r.id, src: rel, name: r.name } as any;
        if (r.type === 'image') out.images.push(item);
        else if (r.type === 'audio') out.audios.push(item);
        else if (r.type === 'video') out.videos.push(item);
        else if (r.type === 'animation') out.animations.push(item);
      });
      return out;
    };

    const gameData = {
      id: appState.currentProject.id,
      name: appState.currentProject.name,
      version: appState.currentProject.version,
      globalVariables: appState.currentProject.globalVariables,
      globalSwitches: appState.currentProject.globalSwitches || {},
      levels,
      resources: packResources(appState.currentProject.resources as any[])
    };

    // Determine save path (prompt on first save)
    let savePath = appState.currentScenePath || '';
    if (!savePath) {
      try {
        const def = `scene/${(appState.currentProject?.id || 'untitled')}.json`;
        const input = window.prompt('首次保存：请输入保存路径（位于 scene/ 目录）', def);
        if (!input || !input.trim()) return;
        savePath = input.trim().replace(/^\.\//,'');
        if (!savePath.startsWith('scene/')) savePath = 'scene/' + savePath;
      } catch { return; }
    }

    // 2) 写入 VFS（folder → local Map; idb → IndexedDB）
    try { vfs.writeScene(savePath, gameData); } catch {}

    // 3) 写入到会话缓存（并由 useEffect 持久化到 localStorage）
    setAppState(prev => {
      const scenes = (prev.sessionScenes || []).slice();
      const idx = scenes.findIndex(s => s.path === savePath);
      const entry = { path: savePath, data: gameData, lastEditedAt: Date.now() };
      if (idx >= 0) scenes[idx] = entry; else scenes.push(entry);
      return { ...prev, sessionScenes: scenes, runtimeGameData: gameData, currentScenePath: savePath, unsaved: false };
    });

    // 4) 更新虚拟项目索引 + 轻提示（仅本地文件夹工程持久化）
    try { if (vfs.getBackend() === 'folder') { psUpsert(appState.projectBase || '', { path: savePath, lastEditedAt: Date.now() }); } } catch {}
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

      // 同步到运行时 JSON（以便预览即时生效）
      let nextRuntime = prev.runtimeGameData;
      try {
        if (nextRuntime && Array.isArray((nextRuntime as any).levels)) {
          const clone = JSON.parse(JSON.stringify(nextRuntime));
          const li = clone.levels.findIndex((lv: any) => (lv.id || '') === prev.currentLevelId);
          if (li >= 0) {
            // 确保 runtime 里有事件数组；若不存在，用项目里的最新事件数组覆盖
            const projectLevel: any = updatedLevels.find((lv: any) => (lv.id || '') === prev.currentLevelId);
            if (!Array.isArray(clone.levels[li].events) || !clone.levels[li].events.length) {
              clone.levels[li].events = JSON.parse(JSON.stringify(projectLevel?.events || []));
            }
            const evs = Array.isArray(clone.levels[li].events) ? clone.levels[li].events : [];
            const ei = evs.findIndex((e: any) => (e?.id || '') === eventId);
            if (ei >= 0) {
              const triggers = Array.isArray(evs[ei].triggers) ? evs[ei].triggers.slice() : [];
              triggers[triggerIndex] = updatedTrigger;
              evs[ei] = { ...evs[ei], triggers };
              clone.levels[li].events = evs;
            } else {
              // 若 runtime 里还没有该事件，直接用项目侧事件数组覆盖
              clone.levels[li].events = JSON.parse(JSON.stringify(projectLevel?.events || []));
            }
          }
          nextRuntime = clone;
        }
      } catch {}

      return {
        ...prev,
        currentProject: {
          ...prev.currentProject,
          levels: updatedLevels
        },
        runtimeGameData: nextRuntime,
        unsaved: true
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
        },
        unsaved: true
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
        },
        unsaved: true
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
        },
        unsaved: true
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
        },
        unsaved: true
      };
    });
  };

  return (
    <div className="app">
      {appState.isHome ? (
        <ProjectHome
          sessionScenes={(appState.sessionScenes || [])}
          projectBaseFromApp={appState.projectBase}
          shouldAutoLoad={!!appState.hasOpenedProject}
          onExportProject={async () => {
            try {
              // 递归遍历 VFS，导出整个项目（包含 config.json、scene 与资源）
              const out: Record<string, string | Uint8Array | ArrayBuffer> = {};
              const toVisit: string[] = [''];
              while (toVisit.length) {
                const dir = toVisit.pop()!;
                const entries = await vfs.readdir(dir);
                for (const e of entries) {
                  if (e.type === 'directory') {
                    toVisit.push(e.path);
                  } else {
                    const content = await vfs.readFile(e.path);
                    if (content == null) continue;
                    if (typeof content === 'string') out[e.path] = content;
                    else out[e.path] = await content.arrayBuffer();
                  }
                }
              }

              // 若缺失 config.json，基于场景生成一个最小化配置
              const hasConfig = Object.prototype.hasOwnProperty.call(out, 'config.json');
              if (!hasConfig) {
                const scenePaths = await vfs.listScenes();
                if (!scenePaths.length) { alert('没有可导出的内容'); return; }
                const root = scenePaths[0];
                const children = scenePaths.slice(1).map(p => ({ curnode: p, child_node: [] as any[] }));
                const cfg = {
                  project_name: appState.currentProject?.name || 'exported-project',
                  'scene-tree': { curnode: root, child_node: children },
                  user_data_sheet: { user_nickname: 'default', scene_data: {} },
                  version: appState.currentProject?.version || '1.0.0'
                };
                out['config.json'] = JSON.stringify(cfg, null, 2);
              }

              const { createZip } = await import('./utils/zip');
              const zipBlob = createZip(out);
              const url = URL.createObjectURL(zipBlob);
              const a = document.createElement('a'); a.href = url; a.download = 'project.zip'; a.click(); URL.revokeObjectURL(url);
            } catch (e) {
              console.warn('export failed', e);
              alert('导出失败');
            }
          }}
          onOpenScene={(base, sceneRel, data) => {
            try {
              const lf: Map<string, File> | undefined = (window as any).__LOCAL_FILES__;
              console.info('[App] onOpenScene', {
                base,
                sceneRel,
                hasLocalFiles: !!lf,
                localKeys: lf ? Array.from(lf.keys()) : [],
                sessionScenes: (appState.sessionScenes || []).map(s => s.path)
              });
            } catch {}
            try { (window as any).__ASSET_BASE__ = base; } catch {}
            try { vfs.setProjectBase(base || ''); } catch {}
            setAppState(prev => ({ ...prev, projectBase: base, currentScenePath: sceneRel, isHome: false, unsaved: false, hasOpenedProject: true }));
            try { if (vfs.getBackend() === 'folder') { psSetKey(base || ''); psUpsert(base || '', { path: sceneRel, lastEditedAt: Date.now() }); } } catch {}
            handleLoadJson(data, base);
          }}
        />
      ) : (
      <>
      <TopStatusBar
        currentLevel={currentLevel}
        levels={appState.currentProject?.levels || []}
        onLevelChange={handleLevelChange}
        onLevelUpdate={handleLevelUpdate}
        // 将关卡创建/删除移动到 LevelTabs
        onLoadJson={handleLoadJson}
        onSaveJson={handleSaveJson}
        isPlaying={appState.isPlaying}
        onPlayToggle={(playing: boolean) => setAppState(prev => ({ ...prev, isPlaying: playing }))}
        onLoadTestData={handleLoadTestData}
        onShowAIGenerate={openAIGenerate}
        onExitToHome={() => {
          setAppState(prev => {
            try {
              console.info('[App] exitToHome', {
                projectBase: prev.projectBase,
                hasOpenedProject: !!prev.hasOpenedProject,
                sessionScenes: (prev.sessionScenes || []).map(s => s.path)
              });
            } catch {}
            const goHome = () => ({ ...prev, isHome: true, runtimeGameData: null, isPlaying: false });
            // 更稳健的未保存检测：除标志位外，也比较关卡列表是否与运行时副本不一致（例如新增/删除/复制后尚未保存）
            let levelsChanged = false;
            try {
              const a = (prev.currentProject?.levels || []).map(l => l.id);
              const b = (prev.runtimeGameData?.levels || []).map((lv: any) => lv?.id);
              levelsChanged = JSON.stringify(a) !== JSON.stringify(b);
            } catch {}
            if (prev.unsaved || levelsChanged) {
              try {
                const ok = window.confirm('当前有未保存的修改，是否保存后返回初始页？');
                if (ok) { setTimeout(() => handleSaveJson(), 0); }
              } catch {}
            }
            return goHome();
          });
        }}
      />
      {/* 关卡标签栏（细条） */}
      <LevelTabs
        levels={appState.currentProject?.levels || []}
        currentLevelId={String(appState.currentLevelId)}
        onSelect={handleLevelChange}
        onCreate={handleCreateLevel}
        onRename={(levelId, newName) => handleLevelUpdate(levelId, { name: newName })}
        onDelete={handleDeleteLevel}
        onCopy={(fromId) => {
          setAppState(prev => {
            if (!prev.currentProject) return prev;
            const idx = prev.currentProject.levels.findIndex(l => l.id === fromId);
            if (idx < 0) return prev;
            const src: any = prev.currentProject.levels[idx];
            // 深拷贝
            const clone = JSON.parse(JSON.stringify(src));
            // 生成新 id/name
            const base = (src.id || 'level');
            let i = 1; let nid = `${base}_copy_${i}`;
            const ids = new Set(prev.currentProject.levels.map(l => l.id));
            while (ids.has(nid)) { i++; nid = `${base}_copy_${i}`; }
            clone.id = nid; clone.name = (src.name || src.id) + ' 副本';
            // 插入到原节点后
            const nextLevels = prev.currentProject.levels.slice();
            nextLevels.splice(idx + 1, 0, clone);
            // sync runtime JSON
            let nextRuntime = prev.runtimeGameData;
            try {
              if (nextRuntime && Array.isArray((nextRuntime as any).levels)) {
                const r = JSON.parse(JSON.stringify(nextRuntime));
                const ridx = (r.levels || []).findIndex((lv: any) => (lv.id || '') === fromId);
                if (ridx >= 0) {
                  const rClone = JSON.parse(JSON.stringify(r.levels[ridx]));
                  rClone.id = nid; rClone.name = clone.name;
                  r.levels.splice(ridx + 1, 0, rClone);
                } else {
                  r.levels = [...(r.levels || []), { ...clone }];
                }
                nextRuntime = r;
              }
            } catch {}
            return { ...prev, currentProject: { ...prev.currentProject, levels: nextLevels }, runtimeGameData: nextRuntime, currentLevelId: nid, unsaved: true };
          });
        }}
      />
      
      <div className="editor-content" style={{ position: 'relative' }}>
        {/* 浮动面板：预览（游戏画面） */}
        <FloatingPanel
          id="panel-preview"
          title="预览"
          defaultX={830}
          defaultY={100}
          defaultWidth={640}
          defaultHeight={480}
        >
          <PixiCanvas
            commands={currentCommands}
            selectedCommandIndex={appState.selectedCommandIndex}
            isPlaying={appState.isPlaying}
            canvasWidth={(currentLevel as any).canvasWidth || 800}
            canvasHeight={(currentLevel as any).canvasHeight || 600}
            gameData={appState.runtimeGameData}
            currentLevelId={(currentLevel as any).id}
          />
        </FloatingPanel>

        {/* 浮动面板：事件列表 */}
        <FloatingPanel id="panel-events" title="事件" defaultX={0} defaultY={100} defaultWidth={260} defaultHeight={260}>
        <EventListPanel
          level={currentLevel}
          selectedEventId={appState.selectedEventId}
          onEventSelect={handleEventSelect}
          onOpenTriggerEditor={handleOpenTriggerEditor}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
          onRenameEvent={handleRenameEvent}
          onPasteEvent={handlePasteEvent}
        />
        </FloatingPanel>

        {/* 浮动面板：指令树编辑器 */}
        <FloatingPanel id="panel-commands" title="指令树" defaultX={285} defaultY={100} defaultWidth={520} defaultHeight={590}>
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
        <FloatingPanel id="panel-library" title="综合库面板" defaultX={0} defaultY={400} defaultWidth={270} defaultHeight={360}>
          <CombinedLibraryPanel
            project={appState.currentProject}
            currentLevel={currentLevel as any}
            onRemoveProjectResource={(rid: string) => {
              setAppState(prev => {
                if (!prev.currentProject) return prev;
                // Remove from project resource dictionary
                const nextRes = (prev.currentProject.resources || []).filter(r => r.id !== rid);
                // Also clean up any level.resources references
                const nextLevels = prev.currentProject.levels.map(l => {
                  const arr = (l.resources || []).filter((x: any) => x !== rid);
                  return { ...l, resources: arr } as any;
                });
                // Sync runtime JSON as well
                let nextRuntime = prev.runtimeGameData;
                try {
                  if (nextRuntime && typeof nextRuntime === 'object') {
                    const clone = JSON.parse(JSON.stringify(nextRuntime));
                    // Remove from resource object groups
                    const groups = ['images','audios','animations','videos'];
                    const ro = (clone.resources && typeof clone.resources === 'object') ? clone.resources : { images: [], audios: [], animations: [], videos: [] };
                    for (const g of groups) {
                      if (Array.isArray(ro[g])) ro[g] = ro[g].filter((x: any) => x?.id !== rid);
                    }
                    clone.resources = ro;
                    // Remove from all level resources
                    if (Array.isArray(clone.levels)) {
                      clone.levels = clone.levels.map((lv: any) => ({ ...lv, resources: Array.isArray(lv.resources) ? lv.resources.filter((x: any) => x !== rid) : [] }));
                    }
                    nextRuntime = clone;
                  }
                } catch {}
                return { ...prev, currentProject: { ...prev.currentProject, resources: nextRes, levels: nextLevels }, runtimeGameData: nextRuntime, unsaved: true };
              });
            }}
            onQuickAddResourceFromPath={(p: string) => {
              setAppState(prev => {
                if (!prev.currentProject) return prev;
                const exists = (prev.currentProject.resources || []).some((r: any) => (r as any).path === p || r.src === p);
                if (exists) return prev;
                // Detect resource type by folder prefix or file extension
                const low = String(p || '').toLowerCase();
                const is = (pre: string) => low.startsWith(pre);
                const type = is('images/') || is('image/') ? 'image'
                  : (is('audios/') || is('audio/')) ? 'audio'
                  : (is('videos/') || is('video/')) ? 'video'
                  : (is('animations/') || is('animation/')) ? 'animation'
                  : (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(low) ? 'image'
                    : (/\.(mp3|wav|ogg|m4a)$/i.test(low) ? 'audio'
                      : (/\.(mp4|webm|mov)$/i.test(low) ? 'video'
                        : (/\.(json)$/i.test(low) ? 'animation' : 'image'))));
                const name = p.split('/').pop()!.replace(/\.[^.]+$/, '');
                const used = new Set((prev.currentProject.resources || []).map(r => r.id));
                let id = name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'res';
                if (used.has(id)) { let i=1; while (used.has(`${id}_${i}`)) i++; id = `${id}_${i}`; }
                const merged = [ ...(prev.currentProject.resources || []), { id, type, src: p, path: p, name } ];
                // Sync into runtime JSON when present
                let nextRuntime = prev.runtimeGameData;
                try {
                  if (nextRuntime && typeof nextRuntime === 'object') {
                    const clone = JSON.parse(JSON.stringify(nextRuntime));
                    const ro = (clone.resources && typeof clone.resources === 'object') ? clone.resources : { images: [], audios: [], animations: [], videos: [] };
                    const key = type === 'image' ? 'images' : type === 'audio' ? 'audios' : type === 'video' ? 'videos' : 'animations';
                    const arr = Array.isArray(ro[key]) ? ro[key] : [];
                    if (!arr.some((x: any) => x?.id === id)) arr.push({ id, src: p, name });
                    ro[key] = arr; clone.resources = ro; nextRuntime = clone;
                  }
                } catch {}
                return { ...prev, currentProject: { ...prev.currentProject, resources: merged }, runtimeGameData: nextRuntime, unsaved: true };
              });
            }}
            onAddLevelResource={(rid: string) => {
              setAppState(prev => {
                if (!prev.currentProject) return prev;
                const nextLevels = prev.currentProject.levels.map(l => {
                  if (l.id !== prev.currentLevelId) return l;
                  const set = new Set([...(l.resources || [])]); set.add(rid);
                  return { ...l, resources: Array.from(set) } as any;
                });
                // Sync into runtime JSON when present
                let nextRuntime = prev.runtimeGameData;
                try {
                  if (nextRuntime && typeof nextRuntime === 'object') {
                    const clone = JSON.parse(JSON.stringify(nextRuntime));
                    if (Array.isArray(clone.levels)) {
                      const li = clone.levels.findIndex((lv: any) => (lv.id || '') === prev.currentLevelId);
                      if (li >= 0) {
                        const arr = Array.isArray(clone.levels[li].resources) ? clone.levels[li].resources : [];
                        const s = new Set(arr); s.add(rid); clone.levels[li].resources = Array.from(s);
                      }
                    }
                    nextRuntime = clone;
                  }
                } catch {}
                return { ...prev, currentProject: { ...prev.currentProject, levels: nextLevels }, runtimeGameData: nextRuntime, unsaved: true };
              });
            }}
            onRemoveLevelResource={(rid: string) => {
              setAppState(prev => {
                if (!prev.currentProject) return prev;
                const nextLevels = prev.currentProject.levels.map(l => {
                  if (l.id !== prev.currentLevelId) return l;
                  const arr = (l.resources || []).filter((x: any) => x !== rid);
                  return { ...l, resources: arr } as any;
                });
                // Sync into runtime JSON when present
                let nextRuntime = prev.runtimeGameData;
                try {
                  if (nextRuntime && typeof nextRuntime === 'object') {
                    const clone = JSON.parse(JSON.stringify(nextRuntime));
                    if (Array.isArray(clone.levels)) {
                      const li = clone.levels.findIndex((lv: any) => (lv.id || '') === prev.currentLevelId);
                      if (li >= 0) {
                        const arr = Array.isArray(clone.levels[li].resources) ? clone.levels[li].resources : [];
                        clone.levels[li].resources = arr.filter((x: any) => x !== rid);
                      }
                    }
                    nextRuntime = clone;
                  }
                } catch {}
                return { ...prev, currentProject: { ...prev.currentProject, levels: nextLevels }, runtimeGameData: nextRuntime, unsaved: true };
              });
            }}
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
      {/* AI 生成弹窗 */}
      <AIGenerateModal
        isOpen={!!appState.isAIGenerateOpen}
        currentLevel={(currentLevel as any) || { id: 'level1', name: '关卡1', commands: [], resources: [] }}
        project={appState.currentProject}
        onCancel={closeAIGenerate}
        onApplyCommands={(cmds) => {
          // AI 生成的 commands JSON → 写回当前关卡（替换 commands 列表）
          try { handleTreeCommandsChange(Array.isArray(cmds) ? cmds : []); } catch {}
        }}
      />
      </>
      )}
    </div>
  );
};

export default App;
