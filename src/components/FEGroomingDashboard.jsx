import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Search,
  RefreshCw,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Maximize2,
  X,
  Key,
  RotateCcw,
  Loader2,
  MapPin,
  Calendar,
  CheckCheck,
  FlaskConical
} from 'lucide-react';
import { groomingApi, settingsApi } from '../api/client.js';
import {
  getTodayYMD,
  evaluateGroomingWithAi,
  resolveGroomingAiCredentials
} from '../utils/groomingAiHelper.js';
import { parseRoles, normalizeRoleName } from '../utils/accessHelper.js';
import FEGroomingTestBench from './FEGroomingTestBench.jsx';

const CRITERIA_LABELS = {
  uniform: 'Solid Polo',
  idCard: 'ID Card & Lanyard',
  hairGrooming: 'Hair Grooming',
  facialHair: 'Facial Hair',
  jeans: 'Dark Blue Jeans Only (Unfaded)',
  shoes: 'Black Shoes + Black Laces'
};

export default function FEGroomingDashboard({ currentUser }) {
  const todayDate = getTodayYMD();
  const userRoles = parseRoles(currentUser?.roles || [currentUser?.role]);
  const isSuperAdmin =
    userRoles.some(r => normalizeRoleName(r) === 'SuperAdmin') ||
    normalizeRoleName(currentUser?.role) === 'SuperAdmin';

  const [activeSubTab, setActiveSubTab] = useState('LOGS'); // 'LOGS' | 'TEST_BENCH'
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [hubFilter, setHubFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const [runningAiId, setRunningAiId] = useState(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [sharedAiSynced, setSharedAiSynced] = useState(false);
  const [sharedAiConfig, setSharedAiConfig] = useState(null);
  const [sharedConfigPresent, setSharedConfigPresent] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg, type = 'info') => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sharedCfg] = await Promise.all([
        groomingApi.getChecks('ALL'),
        settingsApi.getGroomingAiConfig().catch(() => null)
      ]);
      setChecks(Array.isArray(list) ? list : []);
      setSharedAiConfig(sharedCfg || null);
      setSharedConfigPresent(Boolean(sharedCfg?.apiKey));
    } catch (err) {
      showToast(`Failed to load grooming checks: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Available dates & hubs
  const availableDates = useMemo(() => {
    const set = new Set([todayDate]);
    checks.forEach(c => {
      if (c.checkDate) set.add(c.checkDate);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [checks, todayDate]);

  const availableHubs = useMemo(() => {
    const set = new Set();
    checks.forEach(c => {
      if (c.facilityCode) set.add(c.facilityCode);
    });
    return Array.from(set).sort();
  }, [checks]);

  // Scope filtered by selectedDate (or ALL) and hub
  const dateScopedChecks = useMemo(() => {
    return checks.filter(c => {
      if (selectedDate !== 'ALL' && c.checkDate !== selectedDate) return false;
      if (hubFilter !== 'ALL' && c.facilityCode !== hubFilter) return false;
      return true;
    });
  }, [checks, selectedDate, hubFilter]);

  const stats = useMemo(() => {
    const total = dateScopedChecks.length;
    const passed = dateScopedChecks.filter(c => c.status === 'PASS').length;
    const warned = dateScopedChecks.filter(c => c.status === 'WARNING').length;
    const fatal = dateScopedChecks.filter(c => c.status === 'FATAL').length;
    const pending = dateScopedChecks.filter(c => c.status === 'PENDING_AI').length;
    const recapture = dateScopedChecks.filter(c => c.status === 'RECAPTURE_REQUESTED').length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;
    return { total, passed, warned, fatal, pending, recapture, passRate };
  }, [dateScopedChecks]);

  const filteredChecks = useMemo(() => {
    return dateScopedChecks.filter(c => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = String(c.feName || '').toLowerCase().includes(q);
        const matchCode = String(c.feCode || '').toLowerCase().includes(q);
        const matchHub = String(c.facilityCode || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchHub) return false;
      }
      return true;
    });
  }, [dateScopedChecks, statusFilter, searchQuery]);

  // Allow Admin/Auditor to sync their active AI provider key for FE self-checks
  const handleSyncAiKeyForFes = async () => {
    const localCreds = resolveGroomingAiCredentials(null);
    if (!localCreds) {
      showToast('Please configure an AI API key inside the AI Audits Console first.', 'error');
      return;
    }
    try {
      await settingsApi.saveGroomingAiConfig(
        {
          providerId: localCreds.providerId,
          apiKey: localCreds.apiKey,
          model: localCreds.model,
          syncedAt: new Date().toISOString()
        },
        currentUser?.full_name || currentUser?.email || 'Admin'
      );
      setSharedConfigPresent(true);
      setSharedAiSynced(true);
      showToast(`Synced ${localCreds.providerId.toUpperCase()} (${localCreds.model}) so FEs get instant AI Grooming validation!`, 'success');
    } catch (err) {
      showToast(`Failed to sync AI key: ${err.message}`, 'error');
    }
  };

  // Run or re-run AI Validation for a single check
  const handleRunAiOnCheck = async (check) => {
    setRunningAiId(check.id);
    try {
      const sharedCfg = await settingsApi.getGroomingAiConfig().catch(() => null);
      const aiResult = await evaluateGroomingWithAi({
        upperImageUrl: check.upperImageUrl,
        lowerImageUrl: check.lowerImageUrl,
        feName: check.feName,
        feCode: check.feCode,
        expectedDate: check.checkDate,
        upperTimestamp: check.upperTimestamp,
        lowerTimestamp: check.lowerTimestamp,
        upperNonce: check.upperNonce,
        lowerNonce: check.lowerNonce,
        sharedAiConfig: sharedCfg
      });

      const updated = {
        ...check,
        status: aiResult.overallVerdict,
        overallScore: aiResult.overallScore,
        aiSummary: aiResult.summary,
        aiCriteria: {
          upperBody: aiResult.upperBody,
          lowerBody: aiResult.lowerBody,
          timestampNotes: aiResult.timestampNotes,
          _warnings: aiResult.warnings || []
        },
        warnings: aiResult.warnings || [],
        failedReasons: aiResult.failedReasons,
        timestampVerified: aiResult.timestampVerified,
        spoofDetected: aiResult.spoofDetected,
        providerUsed: aiResult.providerUsed,
        modelUsed: aiResult.modelUsed
      };

      await groomingApi.upsertCheck(updated);
      setChecks(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      showToast(`AI Grooming Check completed for ${check.feName}: ${updated.status}`, updated.status === 'PASS' ? 'success' : 'warning');
    } catch (err) {
      showToast(
        err.message === 'NO_AI_KEY_CONFIGURED'
          ? 'No AI API key configured. Open AI Audits Console to save an API key.'
          : `AI Validation failed: ${err.message}`,
        'error'
      );
    } finally {
      setRunningAiId(null);
    }
  };

  // Batch run AI on all PENDING_AI checks
  const handleBatchRunPending = async () => {
    const pendingList = dateScopedChecks.filter(c => c.status === 'PENDING_AI');
    if (pendingList.length === 0) return;
    setBatchRunning(true);
    for (const item of pendingList) {
      await handleRunAiOnCheck(item);
    }
    setBatchRunning(false);
  };

  // Supervisor override or Request Re-capture
  const handleSupervisorAction = async (check, targetStatus) => {
    let notes = '';
    if (targetStatus === 'FATAL') {
      notes = prompt(`Enter grooming violation reason for ${check.feName}:`, check.failedReasons?.[0] || 'Uniform / Grooming non-compliance observed');
      if (!notes) return;
    } else if (targetStatus === 'WARNING') {
      notes = prompt(`Enter minor warning note for ${check.feName}:`, check.warnings?.[0] || 'Minor grooming correction needed by next shift (e.g., polish black shoes / solid dark jeans)');
      if (!notes) return;
    } else if (targetStatus === 'RECAPTURE_REQUESTED') {
      notes = prompt(`Message to ${check.feName} for live recapture:`, 'Please retake clear live photos showing ID badge, hair & plain black shoes');
      if (!notes) return;
    } else {
      notes = 'Manually verified compliant by supervisor';
    }

    const updated = {
      ...check,
      status: targetStatus,
      humanOverrideStatus: targetStatus,
      humanOverrideBy: currentUser?.full_name || currentUser?.email || 'Supervisor',
      humanOverrideNotes: notes,
      warnings: targetStatus === 'WARNING' ? [notes] : (targetStatus === 'PASS' ? [] : (check.warnings || [])),
      failedReasons: targetStatus === 'FATAL' ? [notes] : (targetStatus === 'PASS' || targetStatus === 'WARNING' ? [] : check.failedReasons),
      aiSummary: notes
    };

    try {
      await groomingApi.upsertCheck(updated);
      setChecks(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      showToast(`Updated ${check.feName}'s grooming check to ${targetStatus}.`, 'success');
    } catch (err) {
      showToast(`Update failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950/30 to-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black text-white">Daily FE Grooming & Attire Audit</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                LIVE TIMESTAMPED CAPTURE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Monitors daily live chest/face grooming (Polo Uniform, ID Card, Hair, Facial Hair) & footwear/jeans compliance across hubs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSyncAiKeyForFes}
            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer transition-all ${
              sharedConfigPresent || sharedAiSynced
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/40'
                : 'bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/40'
            }`}
            title="Share your configured AI API key in Supabase settings so FEs get automated instant AI grooming check results on submission"
          >
            <Key className="w-3.5 h-3.5" />
            <span>{sharedConfigPresent ? 'FE Auto-AI Enabled ✓' : 'Enable FE Auto-AI Key'}</span>
          </button>

          {stats.pending > 0 && (
            <button
              onClick={handleBatchRunPending}
              disabled={batchRunning}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
            >
              {batchRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>AI Validate Pending ({stats.pending})</span>
            </button>
          )}

          <button
            onClick={loadData}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {toastMsg && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            toastMsg.type === 'error'
              ? 'bg-red-950/80 border-red-500/50 text-red-200'
              : toastMsg.type === 'warning'
              ? 'bg-amber-950/80 border-amber-500/50 text-amber-200'
              : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
          }`}
        >
          <span>{toastMsg.msg}</span>
          <button onClick={() => setToastMsg(null)} className="text-current opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SuperAdmin Mode Switcher: DB Logs vs Zero-DB AI Accuracy Sandbox */}
      {isSuperAdmin && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('LOGS')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'LOGS'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Daily FE Grooming Logs ({dateScopedChecks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('TEST_BENCH')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'TEST_BENCH'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-violet-500/30'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            <span>SuperAdmin AI Combo Test Bench (No DB Save)</span>
          </button>
        </div>
      )}

      {activeSubTab === 'TEST_BENCH' && isSuperAdmin ? (
        <FEGroomingTestBench currentUser={currentUser} sharedAiConfig={sharedAiConfig} />
      ) : (
        <>
          {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div onClick={() => setStatusFilter('ALL')} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 cursor-pointer">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Checked-In</span>
          <div className="text-2xl font-black text-white mt-1">{stats.total}</div>
          <span className="text-[11px] text-slate-400">{selectedDate === 'ALL' ? 'All Dates' : selectedDate}</span>
        </div>

        <div onClick={() => setStatusFilter('PASS')} className="bg-slate-900 border border-emerald-500/30 hover:border-emerald-500/60 rounded-xl p-3.5 cursor-pointer">
          <span className="text-[11px] font-bold text-emerald-400 uppercase">Compliant (Pass)</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{stats.passed}</div>
          <span className="text-[11px] text-emerald-300/80">{stats.passRate}% Pass Rate</span>
        </div>

        <div onClick={() => setStatusFilter('WARNING')} className="bg-slate-900 border border-amber-500/40 hover:border-amber-500/70 rounded-xl p-3.5 cursor-pointer">
          <span className="text-[11px] font-bold text-amber-300 uppercase">Minor Warnings</span>
          <div className="text-2xl font-black text-amber-300 mt-1">{stats.warned}</div>
          <span className="text-[11px] text-amber-200/80">Minor corrections</span>
        </div>

        <div onClick={() => setStatusFilter('FATAL')} className="bg-slate-900 border border-red-500/30 hover:border-red-500/60 rounded-xl p-3.5 cursor-pointer">
          <span className="text-[11px] font-bold text-red-400 uppercase">Grooming Violations</span>
          <div className="text-2xl font-black text-red-400 mt-1">{stats.fatal}</div>
          <span className="text-[11px] text-red-300/80">Action required</span>
        </div>

        <div onClick={() => setStatusFilter('PENDING_AI')} className="bg-slate-900 border border-amber-500/30 hover:border-amber-500/60 rounded-xl p-3.5 cursor-pointer">
          <span className="text-[11px] font-bold text-amber-400 uppercase">Pending AI Check</span>
          <div className="text-2xl font-black text-amber-400 mt-1">{stats.pending}</div>
          <span className="text-[11px] text-amber-300/80">Queued for inspection</span>
        </div>

        <div onClick={() => setStatusFilter('RECAPTURE_REQUESTED')} className="bg-slate-900 border border-sky-500/30 hover:border-sky-500/60 rounded-xl p-3.5 cursor-pointer">
          <span className="text-[11px] font-bold text-sky-400 uppercase">Recapture Asked</span>
          <div className="text-2xl font-black text-sky-400 mt-1">{stats.recapture}</div>
          <span className="text-[11px] text-sky-300/80">Awaiting fresh selfie</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FE Name, FE Code, or Hub..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Dates</option>
              {availableDates.map(d => (
                <option key={d} value={d} className="bg-slate-900">
                  {d} {d === todayDate ? '(Today)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={hubFilter}
              onChange={(e) => setHubFilter(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Hubs</option>
              {availableHubs.map(h => (
                <option key={h} value={h} className="bg-slate-900">{h}</option>
              ))}
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="ALL" className="bg-slate-900">All Statuses</option>
            <option value="PASS" className="bg-slate-900">✅ Passed Only</option>
            <option value="WARNING" className="bg-slate-900">⚠️ Warnings (Minor)</option>
            <option value="FATAL" className="bg-slate-900">❌ Violations (Fatal)</option>
            <option value="PENDING_AI" className="bg-slate-900">⏳ Pending AI</option>
            <option value="RECAPTURE_REQUESTED" className="bg-slate-900">📷 Recapture Requested</option>
          </select>
        </div>
      </div>

      {/* Submissions Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-sky-400" />
          Loading daily FE grooming check-ins...
        </div>
      ) : filteredChecks.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center">
          <Camera className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white">No Daily Grooming Check-Ins Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Field Executives submit live camera check-ins directly inside their <strong>My Visits</strong> portal before starting visits.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredChecks.map(chk => {
            const upperCrit = chk.aiCriteria?.upperBody?.criteria || {};
            const lowerCrit = chk.aiCriteria?.lowerBody?.criteria || {};
            const allCriteria = [
              { id: 'uniform', data: upperCrit.uniform },
              { id: 'idCard', data: upperCrit.idCard },
              { id: 'hairGrooming', data: upperCrit.hairGrooming },
              { id: 'facialHair', data: upperCrit.facialHair },
              { id: 'jeans', data: lowerCrit.jeans },
              { id: 'shoes', data: lowerCrit.shoes }
            ];

            return (
              <div
                key={chk.id}
                className={`bg-slate-900 border rounded-2xl p-4 space-y-3.5 shadow-xl ${
                  chk.status === 'FATAL'
                    ? 'border-red-500/50 bg-red-950/10'
                    : chk.status === 'PASS'
                    ? 'border-emerald-500/40'
                    : 'border-amber-500/40'
                }`}
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{chk.feName}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-sky-300">
                        {chk.feCode}
                      </span>
                      <span className="text-[11px] text-slate-400">{chk.facilityCode}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{chk.checkDate}</span>
                      <span>&bull;</span>
                      {chk.timestampVerified && !chk.spoofDetected ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Live Watermark Verified
                        </span>
                      ) : (
                        <span className="text-red-400 font-bold flex items-center gap-1 animate-pulse">
                          <ShieldAlert className="w-3.5 h-3.5" /> Timestamp / Spoof Warning
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase ${
                        chk.status === 'PASS'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : chk.status === 'FATAL'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {chk.status}
                    </span>
                    {chk.overallScore > 0 && (
                      <span className="text-xs font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                        {chk.overallScore}%
                      </span>
                    )}
                  </div>
                </div>

                {/* 2 Photos Side by Side (Uncropped object-contain) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { title: '1. Chest, Torso & Face', url: chk.upperImageUrl, ts: chk.upperTimestamp },
                    { title: '2. Jeans & Shoes', url: chk.lowerImageUrl, ts: chk.lowerTimestamp }
                  ].map((photo, idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                      <div className="px-2.5 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-200">{photo.title}</span>
                        <span className="font-mono text-[10px] text-sky-400">{photo.ts?.split(' ')[1] || ''}</span>
                      </div>
                      <div
                        className="h-56 bg-black flex items-center justify-center relative group cursor-pointer"
                        onClick={() => setPreviewPhoto({ url: photo.url, title: `${chk.feName} • ${photo.title}` })}
                      >
                        <img src={photo.url} alt={photo.title} className="w-full h-full object-contain p-1" />
                        <span className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/80 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Criteria Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {allCriteria.map(({ id, data }) => {
                    const st = data?.status || (chk.status === 'PENDING_AI' ? 'PENDING' : 'PASS');
                    return (
                      <span
                        key={id}
                        title={data?.note || ''}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${
                          st === 'FAIL'
                            ? 'bg-red-950/40 text-red-300 border-red-500/40'
                            : st === 'WARNING'
                            ? 'bg-amber-950/40 text-amber-200 border-amber-500/50'
                            : st === 'PASS'
                            ? 'bg-emerald-950/30 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        <span>{st === 'FAIL' ? '❌' : st === 'WARNING' ? '⚠️' : st === 'PASS' ? '✅' : '⏳'}</span>
                        <span>{CRITERIA_LABELS[id]}</span>
                      </span>
                    );
                  })}
                </div>

                {/* AI Summary / Warnings / Failed Reasons */}
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                  <div className="text-slate-300">{chk.aiSummary}</div>
                  {chk.warnings?.length > 0 && (
                    <div className="text-[11px] text-amber-300 font-semibold pt-1">
                      Warnings: {chk.warnings.join(' • ')}
                    </div>
                  )}
                  {chk.failedReasons?.length > 0 && (
                    <div className="text-[11px] text-red-300 font-semibold pt-1">
                      Violations: {chk.failedReasons.join(' • ')}
                    </div>
                  )}
                  {allCriteria.some(c => c.data?.note && (c.data?.status === 'FAIL' || c.data?.status === 'WARNING')) && (
                    <div className="pt-1 border-t border-slate-800/80 space-y-0.5">
                      {allCriteria
                        .filter(c => c.data?.note && (c.data?.status === 'FAIL' || c.data?.status === 'WARNING'))
                        .map(c => (
                          <div key={c.id} className={`text-[10px] ${c.data.status === 'FAIL' ? 'text-red-300/90' : 'text-amber-300/90'}`}>
                            <strong>{CRITERIA_LABELS[c.id]}:</strong> {c.data.note}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Supervisor Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => handleRunAiOnCheck(chk)}
                    disabled={runningAiId === chk.id}
                    className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {runningAiId === chk.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{chk.status === 'PENDING_AI' ? 'Run AI Check' : 'Re-Run AI Check'}</span>
                  </button>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleSupervisorAction(chk, 'PASS')}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => handleSupervisorAction(chk, 'WARNING')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" /> Issue Warning
                    </button>
                    <button
                      onClick={() => handleSupervisorAction(chk, 'FATAL')}
                      className="px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" /> Flag Violation
                    </button>
                    <button
                      onClick={() => handleSupervisorAction(chk, 'RECAPTURE_REQUESTED')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Ask Recapture
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Enlarged Photo Lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="w-full max-w-4xl flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-white">{previewPhoto.title}</span>
            <button
              onClick={() => setPreviewPhoto(null)}
              className="p-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={previewPhoto.url}
            alt={previewPhoto.title}
            className="max-h-[84vh] max-w-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
        </>
      )}
    </div>
  );
}
