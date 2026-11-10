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
  SlidersHorizontal,
  Check,
  X,
  Plus,
  Trash2,
  Edit3,
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
import { extractAiStationEvaluation } from './VerificationModal.jsx';
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
  onTaskAudited,
  rules: propRules = null
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
  const recentRequestTimesRef = useRef([]); // Tracks timestamps for sliding-window 13 RPM limiter
  const [batchPaceStatus, setBatchPaceStatus] = useState({
    rpm: 0,
    jitterSeconds: '0.0',
    statusText: '',
    currentIdx: 0,
    totalCount: 0
  });
  const [currentProgress, setCurrentProgress] = useState({ step: '', message: '' });
  const [activeAuditResult, setActiveAuditResult] = useState(null);
  const [autoCommitToDb, setAutoCommitToDb] = useState(true);

  // Parallel Worker Seat State (persisted in localStorage for multi-key collaboration without collisions)
  const [teamWorkerCount, setTeamWorkerCount] = useState(() => {
    try {
      const val = parseInt(localStorage.getItem('locus_ai_worker_count') || '1', 10);
      return (val >= 1 && val <= 4) ? val : 1;
    } catch (_) { return 1; }
  });
  const [teamWorkerIndex, setTeamWorkerIndex] = useState(() => {
    try {
      const val = parseInt(localStorage.getItem('locus_ai_worker_seat') || '0', 10);
      return (val >= 0) ? val : 0;
    } catch (_) { return 0; }
  });

  const handleSetWorkerConfig = (count, seat) => {
    const validCount = Math.max(1, Math.min(4, count));
    const validSeat = Math.max(0, Math.min(validCount - 1, seat));
    setTeamWorkerCount(validCount);
    setTeamWorkerIndex(validSeat);
    try {
      localStorage.setItem('locus_ai_worker_count', String(validCount));
      localStorage.setItem('locus_ai_worker_seat', String(validSeat));
    } catch (_) {}
  };

  // 4. Session History & Live Audits Ledger States
  const [sessionHistory, setSessionHistory] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [ledgerFilter, setLedgerFilter] = useState('ALL'); // 'ALL' | 'PASSED' | 'FATAL' | 'VERIFIED' | 'OVERTURNED'
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');

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
  const [sessionVerificationMap, setSessionVerificationMap] = useState({}); // taskId -> { humanStatus, remarks, auditor_remarks, auditStatus, human_verified, human_overturned }
  const [verificationToast, setVerificationToast] = useState(null); // { message, type }

  const showVerificationToast = (message, type = 'success') => {
    setVerificationToast({ message, type });
    setTimeout(() => {
      setVerificationToast(prev => (prev?.message === message ? null : prev));
    }, 4500);
  };

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

  // 9. Centrally Governed & Custom AI Audit Criteria State
  const [activeRules, setActiveRules] = useState(() => {
    try {
      const saved = localStorage.getItem('locus_ai_custom_rules');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return (propRules && propRules.length > 0) ? propRules : INITIAL_CENTRAL_RULES;
  });

  // Strict anti-false-positive enforcement directive toggle
  const [strictAntiFalsePositive, setStrictAntiFalsePositive] = useState(() => {
    try {
      const saved = localStorage.getItem('locus_ai_strict_anti_false_positive');
      return saved !== null ? JSON.parse(saved) : true;
    } catch (_) {
      return true;
    }
  });

  // Custom prompt directives
  const [customDirectives, setCustomDirectives] = useState(() => {
    return localStorage.getItem('locus_ai_custom_directives') || '';
  });

  // Criteria Modal State
  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);
  const [criteriaModalTab, setCriteriaModalTab] = useState('selfie'); // 'selfie' | 'torches' | 'visionChart' | 'toolkit' | 'frameDisplay' | 'STRICTNESS'
  const [draftRules, setDraftRules] = useState(activeRules);
  const [draftStrictAntiFalsePositive, setDraftStrictAntiFalsePositive] = useState(strictAntiFalsePositive);
  const [draftCustomDirectives, setDraftCustomDirectives] = useState(customDirectives);
  const [newStandardInput, setNewStandardInput] = useState('');
  const [newFailureInput, setNewFailureInput] = useState('');

  // Fetch persisted rules from Supabase settings table on mount
  useEffect(() => {
    settingsApi.getSetting('locus_ai_audit_rules', null).then(saved => {
      if (saved && Array.isArray(saved.rules) && saved.rules.length > 0) {
        setActiveRules(saved.rules);
        if (typeof saved.strictAntiFalsePositive === 'boolean') {
          setStrictAntiFalsePositive(saved.strictAntiFalsePositive);
        }
        if (typeof saved.customDirectives === 'string') {
          setCustomDirectives(saved.customDirectives);
        }
      }
    }).catch(() => {});
  }, []);

  const handleOpenCriteriaModal = () => {
    setDraftRules(JSON.parse(JSON.stringify(activeRules)));
    setDraftStrictAntiFalsePositive(strictAntiFalsePositive);
    setDraftCustomDirectives(customDirectives);
    setNewStandardInput('');
    setNewFailureInput('');
    setCriteriaModalOpen(true);
  };

  const handleSaveCriteria = async () => {
    setActiveRules(draftRules);
    setStrictAntiFalsePositive(draftStrictAntiFalsePositive);
    setCustomDirectives(draftCustomDirectives);

    try {
      localStorage.setItem('locus_ai_custom_rules', JSON.stringify(draftRules));
      localStorage.setItem('locus_ai_strict_anti_false_positive', JSON.stringify(draftStrictAntiFalsePositive));
      localStorage.setItem('locus_ai_custom_directives', draftCustomDirectives);
    } catch (_) {}

    try {
      await settingsApi.setSetting('locus_ai_audit_rules', {
        rules: draftRules,
        strictAntiFalsePositive: draftStrictAntiFalsePositive,
        customDirectives: draftCustomDirectives,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.full_name || currentUser?.name || currentUser?.email || 'Central Auditor'
      });
    } catch (e) {
      console.warn('Could not save rules to Supabase settings:', e.message);
    }

    setCriteriaModalOpen(false);
    showVerificationToast('Audit criteria updated! AI models will now enforce these exact standards.', 'success');
  };

  const handleResetCriteriaToDefaults = () => {
    if (!confirm('Reset all 5 station criteria and strictness settings back to standard Lenskart DLC defaults?')) return;
    setDraftRules(JSON.parse(JSON.stringify(INITIAL_CENTRAL_RULES)));
    setDraftStrictAntiFalsePositive(true);
    setDraftCustomDirectives('');
  };

  const handleUpdateDraftRuleField = (ruleId, field, value) => {
    setDraftRules(prev => prev.map(r => {
      if (r.id === ruleId) {
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  const handleAddStandardToDraft = (ruleId) => {
    if (!newStandardInput.trim()) return;
    setDraftRules(prev => prev.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          standards: [...(r.standards || []), newStandardInput.trim()]
        };
      }
      return r;
    }));
    setNewStandardInput('');
  };

  const handleRemoveStandardFromDraft = (ruleId, index) => {
    setDraftRules(prev => prev.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          standards: (r.standards || []).filter((_, i) => i !== index)
        };
      }
      return r;
    }));
  };

  const handleAddFailureToDraft = (ruleId) => {
    if (!newFailureInput.trim()) return;
    setDraftRules(prev => prev.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          commonFailures: [...(r.commonFailures || []), newFailureInput.trim()]
        };
      }
      return r;
    }));
    setNewFailureInput('');
  };

  const handleRemoveFailureFromDraft = (ruleId, index) => {
    setDraftRules(prev => prev.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          commonFailures: (r.commonFailures || []).filter((_, i) => i !== index)
        };
      }
      return r;
    }));
  };

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

  // Modulo Sharding for Parallel Worker Seats (Zero Collision Guarantee)
  const allocatedQueueTasks = useMemo(() => {
    if (teamWorkerCount <= 1) return queueTasks;
    return queueTasks.filter((_, idx) => (idx % teamWorkerCount) === teamWorkerIndex);
  }, [queueTasks, teamWorkerCount, teamWorkerIndex]);

  // Selected Task (searches all tasks so selecting an audited task in the ledger works)
  const rawSelectedTask = useMemo(() => {
    if (selectedTaskId) {
      const found = tasks.find(t => String(t.id || t.taskId) === String(selectedTaskId));
      if (found) return found;
    }
    if (allocatedQueueTasks.length) return allocatedQueueTasks[0];
    if (queueTasks.length) return queueTasks[0];
    return tasks[0] || null;
  }, [tasks, queueTasks, allocatedQueueTasks, selectedTaskId]);

  const selectedTask = useMemo(() => {
    if (!rawSelectedTask) return null;
    const local = sessionVerificationMap[String(rawSelectedTask.id || rawSelectedTask.taskId)];
    if (!local) return rawSelectedTask;
    return {
      ...rawSelectedTask,
      ...local
    };
  }, [rawSelectedTask, sessionVerificationMap]);

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
        rules: activeRules,
        strictAntiFalsePositive,
        customDirectives,
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

        const finalVerdict = result.verdict === 'PASS' ? 'PASSED' : 'FATAL';
        const formattedRemarks = result.verdict === 'PASS'
          ? `AI PASSED (Score: ${result.overallScore}/100, Conf: ${result.confidenceScore}% ±${result.errorMargin}%). ${result.summary}`
          : `AI FATAL STRIKE (Score: ${result.overallScore}/100, Conf: ${result.confidenceScore}% ±${result.errorMargin}%). ${result.summary}`;

        if (onTaskAudited) {
          onTaskAudited(taskToAudit.id || taskToAudit.taskId, finalVerdict, {
            auditedBy: auditorName,
            remarks: formattedRemarks,
            auditor_remarks: formattedRemarks,
            overallScore: result.overallScore,
            confidenceScore: result.confidenceScore,
            totalTokens: totToks
          });
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

  // Run Continuous Auto-Auditor with strict 13 RPM Rate Limiter & 1.0-1.5s Jitter
  const runContinuousAutoAudit = async (batchCount = null) => {
    const prov = SUPPORTED_PROVIDERS.find(p => p.id === activeProvider) || SUPPORTED_PROVIDERS[0];
    if (!apiKey.trim()) {
      alert(`Please enter and connect your ${prov.name} API Key first.`);
      return;
    }
    if (allocatedQueueTasks.length === 0) {
      alert('No pending tasks allocated to this worker seat in current queue.');
      return;
    }

    // Filter out tasks excluded by forensic screener
    const eligibleTasks = allocatedQueueTasks.filter(t => !excludedTaskIds.has(String(t.id || t.taskId)));
    if (eligibleTasks.length === 0) {
      alert(`All ${allocatedQueueTasks.length} tasks allocated to your seat are currently excluded by the Forensic Screener. Uncheck any in the Forensic tab to evaluate them.`);
      return;
    }

    const tasksToProcess = (typeof batchCount === 'number' && batchCount > 0)
      ? eligibleTasks.slice(0, batchCount)
      : eligibleTasks;

    setIsBatchRunning(true);
    isBatchCancelledRef.current = false;

    let processed = 0;
    const total = tasksToProcess.length;

    for (let i = 0; i < total; i++) {
      if (isBatchCancelledRef.current) break;
      const t = tasksToProcess[i];

      // Instant Skip Safeguard: If task is already audited (e.g. audited by another worker in Supabase)
      if (t.auditStatus === 'PASSED' || t.auditStatus === 'FATAL') {
        continue;
      }

      // Update UI selection immediately so hero card displays current task being audited
      setSelectedTaskId(t.id || t.taskId);

      // 1. Strict 13 RPM Rate Limiting Guard (Sliding 60-Second Window)
      const now = Date.now();
      recentRequestTimesRef.current = recentRequestTimesRef.current.filter(ts => now - ts < 60000);
      if (recentRequestTimesRef.current.length >= 13) {
        const oldest = recentRequestTimesRef.current[0];
        const waitMs = Math.max(1000, 60000 - (now - oldest) + 500); // Wait until window clears + 500ms safety buffer
        setBatchPaceStatus(prev => ({
          ...prev,
          currentIdx: i + 1,
          totalCount: total,
          statusText: `13 RPM Safety Guard: 13 requests sent in last 60s. Pausing ${Math.ceil(waitMs / 1000)}s to protect API quota...`
        }));
        await new Promise(r => setTimeout(r, waitMs));
        if (isBatchCancelledRef.current) break;
      }

      // Record request timestamp
      recentRequestTimesRef.current.push(Date.now());
      const currentRpm = recentRequestTimesRef.current.length;

      setBatchPaceStatus(prev => ({
        ...prev,
        currentIdx: i + 1,
        totalCount: total,
        rpm: currentRpm,
        statusText: `Auditing Task #${t.taskId || t.id} (${i + 1}/${total})...`
      }));

      // Execute AI Audit on task
      await runAiAuditOnTask(t, autoCommitToDb);
      processed++;

      if (i < total - 1 && !isBatchCancelledRef.current) {
        // 2. Base throttle + 1.0s to 1.5s random jitter
        // Base delay 4620ms ensures ~13 RPM (60000 / 13 = 4615ms)
        const jitterMs = 1000 + Math.floor(Math.random() * 500); // 1000ms - 1500ms
        const totalDelay = 4620 + jitterMs;
        setBatchPaceStatus(prev => ({
          ...prev,
          jitterSeconds: (jitterMs / 1000).toFixed(1),
          statusText: `Pacing: ${(jitterMs / 1000).toFixed(1)}s jitter (maintaining ${currentRpm} RPM)...`
        }));
        await new Promise(r => setTimeout(r, totalDelay));
      }
    }

    setIsBatchRunning(false);
    setBatchPaceStatus({ rpm: 0, jitterSeconds: '0.0', statusText: '', currentIdx: 0, totalCount: 0 });
  };

  const runBatchAuditing = runContinuousAutoAudit;

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
      const local = sessionVerificationMap[String(t.id || t.taskId)];
      const isAudited = t.auditStatus === 'PASSED' || t.auditStatus === 'FATAL' || t.auditStatus === 'PASS' || (local && (local.auditStatus === 'PASSED' || local.auditStatus === 'FATAL'));
      if (!isAudited) return false;
      const by = (t.auditedBy || t.audited_by_name || '').toLowerCase();
      const rem = (t.remarks || t.auditor_remarks || '').toLowerCase();
      return by.includes('gemini') || by.includes('ai') || by.includes('gpt') || by.includes('claude') || by.includes('llama') || by.includes('groq') || by.includes('openrouter') || rem.includes('ai passed') || rem.includes('ai fatal') || rem.includes('(score:') || !!local;
    }).map(t => {
      const local = sessionVerificationMap[String(t.id || t.taskId)] || {};
      const rem = local.remarks || t.remarks || t.auditor_remarks || '';
      const isVerified = rem.includes('[Human Verified') || t.human_verified || local.humanStatus === 'VERIFIED';
      const isOverturned = rem.includes('[Human Overturned') || t.human_overturned || local.humanStatus === 'OVERTURNED';
      const isReAudit = t.auditStatus === 'NEEDS_REAUDIT' || local.humanStatus === 'REAUDIT' || rem.includes('[AI Audit Failed');
      const humanStatus = local.humanStatus || (isReAudit ? 'REAUDIT' : (isOverturned ? 'OVERTURNED' : (isVerified ? 'VERIFIED' : 'PENDING')));
      return {
        ...t,
        ...local,
        remarks: rem,
        auditor_remarks: rem,
        auditStatus: local.auditStatus || (t.auditStatus === 'PASS' ? 'PASSED' : t.auditStatus),
        auditedBy: t.audited_by_name || t.auditedBy || 'gemini-3.8-flash',
        totalTokens: t.total_tokens || t.totalTokens || 0,
        total_tokens: t.total_tokens || t.totalTokens || 0,
        humanStatus
      };
    });

    // Also include any tasks audited in current session not yet refreshed in tasks prop
    sessionHistory.forEach(s => {
      if (!list.some(t => String(t.id || t.taskId) === String(s.taskId))) {
        const local = sessionVerificationMap[String(s.taskId)] || {};
        const normVerdict = s.verdict === 'PASS' ? 'PASSED' : (s.verdict === 'FAIL' ? 'FATAL' : s.verdict);
        const rem = local.remarks || `AI ${normVerdict} (Score: ${s.overallScore}/100, Conf: ${s.confidenceScore}% ±${s.errorMargin}%). ${s.summary}`;
        list.push({
          id: s.taskId,
          taskId: s.taskId,
          feName: s.feName,
          feCode: s.feCode,
          facilityCode: s.city,
          city: s.city,
          date: s.date,
          auditStatus: local.auditStatus || normVerdict,
          auditedBy: s.modelUsed || 'gemini-3.8-flash',
          audited_by_name: s.modelUsed || 'gemini-3.8-flash',
          remarks: rem,
          auditor_remarks: rem,
          images: s.task?.images || {},
          criteriaStatus: s.criteriaStatus || {},
          criteria_status: s.criteriaStatus || {},
          failedReasons: s.failedReasons || [],
          failed_reasons: s.failedReasons || [],
          criteriaEvaluation: s.criteriaEvaluation || [],
          totalTokens: s.totalTokens || 0,
          total_tokens: s.totalTokens || 0,
          humanStatus: local.humanStatus || 'PENDING'
        });
      }
    });

    return list;
  }, [tasks, sessionHistory, sessionVerificationMap]);

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

  // Filtered tasks for the Live AI Audits & Verdicts Ledger
  const filteredLedgerTasks = useMemo(() => {
    return allAiAuditedTasks.filter(t => {
      if (ledgerFilter === 'PASSED' && t.auditStatus !== 'PASSED') return false;
      if (ledgerFilter === 'FATAL' && t.auditStatus !== 'FATAL') return false;
      if (ledgerFilter === 'VERIFIED' && t.humanStatus !== 'VERIFIED') return false;
      if (ledgerFilter === 'OVERTURNED' && t.humanStatus !== 'OVERTURNED') return false;
      if (ledgerSearchQuery.trim()) {
        const q = ledgerSearchQuery.toLowerCase().trim();
        const mId = String(t.taskId || t.id || '').toLowerCase().includes(q);
        const mFe = String(t.feName || '').toLowerCase().includes(q);
        const mCode = String(t.feCode || '').toLowerCase().includes(q);
        const mCity = String(t.facilityCode || t.city || '').toLowerCase().includes(q);
        if (!mId && !mFe && !mCode && !mCity) return false;
      }
      return true;
    });
  }, [allAiAuditedTasks, ledgerFilter, ledgerSearchQuery]);

  // Selected Task for Verification & Review (points to selectedTask or selectedVerifyTaskId)
  const selectedVerifyTask = useMemo(() => {
    if (selectedVerifyTaskId) {
      const found = allAiAuditedTasks.find(t => String(t.id || t.taskId) === String(selectedVerifyTaskId));
      if (found) return found;
    }
    return selectedTask;
  }, [allAiAuditedTasks, selectedVerifyTaskId, selectedTask]);

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
    const targetTask = selectedTask || selectedVerifyTask;
    if (!targetTask) {
      showVerificationToast('No task selected for verification.', 'error');
      return;
    }
    const taskId = String(targetTask.id || targetTask.taskId);
    const isPassVerdict = (targetTask.auditStatus === 'PASSED' || targetTask.auditStatus === 'PASS' || activeAuditResult?.result?.verdict === 'PASS');

    setIsVerifyingAction(true);
    try {
      const reviewerName = currentUser?.name || currentUser?.email || 'Central QA Reviewer';
      const originalRemarks = (targetTask.remarks || targetTask.auditor_remarks || '')
        .replace(/\[Human Verified[^\]]*\]\s*/g, '')
        .replace(/\[Human Overturned[^\]]*\]\s*/g, '');
      const notesClean = humanNotesInput.trim();
      const updatedRemarks = `[Human Verified by ${reviewerName}${notesClean ? `: ${notesClean}` : ''}] ${originalRemarks}`.trim();

      const modelAuditorName = targetTask.auditedBy || targetTask.audited_by_name || activeAuditResult?.result?.modelUsed || 'gemini-3.8-flash';
      const taskTokens = targetTask.totalTokens || targetTask.total_tokens || activeAuditResult?.result?.totalTokens || 0;

      if (isPassVerdict) {
        await tasksApi.passAudit({
          taskId,
          auditorName: modelAuditorName,
          auditorLocation: targetTask.facilityCode || 'Central QA',
          remarks: updatedRemarks,
          criteriaStatus: targetTask.criteriaStatus || targetTask.criteria_status || {},
          replacements: [],
          taskData: targetTask,
          totalTokens: taskTokens
        });
      } else {
        await tasksApi.failAudit({
          taskId,
          taskData: targetTask,
          failedReasons: targetTask.failedReasons || targetTask.failed_reasons || ['AI Fatal Strike Confirmed by Human Reviewer'],
          remarks: updatedRemarks,
          criteriaStatus: targetTask.criteriaStatus || targetTask.criteria_status || {},
          replacements: [],
          auditorName: modelAuditorName,
          auditorLocation: targetTask.facilityCode || 'Central QA',
          immediateEmail: false,
          totalTokens: taskTokens
        });
      }

      // 1. Instantly update local session verification state
      setSessionVerificationMap(prev => ({
        ...prev,
        [taskId]: {
          humanStatus: 'VERIFIED',
          remarks: updatedRemarks,
          auditor_remarks: updatedRemarks,
          auditStatus: isPassVerdict ? 'PASSED' : 'FATAL',
          human_verified: true
        }
      }));

      // 2. Reflect to parent App.jsx tasks state
      if (onTaskAudited) {
        onTaskAudited(taskId, isPassVerdict ? 'PASSED' : 'FATAL', {
          remarks: updatedRemarks,
          auditor_remarks: updatedRemarks,
          human_verified: true,
          humanStatus: 'VERIFIED',
          auditedBy: modelAuditorName
        });
      }

      setHumanNotesInput('');
      showVerificationToast(`Task #${targetTask.taskId || targetTask.id} verdict [${isPassVerdict ? 'PASSED' : 'FATAL'}] confirmed and human-verified in database!`, 'success');

      // Auto-advance to next lead in queue
      const currentIdx = queueTasks.findIndex(t => String(t.id || t.taskId) === taskId);
      if (currentIdx >= 0 && currentIdx < queueTasks.length - 1) {
        setSelectedTaskId(queueTasks[currentIdx + 1].id || queueTasks[currentIdx + 1].taskId);
        setActiveAuditResult(null);
      }
    } catch (err) {
      showVerificationToast(`Failed to verify audit: ${err.message}`, 'error');
    } finally {
      setIsVerifyingAction(false);
    }
  };

  // Human overturns AI verdict
  const handleExecuteOverturn = async () => {
    const targetTask = selectedTask || selectedVerifyTask;
    if (!targetTask) return;
    if (!overrideReasonInput.trim()) {
      alert('Please enter a reason for overturning the AI verdict.');
      return;
    }

    setIsVerifyingAction(true);
    try {
      const taskId = String(targetTask.id || targetTask.taskId);
      const reviewerName = currentUser?.name || currentUser?.email || 'Central QA Reviewer';
      const originalRemarks = (targetTask.remarks || targetTask.auditor_remarks || '')
        .replace(/\[Human Verified[^\]]*\]\s*/g, '')
        .replace(/\[Human Overturned[^\]]*\]\s*/g, '');
      const cleanReason = overrideReasonInput.trim();
      const taskTokens = targetTask.totalTokens || targetTask.total_tokens || 0;

      if (overrideActionType === 'PASS') {
        const updatedRemarks = `[Human Overturned FATAL to PASS by ${reviewerName}: ${cleanReason}] Original AI: ${originalRemarks}`.trim();
        await tasksApi.passAudit({
          taskId,
          auditorName: reviewerName,
          auditorLocation: targetTask.facilityCode || 'Central QA',
          remarks: updatedRemarks,
          criteriaStatus: { selfie: 'PASS', torches: 'PASS', visionChart: 'PASS', toolkit: 'PASS', frameDisplay: 'PASS' },
          replacements: [],
          taskData: targetTask,
          totalTokens: taskTokens
        });

        setSessionVerificationMap(prev => ({
          ...prev,
          [taskId]: {
            humanStatus: 'OVERTURNED',
            remarks: updatedRemarks,
            auditor_remarks: updatedRemarks,
            auditStatus: 'PASSED',
            human_overturned: true
          }
        }));

        if (onTaskAudited) {
          onTaskAudited(taskId, 'PASSED', {
            remarks: updatedRemarks,
            auditor_remarks: updatedRemarks,
            human_overturned: true,
            humanStatus: 'OVERTURNED',
            auditedBy: reviewerName
          });
        }
      } else {
        const updatedRemarks = `[Human Overturned PASS to FATAL by ${reviewerName}: ${cleanReason}] Original AI: ${originalRemarks}`.trim();
        await tasksApi.failAudit({
          taskId,
          taskData: targetTask,
          failedReasons: [cleanReason],
          remarks: updatedRemarks,
          criteriaStatus: targetTask.criteriaStatus || targetTask.criteria_status || {},
          replacements: [],
          auditorName: reviewerName,
          auditorLocation: targetTask.facilityCode || 'Central QA',
          immediateEmail: false,
          totalTokens: taskTokens
        });

        setSessionVerificationMap(prev => ({
          ...prev,
          [taskId]: {
            humanStatus: 'OVERTURNED',
            remarks: updatedRemarks,
            auditor_remarks: updatedRemarks,
            auditStatus: 'FATAL',
            human_overturned: true
          }
        }));

        if (onTaskAudited) {
          onTaskAudited(taskId, 'FATAL', {
            remarks: updatedRemarks,
            auditor_remarks: updatedRemarks,
            human_overturned: true,
            humanStatus: 'OVERTURNED',
            auditedBy: reviewerName
          });
        }
      }

      setOverrideModalOpen(false);
      setOverrideReasonInput('');
      showVerificationToast(`Task #${targetTask.taskId || targetTask.id} overturned to ${overrideActionType} in database!`, 'success');

      // Auto-advance to next lead in queue
      const currentIdx = queueTasks.findIndex(t => String(t.id || t.taskId) === taskId);
      if (currentIdx >= 0 && currentIdx < queueTasks.length - 1) {
        setSelectedTaskId(queueTasks[currentIdx + 1].id || queueTasks[currentIdx + 1].taskId);
        setActiveAuditResult(null);
      }
    } catch (err) {
      showVerificationToast(`Failed to overturn verdict: ${err.message}`, 'error');
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
    const targetTask = selectedTask || selectedVerifyTask;
    if (!targetTask) return;
    setFailAiReasonInput('');
    setFailAiModalOpen(true);
  };

  // Execute Fail AI Audit (Mark as failed and route to Re-Audit queue)
  const handleExecuteFailAiAudit = async () => {
    const targetTask = selectedTask || selectedVerifyTask;
    if (!targetTask) return;
    if (!failAiReasonInput.trim()) {
      alert('Please enter a clinical reason why this AI audit failed and needs human re-check.');
      return;
    }

    setIsVerifyingAction(true);
    try {
      const reviewerName = currentUser?.name || currentUser?.email || 'QA Reviewer';
      const taskId = String(targetTask.id || targetTask.taskId);
      const cleanReason = failAiReasonInput.trim();
      const origRemarks = targetTask.remarks || targetTask.auditor_remarks || '';
      const updatedRemarks = `[AI Audit Failed / Re-Audit Requested by ${reviewerName}: ${cleanReason}] ${origRemarks}`.trim();

      await tasksApi.failAiAudit({
        taskId,
        taskData: targetTask,
        reviewerName,
        reason: cleanReason,
        originalRemarks: origRemarks,
        criteriaStatus: targetTask.criteriaStatus || targetTask.criteria_status || {},
        failedReasons: targetTask.failedReasons || targetTask.failed_reasons || []
      });

      // Update session re-audit map
      setSessionReAuditMap(prev => ({
        ...prev,
        [taskId]: {
          reason: cleanReason,
          requestedAt: new Date().toLocaleTimeString()
        }
      }));

      // Update local session verification map
      setSessionVerificationMap(prev => ({
        ...prev,
        [taskId]: {
          humanStatus: 'REAUDIT',
          remarks: updatedRemarks,
          auditor_remarks: updatedRemarks,
          auditStatus: 'NEEDS_REAUDIT',
          needsReAudit: true,
          reAuditReason: cleanReason
        }
      }));

      if (onTaskAudited) {
        onTaskAudited(taskId, 'NEEDS_REAUDIT', {
          remarks: updatedRemarks,
          auditor_remarks: updatedRemarks,
          needsReAudit: true,
          reAuditReason: cleanReason,
          humanStatus: 'REAUDIT'
        });
      }

      setFailAiModalOpen(false);
      setFailAiReasonInput('');
      showVerificationToast(`Task #${targetTask.taskId || targetTask.id} marked as FAILED AI audit & queued for clinical re-audit in database!`, 'success');

      // Auto-advance to next lead in queue
      const currentIdx = queueTasks.findIndex(t => String(t.id || t.taskId) === taskId);
      if (currentIdx >= 0 && currentIdx < queueTasks.length - 1) {
        setSelectedTaskId(queueTasks[currentIdx + 1].id || queueTasks[currentIdx + 1].taskId);
        setActiveAuditResult(null);
      }
    } catch (err) {
      showVerificationToast(`Failed to queue task for re-audit: ${err.message}`, 'error');
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

      {/* Mode Switcher: Unified AI Audits & Verification Hub vs Re-Audit Queue vs Forensic Screener */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveConsoleTab('EXECUTE')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeConsoleTab === 'EXECUTE'
              ? 'bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-purple-500/20 text-sky-300 border border-sky-500/40 shadow-lg shadow-sky-950/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
        >
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span>⚡ AI Audits & Verification Hub</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-950 text-[10px] text-sky-300 border border-slate-800 font-mono">
            {queueTasks.length} Pending
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-950 text-[10px] text-emerald-400 border border-slate-800 font-mono">
            {allAiAuditedTasks.length} Audited
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

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Audit Criteria Button */}
            <button
              type="button"
              onClick={handleOpenCriteriaModal}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-sky-300 hover:text-white border border-sky-500/30 hover:border-sky-400 flex items-center gap-2 font-bold transition-all shadow-md shadow-sky-950/40 cursor-pointer"
              title="View and customize clinical SOP criteria, mandatory standards, fatal failure triggers, and strictness rules used by AI models"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              <span>View Audit Criteria</span>
              <span className="px-1.5 py-0.2 rounded-full bg-sky-950 text-sky-300 text-[10px] font-mono border border-sky-400/30">
                {activeRules.length} Stations
              </span>
              {strictAntiFalsePositive && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Strict Anti-False-Positive Engine Active" />
              )}
            </button>

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
        </div>

        {/* Filter Dropdowns & Team Worker Seat Partitioning */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
          
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

          {/* Parallel Worker Seat Selector (Deterministic Modulo Sharding) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1 flex items-center justify-between">
              <span>👥 Team Worker Seat</span>
              <span className="text-[9px] text-sky-400 font-mono font-bold">
                {allocatedQueueTasks.length} Assigned
              </span>
            </span>
            <select
              value={`${teamWorkerCount}-${teamWorkerIndex}`}
              onChange={(e) => {
                const [c, s] = e.target.value.split('-').map(Number);
                handleSetWorkerConfig(c, s);
              }}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
              title="Select which worker partition this browser will audit. Worker 1 and Worker 2 run in parallel without ever touching the same task!"
            >
              <option value="1-0" className="bg-slate-900">Solo Worker (100% Queue)</option>
              <option value="2-0" className="bg-slate-900">Worker 1 of 2 (50% - Evens)</option>
              <option value="2-1" className="bg-slate-900">Worker 2 of 2 (50% - Odds)</option>
              <option value="3-0" className="bg-slate-900">Worker 1 of 3 (33% - Slot 1)</option>
              <option value="3-1" className="bg-slate-900">Worker 2 of 3 (33% - Slot 2)</option>
              <option value="3-2" className="bg-slate-900">Worker 3 of 3 (33% - Slot 3)</option>
              <option value="4-0" className="bg-slate-900">Worker 1 of 4 (25%)</option>
              <option value="4-1" className="bg-slate-900">Worker 2 of 4 (25%)</option>
              <option value="4-2" className="bg-slate-900">Worker 3 of 4 (25%)</option>
              <option value="4-3" className="bg-slate-900">Worker 4 of 4 (25%)</option>
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
            {/* 1-Click Continuous Auto-Audit Button */}
            {!isBatchRunning ? (
              <button
                onClick={() => runContinuousAutoAudit()}
                disabled={isAuditing || allocatedQueueTasks.length === 0}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-purple-500 disabled:opacity-50 text-white shadow-xl shadow-indigo-950/50 flex items-center gap-2 transition-all cursor-pointer"
                title="Continuously audit all tasks allocated to your seat under strict 13 RPM rate limit with 1.0-1.5s jitter"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>Start Auto-Audit (All {allocatedQueueTasks.length} Assigned)</span>
              </button>
            ) : (
              <button
                onClick={handleStopBatch}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50 flex items-center gap-2 transition-all cursor-pointer animate-pulse"
              >
                <Pause className="w-4 h-4" />
                <span>Pause / Stop Auto-Audit</span>
              </button>
            )}

            <button
              onClick={() => runContinuousAutoAudit(5)}
              disabled={isAuditing || isBatchRunning || allocatedQueueTasks.length === 0}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 text-sky-400" />
              <span>Batch of 5</span>
            </button>

            <button
              onClick={() => runAiAuditOnTask(selectedTask)}
              disabled={isAuditing || isBatchRunning || !selectedTask}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Audit Single Lead</span>
            </button>

            {/* Run Forensic Pre-Screen Button */}
            <button
              onClick={handleRunForensicPreScreen}
              disabled={isForensicScanning || queueTasks.length === 0}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white shadow-lg shadow-purple-600/25 flex items-center gap-2 transition-all cursor-pointer"
              title="Pre-screen queue for blank/black/blurry images to exclude from AI audit and save API quota"
            >
              {isForensicScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-200" /> : <ShieldAlert className="w-3.5 h-3.5 text-purple-200" />}
              <span>Forensic Pre-Screen</span>
              {forensicFlags.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-purple-950 text-purple-200 text-[10px] font-mono border border-purple-400/40 font-bold">
                  {forensicFlags.length} Excluded
                </span>
              )}
            </button>
          </div>

          {/* Progress / Status banner */}
          {isAuditing && !isBatchRunning && (
            <div className="flex items-center gap-2 text-xs text-sky-400 font-semibold animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{currentProgress.message || 'Processing multimodal audit...'}</span>
            </div>
          )}

        </div>

        {/* Live Batch HUD & Rate Limiter Telemetry Banner */}
        {isBatchRunning && (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/60 via-slate-950 to-sky-950/60 border border-indigo-500/40 shadow-xl space-y-2 animate-fade-in text-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 font-bold text-white">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                <span>Continuous Auto-Audit Running:</span>
                <span className="font-mono text-sky-300">
                  Task {batchPaceStatus.currentIdx} of {batchPaceStatus.totalCount}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-emerald-400 font-bold">
                  ⚡ Pace: {batchPaceStatus.rpm} / 13 max RPM
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-amber-300">
                  🎲 Jitter: {batchPaceStatus.jitterSeconds}s
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                  Worker {teamWorkerIndex + 1} of {teamWorkerCount}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
              <div 
                className="bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 h-full transition-all duration-300"
                style={{ width: `${batchPaceStatus.totalCount > 0 ? (batchPaceStatus.currentIdx / batchPaceStatus.totalCount) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate max-w-lg">{batchPaceStatus.statusText || currentProgress.message || 'Pacing requests to prevent rate limits...'}</span>
              <span>Remaining in seat: {Math.max(0, batchPaceStatus.totalCount - batchPaceStatus.currentIdx)} leads</span>
            </div>
          </div>
        )}

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

      {/* UNIFIED MAIN WORKSPACE: Current Task Hero Card + AI Verdict Review Station + Live Audits Ledger */}
      <div className="space-y-6">

        {/* Verification Toast Banner */}
        {verificationToast && (
          <div className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-xl animate-fade-in ${
            verificationToast.type === 'error'
              ? 'bg-rose-950/80 border-rose-500/50 text-rose-200 shadow-rose-950/40'
              : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200 shadow-emerald-950/40'
          }`}>
            <div className="flex items-center gap-2">
              {verificationToast.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{verificationToast.message}</span>
            </div>
            <button
              onClick={() => setVerificationToast(null)}
              className="text-slate-400 hover:text-white ml-2 text-xs font-mono font-normal"
            >
              &times;
            </button>
          </div>
        )}
        
        {/* 1. CURRENT TASK HERO CARD (HUMAN-VERIFICATION SPEED DECK STYLE) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-5">
          
          {/* Card Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-base font-black text-white">
                  TASK #{selectedTask?.taskId || selectedTask?.id || '—'}
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                  {selectedTask?.facilityCode || selectedTask?.city || 'Hub'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {selectedTask?.date || selectedTask?.dispatch_date || 'No Date'}
                </span>
                {selectedTask?.pin && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    PIN: {selectedTask.pin}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Field Executive: <strong className="text-white">{selectedTask?.feName || 'Unknown'}</strong>{' '}
                <span className="text-slate-500 font-mono">[{selectedTask?.feCode || 'FE'}]</span> &bull; Customer: <span className="text-slate-200">{selectedTask?.customerName || 'N/A'}</span>
              </p>
            </div>

            {/* Status badges & Prev/Next navigation */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border shadow-md ${
                (selectedTask?.auditStatus === 'PASSED' || selectedTask?.auditStatus === 'PASS')
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-emerald-950/40'
                  : selectedTask?.auditStatus === 'FATAL'
                  ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow-red-950/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {(selectedTask?.auditStatus === 'PASSED' || selectedTask?.auditStatus === 'PASS') && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {selectedTask?.auditStatus === 'FATAL' && <ShieldAlert className="w-3.5 h-3.5 text-red-400" />}
                <span>{selectedTask?.auditStatus ? `AI ${selectedTask.auditStatus === 'PASS' ? 'PASSED' : selectedTask.auditStatus}` : 'PENDING AUDIT'}</span>
                {selectedTask?.overallScore !== undefined && (
                  <span className="font-mono">({selectedTask.overallScore}/100)</span>
                )}
              </span>

              {/* Real-time Human Verification Badge */}
              {selectedTask?.humanStatus === 'VERIFIED' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm animate-fade-in">
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Human Verified</span>
                </span>
              )}
              {selectedTask?.humanStatus === 'OVERTURNED' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm animate-fade-in">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Human Overturned</span>
                </span>
              )}
              {selectedTask?.humanStatus === 'REAUDIT' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm animate-fade-in">
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                  <span>Re-Audit Queued</span>
                </span>
              )}

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const currentIdx = queueTasks.findIndex(t => String(t.id || t.taskId) === String(selectedTask?.id || selectedTask?.taskId));
                    if (currentIdx > 0) {
                      setSelectedTaskId(queueTasks[currentIdx - 1].id || queueTasks[currentIdx - 1].taskId);
                      setActiveAuditResult(null);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                  title="Previous lead in queue"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const currentIdx = queueTasks.findIndex(t => String(t.id || t.taskId) === String(selectedTask?.id || selectedTask?.taskId));
                    if (currentIdx >= 0 && currentIdx < queueTasks.length - 1) {
                      setSelectedTaskId(queueTasks[currentIdx + 1].id || queueTasks[currentIdx + 1].taskId);
                      setActiveAuditResult(null);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                  title="Next lead in queue"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 5-Station Photo Gallery (Horizontal Responsive 5-Column Grid) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-sky-400">
                <Camera className="w-3.5 h-3.5" />
                <span>5 Mandatory Clinical Photo Stations</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">Click any photo to zoom & enlarge</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { key: 'selfie', label: '1. Selfie & ID', icon: '🤳' },
                { key: 'torches', label: '2. Dual Torches', icon: '🔦' },
                { key: 'visionChart', label: '3. Vision Chart', icon: '📊' },
                { key: 'toolkit', label: '4. Toolkit', icon: '🧰' },
                { key: 'frameDisplay', label: '5. Frame Display', icon: '👓' }
              ].map(st => {
                const url = taskImages[st.key];
                const aiEval = selectedTask ? extractAiStationEvaluation(selectedTask, st.key, activeRules) : null;
                const isAudited = selectedTask && (selectedTask.auditStatus === 'FATAL' || selectedTask.auditStatus === 'PASSED' || selectedTask.auditStatus === 'PASS' || activeAuditResult?.result);

                return (
                  <div
                    key={st.key}
                    className="rounded-2xl border border-slate-800 bg-slate-950/80 p-2.5 flex flex-col justify-between hover:border-slate-700 transition-all group"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
                        <span className="truncate">{st.icon} {st.label}</span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                          url ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                        }`}>
                          {url ? 'Attached' : 'Zero Upload'}
                        </span>
                      </div>

                      <div className="h-56 sm:h-60 w-full rounded-xl bg-slate-900 border border-slate-800/80 overflow-hidden relative group/img flex items-center justify-center">
                        {url ? (
                          <>
                            <img
                              src={url}
                              alt={st.label}
                              className="w-full h-full object-contain p-1 cursor-pointer group-hover/img:scale-[1.02] transition-transform duration-200"
                              onClick={() => setPreviewImage({ url, title: `${st.label} - Task #${selectedTask?.taskId || selectedTask?.id}`, aiEval, stationLabel: st.label })}
                            />
                            
                            {/* ON-HOVER AI CRITERIA OVERLAY */}
                            {isAudited && aiEval ? (
                              <div
                                onClick={() => setPreviewImage({ url, title: `${st.label} - Task #${selectedTask?.taskId || selectedTask?.id}`, aiEval, stationLabel: st.label })}
                                className="absolute inset-0 bg-slate-950/92 backdrop-blur-sm p-2.5 flex flex-col justify-between opacity-0 group-hover/img:opacity-100 transition-all duration-200 z-20 cursor-pointer select-none"
                              >
                                <div className="space-y-1 overflow-hidden">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                                      AI Evaluation
                                    </span>
                                    {aiEval.status === 'FAIL' ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/25 text-red-300 border border-red-500/40 flex items-center gap-1">
                                        <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                                        <span>AI FAILED</span>
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                        <span>AI PASSED</span>
                                      </span>
                                    )}
                                  </div>

                                  {aiEval.status === 'FAIL' ? (
                                    <div className="space-y-0.5">
                                      <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider block">
                                        Failed Criteria:
                                      </span>
                                      <div className="space-y-0.5 max-h-16 overflow-y-auto pr-0.5">
                                        {aiEval.failureReasons.map((reason, rIdx) => (
                                          <div key={rIdx} className="flex items-start gap-1 text-[10px] text-red-200 leading-snug">
                                            <span className="text-red-400 font-bold shrink-0">❌</span>
                                            <span className="line-clamp-2">{reason}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider block">
                                        Compliance:
                                      </span>
                                      <div className="text-[10px] text-emerald-200 flex items-start gap-1 leading-snug">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                                        <span className="line-clamp-3">{aiEval.observations || "Compliant with clinical SOP standards."}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-sky-300 font-semibold">
                                  <span className="flex items-center gap-1">
                                    <Maximize2 className="w-2.5 h-2.5" /> Enlarge
                                  </span>
                                  <span className="text-[9px] text-slate-400">Inspect</span>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => setPreviewImage({ url, title: `${st.label} - Task #${selectedTask?.taskId || selectedTask?.id}`, aiEval, stationLabel: st.label })}
                                className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white font-bold text-xs gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" /> Zoom
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 font-bold text-[10px] gap-1 p-2 text-center">
                            <AlertTriangle className="w-4 h-4 text-rose-500/60" />
                            <span>NO PHOTO UPLOADED</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {url && (
                      <button
                        onClick={() => setPreviewImage({ url, title: `${st.label} - Task #${selectedTask?.taskId || selectedTask?.id}`, aiEval, stationLabel: st.label })}
                        className="mt-2 w-full py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition-colors cursor-pointer text-center"
                      >
                        Enlarge Photo
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* 2. AI VERDICT & HUMAN DECISION STATION (When Active Audit Result OR Audited Task Selected) */}
        {(activeAuditResult || selectedTask?.auditStatus === 'PASSED' || selectedTask?.auditStatus === 'FATAL') && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 animate-fade-in">
            
            {/* Verdict Header Ribbon */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-4 ${
              (activeAuditResult?.result?.verdict === 'PASS' || selectedTask?.auditStatus === 'PASSED')
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/40 border-red-500/40 text-red-300'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-white shadow-lg ${
                  (activeAuditResult?.result?.verdict === 'PASS' || selectedTask?.auditStatus === 'PASSED')
                    ? 'bg-emerald-600 shadow-emerald-600/30'
                    : 'bg-red-600 shadow-red-600/30'
                }`}>
                  {(activeAuditResult?.result?.verdict === 'PASS' || selectedTask?.auditStatus === 'PASSED')
                    ? <CheckCircle2 className="w-6 h-6" />
                    : <ShieldAlert className="w-6 h-6" />}
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Multimodal AI Inspection Verdict
                  </div>
                  <div className="text-xl font-black text-white">
                    {(activeAuditResult?.result?.verdict === 'PASS' || selectedTask?.auditStatus === 'PASSED')
                      ? 'AUDIT PASSED'
                      : 'FATAL NON-COMPLIANCE STRIKE'}
                  </div>
                </div>
              </div>

              {/* Score & Confidence */}
              <div className="text-right">
                <div className="text-2xl font-black text-white font-mono">
                  {activeAuditResult?.result?.overallScore ?? selectedTask?.overallScore ?? (selectedTask?.auditStatus === 'PASSED' ? 100 : 0)}
                  <span className="text-xs text-slate-400 font-normal">/100</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Model: <strong className="text-sky-300">{activeAuditResult?.result?.modelUsed || selectedTask?.auditedBy || 'gemini-3.8-flash'}</strong>
                  {activeAuditResult?.result?.confidenceScore && (
                    <span> &bull; Conf: {activeAuditResult.result.confidenceScore}%</span>
                  )}
                </div>
              </div>
            </div>

            {/* AI Executive Summary / Observations */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block">
                Clinical Evaluation Summary
              </span>
              <p className="text-slate-200 leading-relaxed font-sans">
                {activeAuditResult?.result?.summary || selectedTask?.remarks || selectedTask?.auditor_remarks || 'Compliant with clinical standards.'}
              </p>
              {activeAuditResult?.result?.isFraudulentOrBlankDetected && (
                <div className="mt-2 p-2 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-[11px] font-bold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Fraud Alert: AI identified blank, covered lens, or camera-obscured photo submission.</span>
                </div>
              )}
            </div>

            {/* 5-Station Itemized Checklist (if available) */}
            {activeAuditResult?.result?.criteriaEvaluation && activeAuditResult.result.criteriaEvaluation.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>Item-by-Item SOP Evaluation</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeAuditResult.result.criteriaEvaluation.map((crit) => (
                    <div
                      key={crit.id}
                      className={`p-3 rounded-xl border text-xs ${
                        crit.status === 'PASS' ? 'bg-slate-950/60 border-slate-800' : 'bg-red-950/20 border-red-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${crit.status === 'PASS' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {crit.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          crit.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                        }`}>
                          {crit.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">{crit.observations}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* INTEGRATED HUMAN REVIEW DECISION STATION */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/30 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-400" /> Human Reviewer Decision
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Reviewer: <strong className="text-slate-200">{currentUser?.name || currentUser?.email || 'Central QA'}</strong>
                </span>
              </div>

              {/* If already verified or overturned, show banner */}
              {selectedTask?.humanStatus === 'VERIFIED' && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Verdict is <strong>Human Verified</strong> and committed to Supabase database.</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold px-2 py-0.5 rounded bg-emerald-900/50">LOCKED &bull; COMPLIANT</span>
                </div>
              )}
              {selectedTask?.humanStatus === 'OVERTURNED' && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>AI verdict was <strong>Overturned by Human Reviewer</strong> and saved in database.</span>
                  </div>
                  <span className="text-[10px] text-amber-400 font-mono font-bold px-2 py-0.5 rounded bg-amber-900/50">OVERRULED</span>
                </div>
              )}

              <div>
                <input
                  type="text"
                  value={humanNotesInput}
                  onChange={(e) => setHumanNotesInput(e.target.value)}
                  placeholder="Add optional verification notes or rationale for database audit record..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  onClick={handleConfirmAiVerdict}
                  disabled={isVerifyingAction}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-950/40"
                  title="Approve and record human verification for this AI audit verdict in Supabase"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>Confirm AI Verdict</span>
                </button>

                {/* Overturn Button */}
                {selectedTask?.auditStatus === 'FATAL' ? (
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
                  <span>Fail AI Audit (Send to Re-Audit)</span>
                </button>

                {activeAuditResult && (
                  <button
                    onClick={() => setActiveAuditResult(null)}
                    className="ml-auto px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  >
                    Dismiss Report
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

        {/* 3. LIVE AI AUDITS & VERDICTS LEDGER (REPLACES OLD IDLE PANEL) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-0">
          
          {/* Ledger Header with Search & Export */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>All AI Audits & Live Verdicts Ledger ({allAiAuditedTasks.length} Completed)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time ledger of all AI-audited tasks. Click any task to inspect its 5 photos and review AI verdicts.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={ledgerSearchQuery}
                  onChange={(e) => setLedgerSearchQuery(e.target.value)}
                  placeholder="Filter audits..."
                  className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-32 sm:w-44"
                />
              </div>

              <button
                onClick={handleExportSessionExcel}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Export Ledger</span>
              </button>
            </div>
          </div>

          {/* Filter Pills Strip */}
          <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 flex-wrap text-xs">
            {[
              { key: 'ALL', label: 'All Audits', count: allAiAuditedTasks.length },
              { key: 'PASSED', label: 'AI Passed', count: allAiAuditedTasks.filter(t => t.auditStatus === 'PASSED').length, color: 'text-emerald-400' },
              { key: 'FATAL', label: 'AI Fatal', count: allAiAuditedTasks.filter(t => t.auditStatus === 'FATAL').length, color: 'text-red-400' },
              { key: 'VERIFIED', label: 'Human Verified', count: allAiAuditedTasks.filter(t => t.humanStatus === 'VERIFIED').length, color: 'text-sky-400' },
              { key: 'OVERTURNED', label: 'Overturned', count: allAiAuditedTasks.filter(t => t.humanStatus === 'OVERTURNED').length, color: 'text-purple-400' }
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setLedgerFilter(f.key)}
                className={`px-3 py-1 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  ledgerFilter === f.key
                    ? 'bg-slate-800 text-white border border-slate-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
                }`}
              >
                <span className={f.color}>{f.label}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-[10px] font-mono border border-slate-800 text-slate-300">
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Table / List */}
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            {filteredLedgerTasks.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No AI-audited tasks matching this filter.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-950 z-10">
                  <tr className="text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800">
                    <th className="py-3 px-4">Task ID</th>
                    <th className="py-3 px-3">Field Executive</th>
                    <th className="py-3 px-3">Hub / City</th>
                    <th className="py-3 px-3 text-center">AI Verdict</th>
                    <th className="py-3 px-3 text-center">Score</th>
                    <th className="py-3 px-3 text-center">Human Status</th>
                    <th className="py-3 px-4">Remarks / Fatal Reasons</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {filteredLedgerTasks.map((t) => {
                    const isFatal = t.auditStatus === 'FATAL';
                    const isSelected = String(t.id || t.taskId) === String(selectedTask?.id || selectedTask?.taskId);
                    return (
                      <tr
                        key={t.id || t.taskId}
                        onClick={() => {
                          setSelectedTaskId(t.id || t.taskId);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-sky-950/40 hover:bg-sky-950/50' : 'hover:bg-slate-850/50'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-sky-400">
                          #{t.taskId || t.id}
                        </td>
                        <td className="py-3 px-3 font-semibold text-white">
                          {t.feName || 'Unknown FE'}{' '}
                          <span className="text-[10px] text-slate-500 font-mono">[{t.feCode || 'FE'}]</span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {t.facilityCode || t.city || 'Hub'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            isFatal ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}>
                            {t.auditStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-white">
                          {t.overallScore ?? (isFatal ? 0 : 100)}/100
                        </td>
                        <td className="py-3 px-3 text-center">
                          {t.humanStatus === 'VERIFIED' && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              ✓ Verified
                            </span>
                          )}
                          {t.humanStatus === 'OVERTURNED' && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              ↺ Overturned
                            </span>
                          )}
                          {t.humanStatus === 'PENDING' && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-400 italic" title={t.remarks || t.auditor_remarks}>
                          {t.remarks || t.auditor_remarks || 'Compliant with clinical standards.'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskId(t.id || t.taskId);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
        </>
      )}

      {/* TAB 2: CLINICAL RE-AUDIT QUEUE */}

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

      {/* Overturn Reason Modal (Global) */}
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
                You are overriding Task #{(selectedTask || selectedVerifyTask)?.taskId || (selectedTask || selectedVerifyTask)?.id} from{' '}
                <strong className="text-white">{(selectedTask || selectedVerifyTask)?.auditStatus}</strong> to{' '}
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

      {/* Fail AI Audit & Request Human Re-Audit Modal (Global) */}
      {failAiModalOpen && (selectedTask || selectedVerifyTask) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Fail AI Audit & Queue for Re-Audit</h4>
                  <p className="text-[11px] text-slate-400">
                    Task #{(selectedTask || selectedVerifyTask).taskId || (selectedTask || selectedVerifyTask).id} • {(selectedTask || selectedVerifyTask).feName}
                  </p>
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
                  {(selectedTask || selectedVerifyTask).auditStatus === 'PASSED' ? 'Flagging False Positive' : 'Disputing False Strike'}
                </span>
              </div>

              {/* One-Click Quick Reason Pills */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {(selectedTask || selectedVerifyTask).auditStatus === 'PASSED' ? '⚡ Common False Positive Reasons:' : '⚡ Common False Strike Reasons:'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {((selectedTask || selectedVerifyTask).auditStatus === 'PASSED' ? [
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
                  (selectedTask || selectedVerifyTask).auditStatus === 'PASSED'
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

      {/* Enlarged Photo Preview Modal with AI Criteria Breakdown */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col md:flex-row animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Photo View */}
            <div className="flex-1 bg-slate-950 p-4 flex flex-col items-center justify-center min-h-0 relative select-none">
              <div className="absolute top-3 left-4 flex items-center gap-2 z-10">
                <span className="text-xs font-bold text-white bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-800 shadow">
                  {previewImage.title}
                </span>
              </div>
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-xl"
              />
            </div>

            {/* Right Criteria Panel (if aiEval is present) */}
            {previewImage.aiEval ? (
              <div className="w-full md:w-84 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 p-4 overflow-y-auto flex flex-col justify-between space-y-4 shrink-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Inspection Details</span>
                      <span className="text-xs font-bold text-white">{previewImage.stationLabel || 'Station Photo'}</span>
                    </div>
                    <button
                      onClick={() => setPreviewImage(null)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* AI Status Badge */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between ${
                    previewImage.aiEval.status === 'FAIL' ? 'bg-red-950/30 border-red-500/40' : 'bg-emerald-950/30 border-emerald-500/40'
                  }`}>
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      {previewImage.aiEval.status === 'FAIL' ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          <span className="text-red-300">Station FAILED by AI</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-emerald-300">Station PASSED by AI</span>
                        </>
                      )}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono ${
                      previewImage.aiEval.status === 'FAIL' ? 'bg-red-500/30 text-red-200' : 'bg-emerald-500/30 text-emerald-200'
                    }`}>
                      {previewImage.aiEval.status}
                    </span>
                  </div>

                  {/* Failure Reasons or Compliance */}
                  {previewImage.aiEval.status === 'FAIL' ? (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                        Criteria Violations Detected by AI:
                      </span>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {previewImage.aiEval.failureReasons.map((reason, idx) => (
                          <div key={idx} className="p-2 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-200 flex items-start gap-1.5 leading-snug">
                            <span className="text-red-400 font-bold shrink-0 mt-0.5">❌</span>
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                      {previewImage.aiEval.observations && (
                        <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                          <span className="font-bold text-slate-400 block mb-0.5 text-[10px] uppercase">Observations & Evidence:</span>
                          "{previewImage.aiEval.observations}"
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                        Compliance Standards Met:
                      </span>
                      <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200 flex items-start gap-1.5 leading-snug">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{previewImage.aiEval.observations || "All mandatory equipment visible & verified compliant with DLC SOP standards."}</span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setPreviewImage(null)}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Close Inspection
                </button>
              </div>
            ) : (
              <div className="p-3 border-t md:border-t-0 md:border-l border-slate-800 flex items-center justify-end">
                <button
                  onClick={() => setPreviewImage(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                >
                  Close (ESC)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW & EDIT AUDIT CRITERIA MODAL (ANTI-FALSE-POSITIVE ENGINE) */}
      {criteriaModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shadow-md">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-white">
                      Clinical AI Audit Criteria & Strictness Studio
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Anti-False-Positive Tuner
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    View & customize the exact clinical standards, fatal failure triggers, and strictness rules used by AI models to evaluate dispatches.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setCriteriaModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Close without saving"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Station Tabs Navigation */}
            <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'selfie', label: '1. Selfie & ID', icon: '🤳' },
                { id: 'torches', label: '2. Dual Torches', icon: '🔦' },
                { id: 'visionChart', label: '3. Vision Chart & Standee', icon: '📊' },
                { id: 'toolkit', label: '4. Diagnostic Toolkit', icon: '🧰' },
                { id: 'frameDisplay', label: '5. Frame Display', icon: '👓' }
              ].map((st) => {
                const isSelected = criteriaModalTab === st.id;
                const ruleObj = draftRules.find(r => r.id === st.id);
                const standardsCount = ruleObj?.standards?.length || 0;
                const failuresCount = ruleObj?.commonFailures?.length || 0;

                return (
                  <button
                    key={st.id}
                    onClick={() => setCriteriaModalTab(st.id)}
                    className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer border-b-2 ${
                      isSelected
                        ? 'bg-slate-800 text-sky-300 border-sky-400 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-850/60'
                    }`}
                  >
                    <span>{st.icon}</span>
                    <span>{st.label}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-sky-950 text-sky-200' : 'bg-slate-900 text-slate-500'
                    }`}>
                      {standardsCount}+{failuresCount}
                    </span>
                  </button>
                );
              })}

              <button
                onClick={() => setCriteriaModalTab('STRICTNESS')}
                className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer border-b-2 ${
                  criteriaModalTab === 'STRICTNESS'
                    ? 'bg-amber-950/40 text-amber-300 border-amber-400 shadow-sm'
                    : 'text-amber-400/80 hover:text-amber-300 border-transparent hover:bg-slate-850/60'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Anti-False-Positive Engine</span>
                {draftStrictAntiFalsePositive && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs text-slate-300">
              {criteriaModalTab === 'STRICTNESS' ? (
                /* GLOBAL STRICTNESS & ANTI-FALSE-POSITIVE ENGINE */
                <div className="space-y-5 animate-fade-in">
                  
                  {/* Anti-False-Positive Quality Directive Toggle */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-950 to-indigo-950/40 border border-amber-500/40 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                          <h4 className="text-sm font-black text-white">
                            Zero-Tolerance Anti-False-Positive Enforcement Directive
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Recommended
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Actively addresses the <strong>80% false-positive rate</strong>. When enabled, this injects an unsparing clinical QA directive into the AI prompt that strictly forbids giving field executives the benefit of the doubt. If torch illumination, employee ID card, standee, or equipment is missing, unreadable, or ambiguous, the model is instructed to fail the station immediately with a <strong>FATAL</strong> verdict.
                        </p>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                        <input
                          type="checkbox"
                          checked={draftStrictAntiFalsePositive}
                          onChange={(e) => setDraftStrictAntiFalsePositive(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                      <div className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                        Directive Injected Into AI System Prompt:
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        &quot;You are an unsparing, high-rigor Chief Clinical QA Inspector. Dispatches currently have an unacceptably high rate of FALSE POSITIVES. You MUST NOT give Field Executives the benefit of the doubt. If ANY required uniform item, employee ID badge, or piece of equipment is missing, unreadable, obscured, not visible, or doubtful, YOU MUST FAIL THAT CRITERION WITH &apos;FAIL&apos; AND ISSUE AN OVERALL &apos;FATAL&apos; STRIKE.&quot;
                      </p>
                    </div>
                  </div>

                  {/* Custom Clinical Auditor Prompt Directives */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                        <span>Custom Clinical Prompt Directives (Optional Direct Prompt Injection)</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">Appended to AI Prompt</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Add any specific rules, equipment nuances, or strictness instructions for your region or current audit campaign.
                    </p>
                    <textarea
                      value={draftCustomDirectives}
                      onChange={(e) => setDraftCustomDirectives(e.target.value)}
                      placeholder="e.g. Reject any selfie where the employee ID badge cannot be read clearly. Strictly check that both torches have glowing LEDs. Ensure vision chart is mounted on the standee and not taped to a door or wall."
                      rows={4}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono leading-relaxed"
                    />
                  </div>

                </div>
              ) : (
                /* SINGLE STATION CRITERIA CONFIGURATION */
                (() => {
                  const activeRule = draftRules.find(r => r.id === criteriaModalTab) || draftRules[0];
                  if (!activeRule) return null;

                  return (
                    <div className="space-y-5 animate-fade-in">
                      
                      {/* Station Title & Description */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1 space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-300 block">
                            Station Name / Label:
                          </label>
                          <input
                            type="text"
                            value={activeRule.label || activeRule.title || ''}
                            onChange={(e) => handleUpdateDraftRuleField(activeRule.id, 'label', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2 space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-300 block">
                            SOP Purpose & Clinical Expectations:
                          </label>
                          <input
                            type="text"
                            value={activeRule.description || ''}
                            onChange={(e) => handleUpdateDraftRuleField(activeRule.id, 'description', e.target.value)}
                            placeholder="Detailed description of what must be shown in this photo..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-medium"
                          />
                        </div>
                      </div>

                      {/* 2-Column Grid: Mandatory Standards vs Instant Fatal Failures */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Column 1: Mandatory Standards (Must meet ALL) */}
                        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                              <span className="font-bold text-emerald-400 text-xs flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <span>Mandatory Standards ({activeRule.standards?.length || 0})</span>
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">Must Meet All</span>
                            </div>

                            <p className="text-[11px] text-slate-400 mt-2">
                              Items that AI must explicitly confirm are visible in the photo to pass.
                            </p>

                            <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                              {(activeRule.standards || []).map((std, idx) => (
                                <div
                                  key={idx}
                                  className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 flex items-start justify-between gap-2 group hover:border-slate-700 transition-colors"
                                >
                                  <div className="flex items-start gap-2 text-xs text-slate-200">
                                    <span className="text-emerald-400 font-bold">•</span>
                                    <span>{std}</span>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveStandardFromDraft(activeRule.id, idx)}
                                    className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                                    title="Delete standard"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                              {(!activeRule.standards || activeRule.standards.length === 0) && (
                                <p className="text-[11px] text-slate-500 italic p-2 text-center">
                                  No standards defined for this station.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Add standard input */}
                          <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                            <input
                              type="text"
                              value={newStandardInput}
                              onChange={(e) => setNewStandardInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddStandardToDraft(activeRule.id);
                                }
                              }}
                              placeholder="Add new mandatory standard..."
                              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              onClick={() => handleAddStandardToDraft(activeRule.id)}
                              disabled={!newStandardInput.trim()}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>

                        {/* Column 2: Instant Non-Compliance / Fatal Triggers (Fixes 80% False Positives) */}
                        <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between pb-2 border-b border-rose-500/20">
                              <span className="font-bold text-rose-300 text-xs flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-rose-400" />
                                <span>Instant FATAL Failure Triggers ({activeRule.commonFailures?.length || 0})</span>
                              </span>
                              <span className="text-[10px] text-rose-400 font-mono font-bold">Strict Gate</span>
                            </div>

                            <p className="text-[11px] text-slate-300 mt-2">
                              Defects that force AI to <strong>FAIL</strong> this station and strike <strong>FATAL</strong>. Add specific violations here to eradicate false passes!
                            </p>

                            <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                              {(activeRule.commonFailures || []).map((fail, idx) => (
                                <div
                                  key={idx}
                                  className="p-2 rounded-xl bg-slate-950/80 border border-rose-900/40 flex items-start justify-between gap-2 group hover:border-rose-700/60 transition-colors"
                                >
                                  <div className="flex items-start gap-2 text-xs text-rose-200">
                                    <span className="text-rose-400 font-bold">✕</span>
                                    <span>{fail}</span>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveFailureFromDraft(activeRule.id, idx)}
                                    className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                                    title="Delete failure trigger"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                              {(!activeRule.commonFailures || activeRule.commonFailures.length === 0) && (
                                <p className="text-[11px] text-slate-500 italic p-2 text-center">
                                  No fatal failure triggers defined.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Add failure input */}
                          <div className="pt-2 border-t border-rose-900/30 flex items-center gap-2">
                            <input
                              type="text"
                              value={newFailureInput}
                              onChange={(e) => setNewFailureInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddFailureToDraft(activeRule.id);
                                }
                              }}
                              placeholder="Add defect that forces AI to fail..."
                              className="flex-1 bg-slate-900 border border-rose-900/40 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                            />
                            <button
                              onClick={() => handleAddFailureToDraft(activeRule.id)}
                              disabled={!newFailureInput.trim()}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>

                      </div>

                      {/* Triggers Fatal Strike Toggle */}
                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-white block">
                            Station Fatal Strike Authority
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Failing this criterion marks the entire dispatch as FATAL in the database.
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={activeRule.triggersFatal !== false}
                            onChange={(e) => handleUpdateDraftRuleField(activeRule.id, 'triggersFatal', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                        </label>
                      </div>

                    </div>
                  );
                })()
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between flex-wrap gap-3">
              <button
                onClick={handleResetCriteriaToDefaults}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-900/50 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Restore official Lenskart central clinical defaults"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to DLC Defaults</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCriteriaModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCriteria}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-purple-500 text-white shadow-lg shadow-sky-950/50 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4 text-emerald-300" />
                  <span>Save & Apply Criteria to AI Audits</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
