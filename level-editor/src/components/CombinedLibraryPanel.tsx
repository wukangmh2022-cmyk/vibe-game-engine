import React, { useState, useEffect } from 'react';
import './CombinedLibraryPanel.css';
import { GameProject } from '../types';
import { VariableSwitchManager } from './VariableSwitchManager';
import vfs from '../utils/vfs';
import { isFsaSupported, loadLastHandle, verifyPermission, buildFileMapFromHandle } from '../utils/fsAccess';

interface CombinedLibraryPanelProps {
  project?: GameProject | null;
  currentLevel?: any;
  onAddLevelResource?: (rid: string) => void;
  onRemoveLevelResource?: (rid: string) => void;
  onQuickAddResourceFromPath?: (relPath: string) => void;
  onRemoveProjectResource?: (rid: string) => void;
  onVariableChange: (key: string, value: any) => void;
  onSwitchChange: (key: string, value: boolean) => void;
  onVariableAdd: (key: string, value: any) => void;
  onSwitchAdd: (key: string, value: boolean) => void;
  onVariableDelete: (key: string) => void;
  onSwitchDelete: (key: string) => void;
}

export const CombinedLibraryPanel: React.FC<CombinedLibraryPanelProps> = ({
  project,
  // reverted UI: keep API but unused for now
  currentLevel,
  onAddLevelResource,
  onRemoveLevelResource,
  onQuickAddResourceFromPath,
  onRemoveProjectResource,
  onVariableChange,
  onSwitchChange,
  onVariableAdd,
  onSwitchAdd,
  onVariableDelete,
  onSwitchDelete,
}) => {
  const [tab, setTab] = useState<'project' | 'scene' | 'variables'>('project');
  const [preview, setPreview] = useState<{ url: string; name?: string } | null>(null);

  // -------- Project (disk) resources tree --------
  type FileNode = { kind: 'file'; path: string; name: string; type: 'image'|'audio'|'video'|'animation' };
  type DirNode = { kind: 'dir'; path: string; name: string; children: Array<DirNode|FileNode> };
  type RootKey = 'images'|'audios'|'videos'|'animations';
  type RootNode = { root: RootKey; label: string; tree: DirNode };
  const [roots, setRoots] = useState<RootNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (p: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const fileTypeFromPath = (p: string): FileNode['type'] | null => {
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(p)) return 'image';
    if (/\.(mp3|wav|ogg|m4a)$/i.test(p)) return 'audio';
    if (/\.(mp4|webm|mov)$/i.test(p)) return 'video';
    if (/\.(json)$/i.test(p)) return 'animation';
    return null;
  };

  const buildTree = async (root: RootKey, candidateDirs: string[]): Promise<RootNode | null> => {
    const toDirNode = async (dir: string): Promise<DirNode> => {
      const entries = await vfs.readdir(dir);
      const dirs: DirNode[] = [];
      const files: FileNode[] = [];
      for (const e of entries) {
        if (e.type === 'directory') {
          dirs.push(await toDirNode(e.path));
        } else {
          const t = fileTypeFromPath(e.path);
          // Only include files appropriate under each root
          const ok = (root === 'images' && t === 'image') || (root === 'audios' && t === 'audio') || (root === 'videos' && t === 'video') || (root === 'animations' && t === 'animation');
          if (ok) files.push({ kind: 'file', path: e.path, name: e.name, type: t! });
        }
      }
      // Sort: dirs first by name, then files by name
      dirs.sort((a,b)=>a.name.localeCompare(b.name));
      files.sort((a,b)=>a.name.localeCompare(b.name));
      return { kind: 'dir', path: dir, name: dir.split('/').pop() || dir, children: [...dirs, ...files] };
    };
    // Build from multiple directories and merge children at a synthetic root
    const children: Array<DirNode|FileNode> = [];
    for (const dir of candidateDirs) {
      try {
        const node = await toDirNode(dir);
        if (node.children.length > 0) children.push(...node.children);
      } catch {}
    }
    if (children.length === 0) return null;
    const tree: DirNode = { kind: 'dir', path: root, name: root, children };
    const label = (root === 'audios') ? 'audio' : (root === 'videos') ? 'video' : (root === 'animations') ? 'animation' : 'images';
    return { root, label, tree };
  };

  const refreshDiskTree = async () => {
    try {
      // If running in local folder mode with FSA, resync the in-memory file map from disk
      try {
        const getBackend = (vfs as any)?.getBackend?.bind(vfs);
        if (getBackend && getBackend() === 'folder' && isFsaSupported()) {
          const handle = await loadLastHandle();
          if (handle && await verifyPermission(handle, 'read')) {
            const map = await buildFileMapFromHandle(handle);
            try { (window as any).__LOCAL_FILES__ = map; } catch {}
            try { vfs.setBackend('folder', { files: map }); } catch {}
            try { (vfs as any).setFsDirectoryHandle?.(handle); } catch {}
          }
        }
      } catch {}
      const items: RootNode[] = [];
      const specs: Array<{ key: RootKey; dirs: string[] }> = [
        { key: 'images', dirs: ['images','image'] },
        { key: 'audios', dirs: ['audios','audio'] },
        { key: 'videos', dirs: ['videos','video'] },
        { key: 'animations', dirs: ['animations','animation'] },
      ];
      for (const s of specs) {
        const node = await buildTree(s.key, s.dirs);
        if (node) items.push(node);
      }
      setRoots(items);
      // Preserve expanded folders across refresh; drop ones that no longer exist
      try {
        const valid = new Set<string>();
        const collect = (node: DirNode) => {
          valid.add(node.path);
          node.children.forEach((ch: any) => { if (ch && ch.kind === 'dir') collect(ch as DirNode); });
        };
        items.forEach(rt => collect(rt.tree));
        setExpanded(prev => {
          const next = new Set<string>();
          prev.forEach(k => { if (valid.has(k)) next.add(k); });
          return next;
        });
      } catch {}
    } catch { setRoots([]); }
  };

  // -------- Scene referenced resources (computed from commands/events) --------
  const computeSceneResourceIds = (): string[] => {
    try {
      const ids = new Set<string>();
      const all = project?.resources || [];
      const idSet = new Set(all.map(r => r.id));
      const byPath = new Map<string, string>(); // path/src -> id
      all.forEach((r: any) => { const p = String((r as any).path || r.src || '').replace(/^\.\//,''); if (p) byPath.set(p, r.id); });

      const visit = (x: any) => {
        if (!x) return;
        if (Array.isArray(x)) { x.forEach(visit); return; }
        if (typeof x === 'object') { for (const k in x) visit((x as any)[k]); return; }
        if (typeof x === 'string') {
          const s = x;
          if (idSet.has(s)) { ids.add(s); return; }
          // path-like → map back to id if known
          const rel = s.replace(/^\.\//,'');
          // Only consider typical resource folders to avoid false positives
          if (/^(images|audios|audio|videos|animations)\//.test(rel)) {
            const id = byPath.get(rel) || byPath.get(rel.replace(/^audio\//,'audios/'));
            if (id) ids.add(id);
          }
        }
      };
      const lv: any = currentLevel || {};
      if (Array.isArray(lv.rawCommands)) visit(lv.rawCommands);
      const evs = Array.isArray(lv.events) ? lv.events : [];
      evs.forEach((e: any) => { if (Array.isArray(e?.commands)) visit(e.commands); });
      return Array.from(ids);
    } catch { return []; }
  };

  useEffect(() => { if (tab === 'project') refreshDiskTree(); }, [tab]);
  // Auto refresh while on Project tab (light polling with FSA resync)
  useEffect(() => {
    if (tab !== 'project') return;
    let disposed = false;
    let running = false;
    let timer: any;
    const loop = async () => {
      if (disposed) return;
      if (!running) {
        running = true;
        try { await refreshDiskTree(); } catch {}
        running = false;
      }
      if (!disposed) timer = setTimeout(loop, 4000); // ~4s 低频刷新，减少开销
    };
    timer = setTimeout(loop, 500);
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [tab]);

  // Helper: generate resource id like App.tsx does
  const genResourceId = (baseName: string, existingIds: Set<string>): string => {
    const slug = baseName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
    let id = slug || 'res';
    if (!existingIds.has(id)) return id;
    let i = 1; while (existingIds.has(`${id}_${i}`)) i++; return `${id}_${i}`;
  };

  // Add a list of file paths into project resources and reference them in current scene
  const addFilesToScene = (paths: string[]) => {
    const used = new Set((project?.resources || []).map(r => r.id));
    for (const p of paths) {
      const fileName = p.split('/').pop() || p;
      const rid = genResourceId(fileName, used);
      used.add(rid);
      onQuickAddResourceFromPath?.(p);
      onAddLevelResource?.(rid);
    }
  };

  // Flatten a directory node to all descendant file paths
  const collectFiles = (node: DirNode | FileNode): string[] => {
    if (node.kind === 'file') return [node.path];
    const out: string[] = [];
    for (const ch of node.children) out.push(...collectFiles(ch as any));
    return out;
  };

  const ResourceThumb: React.FC<{ path: string; type: FileNode['type'] }> = ({ path, type }) => {
    const [u, setU] = useState<string | null>(null);
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const fromVfs = await vfs.getURL(path);
          if (!cancelled && fromVfs) { setU(fromVfs); return; }
          // Fallback to project base URL for non-imported assets
          const base = (vfs as any)?.getBase?.() || (window as any).__ASSET_BASE__ || '';
          const isAbs = /^(https?:|blob:|data:|file:)/.test(path) || path.startsWith('/') || path.startsWith('../');
          const joined = isAbs ? path : (base ? (base.endsWith('/') ? base + String(path).replace(/^\.\//,'') : base + '/' + String(path).replace(/^\.\//,'')) : String(path));
          if (!cancelled) setU(joined);
        } catch { if (!cancelled) setU(null); }
      })();
      return () => { cancelled = true; };
    }, [path]);
    if (type !== 'image') return <div style={{ width: 32, textAlign: 'center' }}>{type==='audio'?'🔊':type==='video'?'🎬':type==='animation'?'🎞️':'📦'}</div>;
    return (
      <div style={{ width: 40, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f7f9', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
        {u ? <img src={u} alt={path} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span>🖼️</span>}
      </div>
    );
  };

  // Resolve a resource path to previewable URL (same logic as ResourceThumb)
  const resolveURL = async (path: string): Promise<string> => {
    const fromVfs = await vfs.getURL(path).catch(() => null as any);
    if (fromVfs) return fromVfs as any;
    const base = (vfs as any)?.getBase?.() || (window as any).__ASSET_BASE__ || '';
    const isAbs = /^(https?:|blob:|data:|file:)/.test(path) || path.startsWith('/') || path.startsWith('../');
    return isAbs ? path : (base ? (base.endsWith('/') ? base + String(path).replace(/^\.\//,'') : base + '/' + String(path).replace(/^\.\//,'')) : String(path));
  };

  // Global ESC to close preview
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key || '').toLowerCase() === 'escape') setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const renderDir = (node: DirNode, rootKind: RootNode['root']) => {
    const isOpen = expanded.has(node.path);
    const filesUnder = collectFiles(node).filter(p => {
      const t = fileTypeFromPath(p);
      return (rootKind==='images'&&t==='image')||(rootKind==='audios'&&t==='audio')||(rootKind==='videos'&&t==='video')||(rootKind==='animations'&&t==='animation');
    });
    return (
      <div key={node.path}>
        <div className="lib-folder-row" style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 8px', cursor:'pointer' }} onClick={() => toggle(node.path)}>
          <span style={{ width:16 }}>{isOpen ? '▾' : '▸'}</span>
          <strong style={{ flex:1, fontSize: 12 }}>{node.name || node.path}</strong>
          {/* Folder bulk add */}
          <button className="lib-small-btn" title="添加此文件夹下所有文件到当前场景" onClick={(e) => { e.stopPropagation(); addFilesToScene(filesUnder); }}>→</button>
        </div>
        {isOpen && (
          <div style={{ marginLeft: 16 }}>
            {node.children.map(ch => ch.kind === 'dir'
              ? renderDir(ch as DirNode, rootKind)
              : (
                <div
                  key={(ch as FileNode).path}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 8px', border:'1px solid #eee', borderRadius:6, margin:'0 8px 6px 8px', background:'#fff', cursor: (ch as FileNode).type === 'image' ? 'zoom-in' : 'default' }}
                  onClick={async () => {
                    const f = ch as FileNode;
                    if (f.type !== 'image') return;
                    const url = await resolveURL(f.path);
                    setPreview({ url, name: f.name });
                  }}
                >
                  <ResourceThumb path={(ch as FileNode).path} type={(ch as FileNode).type} />
                  <div style={{ flex:1, overflow:'hidden' }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'#333', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{(ch as FileNode).name}</div>
                    <div style={{ fontSize:11, color:'#666', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{(ch as FileNode).path}</div>
                  </div>
                  <button className="lib-small-btn" onClick={(e) => { e.stopPropagation(); addFilesToScene([(ch as FileNode).path]); }} title="添加到当前场景">→</button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="combined-lib">
      <div className="lib-tabs">
        <button className={`lib-tab ${tab === 'project' ? 'active' : ''}`} onClick={() => setTab('project')}>🗂️ 项目资源</button>
        <button className={`lib-tab ${tab === 'scene' ? 'active' : ''}`} onClick={() => setTab('scene')}>🎯 场景资源</button>
        <button className={`lib-tab ${tab === 'variables' ? 'active' : ''}`} onClick={() => setTab('variables')}>📊 变量和开关</button>
        {/* <button className={`lib-tab ${tab === 'switches' ? 'active' : ''}`} onClick={() => setTab('switches')}>🔘 开关</button> */}
      </div>
      <div className="lib-body">
        <div className="lib-scroll">
          {tab === 'project' && (
            <div className="res-compact">
              <div style={{ padding: 8 }}>
                {roots.length === 0 ? (
                  <div style={{ color:'#6c757d' }}>未发现可用资源目录</div>
                ) : (
                  roots.map(rt => (
                    <div key={rt.root} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, color:'#333', padding:'4px 8px' }}>{rt.label}</div>
                      {/* Render children of the synthetic root to avoid duplicate top-level directory row */}
                      <div style={{ marginLeft: 0 }}>
                        {rt.tree.children.map(ch => ch.kind === 'dir' ? renderDir(ch as any, rt.root) : (
                          <div
                            key={(ch as FileNode).path}
                            style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 8px', border:'1px solid #eee', borderRadius:6, margin:'0 8px 6px 8px', background:'#fff', cursor: (ch as FileNode).type === 'image' ? 'zoom-in' : 'default' }}
                            onClick={async () => {
                              const f = ch as FileNode;
                              if (f.type !== 'image') return;
                              const url = await resolveURL(f.path);
                              setPreview({ url, name: f.name });
                            }}
                          >
                            <ResourceThumb path={(ch as FileNode).path} type={(ch as FileNode).type} />
                            <div style={{ flex:1, overflow:'hidden' }}>
                              <div style={{ fontSize:12, fontWeight:600, color:'#333', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{(ch as FileNode).name}</div>
                              <div style={{ fontSize:11, color:'#666', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{(ch as FileNode).path}</div>
                            </div>
                            <button className="lib-small-btn" onClick={(e) => { e.stopPropagation(); addFilesToScene([(ch as FileNode).path]); }} title="添加到当前场景">→</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {tab === 'scene' && (
            <div className="res-compact">
              <div style={{ padding: 8 }}>
                <div style={{ fontWeight: 600, margin: '4px 0' }}>已引用资源</div>
                {Array.isArray((project as any)?.resources) && (project as any).resources.length > 0 ? (
                  (project as any).resources.map((r: any) => {
                    const t = r.type || 'image';
                    const pth = (r as any).path || r.src;
                    return (
                      <div
                        key={r.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #e9ecef', borderRadius: 6, marginBottom: 6, background: '#fff', cursor: t === 'image' ? 'zoom-in' : 'default' }}
                        onClick={async () => {
                          if (t !== 'image') return;
                          const url = await resolveURL(pth);
                          setPreview({ url, name: r.name || r.id });
                        }}
                      >
                        <ResourceThumb path={pth} type={t} />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name || r.id}</div>
                          <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(r as any).path || ''}</div>
                        </div>
                        <button
                          className="lib-small-btn"
                          title="移除资源的引用（不会删除项目资源）"
                          onClick={(e) => { e.stopPropagation(); onRemoveProjectResource?.(r.id); }}
                        >−</button>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: '#6c757d', padding: 8 }}>当前场景未引用任何资源</div>
                )}
              </div>
            </div>
          )}
          {tab === 'variables' && (
            <div className="vars-compact">
              <VariableSwitchManager
                mode="variables"
                project={project as any}
                onVariableChange={onVariableChange}
                onSwitchChange={onSwitchChange}
                onVariableAdd={onVariableAdd}
                onSwitchAdd={onSwitchAdd}
                onVariableDelete={onVariableDelete}
                onSwitchDelete={onSwitchDelete}
              />
            </div>
          )}
          {tab === 'switches' && (
            <div className="vars-compact">
              <VariableSwitchManager
                mode="switches"
                project={project as any}
                onVariableChange={onVariableChange}
                onSwitchChange={onSwitchChange}
                onVariableAdd={onVariableAdd}
                onSwitchAdd={onSwitchAdd}
                onVariableDelete={onVariableDelete}
                onSwitchDelete={onSwitchDelete}
              />
            </div>
          )}
        </div>
      </div>
      {preview && (
        <div className="lib-preview-mask" onClick={() => setPreview(null)}>
          <div className="lib-preview-dialog" onClick={(e) => e.stopPropagation()}>
            <button className="lib-preview-close" onClick={() => setPreview(null)}>×</button>
            <div className="lib-preview-body">
              <img src={preview.url} alt={preview.name || ''} />
            </div>
            {preview.name && <div className="lib-preview-title">{preview.name}</div>}
            <div className="lib-preview-hint">按 Esc 关闭</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CombinedLibraryPanel;
