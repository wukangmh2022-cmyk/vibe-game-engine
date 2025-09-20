import React, { useEffect, useRef, useState } from 'react';
import './ProjectHome.css';

interface ProjectHomeProps {
  onOpenScene: (projectBase: string, scenePath: string, gameData: any) => void;
  sessionScenes?: Array<{ path: string; data: any; lastEditedAt?: number }>; // 来自 App 的会话缓存（含数据）
  onExportProject?: () => void; // 导出整个工程
  projectBaseFromApp?: string; // 当前工程基准（由 App 维护）
  shouldAutoLoad?: boolean; // 仅当从编辑页返回时自动加载列表
}

type SceneEntry = { path: string };

export const ProjectHome: React.FC<ProjectHomeProps> = ({ onOpenScene, sessionScenes = [], onExportProject, projectBaseFromApp, shouldAutoLoad }) => {
  const [projectBase, setProjectBase] = useState<string>(projectBaseFromApp || ''); // 优先使用上层传入
  const [scenes, setScenes] = useState<SceneEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localFolderName, setLocalFolderName] = useState<string>('');
  const [localFiles, setLocalFiles] = useState<Map<string, File> | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const ensureSlash = (s: string) => (s.endsWith('/') ? s : (s + '/'));

  const loadProject = async (base: string) => {
    const b = ensureSlash(base);
    setProjectBase(b);
    setLoading(true); setError(null); setScenes([]);
    try {
      const res = await fetch(`${b}config.json`);
      if (!res.ok) throw new Error(`加载失败: ${b}config.json`);
      const cfg = await res.json();
      const arr: SceneEntry[] = [];
      const root = cfg?.['scene-tree']?.curnode;
      if (root) arr.push({ path: root });
      const children = Array.isArray(cfg?.['scene-tree']?.child_node) ? cfg['scene-tree'].child_node : [];
      children.forEach((c: any) => { if (c?.curnode) arr.push({ path: c.curnode }); });
      if (arr.length === 0) arr.push({ path: 'scene/hello-world.json' });
      setScenes(arr);
      try { psSetKey(b); psSet(b, arr); } catch {}
      try { console.info('[Home] loadProject done', { base: b, scenes: arr.map(s => s.path) }); } catch {}
      try { localStorage.setItem('editor:projectBase', b); } catch {}
      // 注入资源基准
      try { (window as any).__ASSET_BASE__ = b; } catch {}
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 当上层传入的 projectBase 变化时，自动加载对应工程（用于从编辑页返回时恢复列表）
  useEffect(() => {
    if (shouldAutoLoad && projectBaseFromApp && projectBaseFromApp.trim()) {
      loadProject(projectBaseFromApp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectBaseFromApp, shouldAutoLoad]);

  // 若存在先前选择的本地工程（保存在 window.__LOCAL_FILES__），则自动恢复场景列表
  useEffect(() => {
    try {
      const globalFiles: Map<string, File> | undefined = (window as any).__LOCAL_FILES__;
      if (!globalFiles) return;
      if (localFiles) return; // 已有则不覆盖
      // 复用本地模式读取 config.json / scene 列表
      (async () => {
        setLocalFiles(globalFiles);
        setLocalFolderName('local');
        let list: SceneEntry[] = [];
        const cfg = globalFiles.get('config.json');
        if (cfg) {
          try {
            const text = await cfg.text();
            const json = JSON.parse(text);
            const root = json?.['scene-tree']?.curnode;
            const children = Array.isArray(json?.['scene-tree']?.child_node) ? json['scene-tree'].child_node : [];
            if (root) list.push({ path: root });
            children.forEach((c: any) => { if (c?.curnode) list.push({ path: c.curnode }); });
          } catch {}
        }
        if (!list.length) {
          for (const k of globalFiles.keys()) if (k.startsWith('scene/') && k.endsWith('.json')) list.push({ path: k });
        }
        if (!list.length) list.push({ path: 'scene/hello-world.json' });
        setScenes(list);
        try { psSetKey(''); psSet('', list); } catch {}
        setError(null);
      })();
    } catch {}
  }, []);

  // 本地文件夹模式：选择并解析
  const chooseLocalFolder = () => { setError(null); setScenes([]); dirInputRef.current?.click(); };
  const onLocalFolderPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    const m = new Map<string, File>();
    let rootName = '';
    files.forEach(f => {
      const rel = (f as any).webkitRelativePath || f.name;
      if (!rootName) rootName = rel.split('/')[0] || 'project';
      const norm = rel.replace(/^([^/]+)\//, '');
      m.set(norm, f);
    });
    setLocalFolderName(rootName);
    // 进入本地工程模式：清空 server base，所有场景打开/保存走本地映射
    setProjectBase('');
    setLocalFiles(m);
    try { (window as any).__LOCAL_FILES__ = m; } catch {}
    // 构建场景列表
    let list: SceneEntry[] = [];
    const cfg = m.get('config.json');
    if (cfg) {
      try {
        const text = await cfg.text();
        const json = JSON.parse(text);
        const root = json?.['scene-tree']?.curnode;
        const children = Array.isArray(json?.['scene-tree']?.child_node) ? json['scene-tree'].child_node : [];
        if (root) list.push({ path: root });
        children.forEach((c: any) => { if (c?.curnode) list.push({ path: c.curnode }); });
      } catch {}
    }
    if (!list.length) {
      for (const k of m.keys()) if (k.startsWith('scene/') && k.endsWith('.json')) list.push({ path: k });
    }
    if (!list.length) list.push({ path: 'scene/hello-world.json' });
    setScenes(list);
    setError(null);
  };

  const openScene = async (relPath: string) => {
    try {
      const lf = (localFiles || (window as any).__LOCAL_FILES__ || null) as Map<string, File> | null;
      const localKeys = lf ? Array.from(lf.keys()) : [];
      console.info('[Home] openScene click', {
        relPath,
        projectBase,
        scenes: scenes.map(s => s.path),
        session: (sessionScenes || []).map(s => s.path),
        hasLocalFiles: !!lf,
        localKeys
      });
    } catch {}
    // 优先从会话缓存打开（确保未落盘的新建/复制也能打开）
    const cached = (sessionScenes || []).find(s => (s.path === relPath) || (('scene/' + s.path.replace(/^\.\//,'')) === relPath));
    if (cached && cached.data) {
      onOpenScene(projectBase || '', relPath, cached.data);
      return;
    }
    const files = localFiles || ((window as any).__LOCAL_FILES__ as Map<string, File> | undefined) || null;
    if (files) {
      try {
        const rel = relPath.replace(/^\.\//, '');
        const key = files.has(rel) ? rel : (files.has(`scene/${rel}`) ? `scene/${rel}` : rel);
        const f = files.get(key);
        if (!f) throw new Error('场景文件不存在: ' + relPath);
        const text = await f.text();
        const data = JSON.parse(text);
        // 重写资源为 blob:// URL
        const groups = ['images','audios','animations','videos'];
        const res = data?.resources || {};
        for (const g of groups) {
          const arr = Array.isArray(res[g]) ? res[g] : [];
          for (const item of arr) {
            const src: string = item.src || item.url;
            if (typeof src === 'string') {
              const key = src.replace(/^\.\//,'');
              const file = files.get(key) || files.get(`/${key}`) || files.get(key.replace(/^\/+/, ''));
              if (file) item.src = URL.createObjectURL(file);
            }
          }
        }
        onOpenScene('', relPath, data);
      } catch (e) { alert('加载本地场景失败'); }
      return;
    }
    const b = ensureSlash(projectBase);
    try {
      const url = `${b}${relPath.replace(/^\.\//,'')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`加载失败: ${url}`);
      const data = await res.json();
      onOpenScene(b, relPath, data);
    } catch (e) { alert('加载场景失败'); }
  };

  // 新建场景
  const createNewScene = async () => {
    const ts = Date.now();
    let name = `scene/untitled-${ts}.json`;
    try {
      const v = prompt('输入新场景文件名（位于 scene/ 目录）', name);
      if (v && v.trim()) name = v.trim().replace(/^\.\//,'');
      if (!name.startsWith('scene/')) name = 'scene/' + name;
    } catch {}
    const skeleton = {
      id: 'new-scene', name: '新场景', version: '1.0.0',
      resources: { images: [], audios: [], animations: [], videos: [] },
      levels: [ { id: 'level1', name: '关卡1', initialState: {}, commands: [], events: [], resources: [] } ]
    };
    // 注入到本地工程映射（若存在），否则仅加入会话缓存
    try {
      const blob = new Blob([JSON.stringify(skeleton, null, 2)], { type: 'application/json' });
      const file = new File([blob], name.split('/').pop() || 'untitled.json', { type: 'application/json' });
      const lf: Map<string, File> = (localFiles || (window as any).__LOCAL_FILES__ || null) as any;
      if (lf) {
        const map = lf; map.set(name, file); setLocalFiles(map);
        setScenes(prev => prev.concat({ path: name }));
      }
    } catch {}
    // 本地工程：强制使用 '' 作为 base，避免串用默认工程
    onOpenScene('', name, skeleton);
  };

  // 复制场景（从列表项复制）
  const copyScene = async (srcPath: string) => {
    try {
      // 获取原数据：会话缓存 > 本地映射 > 远程
      let data: any | null = (sessionScenes || []).find(s => s.path === srcPath)?.data || null;
      const files = (localFiles || (window as any).__LOCAL_FILES__ || null) as Map<string, File> | null;
      if (!data && files) { const f = files.get(srcPath) || files.get(srcPath.replace(/^scene\//,'')); if (f) { const t = await f.text(); data = JSON.parse(t); } }
      if (!data && projectBase) { const u = (projectBase.endsWith('/') ? projectBase : projectBase + '/') + srcPath.replace(/^\.\//,''); const r = await fetch(u); if (r.ok) data = await r.json(); }
      if (!data) { alert('无法读取源场景'); return; }
      const baseName = srcPath.replace(/^scene\//,'').replace(/\.json$/,'');
      let dest = `scene/${baseName}-copy.json`;
      const v = prompt('复制为（位于 scene/ 目录）', dest);
      if (v && v.trim()) dest = v.trim().replace(/^\.\//,'');
      if (!dest.startsWith('scene/')) dest = 'scene/' + dest;
      // 写入到本地映射（若存在）
      try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const file = new File([blob], dest.split('/').pop() || 'copy.json', { type: 'application/json' });
        if (files) { files.set(dest, file); setLocalFiles(files); setScenes(prev => prev.concat({ path: dest })); }
      } catch {}
      onOpenScene(projectBase || '', dest, data);
    } catch { alert('复制失败'); }
  };

  // 复制到指定目标路径（scene/xxx.json）
  const copySceneAs = async (srcPath: string, destPath: string) => {
    try {
      let data: any | null = (sessionScenes || []).find(s => s.path === srcPath)?.data || null;
      const files = (localFiles || (window as any).__LOCAL_FILES__ || null) as Map<string, File> | null;
      if (!data && files) {
        const f = files.get(srcPath) || files.get(srcPath.replace(/^scene\//,''));
        if (f) { const t = await f.text(); data = JSON.parse(t); }
      }
      if (!data && projectBase) {
        const u = (projectBase.endsWith('/') ? projectBase : projectBase + '/') + srcPath.replace(/^\.\//,'');
        const r = await fetch(u); if (r.ok) data = await r.json();
      }
      if (!data) { alert('无法读取源场景'); return; }
      let dest = (destPath || '').trim().replace(/^\.\//,'');
      if (!dest.startsWith('scene/')) dest = 'scene/' + dest;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const file = new File([blob], dest.split('/').pop() || 'copy.json', { type: 'application/json' });
      if (files) { files.set(dest, file); setLocalFiles(files); setScenes(prev => prev.concat({ path: dest })); }
      onOpenScene(projectBase || '', dest, data);
    } catch { alert('复制失败'); }
  };

  const renameScene = async (srcPath: string) => {
    const baseName = srcPath.replace(/^scene\//,'');
    let dest = `scene/${baseName.replace(/\.json$/,'')}-renamed.json`;
    try { const v = prompt('重命名为（位于 scene/ 目录）', dest); if (v && v.trim()) dest = v.trim(); } catch {}
    if (!dest) return;
    await copySceneAs(srcPath, dest);
    // 删除原文件（仅本地映射/会话列表）
    try {
      const lf = (localFiles || (window as any).__LOCAL_FILES__ || null) as Map<string, File> | null;
      if (lf) { lf.delete(srcPath); setLocalFiles(lf); }
    } catch {}
    setScenes(prev => prev.filter(s => s.path !== srcPath));
  };

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  return (
    <div className="ph-root">
      <div className="ph-hero">
        <div className="ph-hero-title">开发·编辑平台</div>
        <div className="ph-hero-sub">选择工程开始编辑</div>
        {/* 导出按钮改为右下角悬浮，不在此处渲染 */}
      </div>
      <div className="ph-body">
        <div className="ph-col">
          <div className="ph-card">
            <div className="ph-card-title">打开工程文件夹</div>
            <div className="ph-row">
              <button className="ph-primary" onClick={chooseLocalFolder}>📂 选择本地文件夹</button>
              <input
                ref={dirInputRef}
                type="file"
                style={{ display: 'none' }}
                multiple
                onChange={onLocalFolderPicked}
                {...({ webkitdirectory: '' } as any)}
              />
            </div>
            {localFolderName && <div className="ph-hint">已选择: {localFolderName}</div>}
            <div className="ph-row">
              <button className="ph-button" onClick={() => loadProject('/default-project/')}>加载默认工程</button>
            </div>
          </div>
          {error && <div className="ph-error">{error}</div>}
        </div>

        <div className="ph-col">
          <div className="ph-card">
            <div className="ph-card-title">场景列表
              <button className="ph-button" style={{ marginLeft: 8 }} onClick={createNewScene}>＋ 新建场景</button>
            </div>
            <div className="ph-scenes">
              {loading && <div className="ph-dim">加载中...</div>}
              {!loading && (sessionScenes || []).length > 0 && (
                <>
                  <div className="ph-subtitle">最近编辑</div>
                  {(sessionScenes || []).slice().sort((a,b)=> (b.lastEditedAt||0)-(a.lastEditedAt||0)).map(s => (
                    <div key={'recent:'+s.path} className="ph-scene-row" onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, path: s.path }); }}>
                      <button className="ph-scene" onClick={() => openScene(s.path)}>
                        <div className="ph-scene-name">{s.path.replace(/^scene\//,'')}</div>
                        <div className="ph-scene-path">{s.path} {s.lastEditedAt ? `· 最后编辑：${new Date(s.lastEditedAt).toLocaleString()}` : ''}</div>
                      </button>
                    </div>
                  ))}
                </>
              )}
              {!loading && (
                <>
                  <div className="ph-subtitle">全部场景</div>
                  {scenes.filter(s => !(sessionScenes||[]).some(cs => cs.path === s.path)).map(s => (
                    <div key={s.path} className="ph-scene-row" onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, path: s.path }); }}>
                      <button className="ph-scene" onClick={() => openScene(s.path)}>
                        <div className="ph-scene-name">{s.path.replace(/^scene\//,'')}</div>
                        <div className="ph-scene-path">{s.path}</div>
                      </button>
                    </div>
                  ))}
                  {scenes.length === 0 && (sessionScenes||[]).length === 0 && <div className="ph-dim">无可用场景</div>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {ctxMenu && (
        <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: '#fff', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: 160 }} onClick={(e)=>e.stopPropagation()}>
          <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { const p = prompt('复制为（scene/xxx.json）', `scene/${ctxMenu.path.replace(/^scene\//,'').replace(/\.json$/,'')}-copy.json`); if (p && p.trim()) copySceneAs(ctxMenu.path, (p||'').trim()); setCtxMenu(null);} }>复制</button>
          <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { const p = prompt('重命名为（scene/xxx.json）', ctxMenu.path); if (p && p.trim()) { renameScene(ctxMenu.path); } setCtxMenu(null);} }>修改名</button>
          <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent', color:'#c00' }} onClick={() => { if (confirm('删除该场景？此操作仅影响本地会话/映射')) { try { const lf = (localFiles || (window as any).__LOCAL_FILES__ || null) as Map<string, File> | null; if (lf) { lf.delete(ctxMenu.path); setLocalFiles(lf); } } catch {} setScenes(prev => prev.filter(s => s.path !== ctxMenu.path)); setCtxMenu(null); } }}>删除</button>
        </div>
      )}

      {onExportProject && (
        <button className="ph-export-floating" onClick={onExportProject} title="导出整个工程">
          📦 导出工程
        </button>
      )}
    </div>
  );
};

export default ProjectHome;
