import React, { useEffect, useMemo, useState } from 'react';
import { GameProject, LevelConfig } from '../types';
import './AIGenerateModal.css';
import { PROMPT_GUIDE_INLINE } from '../guides/promptGuideInline';
import { COMMAND_TEMPLATES } from '../utils/commandTemplates';

interface AIGenerateModalProps {
  isOpen: boolean;
  currentLevel: LevelConfig & { rawCommands?: any[] };
  project: GameProject | null;
  onCancel: () => void;
  onApplyCommands: (commandsJson: any[]) => void; // 将生成的 JSON 写回当前关卡
}

// 填入你的 OpenRouter API Key（临时硬编码，稍后可替换）
const OPENROUTER_API_KEY = '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'; 
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const AIGenerateModal: React.FC<AIGenerateModalProps> = ({
  isOpen,
  currentLevel,
  project,
  onCancel,
  onApplyCommands,
}) => {
  const [prompt, setPrompt] = useState('');
  const [includeExisting, setIncludeExisting] = useState<boolean>(false);
  const [selectedResIds, setSelectedResIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState<string>('');
  const [imgDims, setImgDims] = useState<Record<string, { w: number; h: number }>>({});
  const [copied, setCopied] = useState<boolean>(false);
  const [guideCache, setGuideCache] = useState<string>('');

  // 当前关卡可用资源（以文本显示：id, path/src）
  const levelResources = useMemo(() => {
    const ids = (currentLevel?.resources || []) as string[];
    const all = (project?.resources || []) as any[];
    const map = new Map(all.map((r: any) => [r.id, r]));
    return ids
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((r: any) => ({ id: r.id, path: r.path || r.src || '', type: r.type || 'resource', url: r.src || r.path || '' }));
  }, [currentLevel, project]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLastOutput('');
      // 默认：如果当前有指令则勾选“引用当前关卡指令”
      const has = Array.isArray((currentLevel as any)?.rawCommands) && (currentLevel as any).rawCommands.length > 0;
      setIncludeExisting(has);
      setSelectedResIds([]);
    }
  }, [isOpen, currentLevel]);

  // 选中的图片资源：预加载以获取宽高
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const sel = new Set(selectedResIds);
    const targets = levelResources.filter(r => sel.has(r.id) && r.type === 'image');
    if (targets.length === 0) return;
    targets.forEach(r => {
      const url = r.url || r.path;
      if (!url) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setImgDims(prev => ({ ...prev, [r.id]: { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height } }));
      };
      img.onerror = () => {
        // ignore
      };
      img.src = url;
    });
    return () => { cancelled = true; };
  }, [isOpen, selectedResIds, levelResources]);

  if (!isOpen) return null;

  const typeToZh = (t: string) => (
    t === 'image' ? '图片'
    : t === 'audio' ? '音效'
    : t === 'animation' ? '动画'
    : t === 'video' ? '视频'
    : t === 'skin' ? '皮肤'
    : '资源'
  );

  const selectedResourceTexts = () => {
    const sel = new Set(selectedResIds);
    return levelResources
      .filter((r) => sel.has(r.id))
      .map((r) => {
        const base = `- [${typeToZh(r.type)}] id: ${r.id} | path: ${r.path}`;
        if (r.type === 'image') {
          const d = imgDims[r.id];
          if (d && d.w && d.h) return `${base} | size: ${d.w}x${d.h}`;
        }
        return base;
      })
      .join('\n');
  };

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
      if (!guideText) guideText = PROMPT_GUIDE_INLINE; // 内联回退，确保 dist 也有内容
      if (guideText) setGuideCache(guideText);
    }

    // 系统提示：放入规则说明
    const systemTextParts: string[] = [];
    if (guideText) {
      systemTextParts.push('遵循以下编辑器指令编写规则：');
      systemTextParts.push(guideText);
    } else {
      systemTextParts.push('你是关卡指令生成助手，请输出符合编辑器规范的 commands JSON。');
    }

    // 用户提示：组合画布、资源、现有指令、用户需求
    const userParts: string[] = [];
    userParts.push('【任务】根据需求生成或优化当前关卡的 commands 列表（JSON 数组）。');
    userParts.push('【需求描述】');
    userParts.push((prompt || '').trim() || '无');

    const cw = Number((currentLevel as any)?.canvasWidth || 800);
    const ch = Number((currentLevel as any)?.canvasHeight || 600);
    userParts.push(`\n【画布设置】宽度: ${cw}, 高度: ${ch}`);
    userParts.push('【尺寸约束】SHOW_IMAGE 的宽和高参数请务必合理，且不要超过画布大小。');
    userParts.push(`- SHOW_IMAGE 自身x + width <= ${Number((currentLevel as any)?.canvasWidth || 800)}, y + height <= ${Number((currentLevel as any)?.canvasHeight || 600)} （元素不超出画布宽高）。`);


    if (selectedResIds.length > 0) {
      userParts.push('\n【可引用的关卡资源（按需使用）】');
      userParts.push(selectedResourceTexts());
    }

    // 附：列出当前关卡全部可用资源（类型/ID/路径），便于模型全局参考
    if ((project?.resources || []).length > 0 && (currentLevel?.resources || []).length > 0) {
      const allLines = (currentLevel.resources as string[])
        .map((rid) => levelResources.find(r => r.id === rid))
        .filter(Boolean)
        .map((r: any) => `- [${typeToZh(r.type)}] id: ${r.id} | path: ${r.path}`)
        .join('\n');
      if (allLines) {
        userParts.push('\n【关卡可用资源（全部）】');
        userParts.push(allLines);
      }
    }

    if (includeExisting && Array.isArray((currentLevel as any)?.rawCommands)) {
      try {
        const raw = JSON.stringify((currentLevel as any).rawCommands, null, 2);
        userParts.push('\n【当前关卡现有命令（可在其基础上优化）】');
        // 避免太长，放在 text chunk 内部即可
        userParts.push(raw);
      } catch {}
    }

    userParts.push('\n【输出要求】');
    userParts.push('- 仅返回 JSON；内容是 commands 的数组。');
    userParts.push('- 不要包含 markdown 代码块围栏或额外解释。');
    userParts.push('- 所有指令参数字段、类型需与规则一致。');
    
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

  const tryExtractCommands = (txt: string): any[] | null => {
    // 直接尝试 JSON 解析
    const tryJSON = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

    // 1) 完整 JSON
    let parsed = tryJSON(txt);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray((parsed as any).commands)) return (parsed as any).commands;
      if (Array.isArray((parsed as any).levels?.[0]?.commands)) return (parsed as any).levels[0].commands;
    }

    // 2) 提取第一个大括号/中括号片段
    const arrStart = txt.indexOf('[');
    const arrEnd = txt.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      parsed = tryJSON(txt.slice(arrStart, arrEnd + 1));
      if (Array.isArray(parsed)) return parsed;
    }

    const objStart = txt.indexOf('{');
    const objEnd = txt.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      const objText = txt.slice(objStart, objEnd + 1);
      const obj = tryJSON(objText);
      if (obj && typeof obj === 'object') {
        if (Array.isArray((obj as any).commands)) return (obj as any).commands;
        if (Array.isArray((obj as any).levels?.[0]?.commands)) return (obj as any).levels[0].commands;
      }
    }

    return null;
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setLastOutput('');
    try {
      if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes('FILL')) {
        throw new Error('未设置 OPENROUTER_API_KEY，请在 AIGenerateModal.tsx 顶部常量处填写。');
      }
      const messages = await buildMessages();

      const payload = {
        model: 'x-ai/grok-4-fast:free',
        messages,
      } as any;

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`请求失败 ${res.status}: ${text}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((c: any) => (c?.text || '')).join('\n')
          : '';

      setLastOutput(text || '');
      let cmds = tryExtractCommands(text || '') || [];
      // 基于指令模板做一次“缺省值填充/校准”，避免必需显示参数缺失（如 SHOW_CHOICES.ui.fontSize）
      try { cmds = calibrateWithTemplates(cmds); } catch {}
      if (!Array.isArray(cmds)) throw new Error('AI 响应中未找到有效 commands JSON。');

      onApplyCommands(cmds);
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

            <div className="ai-radio-row">
              <label>是否引用当前关卡指令：</label>
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
          <div className="ai-status">
            {loading ? '正在生成中，请稍候…' : error ? (<span className="ai-error">{error}</span>) : (copied ? '已复制到剪贴板' : '准备就绪')}
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
