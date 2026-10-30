import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  UserCheck, 
  RotateCw, 
  CheckCircle2, 
  Search, 
  Filter, 
  ArrowRight, 
  Send, 
  UserX, 
  Building2, 
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink,
  Mail,
  Eye
} from 'lucide-react';
import { getTaskSLAStatus, groupOverdueByAuditor } from '../utils/slaHelper.js';

export default function DPlusOneEscalationDashboard({
  tasks = [],
  auditors = [],
  currentUser,
  onAuditTask,
  onReassignTask,
  onSendEscalationNotice
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAuditorFilter, setSelectedAuditorFilter] = useState('ALL');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState('ALL');
  const [reassignModalTask, setReassignModalTask] = useState(null);
  const [selectedNewAuditor, setSelectedNewAuditor] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [escalationNoticeSent, setEscalationNoticeSent] = useState({});

  // 1. Extract all D+1 overdue tasks
  const overdueTasks = useMemo(() => {
    return tasks.filter(t => getTaskSLAStatus(t).isOverdue);
  }, [tasks]);

  // 2. Summary grouped by delinquent auditor
  const auditorBreachSummary = useMemo(() => {
    return groupOverdueByAuditor(tasks);
  }, [tasks]);

  // 3. Filtered overdue tasks list
  const filteredOverdueTasks = useMemo(() => {
    return overdueTasks.filter(t => {
      const sla = getTaskSLAStatus(t);

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchId = t.taskId?.toLowerCase().includes(q);
        const matchFE = t.feName?.toLowerCase().includes(q) || t.feCode?.toLowerCase().includes(q);
        const matchCust = t.customerName?.toLowerCase().includes(q);
        if (!matchId && !matchFE && !matchCust) return false;
      }

      if (selectedAuditorFilter !== 'ALL') {
        const audName = (t.assignedAuditorName || '').toLowerCase();
        const audId = (t.assignedAuditorId || '').toLowerCase();
        const filterVal = selectedAuditorFilter.toLowerCase();
        if (audName !== filterVal && audId !== filterVal) return false;
      }

      if (selectedSeverityFilter !== 'ALL' && sla.severity !== selectedSeverityFilter) {
        return false;
      }

      return true;
    });
  }, [overdueTasks, searchQuery, selectedAuditorFilter, selectedSeverityFilter]);

  // High-level KPIs
  const criticalCount = useMemo(() => {
    return overdueTasks.filter(t => getTaskSLAStatus(t).severity === 'CRITICAL').length;
  }, [overdueTasks]);

  const maxHoursDelay = useMemo(() => {
    let max = 0;
    overdueTasks.forEach(t => {
      const sla = getTaskSLAStatus(t);
      if (sla.hoursOverdue > max) max = sla.hoursOverdue;
    });
    return max;
  }, [overdueTasks]);

  // Reassignment submit
  const handleConfirmReassign = async () => {
    if (!reassignModalTask || !selectedNewAuditor) return;
    const targetAuditor = auditors.find(a => a.id === selectedNewAuditor || a.full_name === selectedNewAuditor);
    if (!targetAuditor) return;

    setIsReassigning(true);
    try {
      if (onReassignTask) {
        await onReassignTask({
          taskId: reassignModalTask.id,
          auditorId: targetAuditor.id,
          auditorName: targetAuditor.full_name || targetAuditor.name
        });
      }
      setReassignModalTask(null);
      setSelectedNewAuditor('');
    } catch (err) {
      alert(`Reassignment failed: ${err.message}`);
    } finally {
      setIsReassigning(false);
    }
  };

  const handleSendNotice = (auditorName) => {
    if (onSendEscalationNotice) {
      onSendEscalationNotice(auditorName);
    }
    setEscalationNoticeSent(prev => ({ ...prev, [auditorName]: true }));
    setTimeout(() => {
      setEscalationNoticeSent(prev => ({ ...prev, [auditorName]: false }));
    }, 4000);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      
      {/* Header Banner: Escalation to BH & GM */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border border-red-500/40 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                D+1 Overdue SLA Escalation
              </span>
              <span className="text-xs text-slate-400">
                Automatic Quality & Governance Protocol
              </span>
            </div>
            <h2 className="text-2xl font-black text-white">
              Executive Audit SLA Breach Console
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Day D dispatches that remain unaudited past 24 hours into D+1 are flagged as compliance breaches. 
              These tasks are reported directly to <strong>Sunil Kumar (Business Head)</strong> and <strong>Rajesh Sharma (General Manager)</strong>.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-red-500/30 text-right shrink-0">
            <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">
              Direct Governance
            </div>
            <div className="text-xs font-bold text-white mt-0.5">Sunil Kumar (BH)</div>
            <div className="text-xs font-bold text-white">Rajesh Sharma (GM)</div>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-red-500/30 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Total D+1 Breached Tasks</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-black text-red-400">{overdueTasks.length}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Unaudited after Day D allocation</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Critical Breaches (&ge; 48h)</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-black text-rose-400">{criticalCount}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Severe compliance delay</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Auditors in Breach</span>
            <UserX className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-white">{auditorBreachSummary.length}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">With overdue allocated queues</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Max Delay Observed</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-black text-sky-400">
            {maxHoursDelay > 0 ? `+${maxHoursDelay}h` : '0h'}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Longest pending allocated task</p>
        </div>

      </div>

      {/* Auditor Breach Summary Section */}
      {auditorBreachSummary.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-amber-400" />
                Auditor-Wise SLA Breach Breakdown
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Staff with unaudited dispatches past SLA deadline.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {auditorBreachSummary.map(item => (
              <div 
                key={item.auditorName}
                className="p-4 rounded-xl bg-slate-850/90 border border-red-500/20 hover:border-red-500/40 transition-colors flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">{item.auditorName}</div>
                      <span className="text-[11px] text-slate-400">Allocated Staff</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-red-500/20 text-red-300 border border-red-500/30">
                      {item.count} Overdue
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-300">
                    <span>Max Delay: <strong className="text-amber-300">+{item.maxHoursOverdue}h</strong></span>
                    {item.criticalCount > 0 && (
                      <span className="text-rose-400 font-semibold">• {item.criticalCount} Critical</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => setSelectedAuditorFilter(item.auditorName)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer text-center"
                  >
                    Filter Tasks ({item.count})
                  </button>
                  <button
                    onClick={() => handleSendNotice(item.auditorName)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                      escalationNoticeSent[item.auditorName]
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30'
                    }`}
                  >
                    <Mail className="w-3 h-3" />
                    <span>{escalationNoticeSent[item.auditorName] ? 'Notice Sent!' : 'Send Notice'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar for Overdue Tasks */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Overdue Task ID, FE Name, Customer..."
            className="w-full bg-slate-850 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auditor Filter */}
          <div className="flex items-center bg-slate-850 border border-slate-700 rounded-lg px-2 py-1">
            <span className="text-[11px] text-slate-400 mr-1.5 font-medium">Auditor:</span>
            <select
              value={selectedAuditorFilter}
              onChange={(e) => setSelectedAuditorFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL" className="bg-slate-800 text-white">All Auditors</option>
              {auditorBreachSummary.map(a => (
                <option key={a.auditorName} value={a.auditorName} className="bg-slate-800 text-white">
                  {a.auditorName} ({a.count})
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div className="flex items-center bg-slate-850 border border-slate-700 rounded-lg px-2 py-1">
            <span className="text-[11px] text-slate-400 mr-1.5 font-medium">Severity:</span>
            <select
              value={selectedSeverityFilter}
              onChange={(e) => setSelectedSeverityFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL" className="bg-slate-800 text-white">All Severities</option>
              <option value="CRITICAL" className="bg-slate-800 text-rose-400">Critical (&ge; 48h)</option>
              <option value="HIGH" className="bg-slate-800 text-amber-300">High (&ge; 24h)</option>
            </select>
          </div>

          {(searchQuery || selectedAuditorFilter !== 'ALL' || selectedSeverityFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedAuditorFilter('ALL');
                setSelectedSeverityFilter('ALL');
              }}
              className="text-xs text-slate-400 hover:text-white px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>

      </div>

      {/* Overdue Tasks List */}
      {overdueTasks.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto ring-1 ring-emerald-500/20">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">100% SLA Compliance!</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Zero pending audits are breached past D+1. All Day D dispatches have either been audited or are within their 24-hour SLA window.
          </p>
        </div>
      ) : filteredOverdueTasks.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
          No overdue tasks match the selected filters.
        </div>
      ) : (
        <div className="bg-slate-900 border border-red-500/20 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <th className="py-3 px-4">Task ID</th>
                  <th className="py-3 px-4">Field Executive (FE)</th>
                  <th className="py-3 px-4">Dispatch Date & Hub</th>
                  <th className="py-3 px-4">Assigned Auditor</th>
                  <th className="py-3 px-4">SLA Breach Duration</th>
                  <th className="py-3 px-4">Escalation Status</th>
                  <th className="py-3 px-4 text-right">Executive Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredOverdueTasks.map(task => {
                  const sla = getTaskSLAStatus(task);
                  return (
                    <tr key={task.id} className="hover:bg-slate-850/60 transition-colors">
                      
                      {/* Task ID */}
                      <td className="py-3.5 px-4 font-mono font-medium whitespace-nowrap">
                        <span className="text-blue-400 font-semibold">{task.taskId}</span>
                      </td>

                      {/* Field Executive */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{task.feName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{task.feCode || task.feId}</div>
                      </td>

                      {/* Date & Hub */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="text-slate-300 font-mono">{task.date}</div>
                        <div className="text-[11px] text-slate-400">{task.teamName || task.facilityCode}</div>
                      </td>

                      {/* Assigned Auditor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                          <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                          <span>{task.assignedAuditorName || 'Assigned'}</span>
                        </span>
                      </td>

                      {/* SLA Breach Duration */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black ${
                          sla.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          <Clock className="w-3.5 h-3.5" />
                          <span>{sla.slaLabel}</span>
                        </span>
                      </td>

                      {/* Escalation Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-[11px] font-semibold text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Reported to BH & GM
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                        {/* Audit Now button */}
                        <button
                          onClick={() => onAuditTask && onAuditTask(task)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shadow-sm transition-colors cursor-pointer inline-flex items-center gap-1"
                          title="Open photo audit modal and audit immediately"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Audit Now</span>
                        </button>

                        {/* Reassign button */}
                        <button
                          onClick={() => {
                            setReassignModalTask(task);
                            setSelectedNewAuditor('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-[11px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                          title="Reassign to an active available auditor"
                        >
                          <RotateCw className="w-3 h-3 text-sky-400" />
                          <span>Reassign</span>
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REASSIGN TASK MODAL */}
      {reassignModalTask && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                  <RotateCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Reassign Overdue Task</h3>
                  <p className="text-xs font-mono text-slate-400">{reassignModalTask.taskId}</p>
                </div>
              </div>
              <button
                onClick={() => setReassignModalTask(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2 bg-slate-850 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500">Currently Assigned: </span>
                <strong className="text-red-400">{reassignModalTask.assignedAuditorName || 'None'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Field Executive: </span>
                <strong className="text-white">{reassignModalTask.feName}</strong> ({reassignModalTask.feCode})
              </div>
              <div>
                <span className="text-slate-500">Dispatch Date: </span>
                <strong className="text-slate-300">{reassignModalTask.date}</strong>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Select Active Replacement Auditor:
              </label>
              <select
                value={selectedNewAuditor}
                onChange={(e) => setSelectedNewAuditor(e.target.value)}
                className="w-full bg-slate-850 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">-- Choose an Available Auditor --</option>
                {auditors
                  .filter(a => a.full_name !== reassignModalTask.assignedAuditorName && a.name !== reassignModalTask.assignedAuditorName)
                  .map(a => (
                    <option key={a.id} value={a.id}>
                      {a.full_name || a.name} ({a.facility_code || 'Hub'})
                    </option>
                  ))
                }
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setReassignModalTask(null)}
                className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReassign}
                disabled={isReassigning || !selectedNewAuditor}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-md"
              >
                {isReassigning ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Confirm Reassignment</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
