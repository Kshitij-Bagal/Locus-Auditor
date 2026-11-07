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
  ChevronLeft,
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
  listAvailableGeminiModels,
  normalizeLocusUrl 
} from '../utils/geminiAuditHelper.js';
import { scanTasksForAiExclusion } from '../utils/imageForensics.js';
import {
  SUPPORTED_PROVIDERS,
  getActiveAiProvider,
  saveActiveAiProvider,
  getProviderApiKey,
  saveProviderApiKey,
  getProviderModel,
  saveProviderModel,
  getProviderFailoverEnabled,
  saveProviderFailoverEnabled,
  testAnyProviderApiKey,
  auditTaskMultiProvider
} from '../utils/multiAiAuditHelper.js';
import { tasksApi, settingsApi } from '../api/client.js';
import { INITIAL_CENTRAL_RULES } from '../data/centralRules.js';
import AuditModal from './AuditModal.jsx';

/**
 * Returns today's date in local YYYY-MM-DD format (resets cleanly at 00:00 local midnight)
 */
export function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes the total count of AI-audited tasks performed today directly from verified Supabase tasks
 */
function getTodayAiAuditedCountFromTasks(tasksList, dateStr) {
  if (!Array.isArray(tasksList)) return 0;
  return tasksList.filter(t => {
    const isAudited = t.auditStatus === 'PASSED' || t.auditStatus === 'FATAL';
    if (!isAudited) return false;
    const by = (t.auditedBy || t.audited_by_name || '').toLowerCase();
    const rem = (t.remarks || t.auditor_remarks || '').toLowerCase();
    const isAi = by.includes('gemini') || by.includes('ai') || by.includes('gpt') || by.includes('claude') || by.includes('llama') || by.includes('groq') || by.includes('openrouter') || rem.includes('ai passed') || rem.includes('ai fatal') || rem.includes('(score:');
    if (!isAi) return false;

    const auditedAt = t.auditedAt || t.audited_at;
    if (!auditedAt) return false;
    try {
      const audDate = new Date(auditedAt);
      const audDateStr = `${audDate.getFullYear()}-${String(audDate.getMonth() + 1).padStart(2, '0')}-${String(audDate.getDate()).padStart(2, '0')}`;
      return audDateStr === dateStr;
    } catch (_) {
      return String(auditedAt).slice(0, 10) === dateStr;
    }
  }).length;
}

