import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  RefreshCw, 
  Database,
  ArrowRight,
  ShieldCheck,
  FileCheck,
  Cpu,
  Users,
  Layers,
  Sparkles,
  X,
  CameraOff,
  CheckCircle2
} from 'lucide-react';
import { parseExcelFile, exportAuditReport } from '../utils/excelParser.js';

export default function UploadPage({ 
  onUploadComplete, 
  totalIngestedCount, 
  onExportTasks,
  tasks = [],
  onNavigate,
  onAutoAllocate,
  auditors = []
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAllocatingQuick, setIsAllocatingQuick] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage('');
    setUploadResult(null);

    try {
      const { tasks: parsedTasks, totalRows } = await parseExcelFile(file);
      
      if (!parsedTasks || parsedTasks.length === 0) {
        throw new Error('No valid dispatch rows found in the uploaded file.');
      }

      // Count tasks with and without photos
      const withImagesCount = parsedTasks.filter(t => 
        Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)))
      ).length;
      const withoutImagesCount = parsedTasks.length - withImagesCount;

      // Execute write operation via parent callback (calls tasksApi.uploadDispatches)
      await onUploadComplete(parsedTasks);

      const result = {
        fileName: file.name,
        totalRows,
        withImages: withImagesCount,
        withoutImages: withoutImagesCount,
        timestamp: new Date().toLocaleTimeString()
      };

      setUploadResult(result);
      // Immediately prompt user to choose next step
      setShowPromptModal(true);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to parse and store file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickAllocate = async () => {
    if (!onAutoAllocate) {
      if (onNavigate) onNavigate('allocation');
      return;
    }
    setIsAllocatingQuick(true);
    try {
      await onAutoAllocate();
      setShowPromptModal(false);
      if (onNavigate) onNavigate('audits');
    } catch (err) {
      alert(`Auto-allocation failed: ${err.message}`);
    } finally {
      setIsAllocatingQuick(false);
    }
  };

  const handleGoToRoster = () => {
    setShowPromptModal(false);
    if (onNavigate) {
      onNavigate('allocation');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Central Operations Console
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Daily Task Ingestion
            </span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">
            Locus Dispatch Data Ingestion
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Bulk ingest daily Locus routes, customer addresses, and the 5 SOP audit media URLs. Non-photo tasks are excluded from allocation.
          </p>
        </div>

        {tasks && tasks.length > 0 && (
          <button
            onClick={onExportTasks}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer self-start md:self-auto"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>Export Ingested Tasks ({tasks.length})</span>
          </button>
        )}
      </div>

      {/* Main Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
          isDragging 
            ? 'border-blue-500 bg-blue-500/10 scale-[1.01]' 
            : 'border-slate-700 hover:border-slate-500 bg-slate-850/60 hover:bg-slate-850'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFile(e.target.files?.[0])}
          accept=".xlsx,.xls,.csv"
          className="hidden"
        />

        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-4 ring-1 ring-blue-500/30">
            {isProcessing ? (
              <RefreshCw className="w-8 h-8 animate-spin" />
            ) : (
              <Upload className="w-8 h-8" />
            )}
          </div>

          <h3 className="text-lg font-bold text-white">
            {isProcessing ? 'Processing & Writing to Database...' : 'Click or Drag & Drop Daily Locus Spreadsheet'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mt-1.5">
            Upload the raw Locus dispatch export containing Task IDs, Rider IDs, customer details, and the 5 audit image links (.xlsx or .csv).
          </p>

          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Select File from Computer</span>
          </div>
        </div>
      </div>

      {/* Post-Upload Ingestion Action Banner */}
      {uploadResult && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-emerald-500/40 space-y-4 shadow-xl animate-in fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  Daily Dispatches Ingested Successfully ({uploadResult.totalRows} Total)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  File <code className="text-emerald-300 font-mono">{uploadResult.fileName}</code> processed at {uploadResult.timestamp}.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPromptModal(true)}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold underline cursor-pointer"
            >
              Reopen Prompt
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Eligible with Audit Photos:</span>
                <div className="text-lg font-black text-emerald-400">{uploadResult.withImages} tasks</div>
                <span className="text-[10px] text-slate-500">Ready to distribute to auditors</span>
              </div>
              <Sparkles className="w-6 h-6 text-emerald-400/50" />
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Excluded (No Media Uploaded):</span>
                <div className="text-lg font-black text-slate-400">{uploadResult.withoutImages} tasks</div>
                <span className="text-[10px] text-slate-500">Omitted (cannot audit compliance)</span>
              </div>
              <CameraOff className="w-6 h-6 text-slate-500/50" />
            </div>
          </div>

          {/* Quick Choice Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              onClick={handleQuickAllocate}
              disabled={isAllocatingQuick || uploadResult.withImages === 0}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isAllocatingQuick ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Auto-Allocating Across Active Auditors...</span>
                </>
              ) : (
                <>
                  <Cpu className="w-3.5 h-3.5" />
                  <span>⚡ Auto-Allocate Now ({uploadResult.withImages} Photo Tasks)</span>
                </>
              )}
            </button>

            <button
              onClick={handleGoToRoster}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>👥 Review & Edit Auditor Roster First</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 flex items-start gap-3 text-xs text-red-200 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-white text-sm">Upload Failed</div>
            <p className="text-red-300/90 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Ingestion Guidelines & Required Columns */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-sky-400" />
          Expected Locus Dispatch Columns:
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-400">
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-sky-300 font-medium">TASK ID</span>, <span className="font-mono text-sky-300 font-medium">TEAM NAME</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-sky-300 font-medium">RIDER ID</span>, <span className="font-mono text-sky-300 font-medium">RIDER NAME</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-sky-300 font-medium">DISPATCH DATE</span>, <span className="font-mono text-sky-300 font-medium">ZONE</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-emerald-300 font-medium">Selfie with T-shirt & ID card</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-emerald-300 font-medium">Blue torch & Yellow torch</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-emerald-300 font-medium">Vision chart & standee</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-emerald-300 font-medium">Refraction clinical toolkit</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-emerald-300 font-medium">Frame display at customer house</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-850/80 border border-slate-800">
            <span className="font-mono text-sky-300 font-medium">Pin</span>, <span className="font-mono text-sky-300 font-medium">CUSTOMER ADDRESS</span>
          </div>
        </div>
      </div>

      {/* POST-UPLOAD INTERACTIVE PROMPT MODAL */}
      {showPromptModal && uploadResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Daily Tasks Uploaded!
                  </h3>
                  <p className="text-xs text-slate-400">
                    Choose how you want to allocate today's dispatches.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPromptModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-850 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ingestion Breakdown */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-850/80 border border-slate-800">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Dispatches Ingested:</span>
                <span className="text-xl font-black text-white">{uploadResult.totalRows}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Actionable (Photos Uploaded):</span>
                <span className="text-xl font-black text-emerald-400">{uploadResult.withImages}</span>
              </div>
              {uploadResult.withoutImages > 0 && (
                <div className="col-span-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="text-amber-400">ℹ️</span>
                  <span><strong>{uploadResult.withoutImages} tasks without photos</strong> are omitted from allocation queues.</span>
                </div>
              )}
            </div>

            {/* Prompt Decision Cards */}
            <div className="space-y-3">
              {/* Option A: Auto-Allocate Now */}
              <button
                onClick={handleQuickAllocate}
                disabled={isAllocatingQuick || uploadResult.withImages === 0}
                className="w-full text-left p-4 rounded-xl bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-850 border border-blue-500/40 hover:border-blue-400 hover:bg-blue-900/60 transition-all cursor-pointer group shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-600/30 text-blue-300 flex items-center justify-center font-bold">
                      ⚡
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-blue-300 flex items-center gap-1.5">
                        <span>Auto-Allocate Now</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-slate-300/80 mt-0.5">
                        Evenly divide all {uploadResult.withImages} photo tasks across currently available auditors in Supabase.
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-transform shrink-0" />
                </div>
              </button>

              {/* Option B: Edit Roster First */}
              <button
                onClick={handleGoToRoster}
                className="w-full text-left p-4 rounded-xl bg-slate-850/90 border border-slate-700/80 hover:border-slate-500 hover:bg-slate-800 transition-all cursor-pointer group shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-700/50 text-slate-300 flex items-center justify-center">
                      <Users className="w-4 h-4 text-sky-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-sky-300">
                        Edit Auditor Roster First
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Adjust shifts (Available, Half Day, Leave) and team attendance before triggering distribution.
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-transform shrink-0" />
                </div>
              </button>
            </div>

            {/* Dismiss Footer */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowPromptModal(false)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Dismiss & View Ingested Tasks
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
