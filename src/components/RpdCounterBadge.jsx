import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  Activity, 
  RefreshCw, 
  Users, 
  Layers, 
  Cpu, 
  Clock, 
  ChevronDown, 
  CheckCircle2, 
  AlertTriangle,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { 
  getUnifiedAiUsage, 
  subscribeToUnifiedAiUsage, 
  fetchRemoteUnifiedAiUsage,
  getTodayYMD 
} from '../utils/aiUsageTracker.js';

export default function RpdCounterBadge({ currentUser, onNavigate }) {
  const [usage, setUsage] = useState(() => getUnifiedAiUsage());
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dropdownRef = useRef(null);

  // Subscribe to real-time events & periodic cloud polling
  useEffect(() => {
    const unsubscribe = subscribeToUnifiedAiUsage((latest) => {
      setUsage(latest);
    }, 15000);

    return () => unsubscribe();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleManualRefresh = async (e) => {
    e?.stopPropagation();
    setIsRefreshing(true);
    try {
      const fresh = await fetchRemoteUnifiedAiUsage();
      setUsage(fresh);
    } catch (_) {}
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const totalRequests = usage.totalRequests || 0;
  const totalTokens = usage.totalTokens || 0;
  const quotaLimit = 1500; // Standard Google Gemini Flash Tier reference limit
  const quotaPct = Math.min(100, Math.round((totalRequests / quotaLimit) * 100));

  // Determine badge styling based on quota pressure
  let badgeColor = 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200 hover:border-emerald-400';
  let dotColor = 'bg-emerald-400';
  let barColor = 'bg-emerald-500';

  if (totalRequests >= 1200) {
    badgeColor = 'bg-rose-950/80 border-rose-500/50 text-rose-200 hover:border-rose-400';
    dotColor = 'bg-rose-400';
    barColor = 'bg-rose-500';
  } else if (totalRequests >= 700) {
    badgeColor = 'bg-amber-950/70 border-amber-500/40 text-amber-200 hover:border-amber-400';
    dotColor = 'bg-amber-400';
    barColor = 'bg-amber-500';
  }

  // Extract Role breakdown entries
  const roleEntries = Object.entries(usage.byRole || {}).sort((a, b) => b[1] - a[1]);
  // Extract Feature breakdown entries
  const featureEntries = Object.entries(usage.byFeature || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      
      {/* Navbar Clickable RPD Trigger Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer shadow-sm select-none group ${badgeColor}`}
        title="Unified Daily AI Requests (RPD) across all roles & features. Click to inspect live breakdown."
      >
        <div className="relative flex items-center justify-center shrink-0">
          <Zap className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
          <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${dotColor} animate-ping`} />
          <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${dotColor}`} />
        </div>

        <div className="flex items-baseline gap-1 font-mono">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">RPD:</span>
          <span className="text-xs font-black text-white">{totalRequests}</span>
        </div>

        <span className="text-[10px] opacity-60 font-mono hidden xl:inline">
          / {quotaLimit}
        </span>

        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Detailed Inspection Dropdown Modal */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl z-50 p-4 space-y-4 text-xs backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                  <span>Unified Daily AI Counter</span>
                  <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-mono">
                    SUPERADMIN
                  </span>
                </h4>
                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                  <span>Date: {usage.date || getTodayYMD()}</span>
                  <span>•</span>
                  <span>Live Synced</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleManualRefresh}
              className={`p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer ${
                isRefreshing ? 'animate-spin text-amber-400' : ''
              }`}
              title="Force sync cloud usage"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Metric KPI Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Activity className="w-3 h-3 text-sky-400" /> Total Requests
              </span>
              <div className="text-xl font-black text-white font-mono flex items-baseline gap-1">
                <span>{totalRequests}</span>
                <span className="text-[10px] text-slate-400 font-normal">RPD</span>
              </div>
              <div className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden mt-1">
                <div className={`${barColor} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${quotaPct}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-mono pt-0.5">
                <span>{quotaPct}% quota</span>
                <span>{quotaLimit} max</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Cpu className="w-3 h-3 text-purple-400" /> Est. Tokens
              </span>
              <div className="text-xl font-black text-purple-300 font-mono">
                {totalTokens > 1000000 
                  ? `${(totalTokens / 1000000).toFixed(2)}M` 
                  : totalTokens > 1000 
                  ? `${(totalTokens / 1000).toFixed(1)}k` 
                  : totalTokens}
              </div>
              <div className="text-[10px] text-slate-400 pt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Midnight auto-reset</span>
              </div>
            </div>
          </div>

          {/* Role Breakdown (Core User Request) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                Usage Across Roles
              </span>
              <span className="font-mono text-[10px] text-slate-400 font-normal">
                {roleEntries.length} Role(s) Active
              </span>
            </div>

            {roleEntries.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-center text-slate-500 text-[11px] italic">
                No AI API requests recorded yet today.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {roleEntries.map(([role, count]) => {
                  const pct = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
                  return (
                    <div key={role} className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            role.toLowerCase().includes('admin') ? 'bg-purple-400' :
                            role.toLowerCase().includes('auditor') ? 'bg-emerald-400' :
                            role.toLowerCase().includes('fe') ? 'bg-amber-400' : 'bg-sky-400'
                          }`} />
                          <span>{role}</span>
                        </span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-white font-bold">{count} req</span>
                          <span className="text-[10px] text-slate-400 font-normal">({pct}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                        <div 
                          className="bg-blue-500 h-1 rounded-full transition-all duration-300" 
                          style={{ width: `${pct}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Feature Breakdown */}
          {featureEntries.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-slate-800">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                Feature Breakdown
              </span>
              <div className="flex flex-wrap gap-1.5">
                {featureEntries.map(([feat, count]) => (
                  <span key={feat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                    <span>{feat}:</span>
                    <strong className="text-amber-300">{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent API Call Stream (Last 3) */}
          {Array.isArray(usage.recentCalls) && usage.recentCalls.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" /> Latest Requests
              </span>
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1 font-mono text-[10px]">
                {usage.recentCalls.slice(0, 3).map((call, idx) => {
                  const tStr = call.timestamp ? new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                  return (
                    <div key={call.id || idx} className="flex items-center justify-between text-slate-300 bg-slate-800/40 px-2 py-1 rounded border border-slate-800">
                      <div className="truncate max-w-[190px]">
                        <span className="text-amber-300 font-bold mr-1">[{call.role}]</span>
                        <span className="text-slate-400">{call.feature}</span>
                      </div>
                      <span className="text-slate-500 shrink-0">{tStr}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Footer Action: Link to Full AI Console */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-mono">
              Resets daily at 00:00 IST
            </span>
            {onNavigate && (
              <button
                onClick={() => {
                  onNavigate('aiAudits');
                  setIsOpen(false);
                }}
                className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>AI Console</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