export default function AIAuditsConsole({
  tasks = [],
  users = [],
  currentUser,
  onNavigate,
  onTaskAudited
}) {
  // 1. Multi-AI Provider & Model State
  const [activeProvider, setActiveProvider] = useState(() => getActiveAiProvider());
  const [apiKey, setApiKey] = useState(() => getProviderApiKey(getActiveAiProvider()));
  const [selectedModel, setSelectedModel] = useState(() => getProviderModel(getActiveAiProvider()));
  const [availableModels, setAvailableModels] = useState(() => {
    const prov = SUPPORTED_PROVIDERS.find(p => p.id === getActiveAiProvider()) || SUPPORTED_PROVIDERS[0];
    return prov.defaultModels || [];
  });
  const [showKey, setShowKey] = useState(false);
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyStatus, setKeyStatus] = useState({ tested: false, valid: false, message: '' });
  const [showModelGuide, setShowModelGuide] = useState(false);
  const [allowFailover, setAllowFailover] = useState(() => getProviderFailoverEnabled());

  // Persistent Daily AI Audit Task Request Tracker (stored in Supabase website storage & resets at 00:00)
  const [dailyAiUsage, setDailyAiUsage] = useState(() => {
    const today = getTodayDateString();
    try {
      const saved = localStorage.getItem(`locus_daily_ai_audit_tracker_${today}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.date === today) return parsed;
      }
    } catch (_) {}
    return { date: today, requests: 0, totalTokens: 0, lastUpdated: null };
  });

  // Ephemeral live session counters
  const [sessionUsage, setSessionUsage] = useState({
    requests: 0,
    promptTokens: 0,
    responseTokens: 0,
    totalTokens: 0
  });

  // Active Model Metadata & Capacity Object
  const activeModelObj = useMemo(() => {
    const prov = SUPPORTED_PROVIDERS.find(p => p.id === activeProvider) || SUPPORTED_PROVIDERS[0];
    const found = availableModels.find(m => m.id === selectedModel);
    if (found) return found;

    const isPro = selectedModel.toLowerCase().includes('pro') || selectedModel.toLowerCase().includes('opus') || selectedModel.includes('90b');
    const isFlash = selectedModel.toLowerCase().includes('flash') || selectedModel.toLowerCase().includes('mini') || selectedModel.toLowerCase().includes('haiku') || selectedModel.includes('11b');
    const isRecommended = selectedModel === 'gemini-3.8-flash' || selectedModel === 'gemini-3.7-flash' || selectedModel === 'gpt-4o-mini' || selectedModel === 'claude-3-5-sonnet-20241022' || selectedModel.includes('11b');
    return {
      id: selectedModel,
      displayName: selectedModel,
      inputTokensFormatted: isPro ? '2M' : '128k - 1M',
      inputTokenLimit: isPro ? 2097152 : 1048576,
      outputTokenLimit: 8192,
      rpm: isFlash ? (activeProvider === 'groq' ? 30 : 15) : (isPro ? 2 : 5),
      rpd: isFlash ? 1500 : (isPro ? 50 : 200),
      isFlash,
      isPro,
      isRecommended
    };
  }, [availableModels, selectedModel, activeProvider]);

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

  // 5. Active Console Mode: 'EXECUTE' | 'VERIFY' | 'REAUDIT'
  const [activeConsoleTab, setActiveConsoleTab] = useState('EXECUTE');

  // 6. Human Review & Verification States
  const [verifySearchQuery, setVerifySearchQuery] = useState('');
  const [verifyCityFilter, setVerifyCityFilter] = useState('ALL');
  const [verifyVerdictFilter, setVerifyVerdictFilter] = useState('ALL'); // 'ALL' | 'PASSED' | 'FATAL'
  const [verifyHumanStatusFilter, setVerifyHumanStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'VERIFIED' | 'OVERTURNED'
  const [selectedVerifyTaskId, setSelectedVerifyTaskId] = useState(null);
  const [verifyDeckViewMode, setVerifyDeckViewMode] = useState('RAPID_DECK'); // 'RAPID_DECK' | 'SPLIT'
  const [deckTaskIndex, setDeckTaskIndex] = useState(0);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideActionType, setOverrideActionType] = useState('PASS'); // 'PASS' | 'FATAL'
  const [overrideReasonInput, setOverrideReasonInput] = useState('');
  const [humanNotesInput, setHumanNotesInput] = useState('');
  const [isVerifyingAction, setIsVerifyingAction] = useState(false);

  // 7. Fail AI Audit & Clinical Re-Audit States
  const [failAiModalOpen, setFailAiModalOpen] = useState(false);
  const [failAiReasonInput, setFailAiReasonInput] = useState('');
  const [inspectingReAuditTask, setInspectingReAuditTask] = useState(null);
  const [sessionReAuditMap, setSessionReAuditMap] = useState({}); // taskId -> { reason, requestedAt }
  const [reAuditSearchQuery, setReAuditSearchQuery] = useState('');
  const [reAuditCityFilter, setReAuditCityFilter] = useState('ALL');
  const [reAuditVerdictFilter, setReAuditVerdictFilter] = useState('ALL'); // 'ALL' | 'PASSED' (False Positive) | 'FATAL' (False Negative)

  // 8. Forensic Pre-Screening & AI Quota Guard States
  const [isForensicScanning, setIsForensicScanning] = useState(false);
  const [forensicProgress, setForensicProgress] = useState({ current: 0, total: 0, taskName: '', message: '' });
  const [forensicFlags, setForensicFlags] = useState([]);
  const [excludedTaskIds, setExcludedTaskIds] = useState(new Set());
  const [forensicDefectFilter, setForensicDefectFilter] = useState('ALL'); // 'ALL' | 'BLUR' | 'BLACK_BLANK'
  const [forensicSearchQuery, setForensicSearchQuery] = useState('');
  const forensicAbortControllerRef = useRef(null);

  // Auto-discover models quietly when API key exists (Gemini)
  useEffect(() => {
    if (activeProvider === 'gemini' && apiKey && apiKey.trim()) {
      listAvailableGeminiModels(apiKey).then(models => {
        if (models && models.length > 0) {
          setAvailableModels(models);
          const isInvalidLegacy = selectedModel.includes('1.5') || selectedModel.includes('2.5');
          const exists = models.some(m => m.id === selectedModel);
          if (!exists || isInvalidLegacy) {
            const optimal = models.find(m => m.id === 'gemini-3.8-flash') || models.find(m => m.id === 'gemini-3.7-flash') || models.find(m => m.id === 'gemini-3.5-flash') || models[0];
            if (optimal) {
              setSelectedModel(optimal.id);
              saveProviderModel('gemini', optimal.id);
            }
          }
        }
      }).catch(() => {});
    }
  }, [apiKey, activeProvider]);

  // 1. Sync Daily AI Task Request Count from Supabase website storage & tasks table on load & refresh
  useEffect(() => {
    let isMounted = true;
    const today = getTodayDateString();

    // A. Count tasks audited by AI today directly from tasks state
    const dbTodayCount = getTodayAiAuditedCountFromTasks(tasks, today);
    const dbTodayTokens = tasks.reduce((sum, t) => {
      const isAudited = t.auditStatus === 'PASSED' || t.auditStatus === 'FATAL';
      if (!isAudited) return sum;
      const by = (t.auditedBy || t.audited_by_name || '').toLowerCase();
      const isAi = by.includes('gemini') || by.includes('ai') || by.includes('gpt') || by.includes('claude') || by.includes('llama') || by.includes('groq') || by.includes('openrouter');
      if (!isAi) return sum;
      const auditedAt = t.auditedAt || t.audited_at;
      if (!auditedAt) return sum;
      try {
        const audDate = new Date(auditedAt);
        const audDateStr = `${audDate.getFullYear()}-${String(audDate.getMonth() + 1).padStart(2, '0')}-${String(audDate.getDate()).padStart(2, '0')}`;
        if (audDateStr === today) {
          return sum + (Number(t.totalTokens || t.total_tokens) || 2000);
        }
      } catch (_) {}
      return sum;
    }, 0);

    // B. Fetch persistent tracker from Supabase system_settings table (website backend)
    settingsApi.getSetting(`daily_ai_audit_tracker_${today}`, null).then(remote => {
      if (!isMounted) return;
      const remoteReqs = (remote && remote.date === today && typeof remote.requests === 'number') ? remote.requests : 0;
      const remoteToks = (remote && remote.date === today && typeof remote.totalTokens === 'number') ? remote.totalTokens : 0;

      const finalRequests = Math.max(remoteReqs, dbTodayCount, dailyAiUsage.date === today ? (dailyAiUsage.requests || 0) : 0);
      const finalTokens = Math.max(remoteToks, dbTodayTokens, dailyAiUsage.date === today ? (dailyAiUsage.totalTokens || 0) : 0);

      const record = {
        date: today,
        requests: finalRequests,
        totalTokens: finalTokens,
        lastUpdated: new Date().toISOString()
      };

      setDailyAiUsage(record);
      try {
        localStorage.setItem(`locus_daily_ai_audit_tracker_${today}`, JSON.stringify(record));
      } catch (_) {}

      // Keep Supabase updated with the highest accurate count
      if (remoteReqs < finalRequests) {
        settingsApi.setSetting(`daily_ai_audit_tracker_${today}`, record).catch(() => {});
      }
    }).catch(() => {
      if (!isMounted) return;
      const finalRequests = Math.max(dbTodayCount, dailyAiUsage.date === today ? (dailyAiUsage.requests || 0) : 0);
      const finalTokens = Math.max(dbTodayTokens, dailyAiUsage.date === today ? (dailyAiUsage.totalTokens || 0) : 0);
      setDailyAiUsage({
        date: today,
        requests: finalRequests,
        totalTokens: finalTokens,
        lastUpdated: new Date().toISOString()
      });
    });

    return () => { isMounted = false; };
  }, [tasks]);

  // 2. 00:00 Midnight Auto-Reset Timer: automatically resets count to 0 at midnight every day
  useEffect(() => {
    const checkMidnight = () => {
      const currentDay = getTodayDateString();
      setDailyAiUsage(prev => {
        if (prev.date !== currentDay) {
          // 00:00 Midnight has passed! Start new daily tracker at 0
          const fresh = {
            date: currentDay,
            requests: 0,
            totalTokens: 0,
            lastUpdated: new Date().toISOString()
          };
          try {
            localStorage.setItem(`locus_daily_ai_audit_tracker_${currentDay}`, JSON.stringify(fresh));
          } catch (_) {}
          settingsApi.setSetting(`daily_ai_audit_tracker_${currentDay}`, fresh).catch(() => {});
          return fresh;
        }
        return prev;
      });
    };

    // Check every 30 seconds for 00:00 date crossover
    const interval = setInterval(checkMidnight, 30000);
    return () => clearInterval(interval);
  }, []);

  // Provider Selection Switcher
  const handleSelectProvider = (provId) => {
    setActiveProvider(provId);
    saveActiveAiProvider(provId);
    const savedKey = getProviderApiKey(provId);
    setApiKey(savedKey);
    const savedModel = getProviderModel(provId);
    setSelectedModel(savedModel);
    const prov = SUPPORTED_PROVIDERS.find(p => p.id === provId) || SUPPORTED_PROVIDERS[0];
    setAvailableModels(prov.defaultModels || []);
    setKeyStatus({ tested: false, valid: false, message: '' });
  };

  // Sync API Key to Storage for active provider
  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    saveProviderApiKey(activeProvider, newKey);
    setKeyStatus({ tested: false, valid: false, message: '' });
  };

  // Sync Selected Model for active provider
  const handleModelChange = (modelId) => {
    setSelectedModel(modelId);
    saveProviderModel(activeProvider, modelId);
  };

  // Sync Auto-Failover Toggle
  const handleToggleFailover = (enabled) => {
    setAllowFailover(enabled);
    saveProviderFailoverEnabled(enabled);
  };

  // Test API Key across any supported provider & Auto-Discover Models
  const handleTestKey = async () => {
    const prov = SUPPORTED_PROVIDERS.find(p => p.id === activeProvider) || SUPPORTED_PROVIDERS[0];
    if (!apiKey.trim()) {
      setKeyStatus({ tested: true, valid: false, message: `Please enter an API Key for ${prov.name}.` });
      return;
    }
    setKeyTesting(true);
    try {
      const res = await testAnyProviderApiKey(activeProvider, apiKey, selectedModel);
      if (res.availableModels && res.availableModels.length > 0) {
        setAvailableModels(res.availableModels);
        const isInvalidLegacy = selectedModel.includes('1.5') || selectedModel.includes('2.5');
        const exists = res.availableModels.some(m => m.id === selectedModel);
        if ((!exists || isInvalidLegacy) && res.activeModel) {
          setSelectedModel(res.activeModel);
          saveProviderModel(activeProvider, res.activeModel);
        }
      }
      setKeyStatus({ 
        tested: true, 
        valid: true, 
        message: `Connected to ${prov.name} (${res.activeModel || selectedModel})` 
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

  // Execute AI Audit on a single task (Universal Multi-Provider with Quota Failover)
  const runAiAuditOnTask = async (taskToAudit, shouldCommit = autoCommitToDb) => {
    if (!taskToAudit) return null;
    const prov = SUPPORTED_PROVIDERS.find(p => p.id === activeProvider) || SUPPORTED_PROVIDERS[0];
    if (!apiKey.trim()) {
      alert(`Please enter and connect your ${prov.name} API Key first.`);
      return null;
    }

    setIsAuditing(true);
    setCurrentProgress({ step: 'INITIALIZING', message: `Starting AI inspection with ${prov.name} for Task #${taskToAudit.taskId || taskToAudit.id}...` });

    try {
      const result = await auditTaskMultiProvider({
        task: taskToAudit,
        providerId: activeProvider,
        apiKey,
        modelId: selectedModel,
        rules: INITIAL_CENTRAL_RULES,
        onProgress: (prog) => setCurrentProgress(prog),
        enableProviderFailover: allowFailover
      });

      setActiveAuditResult({
        taskId: taskToAudit.id || taskToAudit.taskId,
        task: taskToAudit,
        result
      });

      // Calculate exact tokens used
      const totToks = result.totalTokens || 2000;
      const promptToks = Math.round(totToks * 0.8);
      const respToks = Math.round(totToks * 0.2);

      // Overwrite Auditor Name directly with the exact model & provider used (e.g. gpt-4o-mini (OPENAI))
      const auditorName = result.auditorName || `${result.modelUsed || selectedModel} (${(result.providerUsed || activeProvider).toUpperCase()})`;
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

      // Update and persist daily AI task request counter to website storage (resets at 00:00 everyday)
      const currentToday = getTodayDateString();
      setDailyAiUsage(prev => {
        const isSameDay = prev.date === currentToday;
        const nextRequests = (isSameDay ? prev.requests : 0) + 1;
        const nextTokens = (isSameDay ? prev.totalTokens : 0) + totToks;
        const updatedDaily = {
          date: currentToday,
          requests: nextRequests,
          totalTokens: nextTokens,
          lastUpdated: new Date().toISOString()
        };
        try {
          localStorage.setItem(`locus_daily_ai_audit_tracker_${currentToday}`, JSON.stringify(updatedDaily));
        } catch (_) {}
        // Persist to Supabase website storage so it survives refreshes across all users
        settingsApi.setSetting(`daily_ai_audit_tracker_${currentToday}`, updatedDaily).catch(() => {});
        return updatedDaily;
      });

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

  // Filtered Forensic Flagged Tasks
  const filteredForensicFlags = useMemo(() => {
    return forensicFlags.filter(item => {
      if (forensicDefectFilter === 'BLUR') {
        const hasBlur = item.flaggedSlots?.some(s => s.defectType === 'EXTREME_BLUR');
        if (!hasBlur) return false;
      } else if (forensicDefectFilter === 'BLACK_BLANK') {
        const hasBlackOrBlank = item.flaggedSlots?.some(s => s.defectType !== 'EXTREME_BLUR');
        if (!hasBlackOrBlank) return false;
      }

      if (forensicSearchQuery.trim()) {
        const q = forensicSearchQuery.toLowerCase().trim();
        const mId = String(item.taskId).toLowerCase().includes(q);
        const mFe = String(item.task?.feName || '').toLowerCase().includes(q);
        const mCode = String(item.task?.feCode || '').toLowerCase().includes(q);
        const mCity = String(item.task?.facilityCode || item.task?.city || '').toLowerCase().includes(q);
        if (!mId && !mFe && !mCode && !mCity) return false;
      }

      return true;
    });
  }, [forensicFlags, forensicDefectFilter, forensicSearchQuery]);

  // Forensic Pre-Screen Execution
  const handleRunForensicPreScreen = async () => {
    if (queueTasks.length === 0) {
      alert('No pending tasks in queue to pre-screen.');
      return;
    }

    setIsForensicScanning(true);
    setForensicProgress({ current: 0, total: queueTasks.length, taskName: '', message: 'Starting Forensic Image Integrity & Blur Inspection...' });
    forensicAbortControllerRef.current = new AbortController();

    try {
      const results = await scanTasksForAiExclusion(
        queueTasks,
        (prog) => setForensicProgress(prog),
        forensicAbortControllerRef.current.signal
      );

      setForensicFlags(results);

      // Exclude all flagged tasks by default, as requested!
      const newExcluded = new Set(excludedTaskIds);
      results.forEach(r => newExcluded.add(String(r.taskId)));
      setExcludedTaskIds(newExcluded);

      // Switch to FORENSICS tab so user can review the task cards immediately
      setActiveConsoleTab('FORENSICS');
    } catch (err) {
      console.error('Forensic pre-screening error:', err);
      alert('Forensic screening failed: ' + err.message);
    } finally {
      setIsForensicScanning(false);
    }
  };

  // Toggle exclusion for a single task (user unchecks false-positive to allow AI audit)
  const handleToggleExcludeTask = (taskId) => {
    const sId = String(taskId);
    setExcludedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(sId)) {
        next.delete(sId);
      } else {
        next.add(sId);
      }
      return next;
    });
  };

  // Bulk check or uncheck all flagged tasks
  const handleToggleAllExcluded = (selectAll = true) => {
    setExcludedTaskIds(prev => {
      const next = new Set(prev);
      forensicFlags.forEach(f => {
        if (selectAll) next.add(String(f.taskId));
        else next.delete(String(f.taskId));
      });
      return next;
    });
  };

  // Direct Fatal Strike in DB with 0 AI tokens consumed
  const handleDirectFatalStrike = async (flaggedItem) => {
    const taskId = flaggedItem.taskId;
    const reason = `FATAL: Image Forensics detected fraudulent blank / covered camera / blurry photo upload (${flaggedItem.primaryReason}).`;
    try {
      await tasksApi.failAudit({
        taskId,
        taskData: flaggedItem.task,
        failedReasons: [flaggedItem.primaryReason || 'Fraudulent / Defective Photo Upload'],
        remarks: reason,
        criteriaStatus: {},
        replacements: [],
        auditorName: 'Image Forensics Engine',
        auditorLocation: flaggedItem.task?.facilityCode || 'Forensic Lab',
        immediateEmail: false,
        totalTokens: 0
      });
      if (onTaskAudited) {
        onTaskAudited(taskId, 'FATAL');
      }
      setForensicFlags(prev => prev.filter(f => String(f.taskId) !== String(taskId)));
      setExcludedTaskIds(prev => {
        const next = new Set(prev);
        next.delete(String(taskId));
        return next;
      });
      alert(`Task #${taskId} has been marked as FATAL in the database with 0 AI tokens consumed!`);
    } catch (err) {
      alert(`Failed to commit FATAL verdict: ${err.message}`);
    }
  };

  // Bulk Auto-Fail all excluded tasks
  const handleAutoFailAllExcluded = async () => {
    const toFail = forensicFlags.filter(f => excludedTaskIds.has(String(f.taskId)));
    if (toFail.length === 0) {
      alert('No excluded tasks currently selected.');
      return;
    }
    if (!confirm(`Are you sure you want to mark all ${toFail.length} excluded tasks as FATAL in the database? This consumes 0 AI tokens.`)) {
      return;
    }
    let count = 0;
    for (const item of toFail) {
      try {
        await tasksApi.failAudit({
          taskId: item.taskId,
          taskData: item.task,
          failedReasons: [item.primaryReason || 'Fraudulent / Defective Photo Upload'],
          remarks: `FATAL: Image Forensics detected fraudulent blank / covered camera / blurry photo upload (${item.primaryReason}).`,
          criteriaStatus: {},
          replacements: [],
          auditorName: 'Image Forensics Engine',
          auditorLocation: item.task?.facilityCode || 'Forensic Lab',
          immediateEmail: false,
          totalTokens: 0
        });
        if (onTaskAudited) onTaskAudited(item.taskId, 'FATAL');
        count++;
      } catch (_) {}
    }
    setForensicFlags(prev => prev.filter(f => !toFail.some(tf => String(tf.taskId) === String(f.taskId))));
    setExcludedTaskIds(prev => {
      const next = new Set(prev);
      toFail.forEach(tf => next.delete(String(tf.taskId)));
      return next;
    });
    alert(`Successfully marked ${count} tasks as FATAL in database with 0 AI tokens consumed!`);
  };

  // Run Batch AI Auditing Loop (automatically skips any tasks excluded by the forensic pre-screener)
  const runBatchAuditing = async (batchCount = 5) => {
    const prov = SUPPORTED_PROVIDERS.find(p => p.id === activeProvider) || SUPPORTED_PROVIDERS[0];
    if (!apiKey.trim()) {
      alert(`Please enter and connect your ${prov.name} API Key first.`);
      return;
    }
    if (queueTasks.length === 0) {
      alert('No pending tasks in queue.');
      return;
    }

    // Filter out tasks excluded by forensic screener
    const eligibleTasks = queueTasks.filter(t => !excludedTaskIds.has(String(t.id || t.taskId)));
    if (eligibleTasks.length === 0) {
      alert(`All ${queueTasks.length} pending tasks in queue are currently excluded from AI audits by the Forensic Screener. Uncheck any false-positive tasks in the Forensic Screener tab to evaluate them.`);
      return;
    }

    const tasksToProcess = eligibleTasks.slice(0, batchCount);
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
      return by.includes('gemini') || by.includes('ai') || by.includes('gpt') || by.includes('claude') || by.includes('llama') || by.includes('groq') || by.includes('openrouter') || rem.includes('ai passed') || rem.includes('ai fatal') || rem.includes('(score:');
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
    if (verifyDeckViewMode === 'RAPID_DECK') {
      const idx = Math.min(Math.max(0, deckTaskIndex), filteredVerifyTasks.length - 1);
      return filteredVerifyTasks[idx] || filteredVerifyTasks[0] || null;
    }
    if (selectedVerifyTaskId) {
      const found = filteredVerifyTasks.find(t => String(t.id || t.taskId) === String(selectedVerifyTaskId));
      if (found) return found;
    }
    return filteredVerifyTasks[0];
  }, [filteredVerifyTasks, selectedVerifyTaskId, verifyDeckViewMode, deckTaskIndex]);

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

  // Rapid Deck Keyboard Navigation Hotkeys
  useEffect(() => {
    if (activeConsoleTab !== 'VERIFY' || verifyDeckViewMode !== 'RAPID_DECK') return;
    if (failAiModalOpen || overrideModalOpen || previewImage) return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleConfirmAiVerdict();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleOpenFailAiAuditModal();
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setDeckTaskIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setDeckTaskIndex(prev => Math.min(filteredVerifyTasks.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeConsoleTab, verifyDeckViewMode, failAiModalOpen, overrideModalOpen, previewImage, deckTaskIndex, filteredVerifyTasks, selectedVerifyTask]);

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
      
      if (verifyDeckViewMode === 'RAPID_DECK') {
        if (deckTaskIndex < filteredVerifyTasks.length - 1) {
          setDeckTaskIndex(prev => prev + 1);
        }
      } else {
        alert(`Audit for Task #${selectedVerifyTask.taskId || selectedVerifyTask.id} confirmed and verified by ${reviewerName}!`);
      }
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

  // Open Fail AI Audit / Request Re-Audit Modal
  const handleOpenFailAiAuditModal = () => {
    if (!selectedVerifyTask) return;
    setFailAiReasonInput('');
    setFailAiModalOpen(true);
  };

  // Execute Fail AI Audit (Mark as failed and route to Re-Audit queue)
  const handleExecuteFailAiAudit = async () => {
    if (!selectedVerifyTask) return;
    if (!failAiReasonInput.trim()) {
      alert('Please enter a clinical reason why this AI audit failed and needs human re-check.');
      return;
    }

    setIsVerifyingAction(true);
    try {
      const reviewerName = currentUser?.name || currentUser?.email || 'QA Reviewer';
      const taskId = selectedVerifyTask.id || selectedVerifyTask.taskId;
      const cleanReason = failAiReasonInput.trim();
      const origRemarks = selectedVerifyTask.remarks || selectedVerifyTask.auditor_remarks || '';

      await tasksApi.failAiAudit({
        taskId,
        taskData: selectedVerifyTask,
        reviewerName,
        reason: cleanReason,
        originalRemarks: origRemarks,
        criteriaStatus: selectedVerifyTask.criteriaStatus || selectedVerifyTask.criteria_status || {},
        failedReasons: selectedVerifyTask.failedReasons || selectedVerifyTask.failed_reasons || []
      });

      // Update session re-audit map
      setSessionReAuditMap(prev => ({
        ...prev,
        [String(taskId)]: {
          reason: cleanReason,
          requestedAt: new Date().toLocaleTimeString()
        }
      }));

      if (onTaskAudited) {
        onTaskAudited(taskId, 'NEEDS_REAUDIT');
      }

      setFailAiModalOpen(false);
      setFailAiReasonInput('');

      if (verifyDeckViewMode === 'RAPID_DECK') {
        if (deckTaskIndex < filteredVerifyTasks.length - 1) {
          setDeckTaskIndex(prev => prev + 1);
        }
      } else {
        alert(`AI Audit for Task #${selectedVerifyTask.taskId || selectedVerifyTask.id} marked as FAILED and sent to the Re-Audit Queue!`);
        setActiveConsoleTab('REAUDIT');
      }
    } catch (err) {
      alert(`Failed to queue task for re-audit: ${err.message}`);
    } finally {
      setIsVerifyingAction(false);
    }
  };

  // List of tasks queued for Re-Audit
  const reAuditTasks = useMemo(() => {
    const list = [];
    const seenIds = new Set();

    tasks.forEach(t => {
      const id = String(t.id || t.taskId);
      const sessionEntry = sessionReAuditMap[id];
      const isDbReAudit = Boolean(
        t.needsReAudit || 
        t.needs_reaudit || 
        t.auditStatus === 'NEEDS_REAUDIT' || 
        t.audit_status === 'NEEDS_REAUDIT' ||
        (t.remarks && (t.remarks.includes('[AI Audit Failed') || t.remarks.includes('[AI Audit Rejected'))) ||
        (t.auditor_remarks && (t.auditor_remarks.includes('[AI Audit Failed') || t.auditor_remarks.includes('[AI Audit Rejected')))
      );

      if ((sessionEntry || isDbReAudit) && !seenIds.has(id)) {
        seenIds.add(id);
        const reason = sessionEntry?.reason || t.reAuditReason || (() => {
          const rem = t.remarks || t.auditor_remarks || '';
          const match = rem.match(/\[AI Audit (?:Failed|Rejected)[^:]*: ([^\]]+)\]/);
          return match ? match[1] : 'AI audit was flagged as inaccurate by QA Reviewer';
        })();

        list.push({
          ...t,
          isAiReAudit: true,
          needsReAudit: true,
          reAuditReason: reason,
          reAuditRequestedAt: sessionEntry?.requestedAt || t.updated_at || 'Recently'
        });
      }
    });

    return list;
  }, [tasks, sessionReAuditMap]);

  // Filtered Re-Audit Tasks
  const filteredReAuditTasks = useMemo(() => {
    return reAuditTasks.filter(t => {
      if (reAuditVerdictFilter !== 'ALL' && t.auditStatus !== reAuditVerdictFilter) return false;
      if (reAuditCityFilter !== 'ALL') {
        const c = t.facilityCode || t.city || '';
        if (c.toLowerCase() !== reAuditCityFilter.toLowerCase()) return false;
      }
      if (reAuditSearchQuery.trim()) {
        const q = reAuditSearchQuery.toLowerCase().trim();
        const mId = String(t.taskId || t.id || '').toLowerCase().includes(q);
        const mFe = String(t.feName || '').toLowerCase().includes(q);
        const mCode = String(t.feCode || '').toLowerCase().includes(q);
        if (!mId && !mFe && !mCode) return false;
      }
      return true;
    });
  }, [reAuditTasks, reAuditVerdictFilter, reAuditCityFilter, reAuditSearchQuery]);

  // Distinct cities in Re-Audit tasks
  const reAuditAvailableCities = useMemo(() => {
    const s = new Set();
    reAuditTasks.forEach(t => {
      const c = t.facilityCode || t.city;
      if (c) s.add(c);
    });
    return Array.from(s).sort();
  }, [reAuditTasks]);

  // Re-Audit Submission Handlers
  const handleStartReAudit = (task) => {
    setInspectingReAuditTask(task);
  };

  const handlePassReAudit = async (taskId, auditData) => {
    try {
      const auditorName = currentUser?.name || currentUser?.email || 'Clinical Auditor';
      const targetTask = inspectingReAuditTask || tasks.find(t => String(t.id || t.taskId) === String(taskId));
      const remarks = `[Clinical Re-Audit PASSED by ${auditorName}]: ${auditData?.remarks || 'Verified compliant with clinical SOP upon human re-inspection.'}`;

      await tasksApi.passAudit({
        taskId,
        auditorName,
        auditorLocation: targetTask?.facilityCode || 'Central QA',
        remarks,
        criteriaStatus: auditData?.criteriaStatus || {},
        replacements: auditData?.replacements || [],
        taskData: targetTask,
        totalTokens: targetTask?.totalTokens || 0
      });

      // Remove from session re-audit map
      setSessionReAuditMap(prev => {
        const copy = { ...prev };
        delete copy[String(taskId)];
        return copy;
      });

      if (onTaskAudited) {
        onTaskAudited(taskId, 'PASSED');
      }

      setInspectingReAuditTask(null);
      alert(`Clinical Re-Audit successfully PASSED for Task #${targetTask?.taskId || taskId}!`);
    } catch (err) {
      alert(`Failed to submit re-audit pass: ${err.message}`);
    }
  };

  const handleFatalReAudit = async (taskId, auditData) => {
    try {
      const auditorName = currentUser?.name || currentUser?.email || 'Clinical Auditor';
      const targetTask = inspectingReAuditTask || tasks.find(t => String(t.id || t.taskId) === String(taskId));
      const remarks = `[Clinical Re-Audit FATAL by ${auditorName}]: ${auditData?.remarks || 'Non-compliance confirmed upon human re-inspection.'}`;

      await tasksApi.failAudit({
        taskId,
        taskData: targetTask,
        failedReasons: auditData?.failedReasons || ['Human Re-Audit Clinical Non-Compliance'],
        remarks,
        criteriaStatus: auditData?.criteriaStatus || {},
        replacements: auditData?.replacements || [],
        auditorName,
        auditorLocation: targetTask?.facilityCode || 'Central QA',
        immediateEmail: false,
        totalTokens: targetTask?.totalTokens || 0
      });

      // Remove from session re-audit map
      setSessionReAuditMap(prev => {
        const copy = { ...prev };
        delete copy[String(taskId)];
        return copy;
      });

      if (onTaskAudited) {
        onTaskAudited(taskId, 'FATAL');
      }

      setInspectingReAuditTask(null);
      alert(`Clinical Re-Audit FATAL STRIKE confirmed for Task #${targetTask?.taskId || taskId}!`);
    } catch (err) {
      alert(`Failed to submit re-audit fatal: ${err.message}`);
    }
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
            <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-xl text-center" title="Total AI audit requests sent today across the website (resets at 00:00 every day)">
              <span className="text-[9px] uppercase font-bold text-sky-400 block">AI Requests Today</span>
              <span className="text-base font-black text-white">{dailyAiUsage.requests}</span>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-xl text-center" title="Remaining requests out of 1,500 daily quota">
              <span className="text-[9px] uppercase font-bold text-emerald-400 block">Daily Quota Left</span>
              <span className="text-base font-black text-emerald-400">
                {Math.max(0, (activeModelObj.rpd || 1500) - dailyAiUsage.requests)}
              </span>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-xl text-center">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">This Session</span>
              <span className="text-base font-black text-indigo-400">{sessionHistory.length}</span>
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

        <button
          type="button"
          onClick={() => setActiveConsoleTab('REAUDIT')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeConsoleTab === 'REAUDIT'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-950/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
        >
          <RotateCcw className="w-4 h-4 text-amber-400" />
          <span>Clinical Re-Audit Queue</span>
          {reAuditTasks.length > 0 ? (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-black font-black text-[10px] animate-pulse">
              {reAuditTasks.length} Needs Check
            </span>
          ) : (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-950 text-[10px] text-slate-400 border border-slate-800 font-mono">
              0
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveConsoleTab('FORENSICS')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeConsoleTab === 'FORENSICS'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-950/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
          title="Identify black, blank, and blurry photos client-side to exclude from AI audits and save quota"
        >
          <ShieldAlert className="w-4 h-4 text-purple-400" />
          <span>Forensic Defect Screener</span>
          {forensicFlags.length > 0 ? (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-purple-500 text-white font-black text-[10px] animate-pulse">
              {forensicFlags.length} Flagged
            </span>
          ) : (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-950 text-[10px] text-slate-400 border border-slate-800 font-mono">
              0
            </span>
          )}
        </button>
      </div>

      {activeConsoleTab === 'EXECUTE' && (
        <>
      {/* Universal Multi-Provider AI API Key & Model Configuration Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Multi-Provider AI Inspection Engine</span>
            <span className="text-[10px] text-slate-400 font-medium">({SUPPORTED_PROVIDERS.length} Multimodal Providers Supported)</span>
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

        {/* Multi-Provider Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
          {SUPPORTED_PROVIDERS.map(p => {
            const hasKey = Boolean(getProviderApiKey(p.id));
            const isActive = activeProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProvider(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-950 border border-sky-400/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
                }`}
              >
                <span>{p.icon}</span>
                <span>{p.name}</span>
                {hasKey && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-300' : 'bg-emerald-400'}`}
                    title="API Key Configured"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Key Input Field for Active Provider */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleSaveApiKey(e.target.value)}
              placeholder={`Paste ${SUPPORTED_PROVIDERS.find(p => p.id === activeProvider)?.name || 'AI'} API Key (e.g. ${SUPPORTED_PROVIDERS.find(p => p.id === activeProvider)?.keyPlaceholder || 'sk-...'})`}
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
            <span>{keyTesting ? 'Testing Connection...' : 'Test Connection'}</span>
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
                      {m.label || `${m.displayName || m.id} (${m.inputTokensFormatted || '1M'} Tokens)`}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-sky-400 bg-slate-950 border border-slate-700 px-2.5 py-1 rounded-lg">
                    {selectedModel}
                  </span>
                  <span className="text-[10px] text-slate-500 italic">
                    (Auto-discovers model token limits on Test)
                  </span>
                </div>
              )}

              {/* Multi-Provider Auto-Failover Toggle */}
              <label 
                className="flex items-center gap-1.5 text-[11px] text-slate-300 font-medium cursor-pointer select-none bg-slate-950 border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                title="If primary provider runs out of credits or encounters a rate limit (HTTP 429), automatically failover to any other configured AI provider so audits never stall"
              >
                <input
                  type="checkbox"
                  checked={allowFailover}
                  onChange={(e) => handleToggleFailover(e.target.checked)}
                  className="rounded border-slate-700 text-sky-500 focus:ring-sky-500 focus:ring-offset-0 bg-slate-900 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Auto-Failover Across Providers on 429 / Zero Credits</span>
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
                  Deep Reasoning Model
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
              <span>{showModelGuide ? 'Hide Provider Guide' : 'Multi-Provider Strategy Guide'}</span>
            </button>
          </div>

          {/* Multi-Provider Selection Explainer Guide Card */}
          {showModelGuide && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-sky-900/50 text-xs text-slate-300 space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-sky-400" />
                  Multi-AI Provider Architecture & Continuous Audit Failover Strategy
                </span>
                <button onClick={() => setShowModelGuide(false)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] leading-relaxed">
                <div className="p-3 rounded-lg bg-sky-950/20 border border-sky-800/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-300">⚡ Google Gemini</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">FREE 15 RPM</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    <strong>Best for:</strong> Daily high-volume bulk runs at zero cost. 1,500 free audits/day per key. Supports sister model auto-failover (3.8 &rarr; 3.7 &rarr; 3.5).
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300">🟢 OpenAI (GPT-4o-mini)</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-sky-500/20 text-sky-300 rounded">HIGH RELIABILITY</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    <strong>Best for:</strong> Instant backup failover. Ultra-fast response time (~1.2s per 5 photos) and fraction-of-a-cent pricing with 99.9% uptime.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-purple-950/20 border border-purple-800/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-300">🟣 Anthropic / Groq / Router</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded">DEEP VISION</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    <strong>Best for:</strong> Claude 3.5 Sonnet provides unmatched optical fidelity on blurry ID cards; Groq LPU delivers sub-second (~500ms) evaluations.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Live Token & Daily Request Counter Strip (Website-wide daily tracking, resets 00:00 midnight) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* 1. Daily Requests Counter (Persistent on Website, Resets at 00:00) */}
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="flex items-center gap-1 text-sky-400" title="Daily AI audit requests sent across website today. Persists on refresh and automatically resets to 0 at 00:00 everyday.">
                  <Activity className="w-3 h-3" /> Daily Requests
                </span>
                <span className="text-sky-300 font-mono font-bold">Resets 00:00</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-white">{dailyAiUsage.requests}</span>
                <span className="text-[10px] text-slate-400">requests today</span>
              </div>
              <div className="mt-1 text-[10px] text-sky-400 font-mono flex items-center justify-between">
                <span>{((dailyAiUsage.requests / (activeModelObj.rpd || 1500)) * 100).toFixed(1)}% of 1,500</span>
                <span className="text-slate-500">Session: {sessionUsage.requests}</span>
              </div>
            </div>

            {/* 2. Token Counter */}
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Layers className="w-3 h-3" /> Today's Tokens
                </span>
                <span className="text-emerald-300 font-mono font-bold">~2.0k / task</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-emerald-400">
                  {dailyAiUsage.totalTokens.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400">tokens consumed</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500 font-mono">
                Session: {sessionUsage.totalTokens.toLocaleString()}
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
              <div className="mt-1 text-[10px] text-slate-500 font-mono">
                Rate: {activeModelObj.rpm || 15} RPM
              </div>
            </div>

            {/* 4. Daily Free Tier Allowance Remaining */}
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="flex items-center gap-1 text-amber-400">
                  <Zap className="w-3 h-3" /> Quota Remaining
                </span>
                <span className="text-amber-300 font-mono font-bold">1,500/day</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-amber-300">
                  {Math.max(0, (activeModelObj.rpd || 1500) - dailyAiUsage.requests).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400">requests left today</span>
              </div>
              <div className="mt-1 w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-slate-800">
                <div 
                  className="bg-amber-400 h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (dailyAiUsage.requests / (activeModelObj.rpd || 1500)) * 100)}%` }}
                />
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

            {/* Run Forensic Pre-Screen Button */}
            <button
              onClick={handleRunForensicPreScreen}
              disabled={isForensicScanning || queueTasks.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white shadow-lg shadow-purple-600/25 flex items-center gap-2 transition-all cursor-pointer"
              title="Pre-screen queue for blank/black/blurry images to exclude from AI audit and save API quota"
            >
              {isForensicScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-200" /> : <ShieldAlert className="w-3.5 h-3.5 text-purple-200" />}
              <span>Run Forensic Pre-Screen</span>
              {forensicFlags.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-purple-950 text-purple-200 text-[10px] font-mono border border-purple-400/40">
                  {forensicFlags.length} Excluded
                </span>
              )}
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

        {/* Forensic Pre-Screening Progress Bar */}
        {isForensicScanning && (
          <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl space-y-1.5 text-xs text-purple-300 animate-pulse">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                <span>Forensic Pre-Screening Running:</span>
              </span>
              <span>{forensicProgress.current} / {forensicProgress.total} Tasks</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-purple-500/20">
              <div 
                className="bg-purple-500 h-full transition-all duration-300"
                style={{ width: `${forensicProgress.total > 0 ? (forensicProgress.current / forensicProgress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400">{forensicProgress.message}</p>
          </div>
        )}

        {/* Forensic Pre-Screen Results Banner */}
        {forensicFlags.length > 0 && !isForensicScanning && (
          <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2 text-purple-300">
              <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                <strong>Forensic Quality Gate:</strong> {forensicFlags.length} tasks flagged with blank, covered camera, or extremely blurry photos ({excludedTaskIds.size} excluded from AI audits to preserve 1,500 daily quota).
              </span>
            </div>
            <button
              onClick={() => setActiveConsoleTab('FORENSICS')}
              className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md shadow-purple-600/20 cursor-pointer"
            >
              Review Flagged Task Cards ({forensicFlags.length}) →
            </button>
          </div>
        )}
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
      )}

      {/* TAB 2: HUMAN REVIEW & VERIFICATION HUB */}
      {activeConsoleTab === 'VERIFY' && (
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

            <div 
              onClick={() => setVerifyVerdictFilter(verifyVerdictFilter === 'PASSED' ? 'ALL' : 'PASSED')}
              className={`p-3.5 rounded-2xl shadow-lg cursor-pointer transition-all border ${
                verifyVerdictFilter === 'PASSED'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-emerald-950/50 ring-1 ring-emerald-500'
                  : 'bg-slate-900 border-emerald-950 hover:border-emerald-600/50'
              }`}
              title="Filter to inspect all AI-passed visits for False Positives"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  AI Passed (Audit False Positives)
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Quality Check
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-emerald-400">{verificationStats.passed}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {verificationStats.total > 0 ? ((verificationStats.passed / verificationStats.total) * 100).toFixed(0) : 0}% of AI Visits
                </span>
              </div>
            </div>

            <div 
              onClick={() => setVerifyVerdictFilter(verifyVerdictFilter === 'FATAL' ? 'ALL' : 'FATAL')}
              className={`p-3.5 rounded-2xl shadow-lg cursor-pointer transition-all border ${
                verifyVerdictFilter === 'FATAL'
                  ? 'bg-red-950/40 border-red-500 shadow-red-950/50 ring-1 ring-red-500'
                  : 'bg-slate-900 border-red-950 hover:border-red-600/50'
              }`}
              title="Filter to review AI fatal strikes"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block mb-1">
                AI Fatal Strikes
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-red-400">{verificationStats.fatal}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {verificationStats.total > 0 ? ((verificationStats.fatal / verificationStats.total) * 100).toFixed(0) : 0}% of AI Visits
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

          {/* Deck View Mode Switcher & Progress Header */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVerifyDeckViewMode('RAPID_DECK')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  verifyDeckViewMode === 'RAPID_DECK'
                    ? 'bg-gradient-to-r from-emerald-600 to-sky-600 text-white shadow-lg shadow-sky-950/40 ring-1 ring-sky-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ Rapid Speed-Deck (1 Task at a Time)</span>
              </button>

              <button
                type="button"
                onClick={() => setVerifyDeckViewMode('SPLIT')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  verifyDeckViewMode === 'SPLIT'
                    ? 'bg-slate-800 text-white border border-slate-600 shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>📋 Classic Queue & Split View</span>
              </button>
            </div>

            {verifyDeckViewMode === 'RAPID_DECK' && filteredVerifyTasks.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span className="px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-300 font-bold">
                  Card {deckTaskIndex + 1} of {filteredVerifyTasks.length}
                </span>
                <span className="hidden sm:inline text-slate-500">
                  Hotkeys: <kbd className="px-1 py-0.2 bg-slate-800 rounded text-emerald-300 font-bold">← AI Pass</kbd> <kbd className="px-1 py-0.2 bg-slate-800 rounded text-rose-300 font-bold">AI Reject →</kbd>
                </span>
              </div>
            )}
          </div>

          {/* RAPID INSPECTION DECK VIEW */}
          {verifyDeckViewMode === 'RAPID_DECK' ? (
            filteredVerifyTasks.length === 0 ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCheck className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">All Caught Up!</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Every AI-audited task in this view has been verified by human review. Switch filters or head to the Clinical Re-Audit Queue to check flagged tasks.
                </p>
                {reAuditTasks.length > 0 && (
                  <button
                    onClick={() => setActiveConsoleTab('REAUDIT')}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-lg shadow-amber-950/40 inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Open Clinical Re-Audit Queue ({reAuditTasks.length})</span>
                  </button>
                )}
              </div>
            ) : selectedVerifyTask ? (
              <div className="space-y-4 max-w-5xl mx-auto">
                {/* Progress bar */}
                <div className="w-full bg-slate-950 rounded-full h-1.5 border border-slate-800 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 via-sky-500 to-amber-500 h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round(((deckTaskIndex + 1) / filteredVerifyTasks.length) * 100))}%` }}
                  />
                </div>

                {/* The Rapid Inspection Card */}
                <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 relative overflow-hidden">
                  {/* Card Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-base font-black text-white">
                          TASK #{selectedVerifyTask.taskId || selectedVerifyTask.id}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {selectedVerifyTask.facilityCode || selectedVerifyTask.city || 'Hub'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {selectedVerifyTask.date || selectedVerifyTask.dispatch_date}
                        </span>
                        {selectedVerifyTask.pin && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            PIN: {selectedVerifyTask.pin}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 font-semibold pt-1">
                        Field Executive: <span className="text-white font-bold">{selectedVerifyTask.feName || 'Unknown'}</span>{' '}
                        <span className="text-slate-500 font-mono">({selectedVerifyTask.feCode || 'FE'})</span> • Customer: <span className="text-slate-300">{selectedVerifyTask.customerName || 'Customer'}</span>
                      </p>
                    </div>

                    {/* Large AI Verdict Badge */}
                    <div className="text-right flex flex-col items-end">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border shadow-md ${
                          selectedVerifyTask.auditStatus === 'PASSED'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-emerald-950/40'
                            : 'bg-red-500/20 text-red-300 border-red-500/50 shadow-red-950/40 animate-pulse'
                        }`}>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI {selectedVerifyTask.auditStatus}</span>
                          <span className="font-mono">({selectedVerifyTask.overallScore ?? 100}/100)</span>
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono mt-1">
                        Model: <strong className="text-sky-300">{selectedVerifyTask.auditedBy || 'gemini-3.8-flash'}</strong> &bull; Conf: {selectedVerifyTask.confidenceScore ?? 95}% &plusmn;{selectedVerifyTask.errorMargin ?? 5}%
                      </span>
                    </div>
                  </div>

                  {/* False Positive Warning (if AI Passed) OR Fatal Strike Breakdown (if AI Fatal) */}
                  {selectedVerifyTask.auditStatus === 'PASSED' ? (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-950 to-amber-950/30 border border-amber-500/40 flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-2 text-amber-300">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="font-bold uppercase tracking-wide text-amber-200">False Positive Quality Inspection:</span>
                          <p className="text-[11px] text-slate-300 leading-tight">
                            AI awarded 100% PASS. Carefully inspect the 5 photos below to ensure ID card is present, torches work, and photos are valid.
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold uppercase">
                        Audit for False Pass
                      </span>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/40 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between font-bold text-red-200">
                        <span className="flex items-center gap-1.5 uppercase tracking-wide">
                          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                          AI Fatal Strike Triggers:
                        </span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-red-500/30 text-white uppercase font-black">
                          Review Non-Compliance
                        </span>
                      </div>
                      <p className="text-[11px] text-red-200 leading-tight font-medium">
                        {(selectedVerifyTask.failedReasons && selectedVerifyTask.failedReasons.length > 0)
                          ? selectedVerifyTask.failedReasons.join('; ')
                          : selectedVerifyTask.remarks || 'Mandatory equipment station non-compliance'}
                      </p>
                    </div>
                  )}

                  {/* 5-Station Photo Gallery (Horizontal Responsive Grid) */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                      5 Mandatory Clinical Photo Stations (Click any photo to zoom):
                    </span>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {[
                        { key: 'selfie', label: '1. Selfie & ID', icon: '🤳' },
                        { key: 'torches', label: '2. Dual Torches', icon: '🔦' },
                        { key: 'visionChart', label: '3. Vision Chart', icon: '📊' },
                        { key: 'toolkit', label: '4. Toolkit', icon: '🧰' },
                        { key: 'frameDisplay', label: '5. Frame Display', icon: '👓' }
                      ].map(st => {
                        const imgUrl = verifyTaskImages[st.key];
                        const crit = verifyCriteriaBreakdown.find(c => c.id === st.key);
                        const isFail = crit?.status === 'FAIL';
                        const isPass = crit?.status === 'PASS';

                        return (
                          <div
                            key={st.key}
                            className={`rounded-2xl border p-2 flex flex-col justify-between bg-slate-950/80 transition-all hover:border-slate-500 ${
                              isFail ? 'border-red-500/50 bg-red-950/10' : isPass ? 'border-emerald-500/40' : 'border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-bold text-slate-200 truncate flex items-center gap-1">
                                <span>{st.icon}</span>
                                <span>{st.label}</span>
                              </span>
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                                isFail
                                  ? 'bg-red-500/30 text-red-200 border border-red-500/40'
                                  : isPass
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {isFail ? 'FAIL' : isPass ? 'PASS' : '-'}
                              </span>
                            </div>

                            {/* Photo Thumbnail */}
                            <div
                              onClick={() => imgUrl && setPreviewImage({ url: imgUrl, title: `${st.label} - Task #${selectedVerifyTask.taskId || selectedVerifyTask.id}` })}
                              className="relative aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center cursor-pointer group/thumb"
                            >
                              {imgUrl ? (
                                <>
                                  <img
                                    src={imgUrl}
                                    alt={st.label}
                                    className="w-full h-full object-cover transition-transform group-hover/thumb:scale-105"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                                    <Maximize2 className="w-5 h-5 text-white" />
                                  </div>
                                </>
                              ) : (
                                <div className="text-center p-2 text-slate-600">
                                  <Camera className="w-6 h-6 mx-auto mb-1 opacity-50" />
                                  <span className="text-[9px] italic">No Photo</span>
                                </div>
                              )}
                            </div>

                            {/* Observation snippet */}
                            <p className={`text-[10px] mt-1.5 line-clamp-2 leading-snug ${
                              isFail ? 'text-red-300 font-semibold' : 'text-slate-400'
                            }`} title={crit?.observations}>
                              {crit?.observations || 'Compliant with clinical SOP standards.'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI Summary Text */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      AI Executive Summary:
                    </span>
                    <p className="text-slate-300 leading-relaxed italic">
                      &ldquo;{selectedVerifyTask.summary || selectedVerifyTask.remarks || 'Audit completed autonomously by Gemini Multimodal Vision engine.'}&rdquo;
                    </p>
                  </div>

                  {/* Human Notes Input */}
                  <div>
                    <input
                      type="text"
                      value={humanNotesInput}
                      onChange={(e) => setHumanNotesInput(e.target.value)}
                      placeholder="Add optional reviewer notes (recorded in compliance audit trail)..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>

                  {/* RAPID VERIFICATION ACTION BUTTONS */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    {/* LEFT BUTTON: AI PASS (CONFIRM & NEXT) */}
                    <button
                      type="button"
                      onClick={handleConfirmAiVerdict}
                      disabled={isVerifyingAction}
                      className="flex-1 min-w-[200px] py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-950/60 transition-all cursor-pointer disabled:opacity-50"
                      title="Confirm and verify this AI audit as accurate, then load next task (Hotkey: Left Arrow or A)"
                    >
                      <CheckCheck className="w-5 h-5" />
                      <span>AI PASS (Confirm & Next)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 font-mono border border-emerald-500/40">
                        &larr; Arrow
                      </span>
                    </button>

                    {/* CENTER NAVIGATION & OVERTURN */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDeckTaskIndex(prev => Math.max(0, prev - 1))}
                        disabled={deckTaskIndex === 0}
                        className="p-3 rounded-2xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
                        title="Previous Card (Hotkey: Up Arrow)"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>

                      <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs font-bold text-slate-300">
                        {deckTaskIndex + 1} / {filteredVerifyTasks.length}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDeckTaskIndex(prev => Math.min(filteredVerifyTasks.length - 1, prev + 1))}
                        disabled={deckTaskIndex >= filteredVerifyTasks.length - 1}
                        className="p-3 rounded-2xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
                        title="Next Card (Hotkey: Down Arrow)"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* RIGHT BUTTON: AI REJECT (FAIL AI & SEND TO RE-AUDIT) */}
                    <button
                      type="button"
                      onClick={handleOpenFailAiAuditModal}
                      disabled={isVerifyingAction}
                      className="flex-1 min-w-[200px] py-4 px-6 rounded-2xl bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 active:scale-[0.98] text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-rose-950/60 transition-all cursor-pointer disabled:opacity-50"
                      title="Reject AI audit as inaccurate/false positive and send for human clinical re-audit (Hotkey: Right Arrow or D)"
                    >
                      <RotateCcw className="w-5 h-5" />
                      <span>AI REJECT (Fail & Re-Audit)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 font-mono border border-rose-500/40">
                        Arrow &rarr;
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null
          ) : (
            /* CLASSIC SPLIT VIEW (When user chooses SPLIT mode) */
            filteredVerifyTasks.length === 0 ? (
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

                      {/* Prominent Quality Alert for AI Passed Tasks (False Positive Inspection) */}
                      {selectedVerifyTask.auditStatus === 'PASSED' && (
                        <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-amber-950/30 border border-amber-500/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                              False Positive Quality Check (AI Passed 5/5):
                            </span>
                            <span className="text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded uppercase">
                              Verification Critical
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            AI evaluated this dispatch as <strong className="text-emerald-400 font-bold">PASSED</strong>. However, AI vision can occasionally produce <strong>false positives</strong> (e.g. failing to notice an obscured/missing ID badge, unlit torches, incorrect vision chart distance, or duplicate/blank photos). Please scrutinize each station photo below.
                          </p>

                          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-slate-400">
                              Did AI overlook a violation or approve bad photos?
                            </span>
                            <div className="flex items-center gap-2 font-bold text-xs">
                              <span className="text-rose-400">Click &ldquo;Fail AI Audit&rdquo;</span>
                              <span className="text-slate-500">or</span>
                              <span className="text-amber-400">&ldquo;Overturn to FATAL&rdquo;</span>
                            </div>
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

                        {/* Fail AI Audit / Send to Re-Audit Button */}
                        <button
                          type="button"
                          onClick={handleOpenFailAiAuditModal}
                          disabled={isVerifyingAction}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-rose-950/40"
                          title="Reject this AI audit as inaccurate or inconclusive and route to human auditors for clinical re-check"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Fail AI Audit (Send for Re-Audit)</span>
                        </button>
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
          ))}

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

          {/* Fail AI Audit & Request Human Re-Audit Modal */}
          {failAiModalOpen && selectedVerifyTask && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                      <RotateCcw className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Fail AI Audit & Queue for Re-Audit</h4>
                      <p className="text-[11px] text-slate-400">Task #{selectedVerifyTask.taskId || selectedVerifyTask.id} • {selectedVerifyTask.feName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFailAiModalOpen(false)}
                    className="text-slate-400 hover:text-white text-xs p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-slate-300">
                    Flag this AI evaluation as inaccurate, hallucinatory, or disputed. This task will be sent to the <strong className="text-amber-400">Clinical Re-Audit Queue</strong> where human auditors can re-audit the visit with all AI-selected criteria highlighted.
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <label className="block font-bold text-slate-300 text-[11px]">
                      Reason AI Audit Failed (Required for audit history):
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {selectedVerifyTask.auditStatus === 'PASSED' ? 'Flagging False Positive' : 'Disputing False Strike'}
                    </span>
                  </div>

                  {/* One-Click Quick Reason Pills */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {selectedVerifyTask.auditStatus === 'PASSED' ? '⚡ Common False Positive Reasons:' : '⚡ Common False Strike Reasons:'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedVerifyTask.auditStatus === 'PASSED' ? [
                        'False Positive: Selfie missing visible ID badge / not official polo',
                        'False Positive: Both torches not illuminated / missing yellow torch',
                        'False Positive: Vision chart distance under 6m / poor lighting',
                        'False Positive: Toolkit missing mandatory occluder or trial frame',
                        'False Positive: Photo blurry / blank / duplicate image uploaded'
                      ] : [
                        'False Strike: Torches visible upon closer inspection in dark background',
                        'False Strike: ID card badge visible on lanyard / pocket',
                        'False Strike: Vision chart clearly legible and proper distance',
                        'False Strike: Toolkit complete despite lighting reflection',
                        'False Strike: SOP fully satisfied upon human review'
                      ]).map((quickReason, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFailAiReasonInput(quickReason)}
                          className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-[10px] font-semibold text-slate-300 border border-slate-700 hover:border-amber-400 transition-colors text-left cursor-pointer"
                        >
                          {quickReason}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    value={failAiReasonInput}
                    onChange={(e) => setFailAiReasonInput(e.target.value)}
                    placeholder={
                      selectedVerifyTask.auditStatus === 'PASSED'
                        ? 'e.g. False Positive: FE is wearing generic t-shirt with no visible ID badge. AI incorrectly passed selfie.'
                        : 'e.g. False Strike: Torches are visible in mirror reflection. AI incorrectly marked as fail.'
                    }
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-medium"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => setFailAiModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteFailAiAudit}
                    disabled={!failAiReasonInput.trim() || isVerifyingAction}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-rose-950/40"
                  >
                    Confirm & Send to Re-Audit
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CLINICAL RE-AUDIT QUEUE */}
      {activeConsoleTab === 'REAUDIT' && (
        <div className="space-y-6">
          {/* Re-Audit KPIs Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div 
              onClick={() => setReAuditVerdictFilter('ALL')}
              className={`p-3.5 rounded-2xl shadow-lg cursor-pointer transition-all border ${
                reAuditVerdictFilter === 'ALL'
                  ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500'
                  : 'bg-slate-900 border-amber-500/30 hover:border-amber-500/60'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                All in Queue
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-amber-300">{reAuditTasks.length}</span>
                <span className="text-[10px] text-slate-500">Flagged</span>
              </div>
            </div>

            <div 
              onClick={() => setReAuditVerdictFilter(reAuditVerdictFilter === 'PASSED' ? 'ALL' : 'PASSED')}
              className={`p-3.5 rounded-2xl shadow-lg cursor-pointer transition-all border ${
                reAuditVerdictFilter === 'PASSED'
                  ? 'bg-rose-950/40 border-rose-500 ring-1 ring-rose-500'
                  : 'bg-slate-900 border-rose-950 hover:border-rose-600/50'
              }`}
              title="Click to show visits AI passed, but human QA rejected as False Positives"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  AI False Positives
                </span>
                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">
                  Strike Review
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-white">
                  {reAuditTasks.filter(t => t.auditStatus === 'PASSED').length}
                </span>
                <span className="text-[10px] text-rose-400/80 font-mono">
                  Orig. AI Pass
                </span>
              </div>
            </div>

            <div 
              onClick={() => setReAuditVerdictFilter(reAuditVerdictFilter === 'FATAL' ? 'ALL' : 'FATAL')}
              className={`p-3.5 rounded-2xl shadow-lg cursor-pointer transition-all border ${
                reAuditVerdictFilter === 'FATAL'
                  ? 'bg-sky-950/40 border-sky-500 ring-1 ring-sky-500'
                  : 'bg-slate-900 border-slate-800 hover:border-sky-600/50'
              }`}
              title="Click to show visits AI struck down as Fatal, but flagged for dispute/review"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block mb-1">
                Disputed Strikes
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-white">
                  {reAuditTasks.filter(t => t.auditStatus === 'FATAL').length}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Orig. AI Fatal</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Showing in View
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-white">{filteredReAuditTasks.length}</span>
                <span className="text-[10px] text-slate-500">Filtered</span>
              </div>
            </div>
          </div>

          {/* Search, Filter Tabs & City Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl space-y-3 shadow-lg">
            {/* Quick Filter Pill Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setReAuditVerdictFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  reAuditVerdictFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-950/40'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All Re-Audits ({reAuditTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setReAuditVerdictFilter('PASSED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  reAuditVerdictFilter === 'PASSED'
                    ? 'bg-rose-600 text-white font-black shadow-md shadow-rose-950/40'
                    : 'bg-slate-950 text-slate-400 hover:text-rose-300 border border-slate-800'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>🚨 AI False Positives ({reAuditTasks.filter(t => t.auditStatus === 'PASSED').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setReAuditVerdictFilter('FATAL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  reAuditVerdictFilter === 'FATAL'
                    ? 'bg-sky-600 text-white font-black shadow-md shadow-sky-950/40'
                    : 'bg-slate-950 text-slate-400 hover:text-sky-300 border border-slate-800'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>⚖️ Disputed AI Strikes ({reAuditTasks.filter(t => t.auditStatus === 'FATAL').length})</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800">
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={reAuditSearchQuery}
                  onChange={(e) => setReAuditSearchQuery(e.target.value)}
                  placeholder="Search Re-Audit by Task ID, FE Name, or Code..."
                  className="bg-transparent border-none text-xs text-white placeholder-slate-500 focus:outline-none w-full"
                />
                {reAuditSearchQuery && (
                  <button
                    onClick={() => setReAuditSearchQuery('')}
                    className="text-slate-500 hover:text-white text-xs cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium">City:</span>
                <select
                  value={reAuditCityFilter}
                  onChange={(e) => setReAuditCityFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">All Hubs ({reAuditAvailableCities.length})</option>
                  {reAuditAvailableCities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Re-Audit Cards List */}
          {filteredReAuditTasks.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="text-sm font-bold text-white">Re-Audit Queue is Empty</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No tasks are currently flagged for clinical re-audit. When a human reviewer fails an AI audit from the Human Review tab, it will appear here for full clinical re-inspection.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReAuditTasks.map(task => {
                const taskId = task.taskId || task.id;
                const criteria = task.criteriaStatus || {};
                const aiReasons = task.failedReasons || [];
                const origVerdict = task.auditStatus || 'UNKNOWN';

                return (
                  <div
                    key={taskId}
                    className="p-4 rounded-2xl bg-slate-900 border border-amber-500/30 hover:border-amber-500/60 transition-all shadow-xl space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      {/* Top Header: ID & Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-white">
                              #{taskId}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                              {task.facilityCode || task.city || 'Hub'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 font-semibold pt-0.5">
                            {task.feName || 'Unknown FE'} <span className="text-slate-500 font-mono text-[11px]">({task.feCode || 'FE'})</span>
                          </p>
                        </div>

                        {/* Original AI Verdict Badge */}
                        <div className="text-right">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wide uppercase border ${
                            origVerdict === 'PASSED'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-red-500/20 text-red-300 border-red-500/40'
                          }`}>
                            AI: {origVerdict}
                          </span>
                          <span className="block text-[9px] text-slate-500 font-mono mt-0.5">
                            {task.auditedBy || 'Gemini Flash'}
                          </span>
                        </div>
                      </div>

                      {/* AI False Positive Alert Callout */}
                      {origVerdict === 'PASSED' && (
                        <div className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-950/50 via-slate-900 to-rose-950/40 border border-rose-500/40 text-xs flex items-center justify-between">
                          <span className="font-bold text-rose-300 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                            <span>AI False Positive Flag</span>
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/50">
                            Orig. AI Passed &rarr; Re-Audit for Non-Compliance
                          </span>
                        </div>
                      )}

                      {/* AI False Strike / Dispute Alert Callout */}
                      {origVerdict === 'FATAL' && (
                        <div className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-950/50 via-slate-900 to-sky-950/40 border border-sky-500/40 text-xs flex items-center justify-between">
                          <span className="font-bold text-sky-300 flex items-center gap-1.5">
                            <Scale className="w-3.5 h-3.5 text-sky-400" />
                            <span>AI Fatal Strike Review</span>
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-sky-500/30 text-sky-200 border border-sky-500/50">
                            Orig. AI Fatal &rarr; Clinical Dispute Check
                          </span>
                        </div>
                      )}

                      {/* Re-Audit Reason Alert Box */}
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Flagged for Human Re-Audit:</span>
                        </div>
                        <p className="text-[11px] text-amber-100/90 leading-relaxed font-medium pl-5">
                          "{task.reAuditReason || 'Flagged by QA Reviewer'}"
                        </p>
                      </div>

                      {/* AI Selected Criteria Evaluation Strip */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          AI Criteria Evaluation (Highlighted for Re-Check):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { key: 'selfie', label: '1. Selfie' },
                            { key: 'torches', label: '2. Torches' },
                            { key: 'visionChart', label: '3. Vision Chart' },
                            { key: 'toolkit', label: '4. Toolkit' },
                            { key: 'frameDisplay', label: '5. Frame/Trial' }
                          ].map(c => {
                            const st = criteria[c.key] || (task.audit_status === 'PASSED' ? 'PASS' : null);
                            const isFail = st === 'FAIL' || aiReasons.some(r => r.toLowerCase().includes(c.key.toLowerCase()));
                            const isPass = st === 'PASS' && !isFail;

                            return (
                              <span
                                key={c.key}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                  isFail
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                                    : isPass
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {isFail ? '❌ AI FAIL:' : isPass ? '✅ AI PASS:' : '⚪'} {c.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action: Perform Clinical Re-Audit */}
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {task.date || task.dispatch_date || 'Recent Dispatch'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartReAudit(task)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-amber-950/40"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Perform Clinical Re-Audit</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FORENSIC DEFECT SCREENER & QUOTA GUARD */}
      {activeConsoleTab === 'FORENSICS' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Banner & KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-purple-500/30 shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 block mb-1">
                Total Flagged
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-purple-300">{forensicFlags.length}</span>
                <span className="text-[10px] text-slate-500">Defective Visits</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-rose-500/30 shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block mb-1">
                Excluded from AI
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-rose-300">{excludedTaskIds.size}</span>
                <span className="text-[10px] text-rose-400/80 font-bold">Quota Protected</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-emerald-500/30 shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                AI Quota Preserved
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-emerald-300">~{excludedTaskIds.size} Requests</span>
                <span className="text-[10px] text-slate-500">Free Tier</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-sky-500/30 shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block mb-1">
                Tokens Saved
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-sky-300">~{(excludedTaskIds.size * 2).toFixed(1)}k</span>
                <span className="text-[10px] text-slate-500">API Tokens</span>
              </div>
            </div>
          </div>

          {/* Screener Controls Bar */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-white uppercase tracking-wider">
                  Forensic Screening Results ({filteredForensicFlags.length} Tasks Shown)
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleRunForensicPreScreen}
                  disabled={isForensicScanning || queueTasks.length === 0}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isForensicScanning ? 'animate-spin' : ''}`} />
                  <span>{forensicFlags.length > 0 ? 'Re-Scan Queue' : 'Scan Queue Now'}</span>
                </button>

                {forensicFlags.length > 0 && (
                  <>
                    <button
                      onClick={() => handleToggleAllExcluded(true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                    >
                      Exclude All ({forensicFlags.length})
                    </button>
                    <button
                      onClick={() => handleToggleAllExcluded(false)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors cursor-pointer"
                    >
                      Clear Exclusions (Audit All)
                    </button>
                    <button
                      onClick={handleAutoFailAllExcluded}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/25 flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Directly commit all excluded tasks as FATAL in Supabase without using AI tokens"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>⚡ Auto-Fail All Excluded in DB (0 Tokens)</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
                <span className="text-[10px] font-bold text-slate-400 block mb-1">Defect Category</span>
                <select
                  value={forensicDefectFilter}
                  onChange={(e) => setForensicDefectFilter(e.target.value)}
                  className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900">All Defect Types</option>
                  <option value="BLACK_BLANK" className="bg-slate-900">Black & Blank Photos Only</option>
                  <option value="BLUR" className="bg-slate-900">Extremely Blurry Photos Only</option>
                </select>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 sm:col-span-2 flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={forensicSearchQuery}
                  onChange={(e) => setForensicSearchQuery(e.target.value)}
                  placeholder="Search by Task ID, FE Name, Employee Code, or City..."
                  className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Screener Progress Banner if running */}
          {isForensicScanning && (
            <div className="p-4 bg-purple-950/40 border border-purple-500/40 rounded-2xl space-y-2 text-xs text-purple-200">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Inspecting checklist photos for black, covered camera, and blurry images...</span>
                </span>
                <span>{forensicProgress.current} / {forensicProgress.total}</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-purple-500/20">
                <div 
                  className="bg-purple-500 h-full transition-all duration-300"
                  style={{ width: `${forensicProgress.total > 0 ? (forensicProgress.current / forensicProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">{forensicProgress.message}</p>
            </div>
          )}

          {/* If No Flags yet */}
          {forensicFlags.length === 0 && !isForensicScanning && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">Forensic Pre-Screener Ready</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Scan all {queueTasks.length} tasks in the current queue client-side before running AI audits. This flags black, covered camera, and extremely blurry photos and excludes them by default to protect your 1,500 daily Gemini quota.
              </p>
              <button
                onClick={handleRunForensicPreScreen}
                disabled={queueTasks.length === 0}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shadow-lg shadow-purple-600/30 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Start Forensic Screening ({queueTasks.length} Visits)</span>
              </button>
            </div>
          )}

          {/* TASK CARDS GRID */}
          {filteredForensicFlags.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Showing {filteredForensicFlags.length} flagged tasks</span>
                <span className="text-[11px] text-slate-500">
                  Tip: Uncheck "Exclude from AI Audits" if any task is a false-positive and you want AI to evaluate it.
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredForensicFlags.map((item) => {
                  const isExcluded = excludedTaskIds.has(String(item.taskId));
                  const t = item.task || {};
                  return (
                    <div
                      key={item.taskId}
                      className={`p-4 rounded-2xl border transition-all ${
                        isExcluded
                          ? 'bg-slate-900/90 border-rose-500/40 shadow-lg shadow-rose-950/20'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-sky-400">
                              Task #{item.taskId}
                            </span>
                            <span className="text-xs font-bold text-white">
                              {t.feName || 'FE'}
                            </span>
                            {t.feCode && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {t.feCode}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400">
                              • {t.facilityCode || t.city || 'Hub'} {t.zone ? `(${t.zone})` : ''}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                            Dispatch Date: {(t.date || t.dispatch_date || '').slice(0, 10) || 'N/A'}
                          </span>
                        </div>

                        {/* Defect Badge */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.flaggedSlots?.some(s => s.defectType === 'BLACK_SCREEN' || s.defectType === 'COVERED_CAMERA') && (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                              <span>⬛</span> Covered Camera / Black Photo
                            </span>
                          )}
                          {item.flaggedSlots?.some(s => s.defectType === 'EXTREME_BLUR') && (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <span>🌀</span> Extremely Blurry Photo
                            </span>
                          )}
                          {item.flaggedSlots?.some(s => s.defectType === 'BLANK_WHITE') && (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 flex items-center gap-1">
                              <span>⬜</span> Blank / White Screen
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Defect Reason Alert Banner */}
                      <div className="mt-3 p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-white">Forensic Detection: </strong>
                          <span>{item.primaryReason}</span>
                        </div>
                      </div>

                      {/* Task Photos Strip */}
                      <div className="mt-3 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Inspection Photos:
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                          {item.allSlots?.map((slot, sIdx) => (
                            <div
                              key={sIdx}
                              onClick={() => setPreviewImage({ url: slot.url, title: `${slot.slotLabel} - Task #${item.taskId}` })}
                              className={`relative rounded-xl overflow-hidden border cursor-pointer group bg-slate-950 ${
                                slot.isDefective
                                  ? 'border-rose-500 ring-2 ring-rose-500/50 shadow-md shadow-rose-950/50'
                                  : 'border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
                                <img
                                  src={slot.url}
                                  alt={slot.slotLabel}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              </div>
                              <div className="p-1.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[10px]">
                                <span className="font-semibold text-slate-300 truncate">{slot.slotLabel}</span>
                                {slot.isDefective ? (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 text-[9px] shrink-0">
                                    DEFECT
                                  </span>
                                ) : (
                                  <span className="text-emerald-400 font-bold text-[9px]">✓ Clean</span>
                                )}
                              </div>
                              {slot.isDefective && (
                                <div className="absolute inset-x-0 bottom-7 bg-rose-950/90 text-[9px] text-rose-200 px-1 py-0.5 text-center truncate">
                                  {slot.reason}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Card Footer: Exclude Checkbox & Action Button */}
                      <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isExcluded}
                            onChange={() => handleToggleExcludeTask(item.taskId)}
                            className="w-4 h-4 rounded text-rose-600 focus:ring-0 bg-slate-950 border-rose-500/50 cursor-pointer"
                          />
                          <div>
                            <span className={`text-xs font-bold ${isExcluded ? 'text-rose-300' : 'text-slate-400'}`}>
                              {isExcluded ? 'Exclude from AI Audits (Active - Saves Quota)' : 'Exclude from AI Audits: OFF (Will be Audited by AI)'}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {isExcluded
                                ? 'Task will be skipped during AI Batch Auditing, preserving your daily quota.'
                                : 'Human auditor marked this task as false-positive; AI model will audit this task.'}
                            </span>
                          </div>
                        </label>

                        <button
                          onClick={() => handleDirectFatalStrike(item)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/25 flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto"
                          title="Directly commit this task as FATAL in Supabase without spending AI tokens"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Direct Fatal Strike (0 Tokens)</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clinical Re-Audit Modal View (Opens Standard Audit Modal with AI Highlighting) */}
      {inspectingReAuditTask && (
        <AuditModal
          task={inspectingReAuditTask}
          isReAudit={true}
          onClose={() => setInspectingReAuditTask(null)}
          onPassAudit={handlePassReAudit}
          onFatalAudit={handleFatalReAudit}
          auditorName={currentUser?.name || currentUser?.email || 'Clinical Auditor'}
          auditorLocation={inspectingReAuditTask.facilityCode || 'Central QA'}
        />
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
