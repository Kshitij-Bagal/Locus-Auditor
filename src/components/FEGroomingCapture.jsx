import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Timer,
  SwitchCamera,
  UserCheck,
  Footprints,
  Shirt,
  Maximize2,
  X,
  Lock,
  Loader2,
  RotateCcw
} from 'lucide-react';
import {
  getTodayYMD,
  captureAndWatermarkVideoFrame,
  evaluateGroomingWithAi,
  generateLiveCaptureNonce
} from '../utils/groomingAiHelper.js';
import { groomingApi, settingsApi } from '../api/client.js';

const CRITERIA_LABELS = {
  uniform: { label: 'Solid Lenskart Polo', group: 'upper' },
  idCard: { label: 'Lanyard & Photo ID Card', group: 'upper' },
  hairGrooming: { label: 'Hair Grooming', group: 'upper' },
  facialHair: { label: 'Facial Hair Grooming', group: 'upper' },
  jeans: { label: 'Dark Blue Jeans Only (Unfaded)', group: 'lower' },
  shoes: { label: 'Plain Black Shoes + Black Laces', group: 'lower' }
};

export default function FEGroomingCapture({
  feProfile = {},
  feName,
  feCode,
  feId,
  feEmail,
  facilityCode,
  onCheckCompleted
}) {
  const todayDate = getTodayYMD();
  const resolvedFeCode = feCode || feProfile?.feCode || feProfile?.fe_code || feProfile?.employee_code || feId || 'FE';
  const resolvedFeName = feName || feProfile?.full_name || feProfile?.name || 'Field Executive';
  const resolvedHub = facilityCode || feProfile?.facility_code || 'Ahmedabad';

  const [myChecks, setMyChecks] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Active live camera capture state
  const [activeStation, setActiveStation] = useState(null); // null | 'upper' | 'lower'
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);

  // Captured frames (only live camera captures allowed, no file upload)
  const [upperCapture, setUpperCapture] = useState(null);
  const [lowerCapture, setLowerCapture] = useState(null);
  const [gpsText, setGpsText] = useState('');

  // AI submission state
  const [isValidating, setIsValidating] = useState(false);
  const [validationStep, setValidationStep] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [retakeMode, setRetakeMode] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // Request optional non-blocking geolocation for watermark telemetry
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(4);
          const lng = pos.coords.longitude.toFixed(4);
          setGpsText(`${lat},${lng}`);
        },
        () => {},
        { timeout: 5000, maximumAge: 300000 }
      );
    }
  }, []);

  // Load FE's grooming history
  const loadMyChecks = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const all = await groomingApi.getChecks('ALL');
      const codeLower = String(resolvedFeCode || '').trim().toLowerCase();
      const emailLower = String(feEmail || '').trim().toLowerCase();
      const nameLower = String(resolvedFeName || '').trim().toLowerCase();

      const mine = (all || []).filter(c => {
        if (codeLower && String(c.feCode || '').toLowerCase() === codeLower) return true;
        if (emailLower && String(c.feEmail || '').toLowerCase() === emailLower) return true;
        if (nameLower && String(c.feName || '').toLowerCase() === nameLower) return true;
        return false;
      });
      setMyChecks(mine);
    } catch (err) {
      console.warn('Could not fetch grooming checks:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [resolvedFeCode, feEmail, resolvedFeName]);

  useEffect(() => {
    loadMyChecks();
  }, [loadMyChecks]);

  const todaysCheck = myChecks.find(c => c.checkDate === todayDate) || null;

  // Stop active WebRTC media stream cleanly
  const stopCameraStream = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  // Start WebRTC live camera stream (never falls back to file upload)
  const startCameraStream = useCallback(async (station, mode) => {
    stopCameraStream();
    setCameraError(null);
    setCameraReady(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Live camera access requires a secure HTTPS browser context (or localhost) with WebRTC camera support. File upload is disabled for compliance integrity.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        setCameraReady(true);
      }
    } catch (err) {
      // Retry without strict facingMode constraint if device has single webcam
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play().catch(() => {});
          setCameraReady(true);
        }
      } catch (innerErr) {
        setCameraError(
          `Camera access was denied or unavailable (${innerErr.message || 'Permission required'}). Please allow Camera permissions in your browser settings and tap Retry.`
        );
      }
    }
  }, [stopCameraStream]);

  useEffect(() => {
    if (activeStation) {
      startCameraStream(activeStation, facingMode);
    } else {
      stopCameraStream();
    }
    return () => stopCameraStream();
  }, [activeStation, facingMode, startCameraStream, stopCameraStream]);

  const openCameraForStation = (station) => {
    const defaultMode = station === 'upper' ? 'user' : 'environment';
    setFacingMode(defaultMode);
    setTimerEnabled(station === 'lower'); // Helpful 3s delay default for full shoes/jeans shot
    setActiveStation(station);
  };

  const executeFrameSnap = useCallback(() => {
    if (!videoRef.current || !activeStation) return;
    try {
      const stationLabel = activeStation === 'upper'
        ? 'UPPER BODY (UNIFORM, ID, HAIR, BEARD)'
        : 'LOWER BODY (JEANS & SHOES)';

      const result = captureAndWatermarkVideoFrame(videoRef.current, {
        feName: resolvedFeName,
        feCode: resolvedFeCode,
        stationLabel,
        gpsText,
        nonce: generateLiveCaptureNonce(resolvedFeCode)
      });

      if (activeStation === 'upper') {
        setUpperCapture(result);
      } else {
        setLowerCapture(result);
      }

      setActiveStation(null);
      stopCameraStream();
    } catch (err) {
      setCameraError(err.message);
    }
  }, [activeStation, resolvedFeName, resolvedFeCode, gpsText, stopCameraStream]);

  const handleSnapButton = () => {
    if (!cameraReady || countdown !== null) return;
    if (!timerEnabled) {
      executeFrameSnap();
      return;
    }

    let remaining = 3;
    setCountdown(remaining);
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        setCountdown(null);
        executeFrameSnap();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  };

  // Validate with AI & Persist Daily Check-In
  const handleValidateAndSubmit = async () => {
    if (!upperCapture?.dataUrl || !lowerCapture?.dataUrl) {
      setSubmitError('Please capture both live camera photos before submitting.');
      return;
    }

    setIsValidating(true);
    setSubmitError(null);
    setValidationStep('Checking timestamp watermarks & inspecting Uniform, ID Card, Hair, Facial Hair, Jeans & Shoes with AI...');

    const recordId = `${String(resolvedFeCode).replace(/[^A-Za-z0-9_-]/g, '')}_${todayDate}`;
    let aiResult = null;
    let status = 'PENDING_AI';

    try {
      const sharedAiConfig = await settingsApi.getGroomingAiConfig().catch(() => null);
      aiResult = await evaluateGroomingWithAi({
        upperImageUrl: upperCapture.dataUrl,
        lowerImageUrl: lowerCapture.dataUrl,
        feName: resolvedFeName,
        feCode: resolvedFeCode,
        expectedDate: todayDate,
        upperTimestamp: upperCapture.timestampStr,
        lowerTimestamp: lowerCapture.timestampStr,
        upperNonce: upperCapture.nonce,
        lowerNonce: lowerCapture.nonce,
        sharedAiConfig
      });
      status = aiResult.overallVerdict; // 'PASS' or 'FATAL'
    } catch (err) {
      if (err.message === 'NO_AI_KEY_CONFIGURED') {
        status = 'PENDING_AI';
      } else {
        console.warn('AI grooming check error, saving as PENDING_AI:', err.message);
        status = 'PENDING_AI';
        setSubmitError(`Live photos saved! Automated AI verification queued for review (${err.message}).`);
      }
    }

    try {
      setValidationStep('Saving timestamped grooming record to database...');
      const record = {
        id: recordId,
        checkDate: todayDate,
        feId: feId || feProfile?.id || '',
        feCode: resolvedFeCode,
        feName: resolvedFeName,
        feEmail: feEmail || feProfile?.email || '',
        facilityCode: resolvedHub,
        upperImageUrl: upperCapture.dataUrl,
        lowerImageUrl: lowerCapture.dataUrl,
        upperTimestamp: upperCapture.timestampStr,
        lowerTimestamp: lowerCapture.timestampStr,
        upperNonce: upperCapture.nonce,
        lowerNonce: lowerCapture.nonce,
        status,
        overallScore: aiResult?.overallScore ?? 0,
        aiSummary: aiResult?.summary || 'Live timestamped photos captured. Awaiting AI/Supervisor validation.',
        aiCriteria: aiResult
          ? {
              upperBody: aiResult.upperBody,
              lowerBody: aiResult.lowerBody,
              timestampNotes: aiResult.timestampNotes,
              _warnings: aiResult.warnings || []
            }
          : {},
        warnings: aiResult?.warnings || [],
        failedReasons: aiResult?.failedReasons || [],
        timestampVerified: aiResult ? aiResult.timestampVerified : true,
        spoofDetected: aiResult ? aiResult.spoofDetected : false,
        providerUsed: aiResult?.providerUsed || '',
        modelUsed: aiResult?.modelUsed || '',
        humanOverrideStatus: null,
        humanOverrideBy: null,
        humanOverrideNotes: null,
        submittedAt: new Date().toISOString()
      };

      await groomingApi.upsertCheck(record);
      await loadMyChecks();
      setRetakeMode(false);
      setUpperCapture(null);
      setLowerCapture(null);
      onCheckCompleted?.(record);
    } catch (saveErr) {
      setSubmitError(`Failed to save grooming check: ${saveErr.message}`);
    } finally {
      setIsValidating(false);
      setValidationStep('');
    }
  };

  const renderCriteriaPills = (check) => {
    const upperCrit = check?.aiCriteria?.upperBody?.criteria || {};
    const lowerCrit = check?.aiCriteria?.lowerBody?.criteria || {};
    const combined = [
      { key: 'uniform', data: upperCrit.uniform },
      { key: 'idCard', data: upperCrit.idCard },
      { key: 'hairGrooming', data: upperCrit.hairGrooming },
      { key: 'facialHair', data: upperCrit.facialHair },
      { key: 'jeans', data: lowerCrit.jeans },
      { key: 'shoes', data: lowerCrit.shoes }
    ];

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {combined.map(({ key, data }) => {
          const meta = CRITERIA_LABELS[key];
          const st = data?.status || (check.status === 'PENDING_AI' ? 'PENDING' : 'PASS');
          const isPass = st === 'PASS';
          const isWarn = st === 'WARNING';
          const isFail = st === 'FAIL';
          return (
            <div
              key={key}
              className={`p-2.5 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                isFail
                  ? 'bg-red-950/35 border-red-500/40 text-red-200'
                  : isWarn
                  ? 'bg-amber-950/35 border-amber-500/45 text-amber-200'
                  : isPass
                  ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <div className="min-w-0">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>{meta.label}</span>
                </div>
                {data?.note && (
                  <p className="text-[11px] text-slate-300/90 mt-0.5 leading-snug">{data.note}</p>
                )}
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${
                  isFail
                    ? 'bg-red-500/30 text-red-300 border border-red-500/40'
                    : isWarn
                    ? 'bg-amber-500/30 text-amber-200 border border-amber-500/50'
                    : isPass
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                {st}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const showCaptureInterface = !todaysCheck || retakeMode || todaysCheck.status === 'RECAPTURE_REQUESTED';

  return (
    <div className="space-y-5">
      {/* Top Security & Anti-Cheat Banner */}
      <div className="bg-gradient-to-r from-sky-950/70 via-slate-900 to-indigo-950/70 border border-sky-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300 shrink-0">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-white">Daily Grooming & Uniform Live Check-In</h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Lock className="w-3 h-3" /> LIVE CAMERA ONLY (NO UPLOADS)
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Date: <strong className="text-white font-mono">{todayDate}</strong> &bull; Both photos automatically embed a custom tamper-resistant timestamp & verification code and are inspected by AI.
            </p>
          </div>
        </div>

        <button
          onClick={loadMyChecks}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 self-start sm:self-center cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Today's Completed Result Banner (if submitted today and not in retakeMode) */}
      {todaysCheck && !retakeMode && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 space-y-4 shadow-xl ${
            todaysCheck.status === 'PASS'
              ? 'bg-emerald-950/20 border-emerald-500/40'
              : todaysCheck.status === 'FATAL' || todaysCheck.status === 'RECAPTURE_REQUESTED'
              ? 'bg-red-950/25 border-red-500/50'
              : 'bg-amber-950/20 border-amber-500/40'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              {todaysCheck.status === 'PASS' ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              ) : todaysCheck.status === 'FATAL' || todaysCheck.status === 'RECAPTURE_REQUESTED' ? (
                <ShieldAlert className="w-8 h-8 text-red-400 shrink-0 animate-pulse" />
              ) : todaysCheck.status === 'WARNING' ? (
                <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0" />
              ) : (
                <Clock className="w-8 h-8 text-amber-400 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm sm:text-base font-black text-white">
                    Today's Grooming Status ({todayDate}):
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase ${
                      todaysCheck.status === 'PASS'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : todaysCheck.status === 'FATAL'
                        ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                        : todaysCheck.status === 'WARNING'
                        ? 'bg-amber-500/25 text-amber-200 border border-amber-500/50'
                        : todaysCheck.status === 'RECAPTURE_REQUESTED'
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    }`}
                  >
                    {todaysCheck.status === 'PASS'
                      ? '✅ APPROVED / COMPLIANT'
                      : todaysCheck.status === 'WARNING'
                      ? '⚠️ GROOMING WARNING (MINOR ISSUE)'
                      : todaysCheck.status === 'FATAL'
                      ? '❌ GROOMING VIOLATION DETECTED'
                      : todaysCheck.status === 'RECAPTURE_REQUESTED'
                      ? '⚠️ RE-CAPTURE REQUESTED BY SUPERVISOR'
                      : '⏳ SAVED • PENDING AI VERIFICATION'}
                  </span>
                  {todaysCheck.overallScore > 0 && (
                    <span className="text-xs font-mono text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      Score: {todaysCheck.overallScore}/100
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1">{todaysCheck.aiSummary}</p>
              </div>
            </div>

            {(todaysCheck.status === 'FATAL' || todaysCheck.status === 'WARNING' || todaysCheck.status === 'RECAPTURE_REQUESTED' || todaysCheck.status === 'PENDING_AI') && (
              <button
                onClick={() => {
                  setRetakeMode(true);
                  setUpperCapture(null);
                  setLowerCapture(null);
                }}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer shrink-0 self-start sm:self-center"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake Live Check-In</span>
              </button>
            )}
          </div>

          {todaysCheck.failedReasons?.length > 0 && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200 space-y-1">
              <div className="font-bold text-red-300 uppercase text-[11px]">Flagged Grooming / Attire Issues:</div>
              {todaysCheck.failedReasons.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-red-400 font-bold">❌</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {todaysCheck.warnings?.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 text-xs text-amber-100 space-y-1">
              <div className="font-bold text-amber-300 uppercase text-[11px] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Minor Grooming Warning — Please Correct Immediately / By Next Shift:</span>
              </div>
              {todaysCheck.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-400 font-bold">⚠️</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Itemized Criteria Breakdown */}
          {renderCriteriaPills(todaysCheck)}

          {/* Captured Timestamped Photos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: '1. Chest, Torso & Face (Uniform, ID, Hair & Facial Hair)', url: todaysCheck.upperImageUrl, ts: todaysCheck.upperTimestamp },
              { label: '2. Lower Body (Jeans & Shoes)', url: todaysCheck.lowerImageUrl, ts: todaysCheck.lowerTimestamp }
            ].map((img, i) => (
              <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{img.label}</span>
                  <span className="text-[10px] font-mono text-sky-400">{img.ts}</span>
                </div>
                <div
                  className="h-64 bg-slate-950 flex items-center justify-center relative group cursor-pointer"
                  onClick={() => setPreviewPhoto({ url: img.url, title: img.label })}
                >
                  <img src={img.url} alt={img.label} className="w-full h-full object-contain p-1" />
                  <span className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-slate-900/80 text-white text-[10px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-3 h-3" /> Enlarge
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Camera Capture Workspace */}
      {showCaptureInterface && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>Step 1 & 2: Snap Both Live Camera Photos</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Each photo embeds an un-editable timestamp watermark & verification nonce directly on capture.
              </p>
            </div>
            {retakeMode && (
              <button
                onClick={() => setRetakeMode(false)}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer"
              >
                Cancel Retake
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* STATION 1: UPPER BODY */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-sky-500/20 text-sky-300">
                      <Shirt className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white">1. Chest, Torso & Face</h4>
                      <span className="text-[10px] text-slate-400">Checks Uniform, ID Card, Hair & Facial Hair</span>
                    </div>
                  </div>
                  {upperCapture ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                      ✓ Captured Live
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                      Required
                    </span>
                  )}
                </div>

                <ul className="text-[11px] text-slate-300 space-y-1 bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80 mb-3">
                  <li>✓ Official <strong>solid Navy/Black Lenskart Polo</strong> (no patterned/button-down shirts)</li>
                  <li>✓ Employee Photo ID Card &amp; Lanyard clearly hanging on chest</li>
                  <li>✓ Face &amp; full upper torso inside camera guide outline</li>
                </ul>

                {upperCapture ? (
                  <div
                    className="relative h-64 sm:h-72 rounded-xl overflow-hidden bg-black border border-emerald-500/40 cursor-pointer group"
                    onClick={() => setPreviewPhoto({ url: upperCapture.dataUrl, title: 'Live Capture: Chest, Torso & Face' })}
                  >
                    <img src={upperCapture.dataUrl} alt="Upper body live capture" className="w-full h-full object-contain" />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-mono text-emerald-300 border border-emerald-500/30">
                      {upperCapture.timestampStr}
                    </div>
                  </div>
                ) : (
                  <div className="h-56 sm:h-64 rounded-xl bg-slate-900/60 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center p-4 text-center">
                    <UserCheck className="w-10 h-10 text-slate-500 mb-2" />
                    <p className="text-xs font-semibold text-slate-300">No Live Selfie Captured Yet</p>
                    <p className="text-[11px] text-slate-500 mt-1">Camera opens directly — file upload is blocked.</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => openCameraForStation('upper')}
                className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  upperCapture
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-900/40'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>{upperCapture ? 'Retake Live Chest/Face Photo' : 'Open Camera for Chest/Face Photo'}</span>
              </button>
            </div>

            {/* STATION 2: LOWER BODY (JEANS & SHOES) */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
                      <Footprints className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white">2. Jeans & Shoes Check</h4>
                      <span className="text-[10px] text-slate-400">Checks Clean Jeans/Trousers & Closed-Toe Shoes</span>
                    </div>
                  </div>
                  {lowerCapture ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                      ✓ Captured Live
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                      Required
                    </span>
                  )}
                </div>

                <ul className="text-[11px] text-slate-300 space-y-1 bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80 mb-3">
                  <li>✓ <strong>Dark Blue / Dark Indigo Jeans ONLY</strong> (even color, NO fading in bottom half, no black/grey)</li>
                  <li>✓ <strong>Plain All-Black Shoes with BLACK Laces</strong> (no grey/beige soles or white laces)</li>
                  <li>💡 Use 3s self-timer + fit knees, calves &amp; both shoes inside guide outline</li>
                </ul>

                {lowerCapture ? (
                  <div
                    className="relative h-64 sm:h-72 rounded-xl overflow-hidden bg-black border border-emerald-500/40 cursor-pointer group"
                    onClick={() => setPreviewPhoto({ url: lowerCapture.dataUrl, title: 'Live Capture: Jeans & Shoes' })}
                  >
                    <img src={lowerCapture.dataUrl} alt="Lower body live capture" className="w-full h-full object-contain" />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-mono text-emerald-300 border border-emerald-500/30">
                      {lowerCapture.timestampStr}
                    </div>
                  </div>
                ) : (
                  <div className="h-56 sm:h-64 rounded-xl bg-slate-900/60 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center p-4 text-center">
                    <Footprints className="w-10 h-10 text-slate-500 mb-2" />
                    <p className="text-xs font-semibold text-slate-300">No Live Jeans & Shoes Photo Yet</p>
                    <p className="text-[11px] text-slate-500 mt-1">Show knees down to shoes clearly in frame.</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => openCameraForStation('lower')}
                className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  lowerCapture
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>{lowerCapture ? 'Retake Live Jeans & Shoes Photo' : 'Open Camera for Jeans & Shoes'}</span>
              </button>
            </div>
          </div>

          {submitError && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Submit & AI Validate CTA */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-800">
            <div className="text-xs text-slate-400">
              {isValidating ? (
                <span className="text-sky-300 font-semibold flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {validationStep}
                </span>
              ) : (
                <span>
                  Capture status: <strong className="text-white">{(upperCapture ? 1 : 0) + (lowerCapture ? 1 : 0)} / 2 live photos ready</strong>
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={!upperCapture || !lowerCapture || isValidating}
              onClick={handleValidateAndSubmit}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/40 transition-all cursor-pointer"
            >
              {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{isValidating ? 'Submitting...' : 'Submit'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Past Grooming History */}
      {myChecks.length > 0 && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Recent Grooming Check-In History ({myChecks.length})
          </h3>
          <div className="divide-y divide-slate-800">
            {myChecks.slice(0, 7).map(chk => (
              <div key={chk.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-white">{chk.checkDate}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      chk.status === 'PASS'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : chk.status === 'FATAL'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {chk.status}
                  </span>
                  <span className="text-slate-400 truncate max-w-md">{chk.aiSummary}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500">{chk.upperTimestamp}</span>
                  <button
                    onClick={() => setPreviewPhoto({ url: chk.upperImageUrl, title: `${chk.checkDate} • Upper Body` })}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer"
                  >
                    Upper Photo
                  </button>
                  <button
                    onClick={() => setPreviewPhoto({ url: chk.lowerImageUrl, title: `${chk.checkDate} • Jeans & Shoes` })}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer"
                  >
                    Shoes/Jeans
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LIVE WEBRTC CAMERA VIEWFINDER MODAL (ZERO FILE UPLOAD POSSIBLE) */}
      {activeStation && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
            {/* Viewfinder Header */}
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <div>
                  <div className="text-xs sm:text-sm font-bold text-white">
                    {activeStation === 'upper' ? 'Live Camera: Chest, Torso & Face' : 'Live Camera: Jeans & Shoes'}
                  </div>
                  <div className="text-[10px] text-sky-400 font-mono">
                    LIVE STREAM ONLY • BURNED TIMESTAMP WATERMARK ACTIVE
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveStation(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Feed Container */}
            <div className="relative bg-black flex-1 min-h-[320px] sm:min-h-[420px] flex items-center justify-center overflow-hidden">
              {cameraError ? (
                <div className="p-6 text-center space-y-3 max-w-md">
                  <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                  <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => startCameraStream(activeStation, facingMode)}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Retry Camera Permission
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full max-h-[65vh] object-contain ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                  />

                  {/* Live Canvas Silhouette Alignment Guide Overlay (HUD only — not baked into saved photo) */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2 sm:p-3">
                    <div className="flex items-center justify-center">
                      <span className="px-3 py-1 rounded-full bg-black/75 text-[10px] sm:text-[11px] font-bold text-sky-300 border border-sky-400/40 shadow">
                        {activeStation === 'upper'
                          ? 'Align Face Inside Oval + Full Chest, Solid Polo & ID Card Inside Box'
                          : 'Frame Full Dark Blue Jeans (No Bottom Fade) + Both Plain Black Shoes'}
                      </span>
                    </div>

                    {activeStation === 'upper' ? (
                      <svg
                        viewBox="0 0 400 300"
                        preserveAspectRatio="xMidYMid meet"
                        className="w-full h-full max-h-[54vh] opacity-90"
                      >
                        {/* Face Oval */}
                        <ellipse
                          cx="200"
                          cy="92"
                          rx="46"
                          ry="60"
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeDasharray="7 5"
                        />
                        <text
                          x="200"
                          y="100"
                          textAnchor="middle"
                          fill="#bae6fd"
                          fontSize="10"
                          fontWeight="700"
                        >
                          FACE • HAIR • BEARD
                        </text>

                        {/* Shoulders & Full Chest Silhouette */}
                        <path
                          d="M 80 285 L 92 202 Q 112 168 158 162 L 242 162 Q 288 168 308 202 L 320 285"
                          fill="rgba(14, 165, 233, 0.06)"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeDasharray="8 5"
                        />

                        {/* Chest ID Badge & Lanyard Target Zone */}
                        <rect
                          x="166"
                          y="188"
                          width="68"
                          height="56"
                          rx="8"
                          fill="rgba(251, 191, 36, 0.10)"
                          stroke="#fbbf24"
                          strokeWidth="2"
                          strokeDasharray="5 4"
                        />
                        <text
                          x="200"
                          y="214"
                          textAnchor="middle"
                          fill="#fde68a"
                          fontSize="9"
                          fontWeight="800"
                        >
                          ID CARD &amp;
                        </text>
                        <text
                          x="200"
                          y="227"
                          textAnchor="middle"
                          fill="#fde68a"
                          fontSize="9"
                          fontWeight="800"
                        >
                          LANYARD HERE
                        </text>
                        <text
                          x="200"
                          y="270"
                          textAnchor="middle"
                          fill="#38bdf8"
                          fontSize="9.5"
                          fontWeight="700"
                        >
                          STEP BACK SLIGHTLY SO FULL CHEST IS VISIBLE
                        </text>
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 400 300"
                        preserveAspectRatio="xMidYMid meet"
                        className="w-full h-full max-h-[54vh] opacity-90"
                      >
                        {/* Legs / Dark Jeans Zone */}
                        <path
                          d="M 122 18 L 278 18 L 268 175 L 214 175 L 200 95 L 186 175 L 132 175 Z"
                          fill="rgba(99, 102, 241, 0.08)"
                          stroke="#818cf8"
                          strokeWidth="2.5"
                          strokeDasharray="8 5"
                        />
                        <text
                          x="200"
                          y="56"
                          textAnchor="middle"
                          fill="#c7d2fe"
                          fontSize="10"
                          fontWeight="800"
                        >
                          DARK BLUE JEANS ONLY (UNFADED)
                        </text>

                        {/* Left & Right Plain Black Shoes Target Zones */}
                        <rect
                          x="105"
                          y="186"
                          width="84"
                          height="86"
                          rx="16"
                          fill="rgba(16, 185, 129, 0.08)"
                          stroke="#34d399"
                          strokeWidth="2.5"
                          strokeDasharray="6 4"
                        />
                        <text x="147" y="226" textAnchor="middle" fill="#a7f3d0" fontSize="9.5" fontWeight="800">
                          LEFT SHOE
                        </text>
                        <text x="147" y="241" textAnchor="middle" fill="#6ee7b7" fontSize="8.5" fontWeight="700">
                          BLACK + BLACK LACE
                        </text>

                        <rect
                          x="211"
                          y="186"
                          width="84"
                          height="86"
                          rx="16"
                          fill="rgba(16, 185, 129, 0.08)"
                          stroke="#34d399"
                          strokeWidth="2.5"
                          strokeDasharray="6 4"
                        />
                        <text x="253" y="226" textAnchor="middle" fill="#a7f3d0" fontSize="9.5" fontWeight="800">
                          RIGHT SHOE
                        </text>
                        <text x="253" y="241" textAnchor="middle" fill="#6ee7b7" fontSize="8.5" fontWeight="700">
                          BLACK + BLACK LACE
                        </text>
                      </svg>
                    )}

                    <div className="flex items-center justify-center">
                      <span className="px-2.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-emerald-300 border border-emerald-500/30">
                        LIVE WATERMARK WILL STAMP: {todayDate} • {resolvedFeCode}
                      </span>
                    </div>
                  </div>

                  {/* Countdown Overlay */}
                  {countdown !== null && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                      <span className="text-7xl font-black text-white drop-shadow-2xl animate-ping">
                        {countdown}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Camera Controls Footer */}
            <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'))}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <SwitchCamera className="w-4 h-4 text-sky-400" />
                  <span>{facingMode === 'user' ? 'Front Cam' : 'Rear Cam'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTimerEnabled(prev => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer transition-colors ${
                    timerEnabled
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <Timer className="w-4 h-4" />
                  <span>{timerEnabled ? '3s Timer ON' : 'Instant Snap'}</span>
                </button>
              </div>

              <button
                type="button"
                disabled={!cameraReady || countdown !== null}
                onClick={handleSnapButton}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs sm:text-sm font-black flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>{countdown !== null ? `Snapping in ${countdown}s...` : timerEnabled ? 'Start 3s Snap' : 'Snap Live Photo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Photo Lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="w-full max-w-4xl flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-white">{previewPhoto.title}</span>
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
            className="max-h-[82vh] max-w-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
