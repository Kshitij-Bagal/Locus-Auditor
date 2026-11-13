import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Fingerprint, 
  Play, 
  Pause,
  Square, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Download, 
  Eye, 
  Layers, 
  ShieldAlert, 
  ShieldCheck,
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
  Search,
  Sliders,
  Moon,
  Zap,
  Database
} from 'lucide-react';
import { 
  extractTaskImageItems, 
  runBatchForensicScan,
  runPrecomputedFingerprintScan
} from '../utils/imageForensics.js';
import { fingerprintsApi } from '../api/client.js';

function formatEta(seconds) {
  if (!seconds || seconds <= 0) return 'Calculating...';
  if (seconds < 60) return `~${seconds}s remaining`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `~${hours}h ${remMins}m remaining`;
  }
  return `~${mins}m ${secs}s remaining`;
}

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

  // Selected filters & Examination Criteria
  const [selectedDate, setSelectedDate] = useState(() => availableDates[0] || 'ALL');
  const [selectedSlot, setSelectedSlot] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyCollusion, setOnlyCollusion] = useState(false);
  
  // Readjusted Examination Sensitivity (Hamming distance threshold):
  // 2 = Strict High-Confidence (Zero False Positives, requires same slot + ambient color match >= 88%)
  // 3 = Balanced (Captures slight crops & minor zoom by same FE)
  // 4 = Relaxed (Captures angle & lighting shifts)
  const [sensitivity, setSensitivity] = useState(2);

  // Anti-429 Pacing Mode (0.5s - 1.0s random interval by default)
  const [pacingMode, setPacingMode] = useState('stealth'); // 'stealth' (0.5s-1.0s) | 'ultrasafe' (1.0s-2.0s) | 'deep' (2.0s-3.0s)

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [scanProgress, setScanProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentItem: null,
    intervalMs: 750,
    etaSeconds: 0,
    coolingDown: false,
    cooldownSec: 0,
    attempt: 1,
    maxAttempts: 5,
    message: null,
    isPaused: false
  });
  const [scanResults, setScanResults] = useState(null);
  const abortControllerRef = useRef(null);
  const pauseSignalRef = useRef({ isPaused: false });

  // Cloud Fingerprint Ledger Integration
  const [cloudStats, setCloudStats] = useState({ total: 0 });
  const [isCloudScanning, setIsCloudScanning] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fingerprintsApi.getFingerprintStats().then(stats => {
      if (isMounted) setCloudStats(stats);
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // UI state: 'all' | 'blank' | 'exact' | 'perceptual' | 'stale'
  const [activeTab, setActiveTab] = useState('all');
  const [previewModalImage, setPreviewModalImage] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null);

  // Filter tasks based on selected scope
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (selectedDate !== 'ALL') {
        const taskDate = (t.date || t.dispatch_date || '').split(' ')[0];
        if (taskDate !== selectedDate) return false;
      }
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
    setIsPaused(false);
    pauseSignalRef.current.isPaused = false;
    setScanProgress({ 
      current: 0, 
      total: imageQueue.length, 
      currentItem: null,
      intervalMs: 750,
      etaSeconds: 0,
      coolingDown: false,
      cooldownSec: 0,
      attempt: 1,
      maxAttempts: 5,
      message: null,
      isPaused: false
    });
    setScanResults(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const pacingConfig = {
      stealth: { min: 500, max: 1000 },
      ultrasafe: { min: 1000, max: 2000 },
      deep: { min: 2000, max: 3000 }
    }[pacingMode] || { min: 500, max: 1000 };

    try {
      const results = await runBatchForensicScan(
        imageQueue,
        (prog) => {
          setScanProgress({
            current: prog.current,
            total: prog.total,
            currentItem: prog.item,
            intervalMs: prog.intervalMs,
            etaSeconds: prog.etaSeconds,
            coolingDown: prog.coolingDown,
            cooldownSec: prog.cooldownSec,
            attempt: prog.attempt,
            maxAttempts: prog.maxAttempts,
            message: prog.message,
            isPaused: prog.isPaused
          });
        },
        abortController.signal,
        { 
          maxHamming: Number(sensitivity),
          minIntervalMs: pacingConfig.min,
          maxIntervalMs: pacingConfig.max,
          pauseSignal: pauseSignalRef.current
        }
      );

      setScanResults(results);
    } catch (err) {
      console.error('Batch scan failed:', err);
      alert('Forensics scan encountered an issue: ' + err.message);
    } finally {
      setIsScanning(false);
      setIsPaused(false);
      abortControllerRef.current = null;
    }
  };

  // Handle Toggle Pause / Resume
  const handleTogglePause = () => {
    const nextState = !isPaused;
    setIsPaused(nextState);
    pauseSignalRef.current.isPaused = nextState;
  };

  // Handle stop scan
  const handleStopScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsScanning(false);
      setIsPaused(false);
    }
  };

  // Handle Instant Sub-Second Cloud Ledger Scan
  const handleCloudLedgerScan = async () => {
    setIsCloudScanning(true);
    try {
      const fingerprints = await fingerprintsApi.getFingerprints({
        date: selectedDate === 'ALL' ? null : selectedDate,
        stationId: selectedSlot === 'ALL' ? null : selectedSlot,
        limit: 15000
      });

      if (!fingerprints || fingerprints.length === 0) {
        alert(
          'No image fingerprints found in Supabase for the selected filter.\n\n' +
          'To pre-compute fingerprints for all tasks without freezing your browser:\n' +
          '1. Run the terminal batch harvester: node scripts/harvest_image_fingerprints.cjs\n' +
          '2. Or run the live in-browser scan below.'
        );
        return;
      }

      const results = runPrecomputedFingerprintScan(fingerprints, tasks, {
        maxHamming: Number(sensitivity)
      });

      setScanResults(results);
    } catch (err) {
      console.error('Cloud ledger scan failed:', err);
      alert('Cloud ledger scan failed: ' + err.message);
    } finally {
      setIsCloudScanning(false);
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
  const handleMarkTaskFatal = async (taskId, reasonText, violationCategory = 'Duplicate / recycled images detected') => {
    if (!onFatalTask) return;
    const confirm = window.confirm(`Mark Task #${taskId} as FATAL for "${reasonText}"?`);
    if (!confirm) return;

    await onFatalTask(taskId, {
      reasons: [violationCategory],
      remarks: `FATAL: Image Forensics Engine flagged fraudulent submission (${reasonText}).`,
      location: currentUser?.facility_code || 'Central Forensics Lab'
    });

    setActionSuccessMessage(`Task #${taskId} successfully struck as FATAL.`);
    setTimeout(() => setActionSuccessMessage(null), 3500);
  };

  // One-click enforcement: Mark all Blank / Black tasks as FATAL in one batch
  const handleMarkAllBlankFatal = async () => {
    if (!onFatalTask || !scanResults?.blankOrBlackPhotos?.length) return;
    const taskIds = Array.from(new Set(scanResults.blankOrBlackPhotos.map(b => b.item.taskId)));
    const confirm = window.confirm(
      `Mark all ${taskIds.length} tasks with Blank / Black / Covered Camera photos as FATAL?\n\nTasks: ${taskIds.join(', ')}`
    );
    if (!confirm) return;

    for (const tid of taskIds) {
      await onFatalTask(tid, {
        reasons: ['All images missing / blank / black'],
        remarks: 'FATAL: Image Forensics detected fraudulent blank / pure black / covered camera photo upload.',
        location: currentUser?.facility_code || 'Central Forensics Lab'
      });
    }

    setActionSuccessMessage(`All ${taskIds.length} tasks with blank/black photos struck as FATAL.`);
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
      ['Incident Type', 'Severity', 'Task ID', 'FE Name', 'FE Code', 'City', 'Visit Date', 'Checklist Slot', 'Similarity / Diagnostics', 'Hash / Details', 'Recommendation']
    ];

    // Blank / Black photos
    scanResults.blankOrBlackPhotos.forEach(b => {
      rows.push([
        'FRAUDULENT_BLANK_OR_BLACK',
        b.severity,
        b.item.taskId,
        b.item.feName,
        b.item.feCode,
        b.item.city,
        b.item.date,
        b.item.slotLabel,
        b.reason,
        b.item.url,
        b.recommendation
      ]);
    });

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
          '100% Byte Match',
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
        `${p.similarityPct}% Match (Hamming ${p.hammingDistance})`,
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
        `${p.similarityPct}% Match (Hamming ${p.hammingDistance})`,
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
        'Date Mismatch',
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
  const blankPhotosFiltered = useMemo(() => {
    if (!scanResults) return [];
    let list = scanResults.blankOrBlackPhotos || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => 
        b.item.taskId.toLowerCase().includes(q) || 
        b.item.feName.toLowerCase().includes(q) || 
        b.item.feCode.toLowerCase().includes(q)
      );
    }
    return list;
  }, [scanResults, searchQuery]);

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

  const perceptualClustersFiltered = useMemo(() => {
    if (!scanResults) return [];
    let list = scanResults.perceptualClusters || [];
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
                Readjusted Criteria Active
              </span>
            </div>
            <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
              Automated anti-fraud engine for audit checklist photos. Analyzes content integrity for 
              <strong className="text-rose-300"> blank/black/covered camera photos</strong>, 
              <strong className="text-slate-200"> exact byte duplicates (SHA-256)</strong>, 
              <strong className="text-slate-200"> resized/cropped clones (dHash)</strong>, and 
              <strong className="text-slate-200"> cross-FE collusion</strong>.
            </p>
          </div>

          {/* MAIN ONE-CLICK SCAN BUTTON & CONTROLS */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {isScanning ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTogglePause}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 transition-all flex items-center gap-2"
                >
                  {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4" />}
                  {isPaused ? 'Resume Scan' : 'Pause Scan'}
                </button>
                <button
                  onClick={handleStopScan}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 animate-pulse"
                >
                  <Square className="w-4 h-4 fill-white" />
                  Stop Scan ({scanProgress.current}/{scanProgress.total})
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCloudLedgerScan}
                  disabled={isCloudScanning || isScanning}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2"
                  title="Sub-second scan using pre-computed hashes from Supabase ledger"
                >
                  <Zap className={`w-4 h-4 fill-white ${isCloudScanning ? 'animate-spin' : ''}`} />
                  {isCloudScanning ? 'Querying Cloud Ledger...' : 'Scan Cloud Fingerprints (Instant)'}
                  {cloudStats.total > 0 && (
                    <span className="bg-white/20 px-2 py-0.5 rounded-md font-mono text-[11px]">
                      {cloudStats.total.toLocaleString()} Synced
                    </span>
                  )}
                </button>

                <button
                  onClick={handleStartScan}
                  disabled={imageQueue.length === 0 || isCloudScanning}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 shadow-sm transition-all flex items-center gap-2"
                  title="Live deep scan downloading images in browser"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-300" />
                  Live In-Browser Scan ({imageQueue.length})
                </button>
              </div>
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

        {/* SCOPE FILTERS & EXAMINATION CRITERIA CONTROLS */}
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

          {/* Anti-429 Pacing Interval Selector */}
          <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-emerald-500/30">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300 font-medium">Anti-429 Pacing:</span>
            <select
              value={pacingMode}
              onChange={(e) => setPacingMode(e.target.value)}
              disabled={isScanning}
              className="bg-transparent text-emerald-300 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="stealth" className="bg-slate-900">Stealth (0.5s - 1.0s random delay) [Default]</option>
              <option value="ultrasafe" className="bg-slate-900">Ultra-Safe (1.0s - 2.0s random delay)</option>
              <option value="deep" className="bg-slate-900">Deep Pacing (2.0s - 3.0s random delay)</option>
            </select>
          </div>

          {/* Readjusted Sensitivity Selector */}
          <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-indigo-500/30">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-300 font-medium">Deduplication Sensitivity:</span>
            <select
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              disabled={isScanning}
              className="bg-transparent text-indigo-300 font-semibold focus:outline-none cursor-pointer"
            >
              <option value={2} className="bg-slate-900">Strict High-Confidence (Zero False Alarms) [Recommended]</option>
              <option value={3} className="bg-slate-900">Balanced (Same FE Reuse & Minor Zoom)</option>
              <option value={4} className="bg-slate-900">Relaxed (Angle & Lighting Shifts)</option>
            </select>
          </div>

          {/* Scope count label */}
          <div className="text-slate-500 ml-auto font-mono text-[11px]">
            Target Scope: <strong className="text-slate-300">{filteredTasks.length}</strong> tasks • <strong className="text-slate-300">{imageQueue.length}</strong> checklist photos
          </div>
        </div>
      </div>

      {/* SCANNING PROGRESS BAR (ACTIVE SCAN HUD) */}
      {isScanning && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-5 shadow-2xl space-y-3.5 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <RefreshCw className={`w-4 h-4 text-indigo-400 ${isPaused ? '' : 'animate-spin'}`} />
              <span className="font-semibold text-slate-200">
                {isPaused ? 'Scan Paused' : 'Inspecting photos for blank screens, covered lenses, and duplicates...'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Stealth Mode ({pacingMode === 'stealth' ? '0.5s - 1.0s' : pacingMode === 'ultrasafe' ? '1.0s - 2.0s' : '2.0s - 3.0s'} interval)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                {formatEta(scanProgress.etaSeconds)}
              </span>
              <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                {scanProgress.intervalMs || 750}ms pacing
              </span>
              <div className="font-mono text-indigo-400 font-bold text-sm">
                {Math.round((scanProgress.current / Math.max(1, scanProgress.total)) * 100)}%
                <span className="text-slate-500 font-normal ml-1.5 text-xs">
                  ({scanProgress.current} / {scanProgress.total})
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div 
              className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-full transition-all duration-200"
              style={{ width: `${(scanProgress.current / Math.max(1, scanProgress.total)) * 100}%` }}
            />
          </div>

          {/* Cooldown Alert Banner (If 429 encountered) */}
          {scanProgress.coolingDown && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-200 animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Locus WAF 429 Rate Limit Encountered:</strong> Pausing for {scanProgress.cooldownSec}s before retrying this exact photo (Attempt {scanProgress.attempt}/{scanProgress.maxAttempts}).
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                Zero Compromise Guarantee: No Photos Skipped
              </span>
            </div>
          )}

          {/* Paused Banner */}
          {isPaused && (
            <div className="p-3 bg-blue-950/40 border border-blue-500/50 rounded-xl flex items-center gap-2 text-xs text-blue-200">
              <Clock className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Scan paused. Click <strong>"Resume Scan"</strong> to continue processing checklist photos.</span>
            </div>
          )}

          {scanProgress.currentItem && (
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-0.5">
              <span className="truncate max-w-lg">
                Inspecting: <strong className="text-slate-300">Task #{scanProgress.currentItem.taskId}</strong> • {scanProgress.currentItem.slotLabel} ({scanProgress.currentItem.feName})
              </span>
              <span className="text-emerald-400/90 font-mono">Sequential Pacing Active</span>
            </div>
          )}
        </div>
      )}

      {/* TOP KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        
        {/* Blank / Black Photos (High-Priority Fraud Indicator) */}
        <div className={`border rounded-2xl p-4 shadow-lg transition-all ${
          scanResults?.blankOrBlackPhotos?.length > 0 
            ? 'bg-rose-950/30 border-rose-500/50 shadow-rose-950/20 ring-1 ring-rose-500/30' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-rose-400" />
              Blank / Black Photos
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {scanResults ? scanResults.blankOrBlackPhotos.length : 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Covered lens / zero evidence
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
          (scanResults?.perceptualClusters?.length > 0 || scanResults?.perceptualPairs?.length > 0)
            ? 'bg-amber-950/20 border-amber-500/40' 
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Reused Photo Incidents</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {scanResults ? (scanResults.perceptualClusters?.length ?? scanResults.perceptualPairs?.length ?? 0) : 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Same-slot photo recycling
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
                onClick={() => setActiveTab('blank')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'blank'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-rose-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Blank / Black Photos ({scanResults.blankOrBlackPhotos.length})
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
                Reused Photos ({scanResults.perceptualClusters?.length ?? scanResults.perceptualPairs?.length ?? 0})
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
                  Zero Image Duplications or Blank Uploads Detected!
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  All {scanResults.scannedCount} checklist photos analyzed for this batch have verified unique photographic content and proper equipment evidence.
                </p>
              </div>
            )}

            {/* SECTION: FRAUDULENT BLANK / BLACK / COVERED CAMERA PHOTOS */}
            {(activeTab === 'all' || activeTab === 'blank') && blankPhotosFiltered.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40">
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-rose-400" />
                    <div>
                      <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                        Fraudulent Blank / Black / Covered Camera Photos ({blankPhotosFiltered.length})
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Zero equipment evidence uploaded: Camera was covered, obscured, or pure black/blank image submitted
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleMarkAllBlankFatal}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Mark All {blankPhotosFiltered.length} as FATAL Strike
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {blankPhotosFiltered.map((b) => (
                    <div 
                      key={b.id} 
                      className="bg-slate-950 border border-rose-500/40 rounded-xl p-3 flex flex-col justify-between space-y-2.5 shadow-lg shadow-rose-950/20"
                    >
                      <div className="relative rounded-lg overflow-hidden bg-black aspect-video group border border-rose-900/50">
                        <img
                          src={b.item.objectUrl || b.item.url}
                          alt="Blank/Black preview"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setPreviewModalImage({ url: b.item.objectUrl || b.item.url, title: `Blank Photo (Task #${b.item.taskId})` })}
                        />
                        <button
                          onClick={() => setPreviewModalImage({ url: b.item.objectUrl || b.item.url, title: `Blank Photo (Task #${b.item.taskId})` })}
                          className="absolute top-1.5 right-1.5 p-1 bg-slate-900/80 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="absolute top-1 left-1 bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                          BLANK / BLACK
                        </div>
                        <div className="absolute bottom-1 left-1 bg-slate-900/90 text-[10px] text-slate-300 px-1.5 py-0.5 rounded font-medium">
                          {b.item.slotLabel}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white font-mono">Task #{b.item.taskId}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-rose-500/20 text-rose-400">
                            {b.item.task?.auditStatus || 'PENDING'}
                          </span>
                        </div>
                        <div className="text-slate-300 truncate font-medium">
                          {b.item.feName} <span className="text-slate-500 font-mono">({b.item.feCode})</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center justify-between">
                          <span>{b.item.city}</span>
                          <span>{b.item.date}</span>
                        </div>
                        <div className="p-1.5 rounded bg-rose-950/30 border border-rose-500/30 text-[10px] text-rose-300 font-mono">
                          {b.reason}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                        {onInspectTask && (
                          <button
                            onClick={() => onInspectTask(b.item.task)}
                            className="flex-1 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-center transition-colors"
                          >
                            Inspect Task
                          </button>
                        )}
                        <button
                          onClick={() => handleMarkTaskFatal(b.item.taskId, b.reason, 'All images missing / blank / black')}
                          className="py-1 px-2.5 text-[11px] font-bold text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
                          title="Strike this task as Fatal"
                        >
                          Fatal
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION: EXACT DUPLICATES CLUSTERS */}
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
                                src={it.objectUrl || it.url}
                                alt={it.slotLabel}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                                onClick={() => setPreviewModalImage({ url: it.objectUrl || it.url, title: `${it.slotLabel} (Task #${it.taskId})` })}
                              />
                              <button
                                onClick={() => setPreviewModalImage({ url: it.objectUrl || it.url, title: `${it.slotLabel} (Task #${it.taskId})` })}
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

            {/* SECTION: REUSED PHOTO CLUSTERS / PERCEPTUAL CLONES */}
            {(activeTab === 'all' || activeTab === 'perceptual') && (perceptualClustersFiltered.length > 0 || perceptualPairsFiltered.length > 0) && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    High-Confidence Reused Photo Incidents ({perceptualClustersFiltered.length || perceptualPairsFiltered.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Same-Slot Verification • Ambient Color Match ≥ 88%
                  </span>
                </div>

                <div className="space-y-4">
                  {perceptualClustersFiltered.length > 0 ? (
                    perceptualClustersFiltered.map((cluster) => (
                      <div 
                        key={cluster.id} 
                        className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-lg shadow-amber-950/10"
                      >
                        {/* Cluster Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                📸 REUSED PHOTO
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                                {cluster.slotLabel}
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
                            <p className="text-xs text-slate-400">
                              {cluster.recommendation}
                            </p>
                          </div>

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
                                  src={it.objectUrl || it.url}
                                  alt={it.slotLabel}
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                                  onClick={() => setPreviewModalImage({ url: it.objectUrl || it.url, title: `${it.slotLabel} (Task #${it.taskId})` })}
                                />
                                <button
                                  onClick={() => setPreviewModalImage({ url: it.objectUrl || it.url, title: `${it.slotLabel} (Task #${it.taskId})` })}
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
                                  onClick={() => handleMarkTaskFatal(it.taskId, `Reused ${it.slotLabel} photo across visits`)}
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
                    ))
                  ) : (
                    /* Fallback to pairs if only pairs exist */
                    perceptualPairsFiltered.map((pair) => (
                      <div 
                        key={pair.id} 
                        className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-lg shadow-amber-950/10"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                {pair.title}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 font-mono">
                                {pair.similarityPct}% Visual Match
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">
                              {pair.reason || pair.recommendation}
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
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* SECTION: STALE PHOTOS DATE MISMATCH */}
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
                          src={stale.item.objectUrl || stale.item.url}
                          alt="Stale photo"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform cursor-pointer"
                          onClick={() => setPreviewModalImage({ url: stale.item.objectUrl || stale.item.url, title: `Task #${stale.item.taskId}` })}
                        />
                        <button
                          onClick={() => setPreviewModalImage({ url: stale.item.objectUrl || stale.item.url, title: `Task #${stale.item.taskId}` })}
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
              Use <strong className="text-emerald-300">"Scan Cloud Fingerprints (Instant)"</strong> to cross-examine 
              all tasks in sub-second time using pre-computed hashes from Supabase, or run a live in-browser scan.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={handleCloudLedgerScan}
              disabled={isCloudScanning}
              className="px-6 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 transition-all inline-flex items-center gap-2"
            >
              <Zap className={`w-4 h-4 fill-white ${isCloudScanning ? 'animate-spin' : ''}`} />
              {isCloudScanning ? 'Analyzing Cloud Ledger...' : 'Scan Cloud Fingerprints (Instant Sub-Second)'}
              {cloudStats.total > 0 && (
                <span className="bg-white/20 px-2 py-0.5 rounded-md font-mono text-[11px]">
                  {cloudStats.total.toLocaleString()} Synced
                </span>
              )}
            </button>
            <button
              onClick={handleStartScan}
              disabled={imageQueue.length === 0}
              className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-all inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-slate-300" />
              Live In-Browser Scan ({imageQueue.length} Photos)
            </button>
          </div>
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
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
