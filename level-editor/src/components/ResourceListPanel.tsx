import React, { useMemo, useState } from 'react';
import { GameProject } from '../types';

interface ResourceListPanelProps {
  project?: GameProject | null;
}

export const ResourceListPanel: React.FC<ResourceListPanelProps> = ({ project }) => {
  const [typeFilter, setTypeFilter] = useState<'all'|'image'|'audio'|'video'|'animation'>('all');
  const [query, setQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resources = Array.isArray(project?.resources) ? project!.resources : [];

  const filtered = useMemo(() => {
    return resources.filter(r => {
      const tOk = typeFilter === 'all' || r.type === typeFilter;
      const q = query.trim().toLowerCase();
      const qOk = q.length === 0 || (r.id?.toLowerCase?.().includes(q)) || (r.name?.toLowerCase?.().includes(q)) || (r.src?.toLowerCase?.().includes(q));
      return tOk && qOk;
    });
  }, [resources, typeFilter, query]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 8px 0 8px' }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
          <option value="all">全部类型</option>
          <option value="image">图片</option>
          <option value="audio">音频</option>
          <option value="video">视频</option>
          <option value="animation">动画</option>
        </select>
        <input
          placeholder="搜索 id / 名称 / 路径"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8, minHeight: 0 }}>
        {filtered.map(r => {
          const isImg = r.type === 'image';
          return (
            <div
              key={r.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #e9ecef', borderRadius: 6, marginBottom: 6, background: '#fff', cursor: isImg ? 'zoom-in' : 'default' }}
              onDoubleClick={() => { if (isImg && r.src) setPreviewUrl(r.src); }}
            >
              <div style={{ width: 40, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f7f9', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                {isImg ? (
                  <img src={r.src} alt={r.id} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <span>{r.type === 'audio' ? '🔊' : r.type === 'video' ? '🎬' : '📦'}</span>
                )}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name || r.id}</div>
                <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.src}</div>
              </div>
              <button onClick={() => copy(r.id)} title="复制资源ID" style={{ fontSize: 11, padding: '3px 6px' }}>复制ID</button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ color: '#6c757d', padding: 16, textAlign: 'center' }}>暂无资源</div>
        )}
      </div>
      {previewUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt="预览" style={{ maxWidth: '80vw', maxHeight: '80vh', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', borderRadius: 8, background: '#fff' }} />
        </div>
      )}
    </div>
  );
};

export default ResourceListPanel;
