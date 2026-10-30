import React from 'react';
import { 
  Users, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Mail, 
  Eye, 
  TrendingUp, 
  MapPin, 
  Filter 
} from 'lucide-react';

export default function FERegistry({ 
  tasks, 
  onSelectFE, 
  onOpenEmailForTask 
}) {
  // Aggregate stats by Field Executive
  const feMap = {};

  tasks.forEach(task => {
    const feCode = task.feCode || task.feId || 'UNASSIGNED';
    if (!feMap[feCode]) {
      feMap[feCode] = {
        code: feCode,
        name: task.feName || 'Unassigned Executive',
        id: task.feId || '',
        email: task.feEmail,
        zones: new Set(),
        totalTasks: 0,
        completedTasks: 0,
        withImages: 0,
        auditedTasks: 0,
        passedTasks: 0,
        fatalTasks: 0,
        fatalReasons: {},
        tasks: []
      };
    }

    const fe = feMap[feCode];
    if (task.zone) fe.zones.add(task.zone);
    fe.totalTasks += 1;
    if (task.status === 'COMPLETED') fe.completedTasks += 1;
    if (task.hasImages) fe.withImages += 1;
    if (task.auditStatus === 'PASSED') {
      fe.auditedTasks += 1;
      fe.passedTasks += 1;
    } else if (task.auditStatus === 'FATAL') {
      fe.auditedTasks += 1;
      fe.fatalTasks += 1;
      (task.failedReasons || []).forEach(r => {
        fe.fatalReasons[r] = (fe.fatalReasons[r] || 0) + 1;
      });
    }
    fe.tasks.push(task);
  });

  const feList = Object.values(feMap).sort((a, b) => b.fatalTasks - a.fatalTasks || b.totalTasks - a.totalTasks);

  return (
    <div className="space-y-6">
      
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">
                Field Executive (FE) Fatal & Quality Registry
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Monitoring compliance records, fatal strike penalties, and SOP adherence across all deployed executives.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total FEs Monitored</span>
              <span className="text-xl font-black text-white">{feList.length}</span>
            </div>
            <div className="bg-red-950/40 border border-red-500/40 rounded-xl px-3.5 py-2 text-center">
              <span className="text-[10px] uppercase font-bold text-red-400 block">FEs with Fatal Strikes</span>
              <span className="text-xl font-black text-red-400">
                {feList.filter(f => f.fatalTasks > 0).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FE Scorecards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {feList.map((fe) => {
          const hasFatals = fe.fatalTasks > 0;
          const auditRate = fe.withImages > 0 ? Math.round((fe.auditedTasks / fe.withImages) * 100) : 0;
          const passRate = fe.auditedTasks > 0 ? Math.round((fe.passedTasks / fe.auditedTasks) * 100) : 100;
          const zonesArray = Array.from(fe.zones);

          // Top reasons
          const topReasons = Object.entries(fe.fatalReasons)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2);

          return (
            <div
              key={fe.code}
              className={`bg-slate-800/80 border rounded-2xl p-5 shadow-lg transition-all flex flex-col justify-between ${
                hasFatals
                  ? 'border-red-500/50 bg-slate-850/90'
                  : 'border-slate-700/80 hover:border-slate-600'
              }`}
            >
              <div>
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-slate-300 font-bold">
                      {fe.code}
                    </span>
                    <h3 className="text-sm font-bold text-white mt-1.5 line-clamp-1" title={fe.name}>
                      {fe.name}
                    </h3>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span>{zonesArray.join(', ') || 'Ahmedabad'}</span>
                    </div>
                  </div>

                  {/* Standing Badge */}
                  {hasFatals ? (
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-500 text-white animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        {fe.fatalTasks} FATAL{fe.fatalTasks > 1 ? 'S' : ''}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      Compliant
                    </span>
                  )}
                </div>

                {/* KPI Metrics Mini Bar */}
                <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-700/60 my-3 text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Assigned</span>
                    <span className="text-sm font-bold text-slate-200">{fe.totalTasks}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Audited</span>
                    <span className="text-sm font-bold text-sky-400">{fe.auditedTasks}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Pass Rate</span>
                    <span className={`text-sm font-bold ${passRate === 100 ? 'text-emerald-400' : passRate < 70 ? 'text-red-400' : 'text-amber-400'}`}>
                      {passRate}%
                    </span>
                  </div>
                </div>

                {/* Violations Summary if any */}
                {hasFatals && topReasons.length > 0 && (
                  <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-2.5 mb-3 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 block mb-1">
                      Recorded Violations:
                    </span>
                    <div className="space-y-1">
                      {topReasons.map(([reason, count]) => (
                        <div key={reason} className="flex items-center justify-between text-red-200 text-[11px]">
                          <span className="truncate pr-1">• {reason}</span>
                          <span className="font-mono font-bold text-red-400">x{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
                <button
                  onClick={() => onSelectFE(fe.name)}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Filter className="w-3 h-3 text-blue-400" />
                  Filter Tasks ({fe.tasks.length})
                </button>

                {hasFatals && (
                  <button
                    onClick={() => {
                      const firstFatalTask = fe.tasks.find(t => t.auditStatus === 'FATAL');
                      if (firstFatalTask) onOpenEmailForTask(firstFatalTask);
                    }}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white flex items-center gap-1 transition-colors cursor-pointer"
                    title="Review Fatal Warning notice"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Notice
                  </button>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
