import React, { useState, useRef, useMemo } from 'react';
import {
  FlaskConical,
  Upload,
  Sparkles,
  Play,
  Square,
  Trash2,
  Plus,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Maximize2,
  X,
  Loader2,
  ShieldAlert,
  RotateCcw,
  DatabaseZap,
  Image as ImageIcon
} from 'lucide-react';
import {
  getTodayYMD,
  prepareUploadedTestImage,
  evaluateGroomingWithAi,
  resolveGroomingAiCredentials
} from '../utils/groomingAiHelper.js';
import { parseRoles, normalizeRoleName } from '../utils/accessHelper.js';

const CRITERIA_LABELS = [
  { group: 'upper', key: 'uniform', label: '1. Solid Lenskart Polo' },
  { group: 'upper', key: 'idCard', label: '2. ID Card & Lanyard' },
  { group: 'upper', key: 'hairGrooming', label: '3. Hair Grooming' },
  { group: 'upper', key: 'facialHair', label: '4. Facial Hair' },
  { group: 'lower', key: 'jeans', label: '5. Dark Blue Jeans Only (Unfaded)' },
  { group: 'lower', key: 'shoes', label: '6. Plain Black Shoes + Black Laces' }
];

export default function FEGroomingTestBench({ currentUser, sharedAiConfig = null }) {
  const userRoles = parseRoles(currentUser?.roles || [currentUser?.role]);
  const isSuperAdmin =
    userRoles.some(r => normalizeRoleName(r) === 'SuperAdmin') ||
    normalizeRoleName(currentUser?.role) === 'SuperAdmin';

  const upperPoolInputRef = useRef(null);
  const lowerPoolInputRef = useRef(null);

  // Pools strictly held in browser RAM — never saved to Supabase or localStorage
  const [upperPool, setUpperPool] = useState([]);
  const [lowerPool, setLowerPool] = useState([]);
  const [combos, setCombos] = useState([]);

  const [ignoreWatermark, setIgnoreWatermark] = useState(true);
  const [burnSyntheticStamp, setBurnSyntheticStamp] = useState(false);

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [runningComboId, setRunningComboId] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [bannerError, setBannerError] = useState('');

  const stopSignalRef = useRef(false);

  const activeCreds = useMemo(
    () => resolveGroomingAiCredentials(sharedAiConfig),
    [sharedAiConfig]
  );

  if (!isSuperAdmin) {
    return (
      <div className="bg-red-950/30 border border-red-500/40 rounded-2xl p-6 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
        <h3 className="text-sm font-black text-white">SuperAdmin Access Required</h3>
        <p className="text-xs text-slate-400">
          The Multi-Image AI Grooming Test Bench is restricted to SuperAdmin accounts.
        </p>
      </div>
    );
  }

  const processUploadFiles = async (fileList, side) => {
    setBannerError('');
    const files = Array.from(fileList || []).filter(f => f.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(f.name));
    if (files.length === 0) return;

    const prepared = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const meta = burnSyntheticStamp
          ? {
              feName: 'QA Test Sample',
              feCode: 'TEST01',
              stationLabel: side === 'upper' ? 'UPPER TEST' : 'LOWER TEST'
            }
          : null;
        const img = await prepareUploadedTestImage(f, meta);
        prepared.push({
          id: `${side}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: f.name,
          dataUrl: img.dataUrl,
          timestampStr: img.timestampStr,
          nonce: img.nonce,
          stamped: Boolean(meta)
        });
      } catch (err) {
        setBannerError(`Skipped "${f.name}": ${err.message}`);
      }
    }

    if (side === 'upper') {
      setUpperPool(prev => [...prev, ...prepared]);
    } else {
      setLowerPool(prev => [...prev, ...prepared]);
    }
  };

  const handleBuildAllCombos = () => {
    setBannerError('');
    if (upperPool.length === 0 && lowerPool.length === 0) {
      setBannerError('Upload at least one Upper Body or Lower Body photo first.');
      return;
    }

    const next = [];
    if (upperPool.length > 0 && lowerPool.length > 0) {
      upperPool.forEach((u, uIdx) => {
        lowerPool.forEach((l, lIdx) => {
          next.push({
            id: `combo_${Date.now()}_${uIdx}_${lIdx}_${Math.random().toString(36).slice(2, 6)}`,
            label: `Combo #${next.length + 1}: ${u.name} + ${l.name}`,
            upper: u,
            lower: l,
            status: 'PENDING',
            result: null,
            error: null
          });
        });
      });
    } else if (upperPool.length > 0) {
      upperPool.forEach((u, idx) => {
        next.push({
          id: `combo_${Date.now()}_u_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          label: `Upper-Only #${idx + 1}: ${u.name}`,
          upper: u,
          lower: null,
          status: 'PENDING',
          result: null,
          error: null
        });
      });
    } else {
      lowerPool.forEach((l, idx) => {
        next.push({
          id: `combo_${Date.now()}_l_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          label: `Lower-Only #${idx + 1}: ${l.name}`,
          upper: null,
          lower: l,
          status: 'PENDING',
          result: null,
          error: null
        });
      });
    }

    setCombos(prev => [...prev, ...next]);
  };

  const handlePairOneToOne = () => {
    setBannerError('');
    const maxLen = Math.max(upperPool.length, lowerPool.length);
    if (maxLen === 0) {
      setBannerError('Upload Upper and/or Lower photos first.');
      return;
    }
    const next = [];
    for (let i = 0; i < maxLen; i++) {
      const u = upperPool[i] || null;
      const l = lowerPool[i] || null;
      next.push({
        id: `pair_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        label: `Pair #${i + 1}: ${u?.name || 'No Upper'} + ${l?.name || 'No Lower'}`,
        upper: u,
        lower: l,
        status: 'PENDING',
        result: null,
        error: null
      });
    }
    setCombos(prev => [...prev, ...next]);
  };

  const handleUploadMatchedPairRow = async (upperFile, lowerFile) => {
    const [uRes, lRes] = await Promise.all([
      upperFile
        ? prepareUploadedTestImage(
            upperFile,
            burnSyntheticStamp ? { feName: 'QA Pair', feCode: 'TEST', stationLabel: 'UPPER TEST' } : null
          )
        : null,
      lowerFile
        ? prepareUploadedTestImage(
            lowerFile,
            burnSyntheticStamp ? { feName: 'QA Pair', feCode: 'TEST', stationLabel: 'LOWER TEST' } : null
          )
        : null
    ]);
    if (!uRes && !lRes) return;
    setCombos(prev => [
      {
        id: `single_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: `Custom Pair: ${upperFile?.name || 'None'} + ${lowerFile?.name || 'None'}`,
        upper: uRes ? { id: `u_${Date.now()}`, name: upperFile.name, ...uRes, stamped: burnSyntheticStamp } : null,
        lower: lRes ? { id: `l_${Date.now()}`, name: lowerFile.name, ...lRes, stamped: burnSyntheticStamp } : null,
        status: 'PENDING',
        result: null,
        error: null
      },
      ...prev
    ]);
  };

  const runSingleCombo = async (combo) => {
    setBannerError('');
    setRunningComboId(combo.id);
    setCombos(prev =>
      prev.map(c => (c.id === combo.id ? { ...c, status: 'RUNNING', error: null } : c))
    );

    try {
      const aiResult = await evaluateGroomingWithAi({
        upperImageUrl: combo.upper?.dataUrl || null,
        lowerImageUrl: combo.lower?.dataUrl || null,
        feName: 'SuperAdmin Sandbox Sample',
        feCode: 'QA-TEST',
        expectedDate: getTodayYMD(),
        upperTimestamp: combo.upper?.timestampStr || '',
        lowerTimestamp: combo.lower?.timestampStr || '',
        upperNonce: combo.upper?.nonce || '',
        lowerNonce: combo.lower?.nonce || '',
        sharedAiConfig,
        skipTimestampCheck: ignoreWatermark,
        allowPartialTest: true
      });

      setCombos(prev =>
        prev.map(c =>
          c.id === combo.id
            ? { ...c, status: aiResult.overallVerdict, result: aiResult, error: null }
            : c
        )
      );
      return true;
    } catch (err) {
      const msg =
        err.message === 'NO_AI_KEY_CONFIGURED'
          ? 'No AI API key configured. Set one in AI Audits Console first.'
          : err.message;
      setCombos(prev =>
        prev.map(c =>
          c.id === combo.id ? { ...c, status: 'ERROR', error: msg } : c
        )
      );
      return false;
    } finally {
      setRunningComboId(null);
    }
  };

  const handleRunAll = async (onlyPending = false) => {
    const queue = onlyPending
      ? combos.filter(c => c.status === 'PENDING' || c.status === 'ERROR')
      : combos;
    if (queue.length === 0) return;

    stopSignalRef.current = false;
    setBatchRunning(true);
    setBatchProgress({ current: 0, total: queue.length });

    for (let i = 0; i < queue.length; i++) {
      if (stopSignalRef.current) break;
      setBatchProgress({ current: i + 1, total: queue.length });
      await runSingleCombo(queue[i]);
    }

    setBatchRunning(false);
  };

  const stats = useMemo(() => {
    const total = combos.length;
    const passed = combos.filter(c => c.status === 'PASS').length;
    const warned = combos.filter(c => c.status === 'WARNING').length;
    const fatal = combos.filter(c => c.status === 'FATAL').length;
    const pending = combos.filter(c => c.status === 'PENDING' || c.status === 'RUNNING').length;
    const errors = combos.filter(c => c.status === 'ERROR').length;
    const evaluated = passed + warned + fatal;
    const passRate = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 0;
    return { total, passed, warned, fatal, pending, errors, passRate };
  }, [combos]);

  const visibleCombos = useMemo(() => {
    if (statusFilter === 'ALL') return combos;
    return combos.filter(c => c.status === statusFilter);
  }, [combos, statusFilter]);

  return (
    <div className="space-y-5">
      {/* Zero DB Persistence Guarantee Banner */}
      <div className="bg-gradient-to-r from-violet-950/60 via-slate-900 to-amber-950/40 border border-violet-500/40 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-violet-300 shrink-0">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-white">
                SuperAdmin AI Grooming Accuracy Test Bench
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <DatabaseZap className="w-3 h-3" />
                Zero DB Save • RAM Only
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Upload as many Upper Body &amp; Jeans/Shoes images as you want to test AI combinations in bulk.{' '}
              <strong className="text-amber-300">Nothing is ever saved to Supabase or browser storage</strong> — closing or clearing wipes all test images.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300">
            Active AI:{' '}
            {activeCreds ? (
              <strong className="text-sky-300">
                {activeCreds.providerId.toUpperCase()} ({activeCreds.model})
              </strong>
            ) : (
              <strong className="text-red-400">No AI Key Configured</strong>
            )}
          </div>
        </div>
      </div>

      {bannerError && (
        <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-xs text-red-200 font-semibold flex items-center justify-between">
          <span>{bannerError}</span>
          <button onClick={() => setBannerError('')} className="p-1 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Multi-Image Pool Uploader */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>1. Upload Test Image Pools (Unlimited)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Upload multiple Upper &amp; Lower photos to auto-generate all combinations, or pair 1-to-1.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ignoreWatermark}
                onChange={(e) => setIgnoreWatermark(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-sky-500"
              />
              <span>Ignore missing watermark (Raw photo accuracy)</span>
            </label>

            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={burnSyntheticStamp}
                onChange={(e) => setBurnSyntheticStamp(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-amber-500"
              />
              <span>Burn synthetic timestamp on new uploads</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Upper Pool */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-black text-white block">
                  Upper Body Pool ({upperPool.length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Chest / Torso / Face (Uniform, ID Card, Hair, Beard)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {upperPool.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUpperPool([])}
                    className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => upperPoolInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Add Upper Images</span>
                </button>
                <input
                  ref={upperPoolInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    processUploadFiles(e.target.files, 'upper');
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            {upperPool.length === 0 ? (
              <div
                onClick={() => upperPoolInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-sky-500/50 rounded-xl py-6 text-center cursor-pointer transition-colors"
              >
                <ImageIcon className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                <span className="text-[11px] text-slate-400 block">
                  Click to select multiple Upper Body test images
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                {upperPool.map((item) => (
                  <div key={item.id} className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                    <img
                      src={item.dataUrl}
                      alt={item.name}
                      onClick={() => setPreviewPhoto({ title: item.name, url: item.dataUrl })}
                      className="w-full h-20 object-cover cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setUpperPool(prev => prev.filter(x => x.id !== item.id))}
                      className="absolute top-1 right-1 p-1 rounded bg-black/75 text-red-300 hover:text-white opacity-90 cursor-pointer"
                      title="Remove from pool"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="px-1 py-0.5 text-[9px] text-slate-300 truncate bg-slate-950/90">
                      {item.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lower Pool */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-black text-white block">
                  Lower Body Pool ({lowerPool.length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Jeans / Trousers &amp; Footwear (Shoes vs Slippers)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {lowerPool.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setLowerPool([])}
                    className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => lowerPoolInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Add Lower Images</span>
                </button>
                <input
                  ref={lowerPoolInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    processUploadFiles(e.target.files, 'lower');
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            {lowerPool.length === 0 ? (
              <div
                onClick={() => lowerPoolInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl py-6 text-center cursor-pointer transition-colors"
              >
                <ImageIcon className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                <span className="text-[11px] text-slate-400 block">
                  Click to select multiple Jeans &amp; Shoes test images
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                {lowerPool.map((item) => (
                  <div key={item.id} className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                    <img
                      src={item.dataUrl}
                      alt={item.name}
                      onClick={() => setPreviewPhoto({ title: item.name, url: item.dataUrl })}
                      className="w-full h-20 object-cover cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setLowerPool(prev => prev.filter(x => x.id !== item.id))}
                      className="absolute top-1 right-1 p-1 rounded bg-black/75 text-red-300 hover:text-white opacity-90 cursor-pointer"
                      title="Remove from pool"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="px-1 py-0.5 text-[9px] text-slate-300 truncate bg-slate-950/90">
                      {item.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Combo Builder Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBuildAllCombos}
              disabled={upperPool.length === 0 && lowerPool.length === 0}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black flex items-center gap-1.5 shadow-lg disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {upperPool.length > 0 && lowerPool.length > 0
                  ? `Queue All Combinations (${upperPool.length} × ${lowerPool.length} = ${upperPool.length * lowerPool.length})`
                  : `Queue Uploaded Images (${upperPool.length + lowerPool.length})`}
              </span>
            </button>

            {upperPool.length > 0 && lowerPool.length > 0 && (
              <button
                type="button"
                onClick={handlePairOneToOne}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Pair 1-to-1 ({Math.max(upperPool.length, lowerPool.length)})</span>
              </button>
            )}

            <QuickPairUploader onAddPair={handleUploadMatchedPairRow} />
          </div>

          {combos.length > 0 && (
            <button
              type="button"
              onClick={() => setCombos([])}
              disabled={batchRunning}
              className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/40 text-red-300 border border-red-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Test Queue ({combos.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Queue Execution & Stats */}
      {combos.length > 0 && (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleRunAll(true)}
                disabled={batchRunning || stats.pending + stats.errors === 0}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black flex items-center gap-1.5 shadow-lg disabled:opacity-40 cursor-pointer"
              >
                {batchRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>Run Pending ({stats.pending + stats.errors})</span>
              </button>

              <button
                type="button"
                onClick={() => handleRunAll(false)}
                disabled={batchRunning}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Re-Run All ({combos.length})</span>
              </button>

              {batchRunning && (
                <button
                  type="button"
                  onClick={() => {
                    stopSignalRef.current = true;
                  }}
                  className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop ({batchProgress.current}/{batchProgress.total})</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {[
                { key: 'ALL', label: `All (${stats.total})` },
                { key: 'PASS', label: `PASS (${stats.passed})`, cls: 'text-emerald-300 border-emerald-500/40' },
                { key: 'WARNING', label: `WARNING (${stats.warned})`, cls: 'text-amber-300 border-amber-500/40' },
                { key: 'FATAL', label: `FATAL (${stats.fatal})`, cls: 'text-red-300 border-red-500/40' },
                { key: 'PENDING', label: `Pending (${stats.pending})`, cls: 'text-slate-300 border-slate-700' }
              ].map((pill) => (
                <button
                  key={pill.key}
                  onClick={() => setStatusFilter(pill.key)}
                  className={`px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                    statusFilter === pill.key
                      ? 'bg-sky-600 text-white border-sky-500'
                      : `bg-slate-950 text-slate-300 border-slate-800 ${pill.cls || ''}`
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Combo Results Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {visibleCombos.map((combo, idx) => {
              const res = combo.result;
              return (
                <div
                  key={combo.id}
                  className={`bg-slate-900 border rounded-2xl p-4 space-y-3 shadow-lg ${
                    combo.status === 'FATAL'
                      ? 'border-red-500/40'
                      : combo.status === 'PASS'
                      ? 'border-emerald-500/40'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono text-slate-400">TEST #{idx + 1}</span>
                      <h4 className="text-xs font-black text-white truncate" title={combo.label}>
                        {combo.label}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {combo.status === 'RUNNING' ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> AI Testing...
                        </span>
                      ) : combo.status === 'PASS' ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> PASS ({res?.overallScore ?? 100}%)
                        </span>
                      ) : combo.status === 'WARNING' ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-500/20 text-amber-200 border border-amber-500/50 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> WARNING ({res?.overallScore ?? 78}%)
                        </span>
                      ) : combo.status === 'FATAL' ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> FATAL ({res?.overallScore ?? 0}%)
                        </span>
                      ) : combo.status === 'ERROR' ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-red-950 text-red-300 border border-red-500/40">
                          ERROR
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-800 text-slate-400 border border-slate-700">
                          QUEUED
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => runSingleCombo(combo)}
                        disabled={runningComboId === combo.id || batchRunning}
                        className="p-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 cursor-pointer disabled:opacity-40"
                        title="Run AI on this combo"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setCombos(prev => prev.filter(c => c.id !== combo.id))}
                        disabled={batchRunning}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-300 cursor-pointer disabled:opacity-40"
                        title="Remove test combo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Uncropped Images Preview */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {['upper', 'lower'].map((side) => {
                      const imgObj = combo[side];
                      const title = side === 'upper' ? '1. Chest / Torso / Face' : '2. Jeans & Shoes';
                      return (
                        <div key={side} className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 block">{title}</span>
                          {imgObj ? (
                            <div
                              onClick={() => setPreviewPhoto({ title: `${combo.label} — ${title}`, url: imgObj.dataUrl })}
                              className="relative group bg-black border border-slate-800 rounded-xl overflow-hidden cursor-pointer"
                            >
                              <img
                                src={imgObj.dataUrl}
                                alt={title}
                                className="w-full h-44 object-contain"
                              />
                              <div className="absolute top-1.5 right-1.5 p-1 rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-3 h-3" />
                              </div>
                            </div>
                          ) : (
                            <div className="h-44 rounded-xl bg-slate-950 border border-dashed border-slate-800 flex items-center justify-center text-[11px] text-slate-500">
                              Not Included
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* AI Breakdown */}
                  {combo.error && (
                    <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-200">
                      {combo.error}
                    </div>
                  )}

                  {res && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {CRITERIA_LABELS.map(({ group, key, label }) => {
                          const item = group === 'upper' ? res.upperBody?.criteria?.[key] : res.lowerBody?.criteria?.[key];
                          const st = item?.status || 'PASS';
                          return (
                            <div
                              key={key}
                              className={`p-2 rounded-lg border text-[11px] flex items-start gap-1.5 ${
                                st === 'FAIL'
                                  ? 'bg-red-950/35 border-red-500/40 text-red-200'
                                  : st === 'WARNING'
                                  ? 'bg-amber-950/35 border-amber-500/45 text-amber-200'
                                  : st === 'SKIPPED'
                                  ? 'bg-slate-950 border-slate-800 text-slate-500'
                                  : 'bg-emerald-950/25 border-emerald-500/30 text-emerald-200'
                              }`}
                            >
                              <span className="shrink-0">{st === 'FAIL' ? '❌' : st === 'WARNING' ? '⚠️' : st === 'SKIPPED' ? '➖' : '✅'}</span>
                              <div className="min-w-0">
                                <strong className="block text-[10px]">{label}</strong>
                                <span className="text-[10px] opacity-85 block leading-snug">
                                  {item?.note || st}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] space-y-1">
                        <div className="text-slate-200">{res.summary}</div>
                        {res.warnings?.length > 0 && (
                          <div className="text-amber-300 font-semibold">
                            Warnings: {res.warnings.join(' • ')}
                          </div>
                        )}
                        {res.failedReasons?.length > 0 && (
                          <div className="text-red-300 font-semibold">
                            Failed: {res.failedReasons.join(' • ')}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-500 font-mono">
                          {res.providerUsed?.toUpperCase()} • {res.modelUsed} • ~{res.tokensUsed} tokens • Not saved to DB
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="w-full max-w-4xl flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm font-bold text-white truncate">{previewPhoto.title}</span>
            <button
              onClick={() => setPreviewPhoto(null)}
              className="p-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={previewPhoto.url}
            alt={previewPhoto.title}
            className="max-h-[84vh] max-w-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline widget for adding a single custom Upper + Lower pair directly.
 */
function QuickPairUploader({ onAddPair }) {
  const [open, setOpen] = useState(false);
  const [uFile, setUFile] = useState(null);
  const [lFile, setLFile] = useState(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold cursor-pointer"
      >
        + Custom Single Pair
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px]">
      <label className="text-sky-300 font-semibold cursor-pointer">
        Upper: <input type="file" accept="image/*" onChange={(e) => setUFile(e.target.files?.[0] || null)} className="w-36 text-[10px]" />
      </label>
      <label className="text-indigo-300 font-semibold cursor-pointer">
        Lower: <input type="file" accept="image/*" onChange={(e) => setLFile(e.target.files?.[0] || null)} className="w-36 text-[10px]" />
      </label>
      <button
        type="button"
        disabled={!uFile && !lFile}
        onClick={async () => {
          await onAddPair(uFile, lFile);
          setUFile(null);
          setLFile(null);
          setOpen(false);
        }}
        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-40 cursor-pointer"
      >
        Add Pair
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="p-1 text-slate-400 hover:text-white cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
