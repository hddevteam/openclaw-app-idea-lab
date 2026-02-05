import React, { useState } from 'react';
import { Sparkles, MessageSquare, History, FilterX, Settings2, Loader2, X } from 'lucide-react';
import { clsx } from 'clsx';

interface LabPrefs {
  categories: string[];
  styles: string[];
  form: string;
  strictness: number;
}

interface NavBarProps {
  activeTab: 'hub' | 'lab';
  onTabChange: (tab: 'hub' | 'lab') => void;
  onFeedbackClick: () => void;
  // entriesCount is not used for now, keeping it consistent with App.tsx but prefixed with _ to satisfy lint
  _entriesCount?: number;
  
  // Lab Specific Props
  labProps?: {
    onGenerate: (prefs: LabPrefs) => void;
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
  labProps 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [prefs, setPrefs] = useState<LabPrefs>({
    categories: ['Utilities'],
    styles: ['Tactile', 'Glassmorphism'],
    form: 'ui-template',
    strictness: 0.78
  });

  const handleToggleCategory = (cat: string) => {
    setPrefs(p => ({
      ...p,
      categories: p.categories.includes(cat) 
        ? p.categories.filter(t => t !== cat) 
        : [...p.categories, cat]
    }));
  };

  const handleToggleStyle = (style: string) => {
    setPrefs(p => ({
      ...p,
      styles: p.styles.includes(style) 
        ? p.styles.filter(t => t !== style) 
        : [...p.styles, style]
    }));
  };

  const CATEGORIES = ['Utilities', 'Productivity', 'Finance', 'Health', 'Design', 'Photo & Video', 'Games', 'Education'];
  const STYLES = ['Tactile', 'Glassmorphism', 'Neumorphism', 'Bento Box', 'Cyberpunk', 'Gamified', 'Physics', '3D Parallax'];

  return (
    <nav className="sticky top-2 sm:top-4 mx-auto w-[98%] max-w-[1000px] z-[2000] mb-4 sm:mb-8 space-y-1">
      <div className="rounded-[20px] shadow-xl overflow-hidden bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl border border-[#e5e5e7] dark:border-[#2d2d2f]">
        {/* Row 1: Brand & Main Navigation */}
        <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div 
              className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg cursor-pointer transition-transform active:scale-90 shrink-0" 
              onClick={() => onTabChange('hub')}
            >
              <Sparkles size={16} />
            </div>
            <div className="flex flex-col justify-center min-w-0 bg-[#f5f5f7] dark:bg-[#2d2d2f] px-2 py-1 rounded-lg border border-[#e5e5e7] dark:border-[#3d3d3f]">
              <h1 className="text-[11px] font-black tracking-tight text-[#111] dark:text-[#f5f5f7] leading-none uppercase">Daily App Lab</h1>
              <p className="text-[8px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-[0.1em] leading-none mt-0.5">
                {activeTab === 'hub' ? 'Center' : 'Engine'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-center max-w-sm">
            <div className="flex bg-[#f5f5f7] dark:bg-[#2d2d2f] p-0.5 rounded-lg w-full">
              <button 
                onClick={() => onTabChange('hub')}
                className={clsx(
                  "flex-1 px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap",
                  activeTab === 'hub' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-400"
                )}
              >
                App Hub
              </button>
              <button 
                onClick={() => onTabChange('lab')}
                className={clsx(
                  "flex-1 px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap",
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#f5f5f7] dark:bg-[#2d2d2f] hover:bg-[#e5e5e7] dark:hover:bg-[#3d3d3f] text-[#111] dark:text-white text-[10px] sm:text-[11px] font-bold active:scale-95 transition-all"
            >
              <MessageSquare size={13} />
              <span className="hidden lg:inline">Feedback</span>
            </button>
          </div>
        </div>

        {/* Row 2: Lab Specific Filters & Actions */}
        {activeTab === 'lab' && labProps && (
          <div className="px-2 sm:px-4 py-1.5 sm:py-2 border-t border-[#f5f5f7] dark:border-[#2d2d2f] flex items-center justify-between gap-1 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex items-center gap-0.5 bg-[#f5f5f7] dark:bg-[#151517] p-0.5 rounded-lg sm:flex-none flex-1 min-w-0">
              <button 
                onClick={() => labProps.onViewChange('backlog')}
                className={clsx(
                  "flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1 rounded-md text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap relative min-w-0",
                  labProps.activeView === 'backlog' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-400"
                )}
              >
                <History size={13} className="shrink-0" />
                <span className="truncate max-w-[42px] sm:max-w-none">Backlog</span>
                {labProps.backlogCount > 0 && (
                  <span className="absolute -top-1 -right-0.5 min-w-[14px] h-3.5 px-1 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center font-black border border-[#f5f5f7] dark:border-[#151517]">
                    {labProps.backlogCount}
                  </span>
                )}
              </button>
              <button 
                onClick={() => labProps.onViewChange('filtered')}
                className={clsx(
                  "flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1 rounded-md text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap relative min-w-0",
                  labProps.activeView === 'filtered' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-orange-600 dark:text-orange-400" : "text-gray-400"
                )}
              >
                <FilterX size={13} className="shrink-0" />
                <span className="truncate max-w-[42px] sm:max-w-none">Filtered</span>
              </button>
              <button 
                onClick={() => labProps.onViewChange('built')}
                className={clsx(
                  "flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1 rounded-md text-[10px] sm:text-[11px] font-bold transition-all whitespace-nowrap relative min-w-0",
                  labProps.activeView === 'built' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-green-600 dark:text-green-400" : "text-gray-400"
                )}
              >
                <Sparkles size={13} className="shrink-0" />
                <span className="truncate max-w-[42px] sm:max-w-none">Built</span>
                {labProps.builtCount > 0 && (
                  <span className="absolute -top-1 -right-0.5 min-w-[14px] h-3.5 px-1 bg-green-500 text-white text-[8px] rounded-full flex items-center justify-center font-black border border-[#f5f5f7] dark:border-[#151517]">
                    {labProps.builtCount}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
              <button 
                onClick={labProps.backlogCount === 0 ? labProps.onRunResearch : () => labProps.onGenerate(prefs)}
                disabled={labProps.isResearching || labProps.isGenerating}
                className={clsx(
                  "flex items-center justify-center h-8 px-3 rounded-lg font-bold text-[10px] sm:text-[11px] active:scale-95 transition-all disabled:opacity-50 shadow-md",
                  labProps.isResearching || labProps.isGenerating ? "bg-gray-100 dark:bg-gray-800 text-gray-400" :
                  labProps.backlogCount === 0 ? "bg-blue-600 text-white shadow-blue-500/20" : "bg-orange-600 text-white shadow-orange-500/20"
                )}
              >
                {labProps.isResearching || labProps.isGenerating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : labProps.backlogCount === 0 ? (
                  <History size={13} className="rotate-180" />
                ) : (
                  <Sparkles size={13} />
                )}
                <span className="ml-1.5 whitespace-nowrap">
                  {labProps.isResearching ? 'Researching...' : 
                   labProps.isGenerating ? 'Building...' :
                   labProps.backlogCount === 0 ? 'Research' : 'Generate'}
                </span>
              </button>

              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                  "p-1.5 rounded-lg transition-colors shrink-0",
                  isExpanded ? "bg-gray-100 dark:bg-gray-800 text-blue-600" : "hover:bg-[#f5f5f7] dark:hover:bg-[#2d2d2f] text-gray-400"
                )}
              >
                <Settings2 size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Expanded Settings */}
        {activeTab === 'lab' && isExpanded && (
          <div className="px-4 sm:px-8 py-4 sm:py-6 border-t border-[#f5f5f7] dark:border-[#2d2d2f] bg-[#fafafa] dark:bg-[#151517] space-y-6 animate-in slide-in-from-top duration-300">
            <div className="flex flex-wrap gap-6 sm:gap-12">
              <div className="space-y-3 min-w-0 flex-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Categories (Apple App Store)</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      onClick={() => handleToggleCategory(c)}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all",
                        prefs.categories.includes(c) 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20" 
                          : "border-[#e5e5e7] dark:border-[#2d2d2f] text-gray-400 hover:border-gray-400"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Product Form</label>
                <select 
                  value={prefs.form}
                  onChange={e => setPrefs(p => ({ ...p, form: e.target.value }))}
                  className="block min-w-[140px] px-4 py-2 rounded-lg border border-[#e5e5e7] dark:border-[#2d2d2f] bg-white dark:bg-[#1c1c1e] text-xs font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none shadow-sm"
                >
                  <option value="ui-template">UI Template (Interaction)</option>
                  <option value="tool">Micro Tool</option>
                  <option value="component">Component Prototype</option>
                  <option value="simulator">Simulation/Viz</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 sm:gap-12 pt-2">
              <div className="space-y-3 min-w-0 flex-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vibes & Effects (Tactile First)</label>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map(s => (
                    <button
                      key={s}
                      onClick={() => handleToggleStyle(s)}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all",
                        prefs.styles.includes(s) 
                          ? "bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/20" 
                          : "border-[#e5e5e7] dark:border-[#2d2d2f] text-gray-400 hover:border-gray-400"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Similarity Strictness</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" min="0.5" max="0.9" step="0.01"
                    value={prefs.strictness}
                    onChange={e => setPrefs(p => ({ ...p, strictness: parseFloat(e.target.value) }))}
                    className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-xs font-mono font-bold text-blue-600 w-8">{prefs.strictness.toFixed(2)}</span>
                </div>
              </div>

              <button onClick={() => setIsExpanded(false)} className="self-end p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
