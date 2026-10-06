import React, { useState, useEffect, useMemo } from 'react';
import { enrichLead, generateEmailDraft } from './services/geminiService';
import { EnrichedLead, EmailDraft, NaverSearchResult, FirebaseStatus } from './types';
import { getNaverId, stripHtml } from './lib/naverId';
import { isLikelyTarget } from './lib/leadFilter';
import { LeadCard } from './components/LeadCard';
import { EmailDraftCard } from './components/EmailDraftCard';
import { QueueView, DbSort } from './components/QueueView';
import { isBlockedFromSending, factView } from './lib/leadUi';
import { LEADS, DEV_LEADS, LEGACY_LEADS } from './lib/collections';
import { blocklistFromDocs } from './lib/blocklist';
import { buildQueries, NEIGHBOURHOODS, KEYWORDS } from './lib/searchPlan';
import { Loader2, Sparkles, AlertCircle, Mail, Search, MapPin, ChevronLeft, ChevronRight, Layers, CheckCircle2, Download, Inbox } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { collection, getDocs, doc, setDoc, updateDoc, query, orderBy, arrayUnion } from 'firebase/firestore';
import { db, authReady } from './lib/firebase';
import { Toaster, toast } from 'sonner';

// Keeps local dev writes out of the real outreach data — `npm run dev`
// (import.meta.env.DEV) writes to a separate collection than production.
const LEADS_COLLECTION = import.meta.env.DEV ? DEV_LEADS : LEADS;

