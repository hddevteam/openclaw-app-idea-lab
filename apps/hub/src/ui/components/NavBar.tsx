import React, { useState } from 'react';
import { Sparkles, MessageSquare, History, FilterX, Settings2, Loader2, X } from 'lucide-react';
import { clsx } from 'clsx';

interface NavBarProps {
  activeTab: 'hub' | 'lab';
  onTabChange: (tab: 'hub' | 'lab') => void;
  onFeedbackClick: () => void;
  entriesCount: number;
  
  // Lab Specific Props
  labProps?: {
    onGenerate: (prefs: any) => void;
    onRunResearch: () => void;
    onViewChange: (view: 'backlog' | 'filtered' | 'built') => void;
    activeView: 'backlog' | 'filtered' | 'built';
    isGenerating: boolean;
    isResearching: boolean;
    backlogCount: number;
    builtCount: number;
  };
}

export const NavBar: React.FC<NavBarProps> = ({ 
  activeTab, 
  onTabChange, 
  onFeedbackClick, 
  entriesCount, 
  labProps 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [prefs, setPrefs] = useState({
    themes: ['ai', 'system', 'network'],
    form: 'tool',
    strictness: 0.78
  });

  const handleToggleTheme = (theme: string) => {
    setPrefs(p => ({
      ...p,
      themes: p.themes.includes(theme) 
        ? p.themes.filter(t => t !== theme) 
        : [...p.themes, theme]
    }));
  };

  return (
    <nav className="sticky top-4 sm:top-6 mx-auto w-[95%] max-w-[1200px] z-[2000] mb-8 sm:mb-12 space-y-2">
      <div className="rounded-[24px] shadow-2xl overflow-hidden bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl border border-[#e5e5e7] dark:border-[#2d2d2f]">
        {/* Row 1: Brand & Main Navigation */}
        <div className="px-3 sm:px-5 py-2 sm:py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div 
              className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg cursor-pointer transition-transform active:scale-90 shrink-0" 
              onClick={() => onTabChange('hub')}
            >
              <Sparkles size={20} />
            </div>
            <div className="flex flex-col justify-center min-w-0 bg-[#f5f5f7] dark:bg-[#2d2d2f] px-2.5 py-1.5 rounded-xl border border-[#e5e5e7] dark:border-[#3d3d3f]">
              <h1 className="text-sm font-black tracking-tight text-[#111] dark:text-[#f5f5f7] leading-none uppercase">Daily App Lab</h1>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-[0.15em] leading-none mt-1">
                {activeTab === 'hub' ? 'Center' : 'Engine'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3 flex-1 justify-center max-w-md">
            <div className="flex bg-[#f5f5f7] dark:bg-[#2d2d2f] p-1 rounded-xl w-full">
              <button 
                onClick={() => onTabChange('hub')}
                className={clsx(
                  "flex-1 px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap",
                  activeTab === 'hub' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-400"
                )}
              >
                App Hub
              </button>
              <button 
                onClick={() => onTabChange('lab')}
                className={clsx(
                  "flex-1 px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap",
                  activeTab === 'lab' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-orange-600 dark:text-orange-400" : "text-gray-400"
                )}
              >
                Idea Lab
              </button>
            </div>
          </div>

          <div className="hidden sm:flex items-center shrink-0">
            <button 
              onClick={onFeedbackClick}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#f5f5f7] dark:bg-[#2d2d2f] hover:bg-[#e5e5e7] dark:hover:bg-[#3d3d3f] text-[#111] dark:text-white text-[10px] sm:text-[11px] font-bold active:scale-95 transition-all"
            >
              <MessageSquare size={14} />
              <span className="hidden xl:inline">Feedback</span>
            </button>
          </div>
        </div>

        {/* Row 2: Lab Specific Filters & Actions */}
        {activeTab === 'lab' && labProps && (
          <div className="px-3 sm:px-5 py-2 sm:py-2.5 border-t border-[#f5f5f7] dark:border-[#2d2d2f] flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex items-center gap-1 bg-[#f5f5f7] dark:bg-[#151517] p-1 rounded-xl overflow-x-auto no-scrollbar max-w-[50%] sm:max-w-none">
              <button 
                onClick={() => labProps.onViewChange('backlog')}
                className={clsx(
                  "flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap",
                  labProps.activeView === 'backlog' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-400"
                )}
              >
                <History size={14} />
                <span>Backlog ({labProps.backlogCount})</span>
              </button>
              <button 
                onClick={() => labProps.onViewChange('filtered')}
                className={clsx(
                  "flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap",
                  labProps.activeView === 'filtered' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-orange-600 dark:text-orange-400" : "text-gray-400"
                )}
              >
                <FilterX size={14} />
                <span>Filtered</span>
              </button>
              <button 
                onClick={() => labProps.onViewChange('built')}
                className={clsx(
                  "flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap",
                  labProps.activeView === 'built' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-green-600 dark:text-green-400" : "text-gray-400"
                )}
              >
                <Sparkles size={14} />
                <span>Built ({labProps.builtCount})</span>
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button 
                onClick={labProps.onRunResearch}
                disabled={labProps.isResearching || labProps.isGenerating}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] sm:text-[11px] font-bold active:scale-95 transition-all disabled:opacity-50"
              >
                {labProps.isResearching ? <Loader2 size={16} className="animate-spin" /> : <History size={14} className="sm:size-4 rotate-180" />}
                <span className="hidden sm:inline">Research</span>
              </button>

              <button 
                onClick={() => labProps.onGenerate(prefs)}
                disabled={labProps.isGenerating || labProps.isResearching}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white text-[10px] sm:text-[11px] font-bold shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
              >
                {labProps.isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={14} className="sm:size-4" />}
                <span className="hidden sm:inline">Generate New</span>
              </button>

              <div className="h-6 w-[1px] bg-gray-200 dark:bg-gray-800 mx-1" />

              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                  "p-2 rounded-xl transition-colors",
                  isExpanded ? "bg-gray-100 dark:bg-gray-800 text-blue-600" : "hover:bg-[#f5f5f7] dark:hover:bg-[#2d2d2f] text-gray-400"
                )}
              >
                <Settings2 size={18} />
              </button>
              
              <button 
                onClick={onFeedbackClick}
                className="sm:hidden p-2 rounded-xl bg-[#f5f5f7] dark:bg-[#2d2d2f] text-gray-400"
              >
                <MessageSquare size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Expanded Settings */}
        {activeTab === 'lab' && isExpanded && (
          <div className="px-4 sm:px-8 py-4 sm:py-6 border-t border-[#f5f5f7] dark:border-[#2d2d2f] bg-[#fafafa] dark:bg-[#151517] flex flex-wrap gap-6 sm:gap-12 animate-in slide-in-from-top duration-300">
            <div className="space-y-3 min-w-0 flex-1 sm:flex-none">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Themes</label>
              <div className="flex flex-wrap gap-2 sm:gap-2.5">
                {['ai', 'system', 'network', 'game', 'productivity'].map(t => (
                  <button
                    key={t}
                    onClick={() => handleToggleTheme(t)}
                    className={clsx(
                      "px-3 sm:px-4 py-1.5 rounded-lg border text-[10px] sm:text-xs font-bold capitalize transition-all",
                      prefs.themes.includes(t) 
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400" 
                        : "border-[#e5e5e7] dark:border-[#2d2d2f] text-gray-400"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Form</label>
              <select 
                value={prefs.form}
                onChange={e => setPrefs(p => ({ ...p, form: e.target.value }))}
                className="block min-w-[120px] px-4 py-2 rounded-lg border border-[#e5e5e7] dark:border-[#2d2d2f] bg-white dark:bg-[#1c1c1e] text-xs font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
              >
                <option value="tool">Tool</option>
                <option value="viz">Visualization</option>
                <option value="mini-app">Mini-app</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Similarity Strictness</label>
              <div className="flex items-center gap-4">
                <input 
                  type="range" min="0.5" max="0.9" step="0.01"
                  value={prefs.strictness}
                  onChange={e => setPrefs(p => ({ ...p, strictness: parseFloat(e.target.value) }))}
                  className="w-40 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-xs font-mono font-bold text-blue-600">{prefs.strictness.toFixed(2)}</span>
              </div>
            </div>
            
            <button onClick={() => setIsExpanded(false)} className="ml-auto p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
