import React, { useEffect, useRef, useState } from 'react';
import './ProjectHome.css';
import vfs from '../utils/vfs';
import { attachRuntimeSceneUrl } from '../utils/sceneMeta';
import { setCurrentProjectKey as psSetKey, setScenes as psSet, getCurrentProjectKey as psGetKey } from '../utils/projectStore';
import { isFsaSupported, loadLastHandle, saveLastHandle, verifyPermission, buildFileMapFromHandle, pickDirectory } from '../utils/fsAccess';

interface ProjectHomeProps {
  onOpenScene: (projectBase: string, scenePath: string, gameData: any) => void;
  sessionScenes?: Array<{ path: string; data: any; lastEditedAt?: number }>; // 来自 App 的会话缓存（含数据）
  onExportProject?: () => void; // 导出整个工程
  projectBaseFromApp?: string; // 当前工程基准（由 App 维护）
  shouldAutoLoad?: boolean; // 仅当从编辑页返回时自动加载列表
  // 编辑器设置：预览开始时自动保存（默认关闭，由首页勾选开启）
  autoSaveOnPlay?: boolean;
  onToggleAutoSave?: (on: boolean) => void;
}

type SceneEntry = { path: string; mtime?: number | null };

export const ProjectHome: React.FC<ProjectHomeProps> = ({ onOpenScene, sessionScenes = [], onExportProject, projectBaseFromApp, shouldAutoLoad, autoSaveOnPlay, onToggleAutoSave }) => {
  const [projectBase, setProjectBase] = useState<string>(projectBaseFromApp || ''); // 优先使用上层传入
  const [scenes, setScenes] = useState<SceneEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localFolderName, setLocalFolderName] = useState<string>('');
  const [localFiles, setLocalFiles] = useState<Map<string, File> | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  // 最近工程记录（仅本地文件夹持久化）
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [canQuickReopen, setCanQuickReopen] = useState<boolean>(false);

  const ensureSlash = (s: string) => (s.endsWith('/') ? s : (s + '/'));

  const loadProject = async (base: string) => {
    const b = ensureSlash(base);
    setProjectBase(b);
    setLoading(true); setError(null); setScenes([]);
    try {
      // Import to IndexedDB VFS and list scenes from VFS
      await vfs.importFromServer(b);
      vfs.setBackend('idb');
      vfs.setProjectBase(b);
      const arr = (await vfs.listSceneMetas()).map(m => ({ path: m.path, mtime: m.mtime }));
      setScenes(arr);
      // 默认/远端工程不持久化最近工程
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

  // 读取最近工程记录（仅本地文件夹会写入）
  useEffect(() => {
    try { setLastKey(psGetKey()); } catch {}
    // 若存在持久化的目录句柄，则展示“重新打开”按钮（权限不足会在点击时再请求）
    (async () => {
      try {
        if (!isFsaSupported()) { setCanQuickReopen(false); return; }
        const handle = await loadLastHandle();
        setCanQuickReopen(!!handle);
      } catch { setCanQuickReopen(false); }
    })();
  }, []);

  // 若存在先前选择的本地工程（保存在 window.__LOCAL_FILES__），则自动恢复场景列表
  useEffect(() => {
    try {
      const globalFiles: Map<string, File> | undefined = (window as any).__LOCAL_FILES__;
      if (!globalFiles) return;
      if (localFiles) return; // 已有则不覆盖
      // 复用本地模式读取 config.json / scene 列表
      (async () => {
        setLocalFiles(globalFiles);
        try { setLocalFolderName(localStorage.getItem('editor:lastLocalFolderName') || 'local'); } catch { setLocalFolderName('local'); }
        vfs.setBackend('folder', { files: globalFiles });
        vfs.setProjectBase('');
        const list = (await vfs.listSceneMetas()).map(m => ({ path: m.path, mtime: m.mtime }));
        setScenes(list);
        try { psSetKey(''); psSet('', list.map(x => ({ path: x.path, lastEditedAt: x.mtime || undefined }))); } catch {}
        setError(null);
      })();
    } catch {}
  }, []);

  // 本地文件夹模式：选择并解析
  const chooseLocalFolder = () => { setError(null); setScenes([]); dirInputRef.current?.click(); };
  const chooseLocalFolderFsa = async () => {
    setError(null); setScenes([]);
    try {
      if (!isFsaSupported()) { chooseLocalFolder(); return; }
      const handle = await pickDirectory(); if (!handle) { try { const dbg = localStorage.getItem('DEBUG_FSA')==='1'; if (dbg) console.info('[FSA] User cancelled directory picker'); } catch {} return; }
      const ok = await verifyPermission(handle, 'read'); if (!ok) return;
      const map = await buildFileMapFromHandle(handle);
      try { localStorage.setItem('editor:lastLocalFolderName', String(handle.name || 'local')); } catch {}
      setLocalFolderName(String(handle.name || 'local'));
      setProjectBase('');
      setLocalFiles(map);
      try { (window as any).__LOCAL_FILES__ = map; } catch {}
      vfs.setBackend('folder', { files: map });
      (vfs as any).setFsDirectoryHandle?.(handle);
      vfs.setProjectBase('');
      const list = (await vfs.listSceneMetas()).map(mm => ({ path: mm.path, mtime: mm.mtime }));
      setScenes(list);
      try { await saveLastHandle(handle); } catch {}
      try { const dbg = localStorage.getItem('DEBUG_FSA')==='1'; if (dbg) console.info('[FSA] Saved last handle after opening directory, scenes:', list.map(x=>x.path)); } catch {}
      setError(null);
    } catch (e) { try { const dbg = localStorage.getItem('DEBUG_FSA')==='1'; if (dbg) console.warn('[FSA] chooseLocalFolderFsa failed', e); } catch {} setError('打开本地工程失败'); }
  };
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
    try { localStorage.setItem('editor:lastLocalFolderName', String(rootName || 'local')); } catch {}
    // 进入本地工程模式：清空 server base，所有场景打开/保存走本地映射
    setProjectBase('');
    setLocalFiles(m);
    try { (window as any).__LOCAL_FILES__ = m; } catch {}
    // Configure VFS for folder and list scenes
    try {
      vfs.setBackend('folder', { files: m });
      vfs.setProjectBase('');
      const list = (await vfs.listSceneMetas()).map(mm => ({ path: mm.path, mtime: mm.mtime }));
      setScenes(list);
    } catch {}
    setError(null);
  };

  const refreshScenes = async () => {
    try {
      const list = (await vfs.listSceneMetas()).map(m => ({ path: m.path, mtime: m.mtime }));
      setScenes(list);
    } catch {}
  };

  

  const openScene = async (relPath: string) => {
    try {
      const data = await vfs.readScene(relPath);
      if (!data) throw new Error('not found');
      const b = projectBase ? ensureSlash(projectBase) : '';
      attachRuntimeSceneUrl(data, { base: b, scenePath: relPath });
      onOpenScene(b, relPath, data);
    } catch (e) { alert('加载场景失败'); }
  };

  // 新建场景
  const createNewScene = async () => {
    const ts = Date.now() % 10;
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
    try { await vfs.writeScene(name, skeleton); } catch {}
    // 不进入编辑页，刷新列表
    refreshScenes();
  };

  // 复制场景（从列表项复制）
  const copyScene = async (srcPath: string) => {
    try {
      // 仅从 VFS 读取
      let data: any | null = await vfs.readScene(srcPath);
      if (!data) { alert('无法读取源场景'); return; }
      const baseName = srcPath.replace(/^scene\//,'').replace(/\.json$/,'');
      let dest = `scene/${baseName}-copy.json`;
      const v = prompt('复制为（位于 scene/ 目录）', dest);
      if (v && v.trim()) dest = v.trim().replace(/^\.\//,'');
      if (!dest.startsWith('scene/')) dest = 'scene/' + dest;
      try { await vfs.writeScene(dest, data); } catch {}
      await refreshScenes();
    } catch { alert('复制失败'); }
  };

  // 复制到指定目标路径（scene/xxx.json）
  const copySceneAs = async (srcPath: string, destPath: string) => {
    try {
      let data: any | null = await vfs.readScene(srcPath);
      if (!data) { alert('无法读取源场景'); return; }
      let dest = (destPath || '').trim().replace(/^\.\//,'');
      if (!dest.startsWith('scene/')) dest = 'scene/' + dest;
      await vfs.writeScene(dest, data);
      await refreshScenes();
    } catch { alert('复制失败'); }
  };

  const renameScene = async (srcPath: string, nameOnlyOverride?: string) => {
    // 仅修改文件名，不包含路径
    const rel = srcPath.replace(/^scene\//,'');
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const oldName = rel.includes('/') ? rel.slice(rel.lastIndexOf('/') + 1) : rel;
    let newName = oldName.replace(/\.json$/,'') + '-renamed.json';
    if (!nameOnlyOverride) {
      try {
        const v = prompt('重命名文件名（不含路径）', oldName);
        if (v && v.trim()) newName = v.trim(); else return;
      } catch { return; }
    } else {
      newName = nameOnlyOverride;
    }
    newName = newName.replace(/^\/+/, '');
    if (!/\.json$/i.test(newName)) newName = newName + '.json';
    const dest = 'scene/' + (dir ? (dir + '/') : '') + newName;
    try { await vfs.renameScene(srcPath, dest); } catch {}
    // 不进入编辑页，刷新列表
    refreshScenes();
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
        {lastKey !== 'local' && (
          <div className="ph-hero-sub">上传工程开始编辑</div>
        )}
        {(() => {
          const text = (() => {
            if (localFiles) return localFolderName ? `本地 · ${localFolderName}` : '本地工程';
            if (projectBase) return ``;//远程不显示
            return '';
          })();
          return text ? (
            <div className="ph-hint" style={{ marginTop: 6, wordBreak: 'break-all' }}>
              当前工程：{text}
            </div>
          ) : null;
        })()}
        <div className="ph-hint" style={{ marginTop: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!autoSaveOnPlay}
              onChange={(e) => {
                const on = !!e.target.checked;
                try { localStorage.setItem('editor:autoSaveOnPlay', on ? '1' : '0'); } catch {}
                onToggleAutoSave && onToggleAutoSave(on);
              }}
            />
            <span>是否编辑时自动保存关卡</span>
          </label>
        </div>
        
      </div>
      <div className="ph-body">
        <div className="ph-col">
          <div className="ph-card">
            <div className="ph-card-title">打开工程文件夹</div>
            <div className="ph-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="ph-primary" onClick={chooseLocalFolderFsa}>📂 打开本地文件夹</button>
              {(lastKey === 'local' || canQuickReopen) && (
                <button className="ph-button" onClick={async () => {
                  try {
                    if (!isFsaSupported()) { chooseLocalFolder(); return; }
                    const handle = await loadLastHandle();
                    if (!handle) { try { const dbg = localStorage.getItem('DEBUG_FSA')==='1'; if (dbg) console.info('[FSA] No stored last handle'); } catch {} chooseLocalFolder(); return; }
                    const ok = await verifyPermission(handle, 'read');
                    if (!ok) {
                      const ok2 = await verifyPermission(handle, 'read');
                      if (!ok2) { try { const dbg = localStorage.getItem('DEBUG_FSA')==='1'; if (dbg) console.info('[FSA] Permission not granted for last handle'); } catch {} chooseLocalFolder(); return; }
                    }
                    const map = await buildFileMapFromHandle(handle);
                    try { localStorage.setItem('editor:lastLocalFolderName', String(handle.name || 'local')); } catch {}
                    setLocalFolderName(String(handle.name || 'local'));
                    setProjectBase('');
                    setLocalFiles(map);
                    try { (window as any).__LOCAL_FILES__ = map; } catch {}
                    vfs.setBackend('folder', { files: map });
                    (vfs as any).setFsDirectoryHandle?.(handle);
                    vfs.setProjectBase('');
                    const list = (await vfs.listSceneMetas()).map(mm => ({ path: mm.path, mtime: mm.mtime }));
                    setScenes(list);
                    setError(null);
                    try { const dbg = localStorage.getItem('DEBUG_FSA')==='1'; if (dbg) console.info('[FSA] Reopened last handle, scenes:', list.map(x=>x.path)); } catch {}
                  } catch (e) { try { const dbg = localStorage.getItem('DEBUG_FSA')==='1'; if (dbg) console.warn('[FSA] Quick reopen failed, fallback to picker', e); } catch {} chooseLocalFolder(); }
                }} title="打开上次的本地工程">↺ 重新打开上次工程</button>
              )}
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
              {!loading && (
                <>
                  <div className="ph-subtitle">全部场景</div>
                  {scenes.map(s => (
                    <div key={s.path} className="ph-scene-row" onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, path: s.path }); }}>
                      <button className="ph-scene" onClick={() => openScene(s.path)}>
                        <div className="ph-scene-name">{s.path.replace(/^scene\//,'')}</div>
                        <div className="ph-scene-path">{s.path} {typeof s.mtime === 'number' ? `· 最后修改：${new Date(s.mtime).toLocaleString()}` : ''}</div>
                      </button>
                    </div>
                  ))}
                  {scenes.length === 0 && <div className="ph-dim">无可用场景</div>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {ctxMenu && (
        <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: '#fff', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: 160 }} onClick={(e)=>e.stopPropagation()}>
          <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { const p = prompt('复制为（scene/xxx.json）', `scene/${ctxMenu.path.replace(/^scene\//,'').replace(/\.json$/,'')}-copy.json`); if (p && p.trim()) copySceneAs(ctxMenu.path, (p||'').trim()); setCtxMenu(null);} }>复制</button>
          <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { const base = ctxMenu.path.replace(/^scene\//,''); const oldName = base.includes('/') ? base.slice(base.lastIndexOf('/')+1) : base; const p = prompt('重命名文件名（不含路径）', oldName); if (p && p.trim()) { renameScene(ctxMenu.path, (p||'').trim()); } setCtxMenu(null);} }>修改名</button>
          <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent', color:'#c00' }} onClick={async () => { if (confirm('删除该场景？')) { try { await vfs.deleteScene(ctxMenu.path); } catch {} await refreshScenes(); setCtxMenu(null); } }}>删除</button>
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
