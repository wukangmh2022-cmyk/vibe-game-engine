import React, { useEffect, useMemo, useState } from 'react';
import { GameProject, LevelConfig } from '../types';
import './AIGenerateModal.css';
import { LEVEL_PATCH_PROMPT_V3 } from '../guides/levelPatchPromptV3';
import { COMMAND_TEMPLATES } from '../utils/commandTemplates';
import { parseLevelDsl } from '../utils/levelDsl';
import { renderLevelDslUserPrompt } from '../utils/levelDslPrompt';

interface AIGenerateModalProps {
  isOpen: boolean;
  currentLevel: LevelConfig & { rawCommands?: any[] };
  project: GameProject | null;
  onCancel: () => void;
  onApplyCommands: (generated: GeneratedLevelPatch) => void;
  // 新增：引用“当前视图”（主流程或事件页）的原始命令
  currentViewRawCommands?: any[];
}

export interface GeneratedLevelPatch {
  intent?: string;
  asset_catalog?: any[];
  commands: any[];
  extra_events: any[];
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_KEY_STORAGE = 'vibe-game-engine:openrouter-api-key';

export const AIGenerateModal: React.FC<AIGenerateModalProps> = ({
  isOpen,
  currentLevel,
  project,
  onCancel,
  onApplyCommands,
  currentViewRawCommands,
}) => {
  const [prompt, setPrompt] = useState('');
  const [includeExisting, setIncludeExisting] = useState<boolean>(false);
  const [selectedResIds, setSelectedResIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState<string>('');
  const [generatedIntent, setGeneratedIntent] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [guideCache, setGuideCache] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>(() => {
    try { return localStorage.getItem(OPENROUTER_KEY_STORAGE) || ''; } catch { return ''; }
  });

  // 当前关卡可用资源（以文本显示：id, path/src）。
  // 修复：当关卡未配置 resources 时，回退为项目全量资源列表（避免仅第一个关卡生效的问题）。
  const levelResources = useMemo(() => {
    const all = (project?.resources || []) as any[];
    const map = new Map(all.map((r: any) => [r.id, r]));
    const levelIds = Array.isArray((currentLevel as any)?.resources) && (currentLevel as any).resources.length > 0
      ? ((currentLevel as any).resources as string[])
      : all.map((r: any) => r.id);
    // Skins and animations are project-level authoring resources. Keep them
    // selectable even when a level narrows its image/audio resource list.
    const availableIds = Array.from(new Set([
      ...levelIds,
      ...all.filter((resource: any) => resource.type === 'skin' || resource.type === 'animation').map((resource: any) => resource.id),
    ]));
    return availableIds
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((r: any) => ({ id: r.id, path: r.path || r.url || r.src || '', type: r.type || 'resource', url: r.url || r.src || r.path || '' }));
  }, [currentLevel, project]);

  // Default prompts expose three real project animations. Explicitly selected
  // animations are always retained, so selecting a fourth expands the catalog.
  const promptResources = useMemo(() => {
    const levelIds = new Set(Array.isArray((currentLevel as any)?.resources) ? (currentLevel as any).resources : []);
    const selected = new Set(selectedResIds);
    const animations = levelResources
      .filter((resource: any) => resource.type === 'animation')
      .sort((left: any, right: any) => {
        const selectedDelta = Number(selected.has(right.id)) - Number(selected.has(left.id));
        if (selectedDelta) return selectedDelta;
        const levelDelta = Number(levelIds.has(right.id)) - Number(levelIds.has(left.id));
        if (levelDelta) return levelDelta;
        return String(left.path || left.id).localeCompare(String(right.path || right.id), 'zh-CN');
      });
    const includedAnimations = new Set(
      animations.filter((resource: any) => selected.has(resource.id)).map((resource: any) => resource.id),
    );
    for (const resource of animations) {
      if (includedAnimations.size >= 3) break;
      includedAnimations.add(resource.id);
    }
    return levelResources.filter((resource: any) => resource.type !== 'animation' || includedAnimations.has(resource.id));
  }, [currentLevel, levelResources, selectedResIds]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLastOutput('');
      setGeneratedIntent('');
      // 默认：如果当前视图有指令则勾选“引用当前关卡指令”（支持事件页或主流程）
      const cur = Array.isArray(currentViewRawCommands) ? currentViewRawCommands : (currentLevel as any)?.rawCommands;
      const has = Array.isArray(cur) && cur.length > 0;
      setIncludeExisting(has);
      setSelectedResIds([]);
    }
  }, [isOpen, currentLevel, currentViewRawCommands]);

