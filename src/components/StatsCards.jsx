import React from 'react';
import { 
  FileSpreadsheet, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  MailWarning 
} from 'lucide-react';

export default function StatsCards({ stats, onFilterQuick }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      
      {/* 1. Total Tasks */}
      <div 
        onClick={() => onFilterQuick?.('ALL')}
        className="bg-slate-800/70 border border-slate-700/70 hover:border-slate-600 rounded-xl p-3.5 transition-all cursor-pointer group hover:bg-slate-800"
      >
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Total Tasks</span>
          <FileSpreadsheet className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
        </div>
        <div className="text-2xl font-black text-white">{stats.total}</div>
        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
          <span>{stats.completed} Completed</span>
          <span className="text-slate-600">•</span>
          <span>{stats.cancelled} Cancelled</span>
        </div>
      </div>

      {/* 2. Tasks with Images (Actionable) */}
      <div 
        onClick={() => onFilterQuick?.('HAS_IMAGES')}
        className="bg-slate-800/70 border border-sky-500/30 hover:border-sky-500/60 rounded-xl p-3.5 transition-all cursor-pointer group hover:bg-slate-800/90"
      >
        <div className="flex items-center justify-between text-sky-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Needs Audit</span>
          <Camera className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
        </div>
        <div className="text-2xl font-black text-sky-300">{stats.withImages}</div>
        <div className="text-[11px] text-sky-400/80 mt-1">
          {stats.pendingImages} pending review
        </div>
      </div>

      {/* 3. Passed Audits */}
      <div 
        onClick={() => onFilterQuick?.('PASSED')}
        className="bg-slate-800/70 border border-emerald-500/30 hover:border-emerald-500/60 rounded-xl p-3.5 transition-all cursor-pointer group hover:bg-slate-800/90"
      >
        <div className="flex items-center justify-between text-emerald-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Passed</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
        </div>
        <div className="text-2xl font-black text-emerald-400">{stats.passed}</div>
        <div className="text-[11px] text-emerald-400/80 mt-1">
          {stats.auditedCount > 0 ? Math.round((stats.passed / stats.auditedCount) * 100) : 100}% Pass rate
        </div>
      </div>

      {/* 4. Fatal Violations */}
      <div 
        onClick={() => onFilterQuick?.('FATAL')}
        className={`bg-slate-800/70 border rounded-xl p-3.5 transition-all cursor-pointer group hover:bg-slate-800/90 ${
          stats.fatalCount > 0 
            ? 'border-red-500/50 bg-red-950/20' 
            : 'border-slate-700/70'
        }`}
      >
        <div className="flex items-center justify-between text-red-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Failed Audits</span>
          <AlertTriangle className={`w-4 h-4 text-red-400 ${stats.fatalCount > 0 ? 'animate-bounce' : ''}`} />
        </div>
        <div className="text-2xl font-black text-red-400 flex items-center gap-2">
          {stats.fatalCount || 0}
          {(stats.fatalCount > 0) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white font-bold tracking-tight">
              FAIL
            </span>
          )}
        </div>
        <div className="text-[11px] text-red-400/80 mt-1">
          {stats.fesWithFatals || 0} FE(s) flagged
        </div>
      </div>

      {/* 5. Warning Emails Sent */}
      <div 
        onClick={() => onFilterQuick?.('EMAILS')}
        className="bg-slate-800/70 border border-amber-500/30 hover:border-amber-500/60 rounded-xl p-3.5 transition-all cursor-pointer group hover:bg-slate-800/90"
      >
        <div className="flex items-center justify-between text-amber-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Notice Emails</span>
          <MailWarning className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
        </div>
        <div className="text-2xl font-black text-amber-300">{stats.emailsSent || 0}</div>
        <div className="text-[11px] text-amber-400/80 mt-1">
          Sent to FE, AM & RM
        </div>
      </div>

      {/* 6. Active Field Executives */}
      <div 
        onClick={() => onFilterQuick?.('FES')}
        className="bg-slate-800/70 border border-slate-700/70 hover:border-slate-600 rounded-xl p-3.5 transition-all cursor-pointer group hover:bg-slate-800"
      >
        <div className="flex items-center justify-between text-indigo-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Active FEs</span>
          <Users className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
        </div>
        <div className="text-2xl font-black text-indigo-300">{stats.totalFEs}</div>
        <div className="text-[11px] text-indigo-400/80 mt-1">
          Across {stats.totalZones} Zones
        </div>
      </div>

    </div>
  );
}
