import React, { useEffect, useState } from 'react';
import { EnrichedLead, FirebaseStatus } from '../types';
import { MapPin, Phone, Globe, Mail, Users, GraduationCap, Star, Save, ShieldCheck, ShieldAlert, Trash2, Building2, Pencil } from 'lucide-react';
import { STATUS_OPTIONS, institutionLabel, priorityTone, needsVerification, buildContactUpdate } from '../lib/leadUi';

interface LeadCardProps {
  lead: EnrichedLead;
  isSaved?: boolean;
  // The queue view owns the status control in its action bar.
  hideStatus?: boolean;
  onSave?: (lead: EnrichedLead) => void;
  onStatusChange?: (naver_id: string, status: FirebaseStatus) => void;
  onVerifyEmail?: (naver_id: string) => void;
  onDelete?: (naver_id: string) => void;
  // Saves hand-entered contact details; resolves true when the save worked.
  onEditContact?: (naver_id: string, updates: Record<string, string | null>) => Promise<boolean>;
  key?: string | number;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50';

function Field({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <Icon className="w-4 h-4 text-zinc-500 shrink-0 mt-1" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-zinc-400">{label}</dt>
        <dd className="text-sm text-zinc-100 break-words">{children}</dd>
      </div>
    </div>
  );
}

export function LeadCard({ lead, isSaved, hideStatus, onSave, onStatusChange, onVerifyEmail, onDelete, onEditContact }: LeadCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ email: '', phone: '', website: '' });
  const [formError, setFormError] = useState('');
  useEffect(() => { setEditing(false); setFormError(''); }, [lead.naver_id]);

  const startEdit = () => {
    setForm({ email: lead.email || '', phone: lead.phone || '', website: lead.website || '' });
    setFormError('');
    setEditing(true);
  };
  const saveEdit = async () => {
    const result = buildContactUpdate(lead, form);
    if ('error' in result) { setFormError(result.error); return; }
    if (Object.keys(result.updates).length === 0) { setEditing(false); return; }
    if (await onEditContact?.(lead.naver_id, result.updates)) setEditing(false);
  };
  const verifyNeeded = needsVerification(lead);
  const confidenceTone =
    lead.email_confidence === 'scraped' ? 'text-emerald-300'
    : lead.email_confidence === 'estimated' ? 'text-amber-300'
    : 'text-zinc-400';

  return (
    <section className="rounded-2xl border border-white/10 bg-brand-card">
      <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-black text-zinc-100 font-display tracking-tight break-keep">{lead.institution_name_en}</h2>
          <p className="text-base text-zinc-400 mt-0.5 font-korean break-keep">{lead.institution_name_kr}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${priorityTone(lead.outreach_priority)}`}>
            <Star className="w-3.5 h-3.5 fill-current" aria-hidden />
            Priority {lead.outreach_priority}
          </span>
          {!isSaved && (
            <button
              onClick={() => onSave?.(lead)}
              className={`inline-flex items-center gap-1.5 text-sm font-semibold bg-brand-orange text-black hover:bg-orange-400 rounded-full px-4 py-1.5 transition-colors active:scale-[0.97] ${focusRing}`}
            >
              <Save className="w-4 h-4" aria-hidden />
              Save lead
            </button>
          )}
          {isSaved && !hideStatus && (
            <select
              aria-label="Lead status"
              value={lead.firebase_status}
              onChange={(e) => onStatusChange?.(lead.naver_id, e.target.value as FirebaseStatus)}
              disabled={lead.firebase_status === 'opted_out' || (verifyNeeded && lead.firebase_status === 'not_contacted')}
              title={lead.firebase_status === 'opted_out' ? 'This lead opted out — status is locked.' : verifyNeeded ? 'Verify the email address before marking this lead as contacted.' : undefined}
              className={`text-sm bg-black/30 text-zinc-100 border border-white/10 rounded-lg px-2.5 py-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
            >
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-5 sm:px-6 pb-5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/10 text-orange-300 text-sm font-medium">
          <Building2 className="w-4 h-4" aria-hidden />
          {institutionLabel(lead.institution_type)}
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-300 text-sm font-medium">
          <Users className="w-4 h-4" aria-hidden />
          {lead.student_age_range}
        </span>
        {lead.cefr_levels_taught?.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-violet-500/10 text-violet-300 text-sm font-medium">
            <GraduationCap className="w-4 h-4" aria-hidden />
            {lead.cefr_levels_taught.join(', ')}
          </span>
        )}
      </div>

      {editing && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveEdit(); }}
          className="px-5 sm:px-6 py-5 border-t border-white/10 space-y-3"
        >
          {([['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['website', 'Website', 'url']] as const).map(([key, label, type]) => (
            <label key={key} className="block">
              <span className="text-xs text-zinc-400">{label}</span>
              <input
                type={type === 'url' ? 'text' : type}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className={`mt-1 w-full text-sm bg-black/30 text-zinc-100 border border-white/10 rounded-lg px-3 py-2 ${focusRing}`}
              />
            </label>
          ))}
          <p className="text-xs text-zinc-400">A typed email is saved as found on the academy's own page and counts as verified.</p>
          {formError && <p role="alert" className="text-xs text-red-400">{formError}</p>}
          <div className="flex gap-2">
            <button type="submit" className={`px-4 py-1.5 text-sm font-semibold text-black bg-brand-orange hover:bg-orange-400 rounded-full ${focusRing}`}>Save</button>
            <button type="button" onClick={() => setEditing(false)} className={`px-4 py-1.5 text-sm font-medium text-zinc-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg ${focusRing}`}>Cancel</button>
          </div>
        </form>
      )}

      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 px-5 sm:px-6 py-5 border-t border-white/10">
        <Field icon={Mail} label="Email">
          <span className="block">{lead.email || '—'}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
            <span className={`text-xs font-medium ${confidenceTone}`}>
              {lead.email_confidence}{lead.email_verification === 'verified' ? ', verified' : ''}
            </span>
            {verifyNeeded && isSaved ? (
              <button
                onClick={() => onVerifyEmail?.(lead.naver_id)}
                className={`inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200 rounded ${focusRing}`}
                title="Confirm you checked this address (e.g. on the academy's site) before sending"
              >
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
                Mark as verified
              </button>
            ) : lead.email_confidence !== 'unknown' && !verifyNeeded ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-label="Email verified or scraped" />
            ) : null}
          </span>
        </Field>
        <Field icon={Phone} label="Phone"><span className="font-mono tabular-nums">{lead.phone || '—'}</span></Field>
        <Field icon={MapPin} label="Address">{lead.address_full || '—'}</Field>
        <Field icon={Globe} label="Website">
          {lead.website ? (
            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className={`text-orange-300 hover:underline underline-offset-2 break-all rounded ${focusRing}`}>
              {lead.website}
            </a>
          ) : '—'}
        </Field>
        <div className="md:col-span-2 flex flex-wrap gap-x-8 gap-y-1 text-sm text-zinc-400">
          <span>{lead.city}, {lead.district}</span>
          <span>{lead.approx_students} students</span>
          <span className="font-mono text-xs self-center">{lead.naver_id}</span>
          {isSaved && onEditContact && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-orange-300 hover:text-orange-200 rounded ${focusRing}`}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              Edit contact
            </button>
          )}
        </div>
      </dl>

      <div className="px-5 sm:px-6 py-5 border-t border-white/10 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Why it fits</h3>
          <p className="text-sm text-zinc-300 mt-1 leading-relaxed">{lead.fit_reason}</p>
        </div>
        {lead.agent_notes && (
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Notes</h3>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{lead.agent_notes}</p>
          </div>
        )}
      </div>

      {isSaved && (lead.last_contacted_at || onDelete) && (
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-3 border-t border-white/10 text-xs text-zinc-400">
          <span>
            {lead.last_contacted_at
              ? `Last sent ${new Date(lead.last_contacted_at).toLocaleDateString()} (${Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / 86400000)}d ago)`
              : ''}
          </span>
          {onDelete && (
            <button
              onClick={() => onDelete(lead.naver_id)}
              className={`inline-flex items-center gap-1.5 font-medium text-zinc-400 hover:text-red-400 transition-colors rounded ${focusRing}`}
              title="Remove this lead from your list (kept so sweeps won't re-add it)"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              Remove lead
            </button>
          )}
        </div>
      )}
    </section>
  );
}