  if (!isOpen) return null;

  const addRes = (rid: string) => {
    setSelectedResIds((prev) => (prev.includes(rid) ? prev : [...prev, rid]));
  };
  const removeRes = (rid: string) => {
    setSelectedResIds((prev) => prev.filter((x) => x !== rid));
  };

  const buildMessages = async (): Promise<any[]> => {
    // 读取编辑指导文档（多路径兜底 + 缓存 + 内联回退）
    let guideText = guideCache;
    if (!guideText) {
      if (!guideText) guideText = LEVEL_PATCH_PROMPT_V3; // 内联回退，确保 dist 也有内容
      if (guideText) setGuideCache(guideText);
    }

    // 系统提示：放入规则说明
    const systemTextParts: string[] = [];
    if (guideText) {
      systemTextParts.push(guideText);
    } else {
      systemTextParts.push('你是关卡指令生成助手，请输出符合编辑器规范的关卡补丁 JSON。');
    }

    const cw = Number((currentLevel as any)?.canvasWidth || 800);
    const ch = Number((currentLevel as any)?.canvasHeight || 600);
    const assetCatalog = promptResources.map((resource: any) => ({
      id: resource.id,
      type: resource.type,
      path: resource.path,
    }));
    const userParts: string[] = [renderLevelDslUserPrompt((prompt || '').trim() || '无', cw, ch, assetCatalog)];

    if (selectedResIds.length > 0) {
      userParts.push('\nPREFERRED ASSET IDS');
      userParts.push(selectedResIds.join(', '));
    }

    const curRaw = Array.isArray(currentViewRawCommands) ? currentViewRawCommands : (currentLevel as any)?.rawCommands;
    if (includeExisting && Array.isArray(curRaw)) {
      try {
        const raw = JSON.stringify(curRaw, null, 2);
        userParts.push('\nEXISTING COMMANDS');
        // 避免太长，放在 text chunk 内部即可
        userParts.push(raw);
      } catch {}
    }

    if (includeExisting && Array.isArray((currentLevel as any)?.events) && (currentLevel as any).events.length > 0) {
      try {
        userParts.push('\nEXISTING EVENTS');
        userParts.push(JSON.stringify((currentLevel as any).events, null, 2));
      } catch {}
    }

    const messages: any[] = [];
    if (systemTextParts.length > 0) {
      messages.push({ role: 'system', content: [{ type: 'text', text: systemTextParts.join('\n\n') }] });
    }
    messages.push({ role: 'user', content: [{ type: 'text', text: userParts.join('\n') }] });
    return messages;
  };

  const buildPromptText = async (): Promise<string> => {
    const messages = await buildMessages();
    const lines: string[] = [];
    for (const m of messages) {
      const head = m.role ? String(m.role).toUpperCase() : 'USER';
      lines.push(`【${head}】`);
      if (Array.isArray(m.content)) {
        lines.push(m.content.map((c: any) => c?.text || '').join('\n'));
      } else if (typeof m.content === 'string') {
        lines.push(m.content);
      }
      lines.push('');
    }
    return lines.join('\n');
  };

