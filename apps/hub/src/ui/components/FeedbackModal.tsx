import React, { useEffect, useState } from 'react';
import { X, Star, CheckCircle2, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchFeedback, saveFeedback } from '../../lib/api';
import { ManifestEntry } from '../../types/manifest';
import { Feedback } from '../../types/feedback';

const TAG_CATEGORIES: Record<string, string[]> = {
  Innovation: ['creative', 'surprising', 'fresh', 'iterate'],
  Utility: ['useful', 'tool-like', 'actionable', 'reusable'],
  Experience: ['ux-smooth', 'ux-confusing', 'beautiful', 'messy', 'fast'],
  Category: ['ai', 'system', 'network', 'game']
};

interface FeedbackModalProps {
  opened: boolean;
  onClose: () => void;
  entries: ManifestEntry[];
  initialDate?: string;
  onSaved?: (date: string, feedback: Feedback) => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ opened, onClose, entries, initialDate, onSaved }) => {
  const [date, setDate] = useState<string>(initialDate || entries[0]?.date || '');
  const [rating, setRating] = useState<number>(0);
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (opened) {
      setIsSuccess(false);
      const d = initialDate || entries[0]?.date || '';
      setDate(d);
    }
  }, [opened, initialDate, entries]);

  useEffect(() => {
    if (opened && date) {
      (async () => {
        try {
          const fb = await fetchFeedback(date);
          setRating(fb?.rating || 0);
          
          let fetchedTags = (fb?.tags as any) || {};
          if (Array.isArray(fetchedTags)) {
            const structured: Record<string, string[]> = {};
            fetchedTags.forEach(tag => {
              for (const [cat, items] of Object.entries(TAG_CATEGORIES)) {
                if (items.includes(tag)) {
                  if (!structured[cat]) structured[cat] = [];
                  structured[cat].push(tag);
                  break;
                }
              }
            });
            fetchedTags = structured;
          }
          setTags(fetchedTags);
          setNotes(fb?.notes || '');
        } catch (e) {}
      })();
    }
  }, [opened, date]);

  const handleSubmit = async () => {
    if (!date) return;
    if (rating === 0) return;
    setLoading(true);
    try {
      const out = await saveFeedback({ date, rating, tags, notes });
      onSaved?.(out.date, out);
      setIsSuccess(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      alert('Save failed');
    } finally {
      setLoading(false);
    }
  };

  if (!opened) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative glass w-full max-w-[500px] rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="px-8 py-6 border-b border-[#e5e5e7] dark:border-[#2d2d2f] flex justify-between items-center bg-white/50 dark:bg-black/20">
          <h2 className="text-xl font-bold">Feedback</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          {isSuccess ? (
            <div className="py-12 text-center space-y-4 animate-in zoom-in duration-300">
               <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto text-green-600">
                 <CheckCircle2 size={32} />
               </div>
               <h3 className="text-xl font-bold">Feedback Saved!</h3>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Project</label>
                <select 
                  value={date} 
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-[#e5e5e7] dark:border-[#2d2d2f] bg-white dark:bg-[#1c1c1e] text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
                >
                  {entries.map(e => (
                    <option key={e.date} value={e.date}>{e.date} — {e.title}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Rating</label>
                <div className="flex justify-between items-center px-2">
                  {[1,2,3,4,5].map(v => (
                    <button 
                      key={v}
                      onClick={() => setRating(v)}
                      className={clsx(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                        rating >= v ? "text-yellow-500 scale-110" : "text-gray-300 hover:text-gray-400"
                      )}
                    >
                      <Star size={24} className={clsx(rating >= v && "fill-yellow-500")} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(TAG_CATEGORIES).map(([category, items]) => (
                  <div key={category} className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400/80 uppercase tracking-widest block">{category}</label>
                    <div className="flex flex-wrap gap-2">
                      {items.map(t => {
                        const active = tags[category]?.includes(t);
                        return (
                          <button
                            key={t}
                            onClick={() => {
                              setTags(prev => {
                                const current = prev[category] || [];
                                const updated = current.includes(t) 
                                  ? current.filter(x => x !== t) 
                                  : [...current, t];
                                return { ...prev, [category]: updated };
                              });
                            }}
                            className={clsx(
                              "px-3 py-1.5 rounded-xl border text-[11px] font-bold capitalize transition-all",
                              active 
                                ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" 
                                : "border-[#e5e5e7] dark:border-[#2d2d2f] text-gray-500 hover:border-gray-400"
                            )}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Review Notes</label>
                <textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any specific thoughts on this iteration?"
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl border border-[#e5e5e7] dark:border-[#2d2d2f] bg-white dark:bg-[#1c1c1e] text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                />
              </div>

              <button 
                onClick={handleSubmit}
                disabled={loading || rating === 0}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98]"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : "Save Feedback"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
