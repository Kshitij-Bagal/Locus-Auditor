import React from 'react';
import { getTaskSLAStatus } from '../utils/slaHelper.js';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Camera, 
  Eye, 
  Mail, 
  Copy, 
  ExternalLink,
  Clock,
  MapPin,
  Check,
  XCircle,
  HelpCircle,
  UserCheck
} from 'lucide-react';

export default function TaskTable({ 
  tasks, 
  onAuditTask, 
  onInspect,
  onQuickPass, 
  onQuickFatal, 
  onOpenEmail,
  selectedTaskId 
}) {
  const [copiedId, setCopiedId] = React.useState(null);

  const handleAudit = onAuditTask || onInspect || (() => {});
  const handleEmail = onOpenEmail || onInspect || onAuditTask || (() => {});
  const handlePass = onQuickPass || (() => {});
  const handleFatal = onQuickFatal || onInspect || onAuditTask || (() => {});

  const copyToClipboard = (text, id, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-12 text-center">
        <Camera className="w-12 h-12 text-slate-500 mx-auto mb-3 opacity-60" />
        <h3 className="text-base font-bold text-white mb-1">No tasks match your filter</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Try clearing filters or uploading a new Locus dispatch export sheet.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-700/80">
              <th className="py-3 px-4">Task ID</th>
              <th className="py-3 px-4">Field Executive (FE)</th>
              <th className="py-3 px-4">Date & Zone</th>
              <th className="py-3 px-4">Customer & OTP</th>
              <th className="py-3 px-4">Task Status</th>
              <th className="py-3 px-4">Audit Images</th>
              <th className="py-3 px-4">Assigned Auditor</th>
              <th className="py-3 px-4">Audit Result</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50 text-slate-200">
            {tasks.map((task) => {
              const isSelected = selectedTaskId === task.id;
              const hasImages = task.hasImages;
              const isFatal = task.auditStatus === 'FATAL';
              const isPassed = task.auditStatus === 'PASSED';
              const isPending = task.auditStatus === 'PENDING';
              const sla = getTaskSLAStatus(task);
              const isOverdue = sla.isOverdue;

              return (
                <tr 
                  key={task.id}
                  onClick={() => handleAudit(task)}
                  className={`hover:bg-slate-750/50 transition-colors cursor-pointer ${
                    isSelected ? 'bg-blue-900/20 ring-1 ring-blue-500/50' : ''
                  } ${isFatal ? 'bg-red-950/10' : ''} ${isOverdue ? 'bg-red-950/25 border-l-2 border-l-red-500' : ''}`}
                >
                  
                  {/* 1. Task ID */}
                  <td className="py-3.5 px-4 font-mono font-medium text-slate-200 whitespace-nowrap">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-blue-400 hover:underline">{task.taskId}</span>
                      <button
                        onClick={(e) => copyToClipboard(task.taskId, task.id, e)}
                        className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                        title="Copy Task ID"
                      >
                        {copiedId === task.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* 2. Field Executive (FE) */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span>{task.feName || 'Unassigned'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 font-mono text-slate-300">
                        {task.feCode || task.feId || 'N/A'}
                      </span>
                      {task.feId && (
                        <span className="text-[10px] text-slate-400">
                          ID: {task.feId}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 3. Date & Zone */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="text-slate-300 font-medium">{task.date}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span>{task.zone}</span>
                    </div>
                  </td>

                  {/* 4. Customer & OTP */}
                  <td className="py-3.5 px-4 max-w-[200px]">
                    <div className="font-semibold text-slate-200 truncate" title={task.customerName}>
                      {task.customerName || 'N/A'}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5" title={task.customerAddress}>
                      {task.customerAddress || 'No address provided'}
                    </div>
                    {task.pin && (
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                        PIN: {task.pin}
                      </span>
                    )}
                  </td>

                  {/* 5. Task Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {task.status === 'COMPLETED' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        COMPLETED
                      </span>
                    ) : task.status === 'CANCELLED' ? (
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          CANCELLED
                        </span>
                        {task.reason && (
                          <div className="text-[10px] text-slate-400 max-w-[140px] truncate mt-0.5" title={task.reason}>
                            {task.reason}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {task.status}
                      </span>
                    )}
                  </td>

                  {/* 6. Audit Images Badges */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {hasImages ? (
                      <div className="flex items-center space-x-1.5">
                        <span 
                          title={`Selfie: ${task.images.selfie ? 'Available' : 'Missing'}`}
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                            task.images.selfie ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-slate-800 text-slate-600'
                          }`}
                        >
                          🤳
                        </span>
                        <span 
                          title={`Torches: ${task.images.torches ? 'Available' : 'Missing'}`}
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                            task.images.torches ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-slate-800 text-slate-600'
                          }`}
                        >
                          🔦
                        </span>
                        <span 
                          title={`Vision Chart: ${task.images.visionChart ? 'Available' : 'Missing'}`}
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                            task.images.visionChart ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-slate-800 text-slate-600'
                          }`}
                        >
                          📊
                        </span>
                        <span 
                          title={`Toolkit: ${task.images.toolkit ? 'Available' : 'Missing'}`}
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                            task.images.toolkit ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-slate-800 text-slate-600'
                          }`}
                        >
                          🧰
                        </span>
                        <span 
                          title={`Frame Display: ${task.images.frameDisplay ? 'Available' : 'Missing'}`}
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                            task.images.frameDisplay ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-slate-800 text-slate-600'
                          }`}
                        >
                          👓
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono ml-1">
                          ({task.imageCount}/5)
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">No media</span>
                    )}
                  </td>

                  {/* 7. Assigned Auditor */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {task.assignedAuditorName ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                        <UserCheck className="w-3 h-3 text-sky-400" />
                        <span>{task.assignedAuditorName}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">Unassigned</span>
                    )}
                  </td>

                  {/* 8. Audit Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isPassed && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        PASSED
                      </span>
                    )}
                    {isFatal && (
                      <div>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          FATAL
                        </span>
                        {task.emailSent && (
                          <div className="text-[10px] text-red-300 flex items-center gap-1 mt-0.5 font-medium">
                            <Mail className="w-3 h-3 text-red-400" />
                            Notice Sent
                          </div>
                        )}
                      </div>
                    )}
                    {isPending && (
                      <div>
                        {isOverdue ? (
                          <div className="space-y-1">
                            <span 
                              title={`SLA Breached (+${sla.hoursOverdue}h): Escalated to Sunil Kumar (BH) & Rajesh Sharma (GM)`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                              <span>{sla.slaLabel}</span>
                            </span>
                            <div className="text-[10px] text-red-400 font-semibold flex items-center gap-1">
                              <span>⚠️ Escalated: BH & GM</span>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            <Clock className="w-3.5 h-3.5" />
                            {hasImages ? 'Needs Audit' : 'Pending'}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 8. Actions */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleAudit(task)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm flex items-center gap-1 transition-colors cursor-pointer"
                        title="Open image inspection and verify criteria"
                      >
                        <Eye className="w-3 h-3" />
                        Inspect
                      </button>

                      {isFatal ? (
                        <button
                          onClick={() => handleEmail(task)}
                          className="px-2 py-1 rounded-md text-xs font-semibold bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Open or resend Fatal warning notice email"
                        >
                          <Mail className="w-3 h-3 text-red-400" />
                          Mail
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handlePass(task)}
                            className="p-1 rounded-md text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Quick Pass"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleFatal(task)}
                            className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Mark Fatal and Draft Notice"
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