  const tryExtractPatch = (txt: string): GeneratedLevelPatch | null => {
    const cleaned = txt.trim().replace(/^```(?:\w+)?\s*\n?/, '').replace(/\n?```$/, '').trim();
    const assetCatalog = promptResources.map((resource: any) => ({ id: resource.id, type: resource.type, path: resource.path }));
    try {
      return parseLevelDsl(cleaned, { intent: prompt.trim(), asset_catalog: assetCatalog });
    } catch {
      // Keep legacy JSON import compatibility while models migrate to DSL.
    }
    // 直接尝试 JSON 解析
    const tryJSON = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

    // 1) 完整 JSON
    let parsed = tryJSON(txt);
    if (Array.isArray(parsed)) return { commands: parsed, extra_events: [] };
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray((parsed as any).commands)) return { intent: typeof (parsed as any).intent === 'string' ? (parsed as any).intent : undefined, asset_catalog: Array.isArray((parsed as any).asset_catalog) ? (parsed as any).asset_catalog : [], commands: (parsed as any).commands, extra_events: Array.isArray((parsed as any).extra_events) ? (parsed as any).extra_events : [] };
      if (Array.isArray((parsed as any).levels?.[0]?.commands)) return { commands: (parsed as any).levels[0].commands, extra_events: Array.isArray((parsed as any).levels?.[0]?.events) ? (parsed as any).levels[0].events : [] };
    }

    // 2) 提取第一个大括号/中括号片段
    const arrStart = txt.indexOf('[');
    const arrEnd = txt.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      parsed = tryJSON(txt.slice(arrStart, arrEnd + 1));
      if (Array.isArray(parsed)) return { commands: parsed, extra_events: [] };
    }

    const objStart = txt.indexOf('{');
    const objEnd = txt.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      const objText = txt.slice(objStart, objEnd + 1);
      const obj = tryJSON(objText);
      if (obj && typeof obj === 'object') {
        if (Array.isArray((obj as any).commands)) return { intent: typeof (obj as any).intent === 'string' ? (obj as any).intent : undefined, asset_catalog: Array.isArray((obj as any).asset_catalog) ? (obj as any).asset_catalog : [], commands: (obj as any).commands, extra_events: Array.isArray((obj as any).extra_events) ? (obj as any).extra_events : [] };
        if (Array.isArray((obj as any).levels?.[0]?.commands)) return { commands: (obj as any).levels[0].commands, extra_events: Array.isArray((obj as any).levels[0].events) ? (obj as any).levels[0].events : [] };
      }
    }

    return null;
  };

  const extractStreamIntent = (text: string): string => {
    const match = text.match(/"intent"\s*:\s*("(?:\\.|[^"\\])*")/);
    if (!match) return '';
    try {
      const value = JSON.parse(match[1]);
      return typeof value === 'string' ? value.trim() : '';
    } catch {
      return '';
    }
  };

  const readStreamedContent = async (res: Response): Promise<string> => {
    if (!res.body) throw new Error('浏览器不支持流式 AI 响应。');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const consumeLine = (line: string) => {
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const event = JSON.parse(payload);
        const delta = event?.choices?.[0]?.delta?.content;
        const content = typeof delta === 'string' ? delta : Array.isArray(delta) ? delta.map((part: any) => part?.text || '').join('') : '';
        if (!content) return;
        fullText += content;
        setLastOutput(fullText);
        const intent = extractStreamIntent(fullText);
        if (intent) setGeneratedIntent(intent);
      } catch {
        // Ignore provider keepalive and non-content SSE events.
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines.forEach(consumeLine);
      if (done) break;
    }
    if (buffer) consumeLine(buffer);
    return fullText;
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setLastOutput('');
    setGeneratedIntent('');
    try {
      const key = apiKey.trim();
      if (!key) {
        throw new Error('请先填写 OpenRouter API Key。密钥只保存在当前浏览器。');
      }
      const messages = await buildMessages();

      const payload = {
        model: 'x-ai/grok-4-fast:free',
        messages,
        stream: true,
      } as any;

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`请求失败 ${res.status}: ${text}`);
      }

      const text = await readStreamedContent(res);
      setLastOutput(text || '');
      const patch = tryExtractPatch(text || '');
      if (!patch) throw new Error('AI 响应不是有效的 VGE-DSL/1。');
      if (patch.intent) setGeneratedIntent(patch.intent);
      let cmds = patch.commands;
      // 基于指令模板做一次“缺省值填充/校准”，避免必需显示参数缺失（如 SHOW_CHOICES.ui.fontSize）
      try { cmds = calibrateWithTemplates(cmds); } catch {}
      if (!Array.isArray(cmds) || !Array.isArray(patch.extra_events)) throw new Error('AI 响应的 commands 或 extra_events 不是数组。');

      onApplyCommands({ intent: patch.intent, asset_catalog: patch.asset_catalog, commands: cmds, extra_events: patch.extra_events });
      onCancel();
    } catch (e: any) {
      setError(e?.message || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  // ====== 模板校准：为缺失字段补默认值（含递归处理子命令） ======
  const tplMap = new Map<string, any>(COMMAND_TEMPLATES.map(t => [String(t.type).toUpperCase(), t]));
  const getTpl = (type: any) => tplMap.get(String(type || '').toUpperCase());
  const getByPath = (obj: any, path: string) => {
    try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); } catch { return undefined; }
  };
  const setByPath = (obj: any, path: string, val: any) => {
    const segs = path.split('.');
    const root = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
    let cur: any = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = segs[i];
      const next = cur[k];
      cur[k] = (next && typeof next === 'object') ? { ...next } : {};
      cur = cur[k];
    }
    cur[segs[segs.length - 1]] = val;
    return root;
  };
  const fallbackByType = (t?: string) => (t === 'number' ? 0 : (t === 'boolean' ? false : ''));

  const normalizeOne = (cmd: any): any => {
    if (!cmd || typeof cmd !== 'object') return cmd;
    const type = cmd.type || cmd.Type || cmd.TYPE;
    const tpl = getTpl(type);
    let parameters = { ...(cmd.parameters || {}) };
    if (tpl && Array.isArray(tpl.parameters)) {
      for (const p of tpl.parameters) {
        const exists = getByPath(parameters, p.name);
        if (exists === undefined) {
          const val = (p as any).defaultValue !== undefined ? (p as any).defaultValue : fallbackByType(p.type);
          parameters = setByPath(parameters, p.name, val);
        }
      }
    }
    // 特殊：IF_CONDITION 的 condition 结构归一
    const up = String(type || '').toUpperCase();
    if (up === 'IF_CONDITION') {
      const cond = parameters?.condition || {};
      const fromVar = (cond && typeof cond.variable === 'object') ? cond.variable : null;
      const mapOp = (sym: string) => ({ '==': 'eq', '===': 'eq', '!=': 'ne', '!==': 'ne', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte' }[sym] || sym || 'eq');
      const parseLit = (raw: any) => {
        const s = String(raw).trim();
        if (/^true$/i.test(s)) return true; if (/^false$/i.test(s)) return false; if (/^null$/i.test(s)) return null;
        if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
        const m = s.match(/^['\"](.*)['\"]$/); if (m) return m[1];
        return raw;
      };
      if (fromVar) {
        parameters.condition = {
          type: 'variable',
          key: cond.key || fromVar.key || '',
          operator: mapOp(cond.operator || fromVar.operator || 'eq'),
          value: parseLit(cond.value ?? fromVar.value)
        };
      } else if (cond && typeof cond === 'object') {
        const t = (cond.type || 'variable');
        parameters.condition = (t === 'expression')
          ? { type: 'expression', expression: String(cond.expression || '') }
          : { type: 'variable', key: String(cond.key || ''), operator: mapOp(cond.operator || 'eq'), value: parseLit(cond.value) };
      }
    }

    // 递归处理常见子命令字段
    const rec = (arr: any[]) => Array.isArray(arr) ? arr.map(normalizeOne) : arr;
    parameters.trueCommands = rec(parameters.trueCommands);
    parameters.falseCommands = rec(parameters.falseCommands);
    parameters.commands = rec(parameters.commands);
    parameters.onSelectedCommands = rec(parameters.onSelectedCommands);
    parameters.onCancelSelectedCommands = rec(parameters.onCancelSelectedCommands);
    // SHOW_CHOICES: options[i].commands 递归
    if (Array.isArray(parameters.options)) {
      parameters.options = parameters.options.map((opt: any) => ({
        ...opt,
        commands: rec(opt?.commands)
      }));
    }
    // 清理明确不支持的字段
    if (up === 'SET_DRAGGABLE') {
      try { if (parameters && parameters.dragType !== undefined) { const { dragType, ...rest } = parameters as any; parameters = rest; } } catch {}
    }

    return { ...cmd, parameters };
  };
  const calibrateWithTemplates = (commands: any[]): any[] => {
    if (!Array.isArray(commands)) return [];
    return commands.map(normalizeOne);
  };

  const handleCopyPrompt = async () => {
    try {
      setError(null);
      const text = await buildPromptText();
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e: any) {
      setError(e?.message || '复制失败');
    }
  };

  return (
    <div className="ai-modal-overlay">
      <div className="ai-modal">
        <div className="ai-modal-header">
          <div className="ai-modal-title">AI 生成关卡指令 🌟</div>
          <button className="ai-modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="ai-modal-body">
          <div className="ai-form">
            <label>描述你的关卡/改动需求（Prompt）</label>
            <textarea
              className="ai-textarea"
              placeholder="例如：在开场显示标题文字，然后播放入场动画，再展示两个选择按钮进入不同分支。"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <label>OpenRouter API Key（仅保存在当前浏览器）</label>
            <input
              className="ai-api-key-input"
              type="password"
              autoComplete="off"
              placeholder="sk-or-v1-..."
              value={apiKey}
              onChange={(e) => {
                const value = e.target.value;
                setApiKey(value);
                try {
                  if (value) localStorage.setItem(OPENROUTER_KEY_STORAGE, value);
                  else localStorage.removeItem(OPENROUTER_KEY_STORAGE);
                } catch {}
              }}
            />

            <div className="ai-radio-row">
              <label>是否引用当前指令树列表：</label>
              <label><input type="radio" name="includeExisting" checked={includeExisting} onChange={()=>setIncludeExisting(true)} /> 是</label>
              <label><input type="radio" name="includeExisting" checked={!includeExisting} onChange={()=>setIncludeExisting(false)} /> 否</label>
            </div>

            {lastOutput && (
              <div>
                <label>AI 原始输出（调试用）</label>
                <div className="ai-preview">{lastOutput}</div>
              </div>
            )}
          </div>

          <div className="ai-resource-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label>引用资源列表</label>
              <div>
                <button className="ai-small-btn" onClick={() => setSelectedResIds(levelResources.map(r=>r.id))}>全部+</button>{' '}
                <button className="ai-small-btn" onClick={() => setSelectedResIds([])}>全部-</button>
              </div>
            </div>
            <div className="ai-resource-list">
              {levelResources.length === 0 && (
                <div className="ai-hint">当前关卡未关联资源</div>
              )}
              {levelResources.map((r) => {
                const selected = selectedResIds.includes(r.id);
                return (
                  <div key={r.id} className="ai-resource-item">
                    <div className="ai-chip">{r.id}</div>
                    <div style={{ flex: 1, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</div>
                    {selected ? (
                      <button className="ai-small-btn" onClick={()=>removeRes(r.id)}>-</button>
                    ) : (
                      <button className="ai-small-btn" onClick={()=>addRes(r.id)}>+</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ai-modal-footer">
          <div className="ai-status" aria-live="polite">
            <div>{loading ? '正在生成中，请稍候（30秒~1分钟）…' : error ? (<span className="ai-error">{error}</span>) : (copied ? '已复制到剪贴板' : '准备就绪')}</div>
            {generatedIntent && <div className="ai-intent-progress"><span>当前理解：</span>{generatedIntent}</div>}
          </div>
          <div className="ai-actions">
            <button className="ai-secondary" onClick={handleCopyPrompt} disabled={loading}>复制 Prompt</button>
            <button className="ai-secondary" onClick={onCancel} disabled={loading}>取消</button>
            <button className="ai-primary" onClick={handleGenerate} disabled={loading}>生成</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIGenerateModal;
