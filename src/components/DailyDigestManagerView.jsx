import React, { useState, useEffect, useMemo } from 'react';
import { 
  Mail, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  Filter, 
  Eye, 
  Check, 
  RefreshCw, 
  ExternalLink, 
  ShieldAlert, 
  UserX, 
  Building2, 
  FileText,
  SendHorizontal,
  Loader2,
  X,
  AlertCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { 
  normalizeDateToYMD, 
  getRolling7DayRange, 
  aggregateDailyDigest, 
  buildDailyDigestHtml, 
  buildDailyDigestText 
} from '../utils/dailyDigestHelper.js';
import { dailyDigestApi, emailApi } from '../api/client.js';

export default function DailyDigestManagerView({
  tasks = [],
  users = [],
  currentUser,
  scopedFEs = [],
  scopedFatalTasks = [],
  onOpenEmailForTask,
  onNavigate
}) {
  const [selectedDate, setSelectedDate] = useState(() => normalizeDateToYMD(new Date()));
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'UNACKNOWLEDGED' | 'ACKNOWLEDGED' | 'HAS_FATALS'
  const [digestLogs, setDigestLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);
  const [previewingDigest, setPreviewingDigest] = useState(null); // Full digest object to preview
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState(null);

  // User role determination
  const userRoles = currentUser?.roles || [currentUser?.role || 'AM'];
  const isAM = userRoles.includes('AM');
  const isRM = userRoles.includes('RM');
  const isExecutive = userRoles.includes('SuperAdmin') || userRoles.includes('GM') || userRoles.includes('BH') || userRoles.includes('Central Ops');

  // Load historical digest logs from Supabase / cache
  const loadDigestLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await dailyDigestApi.getDigestLogs();
      setDigestLogs(logs || []);
    } catch (e) {
      console.warn('Error fetching digest logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadDigestLogs();
  }, []);

  // Compute live current digest for the selected date for this manager
  const currentDigest = useMemo(() => {
    const role = isRM ? 'RM' : 'AM';
    return aggregateDailyDigest({
      tasks,
      users,
      targetDate: selectedDate,
      manager: currentUser,
      role,
      portalBaseUrl: window.location.origin
    });
  }, [tasks, users, selectedDate, currentUser, isRM]);

  // Rolling 7-day range display
  const rollingRange = useMemo(() => {
    return getRolling7DayRange(selectedDate);
  }, [selectedDate]);

  // Filter historical logs
  const filteredLogs = useMemo(() => {
    return digestLogs.filter(log => {
      // Role / Email scoping if AM or RM
      if (isAM && !isExecutive && !isRM) {
        if (log.recipient_email?.toLowerCase() !== currentUser?.email?.toLowerCase()) return false;
      }
      if (isRM && !isExecutive) {
        if (log.recipient_role === 'AM' && log.recipient_email?.toLowerCase() !== currentUser?.email?.toLowerCase()) {
          // If RM, show their own digests or their region's digests
        }
      }

      // Status filter
      if (statusFilter === 'UNACKNOWLEDGED' && log.acknowledged_at) return false;
      if (statusFilter === 'ACKNOWLEDGED' && !log.acknowledged_at) return false;
      if (statusFilter === 'HAS_FATALS' && (log.fatal_count || 0) === 0) return false;

      return true;
    });
  }, [digestLogs, isAM, isRM, isExecutive, currentUser, statusFilter]);

  // Handler: Manual on-demand cron execution
  const handleTriggerDailyDigest = async (force = false) => {
    setIsTriggering(true);
    setTriggerResult(null);

    try {
      const gatewayConfig = emailApi.getGatewayConfig();
      const res = await dailyDigestApi.triggerDigest({
        date: selectedDate,
        force,
        managerEmail: (!isExecutive) ? currentUser?.email : undefined,
        tasks,
        users
      });

      setTriggerResult({
        success: true,
        message: `Digest triggered successfully! Dispatched to ${res.sentCount || 0} manager(s), ${res.skippedCount || 0} skipped (already sent).`
      });

      // Reload logs
      await loadDigestLogs();

      setTimeout(() => setTriggerResult(null), 6000);
    } catch (err) {
      setTriggerResult({
        success: false,
        message: `Trigger failed: ${err.message}`
      });
    } finally {
      setIsTriggering(false);
    }
  };

  // Handler: Acknowledge digest log
  const handleAcknowledge = async (logId) => {
    setAcknowledgingId(logId);
    try {
      await dailyDigestApi.acknowledgeDigest(logId, currentUser);
      setDigestLogs(prev => prev.map(l => {
        if (l.id === logId) {
          return {
            ...l,
            acknowledged_at: new Date().toISOString(),
            acknowledged_by_name: currentUser?.full_name || 'Manager'
          };
        }
        return l;
      }));
    } catch (err) {
      alert(`Acknowledgment failed: ${err.message}`);
    } finally {
      setAcknowledgingId(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in text-xs">
      
      {/* Top Banner & Control Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Title & Info */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  Daily Digest & Escalation System
                </span>
                <span className="text-[10px] text-slate-400">
                  Scheduled daily dispatch at 20:00 IST &bull; Rolling 7-Day Repeat Offender Alerts
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Consolidated Quality Digest for {currentDigest.clusterOrRegion}
              </h3>
            </div>
          </div>

          {/* Action Trigger Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setPreviewingDigest(currentDigest);
                setShowHtmlPreview(true);
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Preview the exact HTML email that will be dispatched"
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span>Preview Email Template</span>
            </button>

            <button
              onClick={() => handleTriggerDailyDigest(false)}
              disabled={isTriggering}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:opacity-50 text-white shadow-lg shadow-rose-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Run daily aggregation and send email digest to assigned managers"
            >
              {isTriggering ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Digest...</span>
                </>
              ) : (
                <>
                  <SendHorizontal className="w-3.5 h-3.5" />
                  <span>Dispatch Today's Digest Now</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Date Selector & Filters */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              <span>Inspection Date:</span>
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
            />
            <span className="text-[10px] text-slate-500 ml-1">
              (Rolling 7-day window: {rollingRange.startStr} &rarr; {rollingRange.endStr})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadDigestLogs}
              disabled={isLoadingLogs}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin text-sky-400' : ''}`} />
            </button>

            <span className="text-slate-400 font-medium">Filter History:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Digest Dispatches</option>
              <option value="UNACKNOWLEDGED">Unacknowledged Only</option>
              <option value="ACKNOWLEDGED">Acknowledged Only</option>
              <option value="HAS_FATALS">Has Fatal Strikes (&gt;0)</option>
            </select>
          </div>
        </div>

        {/* Notification Toast for Trigger Result */}
        {triggerResult && (
          <div className={`p-3 rounded-xl font-semibold flex items-center gap-2 animate-in fade-in duration-200 ${
            triggerResult.success
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}>
            {triggerResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{triggerResult.message}</span>
          </div>
        )}
      </div>

      {/* Live Digest Metrics for Selected Date */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Audited Today</div>
          <div className="text-2xl font-black text-sky-400 mt-1">{currentDigest.totalAudited}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Customer visit audits</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Passed</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{currentDigest.totalPassed}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Compliant appointments</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fatal Strikes Today</div>
          <div className={`text-2xl font-black mt-1 ${currentDigest.fatalCount > 0 ? 'text-red-400' : 'text-slate-300'}`}>
            {currentDigest.fatalCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{currentDigest.fatalRate}% Fatal Strike Rate</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Repeat Offenders (7d)</div>
          <div className={`text-2xl font-black mt-1 ${currentDigest.repeatOffenders.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {currentDigest.repeatOffenders.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">&ge; 2 fatals in 7-day window</div>
        </div>
      </div>

      {/* High-Risk Repeat Offenders Alert Panel */}
      {currentDigest.repeatOffenders.length > 0 && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 space-y-3">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white font-black text-[10px] uppercase tracking-wider">
              Urgent Attention
            </span>
            <span className="font-bold text-red-200 text-sm">
              High-Risk Repeat Offenders Detected ({currentDigest.repeatOffenders.length} FEs)
            </span>
          </div>
          <p className="text-slate-300 text-xs leading-relaxed">
            These Field Executives under your management have accumulated <strong>2 or more Fatal strikes</strong> within the rolling 7-day window ({rollingRange.startStr} to {rollingRange.endStr}). Mandatory toolkit review, uniform check, and supervisor coaching are required:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {currentDigest.repeatOffenders.map(ro => (
              <div key={ro.feKey} className="p-3 rounded-lg bg-slate-900/90 border border-red-500/30 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-xs">{ro.feName}</div>
                  <div className="text-[10px] text-slate-400 font-mono">[{ro.feCode}]</div>
                  <div className="text-[10px] text-red-400 font-bold mt-1">
                    {ro.fatalCount7Days} Fatal Strikes (7-Day Rolling)
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onNavigate) onNavigate('audits');
                  }}
                  className="px-2 py-1 rounded bg-red-600/30 hover:bg-red-600 text-red-200 text-[10px] font-bold border border-red-500/40 transition-colors cursor-pointer"
                >
                  View Audits &rarr;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Fatal Incidents Summary Table */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span className="font-bold text-white text-xs uppercase tracking-wider">
              Today's Fatal Non-Compliance Occurrences ({currentDigest.fatalIncidents.length})
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            {selectedDate} &bull; {currentDigest.clusterOrRegion}
          </span>
        </div>

        {currentDigest.fatalIncidents.length === 0 ? (
          <div className="p-6 text-center text-slate-400 bg-slate-950/50 rounded-lg border border-slate-800">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
            <div className="text-white font-bold text-xs">Zero Fatal Non-Compliance Strikes Today</div>
            <div className="text-[11px] text-slate-500 mt-0.5">All audited visits conducted in this cluster met central SOP standards.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/40">
                  <th className="p-2.5">Task ID</th>
                  <th className="p-2.5">Field Executive</th>
                  <th className="p-2.5">Fatal Violations / Checkpoints Failed</th>
                  <th className="p-2.5">Auditor Remarks</th>
                  <th className="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {currentDigest.fatalIncidents.map(fi => (
                  <tr key={fi.taskId} className="hover:bg-slate-850/60 transition-colors">
                    <td className="p-2.5 font-mono text-sky-400 font-bold whitespace-nowrap">
                      #{fi.taskId}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <div className="font-bold text-white">{fi.feName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">[{fi.feCode}]</div>
                    </td>
                    <td className="p-2.5 max-w-xs">
                      <ul className="space-y-0.5 list-disc list-inside text-red-300 font-medium">
                        {fi.reasons.map((r, i) => (
                          <li key={i} className="truncate">{r}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-2.5 text-slate-400 italic text-[11px]">
                      {fi.remarks || 'No remarks entered'}
                    </td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <button
                        onClick={() => {
                          const taskObj = tasks.find(t => t.id === fi.taskId || t.taskId === fi.taskId);
                          if (taskObj && onOpenEmailForTask) {
                            onOpenEmailForTask(taskObj);
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold border border-slate-700 transition-colors cursor-pointer"
                      >
                        Inspect & Email
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historical Daily Digests & Manager Accountability Ledger */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-sky-400" />
            <span className="font-bold text-white text-xs uppercase tracking-wider">
              Historical Daily Digest Ledger & Manager Accountability ({filteredLogs.length})
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Audit compliance trail across territory
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-950/50 rounded-lg border border-slate-800">
            <Mail className="w-6 h-6 text-slate-500 mx-auto mb-2" />
            <div className="text-white font-bold text-xs">No Historical Digest Logs Recorded Yet</div>
            <div className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
              Daily digests will automatically log here when triggered at 20:00 IST or dispatched via the "Dispatch Today's Digest Now" button above.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/40">
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Recipient Manager</th>
                  <th className="p-2.5">Cluster / Territory</th>
                  <th className="p-2.5 text-center">Audited</th>
                  <th className="p-2.5 text-center">Fatals</th>
                  <th className="p-2.5 text-center">Compliance %</th>
                  <th className="p-2.5 text-center">Repeat Off.</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5">Accountability / Acknowledgment</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredLogs.map(log => {
                  const isAck = Boolean(log.acknowledged_at);
                  const isRecipient = (log.recipient_email?.toLowerCase() === currentUser?.email?.toLowerCase()) || isExecutive;

                  return (
                    <tr key={log.id} className="hover:bg-slate-850/60 transition-colors">
                      <td className="p-2.5 whitespace-nowrap font-mono text-slate-300 font-bold">
                        {log.digest_date}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{log.recipient_name || 'Manager'}</span>
                          <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                            log.recipient_role === 'RM' 
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {log.recipient_role}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">{log.recipient_email}</div>
                      </td>
                      <td className="p-2.5 text-slate-300 whitespace-nowrap">
                        {log.cluster_or_region}
                      </td>
                      <td className="p-2.5 text-center font-bold text-sky-400">
                        {log.total_audited}
                      </td>
                      <td className="p-2.5 text-center font-bold">
                        <span className={log.fatal_count > 0 ? 'text-red-400' : 'text-slate-400'}>
                          {log.fatal_count}
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-bold text-emerald-400">
                        {log.compliance_rate}%
                      </td>
                      <td className="p-2.5 text-center">
                        {Array.isArray(log.repeat_offenders) && log.repeat_offenders.length > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold text-[10px] border border-red-500/30">
                            {log.repeat_offenders.length} Flagged
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">0</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.sent_status === 'SENT' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}>
                          {log.sent_status}
                        </span>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        {isAck ? (
                          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Signed by {log.acknowledged_by_name || 'AM'} ({new Date(log.acknowledged_at).toLocaleDateString()})</span>
                          </div>
                        ) : isRecipient ? (
                          <button
                            onClick={() => handleAcknowledge(log.id)}
                            disabled={acknowledgingId === log.id}
                            className="px-2.5 py-1 rounded bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                            title="Click to acknowledge receipt of this fatal audit summary and record supervisory accountability"
                          >
                            {acknowledgingId === log.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            <span>Acknowledge & Sign-Off</span>
                          </button>
                        ) : (
                          <span className="text-amber-400/80 text-[11px] font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Pending AM Sign-off</span>
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setPreviewingDigest({
                              digestDate: log.digest_date,
                              recipientName: log.recipient_name,
                              recipientRole: log.recipient_role,
                              clusterOrRegion: log.cluster_or_region,
                              totalAudited: log.total_audited,
                              totalPassed: log.total_passed,
                              fatalCount: log.fatal_count,
                              complianceRate: log.compliance_rate,
                              repeatOffenders: log.repeat_offenders || [],
                              commonFailures: log.common_failures || [],
                              fatalIncidents: log.fatal_incidents || []
                            });
                            setShowHtmlPreview(true);
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold border border-slate-700 transition-colors cursor-pointer mr-1.5"
                        >
                          View HTML
                        </button>

                        <button
                          onClick={() => handleTriggerDailyDigest(true)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold border border-slate-700 transition-colors cursor-pointer"
                          title="Force re-send this digest"
                        >
                          Resend
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HTML Email Template Modal Preview */}
      {showHtmlPreview && previewingDigest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-850 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Mail className="w-4 h-4 text-rose-400" />
                <span className="font-bold text-white text-sm">
                  Daily Quality Audit Digest Email Preview ({previewingDigest.digestDate})
                </span>
                <span className="text-[10px] text-slate-400">
                  [{previewingDigest.recipientRole}: {previewingDigest.recipientName}]
                </span>
              </div>
              <button
                onClick={() => setShowHtmlPreview(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Rendered HTML inside iframe for exact CSS isolation */}
            <div className="p-4 overflow-y-auto flex-1 bg-slate-950">
              <iframe
                title="Digest Preview"
                srcDoc={buildDailyDigestHtml({ digest: previewingDigest, portalBaseUrl: window.location.origin })}
                className="w-full h-[68vh] rounded-xl border border-slate-800 bg-white"
              />
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-850 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Responsive HTML layout delivered directly to {previewingDigest.recipientEmail || 'manager inbox'}.
              </span>
              <button
                onClick={() => setShowHtmlPreview(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
