import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Fingerprint, 
  Play, 
  Square, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Download, 
  Eye, 
  Layers, 
  ShieldAlert, 
  RefreshCw, 
  Clock, 
  Sparkles, 
  Calendar, 
  Filter, 
  Users, 
  Copy, 
  Check, 
  ExternalLink,
  ChevronRight,
  Maximize2,
  X,
  FileCheck,
  Search
} from 'lucide-react';
import { 
  extractTaskImageItems, 
  runBatchForensicScan 
} from '../utils/imageForensics.js';

export default function ImageForensicsLab({ 
  tasks = [], 
  onInspectTask, 
  onFatalTask,
  currentUser 
}) {
  // Available batch dates extracted from tasks
  const availableDates = useMemo(() => {
    const dates = new Set();
    tasks.forEach(t => {
      const d = t.date || t.dispatch_date;
      if (d) {
        const clean = d.split(' ')[0];
        dates.add(clean);
      }
    });
    return Array.from(dates).sort().reverse();
  }, [tasks]);

  // Selected filters
  const [selectedDate, setSelectedDate] = useState(() => availableDates[0] || 'ALL');
  const [selectedSlot, setSelectedSlot] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyCollusion, setOnlyCollusion] = useState(false);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, currentItem: null });
  const [scanResults, setScanResults] = useState(null);
  const abortControllerRef = useRef(null);

  // UI state
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'exact' | 'perceptual' | 'stale'
  const [previewModalImage, setPreviewModalImage] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null);

  // Filter tasks based on selected scope
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Date filter
      if (selectedDate !== 'ALL') {
        const taskDate = (t.date || t.dispatch_date || '').split(' ')[0];
        if (taskDate !== selectedDate) return false;
      }
      // Audit status filter
      if (selectedStatus !== 'ALL') {
        const status = t.auditStatus || t.audit_status || 'PENDING';
        if (status !== selectedStatus) return false;
      }
      return true;
    });
  }, [tasks, selectedDate, selectedStatus]);

  // Extract all valid image items ready to be scanned in this scope
  const imageQueue = useMemo(() => {
    const all = extractTaskImageItems(filteredTasks);
    if (selectedSlot === 'ALL') return all;
    return all.filter(it => it.slotName === selectedSlot);
  }, [filteredTasks, selectedSlot]);

  // Handle start batch scan
  const handleStartScan = async () => {
    if (imageQueue.length === 0) {
      alert('No checklist photos found in the selected batch/date filter.');
      return;
    }

    setIsScanning(true);
    setScanProgress({ current: 0, total: imageQueue.length, currentItem: null });
    setScanResults(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const results = await runBatchForensicScan(
        imageQueue,
        (prog) => {
          setScanProgress({
            current: prog.current,
            total: prog.total,
            currentItem: prog.item
          });
        },
        abortController.signal
      );

      setScanResults(results);
    } catch (err) {
      console.error('Batch scan failed:', err);
      alert('Forensics scan encountered an issue: ' + err.message);
    } finally {
      setIsScanning(false);
      abortControllerRef.current = null;
    }
  };

  // Handle stop scan
  const handleStopScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsScanning(false);
    }
  };

  // Handle Copy
  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // One-click enforcement: Mark single task as FATAL
  const handleMarkTaskFatal = async (taskId, reasonText) => {
    if (!onFatalTask) return;
    const confirm = window.confirm(`Mark Task #${taskId} as FATAL for "${reasonText}"?`);
    if (!confirm) return;

    await onFatalTask(taskId, {
      reasons: ['Duplicate / recycled images detected'],
      remarks: `FATAL: Image Forensics Anti-Fraud Engine detected fraudulent photo reuse (${reasonText}).`,
      location: currentUser?.facility_code || 'Central Forensics Lab'
    });

    setActionSuccessMessage(`Task #${taskId} successfully struck as FATAL.`);
    setTimeout(() => setActionSuccessMessage(null), 3500);
  };

  // One-click enforcement: Mark all tasks in an exact cluster as FATAL
  const handleMarkClusterFatal = async (cluster) => {
    if (!onFatalTask) return;
    const taskIds = Array.from(new Set(cluster.items.map(it => it.taskId)));
    const confirm = window.confirm(
      `Mark all ${taskIds.length} tasks in this duplicate cluster as FATAL?\n\nTasks: ${taskIds.join(', ')}`
    );
    if (!confirm) return;

    for (const tid of taskIds) {
      await onFatalTask(tid, {
        reasons: ['Duplicate / recycled images detected'],
        remarks: `FATAL: Exact Bit-for-Bit Duplicate File (SHA-256: ${cluster.sha256.substring(0, 16)}...) submitted across visits.`,
        location: currentUser?.facility_code || 'Central Forensics Lab'
      });
    }

    setActionSuccessMessage(`All ${taskIds.length} tasks in duplicate cluster successfully struck as FATAL.`);
    setTimeout(() => setActionSuccessMessage(null), 3500);
  };

  // One-click enforcement: Mark both tasks in a perceptual pair as FATAL
  const handleMarkPairFatal = async (pair) => {
    if (!onFatalTask) return;
    const tidA = pair.itemA.taskId;
    const tidB = pair.itemB.taskId;
    const confirm = window.confirm(
      `Mark both Task #${tidA} and Task #${tidB} as FATAL?\n\nDetected ${pair.similarityPct}% visual clone (Hamming distance ${pair.hammingDistance}/64).`
    );
    if (!confirm) return;

    await onFatalTask(tidA, {
      reasons: ['Duplicate / recycled images detected'],
      remarks: `FATAL: Perceptual Clone (${pair.similarityPct}% Match) with Task #${tidB}.`,
      location: currentUser?.facility_code || 'Central Forensics Lab'
    });

    await onFatalTask(tidB, {
      reasons: ['Duplicate / recycled images detected'],
      remarks: `FATAL: Perceptual Clone (${pair.similarityPct}% Match) with Task #${tidA}.`,
      location: currentUser?.facility_code || 'Central Forensics Lab'
    });

    setActionSuccessMessage(`Tasks #${tidA} and #${tidB} both marked FATAL for visual image reuse.`);
    setTimeout(() => setActionSuccessMessage(null), 3500);
  };

  // Export Forensic Report as CSV
  const handleExportCSV = () => {
    if (!scanResults) return;

    const rows = [
      ['Incident Type', 'Severity', 'Task ID', 'FE Name', 'FE Code', 'City', 'Visit Date', 'Checklist Slot', 'Similarity %', 'SHA-256 / Hash', 'Recommendation']
    ];

    // Exact clusters
    scanResults.exactClusters.forEach(c => {
      c.items.forEach(it => {
        rows.push([
          'EXACT_BYTE_DUPLICATE',
          c.severity,
          it.taskId,
          it.feName,
          it.feCode,
          it.city,
          it.date,
          it.slotLabel,
          '100%',
          c.sha256,
          c.recommendation
        ]);
      });
    });

    // Perceptual pairs
    scanResults.perceptualPairs.forEach(p => {
      rows.push([
        'PERCEPTUAL_CLONE_PAIR_A',
        p.severity,
        p.itemA.taskId,
        p.itemA.feName,
        p.itemA.feCode,
        p.itemA.city,
        p.itemA.date,
        p.itemA.slotLabel,
        `${p.similarityPct}%`,
        p.itemA.dHash?.hashHex || '',
        `Cloned with Task #${p.itemB.taskId}`
      ]);
      rows.push([
        'PERCEPTUAL_CLONE_PAIR_B',
        p.severity,
        p.itemB.taskId,
        p.itemB.feName,
        p.itemB.feCode,
        p.itemB.city,
        p.itemB.date,
        p.itemB.slotLabel,
        `${p.similarityPct}%`,
        p.itemB.dHash?.hashHex || '',
        `Cloned with Task #${p.itemA.taskId}`
      ]);
    });

    // Stale photos
    scanResults.stalePhotoAlerts.forEach(s => {
      rows.push([
        'STALE_PHOTO_DATE_MISMATCH',
        s.severity,
        s.item.taskId,
        s.item.feName,
        s.item.feCode,
        s.item.city,
        s.item.date,
        s.item.slotLabel,
        'N/A',
        s.item.sha256 || '',
        `Captured on ${s.exifDate} (${s.cameraModel})`
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `image_forensics_audit_report_${selectedDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered views of scan results
  const exactClustersFiltered = useMemo(() => {
    if (!scanResults) return [];
    let list = scanResults.exactClusters || [];
    if (onlyCollusion) list = list.filter(c => c.isCrossFE);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => 
        c.items.some(it => 
          it.taskId.toLowerCase().includes(q) || 
          it.feName.toLowerCase().includes(q) || 
          it.feCode.toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [scanResults, onlyCollusion, searchQuery]);

  const perceptualPairsFiltered = useMemo(() => {
    if (!scanResults) return [];
    let list = scanResults.perceptualPairs || [];
    if (onlyCollusion) list = list.filter(p => p.isCrossFE);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => 
        p.itemA.taskId.toLowerCase().includes(q) || 
        p.itemA.feName.toLowerCase().includes(q) || 
        p.itemA.feCode.toLowerCase().includes(q) ||
        p.itemB.taskId.toLowerCase().includes(q) || 
        p.itemB.feName.toLowerCase().includes(q) || 
        p.itemB.feCode.toLowerCase().includes(q)
      );
    }
    return list;
  }, [scanResults, onlyCollusion, searchQuery]);

  const stalePhotosFiltered = useMemo(() => {
    if (!scanResults) return [];
    let list = scanResults.stalePhotoAlerts || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => 
        s.item.taskId.toLowerCase().includes(q) || 
        s.item.feName.toLowerCase().includes(q) || 
        s.item.feCode.toLowerCase().includes(q)
      );
    }
    return list;
  }, [scanResults, searchQuery]);

  const totalFilteredIncidents = exactClustersFiltered.length + perceptualPairsFiltered.length + stalePhotosFiltered.length;

  return (
    <div className="space-y-6 pb-20">
      
      {/* SUCCESS TOAST */}
      {actionSuccessMessage && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-500 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* TOP COMMAND HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Fingerprint className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Field Image Forensics & Anti-Fraud Center
              </h1>
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Active Scanner
              </span>
            </div>
            <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
              Automated anti-fraud engine for audit checklist photos. Pulls remote task images and scans for 
              <strong className="text-slate-200"> exact byte duplicates</strong>, 
              <strong className="text-slate-200"> cropped/resized screenshots (dHash)</strong>, 
              <strong className="text-slate-200"> old photos</strong>, and 
              <strong className="text-slate-200"> cross-FE collusion</strong>.
            </p>
          </div>

          {/* MAIN ONE-CLICK SCAN BUTTON */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {isScanning ? (
              <button
                onClick={handleStopScan}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 animate-pulse"
              >
                <Square className="w-4 h-4 fill-white" />
                Stop Scan ({scanProgress.current}/{scanProgress.total})
              </button>
            ) : (
              <button
                onClick={handleStartScan}
                disabled={imageQueue.length === 0}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2.5"
              >
                <Play className="w-4 h-4 fill-white" />
                Run Anti-Fraud Forensics Scan
                <span className="bg-white/20 px-2 py-0.5 rounded-md font-mono text-[11px]">
                  {imageQueue.length} Photos
                </span>
              </button>
            )}

            {scanResults && (
              <button
                onClick={handleExportCSV}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4 text-slate-400" />
                Export CSV Report
              </button>
            )}
          </div>
        </div>

        {/* SCOPE FILTERS BAR */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3 text-xs">
          {/* Date Selector */}
          <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">Batch Date:</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={isScanning}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Available Dates</option>
              {availableDates.map(d => (
                <option key={d} value={d} className="bg-slate-900">{d}</option>
              ))}
            </select>
          </div>

          {/* Checklist Slot Filter */}
          <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">Checklist Item:</span>
            <select
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              disabled={isScanning}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Checkpoints (5 Photos)</option>
              <option value="toolkit" className="bg-slate-900">Full Toolkit & Bag</option>
              <option value="selfie" className="bg-slate-900">FE Grooming Selfie</option>
              <option value="torches" className="bg-slate-900">Retinoscope & Pen Torch</option>
              <option value="visionChart" className="bg-slate-900">Trial Lens & Chart</option>
              <option value="frameDisplay" className="bg-slate-900">Frame Display Case</option>
            </select>
          </div>

          {/* Task Audit Status */}
          <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-medium">Audit Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={isScanning}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Tasks</option>
              <option value="PENDING" className="bg-slate-900">Pending Audits</option>
              <option value="PASSED" className="bg-slate-900">Passed Audits</option>
              <option value="FATAL" className="bg-slate-900">Fatal Audits</option>
            </select>
          </div>

          {/* Scope count label */}
          <div className="text-slate-500 ml-auto font-mono text-[11px]">
            Target Scope: <strong className="text-slate-300">{filteredTasks.length}</strong> tasks • <strong className="text-slate-300">{imageQueue.length}</strong> checklist photos
          </div>
        </div>
      </div>

      {/* SCANNING PROGRESS BAR (ACTIVE SCAN) */}
      {isScanning && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
              <span className="font-semibold text-slate-200">
                Inspecting checklist images with SHA-256 byte & 64-bit dHash algorithms...
              </span>
            </div>
            <div className="font-mono text-indigo-400 font-bold text-sm">
              {Math.round((scanProgress.current / Math.max(1, scanProgress.total)) * 100)}%
              <span className="text-slate-500 font-normal ml-2 text-xs">
                ({scanProgress.current} / {scanProgress.total})
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div 
              className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-200"
              style={{ width: `${(scanProgress.current / Math.max(1, scanProgress.total)) * 100}%` }}
            />
          </div>

          {/* Current image details */}
          {scanProgress.currentItem && (
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
              <span className="truncate max-w-lg">
                Inspecting: <strong className="text-slate-300">Task #{scanProgress.currentItem.taskId}</strong> • {scanProgress.currentItem.slotLabel} ({scanProgress.currentItem.feName})
              </span>
              <span className="text-indigo-400/80 font-mono">0 Server Overhead (Client-Side)</span>
            </div>
          )}
        </div>
      )}

      {/* TOP KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Scanned Count */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Scanned Images</span>
            <Eye className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {scanResults ? scanResults.scannedCount : 0}
            <span className="text-xs text-slate-500 font-normal ml-1.5">/ {imageQueue.length}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {scanResults ? '< 12 ms per photo' : 'Ready to analyze'}
          </p>
        </div>

        {/* Exact Duplicates */}
        <div className={`border rounded-2xl p-4 shadow-lg ${
          scanResults?.exactClusters?.length > 0 
            ? 'bg-rose-950/20 border-rose-500/40' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Exact Bit Matches</span>
            <Fingerprint className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {scanResults ? scanResults.exactClusters.length : 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            100% SHA-256 byte match
          </p>
        </div>

        {/* Resized / Cropped Clones */}
        <div className={`border rounded-2xl p-4 shadow-lg ${
          scanResults?.perceptualPairs?.length > 0 
            ? 'bg-amber-950/20 border-amber-500/40' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Resized / Clones</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {scanResults ? scanResults.perceptualPairs.length : 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            dHash visual match ≥ 94%
          </p>
        </div>

        {/* Stale EXIF Photos */}
        <div className={`border rounded-2xl p-4 shadow-lg ${
          scanResults?.stalePhotoAlerts?.length > 0 
            ? 'bg-purple-950/20 border-purple-500/40' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Stale Historical</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 font-mono">
            {scanResults ? scanResults.stalePhotoAlerts.length : 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            EXIF capture date mismatch
          </p>
        </div>

        {/* High Risk FEs */}
        <div className={`border rounded-2xl p-4 shadow-lg ${
          scanResults?.summary?.affectedFeCount > 0 
            ? 'bg-slate-900 border-rose-500/40' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Flagged FEs</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {scanResults ? scanResults.summary.affectedFeCount : 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {scanResults ? `${scanResults.summary.affectedTaskCount} tasks impacted` : 'Zero strikes'}
          </p>
        </div>
      </div>

      {/* SCAN RESULTS & CLUSTERS SECTION */}
      {scanResults ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          
          {/* TABS & SEARCH BAR */}
          <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                All Incidents ({scanResults.summary.totalViolations})
              </button>

              <button
                onClick={() => setActiveTab('exact')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'exact'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Exact Duplicates ({scanResults.exactClusters.length})
              </button>

              <button
                onClick={() => setActiveTab('perceptual')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'perceptual'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Resized / Clones ({scanResults.perceptualPairs.length})
              </button>

              <button
                onClick={() => setActiveTab('stale')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'stale'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Stale EXIF ({scanResults.stalePhotoAlerts.length})
              </button>
            </div>

            {/* Collusion toggle & Search */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyCollusion}
                  onChange={(e) => setOnlyCollusion(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
                />
                <span>Only Cross-FE Collusion</span>
              </label>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by Task / FE..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44"
                />
              </div>
            </div>

          </div>

          {/* INCIDENTS LIST */}
          <div className="p-5 space-y-6">
            
            {/* If zero violations found */}
            {scanResults.summary.totalViolations === 0 && (
              <div className="py-16 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white">
                  Zero Image Duplications or Re-use Detected!
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  All {scanResults.scannedCount} checklist photos analyzed for this batch have verified unique cryptographic fingerprints and distinct visual framing.
                </p>
              </div>
            )}

            {/* EXACT DUPLICATES CLUSTERS */}
            {(activeTab === 'all' || activeTab === 'exact') && exactClustersFiltered.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4" />
                    Exact Bit-for-Bit Duplicate Clusters ({exactClustersFiltered.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">100% Cryptographic SHA-256 Match</span>
                </div>

                <div className="space-y-4">
                  {exactClustersFiltered.map((cluster) => (
                    <div 
                      key={cluster.id} 
                      className="bg-slate-950/80 border border-rose-500/30 rounded-2xl p-5 space-y-4 shadow-lg shadow-rose-950/10"
                    >
                      {/* Cluster Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              🚨 EXACT FILE RE-UPLOAD
                            </span>
                            {cluster.isCrossFE ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                Cross-FE Collusion ({cluster.feCount} FEs)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                Single FE Recycling ({cluster.taskCount} Visits)
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                            <span>SHA-256: <strong className="text-slate-300 select-all">{cluster.sha256}</strong></span>
                            <button
                              onClick={() => handleCopy(cluster.sha256, cluster.id)}
                              className="text-slate-500 hover:text-slate-300"
                            >
                              {copiedKey === cluster.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        {/* Cluster Action */}
                        <button
                          onClick={() => handleMarkClusterFatal(cluster)}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow transition-all flex items-center gap-1.5 shrink-0"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Apply Fatal Strike to All {cluster.taskCount} Tasks
                        </button>
                      </div>

                      {/* Items Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        {cluster.items.map((it) => (
                          <div 
                            key={it.id} 
                            className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2.5"
                          >
                            <div className="relative rounded-lg overflow-hidden bg-slate-950 aspect-video group">
                              <img
                                src={it.url}
                                alt={it.slotLabel}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                                onClick={() => setPreviewModalImage({ url: it.url, title: `${it.slotLabel} (Task #${it.taskId})` })}
                              />
                              <button
                                onClick={() => setPreviewModalImage({ url: it.url, title: `${it.slotLabel} (Task #${it.taskId})` })}
                                className="absolute top-1.5 right-1.5 p-1 bg-slate-900/80 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                              <div className="absolute bottom-1 left-1 bg-slate-900/90 text-[10px] text-slate-300 px-1.5 py-0.5 rounded font-medium">
                                {it.slotLabel}
                              </div>
                            </div>

                            <div className="space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white font-mono">Task #{it.taskId}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                  it.task?.auditStatus === 'FATAL' 
                                    ? 'bg-rose-500/20 text-rose-400' 
                                    : it.task?.auditStatus === 'PASSED'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {it.task?.auditStatus || 'PENDING'}
                                </span>
                              </div>
                              <div className="text-slate-300 truncate font-medium">
                                {it.feName} <span className="text-slate-500 font-mono">({it.feCode})</span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                <span>{it.city}</span>
                                <span>{it.date}</span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                              {onInspectTask && (
                                <button
                                  onClick={() => onInspectTask(it.task)}
                                  className="flex-1 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-center transition-colors"
                                >
                                  Inspect Task
                                </button>
                              )}
                              <button
                                onClick={() => handleMarkTaskFatal(it.taskId, `Exact duplicate ${it.slotLabel}`)}
                                className="py-1 px-2 text-[11px] font-bold text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                title="Strike this task"
                              >
                                Fatal
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PERCEPTUAL CLONES / RESIZED / CROPPED PAIRS */}
            {(activeTab === 'all' || activeTab === 'perceptual') && perceptualPairsFiltered.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    Resized / Screenshotted Perceptual Clones ({perceptualPairsFiltered.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">dHash Visual Similarity ≥ 94%</span>
                </div>

                <div className="space-y-4">
                  {perceptualPairsFiltered.map((pair) => (
                    <div 
                      key={pair.id} 
                      className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-lg shadow-amber-950/10"
                    >
                      {/* Pair Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              {pair.title}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 font-mono">
                              {pair.similarityPct}% Visual Match (Hamming: {pair.hammingDistance}/64)
                            </span>
                            {pair.isCrossFE && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                Cross-FE Collusion
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {pair.recommendation}
                          </p>
                        </div>

                        <button
                          onClick={() => handleMarkPairFatal(pair)}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow transition-all flex items-center gap-1.5 shrink-0"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Mark Both Tasks as Fatal Strike
                        </button>
                      </div>

                      {/* Side-by-side comparison */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Image A */}
                        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-4">
                          <div className="w-36 h-28 bg-slate-950 rounded-lg overflow-hidden shrink-0 relative group">
                            <img
                              src={pair.itemA.url}
                              alt="Item A"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform cursor-pointer"
                              onClick={() => setPreviewModalImage({ url: pair.itemA.url, title: `Task #${pair.itemA.taskId}` })}
                            />
                            <button
                              onClick={() => setPreviewModalImage({ url: pair.itemA.url, title: `Task #${pair.itemA.taskId}` })}
                              className="absolute top-1 right-1 p-1 bg-slate-900/80 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="space-y-1.5 text-xs flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white font-mono">Task #{pair.itemA.taskId}</span>
                              <span className="text-[10px] font-medium text-slate-400">{pair.itemA.slotLabel}</span>
                            </div>
                            <div className="text-slate-300 font-medium">
                              {pair.itemA.feName} <span className="text-slate-500 font-mono">({pair.itemA.feCode})</span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {pair.itemA.city} • {pair.itemA.date}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              dHash: {pair.itemA.dHash?.hashHex || 'N/A'} • {pair.itemA.width}x{pair.itemA.height}px
                            </div>
                            {onInspectTask && (
                              <button
                                onClick={() => onInspectTask(pair.itemA.task)}
                                className="mt-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                              >
                                Open Task In Audit Console <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Image B */}
                        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-4">
                          <div className="w-36 h-28 bg-slate-950 rounded-lg overflow-hidden shrink-0 relative group">
                            <img
                              src={pair.itemB.url}
                              alt="Item B"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform cursor-pointer"
                              onClick={() => setPreviewModalImage({ url: pair.itemB.url, title: `Task #${pair.itemB.taskId}` })}
                            />
                            <button
                              onClick={() => setPreviewModalImage({ url: pair.itemB.url, title: `Task #${pair.itemB.taskId}` })}
                              className="absolute top-1 right-1 p-1 bg-slate-900/80 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="space-y-1.5 text-xs flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white font-mono">Task #{pair.itemB.taskId}</span>
                              <span className="text-[10px] font-medium text-slate-400">{pair.itemB.slotLabel}</span>
                            </div>
                            <div className="text-slate-300 font-medium">
                              {pair.itemB.feName} <span className="text-slate-500 font-mono">({pair.itemB.feCode})</span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {pair.itemB.city} • {pair.itemB.date}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              dHash: {pair.itemB.dHash?.hashHex || 'N/A'} • {pair.itemB.width}x{pair.itemB.height}px
                            </div>
                            {onInspectTask && (
                              <button
                                onClick={() => onInspectTask(pair.itemB.task)}
                                className="mt-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                              >
                                Open Task In Audit Console <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STALE PHOTOS DATE MISMATCH */}
            {(activeTab === 'all' || activeTab === 'stale') && stalePhotosFiltered.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Stale Historical Photos (EXIF Date Mismatch) ({stalePhotosFiltered.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">Photo taken before scheduled dispatch</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stalePhotosFiltered.map((stale) => (
                    <div 
                      key={stale.id} 
                      className="bg-slate-950/80 border border-purple-500/30 rounded-2xl p-4 flex items-start gap-4 shadow-lg shadow-purple-950/10"
                    >
                      <div className="w-32 h-28 bg-slate-900 rounded-xl overflow-hidden shrink-0 relative group">
                        <img
                          src={stale.item.url}
                          alt="Stale photo"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform cursor-pointer"
                          onClick={() => setPreviewModalImage({ url: stale.item.url, title: `Task #${stale.item.taskId}` })}
                        />
                        <button
                          onClick={() => setPreviewModalImage({ url: stale.item.url, title: `Task #${stale.item.taskId}` })}
                          className="absolute top-1 right-1 p-1 bg-slate-900/80 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="space-y-1.5 text-xs flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white font-mono">Task #{stale.item.taskId}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                            {stale.item.slotLabel}
                          </span>
                        </div>

                        <div className="text-slate-300 font-medium">
                          {stale.item.feName} <span className="text-slate-500 font-mono">({stale.item.feCode})</span>
                        </div>

                        <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-0.5 text-[11px]">
                          <div className="text-purple-300 font-medium">
                            Camera Captured: <strong className="font-mono">{stale.exifDate}</strong>
                          </div>
                          <div className="text-slate-400">
                            Visit Scheduled: <strong className="font-mono text-slate-300">{stale.taskDate}</strong>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Hardware: {stale.cameraModel}
                          </div>
                        </div>

                        <div className="pt-2 flex items-center justify-between">
                          {onInspectTask && (
                            <button
                              onClick={() => onInspectTask(stale.item.task)}
                              className="text-[11px] text-slate-300 hover:text-white"
                            >
                              Inspect Task
                            </button>
                          )}
                          <button
                            onClick={() => handleMarkTaskFatal(stale.item.taskId, 'Stale historical photo')}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white"
                          >
                            Mark Fatal
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      ) : (
        /* PRE-SCAN IDLE STATE */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">
              Ready to Scan {imageQueue.length} Checklist Photos
            </h2>
            <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
              Click <strong className="text-indigo-300">"Run Anti-Fraud Forensics Scan"</strong> above. 
              The system will extract cryptographic fingerprints and perceptual hashes for all checklist photos in the selected batch, 
              instantly highlighting duplicate uploads, screenshot reuse, and cross-FE collusion.
            </p>
          </div>
          <button
            onClick={handleStartScan}
            disabled={imageQueue.length === 0}
            className="px-6 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all inline-flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-white" />
            Start Batch Forensics Scan ({imageQueue.length} Photos)
          </button>
        </div>
      )}

      {/* FULL RESOLUTION LIGHTBOX MODAL */}
      {previewModalImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
          onClick={() => setPreviewModalImage(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">{previewModalImage.title}</span>
              <button
                onClick={() => setPreviewModalImage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center bg-black/50 min-h-[300px]">
              <img
                src={previewModalImage.url}
                alt="Full resolution preview"
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
