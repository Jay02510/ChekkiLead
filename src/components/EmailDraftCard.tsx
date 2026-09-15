import React, { useState } from 'react';
import { EmailDraft } from '../types';
import { Copy, Check, Mail, RefreshCw, Loader2, Send } from 'lucide-react';

interface EmailDraftCardProps {
  draft: EmailDraft;
  leadEmail?: string;
  onRegenerate?: () => void;
  isGenerating?: boolean;
}

export function EmailDraftCard({ draft, leadEmail, onRegenerate, isGenerating }: EmailDraftCardProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleOpenGmail = () => {
    const subject = encodeURIComponent(draft.subject_combined);
    const body = encodeURIComponent(`${draft.body_korean}\n\n${draft.body_english}`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${leadEmail || ''}&su=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="rounded-[2rem] border border-white/10 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)] mt-6">
    <div className="bg-brand-card rounded-[calc(2rem-0.375rem)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden">
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100 font-display">Cold Outreach Email</h3>
            <p className="text-sm text-zinc-500">Personalised bilingual draft ready to send.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenGmail}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-black bg-brand-orange hover:bg-orange-400 rounded-full transition-colors active:scale-[0.97] shadow-lg shadow-orange-500/25"
          >
            <Send className="w-4 h-4" />
            Open in Gmail
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-300 bg-white/5 hover:bg-white/10 hover:text-white border border-white/10 rounded-lg transition-colors active:scale-[0.97] disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Regenerate
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Subject */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Subject Line</h4>
            <button
              onClick={() => handleCopy(draft.subject_combined, 'subject')}
              className="flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors"
            >
              {copiedSection === 'subject' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-3 bg-black/20 rounded-lg border border-white/10 text-sm text-zinc-100 font-medium break-keep">
            {draft.subject_combined}
          </div>
        </div>

        {/* Korean Body */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Korean Body</h4>
              {draft.word_count_kr && (
                <span className="text-xs text-zinc-500">({draft.word_count_kr} words)</span>
              )}
            </div>
            <button
              onClick={() => handleCopy(draft.body_korean, 'korean')}
              className="flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors"
            >
              {copiedSection === 'korean' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-4 bg-black/20 rounded-lg border border-white/10 text-sm text-zinc-300 font-korean whitespace-pre-wrap leading-relaxed break-keep">
            {draft.body_korean}
          </div>
        </div>

        {/* English Body */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">English Body</h4>
              {draft.word_count_en && (
                <span className="text-xs text-zinc-500">({draft.word_count_en} words)</span>
              )}
            </div>
            <button
              onClick={() => handleCopy(draft.body_english, 'english')}
              className="flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors"
            >
              {copiedSection === 'english' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-4 bg-black/20 rounded-lg border border-white/10 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {draft.body_english}
          </div>
        </div>

        {/* Personalisation Note */}
        <div className="pt-4 border-t border-white/10">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Personalisation Strategy</h4>
          <p className="text-sm text-zinc-400 italic">
            "{draft.personalisation_note}"
          </p>
        </div>
      </div>
    </div>
    </div>
  );
}
