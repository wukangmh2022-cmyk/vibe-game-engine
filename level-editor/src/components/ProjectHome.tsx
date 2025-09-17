import React, { useEffect, useRef, useState } from 'react';
import './ProjectHome.css';

interface ProjectHomeProps {
  onOpenScene: (projectBase: string, scenePath: string, gameData: any) => void;
}

type SceneEntry = { path: string };

export const ProjectHome: React.FC<ProjectHomeProps> = ({ onOpenScene }) => {
  const [projectBase, setProjectBase] = useState<string>(() => {
    try { return localStorage.getItem('editor:projectBase') || '/default-project/'; } catch { return '/default-project/'; }
  });
  const [scenes, setScenes] = useState<SceneEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localFolderName, setLocalFolderName] = useState<string>('');
  const [localFiles, setLocalFiles] = useState<Map<string, File> | null>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const ensureSlash = (s: string) => (s.endsWith('/') ? s : (s + '/'));

  const loadProject = async (base: string) => {
    const b = ensureSlash(base);
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
      try { localStorage.setItem('editor:projectBase', b); } catch {}
      // 注入资源基准
      try { (window as any).__ASSET_BASE__ = b; } catch {}
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProject(projectBase); }, []);

  // 本地文件夹模式：选择并解析
  const chooseLocalFolder = () => dirInputRef.current?.click();
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
    setLocalFiles(m);
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
    if (localFiles) {
      try {
        const f = localFiles.get(relPath);
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
              const file = localFiles.get(key);
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

  return (
    <div className="ph-root">
      <div className="ph-hero">
        <div className="ph-hero-title">开发·编辑平台</div>
        <div className="ph-hero-sub">选择工程开始编辑</div>
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
          </div>

          <div className="ph-card">
            <div className="ph-card-title">从服务器路径打开</div>
            <div className="ph-row">
              <input className="ph-input" value={projectBase} onChange={(e) => setProjectBase(e.target.value)} placeholder="/default-project/ 或 /00project/" />
              <button className="ph-button" onClick={() => loadProject(projectBase)} disabled={loading}>打开</button>
            </div>
            <div className="ph-row">
              <button className="ph-button" onClick={() => { setProjectBase('/default-project/'); loadProject('/default-project/'); }}>默认工程</button>
              <button className="ph-button" onClick={() => { setProjectBase('/00project/'); loadProject('/00project/'); }}>00project</button>
            </div>
            {error && <div className="ph-error">{error}</div>}
          </div>
        </div>

        <div className="ph-col">
          <div className="ph-card">
            <div className="ph-card-title">场景列表</div>
            <div className="ph-scenes">
              {loading && <div className="ph-dim">加载中...</div>}
              {!loading && scenes.length === 0 && <div className="ph-dim">无可用场景</div>}
              {!loading && scenes.map((s) => (
                <button key={s.path} className="ph-scene" onClick={() => openScene(s.path)}>
                  <div className="ph-scene-name">{s.path.replace(/^scene\//,'')}</div>
                  <div className="ph-scene-path">{s.path}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectHome;
