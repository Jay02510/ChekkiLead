import React, { useState, useEffect, useMemo } from 'react';
import { enrichLead, generateEmailDraft } from './services/geminiService';
import { EnrichedLead, EmailDraft, NaverSearchResult, FirebaseStatus } from './types';
import { getNaverId, stripHtml } from './lib/naverId';
import { LeadCard } from './components/LeadCard';
import { EmailDraftCard } from './components/EmailDraftCard';
import { Loader2, Sparkles, Copy, Check, AlertCircle, Mail, Search, MapPin, Database, ChevronLeft, ChevronRight, Layers, CheckCircle2, Download, Filter } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { collection, getDocs, doc, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, authReady } from './lib/firebase';
import { Toaster, toast } from 'sonner';

// Keeps local dev writes out of the real outreach data — `npm run dev`
// (import.meta.env.DEV) writes to a separate collection than production.
const LEADS_COLLECTION = import.meta.env.DEV ? 'leads_dev' : 'leads';

export default function App() {
  const shouldReduceMotion = useReducedMotion();
  const motionTransition = shouldReduceMotion ? { duration: 0 } : undefined;
  const [activeTab, setActiveTab] = useState<'search' | 'database'>('search');
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NaverSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStart, setSearchStart] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  // Enrichment State
  const [isLoading, setIsLoading] = useState(false);
  const [isBatchEnriching, setIsBatchEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrichedLeads, setEnrichedLeads] = useState<EnrichedLead[]>([]);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, EmailDraft>>({});
  const [generatingEmails, setGeneratingEmails] = useState<Record<string, boolean>>({});

  // Database State
  const [savedLeads, setSavedLeads] = useState<EnrichedLead[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbFilter, setDbFilter] = useState<string>('all');

  // Bulk Sweep State — runs a list of queries unattended: search -> dedupe -> enrich -> save
  const [bulkQueries, setBulkQueries] = useState('');
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkLog, setBulkLog] = useState<string[]>([]);
  const [bulkStats, setBulkStats] = useState({ queriesDone: 0, queriesTotal: 0, saved: 0, skipped: 0, failed: 0 });
  const [matrixDistricts, setMatrixDistricts] = useState('강남구, 서초구, 송파구, 마포구, 분당구');
  const [matrixKeywords, setMatrixKeywords] = useState('영어학원, 유치원');

  useEffect(() => {
    // Always fetch saved leads on mount so we can cross-reference in search
    fetchSavedLeads();
  }, []);

  useEffect(() => {
    if (activeTab === 'database') {
      fetchSavedLeads();
    }
  }, [activeTab]);

  const fetchSavedLeads = async () => {
    setIsLoadingDb(true);
    try {
      await authReady;
      const q = query(collection(db, LEADS_COLLECTION), orderBy('outreach_priority', 'desc'));
      const querySnapshot = await getDocs(q);
      const leadsData: EnrichedLead[] = [];
      querySnapshot.forEach((doc) => {
        leadsData.push(doc.data() as EnrichedLead);
      });
      setSavedLeads(leadsData);
    } catch (err) {
      console.error("Failed to fetch leads from Firebase", err);
    } finally {
      setIsLoadingDb(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent, startIdx = 1) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);
    setSearchStart(startIdx);

    try {
      const res = await fetch(`/api/naver-search?query=${encodeURIComponent(searchQuery)}&start=${startIdx}`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to search Naver. Check API credentials.');
      
      setSearchResults(data.items || []);
      setTotalResults(data.total || 0);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNextPage = () => handleSearch(undefined, searchStart + 5);
  const handlePrevPage = () => handleSearch(undefined, Math.max(1, searchStart - 5));

  // O(1) "already in database" lookups, recomputed only when savedLeads changes.
  const savedIds = useMemo(() => new Set(savedLeads.map(l => l.naver_id)), [savedLeads]);

  const handleSelectResult = (result: NaverSearchResult) => {
    const withId = { ...result, naver_id: getNaverId(result) };
    handleEnrichWithData(JSON.stringify(withId, null, 2));
  };

  const handleEnrichWithData = async (dataToEnrich: string) => {
    if (!dataToEnrich.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await enrichLead(dataToEnrich);
      setEnrichedLeads([result]); // Replace current view with single result
    } catch (err: any) {
      setError(err.message || 'An error occurred while enriching the lead.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchEnrich = async () => {
    if (searchResults.length === 0) return;

    const toProcess = searchResults.filter(r => !savedIds.has(getNaverId(r)));
    const skipped = searchResults.length - toProcess.length;
    if (skipped > 0) {
      toast.info(`Skipping ${skipped} result${skipped > 1 ? 's' : ''} already in your database`);
    }
    if (toProcess.length === 0) {
      toast.info('Nothing new to enrich — every result here is already saved.');
      return;
    }

    setIsBatchEnriching(true);
    setError(null);
    setEnrichedLeads([]);

    const results: EnrichedLead[] = [];
    for (const item of toProcess) {
      try {
        const withId = { ...item, naver_id: getNaverId(item) };
        const result = await enrichLead(JSON.stringify(withId));
        results.push(result);
        setEnrichedLeads([...results]); // Update UI progressively
      } catch (err: any) {
        // One bad item shouldn't kill the rest of the batch.
        console.error(`Failed to enrich "${stripHtml(item.title)}":`, err);
        toast.error(`Skipped "${stripHtml(item.title)}" — enrichment failed`);
      }
      // Small gap between calls to stay clear of Gemini rate limits.
      await new Promise(res => setTimeout(res, 400));
    }
    setIsBatchEnriching(false);
  };

  const handleGenerateMatrix = () => {
    const districts = matrixDistricts.split(',').map(d => d.trim()).filter(Boolean);
    const keywords = matrixKeywords.split(',').map(k => k.trim()).filter(Boolean);
    if (districts.length === 0 || keywords.length === 0) return;

    const combos = districts.flatMap(d => keywords.map(k => `${d} ${k}`));
    setBulkQueries(combos.join('\n'));
    toast.success(`Generated ${combos.length} queries`);
  };

  // ponytail: 3 pages (15 results) per query cap — raise if a district search needs deeper paging
  const BULK_MAX_PAGES = 3;

  const handleBulkSweep = async () => {
    const queries = bulkQueries.split('\n').map(q => q.trim()).filter(Boolean);
    if (queries.length === 0 || isBulkRunning) return;

    setIsBulkRunning(true);
    setBulkLog([]);
    setBulkStats({ queriesDone: 0, queriesTotal: queries.length, saved: 0, skipped: 0, failed: 0 });

    await authReady;
    const seen = new Set(savedIds);

    for (const q of queries) {
      for (let page = 0; page < BULK_MAX_PAGES; page++) {
        const start = page * 5 + 1;
        let data: any;
        try {
          const res = await fetch(`/api/naver-search?query=${encodeURIComponent(q)}&start=${start}`);
          data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Naver search failed');
        } catch (err: any) {
          setBulkLog(l => [`Search failed for "${q}": ${err.message}`, ...l]);
          break;
        }

        const items: NaverSearchResult[] = data.items || [];
        if (items.length === 0) break;

        for (const item of items) {
          const naverId = getNaverId(item);
          if (seen.has(naverId)) {
            setBulkStats(s => ({ ...s, skipped: s.skipped + 1 }));
            continue;
          }
          seen.add(naverId);
          try {
            const withId = { ...item, naver_id: naverId };
            const enriched = await enrichLead(JSON.stringify(withId));
            await setDoc(doc(db, LEADS_COLLECTION, enriched.naver_id), enriched);
            setBulkStats(s => ({ ...s, saved: s.saved + 1 }));
            setBulkLog(l => [`Saved: ${stripHtml(item.title)}`, ...l]);
          } catch (err: any) {
            setBulkStats(s => ({ ...s, failed: s.failed + 1 }));
            setBulkLog(l => [`Failed: ${stripHtml(item.title)} — ${err.message}`, ...l]);
          }
          await new Promise(res => setTimeout(res, 400)); // stay clear of Gemini rate limits
        }

        if (start + 5 > (data.total || 0)) break;
        await new Promise(res => setTimeout(res, 300)); // stay clear of Naver rate limits
      }
      setBulkStats(s => ({ ...s, queriesDone: s.queriesDone + 1 }));
    }

    setIsBulkRunning(false);
    fetchSavedLeads();
    toast.success(`Bulk sweep done — ${queries.length} quer${queries.length > 1 ? 'ies' : 'y'} processed`);
  };

  const handleGenerateEmail = async (lead: EnrichedLead) => {
    setGeneratingEmails(prev => ({ ...prev, [lead.naver_id]: true }));
    try {
      const draft = await generateEmailDraft(lead);
      setEmailDrafts(prev => ({ ...prev, [lead.naver_id]: draft }));
    } catch (err: any) {
      setError(err.message || 'Failed to generate email.');
    } finally {
      setGeneratingEmails(prev => ({ ...prev, [lead.naver_id]: false }));
    }
  };

  const handleSaveLead = async (lead: EnrichedLead) => {
    try {
      await authReady;
      await setDoc(doc(db, LEADS_COLLECTION, lead.naver_id), lead);
      toast.success('Lead saved to Firebase!');
      fetchSavedLeads(); // Refresh to update "Saved" badges
    } catch (err) {
      console.error(err);
      toast.error('Failed to save lead. Check your configuration.');
    }
  };

  const handleStatusChange = async (naver_id: string, status: FirebaseStatus) => {
    try {
      const updates: Record<string, any> = { firebase_status: status };
      if (status === 'sent') {
        if (sentToday >= DAILY_SEND_CAP) {
          toast.error(`Daily send cap reached (${DAILY_SEND_CAP}/day) — try again tomorrow.`);
          return;
        }
        updates.last_contacted_at = new Date().toISOString();
      }
      await authReady;
      await updateDoc(doc(db, LEADS_COLLECTION, naver_id), updates);
      toast.success('Status updated successfully');
      fetchSavedLeads(); // Refresh
    } catch (err) {
      console.error("Failed to update status in Firebase", err);
      toast.error('Failed to update status');
    }
  };

  const handleVerifyEmail = async (naver_id: string) => {
    try {
      await authReady;
      await updateDoc(doc(db, LEADS_COLLECTION, naver_id), { email_verification: 'verified' });
      toast.success('Email marked as verified');
      fetchSavedLeads();
    } catch (err) {
      console.error("Failed to update verification in Firebase", err);
      toast.error('Failed to update verification');
    }
  };

  const sentToday = savedLeads.filter(l => {
    if (!l.last_contacted_at) return false;
    const d = new Date(l.last_contacted_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const DAILY_SEND_CAP = 8;

  const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const handleExportCSV = () => {
    if (savedLeads.length === 0) return;

    const headers = ['Name (EN)', 'Name (KR)', 'Type', 'City', 'District', 'Email', 'Phone', 'Website', 'Instagram', 'Priority', 'Status', 'Agent Notes', 'Naver ID'];
    const csvContent = [
      headers.join(','),
      ...savedLeads.map(l => [
        csvCell(l.institution_name_en), csvCell(l.institution_name_kr), csvCell(l.institution_type),
        csvCell(l.city), csvCell(l.district), csvCell(l.email), csvCell(l.phone),
        csvCell(l.website), csvCell(l.instagram), l.outreach_priority, csvCell(l.firebase_status),
        csvCell(l.agent_notes), csvCell(l.naver_id),
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'chekkiai_leads.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Database exported to CSV');
  };

  const filteredLeads = dbFilter === 'all' ? savedLeads : savedLeads.filter(l => l.firebase_status === dbFilter);

  // Shared between the Search tab's temporary results and the Database
  // tab's saved leads — drafting an email shouldn't require re-searching.
  const renderEmailDraftSection = (lead: EnrichedLead) =>
    !emailDrafts[lead.naver_id] ? (
      <button
        onClick={() => handleGenerateEmail(lead)}
        disabled={generatingEmails[lead.naver_id]}
        className="w-full py-3 px-4 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 font-semibold rounded-xl transition-colors active:scale-[0.97] flex items-center justify-center gap-2"
      >
        {generatingEmails[lead.naver_id] ? (
          <><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /> Generating Email Draft...</>
        ) : (
          <><Mail className="w-5 h-5 text-zinc-400" /> Generate Cold Email Draft</>
        )}
      </button>
    ) : (
      <EmailDraftCard
        draft={emailDrafts[lead.naver_id]}
        leadEmail={lead.email}
        onRegenerate={() => handleGenerateEmail(lead)}
        isGenerating={generatingEmails[lead.naver_id]}
      />
    );

  return (
    <div className="min-h-screen bg-brand-dark font-sans text-zinc-100">
      <Toaster position="top-right" richColors theme="dark" />
      <header className="bg-brand-dark/90 backdrop-blur border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-zinc-100 font-display">Chekki AI</h1>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Lead Enrichment</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-1 rounded-full backdrop-blur">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors active:scale-[0.97] ${activeTab === 'search' ? 'bg-orange-500/10 border border-orange-500/30 text-orange-500' : 'border border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              <div className="flex items-center gap-2"><Search className="w-4 h-4"/> Search</div>
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors active:scale-[0.97] ${activeTab === 'database' ? 'bg-orange-500/10 border border-orange-500/30 text-orange-500' : 'border border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              <div className="flex items-center gap-2"><Database className="w-4 h-4"/> Database</div>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'search' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Input */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Naver Search Section — double-bezel construction */}
              <div className="rounded-[2rem] border border-white/10 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="bg-brand-card p-6 rounded-[calc(2rem-0.375rem)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                <h2 className="text-lg font-semibold text-zinc-100 mb-2 font-display">Search Naver Maps</h2>
                <p className="text-sm text-zinc-500 mb-4">
                  Search directly using the Naver Local API to find leads.
                </p>

                <form onSubmit={(e) => handleSearch(e, 1)} className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-zinc-500" />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="e.g. 강남구 영어학원"
                      className="block w-full pl-10 pr-3 py-2.5 border border-white/10 rounded-xl leading-5 bg-black/20 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 sm:text-sm transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-4 py-2.5 bg-brand-orange hover:bg-orange-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold rounded-full shadow-lg shadow-orange-500/25 transition-colors active:scale-[0.97] flex items-center gap-2"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        Results {searchStart}-{Math.min(searchStart + 4, totalResults)} of {totalResults}
                      </span>
                      <div className="flex items-center gap-2">
                        <button onClick={handlePrevPage} disabled={searchStart === 1} className="p-1 rounded hover:bg-white/5 disabled:opacity-50"><ChevronLeft className="w-4 h-4"/></button>
                        <button onClick={handleNextPage} disabled={searchStart + 5 > totalResults} className="p-1 rounded hover:bg-white/5 disabled:opacity-50"><ChevronRight className="w-4 h-4"/></button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                      {searchResults.map((result, idx) => {
                        const isAlreadySaved = savedIds.has(getNaverId(result));
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectResult(result)}
                            className="w-full text-left p-3 rounded-xl border border-white/10 hover:border-orange-500/30 hover:bg-orange-500/5 transition-colors group relative"
                          >
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium text-zinc-100 group-hover:text-orange-400 pr-16">{stripHtml(result.title)}</h4>
                              {isAlreadySaved && (
                                <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Saved
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-zinc-500">
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="truncate">{result.address}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={handleBatchEnrich}
                      disabled={isBatchEnriching}
                      className="w-full mt-4 py-2.5 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/30 font-medium rounded-full transition-colors active:scale-[0.97] flex items-center justify-center gap-2"
                    >
                      {isBatchEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                      Batch Enrich All {searchResults.length} Results
                    </button>
                  </div>
                )}
              </div>
              </div>

              {/* Bulk Sweep Section — double-bezel construction */}
              <div className="rounded-[2rem] border border-white/10 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="bg-brand-card p-6 rounded-[calc(2rem-0.375rem)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                <h2 className="text-lg font-semibold text-zinc-100 mb-2 font-display">Bulk Sweep</h2>
                <p className="text-sm text-zinc-500 mb-4">
                  One query per line (e.g. district + institution type). Runs search → enrich → save unattended, skipping anything already in your database.
                </p>

                <div className="space-y-2 mb-3">
                  <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Districts</label>
                  <input
                    type="text"
                    value={matrixDistricts}
                    onChange={(e) => setMatrixDistricts(e.target.value)}
                    disabled={isBulkRunning}
                    placeholder="Districts, comma separated"
                    className="w-full px-3 py-2 border border-white/10 rounded-lg text-xs font-mono bg-black/20 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 disabled:opacity-50"
                  />
                  <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Keywords</label>
                  <input
                    type="text"
                    value={matrixKeywords}
                    onChange={(e) => setMatrixKeywords(e.target.value)}
                    disabled={isBulkRunning}
                    placeholder="Keywords, comma separated"
                    className="w-full px-3 py-2 border border-white/10 rounded-lg text-xs font-mono bg-black/20 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 disabled:opacity-50"
                  />
                  <button
                    onClick={handleGenerateMatrix}
                    disabled={isBulkRunning}
                    className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 text-xs font-semibold rounded-lg transition-colors active:scale-[0.97] disabled:opacity-50"
                  >
                    Generate combos
                  </button>
                </div>

                <textarea
                  value={bulkQueries}
                  onChange={(e) => setBulkQueries(e.target.value)}
                  disabled={isBulkRunning}
                  rows={5}
                  placeholder={'강남구 영어학원\n서초구 영어학원\n분당구 유치원'}
                  className="w-full px-3 py-2.5 border border-white/10 rounded-xl bg-black/20 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 sm:text-sm font-mono transition-colors disabled:opacity-50"
                />
                <button
                  onClick={handleBulkSweep}
                  disabled={isBulkRunning || !bulkQueries.trim()}
                  className="w-full mt-3 py-2.5 bg-brand-orange hover:bg-orange-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold rounded-full shadow-lg shadow-orange-500/25 transition-colors active:scale-[0.97] flex items-center justify-center gap-2"
                >
                  {isBulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  {isBulkRunning ? `Sweeping (${bulkStats.queriesDone}/${bulkStats.queriesTotal})...` : 'Run Bulk Sweep'}
                </button>

                {(isBulkRunning || bulkLog.length > 0) && (
                  <div className="mt-4">
                    <div className="flex items-center gap-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                      <span className="text-emerald-400">Saved {bulkStats.saved}</span>
                      <span className="text-zinc-500">Skipped {bulkStats.skipped}</span>
                      {bulkStats.failed > 0 && <span className="text-red-400">Failed {bulkStats.failed}</span>}
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 bg-black/20 rounded-lg border border-white/10 p-3">
                      {bulkLog.map((line, i) => (
                        <p key={i} className="text-xs text-zinc-400 font-mono">{line}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={motionTransition}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="text-sm">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Column: Output */}
            <div className="lg:col-span-7 space-y-6">
              <h2 className="text-lg font-semibold text-zinc-100 mb-2 font-display">Enriched Profiles</h2>

              <AnimatePresence mode="popLayout">
                {isLoading && enrichedLeads.length === 0 && (
                  <motion.div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p>Enriching lead data...</p>
                  </motion.div>
                )}

                {enrichedLeads.map((lead) => (
                  <motion.div
                    key={lead.naver_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionTransition}
                    className="space-y-4 pb-8 border-b border-white/10 last:border-0"
                  >
                    <LeadCard
                      lead={lead}
                      onSave={handleSaveLead}
                      isSaved={savedLeads.some(l => l.naver_id === lead.naver_id)}
                      onStatusChange={handleStatusChange}
                      onVerifyEmail={handleVerifyEmail}
                    />
                    {renderEmailDraftSection(lead)}
                  </motion.div>
                ))}

                {!isLoading && enrichedLeads.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={motionTransition}
                    className="h-96 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02]"
                  >
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                      <Sparkles className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h3 className="text-lg font-medium text-zinc-100 mb-1 font-display">No Data Yet</h3>
                    <p className="text-sm text-zinc-500 max-w-sm">
                      Search Naver Maps and select a result to enrich it.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* Database Tab */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-zinc-100 font-display">Saved Leads Database</h2>
                <span className="text-sm font-medium text-zinc-500">{filteredLeads.length} leads found</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Filter className="h-4 w-4 text-zinc-500" />
                  </div>
                  <select
                    value={dbFilter}
                    onChange={(e) => setDbFilter(e.target.value)}
                    className="pl-9 pr-8 py-2 border border-white/10 rounded-lg text-sm font-medium bg-black/20 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 appearance-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="not_contacted">Not Contacted</option>
                    <option value="pending">Pending</option>
                    <option value="sent">Sent</option>
                    <option value="replied">Replied</option>
                    <option value="bounced">Bounced</option>
                    <option value="opted_out">Opted Out</option>
                  </select>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${sentToday >= DAILY_SEND_CAP ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-white/5 text-zinc-400 border-white/10'}`}>
                  Sent today: {sentToday}/{DAILY_SEND_CAP}
                </span>
                <button
                  onClick={handleExportCSV}
                  disabled={savedLeads.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-200 text-sm font-medium rounded-lg transition-colors active:scale-[0.97] disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {isLoadingDb ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-zinc-500" /></div>
            ) : filteredLeads.length > 0 ? (
              <div className="grid grid-cols-1 gap-6">
                {filteredLeads.map(lead => (
                  <div key={lead.naver_id} className="space-y-4">
                    <LeadCard
                      lead={lead}
                      isSaved={true}
                      onStatusChange={handleStatusChange}
                      onVerifyEmail={handleVerifyEmail}
                    />
                    {renderEmailDraftSection(lead)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                <Database className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-100 font-display">No leads found</h3>
                <p className="text-sm text-zinc-500">
                  {dbFilter === 'all' ? 'Enrich some leads and click "Save to Database" to see them here.' : `No leads match the "${dbFilter}" status.`}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
