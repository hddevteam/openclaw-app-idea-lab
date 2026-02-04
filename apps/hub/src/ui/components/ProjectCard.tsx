import React, { useState } from 'react';
import { ExternalLink, Trash2, Star, Calendar, ArrowRight, RotateCcw, ChevronDown, ChevronUp, BookOpen, Fingerprint } from 'lucide-react';
import { clsx } from 'clsx';
import { ManifestEntry } from '../../types/manifest';
import { Feedback } from '../../types/feedback';
import { restoreIdea } from '../../lib/api';
import ReactMarkdown from 'react-markdown';

interface ProjectCardProps {
  entry: ManifestEntry;
  feedback?: Feedback;
  onRateClick: (date: string) => void;
  onDelete: (date: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ entry, feedback, onRateClick, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const rating = feedback?.rating;
  const tags = feedback?.tags || {};

  const allTags = Object.values(tags).flat();

  const handleDelete = async () => {
    if (!confirm(`Confirm deletion of Project [${entry.date}]?`)) return;
    setIsDeleting(true);
    try {
      const r = await fetch(`/api/output?id=${encodeURIComponent(entry.date)}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({ ok: false }));
      if (!r.ok || j.ok === false) throw new Error('delete failed');
      onDelete(entry.date);
    } catch (err) {
      alert('Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm(`Restore [${entry.title}] back to backlog? This will delete the current output folder.`)) return;
    setIsDeleting(true); // Reuse deleting state for simplicity
    try {
      await restoreIdea(entry.date);
      onDelete(entry.date); // Use onDelete to remove it from the list
    } catch (err) {
      alert('Restore failed');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="group relative rounded-3xl p-5 bg-white dark:bg-[#1c1c1e] hover:shadow-2xl hover:shadow-blue-500/5 transition-all duration-300 border border-[#e5e5e7] dark:border-[#2d2d2f] hover:translate-y-[-2px]">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[#f5f5f7] dark:bg-[#2d2d2f] text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
          <Calendar size={12} />
          {entry.date}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={handleRestore}
            disabled={isDeleting}
            title="Restore to backlog"
            className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
          >
            <RotateCcw size={16} />
          </button>
          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete permanently"
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <h3 className="text-lg font-bold leading-tight text-[#111] dark:text-[#f5f5f7] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{entry.title}</h3>
        <p className="text-xs text-[#666] dark:text-[#86868b] line-clamp-3 leading-relaxed">
          {entry.desc || 'No description available for this experiment.'}
        </p>

        {(entry.scenario || entry.workflow) && (
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline mt-2"
          >
            {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{showDetails ? 'Hide details' : 'View Scenario & Workflow'}</span>
          </button>
        )}

        {showDetails && (
          <div className="mt-4 p-4 rounded-2xl bg-[#fafafa] dark:bg-[#151517] border border-[#f0f0f2] dark:border-[#2d2d2f] space-y-4 animate-in slide-in-from-top duration-300">
            {entry.scenario && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  <BookOpen size={10} />
                  <span>Scenario</span>
                </div>
                <div className="text-[11px] leading-relaxed text-[#444] dark:text-[#d1d1d6] prose-xs dark:prose-invert">
                  <ReactMarkdown>{entry.scenario}</ReactMarkdown>
                </div>
              </div>
            )}
            {entry.workflow && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  <Fingerprint size={10} />
                  <span>Workflow</span>
                </div>
                <div className="text-[11px] leading-relaxed text-[#444] dark:text-[#d1d1d6] prose-xs dark:prose-invert">
                  <ReactMarkdown>{entry.workflow}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {allTags.map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[9px] font-bold capitalize border border-blue-100/50 dark:border-blue-800/50">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[#f5f5f7] dark:border-[#2d2d2f]">
        <button 
          onClick={() => onRateClick(entry.date)}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all",
            rating ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/10 dark:text-yellow-500" : "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
          )}
        >
          <Star size={14} className={clsx(rating && "fill-yellow-500")} />
          <span>{rating ? `Rated ${rating}` : 'Rate This'}</span>
        </button>

        <a 
          href={entry.indexPath || `/${entry.date}/index.html`}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 text-white text-[11px] font-bold shadow-lg shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all"
        >
          <span>Open</span>
          <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
};
