import React, { useState, useMemo, useEffect } from 'react';
import { 
  Clock, 
  Send, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Eye, 
  ShieldAlert, 
  Calendar, 
  Mail, 
  UserCheck, 
  Zap, 
  Server, 
  Check, 
  Info,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  Play
} from 'lucide-react';
import { 
  normalizeDateToYMD, 
  aggregateFeFatalDigests, 
  buildFeFatalWarningEmailHtml 
} from '../utils/dailyDigestHelper.js';
import { feFatalDigestApi } from '../api/client.js';

export default function SuperAdminCronEngine({
  tasks = [],
  users = [],
  currentUser
}) {
  const [targetDate, setTargetDate] = useState(() => normalizeDateToYMD(new Date()));
  const [searchQuery, setSearchQuery] = useState('');
  const [forceRedispatch, setForceRedispatch] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [previewDigest, setPreviewDigest] = useState(null);
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expandedFe, setExpandedFe] = useState(null);
  const [showConfigDetails, setShowConfigDetails] = useState(false);

  // Compute FE Fatal aggregation for selected date
  const portalBaseUrl = window.location.origin;
  const feDigests = useMemo(() => {
    return aggregateFeFatalDigests({
      tasks,
      users,
      targetDateStr: targetDate,
      portalBaseUrl
    });
  }, [tasks, users, targetDate, portalBaseUrl]);

  // Overall metrics for the day
  const dayStats = useMemo(() => {
    let dayTotalAudited = 0;
    let dayPassed = 0;
    let dayFatals = 0;

    tasks.forEach(t => {
      const taskDate = (t.auditedAt || t.audited_at || t.dispatchDate || t.dispatch_date || '').slice(0, 10);
      if (taskDate !== targetDate) return;
      const status = (t.auditStatus || t.audit_status || '').toUpperCase();
      if (status === 'PASSED') {
        dayTotalAudited++;
        dayPassed++;
      } else if (status === 'FATAL') {
        dayTotalAudited++;
        dayFatals++;
      }
    });

    return {
      dayTotalAudited,
      dayPassed,
      dayFatals,
      affectedFEs: feDigests.length
    };
  }, [tasks, targetDate, feDigests]);

  // Filter FE digests by search query
  const filteredFeDigests = useMemo(() => {
    if (!searchQuery.trim()) return feDigests;
    const q = searchQuery.toLowerCase().trim();
    return feDigests.filter(fe => 
      fe.feName.toLowerCase().includes(q) ||
      fe.feCode.toLowerCase().includes(q) ||
      fe.feEmail.toLowerCase().includes(q) ||
      fe.hub.toLowerCase().includes(q) ||
      fe.amName.toLowerCase().includes(q) ||
      fe.rmName.toLowerCase().includes(q)
    );
  }, [feDigests, searchQuery]);

  // Fetch dispatch logs
  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await feFatalDigestApi.getDispatchLogs(targetDate);
      setDispatchLogs(logs || []);
    } catch (e) {
      console.warn('Failed to load dispatch logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [targetDate]);

  // Handle Dispatch (Live or Dry-Run)
  const handleTriggerDispatch = async (isDryRun = false, feCode = null) => {
    const actionName = isDryRun ? 'Dry-Run Simulation' : 'Live Warning Notice Dispatch';
    const feTargetLabel = feCode ? `for FE (${feCode})` : `for ALL ${feDigests.length} affected FEs`;

    if (!isDryRun && !window.confirm(`Are you sure you want to trigger ${actionName} ${feTargetLabel} for ${targetDate}?\n\nThis will send official compliance warning emails to Field Executives with CC to direct Area Managers & Regional Managers.`)) {
      return;
    }

    setIsDispatching(true);
    setDispatchResult(null);

    try {
      const result = await feFatalDigestApi.triggerFeFatalDispatch({
        date: targetDate,
        force: forceRedispatch,
        feCode,
        dryRun: isDryRun,
        tasks,
        users
      });

      setDispatchResult(result);
      await loadLogs();
    } catch (err) {
      alert(`Dispatch Error: ${err.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-100">

      {/* TOP HEADER & CRON STATUS BANNER */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                SuperAdmin Cron Engine
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Scheduled: Daily 20:30 IST (8:30 PM)
              </span>
            </div>

            <h2 className="text-2xl font-black text-white mt-1.5 flex items-center gap-2">
              Daily FE Fatal Strike Aggregated Warning Engine
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Consolidates today&apos;s photo audit non-compliance strikes per Field Executive into <strong className="text-white">strictly 1 formal corporate email notice</strong>.
              Addressed to <strong className="text-sky-300">FE (TO)</strong> with supervisory CC to direct <strong className="text-purple-300">Area Manager (CC)</strong> and <strong className="text-amber-300">Regional Manager (CC)</strong>.
              FEs with 0 fatal strikes are <strong className="text-emerald-400">completely excluded</strong> to preserve email quota.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
            <button
              onClick={() => setShowConfigDetails(!showConfigDetails)}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Server className="w-3.5 h-3.5 text-sky-400" />
              Cron Details
              {showConfigDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={loadLogs}
              disabled={isLoadingLogs}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Expandable Technical Cron Details */}
        {showConfigDetails && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300 animate-fade-in">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" /> Vercel Schedule
              </div>
              <div className="font-mono text-white text-xs">30 20 * * * (20:30 IST / 8:30 PM)</div>
              <div className="text-[11px] text-slate-500 mt-1">Configured in vercel.json root</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-sky-400" /> Schedulable Endpoint
              </div>
              <div className="font-mono text-white text-xs truncate">/api/cron/daily-fe-fatal-digest</div>
              <div className="text-[11px] text-slate-500 mt-1">Bearer Auth via CRON_SECRET</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-emerald-400" /> Quota Optimization
              </div>
              <div className="text-emerald-400 font-semibold">Strict Fatal-Only Filter</div>
              <div className="text-[11px] text-slate-400 mt-1">0 Fatals = 0 Emails. Saves 95%+ quota.</div>
            </div>
          </div>
        )}
      </div>

      {/* DATE PICKER & METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Date Selector Card */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Target Audit Date</span>
            <Calendar className="w-4 h-4 text-sky-400" />
          </div>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Total Day Audits */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Total Audited Today</span>
            <CheckCircle className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{dayStats.dayTotalAudited}</span>
            <span className="text-[11px] text-emerald-400">({dayStats.dayPassed} Passed)</span>
          </div>
        </div>

        {/* Total Fatal Strikes */}
        <div className="p-4 rounded-xl bg-slate-900 border border-red-500/20 bg-red-500/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-red-400 font-semibold">
            <span>Total Fatal Strikes</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-red-400">{dayStats.dayFatals}</span>
            <span className="text-[11px] text-slate-400 ml-2">strike occurrences</span>
          </div>
        </div>

        {/* Affected FEs (To Receive Warnings) */}
        <div className="p-4 rounded-xl bg-slate-900 border border-purple-500/20 bg-purple-500/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-purple-300 font-semibold">
            <span>FEs to Notify Tonight</span>
            <Mail className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-300">{feDigests.length}</span>
            <span className="text-[11px] text-slate-400">FEs with &ge; 1 Strike</span>
          </div>
        </div>
      </div>

      {/* ACTION & CONTROLS TOOLBAR */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Filter className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search FE, Code, Hub or AM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Actions & Redispatch toggle */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceRedispatch}
              onChange={(e) => setForceRedispatch(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-red-500 focus:ring-0 cursor-pointer"
            />
            <span>Force Re-dispatch</span>
          </label>

          <button
            onClick={() => handleTriggerDispatch(true)}
            disabled={isDispatching || feDigests.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5 text-amber-400" />
            Dry-Run Simulation
          </button>

          <button
            onClick={() => handleTriggerDispatch(false)}
            disabled={isDispatching || feDigests.length === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-900/30 transition-all cursor-pointer disabled:opacity-40"
          >
            {isDispatching ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Dispatch Fatal Warnings to FEs Now ({feDigests.length})
          </button>
        </div>
      </div>

      {/* DISPATCH RESULT ALERT (IF JUST EXECUTED) */}
      {dispatchResult && (
        <div className={`p-4 rounded-xl border text-xs animate-fade-in ${
          dispatchResult.failedCount > 0 
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' 
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
        }`}>
          <div className="flex items-center justify-between font-bold text-sm mb-1">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Execution Complete ({dispatchResult.mode})
            </span>
            <button 
              onClick={() => setDispatchResult(null)} 
              className="text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <div className="flex gap-4 mt-2 font-mono">
            <span>Sent: <strong>{dispatchResult.sentCount}</strong></span>
            <span>Skipped: <strong>{dispatchResult.skippedCount}</strong></span>
            <span>Failed: <strong>{dispatchResult.failedCount}</strong></span>
            <span>Total FEs: <strong>{dispatchResult.totalFatalFEs}</strong></span>
          </div>
        </div>
      )}

      {/* PENDING FATAL FEs QUEUE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-bold text-white">
              Today&apos;s Fatal Strike Recipients Queue ({filteredFeDigests.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Strict Tri-Party: TO: FE &bull; CC: AM &bull; CC: RM
          </span>
        </div>

        {filteredFeDigests.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CheckCircle className="w-12 h-12 text-emerald-500/50 mx-auto mb-3" />
            <div className="text-base font-bold text-slate-200">No Fatal Strikes Found for {targetDate}</div>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              All audited visits on this date met 100% compliance SOP standards, or no audits were marked Fatal yet. Zero emails will be sent tonight.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredFeDigests.map((fe) => {
              const isExpanded = expandedFe === fe.feKey;

              return (
                <div key={fe.feKey} className="p-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    
                    {/* FE Identification */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold flex items-center justify-center shrink-0">
                        {fe.fatalCount}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{fe.feName}</span>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {fe.feCode}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            {fe.hub}
                          </span>
                        </div>

                        <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-y-1 gap-x-3">
                          <span>TO: <strong className="text-slate-200">{fe.feEmail}</strong></span>
                          <span>CC (AM): <strong className="text-purple-300">{fe.amName}</strong> ({fe.amEmail})</span>
                          <span>CC (RM): <strong className="text-amber-300">{fe.rmName}</strong> ({fe.rmEmail})</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats & Actions */}
                    <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
                      <div className="text-right mr-2 hidden sm:block">
                        <div className="text-xs font-bold text-red-400">{fe.fatalCount} Fatal Strike{fe.fatalCount > 1 ? 's' : ''}</div>
                        <div className="text-[11px] text-slate-400">{fe.passedCount} Passed / {fe.totalAudited} Audited</div>
                      </div>

                      <button
                        onClick={() => setPreviewDigest(fe)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
                        title="Preview generated email"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                        Preview Email
                      </button>

                      <button
                        onClick={() => handleTriggerDispatch(false, fe.feCode)}
                        disabled={isDispatching}
                        className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1 border border-red-500/30 transition-colors cursor-pointer disabled:opacity-50"
                        title="Send only this FE's warning notice now"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send Now
                      </button>

                      <button
                        onClick={() => setExpandedFe(isExpanded ? null : fe.feKey)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Task Incident Breakdown */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2 text-xs animate-fade-in">
                      <div className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                        Violations in Today&apos;s Audits ({fe.fatalTasks.length}):
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {fe.fatalTasks.map((ft, idx) => (
                          <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-red-500/20 text-slate-300">
                            <div className="flex items-center justify-between text-xs font-mono font-bold text-red-400 mb-1">
                              <span>Incident #{idx + 1} &bull; Task #{ft.taskId}</span>
                              <a 
                                href={ft.portalUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-[11px] text-sky-400 hover:underline flex items-center gap-0.5"
                              >
                                View Photos <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>

                            <ul className="list-disc pl-4 text-[12px] text-red-300/90 space-y-0.5">
                              {ft.failedReasons.map((r, ri) => (
                                <li key={ri}>{r}</li>
                              ))}
                            </ul>

                            {ft.remarks && (
                              <div className="mt-2 text-[11px] italic text-amber-300/80 bg-amber-500/5 p-1.5 rounded border border-amber-500/10">
                                &ldquo;{ft.remarks}&rdquo;
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DISPATCH HISTORY LEDGER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-white">
              Historical FE Dispatch Logs ({dispatchLogs.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">Audited Execution Ledger</span>
        </div>

        {dispatchLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No dispatch records for {targetDate} yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">FE Executive</th>
                  <th className="px-4 py-3">Hub</th>
                  <th className="px-4 py-3">Recipients (TO / CC)</th>
                  <th className="px-4 py-3 text-center">Fatals</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Sent Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {dispatchLogs.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-sans font-semibold text-white">
                      {log.fe_name || log.fe_code}
                      <span className="block text-[11px] font-mono text-slate-400">{log.fe_code}</span>
                    </td>
                    <td className="px-4 py-2.5 font-sans">{log.hub || 'N/A'}</td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-400 font-sans">
                      <div className="text-sky-300">TO: {log.fe_email}</div>
                      <div>CC: {log.am_email || 'AM'}, {log.rm_email || 'RM'}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center font-bold text-red-400">
                      {log.fatal_count}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        log.sent_status === 'SENT' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : log.sent_status === 'DRY_RUN' 
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {log.sent_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-[11px]">
                      {log.sent_at ? new Date(log.sent_at).toLocaleTimeString('en-IN') : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EMAIL PREVIEW MODAL */}
      {previewDigest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-red-400" />
                <h3 className="font-bold text-white text-sm">
                  Email Preview &bull; {previewDigest.feName} ({previewDigest.feCode})
                </h3>
              </div>
              <button
                onClick={() => setPreviewDigest(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Close Preview
              </button>
            </div>

            <div className="p-3 bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 flex flex-wrap gap-4">
              <span><strong>TO:</strong> {previewDigest.feEmail}</span>
              <span><strong>CC:</strong> {previewDigest.amEmail} (AM), {previewDigest.rmEmail} (RM)</span>
              <span><strong>Subject:</strong> [FORMAL WARNING] Lenskart DLC Quality Audit - {previewDigest.fatalCount} Fatal Strike(s)</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
              <div 
                dangerouslySetInnerHTML={{ 
                  __html: buildFeFatalWarningEmailHtml({ 
                    feDigest: previewDigest, 
                    portalBaseUrl 
                  }) 
                }} 
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
