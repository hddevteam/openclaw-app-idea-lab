import React from 'react';
import { Check, Trash2, Clock, Fingerprint, Crosshair } from 'lucide-react';
import type { Idea } from '../../types/idea';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | boolean | Record<string, boolean>)[] ) {
  return twMerge(clsx(inputs));
}

interface IdeaCardProps {
  idea: Idea;
  onSelect: (idea: Idea) => void;
  onDelete?: (id: string) => void;
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  isBatchSelected?: boolean;
  onToggleBatch?: (id: string) => void;
}

export const IdeaCard: React.FC<IdeaCardProps> = ({ 
  idea, 
  onSelect, 
  onDelete, 
  isSelected,
  isMultiSelectMode,
  isBatchSelected,
  onToggleBatch
}) => {
  const score = idea.similarity?.score ?? 0;
  
  const getSeverity = (s: number) => {
    if (s < 0.5) return 'success';
    if (s < 0.7) return 'info';
    if (s < 0.78) return 'warning';
    return 'error';
  };

  const severity = getSeverity(score);

  const getThemeColor = (theme?: string) => {
    switch(theme) {
      case 'professional': return 'text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30';
      case 'tech': return 'text-cyan-600 bg-cyan-50 border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-900/30';
      case 'nature': return 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30';
      case 'vibrant': return 'text-orange-600 bg-orange-50 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/30';
      case 'creative': return 'text-purple-600 bg-purple-50 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/30';
      case 'minimal': return 'text-gray-600 bg-gray-50 border-gray-100 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-800/50';
      default: return 'text-gray-500 bg-gray-50 border-gray-100 dark:bg-gray-800/20 dark:text-gray-400 dark:border-gray-800/30';
    }
  };

  return (
    <div 
      className={cn(
        "group relative flex flex-col gap-3 p-5 rounded-2xl border transition-all duration-300 bg-white dark:bg-[#1c1c1e] cursor-pointer",
        isSelected ? "ring-2 ring-blue-500 border-transparent shadow-2xl" : "border-[#e5e5e7] dark:border-[#2d2d2f] hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-xl hover:translate-y-[-2px]",
        isBatchSelected && "bg-blue-50/30 dark:bg-blue-900/10 border-blue-400"
      )}
      onClick={() => isMultiSelectMode ? onToggleBatch?.(idea.id) : onSelect(idea)}
    >
      {isMultiSelectMode && (
        <div className="absolute -left-2 -top-2 z-10">
          <div 
            className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
              isBatchSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-white dark:bg-[#1c1c1e] border-gray-300 dark:border-gray-600"
            )}
            onClick={(e) => { e.stopPropagation(); onToggleBatch?.(idea.id); }}
          >
            {isBatchSelected && <Check size={14} strokeWidth={4} />}
          </div>
        </div>
      )}

      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-bold leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors break-words whitespace-normal">
            {idea.title}
          </h3>
          {idea.visualTheme && (
            <div className={cn(
              "self-start flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider border transition-colors",
              getThemeColor(idea.visualTheme)
            )}>
              <Fingerprint size={10} />
              {idea.visualTheme}
            </div>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          {idea.status === 'implemented' && (
            <div className="px-1.5 sm:px-2 py-0.5 rounded-lg bg-green-500/10 text-green-500 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border border-green-500/20">
              <Check size={10} />
              <span className="hidden sm:inline">Built</span>
            </div>
          )}
          {onDelete && (
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(idea.id); }}
              className="p-1 px-1.5 sm:p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 size={13} className="sm:size-3.5" />
            </button>
          )}
          <div className={cn(
            "px-1.5 sm:px-2 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-bold uppercase tracking-wider border",
            severity === 'success' && "bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30",
            severity === 'info' && "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30",
            severity === 'warning' && "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/30",
            severity === 'error' && "bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30"
          )}>
            {score < 1 ? `Sim: ${score.toFixed(2)}` : 'Duplicate'}
          </div>
        </div>
      </div>

      <p className="text-xs text-[#666] dark:text-[#86868b] leading-relaxed line-clamp-2">
        {idea.hudScenario}
      </p>

      {/* Targeted Research: challengesOriginal */}
      {idea.isTargeted && idea.challengesOriginal && (
        <div className="flex gap-2 items-start px-3 py-2 rounded-xl bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100/40 dark:border-amber-900/20">
          <Crosshair size={12} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <p className="text-[9px] leading-relaxed text-amber-700 dark:text-amber-300 font-medium line-clamp-2">
            {idea.challengesOriginal}
          </p>
        </div>
      )}

      {/* Targeted Research: perspectiveTags */}
      {idea.isTargeted && idea.perspectiveTags && idea.perspectiveTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {idea.perspectiveTags.slice(0, 3).map((tag) => {
            const [dim, val] = tag.split(':');
            return (
              <span
                key={tag}
                className={cn(
                  "px-1.5 py-0.5 rounded-md text-[7px] font-bold uppercase tracking-wider border",
                  dim === 'scope' && "bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-900/30",
                  dim === 'user' && "bg-teal-50 text-teal-600 border-teal-100 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-900/30",
                  dim === 'interaction' && "bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30",
                  dim === 'business' && "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30",
                  !['scope', 'user', 'interaction', 'business'].includes(dim) && "bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-800/20 dark:text-gray-400 dark:border-gray-800/30"
                )}
              >
                {val || tag}
              </span>
            );
          })}
          {idea.perspectiveTags.length > 3 && (
            <span className="text-[7px] font-bold text-gray-400 pt-0.5">+{idea.perspectiveTags.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-[#f5f5f7] dark:border-[#2d2d2f]">
        <div className="flex items-center justify-between text-[10px] font-bold">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 text-[#86868b]">
              <Clock size={11} />
              <span>{idea.createdAt ? new Date(idea.createdAt).toLocaleDateString() : 'N/A'}</span>
            </div>
            {idea.complexityBudget && (
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 opacity-80">
                <span className="w-1 h-1 rounded-full bg-blue-400" />
                <span>{idea.complexityBudget.minutes}m / {idea.complexityBudget.screens}S</span>
              </div>
            )}
          </div>
          
          <div className="flex gap-2 min-w-0">
            {(idea.sources || []).slice(0, 1).map((s, idx) => (
              <a 
                key={idx}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-500 hover:underline truncate max-w-[80px] opacity-80"
              >
                {s.title || 'Source'}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
