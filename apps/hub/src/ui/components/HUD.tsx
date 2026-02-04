import React, { useState } from 'react';
import { Sparkles, History, FilterX, Settings2, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface HUDProps {
  onGenerate: (prefs: any) => void;
  onViewChange: (view: 'backlog' | 'filtered') => void;
  activeView: 'backlog' | 'filtered';
  isGenerating: boolean;
  backlogCount: number;
}

export const HUD: React.FC<HUDProps> = ({ 
  onGenerate, 
  onViewChange, 
  activeView, 
  isGenerating,
  backlogCount 
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
    <div className="sticky top-6 mx-auto w-full z-[1000] mb-8">
      <div className="bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl rounded-[24px] shadow-2xl overflow-hidden border border-[#e5e5e7] dark:border-[#2d2d2f]">
        {/* Main Bar */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex bg-[#f5f5f7] dark:bg-[#2d2d2f] p-1 rounded-xl">
              <button 
                onClick={() => onViewChange('backlog')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  activeView === 'backlog' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500"
                )}
              >
                <History size={14} />
                <span>Backlog ({backlogCount})</span>
              </button>
              <button 
                onClick={() => onViewChange('filtered')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  activeView === 'filtered' ? "bg-white dark:bg-[#1c1c1e] shadow-sm text-orange-600 dark:text-orange-400" : "text-gray-500"
                )}
              >
                <FilterX size={14} />
                <span>Filtered</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => onGenerate(prefs)}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              <span>{isGenerating ? 'Generating...' : 'Generate New'}</span>
            </button>

            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2.5 rounded-xl hover:bg-[#f5f5f7] dark:hover:bg-[#2d2d2f] text-gray-400 transition-colors"
            >
              <Settings2 size={20} />
            </button>
          </div>
        </div>

        {/* Expanded Settings */}
        {isExpanded && (
          <div className="px-8 py-6 border-t border-[#f5f5f7] dark:border-[#2d2d2f] bg-[#fafafa] dark:bg-[#151517] flex flex-wrap gap-12 animate-in slide-in-from-top duration-300">
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Themes</label>
              <div className="flex gap-2.5">
                {['ai', 'system', 'network', 'game', 'productivity'].map(t => (
                  <button
                    key={t}
                    onClick={() => handleToggleTheme(t)}
                    className={clsx(
                      "px-4 py-1.5 rounded-lg border text-xs font-bold capitalize transition-all",
                      prefs.themes.includes(t) 
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400" 
                        : "border-[#e5e5e7] dark:border-[#2d2d2f] text-gray-500"
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
          </div>
        )}
      </div>
    </div>
  );
};
