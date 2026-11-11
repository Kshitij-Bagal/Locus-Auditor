import React, { useState, useMemo, useEffect } from 'react';
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
  Check,
  Video,
  ExternalLink,
  XCircle,
  Eye,
  Camera,
  Search,
  Filter,
  Maximize2,
  ChevronRight,
  X,
  Layers,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import DisputeObjectionModal from './DisputeObjectionModal.jsx';
import FEGroomingCapture from './FEGroomingCapture.jsx';
import { groomingApi } from '../api/client.js';
import { getTodayYMD } from '../utils/groomingAiHelper.js';
import { getDisputeWindowStatus } from '../utils/calendarHelper.js';
import { normalizeLocusUrl } from '../utils/geminiAuditHelper.js';

// 5 Mandatory Clinical SOP Stations
const MANDATORY_STATIONS = [
  { key: 'selfie', label: '1. Selfie & ID', icon: '🤳', fallbackReason: 'Official Polo & ID Badge' },
  { key: 'torches', label: '2. Dual Torches', icon: '🔦', fallbackReason: 'Blue & Yellow Torches ON' },
  { key: 'visionChart', label: '3. Vision Standee', icon: '📊', fallbackReason: 'Chart Mounted on Standee' },
  { key: 'toolkit', label: '4. Diagnostic Kit', icon: '🧰', fallbackReason: 'Trial Frame & Sanitizer' },
  { key: 'frameDisplay', label: '5. Frame Display', icon: '👓', fallbackReason: 'Frames Arranged in Tray' }
];

