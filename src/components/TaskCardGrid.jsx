import React from 'react';
import { getTaskSLAStatus } from '../utils/slaHelper.js';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  Mail, 
  Clock, 
  MapPin, 
  User, 
  Camera, 
  ExternalLink,
  UserCheck
} from 'lucide-react';

export default function TaskCardGrid({ 
  tasks, 
  onAuditTask, 
  onInspect,
  onQuickPass, 
  onQuickFatal, 
  onOpenEmail 
}) {
  const handleAudit = onAuditTask || onInspect || (() => {});
  const handleEmail = onOpenEmail || onInspect || onAuditTask || (() => {});
  const handlePass = onQuickPass || (() => {});
  const handleFatal = onQuickFatal || onInspect || onAuditTask || (() => {});

  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-12 text-center">
        <Camera className="w-12 h-12 text-slate-500 mx-auto mb-3 opacity-60" />
        <h3 className="text-base font-bold text-white mb-1">No tasks match your filter</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Try adjusting the search criteria or filters above.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tasks.map((task) => {
        const isFatal = task.auditStatus === 'FATAL';
        const isPassed = task.auditStatus === 'PASSED';
        const hasImages = task.hasImages;
        const sla = getTaskSLAStatus(task);
        const isOverdue = sla.isOverdue;

        return (
          <div
            key={task.id}
            onClick={() => handleAudit(task)}
            className={`bg-slate-800/80 border rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between ${
              isFatal
                ? 'border-red-500/50 hover:border-red-500'
                : isPassed
                ? 'border-emerald-500/40 hover:border-emerald-500/80'
                : isOverdue
                ? 'border-red-500/60 ring-1 ring-red-500/40 bg-red-950/15'
                : 'border-slate-700/80 hover:border-slate-600'
            }`}
          >
            {/* Card Header */}
            <div className="p-4 border-b border-slate-700/60 bg-slate-850/40">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    TASK ID
                  </span>
                  <div className="font-mono text-sm font-bold text-blue-400 group-hover:text-blue-300">
                    {task.taskId}
                  </div>
                </div>

                {/* Audit Status Badge */}
                {isPassed && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    PASSED
                  </span>
                )}
                {isFatal && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    FATAL
                  </span>
                )}
                {!isPassed && !isFatal && (
                  isOverdue ? (
                    <div className="text-right">
                      <span 
                        title={`SLA Breached (+${sla.hoursOverdue}h): Escalated to Sunil Kumar (BH) & Rajesh Sharma (GM)`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse"
                      >
                        <AlertTriangle className="w-3 h-3 text-red-400" />
                        <span>{sla.slaLabel}</span>
                      </span>
                      <div className="text-[9px] text-red-400 font-bold mt-0.5">
                        Escalated: BH & GM
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Audit
                    </span>
                  )
                )}
              </div>

              {/* Field Executive Info */}
              <div className="flex items-center gap-2 mt-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-xs">
                  {task.feCode?.slice(-3) || 'FE'}
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-white truncate" title={task.feName}>
                    {task.feName || 'Unassigned'}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-300">{task.feCode}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      {task.zone}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Media Preview Gallery */}
            <div className="p-4 bg-slate-900/60 flex-1">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-400 font-medium">Audit Evidence</span>
                <span className="text-[11px] font-mono text-slate-400">
                  {task.imageCount}/5 Media Uploaded
                </span>
              </div>

              {hasImages ? (
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {/* Selfie */}
                  <div 
                    title="Selfie (T-shirt & ID)"
                    className="relative aspect-square rounded-md overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center group/img"
                  >
                    {task.images?.selfie ? (
                      <img 
                        src={task.images.selfie} 
                        alt="Selfie" 
                        className="w-full h-full object-cover transition-transform group-hover/img:scale-110"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-[10px] text-slate-500">No Img</span>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-slate-900/80 px-1 rounded text-white font-mono">
                      🤳
                    </span>
                  </div>

                  {/* Torches */}
                  <div 
                    title="Dual Torches"
                    className="relative aspect-square rounded-md overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center group/img"
                  >
                    {task.images?.torches ? (
                      <img 
                        src={task.images.torches} 
                        alt="Torches" 
                        className="w-full h-full object-cover transition-transform group-hover/img:scale-110"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-[10px] text-slate-500">No Img</span>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-slate-900/80 px-1 rounded text-white font-mono">
                      🔦
                    </span>
                  </div>

                  {/* Chart */}
                  <div 
                    title="Vision Chart & Standee"
                    className="relative aspect-square rounded-md overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center group/img"
                  >
                    {task.images?.visionChart ? (
                      <img 
                        src={task.images.visionChart} 
                        alt="Vision Chart" 
                        className="w-full h-full object-cover transition-transform group-hover/img:scale-110"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-[10px] text-slate-500">No Img</span>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-slate-900/80 px-1 rounded text-white font-mono">
                      📊
                    </span>
                  </div>

                  {/* Toolkit */}
                  <div 
                    title="Refraction Toolkit"
                    className="relative aspect-square rounded-md overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center group/img"
                  >
                    {task.images?.toolkit ? (
                      <img 
                        src={task.images.toolkit} 
                        alt="Toolkit" 
                        className="w-full h-full object-cover transition-transform group-hover/img:scale-110"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-[10px] text-slate-500">No Img</span>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-slate-900/80 px-1 rounded text-white font-mono">
                      🧰
                    </span>
                  </div>

                  {/* Frame */}
                  <div 
                    title="Frame Display"
                    className="relative aspect-square rounded-md overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center group/img"
                  >
                    {task.images?.frameDisplay ? (
                      <img 
                        src={task.images.frameDisplay} 
                        alt="Frame Display" 
                        className="w-full h-full object-cover transition-transform group-hover/img:scale-110"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-[10px] text-slate-500">No Img</span>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-slate-900/80 px-1 rounded text-white font-mono">
                      👓
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-500 bg-slate-850/50 rounded-lg border border-slate-800 mb-3">
                  No images uploaded for this visit
                </div>
              )}

              {/* Customer snippet & Date */}
              <div className="text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-medium text-slate-300">{task.customerName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-mono text-slate-300">{task.date}</span>
                </div>
                {task.pin && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Delivery PIN:</span>
                    <span className="font-mono font-bold text-amber-300">{task.pin}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 mt-1">
                  <span className="text-slate-500">Auditor:</span>
                  {task.assignedAuditorName ? (
                    <span className="font-semibold text-sky-400 flex items-center gap-1 text-[10px]">
                      <UserCheck className="w-3 h-3" />
                      {task.assignedAuditorName}
                    </span>
                  ) : (
                    <span className="text-slate-500 italic text-[10px]">Unassigned</span>
                  )}
                </div>
                {isFatal && task.failedReasons.length > 0 && (
                  <div className="mt-2 p-2 rounded bg-red-950/40 border border-red-500/30 text-[10px] text-red-300">
                    <span className="font-bold block text-red-200">Violation:</span>
                    {task.failedReasons.slice(0, 2).join(', ')}
                  </div>
                )}
              </div>
            </div>

            {/* Card Footer Actions */}
            <div className="p-3 bg-slate-800 border-t border-slate-700/60 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleAudit(task)}
                className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Eye className="w-3.5 h-3.5" />
                Audit Images
              </button>

              {isFatal ? (
                <button
                  onClick={() => handleEmail(task)}
                  className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 flex items-center gap-1 transition-colors cursor-pointer"
                  title="View or send warning email"
                >
                  <Mail className="w-3.5 h-3.5 text-red-400" />
                  Notice
                </button>
              ) : (
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handlePass(task)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    title="Quick Pass"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleFatal(task)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Mark Fatal"
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

          </div>
        );
      })}
    </div>
  );
}
