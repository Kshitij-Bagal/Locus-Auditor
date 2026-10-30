import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Sparkles, 
  Check, 
  X, 
  Plus, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  Send, 
  CheckCircle2, 
  Clock, 
  Eye, 
  Layers, 
  ArrowRight,
  RotateCcw
} from 'lucide-react';

export default function CentralRuleStudio({
  rules = [],
  onSaveRuleDraft,
  onSaveDraft,
  onApproveRuleDraft,
  onApproveDraft,
  onDirectPublishRule,
  onDirectPublish,
  currentUserRole,
  currentUserName
}) {
  const saveDraftFn = onSaveDraft || onSaveRuleDraft;
  const approveDraftFn = onApproveDraft || onApproveRuleDraft;
  const directPublishFn = onDirectPublish || onDirectPublishRule;
  const [selectedRuleId, setSelectedRuleId] = useState(rules[0]?.id || 'selfie');
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const activeRule = rules.find(r => r.id === selectedRuleId) || rules[0];
  
  const [title, setTitle] = useState(activeRule?.title || '');
  const [description, setDescription] = useState(activeRule?.description || '');
  const [standards, setStandards] = useState(activeRule?.standards || []);
  const [failures, setFailures] = useState(activeRule?.commonFailures || []);
  const [newStandardInput, setNewStandardInput] = useState('');
  const [newFailureInput, setNewFailureInput] = useState('');
  const [triggersFatal, setTriggersFatal] = useState(activeRule?.triggersFatal ?? true);

  // When switching rule tab, reset edit form
  const handleSelectRule = (ruleId) => {
    setSelectedRuleId(ruleId);
    const r = rules.find(rule => rule.id === ruleId);
    if (r) {
      setTitle(r.title);
      setDescription(r.description);
      setStandards([...(r.standards || [])]);
      setFailures([...(r.commonFailures || [])]);
      setTriggersFatal(r.triggersFatal ?? true);
      setIsEditing(false);
    }
  };

  const handleAddStandard = () => {
    if (!newStandardInput.trim()) return;
    setStandards([...standards, newStandardInput.trim()]);
    setNewStandardInput('');
  };

  const handleRemoveStandard = (idx) => {
    setStandards(standards.filter((_, i) => i !== idx));
  };

  const handleAddFailure = () => {
    if (!newFailureInput.trim()) return;
    setFailures([...failures, newFailureInput.trim()]);
    setNewFailureInput('');
  };

  const handleRemoveFailure = (idx) => {
    setFailures(failures.filter((_, i) => i !== idx));
  };

  // GM submits draft for BH review
  const handleSubmitDraftByGM = () => {
    if (saveDraftFn) {
      saveDraftFn(selectedRuleId, {
        title,
        description,
        standards,
        commonFailures: failures,
        triggersFatal,
        draftedBy: currentUserName || 'General Manager',
        draftedAt: new Date().toISOString()
      });
    }
    setIsEditing(false);
  };

  // BH Direct Publish
  const handleDirectPublishByBH = () => {
    if (directPublishFn) {
      directPublishFn(selectedRuleId, {
        title,
        description,
        standards,
        commonFailures: failures,
        triggersFatal,
        publishedBy: currentUserName || 'Business Head',
        publishedAt: new Date().toISOString()
      });
    }
    setIsEditing(false);
  };

  const isGM = currentUserRole === 'GM';
  const isBH = currentUserRole === 'BH' || currentUserRole === 'SuperAdmin';
  const hasDraftPending = activeRule?.status === 'DRAFT_PENDING_BH' || Boolean(activeRule?.draft);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  GM & Business Head
                </span>
                <span className="text-xs text-slate-400 font-mono">Rule Management</span>
              </div>
              <h2 className="text-lg font-extrabold text-white mt-0.5">
                Quality Rules
              </h2>
              <p className="text-xs text-slate-400">
                Set rules for what auditors must check in the 5 customer visit photos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300">
              Role: <strong className="text-white">{currentUserRole}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approval Alert Bar (if draft exists) */}
      {hasDraftPending && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/50 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <span className="font-bold text-amber-300 block text-sm">Draft Waiting for Business Head Approval</span>
              Submitted by <strong>{activeRule.draft?.draftedBy || 'General Manager'}</strong> on {activeRule.draft?.draftedAt ? new Date(activeRule.draft.draftedAt).toLocaleString() : 'Recent'}.
            </div>
          </div>

          {isBH && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => approveDraftFn && approveDraftFn(selectedRuleId)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Approve & Publish Rules
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left: 5 Stations List */}
        <div className="lg:col-span-4 space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block px-1">
            Inspection Stations
          </span>

          <div className="space-y-1.5">
            {rules.map(rule => {
              const isSelected = rule.id === selectedRuleId;
              const hasDraft = rule.status === 'DRAFT_PENDING_BH' || Boolean(rule.draft);

              return (
                <button
                  key={rule.id}
                  onClick={() => handleSelectRule(rule.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-600/20 text-white border-indigo-500 shadow-md'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-750 hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs flex items-center gap-2">
                      <span>{rule.label || rule.title}</span>
                      {hasDraft && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {rule.standards?.length || 0} Standards • {rule.commonFailures?.length || 0} Failure Clauses
                    </span>
                  </div>
                  <ArrowRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-indigo-400 translate-x-1' : 'text-slate-600'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Station Editor & Standards Studio */}
        <div className="lg:col-span-8 bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-5">
          
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase text-indigo-400 tracking-wider">
                Active Station Configuration
              </span>
              <h3 className="text-base font-bold text-white mt-0.5">{activeRule.title}</h3>
            </div>

            <div className="flex items-center gap-2">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Station Rules
                </button>
              ) : (
                <button
                  onClick={() => handleSelectRule(selectedRuleId)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Station Clinical Scope & Description:
            </label>
            {isEditing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            ) : (
              <p className="text-xs text-slate-300 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
                {activeRule.description}
              </p>
            )}
          </div>

          {/* SOP Acceptance Criteria (Line by line) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Mandatory SOP Acceptance Checklist ({standards.length}):
              </label>
              <span className="text-[11px] text-emerald-400 font-medium">All must be checked by Auditor</span>
            </div>

            <div className="space-y-1.5">
              {standards.map((std, idx) => (
                <div 
                  key={idx}
                  className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs text-slate-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <span>{std}</span>
                  </div>
                  {isEditing && (
                    <button
                      onClick={() => handleRemoveStandard(idx)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete criterion"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isEditing && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newStandardInput}
                  onChange={(e) => setNewStandardInput(e.target.value)}
                  placeholder="Add new mandatory check (e.g. 'Both torches tested on clean surface')"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStandard()}
                />
                <button
                  type="button"
                  onClick={handleAddStandard}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Fatal Failure Clauses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-red-400">
                Fatal Failure Clauses ({failures.length}):
              </label>
              <span className="text-[10px] text-red-400/80 font-mono">Triggers Automatic FATAL Strike</span>
            </div>

            <div className="space-y-1.5">
              {failures.map((fail, idx) => (
                <div 
                  key={idx}
                  className="bg-red-950/20 border border-red-500/30 rounded-lg p-2.5 flex items-center justify-between text-xs text-red-200"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{fail}</span>
                  </div>
                  {isEditing && (
                    <button
                      onClick={() => handleRemoveFailure(idx)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete clause"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isEditing && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newFailureInput}
                  onChange={(e) => setNewFailureInput(e.target.value)}
                  placeholder="Add new fatal reason (e.g. 'Torch lens cracked or broken')"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddFailure()}
                />
                <button
                  type="button"
                  onClick={handleAddFailure}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Action Footer for Editing */}
          {isEditing && (
            <div className="pt-4 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                {isGM ? 'GM Mode: Saves proposed rule changes into Review Queue for Business Head signoff.' : 'BH Mode: Has authority to directly publish rules live.'}
              </span>

              <div className="flex items-center gap-2">
                {isGM && (
                  <button
                    onClick={handleSubmitDraftByGM}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit Proposed Rule to BH for Review
                  </button>
                )}

                {isBH && (
                  <button
                    onClick={handleDirectPublishByBH}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Direct Publish Live Rules (BH Authority)
                  </button>
                )}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