export default function App() {
  const shouldReduceMotion = useReducedMotion();
  const motionTransition = shouldReduceMotion ? { duration: 0 } : undefined;
  const [activeTab, setActiveTab] = useState<'search' | 'database'>('database');
  
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
  // naver_ids in the legacy collection that must never be enriched again
  // (see src/lib/blocklist.ts). `null` means it hasn't loaded yet, which
  // blocks enrichment rather than risking a second email to an opt-out.
  const [blocklist, setBlocklist] = useState<Set<string> | null>(null);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbFilter, setDbFilter] = useState<string>('not_contacted');
  const [dbSort, setDbSort] = useState<DbSort>('priority');
  const [listQuery, setListQuery] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk Sweep State — runs a list of queries unattended: search -> dedupe -> enrich -> save
  const [bulkQueries, setBulkQueries] = useState('');
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkLog, setBulkLog] = useState<string[]>([]);
  const [bulkStats, setBulkStats] = useState({ queriesDone: 0, queriesTotal: 0, saved: 0, skipped: 0, blocked: 0, filtered: 0, failed: 0 });

  useEffect(() => {
    // Always fetch saved leads on mount so we can cross-reference in search
    fetchSavedLeads();
    fetchBlocklist();
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

  const fetchBlocklist = async () => {
    try {
      await authReady;
      const snap = await getDocs(collection(db, LEGACY_LEADS));
      setBlocklist(blocklistFromDocs(snap.docs));
    } catch (err) {
      console.error('Failed to load the contact blocklist', err);
      toast.error('Could not load the contact blocklist — enrichment is paused so no opted-out academy is contacted twice.');
    }
  };

  // Returns the loaded blocklist, or null after telling the user why we won't
  // enrich without it.
  const requireBlocklist = (): Set<string> | null => {
    if (!blocklist) {
      toast.error('Contact blocklist not loaded yet — reload the page before enriching.');
      fetchBlocklist();
      return null;
    }
    return blocklist;
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
    handleEnrichWithData(result);
  };

  const handleEnrichWithData = async (item: NaverSearchResult) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await enrichLead(item);
      setEnrichedLeads([result]); // Replace current view with single result
    } catch (err: any) {
      setError(err.message || 'An error occurred while enriching the lead.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchEnrich = async () => {
    if (searchResults.length === 0) return;

    const blocked = requireBlocklist();
    if (!blocked) return;

    const unsaved = searchResults.filter(r => !savedIds.has(getNaverId(r)));
    const allowed = unsaved.filter(r => !blocked.has(getNaverId(r)));
    const toProcess = allowed.filter(isLikelyTarget);
    const skipped = searchResults.length - unsaved.length;
    const blockedCount = unsaved.length - allowed.length;
    const filtered = allowed.length - toProcess.length;
    if (blockedCount > 0) {
      toast.info(`Blocked ${blockedCount} result${blockedCount > 1 ? 's' : ''} already contacted or removed under the old pipeline`);
    }
    if (skipped > 0) {
      toast.info(`Skipping ${skipped} result${skipped > 1 ? 's' : ''} already in your database`);
    }
    if (filtered > 0) {
      toast.info(`Filtered ${filtered} non-target result${filtered > 1 ? 's' : ''} (test-prep, kindergarten or not a school)`);
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
        const result = await enrichLead(item);
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

  // Queries come from src/lib/searchPlan.ts, so the UI sweep and the cron
  // search the same neighbourhoods. You can still edit the list by hand before
  // running it.
  const handleGenerateMatrix = () => {
    const queries = buildQueries();
    setBulkQueries(queries.join('\n'));
    toast.success(`Filled ${queries.length} queries from the search plan`);
  };

  const handleBulkSweep = async () => {
    const queries = bulkQueries.split('\n').map(q => q.trim()).filter(Boolean);
    if (queries.length === 0 || isBulkRunning) return;
    const blocked = requireBlocklist();
    if (!blocked) return;

    setIsBulkRunning(true);
    setBulkLog([]);
    setBulkStats({ queriesDone: 0, queriesTotal: queries.length, saved: 0, skipped: 0, blocked: 0, filtered: 0, failed: 0 });

    await authReady;
    const seen = new Set(savedIds);

    // One page per query — Naver Local Search has no usable paging, so start=6
    // returns nothing new. Breadth comes from more neighbourhoods instead.
    for (const q of queries) {
      let data: any;
      try {
        const res = await fetch(`/api/naver-search?query=${encodeURIComponent(q)}&start=1`);
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Naver search failed');
      } catch (err: any) {
        setBulkLog(l => [`Search failed for "${q}": ${err.message}`, ...l]);
        setBulkStats(s => ({ ...s, queriesDone: s.queriesDone + 1 }));
        continue;
      }

      const items: NaverSearchResult[] = data.items || [];

      for (const item of items) {
        const naverId = getNaverId(item);
        if (seen.has(naverId)) {
          setBulkStats(s => ({ ...s, skipped: s.skipped + 1 }));
          continue;
        }
        seen.add(naverId);
        if (blocked.has(naverId)) {
          setBulkStats(s => ({ ...s, blocked: s.blocked + 1 }));
          setBulkLog(l => [`Blocked: ${stripHtml(item.title)} (contacted or removed under the old pipeline)`, ...l]);
          continue;
        }
        if (!isLikelyTarget(item)) {
          setBulkStats(s => ({ ...s, filtered: s.filtered + 1 }));
          setBulkLog(l => [`Filtered: ${stripHtml(item.title)} (${item.category})`, ...l]);
          continue;
        }
        try {
          const enriched = await enrichLead(item);
          await setDoc(doc(db, LEADS_COLLECTION, enriched.naver_id), { ...enriched, saved_at: new Date().toISOString() });
          setBulkStats(s => ({ ...s, saved: s.saved + 1 }));
          setBulkLog(l => [`Saved: ${stripHtml(item.title)}`, ...l]);
        } catch (err: any) {
          setBulkStats(s => ({ ...s, failed: s.failed + 1 }));
          setBulkLog(l => [`Failed: ${stripHtml(item.title)} — ${err.message}`, ...l]);
        }
        await new Promise(res => setTimeout(res, 400)); // stay clear of Gemini rate limits
      }

      await new Promise(res => setTimeout(res, 300)); // stay clear of Naver rate limits
      setBulkStats(s => ({ ...s, queriesDone: s.queriesDone + 1 }));
    }

    setIsBulkRunning(false);
    fetchSavedLeads();
    toast.success(`Bulk sweep done — ${queries.length} quer${queries.length > 1 ? 'ies' : 'y'} processed`);
  };

  const handleGenerateEmail = async (lead: EnrichedLead) => {
    if (lead.firebase_status === 'opted_out') {
      toast.error('This lead opted out — email generation is blocked.');
      return;
    }
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
    const blocked = requireBlocklist();
    if (!blocked) return;
    if (blocked.has(lead.naver_id)) {
      toast.error('This academy was already contacted or removed under the old pipeline — it can\'t be added again.');
      return;
    }
    try {
      await authReady;
      await setDoc(doc(db, LEADS_COLLECTION, lead.naver_id), { ...lead, saved_at: new Date().toISOString() });
      toast.success('Lead saved', {
        action: { label: 'Open in Leads', onClick: () => { setDbFilter('all'); setListQuery(''); setSelectedLeadId(lead.naver_id); setDetailOpen(true); setActiveTab('database'); } },
      });
      fetchSavedLeads(); // Refresh to update "Saved" badges
    } catch (err) {
      console.error(err);
      toast.error('Failed to save lead. Check your configuration.');
    }
  };

  const handleStatusChange = async (naver_id: string, status: FirebaseStatus): Promise<boolean> => {
    const current = savedLeads.find(l => l.naver_id === naver_id);
    if (current?.firebase_status === 'opted_out') {
      toast.error('This lead opted out — status is locked.');
      return false;
    }
    try {
      const updates: Record<string, any> = { firebase_status: status };
      if (status === 'sent') {
        if (sentToday >= DAILY_SEND_CAP) {
          toast.error(`Daily send cap reached (${DAILY_SEND_CAP}/day) — try again tomorrow.`);
          return false;
        }
        updates.last_contacted_at = new Date().toISOString();
      }
      await authReady;
      await updateDoc(doc(db, LEADS_COLLECTION, naver_id), updates);
      toast.success('Status updated successfully');
      fetchSavedLeads(); // Refresh
      return true;
    } catch (err) {
      console.error("Failed to update status in Firebase", err);
      toast.error('Failed to update status');
      return false;
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

  const handleEditContact = async (naver_id: string, updates: Record<string, string | null>): Promise<boolean> => {
    try {
      await authReady;
      // Re-enrichment keeps whatever was typed in by hand.
      const typed = ['email', 'student_age_range', 'approx_students', 'personalization_hook'].filter(k => k in updates);
      await updateDoc(doc(db, LEADS_COLLECTION, naver_id), typed.length ? { ...updates, manual_fields: arrayUnion(...typed) } : updates);
      toast.success('Contact details saved');
      fetchSavedLeads();
      return true;
    } catch (err) {
      console.error("Failed to save contact details in Firebase", err);
      toast.error('Failed to save contact details');
      return false;
    }
  };

  // Manual review of a lead whose listing didn't name English: confirm it
  // teaches English, or mark it a non-target (kept so sweeps don't re-add it).
  const handleReviewLead = async (naver_id: string, decision: 'confirm' | 'reject') => {
    const updates = decision === 'confirm'
      ? { needs_review: false, english_signal: 'confirmed' }
      : { needs_review: false, non_target: true };
    try {
      await authReady;
      await updateDoc(doc(db, LEADS_COLLECTION, naver_id), updates);
      toast.success(decision === 'confirm' ? 'Marked as teaching English' : 'Marked as not a fit');
      fetchSavedLeads();
    } catch (err) {
      console.error("Failed to save review in Firebase", err);
      toast.error('Failed to save review');
    }
  };

  // Server-side: collects sources if stale, enriches from them, saves the lead.
  const handleReenrich = async (naver_id: string) => {
    try {
      await authReady;
      const res = await fetch('/api/enrich-grounded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naver_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Re-enrich failed');
      toast.success(data.collected ? 'Read new sources and updated the lead' : 'Updated the lead from its sources');
      fetchSavedLeads();
    } catch (err: any) {
      console.error("Failed to re-enrich lead", err);
      toast.error(err.message || 'Re-enrich failed');
    }
  };

  const handleDeleteLead = async (naver_id: string) => {
    // Soft delete only — a hard delete removes the doc from the dedupe set,
    // so the next cron sweep or Bulk Sweep could re-add and re-contact an
    // academy that was deliberately removed (including an opted-out one).
    if (!window.confirm('Remove this lead from your list? It stays recorded so it won\'t be re-added by a future sweep.')) return;
    try {
      await authReady;
      await updateDoc(doc(db, LEADS_COLLECTION, naver_id), { deleted: true });
      toast.success('Lead removed');
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(naver_id);
        return next;
      });
      fetchSavedLeads();
    } catch (err) {
      console.error("Failed to delete lead from Firebase", err);
      toast.error('Failed to delete lead');
    }
  };

  const toggleSelect = (naver_id: string) => {
    const lead = savedLeads.find(l => l.naver_id === naver_id);
    if (lead?.firebase_status === 'opted_out') return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(naver_id)) next.delete(naver_id);
      else next.add(naver_id);
      return next;
    });
  };

  const handleBulkStatusChange = async (status: FirebaseStatus) => {
    if (selectedIds.size === 0) return;
    if (status === 'sent' && sentToday + selectedIds.size > DAILY_SEND_CAP) {
      toast.error(`That would put you over the daily send cap (${DAILY_SEND_CAP}/day) — select fewer leads.`);
      return;
    }

    let targets = [...selectedIds];
    if (status === 'sent') {
      const blocked = targets
        .map(id => savedLeads.find(l => l.naver_id === id))
        .filter((l): l is EnrichedLead => !!l && isBlockedFromSending(l));
      if (blocked.length > 0) {
        const blockedIds = new Set(blocked.map(l => l.naver_id));
        targets = targets.filter(id => !blockedIds.has(id));
        toast.error(`Skipped ${blocked.length} lead${blocked.length > 1 ? 's' : ''} (email not verified): ${blocked.map(l => l.institution_name_en).join(', ')}`);
      }
    }

    for (const naver_id of targets) {
      await handleStatusChange(naver_id, status);
    }
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Remove ${selectedIds.size} lead${selectedIds.size > 1 ? 's' : ''} from your list? They stay recorded so they won't be re-added by a future sweep.`)) return;
    try {
      await authReady;
      await Promise.all([...selectedIds].map(naver_id => updateDoc(doc(db, LEADS_COLLECTION, naver_id), { deleted: true })));
      toast.success(`${selectedIds.size} lead${selectedIds.size > 1 ? 's' : ''} removed`);
      setSelectedIds(new Set());
      fetchSavedLeads();
    } catch (err) {
      console.error("Failed to bulk delete leads from Firebase", err);
      toast.error('Failed to delete some leads');
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

  // savedLeads itself keeps soft-deleted leads (needed for dedupe — see
  // handleBulkSweep's `seen` set); only the list view hides them.
  const [showNonTargets, setShowNonTargets] = useState(false);
  const visibleLeads = savedLeads.filter(l => !l.deleted && (showNonTargets || !l.non_target));
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: visibleLeads.length };
    // Leads waiting on an English check live in Review, not in the status queues.
    visibleLeads.forEach(l => {
      const key = l.needs_review ? 'review' : l.firebase_status;
      c[key] = (c[key] || 0) + 1;
    });
    return c;
  }, [savedLeads]);
  const q = listQuery.trim().toLowerCase();
  const filteredLeads = [...(dbFilter === 'all' ? visibleLeads
      : dbFilter === 'review' ? visibleLeads.filter(l => l.needs_review)
      : visibleLeads.filter(l => !l.needs_review && l.firebase_status === dbFilter))]
    .filter(l => !q || [l.institution_name_en, l.institution_name_kr, l.district, l.city].some(f => (f || '').toLowerCase().includes(q)))
    .sort((a, b) => {
      if (dbSort === 'district') return (a.district || '').localeCompare(b.district || '');
      if (dbSort === 'date') return (b.saved_at || '').localeCompare(a.saved_at || '');
      return b.outreach_priority - a.outreach_priority;
    });

  // Keep a lead selected: when the current one leaves the list (filtered
  // out, or just marked sent), fall back to the first remaining lead.
  useEffect(() => {
    if (!filteredLeads.some(l => l.naver_id === selectedLeadId)) {
      setSelectedLeadId(filteredLeads[0]?.naver_id ?? null);
    }
  }, [filteredLeads.map(l => l.naver_id).join('|')]);

  const handleSendAndNext = async (lead: EnrichedLead) => {
    const i = filteredLeads.findIndex(l => l.naver_id === lead.naver_id);
    const next = filteredLeads[i + 1] ?? filteredLeads[i - 1];
    if (await handleStatusChange(lead.naver_id, 'sent')) {
      setSelectedLeadId(next?.naver_id ?? null);
    }
  };

  // Shared between the Search tab's temporary results and the Database
  // tab's saved leads — drafting an email shouldn't require re-searching.
  const renderEmailDraftSection = (lead: EnrichedLead) => {
    const optedOut = lead.firebase_status === 'opted_out';
    if (optedOut && !emailDrafts[lead.naver_id]) {
      return (
        <div className="w-full py-3 px-4 bg-white/[0.02] border border-white/10 text-zinc-500 text-sm rounded-xl text-center">
          This lead opted out — email generation is blocked.
        </div>
      );
    }
    const hook = factView(lead.facts?.hook);
    return !emailDrafts[lead.naver_id] ? (
      <div className="space-y-3">
      {hook.kind !== 'not_found' && hook.quote && (
        <blockquote className="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] text-sm text-zinc-300 font-korean">
          <p className="text-xs text-zinc-400 mb-1">Email opening will use ({hook.kind})</p>
          “{hook.quote}”
          {hook.url && <a href={hook.url} target="_blank" rel="noreferrer" className={`block mt-1 text-xs text-orange-300 hover:underline underline-offset-2 break-all rounded ${focusRing}`}>{hook.url}</a>}
        </blockquote>
      )}
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
      </div>
    ) : (
      <EmailDraftCard
        draft={emailDrafts[lead.naver_id]}
        leadEmail={lead.email}
        onRegenerate={optedOut ? undefined : () => handleGenerateEmail(lead)}
        isGenerating={generatingEmails[lead.naver_id]}
      />
    );
  };


  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50';
  const inputClass = `w-full px-3 py-2 text-sm rounded-lg bg-black/30 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:border-orange-500/60 disabled:opacity-50 ${focusRing}`;
  const panel = 'rounded-2xl border border-white/10 bg-brand-card';

  return (
    <div className="min-h-screen bg-brand-dark font-sans text-zinc-100">
      <Toaster position="top-right" richColors theme="dark" />
      <header className="bg-brand-dark/90 backdrop-blur border-b border-white/10 sticky top-0 z-20 h-14">
        <div className="h-full px-4 sm:px-6 flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-black" aria-hidden />
            </div>
            <h1 className="text-lg font-black tracking-tight font-display">Chekki AI</h1>
          </div>
          <nav className="flex items-center gap-1 h-full" aria-label="Views">
            {([['database', 'Leads', Inbox], ['search', 'Find', Search]] as const).map(([tab, label, Icon]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
                className={`h-full px-3 inline-flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${focusRing} ${activeTab === tab ? 'border-orange-500 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-100'}`}
              >
                <Icon className="w-4 h-4" aria-hidden /> {label}
                {tab === 'database' && <span className="text-xs tabular-nums text-zinc-400">{visibleLeads.length}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2" title="Emails marked sent today against the daily cap">
              <span className={`text-sm tabular-nums ${sentToday >= DAILY_SEND_CAP ? 'text-red-300' : 'text-zinc-300'}`}>Sent today {sentToday}/{DAILY_SEND_CAP}</span>
              <span className="hidden sm:flex gap-0.5" aria-hidden>
                {Array.from({ length: DAILY_SEND_CAP }, (_, i) => (
                  <span key={i} className={`w-1.5 h-4 rounded-sm ${i < sentToday ? (sentToday >= DAILY_SEND_CAP ? 'bg-red-400' : 'bg-brand-orange') : 'bg-white/10'}`} />
                ))}
              </span>
            </div>
            <button
              onClick={handleExportCSV}
              disabled={savedLeads.length === 0}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors active:scale-[0.97] disabled:opacity-50 ${focusRing}`}
            >
              <Download className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'database' ? (
        <QueueView
          leads={filteredLeads}
          counts={counts}
          isLoading={isLoadingDb}
          filter={dbFilter}
          onFilter={setDbFilter}
          sort={dbSort}
          onSort={setDbSort}
          showNonTargets={showNonTargets}
          onShowNonTargets={setShowNonTargets}
          listQuery={listQuery}
          onListQuery={setListQuery}
          selectedId={selectedLeadId}
          onSelect={(id) => { setSelectedLeadId(id); setDetailOpen(true); }}
          detailOpen={detailOpen}
          onCloseDetail={() => setDetailOpen(false)}
          checkedIds={selectedIds}
          onToggleChecked={toggleSelect}
          onClearChecked={() => setSelectedIds(new Set())}
          onBulkStatus={handleBulkStatusChange}
          onBulkDelete={handleBulkDelete}
          onStatusChange={handleStatusChange}
          onVerifyEmail={handleVerifyEmail}
          onEditContact={handleEditContact}
          onReview={handleReviewLead}
          onReenrich={handleReenrich}
          onDelete={handleDeleteLead}
          onSendAndNext={handleSendAndNext}
          renderDraft={renderEmailDraftSection}
        />
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-6">
              <section className={`${panel} p-5 sm:p-6`}>
                <h2 className="text-lg font-semibold font-display">Search Naver Maps</h2>
                <form onSubmit={(e) => handleSearch(e, 1)} className="flex gap-2 mt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" aria-hidden />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="e.g. 강남구 영어학원"
                      aria-label="Search query"
                      className={`${inputClass} pl-9 py-2.5`}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className={`px-5 py-2.5 bg-brand-orange hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black text-sm font-semibold rounded-full transition-colors active:scale-[0.97] flex items-center gap-2 ${focusRing}`}
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Searching" /> : 'Search'}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-zinc-300 tabular-nums">
                        {searchStart}–{Math.min(searchStart + 4, totalResults)} of {totalResults}
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={handlePrevPage} disabled={searchStart === 1} aria-label="Previous page" className={`p-1.5 rounded hover:bg-white/5 disabled:opacity-40 ${focusRing}`}><ChevronLeft className="w-4 h-4" /></button>
                        <button onClick={handleNextPage} disabled={searchStart + 5 > totalResults} aria-label="Next page" className={`p-1.5 rounded hover:bg-white/5 disabled:opacity-40 ${focusRing}`}><ChevronRight className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {searchResults.map((result) => {
                        const isAlreadySaved = savedIds.has(getNaverId(result));
                        return (
                          <li key={getNaverId(result)}>
                            <button
                              onClick={() => handleSelectResult(result)}
                              className={`w-full text-left p-3 rounded-xl border border-white/10 hover:border-orange-500/40 hover:bg-orange-500/5 transition-colors ${focusRing}`}
                            >
                              <span className="flex justify-between items-start gap-3">
                                <span className="font-medium text-zinc-100 break-keep">{stripHtml(result.title)}</span>
                                {isAlreadySaved && (
                                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                                    <CheckCircle2 className="w-3 h-3" aria-hidden /> Saved
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-1.5 mt-1 text-xs text-zinc-400">
                                <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                <span className="truncate">{result.address}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      onClick={handleBatchEnrich}
                      disabled={isBatchEnriching}
                      className={`w-full mt-4 py-2.5 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 border border-orange-500/30 text-sm font-medium rounded-full transition-colors active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-60 ${focusRing}`}
                    >
                      {isBatchEnriching ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Layers className="w-4 h-4" aria-hidden />}
                      Enrich all {searchResults.length} results
                    </button>
                  </div>
                )}
              </section>

              <details className={`${panel} group`} open={isBulkRunning || bulkLog.length > 0}>
                <summary className={`cursor-pointer list-none p-5 sm:p-6 flex items-center justify-between rounded-2xl ${focusRing}`}>
                  <span>
                    <span className="block text-lg font-semibold font-display">Bulk sweep</span>
                    <span className="block text-sm text-zinc-400 mt-0.5">Search, enrich and save many queries unattended.</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="px-5 sm:px-6 pb-6 space-y-3">
                  <p className="text-sm text-zinc-400">One query per line. Anything already in your database, or already contacted, is skipped.</p>
                  <button
                    onClick={handleGenerateMatrix}
                    disabled={isBulkRunning}
                    className={`w-full px-3 py-2 bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-sm font-medium rounded-lg transition-colors active:scale-[0.97] disabled:opacity-50 ${focusRing}`}
                  >
                    Fill from the search plan ({NEIGHBOURHOODS.length} 동 × {KEYWORDS.length} keywords)
                  </button>
                  <textarea
                    value={bulkQueries}
                    onChange={(e) => setBulkQueries(e.target.value)}
                    disabled={isBulkRunning}
                    rows={5}
                    aria-label="Bulk queries"
                    placeholder={'대치동 영어유치원\n역삼동 키즈영어\n정자동 유치원'}
                    className={`${inputClass} font-mono`}
                  />
                  <button
                    onClick={handleBulkSweep}
                    disabled={isBulkRunning || !bulkQueries.trim()}
                    className={`w-full py-2.5 bg-brand-orange hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black text-sm font-semibold rounded-full transition-colors active:scale-[0.97] flex items-center justify-center gap-2 ${focusRing}`}
                  >
                    {isBulkRunning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Layers className="w-4 h-4" aria-hidden />}
                    {isBulkRunning ? `Sweeping ${bulkStats.queriesDone}/${bulkStats.queriesTotal}…` : 'Run bulk sweep'}
                  </button>
                  {(isBulkRunning || bulkLog.length > 0) && (
                    <div>
                      <div className="flex items-center gap-3 text-sm mb-2 tabular-nums">
                        <span className="text-emerald-300">Saved {bulkStats.saved}</span>
                        <span className="text-zinc-400">Skipped {bulkStats.skipped}</span>
                        <span className="text-zinc-400">Filtered {bulkStats.filtered}</span>
                        {bulkStats.blocked > 0 && <span className="text-amber-300">Blocked {bulkStats.blocked}</span>}
                        {bulkStats.failed > 0 && <span className="text-red-300">Failed {bulkStats.failed}</span>}
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1 bg-black/30 rounded-lg border border-white/10 p-3" role="log">
                        {bulkLog.map((line, i) => (
                          <p key={i} className="text-xs text-zinc-300 font-mono">{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={motionTransition}
                    role="alert"
                    className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl flex items-start gap-3 text-red-300"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
                    <p className="text-sm">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <h2 className="text-lg font-semibold font-display">Enriched profiles</h2>

              {isLoading && enrichedLeads.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-400" role="status">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" aria-hidden />
                  <p>Enriching lead data…</p>
                </div>
              )}

              {enrichedLeads.map((lead) => (
                <motion.div
                  key={lead.naver_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={motionTransition}
                  className="space-y-6 pb-8 border-b border-white/10 last:border-0"
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
                <div className="py-20 flex flex-col items-center text-center border border-dashed border-white/10 rounded-2xl">
                  <Sparkles className="w-8 h-8 text-zinc-500 mb-4" aria-hidden />
                  <h3 className="text-lg font-medium font-display mb-1">Nothing enriched yet</h3>
                  <p className="text-sm text-zinc-400 max-w-sm">Search Naver Maps and pick a result to enrich it. Saved leads land in the Leads queue.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
