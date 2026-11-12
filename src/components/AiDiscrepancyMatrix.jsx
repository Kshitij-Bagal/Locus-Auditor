import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Filter,
  Search,
  ExternalLink,
  Copy,
  Check,
  Sliders,
  Eye,
  Info,
  TrendingUp,
  Percent,
  FileCode,
  UserCheck
} from 'lucide-react';
import { 
  getTaskCrossVerification, 
  AUDIT_STATIONS, 
  normalizeStationStatus 
} from '../utils/crossVerificationHelper.js';

const STATIONS = [
  { id: 'selfie', label: '1. Selfie & ID Card', desc: 'Official Lenskart polo & visible employee photo ID card' },
  { id: 'torches', label: '2. Blue & Yellow Torches', desc: 'Both cobalt blue & amber yellow penlights turned ON' },
  { id: 'visionChart', label: '3. Vision Chart & Standee', desc: 'Acuity chart mounted properly on telescoping standee' },
  { id: 'toolkit', label: '4. Refraction Toolkit', desc: 'Complete 6-piece kit (trial frame, JCC, book, sanitizer, PD tape, mirror)' },
  { id: 'frameDisplay', label: '5. Frame Display Tray', desc: 'Sample frames neatly displayed on living room table' }
];

export default function AiDiscrepancyMatrix({
  tasks = [],
  onInspectTask,
  onOpenCriteriaModal,
  rules
}) {
  const [filterMode, setFilterMode] = useState('MISMATCH_ONLY'); // 'ALL' | 'MISMATCH_ONLY' | 'AI_FP' | 'AI_FN' | 'STATION'
  const [selectedStationFilter, setSelectedStationFilter] = useState('ALL');
  const [selectedCityFilter, setSelectedCityFilter] = useState('ALL');
  const [selectedInspectorTaskId, setSelectedInspectorTaskId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);

  // Normalize station status helper
  const normStation = (val) => {
    if (!val) return null;
    const v = String(val).toUpperCase();
    if (v === 'PASS' || v === 'PASSED') return 'PASS';
    if (v === 'FAIL' || v === 'FAILED' || v === 'FATAL') return 'FAIL';
    return null;
  };

  // 1. Identify Dual-Audited Tasks (audited by BOTH City Admin & AI, or verified by human)
  const dualAuditedTasks = useMemo(() => {
    return (tasks || []).filter(t => {
      const cross = getTaskCrossVerification(t);
      return cross.isDualAudited;
    });
  }, [tasks]);

  // City list from dual tasks
  const availableCities = useMemo(() => {
    const set = new Set();
    dualAuditedTasks.forEach(t => {
      const c = t.facilityCode || t.city || t.teamName;
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [dualAuditedTasks]);

  // Overall metrics
  const overallMetrics = useMemo(() => {
    const total = dualAuditedTasks.length;
    if (total === 0) {
      return {
        total: 0,
        agreed: 0,
        agreementRate: 0,
        aiFalsePositives: 0,
        aiFalseNegatives: 0,
        highConfDivergence: 0
      };
    }

    let agreed = 0;
    let aiFalsePositives = 0; // Human = FATAL, AI = PASSED (AI too lenient)
    let aiFalseNegatives = 0; // Human = PASSED, AI = FATAL (AI too strict)
    let highConfDivergence = 0;

    dualAuditedTasks.forEach(t => {
      const cross = getTaskCrossVerification(t);
      const hStatus = cross.humanStatus;
      const aiStatus = cross.aiStatus;
      if (hStatus === aiStatus) {
        agreed++;
      } else if (hStatus === 'FATAL' && aiStatus === 'PASSED') {
        aiFalsePositives++;
      } else if (hStatus === 'PASSED' && aiStatus === 'FATAL') {
        aiFalseNegatives++;
        if (Number(cross.aiConfidenceScore || t.aiConfidenceScore) >= 90) {
          highConfDivergence++;
        }
      }
    });

    return {
      total,
      agreed,
      agreementRate: ((agreed / total) * 100).toFixed(1),
      aiFalsePositives,
      aiFalseNegatives,
      highConfDivergence
    };
  }, [dualAuditedTasks]);

  // Per-Station Diagnostic Breakdown
  const stationMetrics = useMemo(() => {
    return STATIONS.map(station => {
      let evaluatedCount = 0;
      let agreedCount = 0;
      let fpCount = 0; // Human FAIL, AI PASS
      let fnCount = 0; // Human PASS, AI FAIL

      dualAuditedTasks.forEach(t => {
        const cross = getTaskCrossVerification(t);
        const stDetail = cross.stationDetails.find(s => s.id === station.id);
        const humanSt = stDetail?.humanStatus || normStation(t.criteriaStatus?.[station.id]);
        const aiSt = stDetail?.aiStatus || normStation(t.aiCriteriaStatus?.[station.id]);

        if (humanSt && aiSt) {
          evaluatedCount++;
          if (humanSt === aiSt) {
            agreedCount++;
          } else if (humanSt === 'FAIL' && aiSt === 'PASS') {
            fpCount++;
          } else if (humanSt === 'PASS' && aiSt === 'FAIL') {
            fnCount++;
          }
        }
      });

      const agreementPct = evaluatedCount > 0 ? ((agreedCount / evaluatedCount) * 100).toFixed(1) : 0;
      const errorMarginPct = evaluatedCount > 0 ? (((fpCount + fnCount) / evaluatedCount) * 100).toFixed(1) : 0;

      let diagnosis = 'Awaiting dual-audit comparison data';
      let diagnosisColor = 'text-slate-400';
      let advice = 'Run AI audits on city-audited tasks to calibrate.';

      if (evaluatedCount > 0) {
        if (Number(agreementPct) >= 94) {
          diagnosis = 'High Agreement (Strong Calibration)';
          diagnosisColor = 'text-emerald-400';
          advice = 'Prompt standards are aligned with City Admin audits.';
        } else if (fnCount > fpCount) {
          diagnosis = `AI Too Strict (${fnCount} False Negatives)`;
          diagnosisColor = 'text-amber-400';
          advice = 'Relax ambiguous strictness directives or inspect image resolution limits.';
        } else if (fpCount > fnCount) {
          diagnosis = `AI Too Lenient (${fpCount} False Positives)`;
          diagnosisColor = 'text-rose-400';
          advice = 'Tighten criteria checklist & force explicit sub-item verification.';
        } else {
          diagnosis = `Balanced Discrepancy (${errorMarginPct}% error)`;
          diagnosisColor = 'text-sky-400';
          advice = 'Review borderline mismatch cases to align standards.';
        }
      }

      return {
        ...station,
        evaluatedCount,
        agreedCount,
        agreementPct,
        errorMarginPct,
        fpCount,
        fnCount,
        diagnosis,
        diagnosisColor,
        advice
      };
    });
  }, [dualAuditedTasks]);

  // Filtered List of Tasks for Drilldown Explorer
  const filteredDualTasks = useMemo(() => {
    return dualAuditedTasks.filter(t => {
      // City filter
      if (selectedCityFilter !== 'ALL') {
        const c = t.facilityCode || t.city || t.teamName || '';
        if (c.toLowerCase() !== selectedCityFilter.toLowerCase()) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mId = String(t.taskId || t.id || '').toLowerCase().includes(q);
        const mFe = String(t.feName || '').toLowerCase().includes(q);
        const mAud = String(t.auditedBy || t.audited_by_name || '').toLowerCase().includes(q);
        if (!mId && !mFe && !mAud) return false;
      }

      const cross = getTaskCrossVerification(t);
      const isMismatch = cross.humanStatus !== cross.aiStatus;
      const isFp = cross.humanStatus === 'FATAL' && cross.aiStatus === 'PASSED';
      const isFn = cross.humanStatus === 'PASSED' && cross.aiStatus === 'FATAL';

      if (filterMode === 'MISMATCH_ONLY' && !isMismatch) return false;
      if (filterMode === 'AI_FP' && !isFp) return false;
      if (filterMode === 'AI_FN' && !isFn) return false;

      // Station specific filter
      if (selectedStationFilter !== 'ALL') {
        const stDetail = cross.stationDetails.find(s => s.id === selectedStationFilter);
        const humanSt = stDetail?.humanStatus || normStation(t.criteriaStatus?.[selectedStationFilter]);
        const aiSt = stDetail?.aiStatus || normStation(t.aiCriteriaStatus?.[selectedStationFilter]);
        if (!humanSt || !aiSt || humanSt === aiSt) return false;
      }

      return true;
    });
  }, [dualAuditedTasks, selectedCityFilter, searchQuery, filterMode, selectedStationFilter]);

  // Active task for side-by-side inspection
  const activeTask = useMemo(() => {
    if (selectedInspectorTaskId) {
      const found = dualAuditedTasks.find(t => String(t.id || t.taskId) === String(selectedInspectorTaskId));
      if (found) return found;
    }
    return filteredDualTasks[0] || null;
  }, [dualAuditedTasks, selectedInspectorTaskId, filteredDualTasks]);

  const copySqlMigration = () => {
    const sql = `-- Supabase PostgreSQL Migration for Dedicated AI Audit Storage
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS ai_audit_status TEXT,
ADD COLUMN IF NOT EXISTS ai_criteria_status JSONB,
ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC,
ADD COLUMN IF NOT EXISTS ai_error_margin NUMERIC,
ADD COLUMN IF NOT EXISTS ai_remarks TEXT,
ADD COLUMN IF NOT EXISTS ai_auditor_name TEXT;

-- Index for high-speed cross-check queries
CREATE INDEX IF NOT EXISTS idx_tasks_ai_audit_status ON public.tasks (ai_audit_status);`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-2xl flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Deterministic Dual-Audit Engine
            </span>
            <span className="text-xs text-slate-400">Ground Truth vs AI Vision Comparison</span>
          </div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <span>🎯 AI vs City Auditor Accuracy & Discrepancy Matrix</span>
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl mt-1">
            Compares manual audits conducted blindly by City Admins against AI vision audits on the same dispatch tasks to identify high-error SOP items, false positives, and prompt tuning targets.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowSqlModal(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            title="View Supabase SQL schema snippet for dedicated AI columns"
          >
            <FileCode className="w-3.5 h-3.5 text-sky-400" />
            <span>Supabase SQL Migration</span>
          </button>

          {onOpenCriteriaModal && (
            <button
              onClick={onOpenCriteriaModal}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/50 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Tweak Prompt Criteria</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold">Dual-Audited Tasks</span>
            <UserCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{overallMetrics.total}</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Audited by both City Admin & AI</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold">Overall Agreement</span>
            <Percent className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {overallMetrics.agreementRate}%
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">{overallMetrics.agreed} of {overallMetrics.total} verdicts matched</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold">AI False Positives (FP)</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">{overallMetrics.aiFalsePositives}</div>
          <p className="text-[10px] text-rose-400/80 mt-0.5">City Admin FATAL, but AI PASSED</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold">AI False Negatives (FN)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">{overallMetrics.aiFalseNegatives}</div>
          <p className="text-[10px] text-amber-400/80 mt-0.5">City Admin PASSED, but AI FATAL</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold">Human Slipped (Probable)</span>
            <Info className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-400 font-mono">{overallMetrics.highConfDivergence}</div>
          <p className="text-[10px] text-purple-400/80 mt-0.5">AI FATAL with ≥90% Conf, Human Pass</p>
        </div>
      </div>

      {/* 3. Station-by-Station (Per-Item) Diagnostic Grid */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>Station-by-Station Error Margins (All 5 SOP Inspection Stations)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any station to filter the drilldown mismatch explorer below and inspect individual photo disagreements.
            </p>
          </div>

          {selectedStationFilter !== 'ALL' && (
            <button
              onClick={() => setSelectedStationFilter('ALL')}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
            >
              Clear Station Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {stationMetrics.map(st => {
            const isSelected = selectedStationFilter === st.id;
            return (
              <div
                key={st.id}
                onClick={() => setSelectedStationFilter(isSelected ? 'ALL' : st.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-sky-500/10 border-sky-500 shadow-lg shadow-sky-950/40'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-bold text-white line-clamp-1">{st.label}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                      {st.evaluatedCount}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-1 mb-2.5">{st.desc}</p>

                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-[10px] text-slate-400 font-semibold">Agreement</span>
                    <span className={`text-base font-black font-mono ${Number(st.agreementPct) >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {st.agreementPct}%
                    </span>
                  </div>

                  {/* Visual Bar */}
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full ${Number(st.agreementPct) >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${st.agreementPct}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono mb-2">
                    <div className="p-1 rounded bg-slate-900 border border-slate-800/80 text-rose-300">
                      <span>FP: </span>
                      <span className="font-bold">{st.fpCount}</span>
                    </div>
                    <div className="p-1 rounded bg-slate-900 border border-slate-800/80 text-amber-300">
                      <span>FN: </span>
                      <span className="font-bold">{st.fnCount}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <div className={`text-[10px] font-bold ${st.diagnosisColor} line-clamp-1`}>
                    {st.diagnosis}
                  </div>
                  <div className="text-[9px] text-slate-400 line-clamp-2 mt-0.5">
                    {st.advice}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Filterable Task Discrepancy Drilldown List & Side-by-Side Reviewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Col: Task Discrepancy List (5 cols) */}
        <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-sky-400" />
              <span>Dual-Audited Tasks ({filteredDualTasks.length})</span>
            </h3>

            {/* Filter Pills */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterMode('MISMATCH_ONLY')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  filterMode === 'MISMATCH_ONLY'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mismatches
              </button>
              <button
                onClick={() => setFilterMode('AI_FP')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  filterMode === 'AI_FP'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                AI FP
              </button>
              <button
                onClick={() => setFilterMode('AI_FN')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  filterMode === 'AI_FN'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                AI FN
              </button>
              <button
                onClick={() => setFilterMode('ALL')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  filterMode === 'ALL'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
            </div>
          </div>

          {/* Search & City Filter Bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search Task ID, FE, Auditor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {availableCities.length > 0 && (
              <select
                value={selectedCityFilter}
                onChange={(e) => setSelectedCityFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="ALL">All Hubs</option>
                {availableCities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          {/* Task List */}
          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {filteredDualTasks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs rounded-xl bg-slate-950 border border-slate-800">
                No tasks match the selected filter. Try selecting "All" or clearing search.
              </div>
            ) : (
              filteredDualTasks.map(task => {
                const isSelected = activeTask && String(activeTask.id || activeTask.taskId) === String(task.id || task.taskId);
                const cross = getTaskCrossVerification(task);
                const isMismatch = cross.humanStatus !== cross.aiStatus;
                const isFp = cross.humanStatus === 'FATAL' && cross.aiStatus === 'PASSED';
                const isFn = cross.humanStatus === 'PASSED' && cross.aiStatus === 'FATAL';

                return (
                  <div
                    key={task.id || task.taskId}
                    onClick={() => setSelectedInspectorTaskId(task.id || task.taskId)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-950/40 border-sky-500 shadow-md shadow-sky-950/40'
                        : isMismatch
                        ? 'bg-slate-950/90 border-rose-900/40 hover:border-rose-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-white">#{task.taskId || task.id}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({task.facilityCode || task.city || 'Hub'})</span>
                      </div>

                      {/* Verdict Badges */}
                      <div className="flex items-center gap-1 text-[10px] font-black">
                        <span className={`px-1.5 py-0.5 rounded ${cross.humanStatus === 'PASSED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                          H: {cross.humanStatus === 'PASSED' ? 'PASS' : 'FATAL'}
                        </span>
                        <span className="text-slate-500">vs</span>
                        <span className={`px-1.5 py-0.5 rounded ${cross.aiStatus === 'PASSED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                          AI: {cross.aiStatus === 'PASSED' ? 'PASS' : 'FATAL'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>FE: {task.feName || 'Unknown'}</span>
                      <span>Auditor: {cross.humanAuditorName || task.auditedBy || 'City Admin'}</span>
                    </div>

                    {isMismatch && (
                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className={`font-bold ${isFp ? 'text-rose-400' : 'text-amber-400'}`}>
                          {isFp ? '⚠️ AI False Positive (Too Lenient)' : '⚠️ AI False Negative (Too Strict)'}
                        </span>
                        <span className="text-slate-500 font-mono">Conf: {cross.aiConfidenceScore || task.aiConfidenceScore || 0}%</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Col: Deep Side-by-Side Reviewer (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          {!activeTask ? (
            <div className="p-16 text-center text-slate-500 text-xs">
              Select a task from the list on the left to inspect side-by-side criteria and photos.
            </div>
          ) : (() => {
            const activeCross = getTaskCrossVerification(activeTask);
            const activeHumanStatus = activeCross.humanStatus;
            const activeAiStatus = activeCross.aiStatus;
            const activeHumanAuditor = activeCross.humanAuditorName || activeTask.auditedBy || 'City Admin';
            const activeAiAuditor = activeCross.aiAuditorName || activeTask.aiAuditorName || 'Universal AI';
            const activeAiConfidence = activeCross.aiConfidenceScore ?? activeTask.aiConfidenceScore ?? 0;
            const rawRemarks = activeTask.remarks || activeTask.auditor_remarks || '';
            const activeAiRemarks = activeTask.aiRemarks || (rawRemarks.includes('Original AI:') ? rawRemarks.split('Original AI:')[1]?.trim() : '');

            return (
              <>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-white font-mono">Task #{activeTask.taskId || activeTask.id}</h4>
                      <span className="text-xs text-slate-400">• {activeTask.feName} ({activeTask.feCode || 'FE'})</span>
                      <span className="text-xs text-slate-500 font-mono">[{activeTask.facilityCode || 'Hub'}]</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Dispatch: {activeTask.date || activeTask.dispatch_date || 'N/A'} • Customer: {activeTask.customerName || 'N/A'}
                    </p>
                  </div>

                  {onInspectTask && (
                    <button
                      onClick={() => onInspectTask(activeTask)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Open in Full Viewer</span>
                    </button>
                  )}
                </div>

                {/* Side-by-Side Comparison Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 1. City Admin Ground Truth */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <span className="text-xs font-bold text-sky-300 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>City Admin Audit (Ground Truth)</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        activeHumanStatus === 'PASSED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {activeHumanStatus}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-1">
                      <div><span className="text-slate-500">Auditor:</span> {activeHumanAuditor}</div>
                      {activeCross.humanAuditedAt && (
                        <div><span className="text-slate-500">Audited At:</span> {new Date(activeCross.humanAuditedAt).toLocaleString()}</div>
                      )}
                    </div>

                    {/* Criteria Checklist */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Station Status:</span>
                      {STATIONS.map(s => {
                        const stDetail = activeCross.stationDetails.find(st => st.id === s.id);
                        const st = stDetail?.humanStatus || normStation(activeTask.criteriaStatus?.[s.id]);
                        return (
                          <div key={s.id} className="flex items-center justify-between text-[11px] py-0.5">
                            <span className="text-slate-300">{s.label}</span>
                            <span className={`font-mono font-bold text-[10px] ${st === 'PASS' ? 'text-emerald-400' : (st === 'FAIL' ? 'text-rose-400' : 'text-slate-500')}`}>
                              {st || 'N/A'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Auditor Remarks */}
                    {rawRemarks && (
                      <div className="pt-2 border-t border-slate-800/80 text-[11px]">
                        <span className="text-slate-500 block mb-0.5">Remarks:</span>
                        <p className="text-slate-300 italic bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                          "{rawRemarks}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 2. AI Vision Audit */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <span className="text-xs font-bold text-purple-300 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI Vision Audit</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        activeAiStatus === 'PASSED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {activeAiStatus}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-1">
                      <div><span className="text-slate-500">Model:</span> {activeAiAuditor}</div>
                      <div>
                        <span className="text-slate-500">Confidence:</span> {activeAiConfidence}%
                        {activeTask.aiErrorMargin ? ` (±${activeTask.aiErrorMargin}%)` : ''}
                      </div>
                    </div>

                    {/* AI Criteria Checklist */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">AI Station Status:</span>
                      {STATIONS.map(s => {
                        const stDetail = activeCross.stationDetails.find(st => st.id === s.id);
                        const st = stDetail?.aiStatus || normStation(activeTask.aiCriteriaStatus?.[s.id]);
                        const humanSt = stDetail?.humanStatus || normStation(activeTask.criteriaStatus?.[s.id]);
                        const isDiscrepant = humanSt && st && humanSt !== st;

                        return (
                          <div key={s.id} className="flex items-center justify-between text-[11px] py-0.5">
                            <span className={`${isDiscrepant ? 'text-amber-300 font-bold' : 'text-slate-300'}`}>
                              {s.label}
                            </span>
                            <div className="flex items-center gap-1 font-mono text-[10px] font-bold">
                              <span className={st === 'PASS' ? 'text-emerald-400' : (st === 'FAIL' ? 'text-rose-400' : 'text-slate-500')}>
                                {st || 'N/A'}
                              </span>
                              {isDiscrepant && (
                                <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Mismatch
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* AI Remarks */}
                    {activeAiRemarks && (
                      <div className="pt-2 border-t border-slate-800/80 text-[11px]">
                        <span className="text-slate-500 block mb-0.5">AI Summary:</span>
                        <p className="text-slate-300 italic bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                          "{activeAiRemarks}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Photos Row (5 photos side-by-side) */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400 block">Submitted Dispatch Photos (Review Ground Truth):</span>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {STATIONS.map(s => {
                      const imgUrl = activeTask.images?.[s.id] || activeTask.images?.[s.id.toLowerCase()];
                      const stDetail = activeCross.stationDetails.find(st => st.id === s.id);
                      const hSt = stDetail?.humanStatus || normStation(activeTask.criteriaStatus?.[s.id]);
                      const aiSt = stDetail?.aiStatus || normStation(activeTask.aiCriteriaStatus?.[s.id]);

                      return (
                        <div key={s.id} className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 relative group">
                          <div className="h-28 w-full bg-slate-900 flex items-center justify-center overflow-hidden">
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={s.label}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">No image</span>
                            )}
                          </div>

                          <div className="p-1.5 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[9px] font-mono">
                            <span className="text-slate-300 truncate">{s.id}</span>
                            <div className="flex items-center gap-1 font-bold">
                              <span className={hSt === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}>H:{hSt || '-'}</span>
                              <span className={aiSt === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}>AI:{aiSt || '-'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* 5. Supabase SQL Migration Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileCode className="w-5 h-5 text-sky-400" />
                <span>Supabase SQL Migration for Dedicated AI Columns</span>
              </h3>
              <button
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Run this single command in your <strong>Supabase Dashboard → SQL Editor</strong> to create dedicated storage for AI audits. This allows City Admin manual audits and Super Admin AI audits to coexist without overwriting each other.
            </p>

            <div className="relative">
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-sky-300 overflow-x-auto leading-relaxed">
{`-- Add dedicated AI audit verdict columns to public.tasks
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS ai_audit_status TEXT,
ADD COLUMN IF NOT EXISTS ai_criteria_status JSONB,
ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC,
ADD COLUMN IF NOT EXISTS ai_error_margin NUMERIC,
ADD COLUMN IF NOT EXISTS ai_remarks TEXT,
ADD COLUMN IF NOT EXISTS ai_auditor_name TEXT;

-- Create index for fast discrepancy cross-checking
CREATE INDEX IF NOT EXISTS idx_tasks_ai_audit_status ON public.tasks (ai_audit_status);`}
              </pre>

              <button
                onClick={copySqlMigration}
                className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 shadow-md transition-all cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
