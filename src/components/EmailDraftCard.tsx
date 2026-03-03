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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Cold Outreach Email</h3>
            <p className="text-sm text-slate-500">Personalised bilingual draft ready to send.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenGmail}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
            Open in Gmail
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
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
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject Line</h4>
            <button
              onClick={() => handleCopy(draft.subject_combined, 'subject')}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
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
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-900 font-medium">
            {draft.subject_combined}
          </div>
        </div>

        {/* Korean Body */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Korean Body</h4>
              {draft.word_count_kr && (
                <span className="text-xs text-slate-400">({draft.word_count_kr} words)</span>
              )}
            </div>
            <button
              onClick={() => handleCopy(draft.body_korean, 'korean')}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
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
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {draft.body_korean}
          </div>
        </div>

        {/* English Body */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">English Body</h4>
              {draft.word_count_en && (
                <span className="text-xs text-slate-400">({draft.word_count_en} words)</span>
              )}
            </div>
            <button
              onClick={() => handleCopy(draft.body_english, 'english')}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
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
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {draft.body_english}
          </div>
        </div>

        {/* Personalisation Note */}
        <div className="pt-4 border-t border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Personalisation Strategy</h4>
          <p className="text-sm text-slate-600 italic">
            "{draft.personalisation_note}"
          </p>
        </div>
      </div>
    </div>
  );
}
