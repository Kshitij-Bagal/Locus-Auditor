import React, { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  Scale, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Video, 
  ExternalLink, 
  Filter, 
  Search, 
  RotateCw, 
  User, 
  AlertTriangle, 
  Calendar,
  Check,
  ChevronRight,
  Eye,
  FileText
} from 'lucide-react';

export default function FatalObjectionHub({
  tasks = [],
  currentUser,
  onReAuditTask,
  onOverturnDispute,
  onUpholdDispute,
  onRefresh
}) {
  const [activeFilterTab, setActiveFilterTab] = useState('ACTIVE'); // 'ACTIVE' | 'ALL' | 'OVERTURNED' | 'UPHELD'
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [upholdModalTask, setUpholdModalTask] = useState(null);
  const [upholdRemarks, setUpholdRemarks] = useState('');
  const [processingId, setProcessingId] = useState(null);

  // All contested tasks
  const contestedTasks = useMemo(() => {
    return tasks.filter(t => {
      const status = t.disputeStatus || t.dispute_status || 'NONE';
      return status !== 'NONE';
    });
  }, [tasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return contestedTasks.filter(t => {
      const status = t.disputeStatus || t.dispute_status || 'NONE';

      if (activeFilterTab === 'ACTIVE') {
        if (!['PENDING_REVIEW', 'MEET_SCHEDULED'].includes(status)) return false;
      } else if (activeFilterTab === 'OVERTURNED') {
        if (status !== 'RESOLVED_OVERTURNED') return false;
      } else if (activeFilterTab === 'UPHELD') {
        if (status !== 'RESOLVED_UPHELD') return false;
      }

      if (categoryFilter !== 'ALL') {
        const cat = t.disputeCategory || t.dispute_category || '';
        if (cat !== categoryFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTask = String(t.taskId || t.id).toLowerCase().includes(q);
        const matchFE = (t.feName || '').toLowerCase().includes(q) || (t.feCode || '').toLowerCase().includes(q);
        const matchHub = (t.facilityCode || t.teamName || '').toLowerCase().includes(q);
        const matchReason = (t.disputeReason || t.dispute_reason || '').toLowerCase().includes(q);
        if (!matchTask && !matchFE && !matchHub && !matchReason) return false;
      }

      return true;
    });
  }, [contestedTasks, activeFilterTab, categoryFilter, searchQuery]);

  // Counts
  const counts = useMemo(() => {
    let pending = 0;
    let meetScheduled = 0;
    let overturned = 0;
    let upheld = 0;

    contestedTasks.forEach(t => {
      const s = t.disputeStatus || t.dispute_status;
      if (s === 'PENDING_REVIEW') pending++;
      else if (s === 'MEET_SCHEDULED') meetScheduled++;
      else if (s === 'RESOLVED_OVERTURNED') overturned++;
      else if (s === 'RESOLVED_UPHELD') upheld++;
    });

    return {
      active: pending + meetScheduled,
      pending,
      meetScheduled,
      overturned,
      upheld,
      total: contestedTasks.length
    };
  }, [contestedTasks]);

  // Handle Senior Uphold Action
  const handleConfirmUphold = async () => {
    if (!upholdModalTask) return;
    setProcessingId(upholdModalTask.id);
    try {
      await onUpholdDispute(
        upholdModalTask.id,
        upholdRemarks.trim() || 'Fatal strike upheld upon Senior Auditor review of clinical evidence.'
      );
      setUpholdModalTask(null);
      setUpholdRemarks('');
    } catch (err) {
      alert(`Error upholding strike: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto text-slate-100">

      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                Senior QA Governance & Contestation
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {counts.active} Active Dispute{counts.active !== 1 ? 's' : ''}
              </span>
            </div>

            <h2 className="text-2xl font-black text-white mt-1.5 flex items-center gap-2">
              Fatal Objection & Dispute Meet Hub
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Centrally review and resolve Field Executive & Area Manager objections against Fatal Audit strikes. Senior Auditors and Executive Leadership can conduct live re-audits, join scheduled Google Meets, and uphold or overturn strikes.
            </p>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer self-start md:self-auto shrink-0"
            >
              <RotateCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Refresh Queue</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
            <span>Active Disputes</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{counts.active}</span>
            <span className="text-[11px] text-amber-300">({counts.meetScheduled} Meet Scheduled)</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Pending QA Review</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-white">{counts.pending}</span>
            <span className="text-[11px] text-slate-500 ml-1.5">awaiting re-audit</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
            <span>Overturned (Passed)</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-400">{counts.overturned}</span>
            <span className="text-[11px] text-slate-400 ml-1.5">strikes zeroed out</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-red-500/30 bg-red-500/5">
          <div className="flex items-center justify-between text-xs text-red-400 font-semibold">
            <span>Upheld (Final Fatal)</span>
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-red-400">{counts.upheld}</span>
            <span className="text-[11px] text-slate-400 ml-1.5">confirmed strikes</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Tab Selector */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Sub-Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto">
          <button
            onClick={() => setActiveFilterTab('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeFilterTab === 'ACTIVE'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Active Queue ({counts.active})
          </button>
          <button
            onClick={() => setActiveFilterTab('OVERTURNED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeFilterTab === 'OVERTURNED'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Overturned ({counts.overturned})
          </button>
          <button
            onClick={() => setActiveFilterTab('UPHELD')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeFilterTab === 'UPHELD'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Upheld ({counts.upheld})
          </button>
          <button
            onClick={() => setActiveFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeFilterTab === 'ALL'
                ? 'bg-slate-800 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Contested ({counts.total})
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search Task ID, FE, Hub or Reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

      </div>

      {/* Dispute Cards Feed */}
      <div className="space-y-4">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
            <CheckCircle className="w-12 h-12 text-emerald-400/60 mx-auto mb-2" />
            <div className="font-bold text-white text-sm">No Dispute Cases Found</div>
            <p className="text-xs text-slate-500 mt-1">
              There are currently no contested fatal strikes matching your filter.
            </p>
          </div>
        ) : (
          filteredTasks.map(task => {
            const disputeStatus = task.disputeStatus || task.dispute_status;
            const isMeetScheduled = disputeStatus === 'MEET_SCHEDULED';
            const isResolved = ['RESOLVED_OVERTURNED', 'RESOLVED_UPHELD'].includes(disputeStatus);
            const meetUrl = task.disputeMeetUrl || task.dispute_meet_url;
            const meetTime = task.disputeMeetTime || task.dispute_meet_time;

            return (
              <div
                key={task.id}
                className={`p-5 rounded-2xl bg-slate-900 border transition-all shadow-md space-y-3.5 ${
                  isMeetScheduled 
                    ? 'border-amber-500/50 hover:border-amber-400' 
                    : disputeStatus === 'RESOLVED_OVERTURNED'
                    ? 'border-emerald-500/30'
                    : disputeStatus === 'RESOLVED_UPHELD'
                    ? 'border-red-500/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Top Row: Task Identification & Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-black text-white">TASK #{task.taskId}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {task.zone}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
                      {task.facilityCode}
                    </span>

                    {/* Dispute Status Tag */}
                    {disputeStatus === 'PENDING_REVIEW' && (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        Objection Pending Review
                      </span>
                    )}

                    {disputeStatus === 'MEET_SCHEDULED' && (
                      <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black flex items-center gap-1 shadow-sm animate-pulse">
                        <Video className="w-3.5 h-3.5" />
                        Google Meet Scheduled
                      </span>
                    )}

                    {disputeStatus === 'RESOLVED_OVERTURNED' && (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Strike Overturned (Passed)
                      </span>
                    )}

                    {disputeStatus === 'RESOLVED_UPHELD' && (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        Fatal Strike Upheld
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex items-center gap-3">
                    <span>Dispatch: <strong className="text-slate-300">{task.date || 'Today'}</strong></span>
                    <span>•</span>
                    <span>Customer: <strong className="text-slate-300">{task.customerName || 'Customer'}</strong></span>
                  </div>
                </div>

                {/* Dispute Grounds Box */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  
                  {/* Left: Contested Ground by FE/AM */}
                  <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 uppercase tracking-wider text-[10px] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        Contestation Grounds &bull; {task.disputeCategory || task.dispute_category || 'SOP Dispute'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        By {task.disputeRaisedByName || task.dispute_raised_by_name || 'Staff'} ({task.disputeRaisedByRole || task.dispute_raised_by_role || 'FE'})
                      </span>
                    </div>

                    <p className="text-slate-200 leading-relaxed font-sans text-xs">
                      &ldquo;{task.disputeReason || task.dispute_reason || 'No detailed remarks'}&rdquo;
                    </p>

                    {(task.disputeProofUrl || task.dispute_proof_url) && (
                      <a
                        href={task.disputeProofUrl || task.dispute_proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-semibold"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Attached Counter-Evidence Photo
                      </a>
                    )}
                  </div>

                  {/* Right: Original Auditor Failure Violations */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-red-400 uppercase tracking-wider text-[10px]">
                        Original Strike Marked by QA:
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Auditor: {task.auditedBy || 'Central QA'}
                      </span>
                    </div>

                    <ul className="list-disc pl-4 text-[11px] text-red-300 space-y-0.5">
                      {(task.failedReasons || ['SOP checklist failure']).map((r, ri) => (
                        <li key={ri}>{r}</li>
                      ))}
                    </ul>

                    {task.remarks && (
                      <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800">
                        &ldquo;{task.remarks}&rdquo;
                      </p>
                    )}
                  </div>

                </div>

                {/* Google Meet Scheduled Callout (If meeting is active) */}
                {isMeetScheduled && meetUrl && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>Dispute Google Meet Room</span>
                          <span className="text-[11px] font-mono text-amber-300">{meetUrl}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Scheduled for: <strong className="text-slate-200">{meetTime ? new Date(meetTime).toLocaleString('en-IN') : 'Scheduled Time'}</strong>
                        </div>
                      </div>
                    </div>

                    <a
                      href={meetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-all self-start sm:self-auto shrink-0 cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Join Meet Now</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Action Buttons Toolbar for Senior QA */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
                  <div className="text-xs text-slate-400">
                    FE: <strong className="text-white">{task.feName}</strong> ({task.feCode}) &bull; Email: {task.feEmail}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Re-Audit Button */}
                    <button
                      onClick={() => onReAuditTask(task)}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-900/30 transition-all cursor-pointer"
                      title="Open in AuditModal to re-evaluate photos against SOP"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Re-Audit Task</span>
                    </button>

                    {/* Uphold Fatal Strike Button */}
                    {!isResolved && (
                      <button
                        onClick={() => setUpholdModalTask(task)}
                        disabled={processingId === task.id}
                        className="px-3.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        <span>Uphold Fatal</span>
                      </button>
                    )}

                    {/* Quick Overturn Button */}
                    {!isResolved && (
                      <button
                        onClick={() => onOverturnDispute(task.id, 'Contestation approved by Senior QA. Strike zeroed out.')}
                        disabled={processingId === task.id}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Quick Overturn (Pass)</span>
                      </button>
                    )}
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Senior Auditor Uphold Confirmation Dialog */}
      {upholdModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
              <XCircle className="w-5 h-5 text-red-400" />
              <span>Confirm Upholding Fatal Strike &bull; Task #{upholdModalTask.taskId}</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Upholding this strike confirms the non-compliance violation as permanent. The strike will be recorded in the FE&apos;s compliance record.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Senior Auditor Review Findings & Explanation:
              </label>
              <textarea
                value={upholdRemarks}
                onChange={(e) => setUpholdRemarks(e.target.value)}
                rows={3}
                placeholder="Enter reasons why the objection was rejected after photo/meet review..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setUpholdModalTask(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUphold}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Confirm Strike Upheld
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
