import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Sparkles,
  Cpu,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Key,
  Eye,
  Download,
  Filter,
  Search,
  ExternalLink,
  ChevronRight,
  Maximize2,
  RefreshCw,
  Camera,
  Layers,
  Award,
  TrendingUp,
  Sliders,
  Check,
  X,
  Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  getStoredGeminiApiKey, 
  saveStoredGeminiApiKey, 
  testGeminiApiKey, 
  auditTaskWithGemini,
  normalizeLocusUrl 
} from '../utils/geminiAuditHelper.js';
import { tasksApi } from '../api/client.js';
import { INITIAL_CENTRAL_RULES } from '../data/centralRules.js';

export default function AIAuditsConsole({
  tasks = [],
  users = [],
  currentUser,
  onNavigate,
  onTaskAudited
}) {
  // 1. API Key State
  const [apiKey, setApiKey] = useState(() => getStoredGeminiApiKey());
  const [showKey, setShowKey] = useState(false);
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyStatus, setKeyStatus] = useState({ tested: false, valid: false, message: '' });

  // 2. Queue & Filter States
  const [selectedCity, setSelectedCity] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('PENDING'); // 'PENDING' | 'ALL' | 'AUDITED'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  // 3. Execution & Batch Engine State
  const [isAuditing, setIsAuditing] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const isBatchCancelledRef = useRef(false);
  const [currentProgress, setCurrentProgress] = useState({ step: '', message: '' });
  const [activeAuditResult, setActiveAuditResult] = useState(null);
  const [autoCommitToDb, setAutoCommitToDb] = useState(true);

  // 4. Session History Ledger
  const [sessionHistory, setSessionHistory] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);

  // Sync API Key to Storage
  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    saveStoredGeminiApiKey(newKey);
    setKeyStatus({ tested: false, valid: false, message: '' });
  };

  // Test Gemini API Key
  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setKeyStatus({ tested: true, valid: false, message: 'Please enter a Gemini API Key.' });
      return;
    }
    setKeyTesting(true);
    try {
      await testGeminiApiKey(apiKey);
      setKeyStatus({ tested: true, valid: true, message: 'Gemini 1.5 Flash Connected Successfully!' });
    } catch (err) {
      setKeyStatus({ tested: true, valid: false, message: err.message || 'Connection failed.' });
    } finally {
      setKeyTesting(false);
    }
  };

  // Distinct filter options
  const { availableCities, availableDates } = useMemo(() => {
    const cities = new Set();
    const dates = new Set();
    tasks.forEach(t => {
      const c = t.facilityCode || t.city || t.teamName;
      if (c) cities.add(c);
      const d = (t.date || t.dispatch_date || '').slice(0, 10);
      if (d) dates.add(d);
    });
    return {
      availableCities: Array.from(cities).sort(),
      availableDates: Array.from(dates).sort()
    };
  }, [tasks]);

  // Filter Tasks Queue
  const queueTasks = useMemo(() => {
    return tasks.filter(t => {
      // Audit status filter
      if (selectedStatusFilter === 'PENDING' && (t.auditStatus === 'PASSED' || t.auditStatus === 'FATAL')) return false;
      if (selectedStatusFilter === 'AUDITED' && t.auditStatus !== 'PASSED' && t.auditStatus !== 'FATAL') return false;

      // City filter
      if (selectedCity !== 'ALL') {
        const c = t.facilityCode || t.city || t.teamName || '';
        if (c.toLowerCase() !== selectedCity.toLowerCase()) return false;
      }

      // Date filter
      if (selectedDate !== 'ALL') {
        const d = (t.date || t.dispatch_date || '').slice(0, 10);
        if (d !== selectedDate) return false;
      }

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mId = String(t.taskId || t.id || '').toLowerCase().includes(q);
        const mFe = String(t.feName || '').toLowerCase().includes(q);
        const mCode = String(t.feCode || '').toLowerCase().includes(q);
        if (!mId && !mFe && !mCode) return false;
      }

      return true;
    });
  }, [tasks, selectedStatusFilter, selectedCity, selectedDate, searchQuery]);

  // Selected Task
  const selectedTask = useMemo(() => {
    if (!queueTasks.length) return null;
    if (selectedTaskId) {
      const found = queueTasks.find(t => String(t.id || t.taskId) === String(selectedTaskId));
      if (found) return found;
    }
    return queueTasks[0];
  }, [queueTasks, selectedTaskId]);

  // Execute AI Audit on a single task
  const runAiAuditOnTask = async (taskToAudit, shouldCommit = autoCommitToDb) => {
    if (!taskToAudit) return null;
    if (!apiKey.trim()) {
      alert('Please enter and connect your Google Gemini API Key first.');
      return null;
    }

    setIsAuditing(true);
    setCurrentProgress({ step: 'INITIALIZING', message: `Starting AI inspection for Task #${taskToAudit.taskId || taskToAudit.id}...` });

    try {
      const result = await auditTaskWithGemini({
        task: taskToAudit,
        apiKey,
        rules: INITIAL_CENTRAL_RULES,
        onProgress: (prog) => setCurrentProgress(prog)
      });

      setActiveAuditResult({
        taskId: taskToAudit.id || taskToAudit.taskId,
        task: taskToAudit,
        result
      });

      // Optionally commit to Supabase database
      if (shouldCommit) {
        setCurrentProgress({ step: 'COMMITTING', message: 'Writing AI audit verdict to Supabase database...' });
        
        // Prepare criteria status map
        const criteriaStatus = {};
        const failedReasons = [];
        (result.criteriaEvaluation || []).forEach(c => {
          criteriaStatus[c.id] = c.status;
          if (c.status === 'FAIL') {
            if (c.failureReasons && c.failureReasons.length > 0) {
              failedReasons.push(...c.failureReasons);
            } else {
              failedReasons.push(`${c.label}: Non-compliant`);
            }
          }
        });

        const auditorName = 'Gemini 1.5 Flash (AI)';
        const auditorLocation = taskToAudit.facilityCode || taskToAudit.city || 'Central AI';

        if (result.verdict === 'PASS') {
          await tasksApi.passAudit({
            taskId: taskToAudit.id || taskToAudit.taskId,
            auditorName,
            auditorLocation,
            remarks: `AI PASSED (Score: ${result.overallScore}/100, Conf: ${result.confidenceScore}% ±${result.errorMargin}%). ${result.summary}`,
            criteriaStatus,
            replacements: [],
            taskData: taskToAudit
          });
        } else {
          await tasksApi.failAudit({
            taskId: taskToAudit.id || taskToAudit.taskId,
            taskData: taskToAudit,
            failedReasons: failedReasons.length > 0 ? failedReasons : ['AI Non-Compliance Detection'],
            remarks: `AI FATAL STRIKE (Score: ${result.overallScore}/100, Conf: ${result.confidenceScore}% ±${result.errorMargin}%). ${result.summary}`,
            criteriaStatus,
            replacements: [],
            auditorName,
            auditorLocation,
            immediateEmail: false
          });
        }

        if (onTaskAudited) {
          onTaskAudited(taskToAudit.id || taskToAudit.taskId, result.verdict);
        }
      }

      // Add to session ledger
      const sessionEntry = {
        taskId: taskToAudit.taskId || taskToAudit.id,
        feName: taskToAudit.feName || 'Unknown',
        feCode: taskToAudit.feCode || '',
        city: taskToAudit.facilityCode || taskToAudit.city || 'Hub',
        date: taskToAudit.date || taskToAudit.dispatch_date || '',
        verdict: result.verdict,
        overallScore: result.overallScore,
        confidenceScore: result.confidenceScore,
        errorMargin: result.errorMargin,
        summary: result.summary,
        auditedAt: new Date().toLocaleTimeString()
      };
      setSessionHistory(prev => [sessionEntry, ...prev]);

      return result;
    } catch (err) {
      console.error('AI Audit Failed:', err);
      alert(`AI Audit Failed: ${err.message}`);
      return null;
    } finally {
      setIsAuditing(false);
      setCurrentProgress({ step: 'COMPLETE', message: '' });
    }
  };

  // Run Batch AI Auditing Loop
  const runBatchAuditing = async (batchCount = 5) => {
    if (!apiKey.trim()) {
      alert('Please enter and connect your Google Gemini API Key first.');
      return;
    }
    if (queueTasks.length === 0) {
      alert('No pending tasks in queue.');
      return;
    }

    const tasksToProcess = queueTasks.slice(0, batchCount);
    setIsBatchRunning(true);
    isBatchCancelledRef.current = false;

    let processed = 0;
    for (const t of tasksToProcess) {
      if (isBatchCancelledRef.current) break;
      setSelectedTaskId(t.id || t.taskId);
      await runAiAuditOnTask(t, autoCommitToDb);
      processed++;
      
      // 800ms throttle interval between tasks to avoid API rate limits
      if (processed < tasksToProcess.length && !isBatchCancelledRef.current) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    setIsBatchRunning(false);
  };

  const handleStopBatch = () => {
    isBatchCancelledRef.current = true;
    setIsBatchRunning(false);
  };

  // Export AI Audit Session to Excel
  const handleExportSessionExcel = () => {
    if (sessionHistory.length === 0) {
      alert('No AI audits conducted in this session yet.');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(sessionHistory);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AI_Audit_Log');
    XLSX.writeFile(wb, `Gemini_AI_Audit_Log_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Pre-calculate image URLs for selected task
  const taskImages = useMemo(() => {
    if (!selectedTask) return {};
    const imgObj = selectedTask.images || {};
    const taskId = selectedTask.id || selectedTask.taskId;
    return {
      selfie: normalizeLocusUrl(imgObj.selfie, taskId),
      torches: normalizeLocusUrl(imgObj.torches, taskId),
      visionChart: normalizeLocusUrl(imgObj.visionChart, taskId),
      toolkit: normalizeLocusUrl(imgObj.toolkit, taskId),
      frameDisplay: normalizeLocusUrl(imgObj.frameDisplay, taskId)
    };
  }, [selectedTask]);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 border border-sky-800/40 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 border border-sky-400/40 flex items-center justify-center text-white shadow-lg shadow-sky-500/25">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Multimodal Autonomous QA
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                  <Cpu className="w-3 h-3 text-sky-400" />
                  Gemini 1.5 Flash Vision Engine
                </span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">
                AI Autonomous Audits Console
              </h1>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-xl text-center">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Pending Audits</span>
              <span className="text-base font-black text-amber-400">{queueTasks.length}</span>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-xl text-center">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Audited This Session</span>
              <span className="text-base font-black text-emerald-400">{sessionHistory.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Google Gemini API Key Configuration Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Google Gemini API Configuration</span>
          </div>

          {/* Status Pill */}
          <div className="flex items-center gap-2">
            {keyStatus.tested ? (
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                keyStatus.valid ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'
              }`}>
                {keyStatus.valid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                <span>{keyStatus.message}</span>
              </span>
            ) : apiKey.trim() ? (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-sky-400" />
                <span>API Key Ready</span>
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>API Key Required</span>
              </span>
            )}
          </div>
        </div>

        {/* Key Input Field */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleSaveApiKey(e.target.value)}
              placeholder="Paste Google Gemini API Key (e.g. AIzaSy...)"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>

          <button
            onClick={handleTestKey}
            disabled={keyTesting || !apiKey.trim()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
          >
            {keyTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-sky-400" />}
            <span>Test Connection</span>
          </button>
        </div>
      </div>

      {/* Queue Filter & Batch Control Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-sky-400" />
            <span className="font-bold text-white uppercase tracking-wider">Queue Selection ({queueTasks.length} Visits)</span>
          </div>

          {/* Auto-commit checkbox */}
          <label className="flex items-center gap-2 text-slate-300 font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoCommitToDb}
              onChange={(e) => setAutoCommitToDb(e.target.checked)}
              className="w-4 h-4 rounded text-sky-600 focus:ring-0 bg-slate-950 border-slate-700 cursor-pointer"
            />
            <span>Auto-Save Verdict to Database</span>
          </label>
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">Queue Status</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="PENDING" className="bg-slate-900">Unaudited Pending Only</option>
              <option value="AUDITED" className="bg-slate-900">Already Audited Only</option>
              <option value="ALL" className="bg-slate-900">All Tasks</option>
            </select>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">City Hub</span>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Cities</option>
              {availableCities.map(c => (
                <option key={c} value={c} className="bg-slate-900">{c}</option>
              ))}
            </select>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">Dispatch Date</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Dates</option>
              {availableDates.map(d => (
                <option key={d} value={d} className="bg-slate-900">{d}</option>
              ))}
            </select>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Task ID or FE..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

        </div>

        {/* Execution Buttons Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => runAiAuditOnTask(selectedTask)}
              disabled={isAuditing || isBatchRunning || !selectedTask}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white shadow-lg shadow-sky-600/25 flex items-center gap-2 transition-all cursor-pointer"
            >
              {isAuditing && !isBatchRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Audit Current Task</span>
            </button>

            <button
              onClick={() => runBatchAuditing(5)}
              disabled={isAuditing || isBatchRunning || queueTasks.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Audit Batch of 5</span>
            </button>

            <button
              onClick={() => runBatchAuditing(10)}
              disabled={isAuditing || isBatchRunning || queueTasks.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white shadow-lg shadow-blue-700/25 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Audit Batch of 10</span>
            </button>

            {isBatchRunning && (
              <button
                onClick={handleStopBatch}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/25 flex items-center gap-2 transition-all cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause / Stop Batch</span>
              </button>
            )}
          </div>

          {/* Progress / Status banner */}
          {isAuditing && (
            <div className="flex items-center gap-2 text-xs text-sky-400 font-semibold animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{currentProgress.message || 'Processing multimodal audit...'}</span>
            </div>
          )}

        </div>
      </div>

      {/* Main Split-Screen Workspace: Task & 5 Photos (Left) + AI Audit Report (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: TASK METADATA & 5 PHOTO STATIONS (5 Columns) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Active Task Selector Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Lead Details</span>
              <span className="text-xs font-mono font-bold text-sky-400">
                Task #{selectedTask?.taskId || selectedTask?.id || '—'}
              </span>
            </div>

            {selectedTask ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Field Executive:</span>
                  <span className="font-bold text-white">{selectedTask.feName} <span className="text-slate-500 font-mono">[{selectedTask.feCode}]</span></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hub / City:</span>
                  <span className="font-semibold text-slate-200">{selectedTask.facilityCode || selectedTask.city}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Dispatch Date:</span>
                  <span className="font-mono text-slate-200">{selectedTask.date || selectedTask.dispatch_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer:</span>
                  <span className="font-medium text-slate-200">{selectedTask.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Audit Status:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                    selectedTask.auditStatus === 'PASSED' ? 'bg-emerald-500/20 text-emerald-400' :
                    selectedTask.auditStatus === 'FATAL' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {selectedTask.auditStatus || 'PENDING'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 text-xs">No tasks in current queue filter.</div>
            )}
          </div>

          {/* 5 Clinical SOP Photos Thumbnails */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-sky-400" />
                <span>5 Mandatory Inspection Photos</span>
              </span>
              <span className="text-[10px] text-slate-500">Click to enlarge</span>
            </div>

            <div className="space-y-2.5">
              {[
                { key: 'selfie', label: '1. Selfie: T-Shirt & ID Card' },
                { key: 'torches', label: '2. Working Blue & Yellow Torches' },
                { key: 'visionChart', label: '3. Vision Chart & Standee' },
                { key: 'toolkit', label: '4. Refraction Toolkit' },
                { key: 'frameDisplay', label: '5. Frame Display at House' }
              ].map((station, idx) => {
                const url = taskImages[station.key];
                return (
                  <div key={station.key} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0 relative group">
                        {url ? (
                          <img
                            src={url}
                            alt={station.label}
                            className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform"
                            onClick={() => setPreviewImage({ url, title: station.label })}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600 font-bold">
                            MISSING
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{station.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {url ? 'Photo Attached' : <span className="text-red-400 font-bold">Zero Upload</span>}
                        </div>
                      </div>
                    </div>

                    {url && (
                      <button
                        onClick={() => setPreviewImage({ url, title: station.label })}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
                      >
                        Enlarge
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: AI AUDIT REPORT & MULTIMODAL VERDICT (7 Columns) */}
        <div className="lg:col-span-7 space-y-4">
          
          {activeAuditResult ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5 animate-fade-in">
              
              {/* Verdict Header Ribbon */}
              <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                activeAuditResult.result.verdict === 'PASS'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-red-950/40 border-red-500/40 text-red-300'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-white shadow-lg ${
                    activeAuditResult.result.verdict === 'PASS' ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-red-600 shadow-red-600/30'
                  }`}>
                    {activeAuditResult.result.verdict === 'PASS' ? <CheckCircle2 className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider">Multimodal AI Inspection Verdict</div>
                    <div className="text-xl font-black text-white">
                      {activeAuditResult.result.verdict === 'PASS' ? 'AUDIT PASSED' : 'FATAL NON-COMPLIANCE STRIKE'}
                    </div>
                  </div>
                </div>

                {/* Score & Error Margin Gauge */}
                <div className="text-right">
                  <div className="text-2xl font-black text-white font-mono">
                    {activeAuditResult.result.overallScore}<span className="text-xs text-slate-400 font-normal">/100</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Error Margin: <strong className="text-amber-300">&plusmn;{activeAuditResult.result.errorMargin}%</strong> ({activeAuditResult.result.confidenceScore}% conf.)
                  </div>
                </div>
              </div>

              {/* AI Executive Summary */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block mb-1">
                  Gemini Clinical Evaluation Summary
                </span>
                <p className="text-slate-200 leading-relaxed font-sans">
                  {activeAuditResult.result.summary}
                </p>
                {activeAuditResult.result.isFraudulentOrBlankDetected && (
                  <div className="mt-2.5 p-2 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-[11px] font-bold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Fraud Alert: AI identified blank, covered lens, or camera-obscured photo submission.</span>
                  </div>
                )}
              </div>

              {/* 5-Station Checklist Accordion */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>Item-by-Item SOP Evaluation</span>
                </h4>

                <div className="space-y-2">
                  {(activeAuditResult.result.criteriaEvaluation || []).map((crit) => (
                    <div
                      key={crit.id}
                      className={`p-3 rounded-xl border text-xs transition-all ${
                        crit.status === 'PASS'
                          ? 'bg-slate-950/60 border-slate-800'
                          : 'bg-red-950/20 border-red-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <span className={`w-2 h-2 rounded-full ${crit.status === 'PASS' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          <span>{crit.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono text-[11px]">{crit.score}/100</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            crit.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            {crit.status}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                        {crit.observations}
                      </div>

                      {crit.failureReasons && crit.failureReasons.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {crit.failureReasons.map((r, i) => (
                            <div key={i} className="text-[10px] font-semibold text-red-400 flex items-center gap-1.5">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Commit & Override Action Footer */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between flex-wrap gap-2 pt-3">
                <span className="text-[11px] text-slate-400">
                  Audit Verdict is saved in Supabase as <strong className="text-sky-300">Gemini 1.5 Flash (AI)</strong>.
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      // Move to next task in queue
                      const currentIndex = queueTasks.findIndex(t => String(t.id || t.taskId) === String(selectedTask?.id || selectedTask?.taskId));
                      if (currentIndex >= 0 && currentIndex < queueTasks.length - 1) {
                        setSelectedTaskId(queueTasks[currentIndex + 1].id || queueTasks[currentIndex + 1].taskId);
                        setActiveAuditResult(null);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                  >
                    Next Lead in Queue &rarr;
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3 shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto text-sky-400">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">AI Auditor Idle</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Select a task from the queue or click <strong className="text-sky-400">&ldquo;Audit Current Task&rdquo;</strong> to send all 5 photos to Gemini 1.5 Flash for autonomous clinical grading.
              </p>
            </div>
          )}

        </div>

      </div>

      {/* Session Audit History Ledger */}
      {sessionHistory.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                <span>Current Session AI Audit Log ({sessionHistory.length} Visited Leads)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Real-time log of audits conducted during this working session.
              </p>
            </div>

            <button
              onClick={handleExportSessionExcel}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Export Session Log</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-850 text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800">
                  <th className="py-2.5 px-4">Task ID</th>
                  <th className="py-2.5 px-3">Field Executive</th>
                  <th className="py-2.5 px-3">Hub</th>
                  <th className="py-2.5 px-3 text-center">AI Verdict</th>
                  <th className="py-2.5 px-3 text-center">Score</th>
                  <th className="py-2.5 px-3 text-center">Confidence / Error</th>
                  <th className="py-2.5 px-4">AI Observations</th>
                  <th className="py-2.5 px-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {sessionHistory.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/40">
                    <td className="py-2.5 px-4 font-mono font-bold text-sky-400">#{s.taskId}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">{s.feName} <span className="text-[10px] text-slate-500 font-mono">[{s.feCode}]</span></td>
                    <td className="py-2.5 px-3 text-slate-300">{s.city}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.verdict === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {s.verdict}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-white">{s.overallScore}/100</td>
                    <td className="py-2.5 px-3 text-center font-mono text-[11px] text-amber-300">&plusmn;{s.errorMargin}% ({s.confidenceScore}%)</td>
                    <td className="py-2.5 px-4 max-w-sm truncate text-[11px] text-slate-300" title={s.summary}>{s.summary}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400 font-mono text-[10px]">{s.auditedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enlarged Photo Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
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
                className="max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
