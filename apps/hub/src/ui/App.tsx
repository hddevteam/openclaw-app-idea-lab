import React, { useEffect, useMemo, useState } from 'react';
import { 
  deleteIdea, 
  fetchBacklog, 
  fetchFeedback, 
  fetchFiltered, 
  fetchManifest, 
  fetchTrendsReport,
  fetchResearchIndex,
  fetchResearchLog,
  generateIdeas, 
  runResearch,
  saveToQueue,
  prioritizeAndExecute,
  restoreIdeaStatus,
  restoreIdeaFromFiltered 
} from '../lib/api';
import type { Feedback } from '../types/feedback';
import type { ManifestEntry } from '../types/manifest';
import type { Idea } from '../types/idea';
import { NavBar } from './components/NavBar';
import { ProjectCard } from './components/ProjectCard';
import { FeedbackModal } from './components/FeedbackModal';
import { BuildProgress } from './components/BuildProgress';

import { IdeaCard } from './components/IdeaCard';
import { LayoutGrid, History, Calendar, CheckCircle2, Save, Trash2, X, AlertCircle, Loader2, Search, SortAsc, BookOpen, BrainCircuit, Archive } from 'lucide-react';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MarkdownComponents = {
  a: ({href, children}: { href?: string; children?: React.ReactNode }) => (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md border border-blue-100 dark:border-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all no-underline font-bold text-[10px] my-0.5 align-middle"
    >
      <Search size={10} />
      {children}
    </a>
  ),
  table: ({children}: { children?: React.ReactNode }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 bg-white/50 dark:bg-transparent">
        {children}
      </table>
    </div>
  ),
  th: ({children}: { children?: React.ReactNode }) => (
    <th className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">
      {children}
    </th>
  ),
  td: ({children}: { children?: React.ReactNode }) => (
    <td className="px-4 py-3 text-xs border-t border-gray-100 dark:border-gray-800 leading-relaxed font-medium">
      {children}
    </td>
  )
};

