import React, { useRef } from 'react';
import { LevelConfig } from '../types';
import './TopStatusBar.css';

interface TopStatusBarProps {
  currentLevel: LevelConfig;
  levels: LevelConfig[];
  onLevelChange: (levelId: string) => void;
  onLevelUpdate: (levelId: string, updates: Partial<LevelConfig>) => void; // 新增：关卡更新
  onCreateLevel?: () => void; // 新增：创建关卡
  onDeleteLevel?: (levelId: string) => void; // 新增：删除关卡
  onLoadTestData?: () => void; // 可选：加载测试数据
  onLoadJson: (gameData: any) => void;
  onSaveJson: () => void;
  isPlaying: boolean;
  onPlayToggle: (playing: boolean) => void;
  onShowBlueprint?: () => void; // 新增：显示蓝图
  onExitToHome?: () => void; // 新增：返回初始页
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  currentLevel,
  levels,
  onLevelChange,
  onLevelUpdate, // 新增参数
  onCreateLevel,
  onDeleteLevel,
  onLoadJson,
  onSaveJson,
  isPlaying,
  onPlayToggle,
  onLoadTestData,
  onShowBlueprint, // 新增参数
  onExitToHome
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const gameData = JSON.parse(e.target?.result as string);
          onLoadJson(gameData);
        } catch (error) {
          alert('JSON文件格式错误');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  // 画布宽高处理函数
  const handleCanvasWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const width = parseInt(e.target.value) || 800;
    onLevelUpdate(currentLevel.id, { canvasWidth: width });
  };

  const handleCanvasWidthBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const width = parseInt(e.target.value) || 800;
    onLevelUpdate(currentLevel.id, { canvasWidth: width });
  };

  const handleCanvasHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const height = parseInt(e.target.value) || 600;
    onLevelUpdate(currentLevel.id, { canvasHeight: height });
  };

  const handleCanvasHeightBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const height = parseInt(e.target.value) || 600;
    onLevelUpdate(currentLevel.id, { canvasHeight: height });
  };

  // 处理回车键确认
  const handleCanvasWidthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const width = parseInt((e.target as HTMLInputElement).value) || 800;
      onLevelUpdate(currentLevel.id, { canvasWidth: width });
    }
  };

  const handleCanvasHeightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const height = parseInt((e.target as HTMLInputElement).value) || 600;
      onLevelUpdate(currentLevel.id, { canvasHeight: height });
    }
  };

  return (
    <div className="top-status-bar">
      <div className="status-left">
        {onExitToHome && (
          <button className="load-button" onClick={onExitToHome}>
            ⬅️ 返回初始页
          </button>
        )}
        <div className="level-selector">
          <label>当前关卡:</label>
          <select 
            value={currentLevel.id} 
            onChange={(e) => onLevelChange(e.target.value)}
          >
            {levels.map(level => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
          <button
            title="AI生成"
            style={{ marginLeft: 6 }}
            onClick={() => {
              // DJXTODO: 触发 AI 生成逻辑
            }}
          >
            AI生成🌟
          </button>
          {onCreateLevel && (
            <button style={{ marginLeft: 6 }} onClick={onCreateLevel}>＋ 新建关卡</button>
          )}
          {onDeleteLevel && (
            <button style={{ marginLeft: 6 }} onClick={() => onDeleteLevel(currentLevel.id)}>🗑️ 删除关卡</button>
          )}
        </div>
        
        
        
        <div className="canvas-settings">
          <label>画布设置:</label>
          <div className="canvas-size-inputs">
            <div className="size-input">
              <span>宽度:</span>
              <input
                type="number"
                min="200"
                max="1920"
                value={currentLevel.canvasWidth || 800}
                onChange={handleCanvasWidthChange}
                onBlur={handleCanvasWidthBlur}
                onKeyDown={handleCanvasWidthKeyDown}
                disabled={isPlaying}
              />
            </div>
            <div className="size-input">
              <span>高度:</span>
              <input
                type="number"
                min="200"
                max="1080"
                value={currentLevel.canvasHeight || 600}
                onChange={handleCanvasHeightChange}
                onBlur={handleCanvasHeightBlur}
                onKeyDown={handleCanvasHeightKeyDown}
                disabled={isPlaying}
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="status-center">
        <h2>开发·编辑平台</h2>
      </div>
      
      <div className="status-right">
        <button 
          className={`play-button ${isPlaying ? 'playing' : ''}`}
          onClick={() => onPlayToggle(!isPlaying)}
        >
          {isPlaying ? '⏸️ 终止' : '▶️ 播放'}
        </button>
        
        {onShowBlueprint && (
          <button className="blueprint-button" onClick={onShowBlueprint}>
            📊 流程导图
          </button>
        )}
        
        <button className="save-button" onClick={onSaveJson}>
          💾 保存关卡
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileLoad}
        />
      </div>
    </div>
  );
};
