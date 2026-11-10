import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  RotateCcw, 
  CheckCheck, 
  Eye, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight, 
  UserCheck, 
  MapPin, 
  Calendar, 
  ShieldAlert, 
  HelpCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { INITIAL_CENTRAL_RULES } from '../data/centralRules.js';
import { 
  isAiAuditedTask, 
  getHumanVerificationStatus, 
  isAwaitingHumanVerification 
} from '../lib/supabase.js';

// Fast normalize Locus URLs to CDN to eliminate 302 redirects
function normalizeImageUrl(rawUrl, taskId) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:') && !url.startsWith('blob:')) {
    const stripped = url.replace(/^\/+/, '');
    if (stripped.startsWith('v1/client/')) {
      url = `https://assets.locus-api.com/${stripped}`;
    } else if (taskId) {
      url = `https://assets.locus-api.com/v1/client/lenskart-dlc/task/${taskId}/file/${stripped}`;
    }
  }
  url = url.replace(/^http:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  url = url.replace(/^https:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  url = url.replace(/^http:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  url = url.replace(/^https:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  return url;
}

const STATION_KEYS = [
  { id: 'selfie', label: '1. Selfie & ID Card', imageKey: 'selfie' },
  { id: 'torches', label: '2. Dual Torches', imageKey: 'torches' },
  { id: 'visionChart', label: '3. Vision Standee', imageKey: 'visionChart' },
  { id: 'toolkit', label: '4. Refraction Toolkit', imageKey: 'toolkit' },
  { id: 'frameDisplay', label: '5. Frame Display Tray', imageKey: 'frameDisplay' }
];

export default function VerificationModal({
  task,
  onClose,
  onConfirmAiVerdict,
  onOverturnAiVerdict,
  onSendToReAudit,
  onNextTask,
  onPrevTask,
  hasNext,
  hasPrev,
  rules = INITIAL_CENTRAL_RULES,
  reviewerName = 'QA Reviewer'
}) {
  const [stationStatuses, setStationStatuses] = useState({});
  const [stationReasons, setStationReasons] = useState({});
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize station statuses from task's AI criteria status & failed reasons
  useEffect(() => {
    if (!task) return;
    const initialMap = {};
    const initialReasons = {};
    const criteriaMap = task.criteriaStatus || task.criteria_status || {};
    const failedList = task.failedReasons || task.failed_reasons || [];
    const isAiFatal = task.auditStatus === 'FATAL';

    STATION_KEYS.forEach(stn => {
      const explicit = criteriaMap[stn.id] || criteriaMap[stn.imageKey];
      if (explicit) {
        initialMap[stn.id] = explicit === 'PASS' ? 'PASS' : 'FAIL';
      } else if (isAiFatal) {
        // Check if any failed reason corresponds to this station
        const ruleDef = rules.find(r => r.id === stn.id || r.imageKey === stn.id);
        const match = failedList.find(f => {
          const lower = String(f).toLowerCase();
          return (
            (ruleDef?.commonFailures || []).some(cf => cf.toLowerCase() === lower) ||
            lower.includes(stn.id.toLowerCase())
          );
        });
        initialMap[stn.id] = match ? 'FAIL' : 'PASS';
        if (match) initialReasons[stn.id] = match;
      } else {
        initialMap[stn.id] = 'PASS';
      }
    });

    setStationStatuses(initialMap);
    setStationReasons(initialReasons);
    setReviewerNotes('');
  }, [task, rules]);

  if (!task) return null;

  const isAi = isAiAuditedTask(task);
  const humanStatus = getHumanVerificationStatus(task);
  const originalAiVerdict = (task.auditStatus === 'FATAL' ? 'FATAL' : 'PASS');
  const modelName = task.auditedBy || task.audited_by_name || 'gemini-3.8-flash';

  // Computed Human Verdict based on station statuses
  const anyStationFailed = STATION_KEYS.some(stn => stationStatuses[stn.id] === 'FAIL');
  const computedVerdict = anyStationFailed ? 'FATAL' : 'PASS';
  const isAgreeingWithAi = computedVerdict === originalAiVerdict;

  // Compile active failure reasons from failed stations
  const activeFailedReasons = useMemo(() => {
    const list = [];
    STATION_KEYS.forEach(stn => {
      if (stationStatuses[stn.id] === 'FAIL') {
        const reason = stationReasons[stn.id];
        if (reason) list.push(reason);
        else {
          const rule = rules.find(r => r.id === stn.id || r.imageKey === stn.id);
          list.push(rule?.commonFailures?.[0] || `${stn.label} non-compliance`);
        }
      }
    });
    return list;
  }, [stationStatuses, stationReasons, rules]);

  // Handle station status toggle
  const toggleStation = (stationId) => {
    setStationStatuses(prev => {
      const current = prev[stationId] === 'FAIL' ? 'FAIL' : 'PASS';
      const next = current === 'PASS' ? 'FAIL' : 'PASS';
      const updated = { ...prev, [stationId]: next };

      // Set default reason when switching to FAIL
      if (next === 'FAIL') {
        const rule = rules.find(r => r.id === stationId || r.imageKey === stationId);
        setStationReasons(rPrev => ({
          ...rPrev,
          [stationId]: rule?.commonFailures?.[0] || 'Checklist non-compliance detected by reviewer'
        }));
      } else {
        const rule = rules.find(r => r.id === stationId || r.imageKey === stationId);
        setStationReasons(rPrev => ({
          ...rPrev,
          [stationId]: rule?.standards?.[0] || 'Compliant with clinical SOP'
        }));
      }

      return updated;
    });
  };

  // Handle inverse criteria selection
  const handleInverseSelect = (stationId, currentStatus, selectedVal) => {
    if (!selectedVal) return;

    if (currentStatus === 'PASS') {
      // Overturning PASS station to FAIL
      setStationStatuses(prev => ({ ...prev, [stationId]: 'FAIL' }));
      setStationReasons(prev => ({ ...prev, [stationId]: selectedVal }));
    } else {
      // Overturning FAIL station to PASS
      setStationStatuses(prev => ({ ...prev, [stationId]: 'PASS' }));
      setStationReasons(prev => ({ ...prev, [stationId]: selectedVal }));
    }
  };

  // Submit Confirmation (Agreed with AI)
  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirmAiVerdict?.(task.id, reviewerNotes);
      if (hasNext) onNextTask?.();
      else onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Overturn
  const handleOverturn = async (targetVerdict) => {
    setIsSubmitting(true);
    try {
      const defaultReason = targetVerdict === 'PASS'
        ? (reviewerNotes || 'SOP compliant upon clinical visual review by human reviewer')
        : (activeFailedReasons.join('; ') || reviewerNotes || 'Clinical non-compliance detected upon human verification');

      await onOverturnAiVerdict?.(task.id, targetVerdict, defaultReason);
      if (hasNext) onNextTask?.();
      else onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Send to Re-Audit
  const handleReAudit = async () => {
    const reason = prompt('Enter clinical justification for sending this task to re-audit:', 'Image quality requires Senior QA re-inspection');
    if (!reason) return;
    setIsSubmitting(true);
    try {
      await onSendToReAudit?.(task.id, reason);
      if (hasNext) onNextTask?.();
      else onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20 shrink-0">
              <Sparkles className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  AI Audit Human Verification
                </span>
                <span className="text-sm font-bold text-white font-mono">
                  Task #{task.taskId || task.id}
                </span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                  originalAiVerdict === 'FATAL' 
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40' 
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  🤖 AI Verdict: {originalAiVerdict}
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  Model: {modelName}
                </span>
                {humanStatus === 'VERIFIED' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500 text-white flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Human Confirmed
                  </span>
                )}
                {humanStatus === 'OVERTURNED' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    Human Overruled
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-3 mt-1 flex-wrap">
                <span><strong>FE:</strong> {task.feName || 'Unassigned'} ({task.feCode || task.feId || 'N/A'})</span>
                <span>&bull;</span>
                <span><strong>Hub:</strong> {task.facilityCode || task.city || task.zone || 'National'}</span>
                <span>&bull;</span>
                <span><strong>Customer:</strong> {task.customerName || 'N/A'}</span>
                <span>&bull;</span>
                <span><strong>Batch:</strong> {task.date || 'Today'}</span>
              </div>
            </div>
          </div>

          {/* Navigation & Close */}
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevTask}
              disabled={!hasPrev}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
              title="Previous Lead in Queue"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNextTask}
              disabled={!hasNext}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
              title="Next Lead in Queue"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white border border-slate-700 transition-colors cursor-pointer ml-1"
              title="Close Verification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* AI Commentary Bar if present */}
        {task.remarks && (
          <div className="px-5 py-2 bg-purple-950/30 border-b border-purple-500/20 text-xs text-purple-200 flex items-center gap-2">
            <span className="font-bold text-white shrink-0">AI Audit Commentary:</span>
            <span className="truncate">{task.remarks}</span>
          </div>
        )}

        {/* Middle Scrollable Section: 5 Mandatory Images Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
            {STATION_KEYS.map(stn => {
              const ruleDef = rules.find(r => r.id === stn.id || r.imageKey === stn.imageKey);
              const currentStatus = stationStatuses[stn.id] || 'PASS';
              const isPass = currentStatus === 'PASS';
              const rawImgUrl = task.images?.[stn.imageKey] || task.images?.[stn.id];
              const normalizedUrl = normalizeImageUrl(rawImgUrl, task.taskId || task.id);
              const currentReason = stationReasons[stn.id];

              // Inverse criteria choices
              const fatalCriteriaOptions = (ruleDef?.commonFailures && ruleDef.commonFailures.length > 0)
                ? ruleDef.commonFailures
                : [
                    'Missing / obscured equipment',
                    'Photo blurry or unidentifiable',
                    'Duplicate / recycled image',
                    'SOP clinical non-compliance'
                  ];

              const positiveCriteriaOptions = (ruleDef?.standards && ruleDef.standards.length > 0)
                ? ruleDef.standards
                : [
                    'All equipment clearly visible and compliant',
                    'Non-duplicate authentic clinical photo',
                    'Meets clinical accuracy standard',
                    'False positive AI flag overturned'
                  ];

              return (
                <div 
                  key={stn.id}
                  className={`bg-slate-850/80 rounded-xl border flex flex-col justify-between overflow-hidden shadow-md transition-all ${
                    isPass 
                      ? 'border-emerald-500/40 hover:border-emerald-500/70' 
                      : 'border-red-500/50 hover:border-red-500/80 bg-red-950/10'
                  }`}
                >
                  {/* Station Header with Status Pill */}
                  <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-1.5">
                    <div className="overflow-hidden">
                      <span className="font-bold text-white text-xs truncate block" title={stn.label}>
                        {stn.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isPass ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>PASS</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          <span>FAIL</span>
                        </span>
                      )}

                      {/* Quick Toggle Button */}
                      <button
                        type="button"
                        onClick={() => toggleStation(stn.id)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title={`Click to flip status to ${isPass ? 'FAIL' : 'PASS'}`}
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Photo Display Area */}
                  <div className="relative bg-slate-950 aspect-[4/3] flex items-center justify-center overflow-hidden group">
                    {normalizedUrl ? (
                      <>
                        <img 
                          src={normalizedUrl} 
                          alt={stn.label}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-zoom-in"
                          onClick={() => setPreviewImage({ url: normalizedUrl, title: stn.label, status: currentStatus })}
                          loading="lazy"
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ url: normalizedUrl, title: stn.label, status: currentStatus })}
                          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/80 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm hover:bg-blue-600"
                          title="Zoom / Inspect Photo"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="text-center p-3 text-slate-500 text-xs">
                        <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-slate-600" />
                        <span>No Photo Uploaded</span>
                      </div>
                    )}
                  </div>

                  {/* Inverse Criteria Dropdown Section */}
                  <div className="p-2.5 bg-slate-900/60 border-t border-slate-800 space-y-2">
                    {isPass ? (
                      /* Station is PASS -> Inverse Dropdown gives Fatal Criteria to Fail */
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block mb-1">
                          Overturn to FAIL:
                        </label>
                        <select
                          value=""
                          onChange={(e) => handleInverseSelect(stn.id, 'PASS', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-lg px-2 py-1.5 text-[11px] text-amber-200 focus:outline-none focus:border-amber-400 cursor-pointer font-medium truncate"
                        >
                          <option value="">Select Fatal Violation reason...</option>
                          {fatalCriteriaOptions.map((reason, i) => (
                            <option key={i} value={reason} className="bg-slate-900 text-white">
                              ❌ {reason}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      /* Station is FAIL -> Inverse Dropdown gives Positive Criteria to Pass */
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block mb-1">
                          Overturn to PASS:
                        </label>
                        <select
                          value=""
                          onChange={(e) => handleInverseSelect(stn.id, 'FAIL', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-lg px-2 py-1.5 text-[11px] text-emerald-200 focus:outline-none focus:border-emerald-400 cursor-pointer font-medium truncate"
                        >
                          <option value="">Select Positive Standard reason...</option>
                          {positiveCriteriaOptions.map((standard, i) => (
                            <option key={i} value={standard} className="bg-slate-900 text-white">
                              ✅ {standard}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Current Documented Rationale */}
                    {currentReason && (
                      <div className={`p-1.5 rounded text-[10px] truncate ${
                        isPass ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/20' : 'bg-red-950/40 text-red-300 border border-red-500/20'
                      }`} title={currentReason}>
                        <span className="font-bold">{isPass ? 'Standard:' : 'Violation:'}</span> {currentReason}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>

          {/* Reviewer Overall Commentary */}
          <div className="bg-slate-850 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
              <span>Reviewer Verification Commentary & Rationale:</span>
              <span className="text-[11px] font-mono text-slate-500 font-normal">
                Saved with verification audit stamp
              </span>
            </div>
            <input
              type="text"
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              placeholder="Add optional reviewer rationale (e.g. 'All 5 stations verified authentic and compliant with SOP')..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-medium"
            />
          </div>
        </div>

        {/* Bottom Pinned Decision & Action Bar */}
        <div className="p-4 bg-slate-850 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          
          {/* Summary Status of Current Review */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold">Evaluated Result:</span>
            <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase ${
              computedVerdict === 'PASS' 
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                : 'bg-red-500/20 text-red-300 border border-red-500/40'
            }`}>
              {computedVerdict === 'PASS' ? '✅ All 5 Passed' : `❌ ${activeFailedReasons.length} Station(s) Failed`}
            </span>

            {computedVerdict !== originalAiVerdict && (
              <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                <span>(Will Overturn AI from {originalAiVerdict})</span>
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. Confirm AI Verdict Button (enabled if human agrees with AI) */}
            {isAgreeingWithAi ? (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
                title="Approve and record human verification for this AI audit verdict in Supabase"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Confirm AI Verdict ({originalAiVerdict})</span>
              </button>
            ) : (
              /* 2. Overturn Buttons (active when human changes verdict) */
              computedVerdict === 'PASS' ? (
                <button
                  type="button"
                  onClick={() => handleOverturn('PASS')}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition-all shadow-lg shadow-amber-950/40 cursor-pointer disabled:opacity-50"
                  title="Overturn AI FATAL verdict to PASS based on positive criteria"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Overturn AI FATAL to PASS</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleOverturn('FATAL')}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5 transition-all shadow-lg shadow-red-950/40 cursor-pointer disabled:opacity-50"
                  title="Overturn AI PASS verdict to FATAL based on selected failure reasons"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Overturn AI PASS to FATAL ({activeFailedReasons.length} Violations)</span>
                </button>
              )
            )}

            {/* Send to Re-Audit Button */}
            <button
              type="button"
              onClick={handleReAudit}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              title="Flag this lead for clinical re-auditing"
            >
              <span>Send to Re-Audit</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>

      </div>

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
              previewImage.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-red-500/20 text-red-400 border border-red-500/40'
            }`}>
              {previewImage.status}
            </span>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="p-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="text-white font-bold text-sm mb-3">
            {previewImage.title}
          </div>
          <img 
            src={previewImage.url} 
            alt={previewImage.title}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
