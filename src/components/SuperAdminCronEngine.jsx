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
  Play,
  Award,
  Sparkles,
  Building2
} from 'lucide-react';
import { 
  normalizeDateToYMD, 
  getTaskBatchDateYMD,
  aggregateFeFatalDigests, 
  buildFeFatalWarningEmailHtml,
  aggregateTeamFatalSummaries,
  buildAmRmConsolidatedTeamDigestHtml,
  aggregateGmBhExecutiveSummary,
  buildGmBhExecutiveSummaryHtml
} from '../utils/dailyDigestHelper.js';
import { feFatalDigestApi } from '../api/client.js';

export default function SuperAdminCronEngine({
  tasks = [],
  users = [],
  currentUser
}) {
  // Available upload batch dates in tasks
  const availableBatchDates = useMemo(() => {
    const map = new Map();
    (tasks || []).forEach(t => {
      const d = getTaskBatchDateYMD(t);
      if (!d) return;
      const current = map.get(d) || { total: 0, fatal: 0, passed: 0 };
      current.total++;
      const st = (t.auditStatus || t.audit_status || '').toUpperCase();
      if (st === 'FATAL') current.fatal++;
      else if (st === 'PASSED') current.passed++;
      map.set(d, current);
    });
    return Array.from(map.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [tasks]);

  const [targetDate, setTargetDate] = useState(() => normalizeDateToYMD(new Date()));

  // Auto-align targetDate to the latest upload batch if today has no uploads
  useEffect(() => {
    if (availableBatchDates.length > 0) {
      const hasSelected = availableBatchDates.some(b => b.date === targetDate);
      if (!hasSelected) {
        setTargetDate(availableBatchDates[0].date);
      }
    }
  }, [availableBatchDates]);

  const [searchQuery, setSearchQuery] = useState('');
  const [forceRedispatch, setForceRedispatch] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [previewDigest, setPreviewDigest] = useState(null);
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expandedFe, setExpandedFe] = useState(null);
  const [showConfigDetails, setShowConfigDetails] = useState(false);
  const [showExecutivePreviewModal, setShowExecutivePreviewModal] = useState(false);
  const [isDispatchingExecutive, setIsDispatchingExecutive] = useState(false);
  const [executiveDispatchResult, setExecutiveDispatchResult] = useState(null);
  const [dispatchingFeKey, setDispatchingFeKey] = useState(null);

  // Top Tabs: 'team' (AM & RM Consolidated) | 'fes' (Individual FE Notices) | 'leadership' (GM, BH & SuperAdmin)
  const [dispatchTab, setDispatchTab] = useState('team');
  const [managerRoleFilter, setManagerRoleFilter] = useState('ALL'); // 'ALL' | 'AM' | 'RM'
  const [previewTeamDigest, setPreviewTeamDigest] = useState(null);
  const [isDispatchingTeam, setIsDispatchingTeam] = useState(false);
  const [teamDispatchResult, setTeamDispatchResult] = useState(null);
  const [dispatchingManagerEmail, setDispatchingManagerEmail] = useState(null);
  const [expandedManager, setExpandedManager] = useState(null);

  // Compute FE Fatal aggregation for selected date
  const portalBaseUrl = window.location.origin;
  const feDigests = useMemo(() => {
    return aggregateFeFatalDigests({
      tasks,
      users,
      targetDate,
      targetDateStr: targetDate,
      portalBaseUrl
    });
  }, [tasks, users, targetDate, portalBaseUrl]);

  // Compute Consolidated Team Summaries for AMs & RMs
  const teamSummaries = useMemo(() => {
    return aggregateTeamFatalSummaries({
      feDigests,
      targetDate
    });
  }, [feDigests, targetDate]);

  // Filtered managers for Team tab
  const filteredManagers = useMemo(() => {
    let list = teamSummaries.allManagers;
    if (managerRoleFilter === 'AM') list = teamSummaries.ams;
    else if (managerRoleFilter === 'RM') list = teamSummaries.rms;

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(m =>
      m.managerName.toLowerCase().includes(q) ||
      m.managerEmail.toLowerCase().includes(q) ||
      m.hub.toLowerCase().includes(q) ||
      m.fes.some(fe => fe.feName.toLowerCase().includes(q) || fe.feCode.toLowerCase().includes(q))
    );
  }, [teamSummaries, managerRoleFilter, searchQuery]);

  // Compute Executive Summary for GM, BH & SuperAdmin
  const executiveSummary = useMemo(() => {
    return aggregateGmBhExecutiveSummary({
      tasks,
      users,
      targetDate,
      portalBaseUrl
    });
  }, [tasks, users, targetDate, portalBaseUrl]);

  // Overall metrics for the upload batch
  const dayStats = useMemo(() => {
    let dayTotalAudited = 0;
    let dayPassed = 0;
    let dayFatals = 0;
    let dayTotalUploaded = 0;

    tasks.forEach(t => {
      const taskDate = getTaskBatchDateYMD(t);
      if (taskDate !== targetDate) return;
      dayTotalUploaded++;
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
      dayTotalUploaded,
      dayTotalAudited,
      dayPassed,
      dayFatals,
      affectedFEs: feDigests.length
    };
  }, [tasks, targetDate, feDigests]);

  // Dynamic Leadership Recipients resolved directly from real database users (GM, BH & SuperAdmin)
  const leadershipRecipients = useMemo(() => {
    const list = [];
    const seen = new Set();
    (users || []).forEach(u => {
      const roles = Array.isArray(u.roles) ? u.roles : [u.role];
      const isEligible = roles.some(r => {
        const rNorm = String(r || '').toLowerCase();
        return rNorm === 'gm' || 
               rNorm === 'bh' || 
               rNorm === 'superadmin' || 
               rNorm.includes('general manager') || 
               rNorm.includes('business head');
      });
      const email = (u.email || '').trim().toLowerCase();
      const isRealEmail = email && 
                          email.includes('@') && 
                          !email.includes('example.com') && 
                          !email.includes('demo') && 
                          !email.includes('gm.quality') && 
                          !email.includes('bh.lenskart');
      if (isEligible && isRealEmail && !seen.has(email)) {
        seen.add(email);
        list.push({
          name: u.full_name || u.name || 'Executive',
          email,
          role: u.role || roles[0] || 'Leadership'
        });
      }
    });

    if (list.length === 0) {
      return [
        { name: 'Mayank Gupta', email: 'mayank.gupta1@lenskart.in', role: 'GM' },
        { name: 'Ankita Aggarwal', email: 'ankita.aggarwal@lenskart.com', role: 'BH' },
        { name: 'Kshitij Bagal', email: 'kshitijbagal@lenskart.com', role: 'SuperAdmin' }
      ];
    }
    return list;
  }, [users]);

  // Dynamic Recipient Management for Executive Summary (allows safe testing on oneself)
  const [customLeadershipRecipients, setCustomLeadershipRecipients] = useState([]);
  const [customEmailInput, setCustomEmailInput] = useState('');
  const [selectedLeadershipEmails, setSelectedLeadershipEmails] = useState([]);
  const [hasInitializedLeadershipEmails, setHasInitializedLeadershipEmails] = useState(false);

  const allAvailableLeadershipRecipients = useMemo(() => {
    const list = [...leadershipRecipients];
    const seen = new Set(list.map(r => r.email.toLowerCase()));

    // Include currentUser if available and valid
    if (currentUser?.email) {
      const curEmail = currentUser.email.trim().toLowerCase();
      if (curEmail.includes('@') && !seen.has(curEmail)) {
        seen.add(curEmail);
        list.push({
          name: currentUser.name || currentUser.full_name || 'You (Current User)',
          email: curEmail,
          role: currentUser.role || 'SuperAdmin'
        });
      }
    }

    // Include custom test recipients
    customLeadershipRecipients.forEach(cr => {
      const cEmail = cr.email.trim().toLowerCase();
      if (cEmail && !seen.has(cEmail)) {
        seen.add(cEmail);
        list.push(cr);
      }
    });

    return list;
  }, [leadershipRecipients, currentUser, customLeadershipRecipients]);

  // Initialize selected emails once recipients are computed
  useEffect(() => {
    if (!hasInitializedLeadershipEmails && allAvailableLeadershipRecipients.length > 0) {
      setSelectedLeadershipEmails(allAvailableLeadershipRecipients.map(r => r.email));
      setHasInitializedLeadershipEmails(true);
    }
  }, [allAvailableLeadershipRecipients, hasInitializedLeadershipEmails]);

  const handleToggleLeadershipRecipient = (email) => {
    const eNorm = email.trim().toLowerCase();
    setSelectedLeadershipEmails(prev => 
      prev.includes(eNorm) ? prev.filter(e => e !== eNorm) : [...prev, eNorm]
    );
  };

  const handleSelectOnlyMyself = () => {
    const myEmail = (currentUser?.email || 'kshitijbagal@lenskart.com').trim().toLowerCase();
    if (!allAvailableLeadershipRecipients.some(r => r.email.toLowerCase() === myEmail)) {
      setCustomLeadershipRecipients(prev => [...prev, {
        name: currentUser?.name || 'You',
        email: myEmail,
        role: 'Tester'
      }]);
    }
    setSelectedLeadershipEmails([myEmail]);
  };

  const handleSelectAllLeadershipRecipients = () => {
    setSelectedLeadershipEmails(allAvailableLeadershipRecipients.map(r => r.email));
  };

  const handleClearAllLeadershipRecipients = () => {
    setSelectedLeadershipEmails([]);
  };

  const handleAddCustomLeadershipEmail = (e) => {
    if (e) e.preventDefault();
    const cleanEmail = customEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      alert('Please enter a valid email address (e.g. your email or test address).');
      return;
    }
    if (!allAvailableLeadershipRecipients.some(r => r.email.toLowerCase() === cleanEmail)) {
      setCustomLeadershipRecipients(prev => [...prev, {
        name: 'Custom Tester',
        email: cleanEmail,
        role: 'Test'
      }]);
    }
    if (!selectedLeadershipEmails.includes(cleanEmail)) {
      setSelectedLeadershipEmails(prev => [...prev, cleanEmail]);
    }
    setCustomEmailInput('');
  };

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

  // Handle Batch Dispatch for ALL FEs (Live or Dry-Run)
  const handleTriggerDispatch = async (isDryRun = false) => {
    const actionName = isDryRun ? 'Dry-Run Simulation' : 'Live Warning Notice Dispatch';

    if (!isDryRun && !window.confirm(`Are you sure you want to trigger ${actionName} for ALL ${feDigests.length} affected FEs for ${targetDate}?\n\nThis will send official compliance warning emails to all ${feDigests.length} Field Executives with CC to their direct Area Managers & Regional Managers.`)) {
      return;
    }

    setIsDispatching(true);
    setDispatchResult(null);

    try {
      const result = await feFatalDigestApi.triggerFeFatalDispatch({
        date: targetDate,
        force: forceRedispatch,
        dryRun: isDryRun,
        tasks,
        users
      });

      setDispatchResult(result);
      await loadLogs();
    } catch (err) {
      alert(`Batch Dispatch Error: ${err.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  // Handle Single FE Dispatch (Strictly targets ONLY 1 FE directly)
  const handleSingleFeDispatch = async (fe) => {
    const feTargetIdentifier = fe.feCode && fe.feCode !== 'N/A' ? fe.feCode : (fe.feEmail || fe.feKey);
    const confirmMsg = `Send official compliance warning notice directly to:\n\nField Executive: ${fe.feName} (${fe.feCode || 'Code N/A'})\nEmail: ${fe.feEmail}\nIncidents: ${fe.fatalCount} fatal strike(s)\n\nNote: AM and RM are not CC'd to avoid flooding their inboxes; they receive a consolidated Team Digest.\n\nProceed?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setDispatchingFeKey(fe.feKey);
    try {
      const result = await feFatalDigestApi.triggerFeFatalDispatch({
        date: targetDate,
        force: true, // Specific button click bypasses already-sent filter
        feCode: feTargetIdentifier,
        dryRun: false,
        tasks,
        users
      });

      if (result.success && result.sentCount > 0) {
        alert(`Success! Warning notice email dispatched directly to ${fe.feName} (${fe.feEmail}).`);
      } else if (result.skippedCount > 0) {
        alert(`Notice for ${fe.feName} was skipped: ${result.results?.[0]?.reason || 'Already dispatched today.'}`);
      } else {
        alert(`Notice dispatch failed: ${result.results?.[0]?.error || result.error || 'Unknown error'}`);
      }
      await loadLogs();
    } catch (err) {
      alert(`Single FE Dispatch Error: ${err.message}`);
    } finally {
      setDispatchingFeKey(null);
    }
  };

  // Handle Single Team Digest Dispatch (for 1 AM or RM)
  const handleSingleTeamDigestDispatch = async (mgr, isDryRun = false) => {
    const actionName = isDryRun ? 'Dry-Run Simulation' : 'Live Team Digest Dispatch';
    if (!isDryRun && !window.confirm(`Trigger ${actionName} for:\n\n${mgr.roleTitle}: ${mgr.managerName}\nEmail: ${mgr.managerEmail}\nHub/Region: ${mgr.hub}\nCovering: ${mgr.fes.length} FEs with ${mgr.totalFatalStrikes} fatal strikes.\n\nProceed?`)) {
      return;
    }
    setDispatchingManagerEmail(mgr.managerEmail);
    try {
      const res = await feFatalDigestApi.dispatchTeamDigest({
        date: targetDate,
        managerEmail: mgr.managerEmail,
        role: mgr.role,
        dryRun: isDryRun,
        tasks,
        users
      });
      alert(`Success! Team digest ${isDryRun ? 'simulation completed' : 'dispatched'} to ${mgr.roleTitle} ${mgr.managerName} (${mgr.managerEmail}).`);
      await loadLogs();
    } catch (err) {
      alert(`Team Digest Error: ${err.message}`);
    } finally {
      setDispatchingManagerEmail(null);
    }
  };

  // Handle Batch Team Digest Dispatch (for all AMs and RMs)
  const handleBatchTeamDigestDispatch = async (isDryRun = false) => {
    const targetGroup = managerRoleFilter === 'ALL' ? 'all AMs & RMs' : `${managerRoleFilter}s`;
    const count = filteredManagers.length;
    const actionName = isDryRun ? 'Dry-Run Simulation' : 'Live Batch Dispatch';

    if (!isDryRun && !window.confirm(`Trigger ${actionName} of Consolidated Team Digests to ${count} ${targetGroup} for ${targetDate}?\n\nEach manager will receive 1 summarized email covering all FEs under their supervision who incurred fatal strikes today.`)) {
      return;
    }

    setIsDispatchingTeam(true);
    setTeamDispatchResult(null);

    try {
      const res = await feFatalDigestApi.dispatchTeamDigest({
        date: targetDate,
        role: managerRoleFilter === 'ALL' ? undefined : managerRoleFilter,
        dryRun: isDryRun,
        tasks,
        users
      });
      setTeamDispatchResult(res);
      await loadLogs();
    } catch (err) {
      alert(`Batch Team Dispatch Error: ${err.message}`);
    } finally {
      setIsDispatchingTeam(false);
    }
  };

  // Handle GM & BH Executive Summary Dispatch (Trial Mode to Leadership)
  const handleDispatchExecutiveSummary = async (isDryRun = false) => {
    if (!selectedLeadershipEmails || selectedLeadershipEmails.length === 0) {
      alert('Please select at least one recipient checkbox before dispatching.');
      return;
    }

    const actionName = isDryRun ? 'Dry-Run Simulation' : 'Live Brevo Dispatch';
    const isSingleSelf = selectedLeadershipEmails.length === 1 && 
      (currentUser?.email && selectedLeadershipEmails.includes(currentUser.email.toLowerCase()));

    const confirmMsg = isDryRun
      ? `Run ${actionName} for ${selectedLeadershipEmails.length} recipient(s)?\n\nRecipients:\n• ${selectedLeadershipEmails.join('\n• ')}`
      : isSingleSelf
        ? `Send Executive Quality Briefing to YOURSELF ONLY (${selectedLeadershipEmails[0]})?\n\nGM (Mayank Gupta) and BH (Ankita Aggarwal) will NOT receive this test email.`
        : `Are you sure you want to trigger ${actionName} of today's Executive Audit Summary?\n\nRecipients (${selectedLeadershipEmails.length}):\n• ${selectedLeadershipEmails.join('\n• ')}`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsDispatchingExecutive(true);
    setExecutiveDispatchResult(null);

    try {
      const res = await feFatalDigestApi.dispatchGmBhExecutiveSummary({
        date: targetDate,
        tasks,
        users,
        dryRun: isDryRun,
        leadershipEmails: selectedLeadershipEmails
      });

      setExecutiveDispatchResult(res);
      await loadLogs();
    } catch (err) {
      alert(`Executive Dispatch Error: ${err.message}`);
    } finally {
      setIsDispatchingExecutive(false);
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
            <span>Target Upload Date</span>
            <Calendar className="w-4 h-4 text-sky-400" />
          </div>
          {availableBatchDates.length > 0 ? (
            <select
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono cursor-pointer"
            >
              {availableBatchDates.map(b => (
                <option key={b.date} value={b.date}>
                  {b.date} ({b.total} uploaded • {b.fatal} fatals)
                </option>
              ))}
            </select>
          ) : (
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
            />
          )}
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

      {/* 3-TAB MAIN NAVIGATION */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setDispatchTab('team')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            dispatchTab === 'team'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Team Mail (AM &amp; RM Consolidated)
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            dispatchTab === 'team' ? 'bg-purple-800 text-purple-100' : 'bg-slate-800 text-slate-400'
          }`}>
            {teamSummaries.allManagers.length} Managers
          </span>
        </button>

        <button
          onClick={() => setDispatchTab('fes')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            dispatchTab === 'fes'
              ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          FEs Mail (Individual Notices)
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            dispatchTab === 'fes' ? 'bg-red-800 text-red-100' : 'bg-slate-800 text-slate-400'
          }`}>
            {feDigests.length} FEs
          </span>
        </button>

        <button
          onClick={() => setDispatchTab('leadership')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            dispatchTab === 'leadership'
              ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Award className="w-4 h-4" />
          Leadership Mail (GM, BH &amp; SuperAdmin)
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            dispatchTab === 'leadership' ? 'bg-sky-800 text-sky-100' : 'bg-slate-800 text-slate-400'
          }`}>
            Executive Briefing
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: TEAM MAIL (AM & RM CONSOLIDATED DIGEST) */}
      {/* ==================================================================== */}
      {dispatchTab === 'team' && (
        <div className="space-y-4 animate-fade-in">
          {/* Information & Role Filter Banner */}
          <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-purple-200">
              <Info className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                AMs &amp; RMs receive <strong className="text-white">strictly 1 consolidated digest email</strong> covering all FEs under their management. They are removed from individual FE emails to prevent inbox flooding.
              </span>
            </div>

            {/* Sub-Filter: ALL / AM / RM */}
            <div className="flex items-center gap-1.5 self-end md:self-auto shrink-0">
              <span className="text-[11px] text-slate-400 font-semibold mr-1">Filter Role:</span>
              <button
                onClick={() => setManagerRoleFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  managerRoleFilter === 'ALL'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All ({teamSummaries.allManagers.length})
              </button>
              <button
                onClick={() => setManagerRoleFilter('AM')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  managerRoleFilter === 'AM'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Area Managers ({teamSummaries.ams.length})
              </button>
              <button
                onClick={() => setManagerRoleFilter('RM')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  managerRoleFilter === 'RM'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Regional Managers ({teamSummaries.rms.length})
              </button>
            </div>
          </div>

          {/* Action & Controls Toolbar */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Filter className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Search Manager, FE, Hub..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
              <button
                onClick={() => handleBatchTeamDigestDispatch(true)}
                disabled={isDispatchingTeam || filteredManagers.length === 0}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5 text-amber-400" />
                Dry-Run Simulation
              </button>

              <button
                onClick={() => handleBatchTeamDigestDispatch(false)}
                disabled={isDispatchingTeam || filteredManagers.length === 0}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all cursor-pointer disabled:opacity-40"
              >
                {isDispatchingTeam ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Dispatch All Team Digests ({filteredManagers.length} Managers)
              </button>
            </div>
          </div>

          {/* Team Dispatch Result Alert */}
          {teamDispatchResult && (
            <div className={`p-4 rounded-xl border text-xs animate-fade-in ${
              teamDispatchResult.failedCount > 0 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            }`}>
              <div className="flex items-center justify-between font-bold text-sm mb-1">
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Team Digest Execution Complete ({teamDispatchResult.mode})
                </span>
                <button 
                  onClick={() => setTeamDispatchResult(null)} 
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
              <div className="flex gap-4 mt-2 font-mono">
                <span>Sent: <strong>{teamDispatchResult.sentCount}</strong></span>
                <span>Failed: <strong>{teamDispatchResult.failedCount}</strong></span>
                <span>Total Managers: <strong>{teamDispatchResult.totalManagers}</strong></span>
              </div>
            </div>
          )}

          {/* Queue of Managers */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">
                  Area &amp; Regional Managers Queue ({filteredManagers.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                1 Consolidated Digest Per Manager
              </span>
            </div>

            {filteredManagers.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <CheckCircle className="w-12 h-12 text-emerald-500/50 mx-auto mb-3" />
                <div className="text-base font-bold text-slate-200">No Managers with Flagged FEs for {targetDate}</div>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Zero FEs under {managerRoleFilter === 'ALL' ? 'any manager' : managerRoleFilter} incurred fatal strikes today. Zero team digests needed.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {filteredManagers.map((mgr) => {
                  const isExpanded = expandedManager === mgr.id;
                  const isAM = mgr.role === 'AM';

                  return (
                    <div key={mgr.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        
                        {/* Manager Information */}
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl font-black text-xs flex items-center justify-center shrink-0 border ${
                            isAM 
                              ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' 
                              : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                          }`}>
                            {mgr.role}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{mgr.managerName}</span>
                              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                                isAM 
                                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' 
                                  : 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                              }`}>
                                {mgr.roleTitle}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {mgr.hub}
                              </span>
                            </div>

                            <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-y-1 gap-x-3">
                              <span>Email: <strong className="text-slate-200 font-mono">{mgr.managerEmail || 'Email unassigned'}</strong></span>
                              <span>Flagged Team: <strong className="text-purple-300">{mgr.fes.length} FEs</strong></span>
                              <span>Total Strikes: <strong className="text-red-400">{mgr.totalFatalStrikes}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
                          <button
                            onClick={() => setPreviewTeamDigest(mgr)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
                            title="Preview consolidated team digest email"
                          >
                            <Eye className="w-3.5 h-3.5 text-purple-400" />
                            Preview Digest
                          </button>

                          <button
                            onClick={() => handleSingleTeamDigestDispatch(mgr, false)}
                            disabled={dispatchingManagerEmail === mgr.managerEmail || isDispatchingTeam}
                            className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-semibold flex items-center gap-1 border border-purple-500/30 transition-colors cursor-pointer disabled:opacity-50"
                            title={`Send consolidated digest to ${mgr.managerName}`}
                          >
                            {dispatchingManagerEmail === mgr.managerEmail ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Dispatch Digest</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => setExpandedManager(isExpanded ? null : mgr.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded FEs under this manager */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3 text-xs animate-fade-in">
                          <div className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center justify-between">
                            <span>FEs with Fatal Strikes under {mgr.managerName} ({mgr.fes.length}):</span>
                            <span className="text-slate-400 font-mono">{mgr.totalFatalStrikes} total strikes</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {mgr.fes.map((fe, feIdx) => (
                              <div key={feIdx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                                <div className="flex items-center justify-between font-bold text-white text-xs mb-1.5 border-b border-slate-800/80 pb-1.5">
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-purple-400">#{feIdx + 1}</span> {fe.feName}
                                    <span className="font-mono text-[10px] text-slate-400">({fe.feCode})</span>
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/20">
                                    {fe.fatalCount} Strike{fe.fatalCount > 1 ? 's' : ''}
                                  </span>
                                </div>

                                <div className="space-y-1.5">
                                  {fe.fatalTasks.map((ft, ftIdx) => (
                                    <div key={ftIdx} className="bg-red-950/20 border border-red-500/15 p-2 rounded-lg">
                                      <div className="flex items-center justify-between font-mono text-[11px] text-red-400">
                                        <span>Task #{ft.taskId}</span>
                                        <a
                                          href={ft.portalUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-sky-400 hover:underline flex items-center gap-0.5 text-[10px]"
                                        >
                                          Inspect Photos <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      </div>
                                      <ul className="list-disc pl-3 mt-1 text-[11px] text-red-300/90 space-y-0.5">
                                        {ft.failedReasons.map((r, ri) => (
                                          <li key={ri}>{r}</li>
                                        ))}
                                      </ul>
                                      {ft.remarks && (
                                        <div className="mt-1 text-[10px] italic text-amber-300/80 bg-amber-500/5 p-1 rounded">
                                          &ldquo;{ft.remarks}&rdquo;
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: FEs MAIL (INDIVIDUAL NOTICES - DIRECT TO FE ONLY) */}
      {/* ==================================================================== */}
      {dispatchTab === 'fes' && (
        <div className="space-y-4 animate-fade-in">
          {/* Information Notice */}
          <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 flex items-center justify-between gap-3 text-xs text-red-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                Each FE receives their direct fatal strike notice. <strong className="text-white">AM and RM are removed from CC</strong> to prevent flooding their inboxes; managers receive consolidated team digests via the Team Mail tab.
              </span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
              Direct to FE Only
            </span>
          </div>

          {/* Action & Controls Toolbar */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Filter className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Search FE, Code, Hub or AM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>

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

          {/* Dispatch Result Alert */}
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

          {/* Pending Fatal FEs Queue */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-bold text-white">
                  Today&apos;s Fatal Strike Recipients Queue ({filteredFeDigests.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                Direct to FE Only
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
                              <span>Reporting AM: <strong className="text-purple-300">{fe.amName}</strong></span>
                              <span>RM: <strong className="text-amber-300">{fe.rmName}</strong></span>
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
                            Preview Notice
                          </button>

                          <button
                            onClick={() => handleSingleFeDispatch(fe)}
                            disabled={dispatchingFeKey === fe.feKey || isDispatching}
                            className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1 border border-red-500/30 transition-colors cursor-pointer disabled:opacity-50"
                            title={`Send only ${fe.feName}'s warning notice now`}
                          >
                            {dispatchingFeKey === fe.feKey ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-400" />
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Send Notice</span>
                              </>
                            )}
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: LEADERSHIP MAIL (GM, BH & SUPERADMIN EXECUTIVE BRIEFING) */}
      {/* ==================================================================== */}
      {dispatchTab === 'leadership' && (
        <div className="space-y-4 animate-fade-in">
          {/* Executive Briefing Container */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-sky-950/30 to-slate-900 border border-sky-500/30 shadow-xl relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-white">
                      Executive Quality Audit Briefing (GM, BH &amp; SuperAdmin)
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      Leadership Briefing
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      Brevo Gateway Ready
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    Aggregates national audit volumes, facility pass rates, SOP non-compliance Pareto, and active fatal strikes into an executive briefing. Dispatches strictly to <strong className="text-white">General Managers (GM)</strong>, <strong className="text-white">Business Heads (BH)</strong>, and <strong className="text-sky-300">SuperAdmin</strong>.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
                <button
                  onClick={() => setShowExecutivePreviewModal(true)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-sky-400" />
                  Preview Executive Email
                </button>

                <button
                  onClick={() => handleDispatchExecutiveSummary(true)}
                  disabled={isDispatchingExecutive}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  Dry-Run Simulation
                </button>

                <button
                  onClick={() => handleDispatchExecutiveSummary(false)}
                  disabled={isDispatchingExecutive || selectedLeadershipEmails.length === 0}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-900/40 transition-all cursor-pointer disabled:opacity-40"
                >
                  {isDispatchingExecutive ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {selectedLeadershipEmails.length === 1 && (currentUser?.email && selectedLeadershipEmails.includes(currentUser.email.toLowerCase()))
                    ? 'Dispatch to Myself (Test Mode)'
                    : `Dispatch to ${selectedLeadershipEmails.length} Recipient(s)`}
                </button>
              </div>
            </div>

            {/* Dynamic Recipient Selector */}
            <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-sky-400" />
                    Select Briefing Recipients ({selectedLeadershipEmails.length} Selected)
                  </span>
                  {selectedLeadershipEmails.length === 0 ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                      ⚠️ No recipients selected
                    </span>
                  ) : selectedLeadershipEmails.length === 1 ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Safe Test Mode Active
                    </span>
                  ) : null}
                </div>

                {/* Quick Selection Shortcuts */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectOnlyMyself}
                    className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    title="Check only your email so GM & BH do not receive this test dispatch"
                  >
                    <Zap className="w-3 h-3 text-sky-400" />
                    Test on Myself Only
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllLeadershipRecipients}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium transition-all cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllLeadershipRecipients}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-[11px] font-medium transition-all cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Recipient Checkbox Badges */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {allAvailableLeadershipRecipients.map(r => {
                  const isChecked = selectedLeadershipEmails.includes(r.email.toLowerCase());
                  const isSeniorExec = r.role === 'GM' || r.role === 'BH';
                  return (
                    <div
                      key={r.email}
                      onClick={() => handleToggleLeadershipRecipient(r.email)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer select-none transition-all ${
                        isChecked
                          ? 'bg-sky-950/40 border-sky-500/40 text-sky-100 shadow-sm'
                          : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by wrapper onClick
                        className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-semibold truncate ${isChecked ? 'text-white' : 'text-slate-300'}`}>
                            {r.name}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                            isSeniorExec
                              ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {r.role}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                          {r.email}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add custom test email */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <form onSubmit={handleAddCustomLeadershipEmail} className="flex items-center gap-2 flex-1 max-w-md">
                  <input
                    type="email"
                    placeholder="Enter custom test email (e.g. personal email)..."
                    value={customEmailInput}
                    onChange={(e) => setCustomEmailInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  >
                    + Add Email
                  </button>
                </form>

                <div className="text-[11px] text-slate-400 text-right">
                  Macro Snapshot: <strong className="text-white">{executiveSummary.totalAudited}</strong> Audited &bull; <strong className="text-emerald-400">{executiveSummary.passRate}%</strong> Pass &bull; <strong className="text-red-400">{executiveSummary.totalFatal}</strong> Fatals
                </div>
              </div>
            </div>

            {/* Executive Dispatch Result Alert */}
            {executiveDispatchResult && (
              <div className={`mt-3 p-3.5 rounded-xl border text-xs animate-fade-in ${
                executiveDispatchResult.error 
                  ? 'bg-red-500/10 border-red-500/30 text-red-200' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              }`}>
                <div className="flex items-center justify-between font-bold text-sm">
                  <span className="flex items-center gap-2">
                    {executiveDispatchResult.error ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    )}
                    {executiveDispatchResult.error ? 'Executive Dispatch Failed' : `Executive Summary Dispatched (${executiveDispatchResult.mode})`}
                  </span>
                  <button 
                    onClick={() => setExecutiveDispatchResult(null)} 
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
                {executiveDispatchResult.error ? (
                  <p className="mt-1 text-red-300">{executiveDispatchResult.error}</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-4 text-xs font-mono text-slate-300">
                    <span>Target: <strong>{executiveDispatchResult.targetAudience}</strong></span>
                    <span>Recipients: <strong>{executiveDispatchResult.recipients?.join(', ')}</strong></span>
                    <span>Provider: <strong>{executiveDispatchResult.provider?.toUpperCase()}</strong></span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
              <span><strong>Reporting AM:</strong> {previewDigest.amName} &bull; {previewDigest.hub}</span>
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

      {/* TEAM DIGEST PREVIEW MODAL (CONSOLIDATED FOR AM & RM) */}
      {previewTeamDigest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Consolidated Team Quality Digest &bull; {previewTeamDigest.roleTitle} {previewTeamDigest.managerName}
                  </h3>
                  <div className="text-[11px] text-slate-400">
                    {previewTeamDigest.hub} &bull; {previewTeamDigest.fes.length} Flagged FEs &bull; {previewTeamDigest.totalFatalStrikes} Fatal Strikes
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const mgr = previewTeamDigest;
                    setPreviewTeamDigest(null);
                    handleSingleTeamDigestDispatch(mgr, false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Dispatch This Digest Now
                </button>
                <button
                  onClick={() => setPreviewTeamDigest(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-950/70 border-b border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span><strong>TO ({previewTeamDigest.roleTitle}):</strong> <span className="text-purple-300 font-mono">{previewTeamDigest.managerEmail}</span></span>
                <span><strong>Team Scope:</strong> {previewTeamDigest.fes.length} FEs with Fatal Strikes</span>
              </div>
              <span className="text-[11px] text-purple-300 font-semibold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                Inbox-Protection: Replaces individual FE CC notices
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-900/60 flex justify-center">
              <div 
                className="w-full max-w-[700px] shadow-2xl rounded-xl overflow-hidden"
                dangerouslySetInnerHTML={{ 
                  __html: buildAmRmConsolidatedTeamDigestHtml({ 
                    managerSummary: previewTeamDigest, 
                    portalBaseUrl 
                  }) 
                }} 
              />
            </div>
          </div>
        </div>
      )}

      {/* GM & BH EXECUTIVE SUMMARY EMAIL PREVIEW MODAL */}
      {showExecutivePreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Executive Briefing Preview &bull; GM &amp; BH Quality Digest ({targetDate})
                  </h3>
                  <div className="text-[11px] text-slate-400">
                    Template: GM &amp; BH Macro-Overview &bull; Powered by Brevo Mail Gateway
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowExecutivePreviewModal(false);
                    handleDispatchExecutiveSummary(false);
                  }}
                  disabled={selectedLeadershipEmails.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  {selectedLeadershipEmails.length === 1 && (currentUser?.email && selectedLeadershipEmails.includes(currentUser.email.toLowerCase()))
                    ? 'Dispatch to Myself Only'
                    : `Dispatch to ${selectedLeadershipEmails.length} Selected`}
                </button>
                <button
                  onClick={() => setShowExecutivePreviewModal(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-950/70 border-b border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-400">Target Recipients ({selectedLeadershipEmails.length}):</span>
                {selectedLeadershipEmails.length === 0 ? (
                  <span className="text-red-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    None selected &mdash; please check recipients on the main page
                  </span>
                ) : (
                  selectedLeadershipEmails.map((email, i) => (
                    <span key={email} className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono text-[11px]">
                      {email}
                    </span>
                  ))
                )}
              </div>
              <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Safe Test Mode: Only selected recipients receive this dispatch
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-900/60 flex justify-center">
              <div 
                className="w-full max-w-[700px] shadow-2xl rounded-xl overflow-hidden"
                dangerouslySetInnerHTML={{ 
                  __html: buildGmBhExecutiveSummaryHtml({ 
                    summaryData: executiveSummary, 
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
