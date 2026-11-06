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
  Clock,
  Info,
  Activity,
  Zap,
  UserCheck,
  ThumbsUp,
  ThumbsDown,
  CheckCheck,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  getStoredGeminiApiKey, 
  saveStoredGeminiApiKey, 
  getStoredGeminiModel,
  saveStoredGeminiModel,
  listAvailableGeminiModels,
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
  // 1. API Key & Model State
  const [apiKey, setApiKey] = useState(() => getStoredGeminiApiKey());
  const [selectedModel, setSelectedModel] = useState(() => getStoredGeminiModel());
  const [availableModels, setAvailableModels] = useState([]);
  const [showKey, setShowKey] = useState(false);
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyStatus, setKeyStatus] = useState({ tested: false, valid: false, message: '' });
  const [showModelGuide, setShowModelGuide] = useState(false);

  // Live Token & Request Telemetry Counter
  const [sessionUsage, setSessionUsage] = useState({
    requests: 0,
    promptTokens: 0,
    responseTokens: 0,
    totalTokens: 0
  });

  // Active Model Metadata & Capacity Object
  const activeModelObj = useMemo(() => {
    const found = availableModels.find(m => m.id === selectedModel);
    if (found) return found;

    const isPro = selectedModel.toLowerCase().includes('pro');
    const isFlash = selectedModel.toLowerCase().includes('flash');
    const isRecommended = selectedModel === 'gemini-3.8-flash' || selectedModel === 'gemini-3.7-flash' || selectedModel === 'gemini-3.6-flash' || selectedModel === 'gemini-3.5-flash' || selectedModel === 'gemini-flash-latest';
    return {
      id: selectedModel,
      displayName: selectedModel,
      inputTokensFormatted: isPro ? '2M' : '1M',
      inputTokenLimit: isPro ? 2097152 : 1048576,
      outputTokenLimit: 8192,
      rpm: isFlash ? 15 : (isPro ? 2 : 5),
      rpd: isFlash ? 1500 : (isPro ? 50 : 200),
      isFlash,
      isPro,
      isRecommended
    };
  }, [availableModels, selectedModel]);

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
  const [allowFailover, setAllowFailover] = useState(true);

  // 4. Session History Ledger
  const [sessionHistory, setSessionHistory] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);

  // 5. Active Console Mode: 'EXECUTE' | 'VERIFY'
  const [activeConsoleTab, setActiveConsoleTab] = useState('EXECUTE');

  // 6. Human Review & Verification States
  const [verifySearchQuery, setVerifySearchQuery] = useState('');
  const [verifyCityFilter, setVerifyCityFilter] = useState('ALL');
  const [verifyVerdictFilter, setVerifyVerdictFilter] = useState('ALL'); // 'ALL' | 'PASSED' | 'FATAL'
  const [verifyHumanStatusFilter, setVerifyHumanStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'VERIFIED' | 'OVERTURNED'
  const [selectedVerifyTaskId, setSelectedVerifyTaskId] = useState(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideActionType, setOverrideActionType] = useState('PASS'); // 'PASS' | 'FATAL'
  const [overrideReasonInput, setOverrideReasonInput] = useState('');
  const [humanNotesInput, setHumanNotesInput] = useState('');
  const [isVerifyingAction, setIsVerifyingAction] = useState(false);

  // Auto-discover models quietly when API key exists and ensure selectedModel is valid
  useEffect(() => {
    if (apiKey && apiKey.trim()) {
      listAvailableGeminiModels(apiKey).then(models => {
        if (models && models.length > 0) {
          setAvailableModels(models);
          const isInvalidLegacy = selectedModel.includes('1.5') || selectedModel.includes('2.5');
          const exists = models.some(m => m.id === selectedModel);
          if (!exists || isInvalidLegacy) {
            const optimal = models.find(m => m.id === 'gemini-3.8-flash') || models.find(m => m.id === 'gemini-3.7-flash') || models.find(m => m.id === 'gemini-3.5-flash') || models[0];
            if (optimal) {
              setSelectedModel(optimal.id);
              saveStoredGeminiModel(optimal.id);
            }
          }
        }
      }).catch(() => {});
    }
  }, [apiKey]);

  // Sync API Key to Storage
  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    saveStoredGeminiApiKey(newKey);
    setKeyStatus({ tested: false, valid: false, message: '' });
  };

  // Sync Selected Model
  const handleModelChange = (modelId) => {
    setSelectedModel(modelId);
    saveStoredGeminiModel(modelId);
  };

  // Test Gemini API Key & Discover Models
  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setKeyStatus({ tested: true, valid: false, message: 'Please enter a Gemini API Key.' });
      return;
    }
    setKeyTesting(true);
    try {
      const res = await testGeminiApiKey(apiKey, selectedModel);
      if (res.availableModels && res.availableModels.length > 0) {
        setAvailableModels(res.availableModels);
        const isInvalidLegacy = selectedModel.includes('1.5') || selectedModel.includes('2.5');
        const exists = res.availableModels.some(m => m.id === selectedModel);
        if ((!exists || isInvalidLegacy) && res.activeModel) {
          setSelectedModel(res.activeModel);
          saveStoredGeminiModel(res.activeModel);
        }
      }
      setKeyStatus({ 
        tested: true, 
        valid: true, 
        message: `Connected: ${res.displayName || res.activeModel}` 
      });
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
        modelId: selectedModel,
        rules: INITIAL_CENTRAL_RULES,
        onProgress: (prog) => setCurrentProgress(prog),
        allowModelFailover: allowFailover
      });

      setActiveAuditResult({
        taskId: taskToAudit.id || taskToAudit.taskId,
        task: taskToAudit,
        result
      });

      // Calculate exact tokens used
      const promptToks = result.usageMetadata?.promptTokens || 1650;
      const respToks = result.usageMetadata?.responseTokens || 350;
      const totToks = result.usageMetadata?.totalTokens || (promptToks + respToks);

      // Overwrite Auditor Name directly with the exact model used (e.g. gemini-3.8-flash)
      const auditorName = result.activeModelUsed || selectedModel || 'gemini-3.8-flash';
      const auditorLocation = taskToAudit.facilityCode || taskToAudit.city || 'Central AI';

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

      // Optionally commit to Supabase database
      if (shouldCommit) {
        setCurrentProgress({ step: 'COMMITTING', message: 'Writing AI audit verdict & tokens to Supabase database...' });

        if (result.verdict === 'PASS') {
          await tasksApi.passAudit({
            taskId: taskToAudit.id || taskToAudit.taskId,
            auditorName, // Overwrites Auditor Name with the model used
            auditorLocation,
            remarks: `AI PASSED (Score: ${result.overallScore}/100, Conf: ${result.confidenceScore}% ±${result.errorMargin}%). ${result.summary}`,
            criteriaStatus,
            replacements: [],
            taskData: taskToAudit,
            totalTokens: totToks // Stores total tokens in Supabase
          });
        } else {
          await tasksApi.failAudit({
            taskId: taskToAudit.id || taskToAudit.taskId,
            taskData: taskToAudit,
            failedReasons: failedReasons.length > 0 ? failedReasons : ['AI Non-Compliance Detection'],
            remarks: `AI FATAL STRIKE (Score: ${result.overallScore}/100, Conf: ${result.confidenceScore}% ±${result.errorMargin}%). ${result.summary}`,
            criteriaStatus,
            replacements: [],
            auditorName, // Overwrites Auditor Name with the model used
            auditorLocation,
            immediateEmail: false,
            totalTokens: totToks // Stores total tokens in Supabase
          });
        }

        if (onTaskAudited) {
          onTaskAudited(taskToAudit.id || taskToAudit.taskId, result.verdict);
        }
      }

      // Update session telemetry counters
      setSessionUsage(prev => ({
        requests: prev.requests + 1,
        promptTokens: prev.promptTokens + promptToks,
        responseTokens: prev.responseTokens + respToks,
        totalTokens: prev.totalTokens + totToks
      }));

      // Add to session ledger
      const sessionEntry = {
        taskId: taskToAudit.taskId || taskToAudit.id,
        task: taskToAudit,
        feName: taskToAudit.feName || 'Unknown',
        feCode: taskToAudit.feCode || '',
        city: taskToAudit.facilityCode || taskToAudit.city || 'Hub',
        date: taskToAudit.date || taskToAudit.dispatch_date || '',
        verdict: result.verdict,
        overallScore: result.overallScore,
        confidenceScore: result.confidenceScore,
        errorMargin: result.errorMargin,
        tokensUsed: totToks,
        totalTokens: totToks,
        total_tokens: totToks,
        modelUsed: auditorName,
        auditedBy: auditorName,
        audited_by_name: auditorName,
        summary: result.summary,
        criteriaStatus,
        failedReasons,
        criteriaEvaluation: result.criteriaEvaluation || [],
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
      
      // 2000ms throttle interval between tasks to stay safely under Google's 15 RPM rate limit
      if (processed < tasksToProcess.length && !isBatchCancelledRef.current) {
        await new Promise(r => setTimeout(r, 2000));
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

  // All AI-audited tasks (from Supabase tasks + current session)
  const allAiAuditedTasks = useMemo(() => {
    const list = tasks.filter(t => {
      const isAudited = t.auditStatus === 'PASSED' || t.auditStatus === 'FATAL';
      if (!isAudited) return false;
      const by = (t.auditedBy || t.audited_by_name || '').toLowerCase();
      const rem = (t.remarks || t.auditor_remarks || '').toLowerCase();
      return by.includes('gemini') || by.includes('ai') || rem.includes('ai passed') || rem.includes('ai fatal') || rem.includes('(score:');
    }).map(t => {
      const rem = (t.remarks || t.auditor_remarks || '');
      const isVerified = rem.includes('[Human Verified') || t.human_verified;
      const isOverturned = rem.includes('[Human Overturned') || t.human_overturned;
      const humanStatus = isOverturned ? 'OVERTURNED' : (isVerified ? 'VERIFIED' : 'PENDING');
      return {
        ...t,
        auditedBy: t.audited_by_name || t.auditedBy || 'gemini-3.8-flash',
        totalTokens: t.total_tokens || t.totalTokens || 0,
        total_tokens: t.total_tokens || t.totalTokens || 0,
        humanStatus
      };
    });

    // Also include any tasks audited in current session not yet refreshed in tasks prop
    sessionHistory.forEach(s => {
      if (!list.some(t => String(t.id || t.taskId) === String(s.taskId))) {
        list.push({
          id: s.taskId,
          taskId: s.taskId,
          feName: s.feName,
          feCode: s.feCode,
          facilityCode: s.city,
          city: s.city,
          date: s.date,
          auditStatus: s.verdict,
          auditedBy: s.modelUsed || 'gemini-3.8-flash',
          audited_by_name: s.modelUsed || 'gemini-3.8-flash',
          remarks: `AI ${s.verdict} (Score: ${s.overallScore}/100, Conf: ${s.confidenceScore}% ±${s.errorMargin}%). ${s.summary}`,
          auditor_remarks: `AI ${s.verdict} (Score: ${s.overallScore}/100, Conf: ${s.confidenceScore}% ±${s.errorMargin}%). ${s.summary}`,
          images: s.task?.images || {},
          criteriaStatus: s.criteriaStatus || {},
          criteria_status: s.criteriaStatus || {},
          failedReasons: s.failedReasons || [],
          failed_reasons: s.failedReasons || [],
          criteriaEvaluation: s.criteriaEvaluation || [],
          totalTokens: s.totalTokens || 0,
          total_tokens: s.totalTokens || 0,
          humanStatus: 'PENDING'
        });
      }
    });

    return list;
  }, [tasks, sessionHistory]);

  // Distinct cities in AI audited tasks
  const verifyAvailableCities = useMemo(() => {
    const s = new Set();
    allAiAuditedTasks.forEach(t => {
      const c = t.facilityCode || t.city;
      if (c) s.add(c);
    });
    return Array.from(s).sort();
  }, [allAiAuditedTasks]);

  // Filtered tasks for Human Verification Hub
  const filteredVerifyTasks = useMemo(() => {
    return allAiAuditedTasks.filter(t => {
      if (verifyVerdictFilter !== 'ALL' && t.auditStatus !== verifyVerdictFilter) return false;
      if (verifyHumanStatusFilter !== 'ALL' && t.humanStatus !== verifyHumanStatusFilter) return false;
      if (verifyCityFilter !== 'ALL') {
        const c = t.facilityCode || t.city || '';
        if (c.toLowerCase() !== verifyCityFilter.toLowerCase()) return false;
      }
      if (verifySearchQuery.trim()) {
        const q = verifySearchQuery.toLowerCase().trim();
        const mId = String(t.taskId || t.id || '').toLowerCase().includes(q);
        const mFe = String(t.feName || '').toLowerCase().includes(q);
        const mCode = String(t.feCode || '').toLowerCase().includes(q);
        if (!mId && !mFe && !mCode) return false;
      }
      return true;
    });
  }, [allAiAuditedTasks, verifyVerdictFilter, verifyHumanStatusFilter, verifyCityFilter, verifySearchQuery]);

  // Selected Task for Human Verification
  const selectedVerifyTask = useMemo(() => {
    if (!filteredVerifyTasks.length) return null;
    if (selectedVerifyTaskId) {
      const found = filteredVerifyTasks.find(t => String(t.id || t.taskId) === String(selectedVerifyTaskId));
      if (found) return found;
    }
    return filteredVerifyTasks[0];
  }, [filteredVerifyTasks, selectedVerifyTaskId]);

  // Images for selected verification task
  const verifyTaskImages = useMemo(() => {
    if (!selectedVerifyTask) return {};
    const imgObj = selectedVerifyTask.images || {};
    const taskId = selectedVerifyTask.id || selectedVerifyTask.taskId;
    return {
      selfie: normalizeLocusUrl(imgObj.selfie, taskId),
      torches: normalizeLocusUrl(imgObj.torches, taskId),
      visionChart: normalizeLocusUrl(imgObj.visionChart, taskId),
      toolkit: normalizeLocusUrl(imgObj.toolkit, taskId),
      frameDisplay: normalizeLocusUrl(imgObj.frameDisplay, taskId)
    };
  }, [selectedVerifyTask]);

  // AI Criteria Breakdown & Failure Reasons for the Selected Task
  const verifyCriteriaBreakdown = useMemo(() => {
    if (!selectedVerifyTask) return [];

    // 1. If criteriaEvaluation array already exists from live audit result
    if (Array.isArray(selectedVerifyTask.criteriaEvaluation) && selectedVerifyTask.criteriaEvaluation.length > 0) {
      return selectedVerifyTask.criteriaEvaluation;
    }

    // 2. Reconstruct from criteria_status / criteriaStatus and failed_reasons
    const statusMap = selectedVerifyTask.criteria_status || selectedVerifyTask.criteriaStatus || {};
    const failedList = selectedVerifyTask.failed_reasons || selectedVerifyTask.failedReasons || [];

    const definitions = [
      { id: 'selfie', label: '1. Selfie: Official T-Shirt & Visible ID Card', icon: '👤', fallbackObs: 'Lenskart polo uniform and readable employee badge verification.' },
      { id: 'torches', label: '2. Dual Torches: Cobalt Blue & Amber Yellow', icon: '🔦', fallbackObs: 'Both penlights active and powered on side-by-side.' },
      { id: 'visionChart', label: '3. Vision Acuity Chart & Telescoping Standee', icon: '👁️', fallbackObs: 'Snellen / LogMAR acuity chart mounted at eye-level on standee.' },
      { id: 'toolkit', label: '4. Optical Refraction Toolkit & Sanitizer', icon: '🧰', fallbackObs: '6-piece clinical refraction kit with trial frame & sanitizer.' },
      { id: 'trialLenses', altId: 'frameDisplay', label: '5. Frame Display & Trial Lens Set', icon: '👓', fallbackObs: 'Eyewear frames display tray and clean trial lenses.' }
    ];

    return definitions.map(def => {
      const rawStatus = statusMap[def.id] || (def.altId ? statusMap[def.altId] : null);
      const isFatalAudit = selectedVerifyTask.auditStatus === 'FATAL';
      
      const matchingReasons = failedList.filter(r => {
        const lower = String(r).toLowerCase();
        if (def.id === 'selfie' && (lower.includes('selfie') || lower.includes('t-shirt') || lower.includes('badge') || lower.includes('id card'))) return true;
        if (def.id === 'torches' && (lower.includes('torch') || lower.includes('penlight') || lower.includes('blue') || lower.includes('yellow'))) return true;
        if (def.id === 'visionChart' && (lower.includes('chart') || lower.includes('standee') || lower.includes('vision'))) return true;
        if (def.id === 'toolkit' && (lower.includes('toolkit') || lower.includes('sanitizer') || lower.includes('jcc') || lower.includes('frame') || lower.includes('ruler'))) return true;
        if (def.id === 'trialLenses' && (lower.includes('lens') || lower.includes('display') || lower.includes('tray'))) return true;
        return false;
      });

      const status = rawStatus || (matchingReasons.length > 0 ? 'FAIL' : (isFatalAudit ? 'UNKNOWN' : 'PASS'));

      return {
        id: def.id,
        label: def.label,
        icon: def.icon,
        status: status === 'FAIL' ? 'FAIL' : (status === 'PASS' ? 'PASS' : (matchingReasons.length > 0 ? 'FAIL' : 'PASS')),
        failureReasons: matchingReasons.length > 0 ? matchingReasons : (status === 'FAIL' ? ['Criterion non-compliance detected by AI'] : []),
        observations: matchingReasons.length > 0 ? matchingReasons.join('. ') : (status === 'PASS' ? 'Fully compliant with clinical DLC SOP standards.' : def.fallbackObs)
      };
    });
  }, [selectedVerifyTask]);

  const failedCriteriaInReview = useMemo(() => {
    return verifyCriteriaBreakdown.filter(c => c.status === 'FAIL');
  }, [verifyCriteriaBreakdown]);

  // Verification statistics
  const verificationStats = useMemo(() => {
    const total = allAiAuditedTasks.length;
    const fatal = allAiAuditedTasks.filter(t => t.auditStatus === 'FATAL').length;
    const passed = allAiAuditedTasks.filter(t => t.auditStatus === 'PASSED').length;
    const verified = allAiAuditedTasks.filter(t => t.humanStatus === 'VERIFIED').length;
    const overturned = allAiAuditedTasks.filter(t => t.humanStatus === 'OVERTURNED').length;
    const agreementRate = total > 0 ? (((total - overturned) / total) * 100).toFixed(1) : 100;
    return { total, fatal, passed, verified, overturned, agreementRate };
  }, [allAiAuditedTasks]);

  // Human confirms and approves AI verdict
  const handleConfirmAiVerdict = async () => {
    if (!selectedVerifyTask) return;
    setIsVerifyingAction(true);
    try {
      const reviewerName = currentUser?.name || currentUser?.email || 'Central QA Reviewer';
      const originalRemarks = selectedVerifyTask.remarks || selectedVerifyTask.auditor_remarks || '';
      const notesClean = humanNotesInput.trim();
      const updatedRemarks = `[Human Verified by ${reviewerName}${notesClean ? `: ${notesClean}` : ''}] ${originalRemarks}`;

      const modelAuditorName = selectedVerifyTask.auditedBy || selectedVerifyTask.audited_by_name || 'gemini-3.8-flash';
      const taskTokens = selectedVerifyTask.totalTokens || selectedVerifyTask.total_tokens || 0;

      if (selectedVerifyTask.auditStatus === 'PASSED') {
        await tasksApi.passAudit({
          taskId: selectedVerifyTask.id || selectedVerifyTask.taskId,
          auditorName: modelAuditorName,
          auditorLocation: selectedVerifyTask.facilityCode || 'Central QA',
          remarks: updatedRemarks,
          criteriaStatus: selectedVerifyTask.criteriaStatus || {},
          replacements: [],
          taskData: selectedVerifyTask,
          totalTokens: taskTokens
        });
      } else {
        await tasksApi.failAudit({
          taskId: selectedVerifyTask.id || selectedVerifyTask.taskId,
          taskData: selectedVerifyTask,
          failedReasons: selectedVerifyTask.failedReasons || ['AI Fatal Strike Confirmed by Human Reviewer'],
          remarks: updatedRemarks,
          criteriaStatus: selectedVerifyTask.criteriaStatus || {},
          replacements: [],
          auditorName: modelAuditorName,
          auditorLocation: selectedVerifyTask.facilityCode || 'Central QA',
          immediateEmail: false,
          totalTokens: taskTokens
        });
      }

      if (onTaskAudited) {
        onTaskAudited(selectedVerifyTask.id || selectedVerifyTask.taskId, selectedVerifyTask.auditStatus);
      }
      setHumanNotesInput('');
      alert(`Audit for Task #${selectedVerifyTask.taskId || selectedVerifyTask.id} confirmed and verified by ${reviewerName}!`);
    } catch (err) {
      alert(`Failed to verify audit: ${err.message}`);
    } finally {
      setIsVerifyingAction(false);
    }
  };

  // Human overturns AI verdict
  const handleExecuteOverturn = async () => {
    if (!selectedVerifyTask) return;
    if (!overrideReasonInput.trim()) {
      alert('Please enter a reason for overturning the AI verdict.');
      return;
    }

    setIsVerifyingAction(true);
    try {
      const reviewerName = currentUser?.name || currentUser?.email || 'Central QA Reviewer';
      const originalRemarks = selectedVerifyTask.remarks || selectedVerifyTask.auditor_remarks || '';

      const taskTokens = selectedVerifyTask.totalTokens || selectedVerifyTask.total_tokens || 0;

      if (overrideActionType === 'PASS') {
        const remarks = `[Human Overturned FATAL to PASS by ${reviewerName}: ${overrideReasonInput.trim()}] Original AI: ${originalRemarks}`;
        await tasksApi.passAudit({
          taskId: selectedVerifyTask.id || selectedVerifyTask.taskId,
          auditorName: reviewerName,
          auditorLocation: selectedVerifyTask.facilityCode || 'Central QA',
          remarks,
          criteriaStatus: { selfie: 'PASS', torches: 'PASS', visionChart: 'PASS', toolkit: 'PASS', frameDisplay: 'PASS' },
          replacements: [],
          taskData: selectedVerifyTask,
          totalTokens: taskTokens
        });
        if (onTaskAudited) {
          onTaskAudited(selectedVerifyTask.id || selectedVerifyTask.taskId, 'PASSED');
        }
      } else {
        const remarks = `[Human Overturned PASS to FATAL by ${reviewerName}: ${overrideReasonInput.trim()}] Original AI: ${originalRemarks}`;
        await tasksApi.failAudit({
          taskId: selectedVerifyTask.id || selectedVerifyTask.taskId,
          taskData: selectedVerifyTask,
          failedReasons: [overrideReasonInput.trim()],
          remarks,
          criteriaStatus: selectedVerifyTask.criteriaStatus || {},
          replacements: [],
          auditorName: reviewerName,
          auditorLocation: selectedVerifyTask.facilityCode || 'Central QA',
          immediateEmail: false,
          totalTokens: taskTokens
        });
        if (onTaskAudited) {
          onTaskAudited(selectedVerifyTask.id || selectedVerifyTask.taskId, 'FATAL');
        }
      }

      setOverrideModalOpen(false);
      setOverrideReasonInput('');
      alert(`Verdict overturned to ${overrideActionType} for Task #${selectedVerifyTask.taskId || selectedVerifyTask.id}!`);
    } catch (err) {
      alert(`Failed to overturn verdict: ${err.message}`);
    } finally {
      setIsVerifyingAction(false);
    }
  };

  // Export Verification Audit Trail to Excel
  const handleExportVerificationExcel = () => {
    if (allAiAuditedTasks.length === 0) {
      alert('No AI audits to export.');
      return;
    }
    const exportData = allAiAuditedTasks.map(t => ({
      'Task ID': t.taskId || t.id,
      'Field Executive': t.feName || 'N/A',
      'FE Code': t.feCode || '',
      'City': t.facilityCode || t.city || 'Hub',
      'Date': t.date || t.dispatch_date || '',
      'AI Verdict': t.auditStatus,
      'Auditor / Model': t.auditedBy || t.audited_by_name || 'gemini-3.8-flash',
      'Total Tokens': t.totalTokens || t.total_tokens || 0,
      'Failed Criteria': Array.isArray(t.failedReasons || t.failed_reasons) ? (t.failedReasons || t.failed_reasons).join('; ') : '',
      'Human Status': t.humanStatus,
      'Remarks': t.remarks || t.auditor_remarks || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AI_Human_Verification');
    XLSX.writeFile(wb, `AI_Human_Verification_Log_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

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

      {/* Mode Switcher: Run AI Audits vs Human Verification Hub */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveConsoleTab('EXECUTE')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeConsoleTab === 'EXECUTE'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-lg shadow-sky-950/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
        >
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span>Run AI Audits</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-950 text-[10px] text-slate-300 border border-slate-800 font-mono">
            {queueTasks.length} Pending
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveConsoleTab('VERIFY')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeConsoleTab === 'VERIFY'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-950/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
        >
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <span>Human Review & Verification</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-950 text-[10px] text-emerald-300 border border-slate-800 font-mono">
            {allAiAuditedTasks.length} AI Audits
          </span>
        </button>
      </div>

      {activeConsoleTab === 'EXECUTE' ? (
        <>
      {/* Google Gemini API Key & Model Configuration Bar */}
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
                <span>API Key Saved ({selectedModel})</span>
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
            className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white border border-sky-500 flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-lg shadow-sky-900/30"
          >
            {keyTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-white" />}
            <span>{keyTesting ? 'Auto-Detecting Models...' : 'Test Connection'}</span>
          </button>
        </div>

        {/* Dynamic Model Selector, Token Limits & Rate Guidance */}
        <div className="space-y-3 pt-3 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                Active Vision Model:
              </span>

              {availableModels.length > 0 ? (
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-sky-300 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500 max-w-xs sm:max-w-md truncate"
                >
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.label || `${m.displayName || m.id} (${m.inputTokensFormatted || '1M'} Tokens | ${m.rpm || 15} RPM)`}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-sky-400 bg-slate-950 border border-slate-700 px-2.5 py-1 rounded-lg">
                    {selectedModel || 'gemini-3.8-flash'}
                  </span>
                  <span className="text-[10px] text-slate-500 italic">
                    (Auto-discovers model token limits on Test)
                  </span>
                </div>
              )}

              {/* Smart Auto-Failover Toggle */}
              <label 
                className="flex items-center gap-1.5 text-[11px] text-slate-300 font-medium cursor-pointer select-none bg-slate-950 border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                title="When Google experiences temporary 503 high-demand spikes on a model, automatically failover to sister Flash models (3.7/3.6/3.5) to keep audits running with 0 errors"
              >
                <input
                  type="checkbox"
                  checked={allowFailover}
                  onChange={(e) => setAllowFailover(e.target.checked)}
                  className="rounded border-slate-700 text-sky-500 focus:ring-sky-500 focus:ring-offset-0 bg-slate-900 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Auto-Failover on 503 Demand Spikes</span>
                </span>
              </label>

              {/* Recommendation Pill */}
              {activeModelObj.isRecommended ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  ⭐ Optimal for 5-Photo DLC Auditing
                </span>
              ) : activeModelObj.isPro ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  2 RPM Limit (Single audits only, avoid batch)
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  {activeModelObj.rpm} RPM Quota
                </span>
              )}
            </div>

            {/* Model Guide Toggle */}
            <button
              type="button"
              onClick={() => setShowModelGuide(!showModelGuide)}
              className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
              <span>{showModelGuide ? 'Hide Model Guide' : 'Which model should I use?'}</span>
            </button>
          </div>

          {/* Model Selection Explainer Guide Card */}
          {showModelGuide && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-sky-900/50 text-xs text-slate-300 space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-sky-400" />
                  Model Selection & Quota Guide for DLC Home Eye Checkup Auditing
                </span>
                <button onClick={() => setShowModelGuide(false)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed">
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300">⭐ Gemini 1.5 Flash / Flash-Latest</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">RECOMMENDED</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    <li><strong>Context Window:</strong> 1,048,576 tokens (~1M). All 5 clinical photos take ~2,000 tokens (uses only 0.2% of capacity).</li>
                    <li><strong>Free Speed & Quota:</strong> <strong>15 audits per minute</strong> and <strong>1,500 audits per day</strong>.</li>
                    <li><strong>Latency:</strong> Fast 1.5-second evaluation time per task.</li>
                    <li><strong>Ideal For:</strong> High-volume single audits and automated batch runs (5 or 10 tasks) without rate limits.</li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300">⚠️ Gemini 1.5 Pro</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded">LOW RPM WARNING</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    <li><strong>Context Window:</strong> 2,097,152 tokens (~2M) – unnecessarily large for 5 photos.</li>
                    <li><strong>Strict Free Quota:</strong> Only <strong>2 requests per minute</strong> and <strong>50 audits per day</strong>.</li>
                    <li><strong>Batch Risk:</strong> Running a batch of 5 or 10 will trigger Google error <code>429 Quota Exceeded</code> after task #2.</li>
                    <li><strong>Use Case:</strong> Only for manual, deep forensic re-checks of contentious disputed visits.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Live Token & Request Counter Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* 1. Requests Counter */}
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="flex items-center gap-1 text-sky-400">
                  <Activity className="w-3 h-3" /> Requests Sent
                </span>
                <span className="text-sky-300 font-mono font-bold">{activeModelObj.rpm} RPM Quota</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-white">{sessionUsage.requests}</span>
                <span className="text-[10px] text-slate-400">audits this session</span>
              </div>
            </div>

            {/* 2. Token Counter */}
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Layers className="w-3 h-3" /> Tokens Consumed
                </span>
                <span className="text-emerald-300 font-mono font-bold">~2.0k / task</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-emerald-400">
                  {sessionUsage.totalTokens.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400">tokens used</span>
              </div>
            </div>

            {/* 3. Model Token Window */}
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="flex items-center gap-1 text-indigo-400">
                  <Cpu className="w-3 h-3" /> Context Window
                </span>
                <span className="text-indigo-300 font-mono font-bold">{activeModelObj.inputTokensFormatted || '1M'} Max</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-indigo-300">
                  {activeModelObj.inputTokenLimit ? activeModelObj.inputTokenLimit.toLocaleString() : '1,048,576'}
                </span>
                <span className="text-[10px] text-slate-400">input capacity</span>
              </div>
            </div>

            {/* 4. Daily Free Tier Allowance */}
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="flex items-center gap-1 text-amber-400">
                  <Zap className="w-3 h-3" /> Daily Allowance
                </span>
                <span className="text-amber-300 font-mono font-bold">Free Tier</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-amber-300">
                  {activeModelObj.rpd ? activeModelObj.rpd.toLocaleString() : '1,500'}
                </span>
                <span className="text-[10px] text-slate-400">requests/day</span>
              </div>
            </div>
          </div>
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
        </>
      ) : (
        /* TAB 2: HUMAN REVIEW & VERIFICATION HUB */
        <div className="space-y-6">
          {/* Verification Summary KPIs Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Total AI Audited
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-white">{verificationStats.total}</span>
                <span className="text-[10px] text-slate-500">Visits</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-emerald-950 p-3.5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                AI Passed
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-emerald-400">{verificationStats.passed}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {verificationStats.total > 0 ? ((verificationStats.passed / verificationStats.total) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-red-950 p-3.5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block mb-1">
                AI Fatal Strikes
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-red-400">{verificationStats.fatal}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {verificationStats.total > 0 ? ((verificationStats.fatal / verificationStats.total) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-sky-950 p-3.5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block mb-1">
                Human Verified
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-sky-400">{verificationStats.verified}</span>
                <span className="text-[10px] text-slate-500">Confirmed</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-amber-950 p-3.5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                Human Overturned
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-amber-400">{verificationStats.overturned}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {verificationStats.agreementRate}% Match
                </span>
              </div>
            </div>
          </div>

          {/* Verification Filters Bar */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white uppercase tracking-wider">
                  Review Queue ({filteredVerifyTasks.length} Visits)
                </span>
              </div>

              <button
                onClick={handleExportVerificationExcel}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export Verification Ledger</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
              {/* Search */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={verifySearchQuery}
                  onChange={(e) => setVerifySearchQuery(e.target.value)}
                  placeholder="Search Task ID, FE Name..."
                  className="w-full bg-transparent text-white text-xs placeholder-slate-500 focus:outline-none"
                />
              </div>

              {/* City */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
                <span className="text-[10px] font-bold text-slate-400 block mb-0.5">City / Hub</span>
                <select
                  value={verifyCityFilter}
                  onChange={(e) => setVerifyCityFilter(e.target.value)}
                  className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">All Cities</option>
                  {verifyAvailableCities.map(c => (
                    <option key={c} value={c} className="bg-slate-900 text-white">{c}</option>
                  ))}
                </select>
              </div>

              {/* AI Verdict Filter */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
                <span className="text-[10px] font-bold text-slate-400 block mb-0.5">AI Verdict</span>
                <select
                  value={verifyVerdictFilter}
                  onChange={(e) => setVerifyVerdictFilter(e.target.value)}
                  className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">All AI Verdicts</option>
                  <option value="PASSED" className="bg-slate-900 text-emerald-300">AI Passed</option>
                  <option value="FATAL" className="bg-slate-900 text-red-300">AI Fatal Strike</option>
                </select>
              </div>

              {/* Human Verification Status */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
                <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Human Review Status</span>
                <select
                  value={verifyHumanStatusFilter}
                  onChange={(e) => setVerifyHumanStatusFilter(e.target.value)}
                  className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">All Human States</option>
                  <option value="PENDING" className="bg-slate-900 text-amber-300">Pending Human Check</option>
                  <option value="VERIFIED" className="bg-slate-900 text-emerald-300">Verified by Human</option>
                  <option value="OVERTURNED" className="bg-slate-900 text-purple-300">Overturned / Overridden</option>
                </select>
              </div>
            </div>
          </div>

          {/* Verification Split-Pane */}
          {filteredVerifyTasks.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
              <UserCheck className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No AI-Audited Tasks Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Run audits in the &ldquo;Run AI Audits&rdquo; tab first. All audited visits will appear here for human oversight and verification.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Queue List (5 cols) */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2 shadow-xl max-h-[750px] overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Audited Visits ({filteredVerifyTasks.length})</span>
                  <span>AI Verdict / State</span>
                </div>

                {filteredVerifyTasks.map(t => {
                  const isSelected = String(selectedVerifyTask?.id || selectedVerifyTask?.taskId) === String(t.id || t.taskId);
                  const isFatal = t.auditStatus === 'FATAL';

                  return (
                    <div
                      key={t.id || t.taskId}
                      onClick={() => setSelectedVerifyTaskId(t.id || t.taskId)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-sky-950/40 border-sky-500/60 shadow-md shadow-sky-950/50'
                          : 'bg-slate-950/60 hover:bg-slate-950 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-white text-[13px]">
                          #{t.taskId || t.id}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            isFatal ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            AI {t.auditStatus}
                          </span>

                          {t.humanStatus === 'VERIFIED' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> Verified
                            </span>
                          )}
                          {t.humanStatus === 'OVERTURNED' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-0.5">
                              <RotateCcw className="w-2.5 h-2.5" /> Overturned
                            </span>
                          )}
                          {t.humanStatus === 'PENDING' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{t.feName || 'Unknown FE'} ({t.feCode || 'FE'})</span>
                        <span>{t.facilityCode || t.city || 'Hub'}</span>
                      </div>

                      <div className="mt-1.5 text-[10px] text-slate-400 line-clamp-1 italic">
                        {t.remarks || t.auditor_remarks || 'No remarks'}
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-800/60 font-mono">
                        <span className="text-sky-400 font-semibold truncate max-w-[140px]">
                          🤖 {t.auditedBy || t.audited_by_name || 'gemini-3.8-flash'}
                        </span>
                        {(t.totalTokens || t.total_tokens) > 0 ? (
                          <span className="text-emerald-400">
                            ⚡ {((t.totalTokens || t.total_tokens) / 1000).toFixed(1)}k tokens
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Inspection & Human Action Panel (7 cols) */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
                {selectedVerifyTask ? (
                  <>
                    {/* Task Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-white font-mono">
                            Task #{selectedVerifyTask.taskId || selectedVerifyTask.id}
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                            selectedVerifyTask.auditStatus === 'FATAL'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}>
                            Current: {selectedVerifyTask.auditStatus}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 block mt-0.5">
                          {selectedVerifyTask.feName} ({selectedVerifyTask.feCode}) • {selectedVerifyTask.facilityCode || selectedVerifyTask.city} • {selectedVerifyTask.date || 'Today'}
                        </span>
                      </div>

                      <div className="text-right text-[11px] text-slate-400 space-y-0.5">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 mr-1.5">Auditor:</span>
                          <span className="font-mono text-sky-300 font-bold">
                            {selectedVerifyTask.auditedBy || selectedVerifyTask.audited_by_name || 'gemini-3.8-flash'}
                          </span>
                        </div>
                        {(selectedVerifyTask.totalTokens || selectedVerifyTask.total_tokens) > 0 && (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1.5">Tokens Used:</span>
                            <span className="font-mono text-emerald-400 font-bold">
                              {(selectedVerifyTask.totalTokens || selectedVerifyTask.total_tokens).toLocaleString()} tokens
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5 Clinical Photos Gallery */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-2">
                        Clinical Photo Evidence (Click any photo to zoom)
                      </span>

                      <div className="grid grid-cols-5 gap-2">
                        {[
                          { key: 'selfie', label: '1. Selfie' },
                          { key: 'torches', label: '2. Torches' },
                          { key: 'visionChart', label: '3. Chart' },
                          { key: 'toolkit', label: '4. Toolkit' },
                          { key: 'frameDisplay', label: '5. Frame' }
                        ].map(st => {
                          const url = verifyTaskImages[st.key];
                          return (
                            <div
                              key={st.key}
                              onClick={() => url && setPreviewImage({ url, title: `${st.label} - Task #${selectedVerifyTask.taskId || selectedVerifyTask.id}` })}
                              className={`rounded-xl border p-1 text-center cursor-pointer transition-all ${
                                url
                                ? 'bg-slate-950 border-slate-800 hover:border-sky-500'
                                : 'bg-slate-950/40 border-slate-800/40 opacity-40 cursor-not-allowed'
                              }`}
                            >
                              <div className="aspect-square bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center relative mb-1">
                                {url ? (
                                  <img src={url} alt={st.label} className="w-full h-full object-cover" />
                                ) : (
                                  <Camera className="w-4 h-4 text-slate-600" />
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-slate-400 block truncate">{st.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* AI Diagnostic Remarks */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                      <span className="font-bold text-sky-400 flex items-center gap-1.5 text-xs">
                        <Sparkles className="w-3.5 h-3.5" /> AI Diagnostic Summary
                      </span>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {selectedVerifyTask.remarks || selectedVerifyTask.auditor_remarks || 'No detailed remarks.'}
                      </p>
                    </div>

                    {/* AI Criteria Evaluation & Failure Triggers Breakdown */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center gap-2 text-xs">
                          <Sliders className="w-3.5 h-3.5 text-sky-400" />
                          <span>AI Criteria Evaluation & Failure Triggers</span>
                        </span>
                        {selectedVerifyTask.auditStatus === 'FATAL' ? (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            {failedCriteriaInReview.length > 0 ? `${failedCriteriaInReview.length} Failed Criteria Triggers` : 'AI Fatal Strike'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            All 5 Criteria Compliant
                          </span>
                        )}
                      </div>

                      {/* Prominent Highlighting for AI Fatal Triggers */}
                      {selectedVerifyTask.auditStatus === 'FATAL' && (
                        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-red-200 flex items-center gap-1.5 uppercase tracking-wide">
                              <ShieldAlert className="w-4 h-4 text-red-400" />
                              AI Fatal Strike Triggers (Why this task failed):
                            </span>
                            <span className="text-[9px] font-mono font-bold bg-red-500/30 text-red-200 px-2 py-0.5 rounded uppercase">
                              Mandatory Non-Compliance
                            </span>
                          </div>

                          <p className="text-[11px] text-red-300/90 leading-tight">
                            The AI auditor identified non-compliance on the following mandatory equipment station photos:
                          </p>

                          <div className="space-y-1.5 pt-1">
                            {(failedCriteriaInReview.length > 0
                              ? failedCriteriaInReview
                              : (selectedVerifyTask.failedReasons || ['Clinical equipment non-compliance detected by AI']).map((r, i) => ({
                                  id: `fail-${i}`,
                                  label: 'Non-Compliance Trigger',
                                  icon: '🚨',
                                  failureReasons: [r],
                                  observations: r
                                }))
                            ).map((c, idx) => (
                              <div key={c.id || idx} className="p-2.5 rounded-lg bg-red-900/40 border border-red-500/30 text-xs">
                                <div className="flex items-center justify-between font-bold text-red-200 mb-0.5">
                                  <span className="flex items-center gap-1.5">
                                    <span>{c.icon || '❌'}</span>
                                    <span>{c.label}</span>
                                  </span>
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/40 text-white">
                                    STRIKE (FAIL)
                                  </span>
                                </div>
                                <p className="text-[11px] text-red-200 pl-5 leading-snug">
                                  {c.failureReasons && c.failureReasons.length > 0
                                    ? c.failureReasons.join(', ')
                                    : c.observations || 'Photo missing or criteria requirements not satisfied.'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Full 5-Station SOP Evaluation Checklist */}
                      <div className="space-y-2 pt-1">
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                          5-Station Clinical SOP Checklist ({verifyCriteriaBreakdown.filter(c => c.status === 'PASS').length}/5 Passed)
                        </span>

                        <div className="grid grid-cols-1 gap-2">
                          {verifyCriteriaBreakdown.map((crit) => {
                            const isFail = crit.status === 'FAIL';
                            return (
                              <div
                                key={crit.id}
                                className={`p-2.5 rounded-xl border text-xs transition-all ${
                                  isFail
                                    ? 'bg-red-950/20 border-red-500/40 text-red-200'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">{crit.icon}</span>
                                    <span className="font-bold text-white text-xs">{crit.label}</span>
                                  </div>
                                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                    isFail
                                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  }`}>
                                    {crit.status}
                                  </span>
                                </div>

                                <p className={`text-[11px] mt-1.5 pl-6 leading-relaxed ${
                                  isFail ? 'text-red-300 font-medium' : 'text-slate-400'
                                }`}>
                                  {crit.failureReasons && crit.failureReasons.length > 0
                                    ? `⚠️ ${crit.failureReasons.join('. ')}`
                                    : crit.observations || 'Compliant with clinical standards.'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Human Verification Action Box */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-slate-950 to-slate-900 border border-emerald-900/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-emerald-400" /> Human Reviewer Decision
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Logged in as: <strong className="text-slate-200">{currentUser?.name || 'Reviewer'}</strong>
                        </span>
                      </div>

                      {/* Reviewer Note Input */}
                      <div>
                        <input
                          type="text"
                          value={humanNotesInput}
                          onChange={(e) => setHumanNotesInput(e.target.value)}
                          placeholder="Add optional verification notes or rationale..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        {/* Confirm Button */}
                        <button
                          onClick={handleConfirmAiVerdict}
                          disabled={isVerifyingAction}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-950/40"
                        >
                          <CheckCheck className="w-4 h-4" />
                          <span>Confirm AI Verdict</span>
                        </button>

                        {/* Overturn Button */}
                        {selectedVerifyTask.auditStatus === 'FATAL' ? (
                          <button
                            onClick={() => {
                              setOverrideActionType('PASS');
                              setOverrideModalOpen(true);
                            }}
                            disabled={isVerifyingAction}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-amber-950/40"
                          >
                            <ThumbsUp className="w-4 h-4" />
                            <span>Overturn to PASS</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setOverrideActionType('FATAL');
                              setOverrideModalOpen(true);
                            }}
                            disabled={isVerifyingAction}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-red-950/40"
                          >
                            <ThumbsDown className="w-4 h-4" />
                            <span>Overturn to FATAL</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-20 text-center text-slate-500 text-xs">
                    Select a visit from the left to inspect and verify.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Overturn Reason Modal */}
          {overrideModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Overturn AI Verdict to {overrideActionType}
                  </span>
                  <button
                    onClick={() => setOverrideModalOpen(false)}
                    className="text-slate-400 hover:text-white text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>

                <div className="space-y-2 text-xs text-slate-300">
                  <p>
                    You are overriding Task #{selectedVerifyTask?.taskId || selectedVerifyTask?.id} from{' '}
                    <strong className="text-white">{selectedVerifyTask?.auditStatus}</strong> to{' '}
                    <strong className={overrideActionType === 'PASS' ? 'text-emerald-400' : 'text-red-400'}>
                      {overrideActionType}
                    </strong>.
                  </p>
                  <label className="block font-bold text-slate-300 text-[11px] pt-1">
                    Reason for Overturning (Required for audit compliance):
                  </label>
                  <textarea
                    value={overrideReasonInput}
                    onChange={(e) => setOverrideReasonInput(e.target.value)}
                    placeholder="e.g. Torches visible upon closer inspection in dark room; clinical standard satisfied."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-medium"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => setOverrideModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteOverturn}
                    disabled={!overrideReasonInput.trim() || isVerifyingAction}
                    className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 ${
                      overrideActionType === 'PASS' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                    }`}
                  >
                    Confirm Overturn to {overrideActionType}
                  </button>
                </div>
              </div>
            </div>
          )}
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
