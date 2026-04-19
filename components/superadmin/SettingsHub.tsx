
import React, { useState } from 'react';
import { SecurityHub } from './SecurityHub';
import { DataExportHub } from './DataExportHub';
import { DataImportHub } from './DataImportHub';
import { SystemConfigHub } from './SystemConfigHub';
import { resumeAudioContext } from '../../lib/audio';

type SettingsSubTab = 'security' | 'system' | 'export' | 'import';

interface SettingsHubProps {
  onRefresh?: (quiet?: boolean) => void;
}

export const SettingsHub: React.FC<SettingsHubProps> = ({ onRefresh }) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('security');

  const handleTabChange = (tab: SettingsSubTab) => {
    resumeAudioContext();
    setActiveSubTab(tab);
  };

  return (
    <div className="space-y-4 sm:space-y-7 animate-in fade-in duration-700 max-w-5xl mx-auto px-2">
      <div className="flex justify-center">
        <div className="bg-slate-100 p-1 rounded-[14px] sm:rounded-[18px] flex items-center border border-slate-200/60 shadow-inner w-full max-w-xl overflow-x-auto no-scrollbar">
          <button
            onClick={() => handleTabChange('security')}
            className={`flex-1 min-w-[80px] sm:min-w-[100px] py-2.5 sm:py-3 px-2 sm:px-4 rounded-[12px] sm:rounded-[18px] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'security' ? 'bg-white text-slate-900 shadow-sm border border-slate-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            🛡️ Auth
          </button>
          <button
            onClick={() => handleTabChange('system')}
            className={`flex-1 min-w-[80px] sm:min-w-[100px] py-2.5 sm:py-3 px-2 sm:px-4 rounded-[12px] sm:rounded-[18px] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'system' ? 'bg-white text-slate-900 shadow-sm border border-slate-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            ⚙️ System
          </button>
          <button
            onClick={() => handleTabChange('export')}
            className={`flex-1 min-w-[80px] sm:min-w-[100px] py-2.5 sm:py-3 px-2 sm:px-4 rounded-[12px] sm:rounded-[18px] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'export' ? 'bg-white text-slate-900 shadow-sm border border-slate-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            📤 Export
          </button>
          <button
            onClick={() => handleTabChange('import')}
            className={`flex-1 min-w-[80px] sm:min-w-[100px] py-2.5 sm:py-3 px-2 sm:px-4 rounded-[12px] sm:rounded-[18px] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'import' ? 'bg-white text-slate-900 shadow-sm border border-slate-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            📥 Import
          </button>
        </div>
      </div>

      <div className="animate-in slide-in-from-bottom-4 duration-500">
        {activeSubTab === 'security' && <SecurityHub />}
        {activeSubTab === 'system' && <SystemConfigHub onRefresh={onRefresh} />}
        {activeSubTab === 'export' && <DataExportHub />}
        {activeSubTab === 'import' && <DataImportHub />}
      </div>
    </div>
  );
};
