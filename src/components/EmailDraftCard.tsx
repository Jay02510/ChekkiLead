import React, { useState } from 'react';
import { EmailDraft } from '../types';
import { Copy, Check, Mail, RefreshCw, Loader2, Send } from 'lucide-react';

interface EmailDraftCardProps {
  draft: EmailDraft;
  leadEmail?: string;
  onRegenerate?: () => void;
  isGenerating?: boolean;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50';

function CopyButton({ text, id, copied, onCopy }: { text: string; id: string; copied: string | null; onCopy: (text: string, id: string) => void }) {
  return (
    <button
      onClick={() => onCopy(text, id)}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-orange-300 hover:text-orange-200 transition-colors rounded ${focusRing}`}
    >
      {copied === id ? <><Check className="w-3.5 h-3.5" aria-hidden /> Copied</> : <><Copy className="w-3.5 h-3.5" aria-hidden /> Copy</>}
    </button>
  );
}

export function EmailDraftCard({ draft, leadEmail, onRegenerate, isGenerating }: EmailDraftCardProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [subjectVariant, setSubjectVariant] = useState<'a' | 'b'>('a');

  const activeSubject = subjectVariant === 'a' ? draft.subject_combined : draft.subject_combined_b;

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleOpenGmail = () => {
    const subject = encodeURIComponent(activeSubject);
    const body = encodeURIComponent(`${draft.body_korean}\n\n${draft.body_english}`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${leadEmail || ''}&su=${subject}&body=${body}`, '_blank');
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-brand-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-orange-300" aria-hidden />
          <h3 className="text-lg font-semibold text-zinc-100 font-display">Outreach email</h3>
        </div>
        <div className="flex items-center gap-2">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors active:scale-[0.97] disabled:opacity-50 ${focusRing}`}
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              Regenerate
            </button>
          )}
          <button
            onClick={handleOpenGmail}
            className={`inline-flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-black bg-brand-orange hover:bg-orange-400 rounded-full transition-colors active:scale-[0.97] ${focusRing}`}
          >
            <Send className="w-4 h-4" aria-hidden />
            Open in Gmail
          </button>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-zinc-100">Subject</h4>
              <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-full p-0.5" role="group" aria-label="Subject variant">
                {(['a', 'b'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setSubjectVariant(v)}
                    aria-pressed={subjectVariant === v}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase transition-colors ${focusRing} ${subjectVariant === v ? 'bg-orange-500/20 text-orange-300' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <CopyButton text={activeSubject} id="subject" copied={copiedSection} onCopy={handleCopy} />
          </div>
          <div className="p-3 bg-black/30 rounded-lg border border-white/10 text-sm text-zinc-100 font-medium break-keep">{activeSubject}</div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-zinc-100">
                Korean {draft.word_count_kr ? <span className="font-normal text-zinc-400">· {draft.word_count_kr} words</span> : null}
              </h4>
              <CopyButton text={draft.body_korean} id="korean" copied={copiedSection} onCopy={handleCopy} />
            </div>
            <div className="p-4 bg-black/30 rounded-lg border border-white/10 text-sm text-zinc-200 font-korean whitespace-pre-wrap leading-relaxed break-keep">{draft.body_korean}</div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-zinc-100">
                English {draft.word_count_en ? <span className="font-normal text-zinc-400">· {draft.word_count_en} words</span> : null}
              </h4>
              <CopyButton text={draft.body_english} id="english" copied={copiedSection} onCopy={handleCopy} />
            </div>
            <div className="p-4 bg-black/30 rounded-lg border border-white/10 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{draft.body_english}</div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <h4 className="text-sm font-semibold text-zinc-100 mb-1">Personalisation</h4>
          <p className="text-sm text-zinc-400 italic">"{draft.personalisation_note}"</p>
        </div>
      </div>
    </section>
  );
}
