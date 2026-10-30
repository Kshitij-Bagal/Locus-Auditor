import React, { useState } from 'react';
import { 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Wrench, 
  ShieldAlert, 
  LogOut, 
  FileText, 
  Mail, 
  MapPin, 
  Calendar,
  Sparkles,
  Info,
  Check
} from 'lucide-react';

export default function FEPortal({ 
  currentFE, 
  tasks, 
  onLogout 
}) {
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState(null);

  // Filter tasks belonging exclusively to this FE
  const myTasks = tasks.filter(t => {
    const idMatch = t.feId && String(t.feId).trim() === String(currentFE.personId).trim();
    const codeMatch = t.feCode && String(t.feCode).toLowerCase() === String(currentFE.personId).toLowerCase();
    const facilityMatch = !currentFE.facilityCode || 
      String(t.facilityCode || t.teamName).toLowerCase().includes(String(currentFE.facilityCode).toLowerCase());
    return (idMatch || codeMatch);
  });

  const totalTasks = myTasks.length;
  const completedTasks = myTasks.filter(t => t.status === 'COMPLETED').length;
  const auditedTasks = myTasks.filter(t => t.auditStatus !== 'PENDING').length;
  const passedTasks = myTasks.filter(t => t.auditStatus === 'PASSED').length;
  const fatalTasks = myTasks.filter(t => t.auditStatus === 'FATAL');
  const fatalCount = fatalTasks.length;
  const passRate = auditedTasks > 0 ? Math.round((passedTasks / auditedTasks) * 100) : 100;

  // Equipment replacements ordered for this FE
  const myReplacements = [];
  myTasks.forEach(t => {
    (t.replacements || []).forEach(r => {
      myReplacements.push({ ...r, taskId: t.taskId, date: t.date });
    });
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">
      
      {/* Top Welcome & Identity Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20">
              {currentFE.name ? currentFE.name.charAt(0) : 'FE'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Field Staff Portal
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Hub: <strong className="text-slate-200">{currentFE.facilityCode}</strong>
                </span>
              </div>
              <h1 className="text-xl font-extrabold text-white mt-1">
                {currentFE.name || 'Field Executive'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Rider / Person ID: <strong className="text-slate-200 font-mono">{currentFE.personId}</strong></span>
                <span>•</span>
                <span>Code: <strong className="text-slate-200 font-mono">{currentFE.feCode || 'LKH'}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {fatalCount > 0 ? (
              <div className="bg-red-950/50 border border-red-500/50 rounded-xl px-4 py-2 text-center animate-pulse">
                <span className="text-[10px] font-bold uppercase text-red-400 block tracking-wider">Audit Result</span>
                <span className="text-xl font-black text-red-400">{fatalCount} Failed Visit{fatalCount > 1 ? 's' : ''}</span>
              </div>
            ) : (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl px-4 py-2 text-center">
                <span className="text-[10px] font-bold uppercase text-emerald-400 block tracking-wider">Audit Result</span>
                <span className="text-xl font-black text-emerald-400 flex items-center gap-1.5 justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  All Passed
                </span>
              </div>
            )}

            <button
              onClick={onLogout}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Log out of FE Portal"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Dispatches</span>
          <div className="text-2xl font-black text-white mt-1">{totalTasks}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">{completedTasks} Completed visits</span>
        </div>

        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider block">Audited Visits</span>
          <div className="text-2xl font-black text-sky-300 mt-1">{auditedTasks}</div>
          <span className="text-[11px] text-sky-400/80 mt-0.5 block">{totalTasks - auditedTasks} Pending review</span>
        </div>

        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">Passed Visits</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{passedTasks}</div>
          <span className="text-[11px] text-emerald-400/80 mt-0.5 block">{passRate}% Quality Pass Rate</span>
        </div>

        <div className={`bg-slate-800/80 border rounded-xl p-3.5 ${
          fatalCount > 0 ? 'border-red-500/50 bg-red-950/20' : 'border-slate-700'
        }`}>
          <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider block">Fatal Strikes</span>
          <div className="text-2xl font-black text-red-400 mt-1">{fatalCount}</div>
          <span className="text-[11px] text-red-300 mt-0.5 block">
            {fatalCount === 0 ? 'No violations' : 'Action required'}
          </span>
        </div>
      </div>

      {/* Fatal Strikes & Warning Notices Section */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              My Audit Findings & Fatal Notices ({fatalCount})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review any non-compliance strikes recorded during clinical audits so you can rectify SOP adherence.
            </p>
          </div>
          {fatalCount > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
              Immediate Explanation Required
            </span>
          )}
        </div>

        {fatalCount === 0 ? (
          <div className="p-6 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-400">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <span className="font-bold text-white block text-sm">Congratulations! Zero Fatal Strikes</span>
            You have followed all Lenskart Home Eye Test SOP standards for uniform, torches, standee, and clinical toolkit.
          </div>
        ) : (
          <div className="space-y-3">
            {fatalTasks.map(task => (
              <div 
                key={task.id}
                className="bg-slate-900/90 border border-red-500/40 rounded-xl p-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5 mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm font-bold text-red-400">TASK #{task.taskId}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {task.zone}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                      {task.warningLevel || 'Formal Warning Notice'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Dispatch Date: <strong className="text-slate-200">{task.date}</strong> • Customer: {task.customerName}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
                  <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-2.5">
                    <span className="font-bold text-red-300 block mb-1">Specific Violations Marked by QA:</span>
                    <div className="space-y-1">
                      {(task.failedReasons || []).map((r, i) => (
                        <div key={i} className="text-red-200 text-[11px] flex items-start gap-1.5">
                          <span className="text-red-400">❌</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-2.5">
                    <span className="font-bold text-slate-300 block mb-1">Auditor Remarks:</span>
                    <p className="text-slate-300 italic text-[11px]">
                      "{task.remarks || 'Please adhere strictly to Lenskart DLC home visit standards.'}"
                    </p>
                    <div className="mt-2 text-[10px] text-slate-400">
                      Audited by: <strong>{task.auditedBy || 'Central Quality Team'}</strong> on {task.auditedAt ? new Date(task.auditedAt).toLocaleDateString() : 'Recent'}
                    </div>
                  </div>
                </div>

                {task.emailSent && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-950/20 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                    <span>Official warning notice was sent to your email <strong>{task.feEmail}</strong>. Please reply with explanation within 24 hours.</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipment Replacement & Consumable Orders for this FE */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-sky-400" />
              Kit Consumables & Asset Orders for Me ({myReplacements.length})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Items flagged for replacement by the auditor to ensure your kit is 100% functional.
            </p>
          </div>
        </div>

        {myReplacements.length === 0 ? (
          <div className="p-4 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-500">
            No equipment replacements or consumable restocks pending for your kit.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {myReplacements.map((rep, idx) => (
              <div 
                key={idx}
                className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-slate-400">Task #{rep.taskId}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                      rep.urgency === 'IMMEDIATE' ? 'bg-red-500/20 text-red-300' : 'bg-sky-500/20 text-sky-300'
                    }`}>
                      {rep.urgency}
                    </span>
                  </div>
                  <h4 className="font-bold text-white mt-1">{rep.itemName}</h4>
                  <p className="text-[11px] text-amber-400 mt-0.5 font-medium">{rep.condition}</p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Status: <strong className="text-sky-300">Order Placed</strong></span>
                  <span>{new Date(rep.reportedAt || rep.date).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mandatory SOP Refresher Guide */}
      <div className="bg-slate-850 border border-slate-700/80 rounded-xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          5 Mandatory Standards to Maintain 100% Pass Rate
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs text-slate-300">
          <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
            <span className="text-blue-400 font-bold block mb-1">1. Grooming</span>
            Official Lenskart polo worn neatly with physical ID card clearly displayed on chest lanyard.
          </div>
          <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
            <span className="text-blue-400 font-bold block mb-1">2. Torches</span>
            Both Blue & Yellow penlights present, tested, and switched ON with active light beam.
          </div>
          <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
            <span className="text-blue-400 font-bold block mb-1">3. Vision Standee</span>
            Vision chart firmly mounted on telescopic standee at seated eye level (never tape to wall).
          </div>
          <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
            <span className="text-blue-400 font-bold block mb-1">4. Clinical Kit</span>
            Trial frame, JCC, near vision book, mirror, sanitizer bottle, and PD ruler all present.
          </div>
          <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
            <span className="text-blue-400 font-bold block mb-1">5. Frame Display</span>
            Showcase frame tray set up cleanly inside customer's living area before trial.
          </div>
        </div>
      </div>

    </div>
  );
}
