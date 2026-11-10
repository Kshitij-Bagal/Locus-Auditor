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
  { id: 'selfie', label: '1. Selfie & ID Card', imageKey: 'selfie', icon: '👤' },
  { id: 'torches', label: '2. Dual Torches', imageKey: 'torches', icon: '🔦' },
  { id: 'visionChart', label: '3. Vision Standee', imageKey: 'visionChart', icon: '👁️' },
  { id: 'toolkit', label: '4. Refraction Toolkit', imageKey: 'toolkit', icon: '🧰' },
  { id: 'frameDisplay', label: '5. Frame Display Tray', imageKey: 'frameDisplay', icon: '👓' }
];

export function extractAiStationEvaluation(task, stationId, rules = []) {
  if (!task) {
    return {
      status: 'PASS',
      failureReasons: [],
      observations: 'No task evaluation data available'
    };
  }

  // 1. Check if criteriaEvaluation exists in task / aiResult / auditMetadata
  const evalList = Array.isArray(task.criteriaEvaluation) 
    ? task.criteriaEvaluation 
    : (Array.isArray(task.aiResult?.criteriaEvaluation) 
        ? task.aiResult.criteriaEvaluation 
        : (Array.isArray(task.auditMetadata?.criteriaEvaluation) ? task.auditMetadata.criteriaEvaluation : []));

  if (evalList && evalList.length > 0) {
    const found = evalList.find(c => 
      c.id === stationId || 
      c.imageKey === stationId ||
      (stationId === 'frameDisplay' && (c.id === 'trialLenses' || c.id === 'frameDisplay')) ||
      (stationId === 'trialLenses' && (c.id === 'frameDisplay' || c.id === 'trialLenses'))
    );
    if (found) {
      const isFailed = found.status === 'FAIL';
      return {
        status: isFailed ? 'FAIL' : 'PASS',
        score: found.score,
        failureReasons: Array.isArray(found.failureReasons) && found.failureReasons.length > 0 
          ? found.failureReasons 
          : (isFailed ? [found.observations || 'Criterion non-compliance identified by AI'] : []),
        observations: found.observations || (isFailed ? 'Non-compliance detected by AI' : 'Verified compliant with clinical DLC SOP standards')
      };
    }
  }

  // 2. Reconstruct from criteria_status / criteriaStatus and failed_reasons
  const statusMap = task.criteriaStatus || task.criteria_status || {};
  const failedList = task.failedReasons || task.failed_reasons || [];
  const rawStatus = statusMap[stationId] || (stationId === 'frameDisplay' ? statusMap['trialLenses'] : null);
  const ruleDef = rules.find(r => r.id === stationId || r.imageKey === stationId);

  const matchingReasons = failedList.filter(r => {
    const lower = String(r).toLowerCase();
    if (stationId === 'selfie' && (lower.includes('selfie') || lower.includes('t-shirt') || lower.includes('badge') || lower.includes('id card') || lower.includes('uniform') || lower.includes('polo'))) return true;
    if (stationId === 'torches' && (lower.includes('torch') || lower.includes('penlight') || lower.includes('blue') || lower.includes('yellow') || lower.includes('batter'))) return true;
    if (stationId === 'visionChart' && (lower.includes('chart') || lower.includes('standee') || lower.includes('vision') || lower.includes('snellen') || lower.includes('logmar'))) return true;
    if (stationId === 'toolkit' && (lower.includes('toolkit') || lower.includes('sanitizer') || lower.includes('jcc') || lower.includes('trial frame') || lower.includes('ruler') || lower.includes('kit'))) return true;
    if ((stationId === 'frameDisplay' || stationId === 'trialLenses') && (lower.includes('frame') || lower.includes('display') || lower.includes('tray') || lower.includes('lens') || lower.includes('trial'))) return true;
    return (ruleDef?.commonFailures || []).some(cf => cf.toLowerCase() === lower);
  });

  const isFatalAudit = task.auditStatus === 'FATAL';
  let computedStatus = 'PASS';
  if (rawStatus) {
    computedStatus = rawStatus === 'PASS' ? 'PASS' : 'FAIL';
  } else if (matchingReasons.length > 0) {
    computedStatus = 'FAIL';
  } else if (isFatalAudit && failedList.length === 1) {
    const lowerFirst = String(failedList[0]).toLowerCase();
    const isThisStation = (stationId === 'selfie' && (lowerFirst.includes('selfie') || lowerFirst.includes('t-shirt') || lowerFirst.includes('badge'))) ||
                          (stationId === 'torches' && (lowerFirst.includes('torch') || lowerFirst.includes('penlight'))) ||
                          (stationId === 'visionChart' && (lowerFirst.includes('chart') || lowerFirst.includes('standee'))) ||
                          (stationId === 'toolkit' && (lowerFirst.includes('toolkit') || lowerFirst.includes('sanitizer'))) ||
                          (stationId === 'frameDisplay' && (lowerFirst.includes('frame') || lowerFirst.includes('tray')));
    if (isThisStation) computedStatus = 'FAIL';
  }

  let finalReasons = matchingReasons;
  if (computedStatus === 'FAIL' && finalReasons.length === 0) {
    if (ruleDef?.commonFailures?.[0]) finalReasons = [ruleDef.commonFailures[0]];
    else finalReasons = ['Clinical non-compliance identified by AI model'];
  }

  return {
    status: computedStatus,
    score: computedStatus === 'PASS' ? 100 : 0,
    failureReasons: finalReasons,
    observations: computedStatus === 'FAIL' 
      ? (finalReasons.join('; ') || task.remarks || 'Station non-compliance detected')
      : 'All mandatory equipment verified present and compliant with SOP'
  };
}

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
  const [hoveredStationId, setHoveredStationId] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Keyboard navigation for lightbox (ESC, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowLeft') setLightboxIndex(prev => (prev > 0 ? prev - 1 : prev));
      else if (e.key === 'ArrowRight') setLightboxIndex(prev => (prev < STATION_KEYS.length - 1 ? prev + 1 : prev));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex]);

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

  // Dynamic station criteria displayed above Reviewer Commentary (updates on hover of any station)
  const activeStationId = hoveredStationId || (STATION_KEYS.find(s => stationStatuses[s.id] === 'FAIL')?.id) || 'selfie';
  const activeStationDef = STATION_KEYS.find(s => s.id === activeStationId) || STATION_KEYS[0];
  const activeStationRule = rules.find(r => r.id === activeStationDef.id || r.imageKey === activeStationDef.imageKey);
  const activeStationAiEval = extractAiStationEvaluation(task, activeStationDef.id, rules);
  const activeStationCurStatus = stationStatuses[activeStationDef.id] || 'PASS';
  const activeStationCurReason = stationReasons[activeStationDef.id];

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
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-1 sm:p-2.5 md:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-[98vw] 2xl:max-w-[1720px] h-[97vh] max-h-[97vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
        
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
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
            {STATION_KEYS.map((stn, index) => {
              const ruleDef = rules.find(r => r.id === stn.id || r.imageKey === stn.imageKey);
              const currentStatus = stationStatuses[stn.id] || 'PASS';
              const isPass = currentStatus === 'PASS';
              const rawImgUrl = task.images?.[stn.imageKey] || task.images?.[stn.id];
              const normalizedUrl = normalizeImageUrl(rawImgUrl, task.taskId || task.id);
              const currentReason = stationReasons[stn.id];
              const aiEval = extractAiStationEvaluation(task, stn.id, rules);
              const isItemActive = activeStationId === stn.id;

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
                  onMouseEnter={() => setHoveredStationId(stn.id)}
                  onClick={() => setHoveredStationId(stn.id)}
                  className={`bg-slate-850/80 rounded-xl border flex flex-col justify-between overflow-hidden shadow-md transition-all cursor-pointer ${
                    isItemActive ? 'ring-2 ring-purple-500/80 border-purple-400 shadow-purple-500/10' : ''
                  } ${
                    isPass 
                      ? 'border-emerald-500/40 hover:border-emerald-500/70' 
                      : 'border-red-500/50 hover:border-red-500/80 bg-red-950/10'
                  }`}
                >
                  {/* Station Header with Status Pill */}
                  <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-1.5">
                    <div className="overflow-hidden">
                      <span className="font-bold text-white text-xs truncate block" title={stn.label}>
                        {stn.icon ? `${stn.icon} ` : ''}{stn.label}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStation(stn.id);
                        }}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title={`Click to flip status to ${isPass ? 'FAIL' : 'PASS'}`}
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Photo Display Area with Hover Overlay - Fully Uncropped (object-contain, 1.4x scale) */}
                  <div className="relative bg-slate-950 h-64 sm:h-72 xl:h-80 w-full flex items-center justify-center overflow-hidden group rounded-lg">
                    {normalizedUrl ? (
                      <>
                        <img 
                          src={normalizedUrl} 
                          alt={stn.label}
                          className="w-full h-full object-contain p-1 group-hover:scale-[1.02] transition-transform duration-300 cursor-pointer"
                          onClick={() => setLightboxIndex(index)}
                          loading="lazy"
                        />

                        {/* Floating Enlarge Button */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setLightboxIndex(index); }}
                          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/85 hover:bg-purple-600 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm z-30 shadow-lg cursor-pointer"
                          title="Enlarge photo & view criteria breakdown"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>

                        {/* ON-HOVER AI CRITERIA OVERLAY */}
                        <div 
                          onClick={() => setLightboxIndex(index)}
                          className="absolute inset-0 bg-slate-950/92 backdrop-blur-sm p-3 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 cursor-pointer select-none"
                        >
                          <div className="space-y-1.5 overflow-hidden">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                                AI Evaluation
                              </span>
                              {aiEval.status === 'FAIL' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-500/25 text-red-300 border border-red-500/40 flex items-center gap-1 shadow-sm">
                                  <AlertTriangle className="w-3 h-3 text-red-400" />
                                  <span>AI FAILED</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>AI PASSED</span>
                                </span>
                              )}
                            </div>

                            {aiEval.status === 'FAIL' ? (
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                                  Failed Criteria:
                                </span>
                                <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                                  {aiEval.failureReasons.map((reason, rIdx) => (
                                    <div key={rIdx} className="flex items-start gap-1 text-[11px] text-red-200 leading-snug">
                                      <span className="text-red-400 font-bold shrink-0">❌</span>
                                      <span className="line-clamp-2">{reason}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                                  Compliance Criteria:
                                </span>
                                <div className="text-[11px] text-emerald-200 flex items-start gap-1 leading-snug">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                  <span className="line-clamp-3">{aiEval.observations || "All mandatory equipment visible & fully compliant with DLC SOP."}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-purple-300 font-semibold">
                            <span className="flex items-center gap-1">
                              <Maximize2 className="w-3 h-3" /> Click to enlarge
                            </span>
                            <span className="text-[9px] text-slate-400">View high-res</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-3 text-slate-500 text-xs">
                        <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-slate-600" />
                        <span>No Photo Uploaded</span>
                      </div>
                    )}
                  </div>

                  {/* Inverse Criteria Dropdown Section */}
                  <div className="p-2.5 bg-slate-900/60 border-t border-slate-800 space-y-2" onClick={(e) => e.stopPropagation()}>
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

          {/* DYNAMIC STATION CRITERIA PANEL (Changes on hover of any station photo above) */}
          <div className="bg-slate-850/95 border border-purple-500/40 rounded-xl p-3.5 sm:p-4 shadow-xl transition-all duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-slate-700/80">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl shrink-0 p-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  {activeStationDef.icon || '🔍'}
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                      {activeStationDef.label}
                    </span>
                    <span className="text-[10px] text-purple-300 font-mono bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-purple-300" />
                      Hovered Item Criteria
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    {activeStationRule?.description || 'Inspect clinical SOP standards, failure triggers, and AI evaluations.'}
                  </p>
                </div>
              </div>

              {/* Badges & Actions */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono uppercase flex items-center gap-1 ${
                  activeStationAiEval.status === 'FAIL' 
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40' 
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {activeStationAiEval.status === 'FAIL' ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>AI: {activeStationAiEval.status}</span>
                </span>

                <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase flex items-center gap-1 ${
                  activeStationCurStatus === 'PASS'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse'
                }`}>
                  <span>Reviewer: {activeStationCurStatus}</span>
                </span>

                <button
                  type="button"
                  onClick={() => toggleStation(activeStationDef.id)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Toggle this station's reviewed status"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Toggle</span>
                </button>
              </div>
            </div>

            {/* Criteria Breakdown: 3 Responsive Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              
              {/* 1. Mandatory Clinical Standards */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Mandatory Clinical Standards
                </span>
                <ul className="space-y-1 text-slate-300 text-[11px]">
                  {(activeStationRule?.standards && activeStationRule.standards.length > 0) ? (
                    activeStationRule.standards.map((st, i) => (
                      <li key={i} className="flex items-start gap-1.5 leading-snug">
                        <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                        <span>{st}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400 italic">All equipment clearly visible and compliant with DLC SOP standards.</li>
                  )}
                </ul>
              </div>

              {/* 2. Fatal Triggers & AI Flagged Violations */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" /> SOP Fatal Triggers & Violations
                </span>
                {activeStationAiEval.status === 'FAIL' && activeStationAiEval.failureReasons.length > 0 ? (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-red-300 block">Flagged by AI Model:</span>
                    {activeStationAiEval.failureReasons.map((reason, idx) => (
                      <div key={idx} className="p-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-[11px] text-red-200 flex items-start gap-1.5 leading-snug">
                        <span className="text-red-400 font-bold shrink-0">❌</span>
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-1 text-slate-300 text-[11px]">
                    {(activeStationRule?.commonFailures && activeStationRule.commonFailures.length > 0) ? (
                      activeStationRule.commonFailures.slice(0, 3).map((cf, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-slate-400 leading-snug">
                          <span className="text-red-400 font-bold shrink-0 mt-0.5">•</span>
                          <span>{cf}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-400 italic">No fatal violations flagged for this item.</li>
                    )}
                  </ul>
                )}
              </div>

              {/* 3. AI Observations & Active Reviewer Rationale */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" /> AI Observations & Reviewer Rationale
                </span>
                <div className="text-[11px] text-slate-300 space-y-1.5">
                  <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 leading-snug">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase mb-0.5">AI Evidence & Remarks:</span>
                    <span className="italic">"{activeStationAiEval.observations || 'Verified compliant with clinical standards.'}"</span>
                  </div>
                  {activeStationCurReason && (
                    <div className="p-2 rounded-lg bg-purple-950/30 border border-purple-500/20 text-purple-200 leading-snug">
                      <span className="text-[10px] font-bold text-purple-300 block uppercase mb-0.5">Documented Rationale:</span>
                      <span>{activeStationCurReason}</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
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

      {/* Lightbox / Enlarged Photo & Criteria Inspection Modal */}
      {lightboxIndex !== null && (() => {
        const curStn = STATION_KEYS[lightboxIndex];
        if (!curStn) return null;
        const rawUrl = task.images?.[curStn.imageKey] || task.images?.[curStn.id];
        const curUrl = normalizeImageUrl(rawUrl, task.taskId || task.id);
        const curStatus = stationStatuses[curStn.id] || 'PASS';
        const curReason = stationReasons[curStn.id];
        const curAiEval = extractAiStationEvaluation(task, curStn.id, rules);
        const curRuleDef = rules.find(r => r.id === curStn.id || r.imageKey === curStn.imageKey);

        const fatalOptions = (curRuleDef?.commonFailures && curRuleDef.commonFailures.length > 0)
          ? curRuleDef.commonFailures
          : [
              'Missing / obscured equipment',
              'Photo blurry or unidentifiable',
              'Duplicate / recycled image',
              'SOP clinical non-compliance'
            ];

        const positiveOptions = (curRuleDef?.standards && curRuleDef.standards.length > 0)
          ? curRuleDef.standards
          : [
              'All equipment clearly visible and compliant',
              'Non-duplicate authentic clinical photo',
              'Meets clinical accuracy standard',
              'False positive AI flag overturned'
            ];

        return (
          <div 
            className="fixed inset-0 z-60 bg-black/95 backdrop-blur-md flex flex-col md:flex-row items-stretch justify-between p-3 sm:p-5 overflow-hidden animate-in fade-in duration-150"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Main Photo Area (Left/Center) */}
            <div 
              className="flex-1 relative flex flex-col items-center justify-center p-2 sm:p-4 min-h-0 select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Floating Station Banner with Lightbox Navigation */}
              <div className="absolute top-3 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
                <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-xl pointer-events-auto">
                  <span className="text-base">{curStn.icon}</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {curStn.label}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    ({lightboxIndex + 1} of {STATION_KEYS.length})
                  </span>
                </div>

                {/* Prev / Next photo buttons in Lightbox */}
                <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-xl pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(prev => Math.max(0, prev - 1))}
                    disabled={lightboxIndex === 0}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer transition-colors"
                    title="Previous Photo (Left Arrow)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(prev => Math.min(STATION_KEYS.length - 1, prev + 1))}
                    disabled={lightboxIndex === STATION_KEYS.length - 1}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer transition-colors"
                    title="Next Photo (Right Arrow)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(null)}
                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 cursor-pointer ml-1 transition-colors"
                    title="Close Lightbox (ESC)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* High-Resolution Image */}
              {curUrl ? (
                <img 
                  src={curUrl} 
                  alt={curStn.label}
                  className="max-h-[82vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
                />
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-bold">No photo attached for this station</p>
                </div>
              )}
            </div>

            {/* Dedicated Right Inspection & Overturn Sidebar */}
            <div 
              className="w-full md:w-96 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col p-4 sm:p-5 overflow-y-auto space-y-4 shrink-0 shadow-2xl rounded-2xl md:rounded-l-2xl md:rounded-r-none max-h-[48vh] md:max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header & Status */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                    Station #{lightboxIndex + 1} Inspection
                  </span>
                  <span className="text-sm font-bold text-white">
                    {curStn.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {curStatus === 'PASS' ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> PASS
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> FAIL
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleStation(curStn.id)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Toggle PASS / FAIL"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* AI Evaluation Criteria Breakdown */}
              <div className={`p-4 rounded-xl border space-y-2.5 ${
                curAiEval.status === 'FAIL' 
                  ? 'bg-red-950/25 border-red-500/40' 
                  : 'bg-emerald-950/25 border-emerald-500/40'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-white">
                    {curAiEval.status === 'FAIL' ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="text-red-300">AI Flagged Violations</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-emerald-300">AI Compliance Evaluation</span>
                      </>
                    )}
                  </span>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded font-mono ${
                    curAiEval.status === 'FAIL' ? 'bg-red-500/30 text-red-200' : 'bg-emerald-500/30 text-emerald-200'
                  }`}>
                    AI: {curAiEval.status}
                  </span>
                </div>

                {curAiEval.status === 'FAIL' ? (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                      Criteria Failed by AI:
                    </span>
                    <div className="space-y-1.5">
                      {curAiEval.failureReasons.map((reason, rIdx) => (
                        <div key={rIdx} className="p-2 rounded-lg bg-red-950/40 border border-red-500/30 flex items-start gap-2 text-xs text-red-200 leading-relaxed">
                          <span className="text-red-400 font-bold shrink-0 mt-0.5">❌</span>
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                    {curAiEval.observations && (
                      <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300">
                        <span className="font-bold text-slate-400 block mb-0.5 text-[10px] uppercase">AI Notes & Observations:</span>
                        "{curAiEval.observations}"
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                      Criteria Verified Compliant:
                    </span>
                    <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-2 text-xs text-emerald-200 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{curAiEval.observations || "All required equipment visible, powered on, and fully compliant with DLC SOP standards."}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Inverse Criteria Overturn Control */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                {curStatus === 'PASS' ? (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block mb-1.5">
                      Overturn this station to FAIL:
                    </label>
                    <select
                      value=""
                      onChange={(e) => handleInverseSelect(curStn.id, 'PASS', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 hover:border-amber-500/60 rounded-xl px-3 py-2 text-xs text-amber-200 focus:outline-none focus:border-amber-400 cursor-pointer font-medium truncate"
                    >
                      <option value="">Select Fatal Violation Reason...</option>
                      {fatalOptions.map((reason, i) => (
                        <option key={i} value={reason} className="bg-slate-900 text-white">
                          ❌ {reason}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block mb-1.5">
                      Overturn this station to PASS:
                    </label>
                    <select
                      value=""
                      onChange={(e) => handleInverseSelect(curStn.id, 'FAIL', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 hover:border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-emerald-200 focus:outline-none focus:border-emerald-400 cursor-pointer font-medium truncate"
                    >
                      <option value="">Select Positive Standard Reason...</option>
                      {positiveOptions.map((standard, i) => (
                        <option key={i} value={standard} className="bg-slate-900 text-white">
                          ✅ {standard}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {curReason && (
                  <div className={`p-2 rounded-lg text-xs leading-relaxed ${
                    curStatus === 'PASS' 
                      ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/20' 
                      : 'bg-red-950/40 text-red-300 border border-red-500/20'
                  }`}>
                    <span className="font-bold">{curStatus === 'PASS' ? 'Current Standard:' : 'Active Violation:'}</span> {curReason}
                  </div>
                )}
              </div>

              {/* Quick Actions at bottom of drawer */}
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => toggleStation(curStn.id)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer text-center"
                >
                  Toggle {curStatus === 'PASS' ? 'to FAIL' : 'to PASS'}
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer text-center"
                >
                  Done
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
