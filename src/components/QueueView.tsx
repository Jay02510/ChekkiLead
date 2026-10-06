import React, { useEffect, useRef } from 'react';
import { EnrichedLead, FirebaseStatus } from '../types';
import { ArrowLeft, Loader2, Search, Send, Inbox } from 'lucide-react';
import { LeadCard } from './LeadCard';
import { STATUS_DOT, STATUS_LABEL, STATUS_OPTIONS, priorityTone, sendBlockReason } from '../lib/leadUi';

export type DbSort = 'priority' | 'district' | 'date';

interface QueueViewProps {
  leads: EnrichedLead[];
  counts: Record<string, number>;
  isLoading: boolean;
  filter: string;
  onFilter: (v: string) => void;
  sort: DbSort;
  onSort: (v: DbSort) => void;
  showNonTargets: boolean;
  onShowNonTargets: (v: boolean) => void;
  listQuery: string;
  onListQuery: (v: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  detailOpen: boolean;
  onCloseDetail: () => void;
  checkedIds: Set<string>;
  onToggleChecked: (id: string) => void;
  onClearChecked: () => void;
  onBulkStatus: (status: FirebaseStatus) => void;
  onBulkDelete: () => void;
  onStatusChange: (naver_id: string, status: FirebaseStatus) => void;
  onVerifyEmail: (naver_id: string) => void;
  onReenrich: (naver_id: string) => Promise<void>;
  onReview: (naver_id: string, decision: 'confirm' | 'reject') => void;
  onEditContact: (naver_id: string, updates: Record<string, string | null>) => Promise<boolean>;
  onDelete: (naver_id: string) => void;
  onSendAndNext: (lead: EnrichedLead) => void;
  renderDraft: (lead: EnrichedLead) => React.ReactNode;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50';

const FILTERS: { value: string; label: string }[] = [
  { value: 'not_contacted', label: 'New' },
  { value: 'review', label: 'Review' },
  // Swept but not yet enriched, or enrichment failed (see api/cron-enrich.ts).
  { value: 'queue', label: 'Awaiting enrichment' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'replied', label: 'Replied' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'opted_out', label: 'Opted out' },
  { value: 'all', label: 'All' },
];

export function QueueView(p: QueueViewProps) {
  const selected = p.leads.find(l => l.naver_id === p.selectedId) || null;
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // j/k or arrow keys walk the queue; ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      const down = e.key === 'ArrowDown' || e.key === 'j';
      const up = e.key === 'ArrowUp' || e.key === 'k';
      if (!down && !up) return;
      const i = p.leads.findIndex(l => l.naver_id === p.selectedId);
      const next = p.leads[down ? Math.min(p.leads.length - 1, i + 1) : Math.max(0, i - 1)];
      if (next) {
        e.preventDefault();
        p.onSelect(next.naver_id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.leads, p.selectedId, p.onSelect]);

  useEffect(() => {
    if (p.selectedId) rowRefs.current[p.selectedId]?.scrollIntoView({ block: 'nearest' });
  }, [p.selectedId]);

  const blockReason = selected ? sendBlockReason(selected) : null;
  const alreadySent = selected ? ['sent', 'replied'].includes(selected.firebase_status) : false;

  return (
    <div className="grid lg:grid-cols-[minmax(320px,380px)_1fr] h-[calc(100vh-3.5rem)]">
      {/* Rail */}
      <aside className={`${p.detailOpen ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 border-r border-white/10`}>
        <div className="p-4 space-y-3 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" aria-hidden />
            <input
              type="search"
              value={p.listQuery}
              onChange={(e) => p.onListQuery(e.target.value)}
              placeholder="Filter by name or district"
              aria-label="Filter leads"
              className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-black/30 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:border-orange-500/60 ${focusRing}`}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => p.onFilter(f.value)}
                aria-pressed={p.filter === f.value}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${focusRing} ${p.filter === f.value ? 'bg-orange-500/15 border-orange-500/40 text-orange-300' : 'border-white/10 text-zinc-300 hover:bg-white/5'}`}
              >
                {f.label} <span className="tabular-nums text-zinc-400">{p.counts[f.value] ?? 0}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={p.showNonTargets} onChange={(e) => p.onShowNonTargets(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
            Show non-targets
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Sort
            <select
              value={p.sort}
              onChange={(e) => p.onSort(e.target.value as DbSort)}
              className={`bg-black/30 border border-white/10 rounded-md px-2 py-1 text-zinc-200 text-xs cursor-pointer ${focusRing}`}
            >
              <option value="priority">Priority</option>
              <option value="district">District</option>
              <option value="date">Date added</option>
            </select>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Leads">
          {p.isLoading && p.leads.length === 0 ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" aria-label="Loading" /></div>
          ) : p.leads.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-zinc-400">
              <Inbox className="w-8 h-8 mx-auto mb-3 text-zinc-500" aria-hidden />
              {p.filter === 'all' && !p.listQuery ? 'No saved leads yet. Use Find to add some.' : 'Nothing matches this filter.'}
              {p.filter !== 'all' && (
                <button onClick={() => { p.onFilter('all'); p.onListQuery(''); }} className={`block mx-auto mt-3 text-orange-300 hover:text-orange-200 font-medium rounded ${focusRing}`}>Show all leads</button>
              )}
            </div>
          ) : (
            <ul>
              {p.leads.map(lead => {
                const active = lead.naver_id === p.selectedId;
                const locked = lead.firebase_status === 'opted_out';
                return (
                  <li key={lead.naver_id} className={`flex items-stretch border-b border-white/5 ${active ? 'bg-orange-500/[0.07]' : 'hover:bg-white/[0.03]'}`}>
                    <label className="flex items-center pl-4 pr-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.checkedIds.has(lead.naver_id)}
                        onChange={() => p.onToggleChecked(lead.naver_id)}
                        disabled={locked}
                        title={locked ? 'Opted-out leads are locked out of bulk actions' : undefined}
                        aria-label={`Select ${lead.institution_name_en}`}
                        className="w-4 h-4 accent-orange-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                    </label>
                    <button
                      ref={(el) => { rowRefs.current[lead.naver_id] = el; }}
                      role="option"
                      aria-selected={active}
                      onClick={() => p.onSelect(lead.naver_id)}
                      className={`flex-1 min-w-0 text-left py-3 pl-2 pr-4 ${focusRing} focus-visible:ring-inset`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`truncate text-sm font-medium break-keep ${active ? 'text-zinc-50' : 'text-zinc-100'} ${locked ? 'line-through decoration-zinc-600' : ''}`}>{lead.institution_name_en}</span>
                        <span className={`shrink-0 text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded border ${priorityTone(lead.outreach_priority)}`}>P{lead.outreach_priority}</span>
                      </span>
                      <span className="flex items-center justify-between gap-3 mt-0.5">
                        <span className="truncate text-xs text-zinc-400 font-korean">{lead.institution_name_kr} · {lead.district}</span>
                        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-zinc-300">
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[lead.firebase_status]}`} aria-hidden />
                          {STATUS_LABEL[lead.firebase_status]}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {p.checkedIds.size > 0 && (
          <div className="p-3 border-t border-white/10 bg-brand-card space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-orange-300">{p.checkedIds.size} selected</span>
              <button onClick={p.onClearChecked} className={`text-xs text-zinc-400 hover:text-zinc-200 rounded ${focusRing}`}>Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['sent', 'replied', 'opted_out'] as FirebaseStatus[]).map(s => (
                <button key={s} onClick={() => p.onBulkStatus(s)} className={`px-2.5 py-1 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 active:scale-[0.97] ${focusRing}`}>
                  Mark {STATUS_LABEL[s].toLowerCase()}
                </button>
              ))}
              <button onClick={p.onBulkDelete} className={`px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-300 active:scale-[0.97] ${focusRing}`}>Remove</button>
            </div>
          </div>
        )}
      </aside>

      {/* Workbench */}
      <section className={`${p.detailOpen ? 'block' : 'hidden lg:block'} min-h-0 overflow-y-auto`} aria-label="Lead workbench">
        {selected ? (
          <>
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 px-5 sm:px-8 py-3 bg-brand-dark/95 backdrop-blur border-b border-white/10">
              <button onClick={p.onCloseDetail} className={`lg:hidden inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white rounded ${focusRing}`}>
                <ArrowLeft className="w-4 h-4" aria-hidden /> Leads
              </button>
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                Status
                <select
                  value={selected.firebase_status}
                  onChange={(e) => p.onStatusChange(selected.naver_id, e.target.value as FirebaseStatus)}
                  disabled={selected.firebase_status === 'opted_out'}
                  className={`bg-black/30 text-zinc-100 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
                >
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <div className="ml-auto flex items-center gap-3">
                {blockReason && !alreadySent && <span className="text-xs text-amber-300">{blockReason}</span>}
                <button
                  onClick={() => p.onSendAndNext(selected)}
                  disabled={!!blockReason || alreadySent}
                  title={alreadySent ? 'Already marked sent' : blockReason || 'Record this email as sent and move to the next lead'}
                  className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold bg-brand-orange text-black hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors active:scale-[0.97] ${focusRing}`}
                >
                  <Send className="w-4 h-4" aria-hidden />
                  Mark sent, next lead
                </button>
              </div>
            </div>
            <div className="p-5 sm:p-8 max-w-4xl space-y-6">
              <LeadCard
                lead={selected}
                isSaved
                hideStatus
                onStatusChange={p.onStatusChange}
                onVerifyEmail={p.onVerifyEmail}
                onEditContact={p.onEditContact}
                onReview={p.onReview}
                onReenrich={p.onReenrich}
                onDelete={p.onDelete}
              />
              {p.renderDraft(selected)}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-zinc-400 p-8 text-center">
            {p.leads.length === 0 ? 'Pick a filter with leads, or use Find to add some.' : 'Select a lead to see its details and draft an email.'}
          </div>
        )}
      </section>
    </div>
  );
}