export default function FEPortal({ 
  currentFE = {}, 
  tasks = [], 
  onLogout,
  onRaiseDispute
}) {
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState(null);
  const [disputeTask, setDisputeTask] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('FATAL'); // 'FATAL' | 'GROOMING' | 'ALL' | 'PASSED' | 'PENDING' | 'REPLACEMENTS'
  const [todayGrooming, setTodayGrooming] = useState(null);

  // Extract all identifiers from currentFE with full tolerance for snake_case and camelCase
  const fePersonId = String(currentFE?.person_id || currentFE?.personId || currentFE?.employee_code || currentFE?.employeeCode || currentFE?.id || '').trim();
  const feCode = String(currentFE?.feCode || currentFE?.fe_code || currentFE?.employee_code || currentFE?.employeeCode || '').trim();
  const feFacility = String(currentFE?.facility_code || currentFE?.facilityCode || '').trim();
  const feEmail = String(currentFE?.email || '').trim().toLowerCase();
  const feFullName = String(currentFE?.full_name || currentFE?.name || 'Field Executive').trim();

  // Extract prefix code and name if full_name is formatted as "LKH1183_Dhrub Chakraborty"
  let extractedCode = '';
  let extractedName = '';
  if (feFullName.includes('_')) {
    const parts = feFullName.split('_');
    extractedCode = parts[0].trim();
    extractedName = parts.slice(1).join(' ').trim();
  }

  // Load today's grooming check status for the top reminder banner & tab badge
  useEffect(() => {
    let active = true;
    const resolvedCode = feCode || extractedCode;
    if (!resolvedCode && !fePersonId && !feEmail) return;
    (async () => {
      try {
        const rows = await groomingApi.getChecks({ checkDate: getTodayYMD() });
        if (!active || !Array.isArray(rows)) return;
        const match = rows.find((r) => {
          if (resolvedCode && r.feCode && String(r.feCode).toLowerCase() === resolvedCode.toLowerCase()) return true;
          if (fePersonId && r.feId && String(r.feId).toLowerCase() === fePersonId.toLowerCase()) return true;
          if (feEmail && r.feEmail && String(r.feEmail).toLowerCase() === feEmail) return true;
          return false;
        });
        setTodayGrooming(match || null);
      } catch {
        // Non-blocking
      }
    })();
    return () => { active = false; };
  }, [feCode, extractedCode, fePersonId, feEmail]);

  // Filter tasks belonging to this FE using robust multi-key matching
  const myTasks = useMemo(() => {
    if (!Array.isArray(tasks) || tasks.length === 0) return [];

    return tasks.filter(t => {
      if (!t) return false;

      // 1. Email exact match
      if (feEmail && t.feEmail && String(t.feEmail).trim().toLowerCase() === feEmail) {
        return true;
      }

      // 2. Rider ID / Person ID match
      const taskFeId = String(t.feId || '').trim();
      if (fePersonId && taskFeId && taskFeId.toLowerCase() === fePersonId.toLowerCase()) {
        return true;
      }

      // 3. FE Code match (handles LKH facility code or employee code)
      const taskFeCode = String(t.feCode || '').trim().toLowerCase();
      if (taskFeCode) {
        if (feCode && taskFeCode === feCode.toLowerCase()) return true;
        if (fePersonId && taskFeCode === fePersonId.toLowerCase()) return true;
        if (feFacility && taskFeCode === feFacility.toLowerCase()) return true;
        if (extractedCode && taskFeCode === extractedCode.toLowerCase()) return true;
      }

      // 4. Name match (handles full name or clean name without facility prefix)
      const taskFeName = String(t.feName || t.rawFeName || '').trim().toLowerCase();
      if (taskFeName && feFullName) {
        const lowerFull = feFullName.toLowerCase();
        const lowerExtracted = extractedName ? extractedName.toLowerCase() : lowerFull;
        if (taskFeName === lowerFull || taskFeName.includes(lowerExtracted) || lowerFull.includes(taskFeName)) {
          return true;
        }
      }

      return false;
    });
  }, [tasks, feEmail, fePersonId, feCode, feFacility, feFullName, extractedCode, extractedName]);

  const totalTasks = myTasks.length;
  const completedTasks = myTasks.filter(t => t.status === 'COMPLETED').length;
  const passedTasks = useMemo(() => myTasks.filter(t => t.auditStatus === 'PASSED' || t.audit_status === 'PASSED' || t.auditStatus === 'PASS'), [myTasks]);
  const fatalTasks = useMemo(() => myTasks.filter(t => t.auditStatus === 'FATAL' || t.audit_status === 'FATAL'), [myTasks]);
  const pendingTasks = useMemo(() => myTasks.filter(t => !t.auditStatus || t.auditStatus === 'PENDING' || t.audit_status === 'PENDING'), [myTasks]);
  const auditedCount = passedTasks.length + fatalTasks.length;
  const fatalCount = fatalTasks.length;
  const passRate = auditedCount > 0 ? Math.round((passedTasks.length / auditedCount) * 100) : 100;

  // Equipment replacements ordered for this FE
  const myReplacements = useMemo(() => {
    const list = [];
    myTasks.forEach(t => {
      (t.replacements || []).forEach(r => {
        list.push({ ...r, taskId: t.taskId || t.id, date: t.date || t.dispatch_date });
      });
    });
    return list;
  }, [myTasks]);

  // Filter tasks based on activeTab and search query
  const displayedTasks = useMemo(() => {
    let list = myTasks;
    if (activeTab === 'FATAL') list = fatalTasks;
    else if (activeTab === 'PASSED') list = passedTasks;
    else if (activeTab === 'PENDING') list = pendingTasks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => {
        const idMatch = String(t.taskId || t.id || '').toLowerCase().includes(q);
        const custMatch = String(t.customerName || '').toLowerCase().includes(q);
        const dateMatch = String(t.date || t.dispatch_date || '').toLowerCase().includes(q);
        const pinMatch = String(t.pin || t.pincode || '').toLowerCase().includes(q);
        return idMatch || custMatch || dateMatch || pinMatch;
      });
    }

    return list;
  }, [myTasks, fatalTasks, passedTasks, pendingTasks, activeTab, searchQuery]);

  // Helper to determine status of a station on a task
  const getStationStatus = (task, stationKey) => {
    const critStatus = task.criteriaStatus || task.criteria_status || {};
    if (critStatus[stationKey]) {
      return critStatus[stationKey] === 'PASS' ? 'PASS' : 'FAIL';
    }

    // Fallback: infer from failed_reasons if FATAL
    if (task.auditStatus === 'FATAL' || task.audit_status === 'FATAL') {
      const failed = (task.failedReasons || task.failed_reasons || []).join(' ').toLowerCase();
      if (stationKey === 'selfie' && (failed.includes('selfie') || failed.includes('t-shirt') || failed.includes('polo') || failed.includes('id card') || failed.includes('badge'))) return 'FAIL';
      if (stationKey === 'torches' && (failed.includes('torch') || failed.includes('penlight') || failed.includes('blue') || failed.includes('yellow'))) return 'FAIL';
      if (stationKey === 'visionChart' && (failed.includes('standee') || failed.includes('chart') || failed.includes('vision'))) return 'FAIL';
      if (stationKey === 'toolkit' && (failed.includes('toolkit') || failed.includes('sanitizer') || failed.includes('jcc') || failed.includes('frame') || failed.includes('ruler'))) return 'FAIL';
      if (stationKey === 'frameDisplay' && (failed.includes('display') || failed.includes('frame') || failed.includes('tray'))) return 'FAIL';
    }

    return task.auditStatus === 'PASSED' ? 'PASS' : 'PENDING';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200 pb-16">
      
      {/* Top Welcome & Identity Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-500/20 shrink-0">
              {extractedName ? extractedName.charAt(0) : (feFullName ? feFullName.charAt(0) : 'FE')}
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Field Staff Portal
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Hub: <strong className="text-slate-200">{feFacility || 'Active Hub'}</strong>
                </span>
                {extractedCode && (
                  <span className="text-xs text-sky-400 font-mono font-bold">
                    [{extractedCode}]
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                {extractedName || feFullName}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Rider / Person ID: <strong className="text-slate-200 font-mono">{fePersonId || '102608'}</strong></span>
                <span>•</span>
                <span>Code: <strong className="text-slate-200 font-mono">{feCode || extractedCode || 'LKH'}</strong></span>
                {feEmail && (
                  <>
                    <span>•</span>
                    <span className="text-slate-300 font-mono">{feEmail}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {fatalCount > 0 ? (
              <div className="bg-red-950/60 border border-red-500/60 rounded-2xl px-4 py-2.5 text-center shadow-lg shadow-red-950/50 animate-pulse">
                <span className="text-[10px] font-black uppercase text-red-300 block tracking-wider">
                  Quality Audit Status
                </span>
                <span className="text-lg font-black text-red-400 flex items-center gap-1.5 justify-center">
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                  {fatalCount} Fatal Strike{fatalCount > 1 ? 's' : ''}
                </span>
              </div>
            ) : (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl px-4 py-2.5 text-center shadow-lg shadow-emerald-950/40">
                <span className="text-[10px] font-black uppercase text-emerald-400 block tracking-wider">
                  Quality Audit Status
                </span>
                <span className="text-lg font-black text-emerald-400 flex items-center gap-1.5 justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  100% Compliant
                </span>
              </div>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Log out of FE Portal"
              >
                <LogOut className="w-4 h-4 text-slate-400" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Daily Grooming Compliance Quick-Action Banner */}
      <div
        onClick={() => setActiveTab('GROOMING')}
        className={`rounded-2xl border p-4 shadow-lg cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          todayGrooming?.overallStatus === 'PASS' || todayGrooming?.humanStatus === 'APPROVED'
            ? 'bg-emerald-950/30 border-emerald-500/40 hover:border-emerald-400/70'
            : todayGrooming?.overallStatus === 'FAIL' || todayGrooming?.humanStatus === 'FLAGGED' || todayGrooming?.humanStatus === 'RECAPTURE_REQUESTED'
            ? 'bg-red-950/40 border-red-500/50 hover:border-red-400'
            : todayGrooming
            ? 'bg-amber-950/30 border-amber-500/40 hover:border-amber-400'
            : 'bg-sky-950/40 border-sky-500/50 hover:border-sky-400'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            todayGrooming?.overallStatus === 'PASS' || todayGrooming?.humanStatus === 'APPROVED'
              ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
              : todayGrooming?.overallStatus === 'FAIL' || todayGrooming?.humanStatus === 'FLAGGED' || todayGrooming?.humanStatus === 'RECAPTURE_REQUESTED'
              ? 'bg-red-600/20 border-red-500/40 text-red-300'
              : 'bg-sky-600/20 border-sky-500/40 text-sky-300'
          }`}>
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Daily Grooming Check ({getTodayYMD()})
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                todayGrooming?.overallStatus === 'PASS' || todayGrooming?.humanStatus === 'APPROVED'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : todayGrooming?.overallStatus === 'FAIL' || todayGrooming?.humanStatus === 'FLAGGED' || todayGrooming?.humanStatus === 'RECAPTURE_REQUESTED'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : todayGrooming
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
              }`}>
                {todayGrooming
                  ? (todayGrooming.humanStatus === 'RECAPTURE_REQUESTED'
                      ? 'Recapture Requested'
                      : todayGrooming.humanStatus === 'APPROVED'
                      ? 'Supervisor Approved'
                      : todayGrooming.humanStatus === 'FLAGGED'
                      ? 'Violation Flagged'
                      : todayGrooming.overallStatus === 'PASS'
                      ? 'AI Passed'
                      : todayGrooming.overallStatus === 'FAIL'
                      ? 'AI Flagged — Retake Available'
                      : 'Submitted (Awaiting AI)')
                  : 'Pending Today — Live Camera Required'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Take 2 live timestamped photos daily: (1) Chest/Torso/Face for Uniform, ID Card, Hair &amp; Facial Hair, and (2) Jeans &amp; Shoes. Gallery upload is disabled.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setActiveTab('GROOMING'); }}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-lg shadow-sky-950/50 shrink-0 cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>{todayGrooming ? 'View / Update Grooming' : 'Start Grooming Check'}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div 
          onClick={() => setActiveTab('ALL')}
          className={`border rounded-2xl p-4 transition-all cursor-pointer ${
            activeTab === 'ALL' ? 'bg-slate-800 border-sky-500/60 shadow-lg' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Dispatches</span>
          <div className="text-2xl font-black text-white mt-1">{totalTasks}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">{completedTasks} Completed visits</span>
        </div>

        <div 
          onClick={() => setActiveTab('FATAL')}
          className={`border rounded-2xl p-4 transition-all cursor-pointer ${
            fatalCount > 0 
              ? (activeTab === 'FATAL' ? 'bg-red-950/60 border-red-500 shadow-xl shadow-red-950/40 ring-1 ring-red-500' : 'bg-red-950/30 border-red-500/40 hover:border-red-500')
              : (activeTab === 'FATAL' ? 'bg-slate-800 border-slate-700' : 'bg-slate-900 border-slate-800')
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-red-400 uppercase tracking-wider block">Fatal Strikes</span>
            {fatalCount > 0 && <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-ping" />}
          </div>
          <div className="text-2xl font-black text-red-400 mt-1">{fatalCount}</div>
          <span className="text-[11px] text-red-300 mt-0.5 block font-bold">
            {fatalCount === 0 ? '✓ No violations' : '⚠️ Immediate action needed'}
          </span>
        </div>

        <div 
          onClick={() => setActiveTab('PASSED')}
          className={`border rounded-2xl p-4 transition-all cursor-pointer ${
            activeTab === 'PASSED' ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">Passed Visits</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{passedTasks.length}</div>
          <span className="text-[11px] text-emerald-400/80 mt-0.5 block">{passRate}% Quality Pass Rate</span>
        </div>

        <div 
          onClick={() => setActiveTab('PENDING')}
          className={`border rounded-2xl p-4 transition-all cursor-pointer ${
            activeTab === 'PENDING' ? 'bg-slate-800 border-amber-500/60 shadow-lg' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">Pending Review</span>
          <div className="text-2xl font-black text-amber-300 mt-1">{pendingTasks.length}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Awaiting QA audit</span>
        </div>
      </div>

      {/* Main Section Navigation Tabs & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTab('FATAL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'FATAL'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Fatal Strikes ({fatalCount})</span>
              {fatalCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-950 text-red-200 text-[10px] font-mono border border-red-400/40 font-bold">
                  Action Required
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('GROOMING')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'GROOMING'
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/50'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-750 border border-sky-500/30'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Daily Grooming</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                todayGrooming?.overallStatus === 'PASS' || todayGrooming?.humanStatus === 'APPROVED'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                  : todayGrooming?.overallStatus === 'FAIL'
                  ? 'bg-red-500/20 text-red-200 border border-red-400/40'
                  : todayGrooming
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                  : 'bg-sky-950 text-sky-200 border border-sky-400/40'
              }`}>
                {todayGrooming
                  ? (todayGrooming.overallStatus === 'PASS' || todayGrooming.humanStatus === 'APPROVED' ? 'PASS' : todayGrooming.overallStatus === 'FAIL' ? 'FAIL' : 'SENT')
                  : 'DUE'}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/50'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Visits ({myTasks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('PASSED')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'PASSED'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Passed Visits ({passedTasks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('PENDING')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-950/50'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending ({pendingTasks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('REPLACEMENTS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'REPLACEMENTS'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Kit Orders ({myReplacements.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Task ID, Date, or PIN..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* TAB 1: FATAL STRIKES & AUDIT VIOLATIONS (PRIMARY FOCUS) */}
        {activeTab === 'FATAL' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <span>My Fatal Task Audit Findings ({fatalCount})</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inspect the exact inspection photos, clinical failure reasons, and QA auditor remarks for tasks marked as non-compliant.
                </p>
              </div>

              {fatalCount > 0 && (
                <span className="text-xs font-bold px-3 py-1 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">
                  Formal Warning Notice Issued
                </span>
              )}
            </div>

            {fatalTasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800 text-xs text-slate-400 space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="font-black text-white text-base">Congratulations! Zero Fatal Strikes Found</h3>
                <p className="max-w-md mx-auto text-slate-400">
                  You have 100% adherence to all Lenskart DLC Home Eye Checkup SOP criteria. All your audited visits have passed inspection!
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {displayedTasks.map((task, idx) => {
                  const taskId = task.id || task.taskId;
                  const imgObj = task.images || task.image_urls || {};
                  const taskImages = {
                    selfie: normalizeLocusUrl(imgObj.selfie, taskId),
                    torches: normalizeLocusUrl(imgObj.torches, taskId),
                    visionChart: normalizeLocusUrl(imgObj.visionChart, taskId),
                    toolkit: normalizeLocusUrl(imgObj.toolkit, taskId),
                    frameDisplay: normalizeLocusUrl(imgObj.frameDisplay, taskId)
                  };

                  const failedList = task.failedReasons || task.failed_reasons || ['Clinical SOP non-compliance detected by QA auditor'];
                  const windowStatus = getDisputeWindowStatus(task.auditedAt);
                  const disputeStatus = task.disputeStatus || task.dispute_status || 'NONE';

                  return (
                    <div 
                      key={`${taskId}_${idx}`}
                      className="bg-slate-950/90 border border-red-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5 transition-all hover:border-red-400/60"
                    >
                      {/* Task Header Ribbon */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-base font-black text-red-400">
                              TASK #{task.taskId || task.id}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 font-mono">
                              {task.zone || task.facilityCode || 'Hub'}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/40">
                              {task.warningLevel || 'Formal Warning Notice'}
                            </span>
                            {task.pin && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                PIN: {task.pin}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300">
                            Dispatch Date: <strong className="text-white">{task.date || task.dispatch_date || 'N/A'}</strong> &bull; Customer: <span className="text-slate-200">{task.customerName || 'N/A'}</span>
                            {task.customerAddress && <span className="text-slate-400"> ({task.customerAddress})</span>}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <button
                            onClick={() => setSelectedTaskForDetails(task)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect Lead Details</span>
                          </button>
                        </div>
                      </div>

                      {/* 5 MANDATORY PHOTO STATIONS FOR THIS FATAL TASK */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          <span className="flex items-center gap-1.5 text-sky-400">
                            <Camera className="w-3.5 h-3.5" />
                            <span>Submitted Photo Evidence (Click any photo to enlarge)</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            Red badges indicate non-compliant stations
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                          {MANDATORY_STATIONS.map(st => {
                            const url = taskImages[st.key];
                            const status = getStationStatus(task, st.key);
                            const isFail = status === 'FAIL';

                            return (
                              <div
                                key={st.key}
                                className={`rounded-2xl border p-2 flex flex-col justify-between transition-all group ${
                                  isFail 
                                    ? 'bg-red-950/30 border-red-500/50 hover:border-red-400' 
                                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between text-[11px] font-bold text-white mb-1.5">
                                    <span className="truncate">{st.icon} {st.label}</span>
                                    <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-black ${
                                      isFail 
                                        ? 'bg-red-500/30 text-red-300 border border-red-500/40' 
                                        : 'bg-emerald-500/20 text-emerald-300'
                                    }`}>
                                      {isFail ? 'FAIL' : 'PASS'}
                                    </span>
                                  </div>

                                  <div className="aspect-[4/3] rounded-xl bg-slate-950 border border-slate-800 overflow-hidden relative group/img">
                                    {url ? (
                                      <>
                                        <img
                                          src={url}
                                          alt={st.label}
                                          className="w-full h-full object-cover cursor-pointer group-hover/img:scale-105 transition-transform duration-200"
                                          onClick={() => setPreviewImage({ url, title: `${st.label} - Task #${task.taskId || task.id}` })}
                                        />
                                        <div
                                          onClick={() => setPreviewImage({ url, title: `${st.label} - Task #${task.taskId || task.id}` })}
                                          className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white font-bold text-xs gap-1"
                                        >
                                          <Eye className="w-3.5 h-3.5" /> Enlarge
                                        </div>
                                      </>
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-bold text-[10px] gap-1 p-2 text-center bg-red-950/10">
                                        <XCircle className="w-4 h-4 text-rose-500" />
                                        <span>ZERO PHOTO</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {url && (
                                  <button
                                    onClick={() => setPreviewImage({ url, title: `${st.label} - Task #${task.taskId || task.id}` })}
                                    className="mt-1.5 w-full py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition-colors cursor-pointer text-center"
                                  >
                                    Enlarge Photo
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2-Column QA Non-Compliance Reasons & Auditor Remarks */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                        
                        {/* Box 1: Specific Violations Marked by QA */}
                        <div className="bg-red-950/30 border border-red-500/40 rounded-2xl p-4 space-y-2">
                          <div className="flex items-center gap-1.5 text-red-300 font-bold">
                            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                            <span>Specific Clinical Violations Marked by QA:</span>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            {failedList.map((reason, i) => (
                              <div key={i} className="text-red-200 text-xs flex items-start gap-2 bg-red-950/40 border border-red-900/40 p-2 rounded-xl">
                                <span className="text-red-400 font-bold shrink-0 mt-0.5">✕</span>
                                <span className="leading-relaxed">{reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Box 2: Auditor Clinical Remarks */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
                          <div>
                            <span className="font-bold text-slate-300 block mb-1">
                              Auditor Clinical Commentary & Remarks:
                            </span>
                            <p className="text-slate-200 leading-relaxed italic text-xs bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                              &quot;{task.remarks || 'Please adhere strictly to Lenskart DLC home visit standards.'}&quot;
                            </p>
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
                            <span>Audited by: <strong className="text-slate-200">{task.auditedBy || 'Central Quality Team'}</strong></span>
                            <span>Date: <strong className="text-slate-200">{task.auditedAt ? new Date(task.auditedAt).toLocaleDateString() : 'Recent'}</strong></span>
                          </div>
                        </div>

                      </div>

                      {/* Improvement Advice for Next Dispatch */}
                      <div className="p-3 bg-gradient-to-r from-blue-950/30 to-indigo-950/30 border border-sky-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-sky-200">
                        <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-white block mb-0.5">How to Rectify on Next Dispatch:</strong>
                          <span>
                            Ensure your physical Lenskart employee photo ID badge is hanging from your chest lanyard, both penlights are switched ON with visible light beams before taking the photo, and the vision acuity chart is firmly mounted on the telescoping standee (never taped to a wall).
                          </span>
                        </div>
                      </div>

                      {/* Warning Notice Mail Alert */}
                      {task.emailSent && (
                        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-500/40 rounded-xl px-3 py-2">
                          <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            Official fatal audit warning notice was dispatched to your email <strong>{task.feEmail || feEmail}</strong>.
                          </span>
                        </div>
                      )}

                      {/* Dispute & Objection Action Bar */}
                      <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${windowStatus.badgeClass}`}>
                            {windowStatus.badgeText}
                          </span>

                          {disputeStatus === 'PENDING_REVIEW' && (
                            <span className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              Objection Under Review by Quality Team
                            </span>
                          )}

                          {disputeStatus === 'MEET_SCHEDULED' && (
                            <a
                              href={task.disputeMeetUrl || task.dispute_meet_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 border border-amber-400 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>📅 Google Meet Scheduled (Click to Join)</span>
                              <ExternalLink className="w-3 h-3 ml-0.5" />
                            </a>
                          )}

                          {disputeStatus === 'RESOLVED_OVERTURNED' && (
                            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Strike Overturned & Passed!
                            </span>
                          )}

                          {disputeStatus === 'RESOLVED_UPHELD' && (
                            <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                              <XCircle className="w-3.5 h-3.5" />
                              Strike Upheld (Final Verdict)
                            </span>
                          )}
                        </div>

                        {disputeStatus === 'NONE' && (
                          <button
                            onClick={() => setDisputeTask(task)}
                            disabled={!windowStatus.canDispute}
                            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                              windowStatus.canDispute
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/40 cursor-pointer'
                                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <ShieldAlert className="w-4 h-4" />
                            <span>{windowStatus.canDispute ? 'Raise Objection (D+3 Window)' : 'Dispute Window Expired'}</span>
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2, 3, 4: ALL VISITS / PASSED / PENDING LIST */}
        {activeTab !== 'FATAL' && activeTab !== 'REPLACEMENTS' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
              <span>Showing <strong>{displayedTasks.length}</strong> visits</span>
            </div>

            {displayedTasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800 text-xs text-slate-500">
                No dispatches found matching this filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {displayedTasks.map((task, idx) => {
                  const isPass = task.auditStatus === 'PASSED' || task.auditStatus === 'PASS';
                  const isFatal = task.auditStatus === 'FATAL';
                  const isPending = !task.auditStatus || task.auditStatus === 'PENDING';

                  return (
                    <div
                      key={`${task.id || task.taskId}_${idx}`}
                      className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-black text-white">
                            TASK #{task.taskId || task.id}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400">
                            {task.date || task.dispatch_date || 'No Date'}
                          </span>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                          isPass 
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                            : isFatal 
                            ? 'bg-red-500/20 text-red-300 border-red-500/40' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {task.auditStatus ? `AI ${task.auditStatus}` : 'PENDING'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 space-y-0.5">
                        <p>Customer: <strong className="text-white">{task.customerName || 'N/A'}</strong></p>
                        <p className="text-[11px] text-slate-400 truncate">{task.customerAddress || 'Customer Address'}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-850 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          {task.facilityCode || task.city || 'Hub'} &bull; Zone: {task.zone || 'Central'}
                        </span>
                        <button
                          onClick={() => setSelectedTaskForDetails(task)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: EQUIPMENT REPLACEMENTS */}
        {activeTab === 'REPLACEMENTS' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Equipment items flagged for replacement to keep your clinical kit functional</span>
              <span className="font-bold text-white">{myReplacements.length} Total items</span>
            </div>

            {myReplacements.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800 text-xs text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                No equipment replacements or consumable restocks pending for your kit.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {myReplacements.map((rep, idx) => (
                  <div 
                    key={idx}
                    className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs flex flex-col justify-between space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-slate-400">Task #{rep.taskId}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          rep.urgency === 'IMMEDIATE' ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-sky-500/20 text-sky-300'
                        }`}>
                          {rep.urgency}
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-sm mt-1">{rep.itemName}</h4>
                      <p className="text-[11px] text-amber-400 mt-0.5 font-medium">{rep.condition}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-850 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Status: <strong className="text-sky-300">Order Placed</strong></span>
                      <span>{rep.date ? new Date(rep.date).toLocaleDateString() : 'Recent'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: DAILY LIVE CAMERA GROOMING CHECK */}
        {activeTab === 'GROOMING' && (
          <FEGroomingCapture
            feProfile={currentFE}
            feName={extractedName || feFullName}
            feCode={feCode || extractedCode}
            feId={fePersonId}
            feEmail={feEmail}
            facilityCode={feFacility}
            onCheckCompleted={(saved) => setTodayGrooming(saved)}
          />
        )}

      </div>

      {/* Mandatory SOP Refresher Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>5 Mandatory SOP Standards to Maintain 100% Quality Pass Rate</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs text-slate-300">
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-sky-400 font-bold block">1. Grooming & ID</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">Official Lenskart polo worn neatly with physical photo ID card clearly visible on lanyard.</p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-sky-400 font-bold block">2. Dual Torches</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">Both Blue & Yellow penlights powered ON with visible active light beams side-by-side.</p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-sky-400 font-bold block">3. Vision Standee</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">Vision chart firmly mounted on telescopic standee at eye level (never tape to wall or door).</p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-sky-400 font-bold block">4. Diagnostic Kit</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">Trial frame, JCC, near vision book, mirror, sanitizer bottle, and PD ruler all present.</p>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-sky-400 font-bold block">5. Frame Display</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">Showcase frame tray set up cleanly inside customer living area table before trial.</p>
          </div>
        </div>
      </div>

      {/* FULL TASK DETAILS MODAL */}
      {selectedTaskForDetails && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
          onClick={() => setSelectedTaskForDetails(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-lg font-black text-white">
                  TASK #{selectedTaskForDetails.taskId || selectedTaskForDetails.id}
                </span>
                <span className={`px-2.5 py-0.5 rounded-xl text-xs font-black uppercase ${
                  selectedTaskForDetails.auditStatus === 'PASSED' 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                    : selectedTaskForDetails.auditStatus === 'FATAL' 
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40' 
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {selectedTaskForDetails.auditStatus ? `AI ${selectedTaskForDetails.auditStatus}` : 'PENDING'}
                </span>
              </div>
              <button
                onClick={() => setSelectedTaskForDetails(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Customer</span>
                <strong className="text-white">{selectedTaskForDetails.customerName || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Dispatch Date</span>
                <strong className="text-white">{selectedTaskForDetails.date || selectedTaskForDetails.dispatch_date || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">PIN / Hub</span>
                <strong className="text-white">{selectedTaskForDetails.pin || selectedTaskForDetails.pincode || 'N/A'} ({selectedTaskForDetails.facilityCode || 'Hub'})</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Address</span>
                <span className="text-slate-300 truncate block">{selectedTaskForDetails.customerAddress || 'N/A'}</span>
              </div>
            </div>

            {/* 5 Photos */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                5 Mandatory Inspection Photo Stations
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {MANDATORY_STATIONS.map(st => {
                  const url = normalizeLocusUrl((selectedTaskForDetails.images || selectedTaskForDetails.image_urls || {})[st.key], selectedTaskForDetails.id || selectedTaskForDetails.taskId);
                  const status = getStationStatus(selectedTaskForDetails, st.key);
                  const isFail = status === 'FAIL';

                  return (
                    <div key={st.key} className="p-2 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-[10px] font-bold text-white mb-1">
                        <span className="truncate">{st.icon} {st.label}</span>
                        <span className={`px-1.5 py-0.2 rounded font-black text-[9px] ${
                          isFail ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {status}
                        </span>
                      </div>
                      <div className="aspect-[4/3] rounded-xl bg-slate-900 overflow-hidden relative">
                        {url ? (
                          <img
                            src={url}
                            alt={st.label}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setPreviewImage({ url, title: `${st.label} - Task #${selectedTaskForDetails.taskId || selectedTaskForDetails.id}` })}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600 font-bold">
                            NO PHOTO
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Remarks & Violations */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <span className="font-bold text-white block">Auditor Clinical Observations:</span>
              <p className="text-slate-300 leading-relaxed italic bg-slate-900 p-3 rounded-xl border border-slate-850">
                &quot;{selectedTaskForDetails.remarks || 'Standard adherence.'}&quot;
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>Audited By: <strong className="text-slate-200">{selectedTaskForDetails.auditedBy || 'Central Quality Team'}</strong></span>
                <span>Date: <strong className="text-slate-200">{selectedTaskForDetails.auditedAt ? new Date(selectedTaskForDetails.auditedAt).toLocaleDateString() : 'Recent'}</strong></span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedTaskForDetails(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHOTO ZOOM / PREVIEW MODAL */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">{previewImage.title}</span>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg bg-slate-800 cursor-pointer"
              >
                Close (ESC)
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-950 flex-1 overflow-auto">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[70vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* DISPUTE / OBJECTION MODAL */}
      {disputeTask && (
        <DisputeObjectionModal
          task={disputeTask}
          currentUser={currentFE}
          isOpen={Boolean(disputeTask)}
          onClose={() => setDisputeTask(null)}
          onSubmitDispute={onRaiseDispute}
        />
      )}

    </div>
  );
}
