import React, { useState, useEffect } from 'react';
import { enrichLead, generateEmailDraft } from './services/geminiService';
import { EnrichedLead, EmailDraft, NaverSearchResult, FirebaseStatus } from './types';
import { LeadCard } from './components/LeadCard';
import { EmailDraftCard } from './components/EmailDraftCard';
import { Loader2, Sparkles, Copy, Check, AlertCircle, Mail, Search, MapPin, Database, ChevronLeft, ChevronRight, Layers, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, getDocs, doc, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Toaster, toast } from 'sonner';

export default function App() {
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
      const q = query(collection(db, 'leads'), orderBy('outreach_priority', 'desc'));
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

  const handleSelectResult = (result: NaverSearchResult) => {
    handleEnrichWithData(JSON.stringify(result, null, 2));
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
    setIsBatchEnriching(true);
    setError(null);
    setEnrichedLeads([]);
    
    const results: EnrichedLead[] = [];
    try {
      // Process sequentially to avoid rate limits
      for (const item of searchResults) {
        const result = await enrichLead(JSON.stringify(item));
        results.push(result);
        setEnrichedLeads([...results]); // Update UI progressively
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during batch enrichment.');
    } finally {
      setIsBatchEnriching(false);
    }
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
      await setDoc(doc(db, 'leads', lead.naver_id), lead);
      toast.success('Lead saved to Firebase!');
      fetchSavedLeads(); // Refresh to update "Saved" badges
    } catch (err) {
      console.error(err);
      toast.error('Failed to save lead. Check your configuration.');
    }
  };

  const handleStatusChange = async (naver_id: string, status: FirebaseStatus) => {
    try {
      await updateDoc(doc(db, 'leads', naver_id), {
        firebase_status: status
      });
      toast.success('Status updated successfully');
      fetchSavedLeads(); // Refresh
    } catch (err) {
      console.error("Failed to update status in Firebase", err);
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Toaster position="top-right" richColors />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Chekki AI</h1>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Lead Enrichment</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('search')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'search' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <div className="flex items-center gap-2"><Search className="w-4 h-4"/> Search</div>
            </button>
            <button 
              onClick={() => setActiveTab('database')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'database' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
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
              
              {/* Naver Search Section */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">Search Naver Maps</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Search directly using the Naver Local API to find leads.
                </p>
                
                <form onSubmit={(e) => handleSearch(e, 1)} className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="e.g. 강남구 영어학원"
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center gap-2"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Results {searchStart}-{Math.min(searchStart + 4, totalResults)} of {totalResults}
                      </span>
                      <div className="flex items-center gap-2">
                        <button onClick={handlePrevPage} disabled={searchStart === 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-50"><ChevronLeft className="w-4 h-4"/></button>
                        <button onClick={handleNextPage} disabled={searchStart + 5 > totalResults} className="p-1 rounded hover:bg-slate-100 disabled:opacity-50"><ChevronRight className="w-4 h-4"/></button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                      {searchResults.map((result, idx) => {
                        const isAlreadySaved = savedLeads.some(l => l.naver_id === result.id);
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectResult(result)}
                            className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group relative"
                          >
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium text-slate-900 group-hover:text-indigo-700 pr-16" dangerouslySetInnerHTML={{ __html: result.title }} />
                              {isAlreadySaved && (
                                <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Saved
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
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
                      className="w-full mt-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {isBatchEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                      Batch Enrich All {searchResults.length} Results
                    </button>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="text-sm">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Column: Output */}
            <div className="lg:col-span-7 space-y-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Enriched Profiles</h2>
              
              <AnimatePresence mode="popLayout">
                {isLoading && enrichedLeads.length === 0 && (
                  <motion.div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p>Enriching lead data...</p>
                  </motion.div>
                )}
                
                {enrichedLeads.map((lead) => (
                  <motion.div
                    key={lead.naver_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 pb-8 border-b border-slate-200 last:border-0"
                  >
                    <LeadCard 
                      lead={lead} 
                      onSave={handleSaveLead} 
                      isSaved={savedLeads.some(l => l.naver_id === lead.naver_id)}
                    />
                    
                    {!emailDrafts[lead.naver_id] ? (
                      <button
                        onClick={() => handleGenerateEmail(lead)}
                        disabled={generatingEmails[lead.naver_id]}
                        className="w-full py-3 px-4 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 disabled:bg-slate-50 disabled:cursor-not-allowed text-slate-700 font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                      >
                        {generatingEmails[lead.naver_id] ? (
                          <><Loader2 className="w-5 h-5 animate-spin text-slate-400" /> Generating Email Draft...</>
                        ) : (
                          <><Mail className="w-5 h-5 text-slate-400" /> Generate Cold Email Draft</>
                        )}
                      </button>
                    ) : (
                      <EmailDraftCard 
                        draft={emailDrafts[lead.naver_id]} 
                        onRegenerate={() => handleGenerateEmail(lead)}
                        isGenerating={generatingEmails[lead.naver_id]}
                      />
                    )}
                  </motion.div>
                ))}

                {!isLoading && enrichedLeads.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-96 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50"
                  >
                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                      <Sparkles className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 mb-1">No Data Yet</h3>
                    <p className="text-sm text-slate-500 max-w-sm">
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
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Saved Leads Database</h2>
              <span className="text-sm font-medium text-slate-500">{savedLeads.length} leads total</span>
            </div>
            
            {isLoadingDb ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
            ) : savedLeads.length > 0 ? (
              <div className="grid grid-cols-1 gap-6">
                {savedLeads.map(lead => (
                  <LeadCard 
                    key={lead.naver_id} 
                    lead={lead} 
                    isSaved={true} 
                    onStatusChange={handleStatusChange} 
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900">No saved leads</h3>
                <p className="text-sm text-slate-500">Enrich some leads and click "Save to Database" to see them here.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