function localYYYYMMDD(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function App() {
  const [activeTab, setActiveTab] = useState<'hub' | 'lab'>('hub');
  const [entries, setEntries] = useState<ManifestEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, Feedback | undefined>>({});
  const [fbOpen, setFbOpen] = useState(false);
  const [fbDate, setFbDate] = useState<string | undefined>(undefined);

  // Lab State
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [trendsReport, setTrendsReport] = useState<string>('');
  const [researchIndex, setResearchIndex] = useState<string>('');
  const [showReport, setShowReport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedLog, setSelectedLog] = useState<{ name: string; content: string } | null>(null);
  const [labView, setLabView] = useState<'backlog' | 'filtered' | 'built'>('backlog');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    (async () => {
      try {
        const m = await fetchManifest();
        const list = Array.isArray(m.entries) ? m.entries : [];
        setEntries(list);

        const head = list.slice(0, 15);
        const pairs = await Promise.all(
          head.map(async (e) => {
            try {
              const fb = await fetchFeedback(e.date);
              return [e.date, fb] as const;
            } catch {
              return [e.date, undefined] as const;
            }
          })
        );
        const map: Record<string, Feedback | undefined> = {};
        for (const [d, f] of pairs) map[d] = f;
        setFeedbacks(map);
      } catch (e: unknown) {
        setErr(String((e as Error)?.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    if (activeTab === 'lab') {
      fetchLabIdeas(labView);
    }
  }, [activeTab, labView]);

  const fetchLabIdeas = async (view: 'backlog' | 'filtered' | 'built') => {
    setLoading(true);
    try {
      const [list, report, index] = await Promise.all([
        (view === 'backlog' || view === 'built') ? fetchBacklog() : fetchFiltered(),
        fetchTrendsReport().catch(() => ''),
        fetchResearchIndex().catch(() => '')
      ]);
      setIdeas(list);
      setTrendsReport(report);
      setResearchIndex(index);
    } catch (_err) {
      showToast('Failed to load ideas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLog = async (name: string) => {
    try {
      const content = await fetchResearchLog(name);
      setSelectedLog({ name, content });
    } catch (_err) {
      showToast('Log not found', 'error');
    }
  };

  const handleGenerate = async (prefs: { refreshResearch?: boolean; tags?: string[] }) => {
    setLoading(true);
    try {
      const list = await generateIdeas(prefs);
      showToast(`Generated ${list.length} ideas`);
      setIdeas(list);
      setLabView('backlog');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Generation failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRunResearch = async () => {
    setIsResearching(true);
    setLoading(true);
    try {
      const res = await runResearch();
      if (res.ok) {
        showToast('Research completed! Backlog updated.');
        await fetchLabIdeas('backlog');
      } else {
        showToast(res.message || 'Research failed', 'error');
      }
    } catch (err: unknown) {
      showToast((err as Error).message || 'Research failed', 'error');
    } finally {
      setIsResearching(false);
      setLoading(false);
    }
  };

  const handleSaveToQueue = async (idea: Idea) => {
    setIsSaving(true);
    try {
      await saveToQueue(idea);
      showToast('Saved to idea_queue.json');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImplementNow = async (id: string) => {
    setIsPrioritizing(true);
    try {
      await prioritizeAndExecute(id);
      showToast('Prioritized! Generation started in background.');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Action failed', 'error');
    } finally {
      setIsPrioritizing(false);
    }
  };

  const handleRestoreStatus = async (id: string) => {
    setIsRestoring(true);
    try {
      if (labView === 'built') {
        await restoreIdeaStatus(id);
      } else if (labView === 'filtered') {
        await restoreIdeaFromFiltered(id);
      }
      
      // Update local state to reflect removal from current view
      setIdeas(prev => prev.filter(i => i.id !== id));
      setSelectedId(null);
      showToast('Restored to Backlog');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Restore failed', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteIdea = async (id: string) => {
    if (!confirm('Are you sure you want to delete this idea?')) return;
    try {
      await deleteIdea(id, labView);
      setIdeas(prev => prev.filter(i => i.id !== id));
      if (selectedId === id) setSelectedId(null);
      showToast('Deleted successfully');
    } catch (_err) {
      showToast('Delete failed', 'error');
    }
  };

  const handleBatchDelete = async () => {
    if (batchIds.size === 0) return;
    if (!confirm(`Delete ${batchIds.size} ideas permanently?`)) return;
    
    setLoading(true);
    try {
      const idsArr = Array.from(batchIds);
      const endpoint = labView === 'backlog' ? '/api/idea-backlog' : '/api/idea-filtered';
      const r = await fetch(`${endpoint}?ids=${idsArr.join(',')}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Batch delete failed');
      
      setIdeas(prev => prev.filter(i => !batchIds.has(i.id)));
      setBatchIds(new Set());
      setIsBatchMode(false);
      showToast(`Deleted ${j.count || idsArr.length} ideas`);
    } catch (err: unknown) {
      showToast((err as Error).message || 'Batch delete failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleBatchId = (id: string) => {
    setBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const todayKey = localYYYYMMDD();
  const sortedEntries = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  
  const todayEntries = useMemo(
    () => sortedEntries.filter((e) => String(e.date || '').startsWith(todayKey)),
    [sortedEntries, todayKey]
  );

  const historyEntries = useMemo(
    () => sortedEntries.filter((e) => !String(e.date || '').startsWith(todayKey)),
    [sortedEntries, todayKey]
  );

  const filteredIdeas = useMemo(() => {
    let list = ideas;
    
    // Primary view split
    if (labView === 'backlog') {
      list = list.filter(i => i.status !== 'implemented');
    } else if (labView === 'built') {
      list = list.filter(i => i.status === 'implemented');
    }

    return list.filter(i => {
      const matchSearch = (i.title || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.keywords || []).some(k => k.toLowerCase().includes(search.toLowerCase())) ||
        (i.hudScenario || '').toLowerCase().includes(search.toLowerCase());
      
      const matchTag = !selectedTag || (i.keywords || []).includes(selectedTag);
      
      return matchSearch && matchTag;
    }).sort((a, b) => {
      return (a.similarity?.score || 0) - (b.similarity?.score || 0);
    });
  }, [ideas, search, selectedTag, labView]);

  const counts = useMemo(() => {
    return {
      backlog: ideas.filter(i => i.status !== 'implemented').length,
      built: ideas.filter(i => i.status === 'implemented').length
    };
  }, [ideas]);

  const selectedIdea = useMemo(() => ideas.find(i => i.id === selectedId), [ideas, selectedId]);

  function openFeedback(date?: string) {
    setFbDate(date);
    setFbOpen(true);
  }

  const renderDetailCard = (idea: Idea) => (
    <div className="bg-white dark:bg-[#1c1c1e] rounded-[24px] sm:rounded-[32px] p-5 sm:p-8 space-y-6 sm:space-y-8 border border-[#e5e5e7] dark:border-[#2d2d2f] shadow-2xl animate-in slide-in-from-top duration-300">
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest border border-blue-100 dark:border-blue-900/30">
              {idea.status === 'implemented' ? 'Built' : 'Idea Project'}
            </span>
            <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID: {idea.id}</span>
          </div>
          <div className="p-4 sm:p-0 bg-[#f5f5f7] dark:bg-[#2d2d2f] sm:bg-transparent rounded-2xl sm:rounded-none border border-[#e5e5e7] dark:border-[#3d3d3f] sm:border-0 shadow-sm sm:shadow-none">
            <h2 className="text-xl sm:text-2xl font-bold leading-tight break-words text-[#111] dark:text-white">
              {idea.title}
            </h2>
          </div>
        </div>
        <button
          onClick={() => setSelectedId(null)}
          className="p-1.5 sm:p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-400 transition-colors shrink-0"
          title="Close"
          aria-label="Close"
        >
          <X size={20} className="sm:size-6" />
        </button>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <section className="space-y-4">
          <div className="space-y-2">
            <label className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Scenario</label>
            <p className="text-xs sm:text-sm font-medium leading-relaxed text-[#111] dark:text-[#f5f5f7]">{idea.hudScenario}</p>
          </div>
          
          {idea.coreInteractions?.length > 0 && (
            <div className="space-y-3">
              <label className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Workflow (Core Interactions)</label>
              <ul className="space-y-2.5">
                {idea.coreInteractions.map((ci, idx) => (
                  <li key={idx} className="flex gap-3 items-start animate-in slide-in-from-left duration-300">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold border border-blue-100 dark:border-blue-900/30 shadow-sm">
                      {idx + 1}
                    </div>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-[#444] dark:text-[#d1d1d6] font-medium pt-0.5">{ci}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {idea.selfHealing?.length > 0 && (
            <div className="space-y-3">
              <label className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Self-Healing Runtime</label>
              <ul className="space-y-2.5">
                {idea.selfHealing.map((sh, idx) => (
                  <li key={idx} className="flex gap-3 items-start opacity-80">
                    <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 mt-2" />
                    <p className="text-xs leading-relaxed text-[#444] dark:text-[#d1d1d6] italic">{sh}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <section className="space-y-2">
            <label className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Primary Output</label>
            <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-green-50/50 dark:bg-green-900/10 border border-green-100/50 dark:border-green-900/20 text-[10px] sm:text-xs font-bold text-green-700 dark:text-green-400">
              {idea.output}
            </div>
          </section>
          <section className="space-y-2">
            <label className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Complexity Budget</label>
            <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-900/20 text-[9px] sm:text-[10px] font-bold text-blue-700 dark:text-blue-400 flex justify-between items-center">
               <span>{idea.complexityBudget?.minutes || 60}m</span>
               <span className="opacity-30">|</span>
               <span>{idea.complexityBudget?.screens || 2} SCR</span>
               <span className="opacity-30">|</span>
               <span>{idea.complexityBudget?.interactions || 3} IX</span>
            </div>
          </section>
        </div>
      </div>

      <div className="pt-2 sm:pt-4 flex flex-col gap-2 sm:gap-3">
        {idea.status === 'implemented' || labView === 'filtered' ? (
          <button 
            onClick={() => handleRestoreStatus(idea.id)}
            disabled={isRestoring}
            className="flex-1 flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 rounded-[16px] sm:rounded-[20px] bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold shadow-2xl shadow-amber-500/30 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isRestoring ? <Loader2 size={18} className="animate-spin" /> : <History size={18} className="sm:size-5" />}
            <span>Restore to Backlog</span>
          </button>
        ) : (
          <>
            <button 
              onClick={() => handleImplementNow(idea.id)}
              disabled={isPrioritizing}
              className="flex-1 flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 rounded-[16px] sm:rounded-[20px] bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-bold shadow-2xl shadow-green-500/30 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isPrioritizing ? <Loader2 size={18} className="animate-spin" /> : <Loader2 size={18} className="sm:size-5" />}
              <span>Implement Now</span>
            </button>
            <button 
              onClick={() => handleSaveToQueue(idea)}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 rounded-[16px] sm:rounded-[20px] bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} className="sm:size-5" />}
              <span>Pick for Development</span>
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fbfbfd] dark:bg-[#000000] text-[#111] dark:text-[#f5f5f7] pb-24">
      <NavBar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onFeedbackClick={() => openFeedback()} 
        entriesCount={entries.length} 
        labProps={activeTab === 'lab' ? {
          onGenerate: handleGenerate,
          onRunResearch: handleRunResearch,
          onViewChange: setLabView,
          activeView: labView,
          isGenerating: loading,
          isResearching: isResearching,
          backlogCount: counts.backlog,
          builtCount: counts.built
        } : undefined}
      />

      <main className="max-w-[1200px] mx-auto px-4 md:px-8">
        {activeTab === 'hub' ? (
          <div className="space-y-16">
            {todayEntries.length > 0 && (
              <section className="space-y-6">
                <div className="flex items-center gap-2">
                   <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400">
                     <Calendar size={18} />
                   </div>
                   <h2 className="text-sm font-bold uppercase tracking-widest text-[#666] dark:text-[#86868b]">Today's Experiments</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {todayEntries.map(e => (
                    <ProjectCard 
                      key={e.date} 
                      entry={e} 
                      feedback={feedbacks[e.date]} 
                      onRateClick={openFeedback}
                      onDelete={(d) => setEntries(prev => prev.filter(x => x.date !== d))}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-6">
              <div className="flex items-center gap-2">
                 <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                   <History size={18} />
                 </div>
                 <h2 className="text-sm font-bold uppercase tracking-widest text-[#666] dark:text-[#86868b]">Lab History</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {historyEntries.map(e => (
                  <ProjectCard 
                    key={e.date} 
                    entry={e} 
                    feedback={feedbacks[e.date]} 
                    onRateClick={openFeedback}
                    onDelete={(d) => setEntries(prev => prev.filter(x => x.date !== d))}
                  />
                ))}
              </div>

              {entries.length === 0 && !err && (
                <div className="py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-[#f5f5f7] dark:bg-[#2d2d2f] rounded-full flex items-center justify-center mx-auto text-gray-300 dark:text-gray-600">
                    <LayoutGrid size={32} />
                  </div>
                  <p className="text-sm text-[#666] dark:text-[#86868b]">The lab is currently empty. Start by generating new ideas.</p>
                </div>
              )}

              {err && (
                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 text-red-600 text-xs font-bold">
                  Error loading manifest: {err}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Trends Report Section */}
            {showReport && trendsReport && (
              <div className="p-4 sm:p-8 rounded-[24px] sm:rounded-[32px] bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10 border border-purple-100 dark:border-purple-800/30 animate-in slide-in-from-top duration-500 overflow-hidden">
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-purple-600 text-white shrink-0">
                    <BrainCircuit size={18} className="sm:size-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-lg font-bold truncate">AI-Native Trends & Opportunities</h2>
                    <p className="text-[9px] sm:text-xs text-purple-600 dark:text-purple-400 font-bold uppercase tracking-widest">Research-Driven Insights</p>
                  </div>
                  <button
                    onClick={() => setShowReport(false)}
                    className="ml-auto p-1.5 sm:p-2 hover:bg-purple-200 dark:hover:bg-purple-800/50 rounded-full transition-colors shrink-0"
                    title="Close"
                    aria-label="Close"
                  >
                    <X size={18} className="sm:size-5 text-purple-600" />
                  </button>
                </div>
                <div className="prose prose-xs sm:prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-headings:text-purple-900 dark:prose-headings:text-purple-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{trendsReport}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Research History / Index Section */}
            {showHistory && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Index List */}
                <div className="p-4 sm:p-8 rounded-[24px] sm:rounded-[32px] bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 animate-in slide-in-from-left duration-500 overflow-hidden">
                  <div className="flex items-center gap-3 mb-4 sm:mb-6">
                    <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-amber-600 text-white shrink-0">
                      <Archive size={18} className="sm:size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm sm:text-lg font-bold truncate text-amber-900 dark:text-amber-100">Research Archives</h2>
                      <p className="text-[9px] sm:text-xs text-amber-600 dark:text-amber-400 font-bold uppercase tracking-widest">History & Context</p>
                    </div>
                    <button
                      onClick={() => setShowHistory(false)}
                      className="ml-auto p-1.5 sm:p-2 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-full transition-colors shrink-0"
                      title="Close"
                      aria-label="Close"
                    >
                      <X size={18} className="sm:size-5 text-amber-600" />
                    </button>
                  </div>
                  <div className="prose prose-xs sm:prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-headings:text-amber-900 dark:prose-headings:text-amber-300 overflow-y-auto max-h-[500px]">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        ...MarkdownComponents,
                        a: ({href, children}) => (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              if (href?.includes('.md')) {
                                const logName = href.split('/').pop() || '';
                                handleOpenLog(logName);
                              }
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 underline font-extrabold transition-all bg-blue-100/50 dark:bg-blue-900/40 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs inline-flex items-center gap-2 border border-blue-200 dark:border-blue-800/50 shadow-sm active:scale-95"
                          >
                            <BookOpen size={12} />
                            {children}
                          </button>
                        )
                      }}
                    >
                      {researchIndex || 'No archives found yet. Generating ideas will create snapshots.'}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Selected Log Content */}
                {selectedLog ? (
                  <div className="p-4 sm:p-8 rounded-[24px] sm:rounded-[32px] bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-gray-800 shadow-sm animate-in slide-in-from-right duration-500 overflow-hidden relative">
                    <div className="flex items-center gap-3 mb-4 sm:mb-6">
                      <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gray-100 text-gray-600 shrink-0">
                        <BookOpen size={18} className="sm:size-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm sm:text-lg font-bold truncate">{selectedLog.name}</h2>
                        <p className="text-[9px] sm:text-xs text-gray-500 font-bold uppercase tracking-widest">Archived Snapshot</p>
                      </div>
                      <button
                        onClick={() => setSelectedLog(null)}
                        className="ml-auto p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                        title="Close"
                        aria-label="Close"
                      >
                        <X size={18} className="sm:size-5 text-gray-400" />
                      </button>
                    </div>
                    <div className="prose prose-xs sm:prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed overflow-y-auto max-h-[500px]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{selectedLog.content}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="hidden md:flex flex-col items-center justify-center p-8 rounded-[32px] border-2 border-dashed border-gray-100 dark:border-gray-800 text-gray-300">
                    <Archive size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-medium">Select a snapshot from the index to view</p>
                  </div>
                )}
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8 px-2">
              <div className="relative flex-1 max-w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text"
                  placeholder="Search ideas..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-2xl border border-[#e5e5e7] dark:border-[#2d2d2f] bg-white dark:bg-[#1c1c1e] text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X size={14} className="text-gray-400" />
                  </button>
                )}
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
                {labView !== 'built' && (
                  <button 
                    onClick={() => {
                      if (isBatchMode) {
                        setBatchIds(new Set());
                      }
                      setIsBatchMode(!isBatchMode);
                    }}
                    className={clsx(
                      "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-all shrink-0",
                      isBatchMode ? "bg-red-50 text-red-600 border border-red-200" : "bg-[#f5f5f7] dark:bg-[#2d2d2f] text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    <Trash2 size={13} className="sm:size-3.5" />
                    <span>{isBatchMode ? 'Cancel' : 'Batch'}</span>
                  </button>
                )}

                {isBatchMode && batchIds.size > 0 && (
                  <button 
                    onClick={handleBatchDelete}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-red-600 text-white text-[10px] sm:text-[11px] font-bold uppercase tracking-widest shadow-lg shadow-red-500/20 animate-in zoom-in duration-200 shrink-0"
                  >
                    <Trash2 size={13} className="sm:size-3.5" />
                    <span>Delete {batchIds.size}</span>
                  </button>
                )}

                <button 
                  onClick={() => {
                    setShowReport(!showReport);
                    if (!showReport) setShowHistory(false);
                  }}
                  className={clsx(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-all shrink-0",
                    showReport ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30" : "bg-[#f5f5f7] dark:bg-[#2d2d2f] text-gray-500 hover:bg-gray-200"
                  )}
                >
                  <BookOpen size={13} className="sm:size-3.5" />
                  <span className="hidden sm:inline">Trends</span>
                  <span className="sm:hidden">Trends</span>
                </button>

                <button 
                  onClick={() => {
                    setShowHistory(!showHistory);
                    if (!showHistory) setShowReport(false);
                    setSelectedLog(null);
                  }}
                  className={clsx(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-all shrink-0",
                    showHistory ? "bg-amber-600 text-white shadow-lg shadow-amber-500/30" : "bg-[#f5f5f7] dark:bg-[#2d2d2f] text-gray-500 hover:bg-gray-200"
                  )}
                >
                  <Archive size={13} className="sm:size-3.5" />
                  <span className="hidden sm:inline">Archives</span>
                  <span className="sm:hidden">Index</span>
                </button>

                {selectedTag && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[9px] sm:text-[10px] font-bold uppercase tracking-wider animate-in zoom-in duration-200 shrink-0">
                    <span>#{selectedTag}</span>
                    <button
                      onClick={() => setSelectedTag(null)}
                      className="p-0.5 hover:bg-white/20 rounded-full transition-colors"
                      title="Clear tag"
                      aria-label="Clear tag"
                    >
                      <X size={12} className="sm:size-3.5" />
                    </button>
                  </div>
                )}
                
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-[#2d2d2f] text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0">
                  <SortAsc size={13} className="sm:size-3.5" />
                  <span className="hidden sm:inline">Sim Low to High</span>
                  <span className="sm:hidden">Sort</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-20">
              {/* Main Grid */}
              <div className={clsx(
                "grid gap-4 transition-all duration-500",
                selectedId ? "lg:col-span-12 xl:col-span-7 grid-cols-1 md:grid-cols-2" : "lg:col-span-12 grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
              )}>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-[200px] rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  ))
                ) : filteredIdeas.length > 0 ? (
                  filteredIdeas.map(idea => (
                    <React.Fragment key={idea.id}>
                      <IdeaCard 
                        idea={idea}
                        isSelected={selectedId === idea.id}
                        isMultiSelectMode={isBatchMode}
                        isBatchSelected={batchIds.has(idea.id)}
                        onToggleBatch={toggleBatchId}
                        onSelect={(i) => {
                          const newId = i.id === selectedId ? null : i.id;
                          setSelectedId(newId);
                          // Optional: scroll to the card if needed
                        }}
                        onDelete={handleDeleteIdea}
                        onTagClick={(tag) => setSelectedTag(tag)}
                      />
                      {/* Inline detail for mobile/tablet/laptop - up to xl breakpoint */}
                      {selectedId === idea.id && (
                        <div className="xl:hidden col-span-full">
                          {renderDetailCard(idea)}
                        </div>
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <div className="col-span-full py-24 text-center space-y-4">
                    <div className="w-16 h-16 bg-[#f5f5f7] dark:bg-[#2d2d2f] rounded-full flex items-center justify-center mx-auto text-gray-300">
                      <LayoutGrid size={32} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">No ideas found</h3>
                      <p className="text-sm text-gray-500">Try generating new ideas or changing filters.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Details Sidebar - Hidden below XL screens as it's handled inline */}
              {selectedIdea && (
                <aside className="hidden xl:block xl:col-span-5 xl:sticky xl:top-24">
                  {renderDetailCard(selectedIdea)}
                </aside>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Toast */}
      {toast && (
        <div className={clsx(
          "fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-full shadow-2xl z-[2000] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300",
          toast.type === 'success' ? "bg-black text-white" : "bg-red-600 text-white"
        )}>
          {toast.type === 'success' ? <CheckCircle2 size={18} className="text-green-400" /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold tracking-tight">{toast.msg}</span>
        </div>
      )}

      <FeedbackModal
        opened={fbOpen}
        onClose={() => setFbOpen(false)}
        entries={sortedEntries}
        initialDate={fbDate}
        onSaved={(date, fb) => setFeedbacks((m) => ({ ...m, [date]: fb }))}
      />
      
      <footer className="mt-20 pb-12 text-center space-y-2 opacity-40 hover:opacity-100 transition-opacity">
        <p className="text-[10px] font-bold tracking-widest uppercase text-gray-500 dark:text-gray-400">Version 0.1.0</p>
        <a 
          href="https://hddevteam.github.io/openclaw-app-idea-lab/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors underline underline-offset-4"
        >
          hddevteam.github.io/openclaw-app-idea-lab
        </a>
      </footer>

      <BuildProgress />
    </div>
  );
}
