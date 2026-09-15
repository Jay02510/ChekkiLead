import React from 'react';
import { EnrichedLead, FirebaseStatus } from '../types';
import { Building2, MapPin, Phone, Globe, Mail, Users, GraduationCap, Star, Info, Save, ShieldCheck, ShieldAlert } from 'lucide-react';

interface LeadCardProps {
  lead: EnrichedLead;
  isSaved?: boolean;
  onSave?: (lead: EnrichedLead) => void;
  onStatusChange?: (naver_id: string, status: FirebaseStatus) => void;
  onVerifyEmail?: (naver_id: string) => void;
  key?: string | number;
}

export function LeadCard({ lead, isSaved, onSave, onStatusChange, onVerifyEmail }: LeadCardProps) {
  const needsVerification = lead.email_confidence === 'estimated' && lead.email_verification !== 'verified';
  const getPriorityColor = (priority: number) => {
    if (priority >= 4) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (priority === 3) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const getInstitutionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      hagwon: 'Hagwon (Academy)',
      elementary_school: 'Elementary School',
      kindergarten: 'Kindergarten',
      international_school: 'International School',
      tutoring_centre: 'Tutoring Centre'
    };
    return labels[type] || type;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 font-sans tracking-tight">{lead.institution_name_en}</h2>
            <h3 className="text-lg text-slate-500 font-medium mt-1">{lead.institution_name_kr}</h3>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`px-3 py-1 rounded-full text-sm font-semibold border flex items-center gap-1 ${getPriorityColor(lead.outreach_priority)}`}>
              <Star className="w-4 h-4 fill-current" />
              Priority {lead.outreach_priority}
            </div>
            {isSaved ? (
              <div className="flex flex-col items-end gap-1">
                <select 
                  value={lead.firebase_status}
                  onChange={(e) => onStatusChange?.(lead.naver_id, e.target.value as FirebaseStatus)}
                  disabled={needsVerification && lead.firebase_status === 'not_contacted'}
                  title={needsVerification ? 'Verify the email address before marking this lead as contacted.' : undefined}
                  className="text-xs font-medium bg-white border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="not_contacted">Not Contacted</option>
                  <option value="pending">Pending</option>
                  <option value="sent">Sent</option>
                  <option value="replied">Replied</option>
                  <option value="bounced">Bounced</option>
                  <option value="opted_out">Opted Out</option>
                </select>
                {lead.last_contacted_at && (
                  <span className="text-[10px] text-slate-400">Last sent: {new Date(lead.last_contacted_at).toLocaleDateString()}</span>
                )}
              </div>
            ) : (
              <button 
                onClick={() => onSave?.(lead)}
                className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 rounded-md px-3 py-1.5 transition-colors shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                Save to Database
              </button>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-sm font-medium">
            <Building2 className="w-4 h-4" />
            {getInstitutionTypeLabel(lead.institution_type)}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-sm font-medium">
            <Users className="w-4 h-4" />
            {lead.student_age_range}
          </span>
          {lead.cefr_levels_taught && lead.cefr_levels_taught.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-violet-50 text-violet-700 text-sm font-medium">
              <GraduationCap className="w-4 h-4" />
              {lead.cefr_levels_taught.join(', ')}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Contact Info</h4>
          
          {lead.address_full && (
            <div className="flex items-start gap-3 text-slate-600">
              <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <span className="text-sm">{lead.address_full}</span>
            </div>
          )}
          
          <div className="flex items-center gap-3 text-slate-600">
            <Phone className="w-5 h-5 text-slate-400 shrink-0" />
            <span className="text-sm font-mono">{lead.phone}</span>
          </div>
          
          <div className="flex items-center gap-3 text-slate-600">
            <Mail className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="flex flex-col flex-1">
              <span className="text-sm">{lead.email}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${needsVerification ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                  ({lead.email_confidence}{lead.email_verification === 'verified' ? ', verified' : ''})
                </span>
                {needsVerification ? (
                  <button
                    onClick={() => onVerifyEmail?.(lead.naver_id)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900"
                    title="Confirm you checked this address (e.g. on the academy's site) before sending"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Mark as manually verified
                  </button>
                ) : lead.email_confidence !== 'unknown' && (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                )}
              </div>
            </div>
          </div>
          
          {lead.website && (
            <div className="flex items-center gap-3 text-slate-600">
              <Globe className="w-5 h-5 text-slate-400 shrink-0" />
              <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline truncate">
                {lead.website}
              </a>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Business Details</h4>
          
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div>
              <span className="text-xs text-slate-500 font-medium block mb-1">Location</span>
              <span className="text-sm text-slate-900 font-medium">{lead.city}, {lead.district}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 font-medium block mb-1">Estimated Size</span>
              <span className="text-sm text-slate-900 font-medium">{lead.approx_students}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 font-medium block mb-1">Naver ID</span>
              <span className="text-sm text-slate-900 font-mono">{lead.naver_id}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-amber-50 border-t border-amber-100 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-amber-900">Fit Reason</h4>
            <p className="text-sm text-amber-800 mt-0.5">{lead.fit_reason}</p>
          </div>
          {lead.agent_notes && (
            <div>
              <h4 className="text-sm font-semibold text-amber-900">Agent Notes</h4>
              <p className="text-sm text-amber-800 mt-0.5">{lead.agent_notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
