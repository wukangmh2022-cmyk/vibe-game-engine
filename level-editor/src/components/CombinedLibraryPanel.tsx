import React, { useState } from 'react';
import './CombinedLibraryPanel.css';
import { GameProject } from '../types';
import { VariableSwitchManager } from './VariableSwitchManager';
import { ResourceListPanel } from './ResourceListPanel';

interface CombinedLibraryPanelProps {
  project?: GameProject | null;
  currentLevel?: any;
  onAddLevelResource?: (rid: string) => void;
  onRemoveLevelResource?: (rid: string) => void;
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
  onVariableChange,
  onSwitchChange,
  onVariableAdd,
  onSwitchAdd,
  onVariableDelete,
  onSwitchDelete,
}) => {
  const [tab, setTab] = useState<'resources' | 'variables' | 'switches'>('resources');

  return (
    <div className="combined-lib">
      <div className="lib-tabs">
        <button className={`lib-tab ${tab === 'resources' ? 'active' : ''}`} onClick={() => setTab('resources')}>🗂️ 资源</button>
        <button className={`lib-tab ${tab === 'variables' ? 'active' : ''}`} onClick={() => setTab('variables')}>📊 变量和开关</button>
        {/* <button className={`lib-tab ${tab === 'switches' ? 'active' : ''}`} onClick={() => setTab('switches')}>🔘 开关</button> */}
      </div>
      <div className="lib-body">
        <div className="lib-scroll">
          {tab === 'resources' && (
            <div className="res-compact">
              <ResourceListPanel project={project as any} />
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
    </div>
  );
};

export default CombinedLibraryPanel;
