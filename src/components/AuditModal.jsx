import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ExternalLink, 
  ChevronLeft, 
  ChevronRight, 
  ShieldAlert, 
  Sparkles, 
  Info, 
  Check, 
  Camera, 
  Layers, 
  Eye, 
  Mail,
  Wrench,
  PackagePlus,
  Trash2,
  Clock,
  Plus,
  Scale,
  Zap,
  CornerDownLeft,
  CheckCheck,
  RotateCcw
} from 'lucide-react';
import { EQUIPMENT_CATALOGUE, FAULT_CONDITIONS, REPLACEMENT_URGENCY } from '../data/equipmentItems.js';
import { INITIAL_CENTRAL_RULES } from '../data/centralRules.js';
import { 
  isAiAuditedTask, 
  getHumanVerificationStatus, 
  isAwaitingHumanVerification 
} from '../lib/supabase.js';
import { parseFailedStationsFromText } from '../utils/crossVerificationHelper.js';

export const BLANKET_FATAL_REASONS = [
  'All images missing / blank / black',
  'All images heavily blurred / unreadable',
  'Duplicate / recycled images detected'
];

export default function AuditModal({
  task,
  onClose,
  onPassAudit,
  onFatalAudit,
  onNextTask,
  onPrevTask,
  hasNext,
  hasPrev,
  auditorName,
  auditorLocation,
  onOpenEmail,
  onUpdateReplacements,
  rules = INITIAL_CENTRAL_RULES,
  isReAudit = false,
  onOverturnAudit,
  onUpholdAudit,
  onConfirmAiVerdict,
  onOverturnAiVerdict,
  canViewAiDetails = false
}) {
  const [activeCriterionIndex, setActiveCriterionIndex] = useState(0);
  const [rightPanelTab, setRightPanelTab] = useState('sop'); // 'sop' | 'replacements'
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showFatalPicker, setShowFatalPicker] = useState(false);
  const [selectedViolations, setSelectedViolations] = useState([]);
  const [customRemark, setCustomRemark] = useState('');
  const [selectedRemarkPreset, setSelectedRemarkPreset] = useState('');
  const [criteriaStatus, setCriteriaStatus] = useState({});

  // Speedrun Zones & Keyboard Traversal State
  const [activeZone, setActiveZone] = useState('verdict'); // 'remarks' | 'verdict' | 'criteria' | 'tools'
  const [showBlanketFatalModal, setShowBlanketFatalModal] = useState(false);
  const [blanketReasonIndex, setBlanketReasonIndex] = useState(0);
  const [highlightedFailureIndex, setHighlightedFailureIndex] = useState(0);
  const [highlightedToolIndex, setHighlightedToolIndex] = useState(0);
  const [verdictLeaderActive, setVerdictLeaderActive] = useState(false);
  const verdictTimeoutRef = useRef(null);
  const remarksSelectRef = useRef(null);

  // AI Audit & Human Verification State (Strictly gated by page access to prevent City Admin confirmation bias)
  const isAiAudited = Boolean(canViewAiDetails && isAiAuditedTask(task));
  const humanVerificationStatus = canViewAiDetails ? getHumanVerificationStatus(task) : null;
  const isAwaitingVerification = Boolean(canViewAiDetails && isAwaitingHumanVerification(task));

  // AI Re-Audit Detection & Criteria Resolution
  const isAiReAudit = Boolean(
    canViewAiDetails && (
      task?.isAiReAudit || 
      task?.needsReAudit || 
      task?.reAuditReason || 
      (task?.auditor_remarks && (task.auditor_remarks.includes('[AI Audit Failed') || task.auditor_remarks.includes('[AI Audit Rejected')))
    )
  );

  const aiCriteriaMap = useMemo(() => {
    if (!canViewAiDetails) return {};
    return task?.aiCriteriaStatus || task?.criteriaStatus || task?.criteria_status || {};
  }, [task, canViewAiDetails]);

  const aiFailedList = useMemo(() => {
    if (!canViewAiDetails) return [];
    return task?.aiFailedReasons || task?.failedReasons || task?.failed_reasons || [];
  }, [task, canViewAiDetails]);

  // Equipment Replacements Requisition State
  const [replacements, setReplacements] = useState([]);
  const [selectedItemToAdd, setSelectedItemToAdd] = useState('');
  const [selectedCondition, setSelectedCondition] = useState(FAULT_CONDITIONS[0]);
  const [selectedUrgency, setSelectedUrgency] = useState('CRITICAL');
  const [replacementNotes, setReplacementNotes] = useState('');

  useEffect(() => {
    if (task) {
      // Strictly reset item sequence to the 1st checklist item for each new task
      setActiveCriterionIndex(0);
      setSelectedRemarkPreset('');

      // Blind Manual Audit Guarantee:
      // Always start with a 100% clean, blank task slate with 0 pre-filled item verdicts or failure selections.
      // City Admins and Auditors must evaluate each station blindly from scratch without anchoring bias.
      const shouldPreload = Boolean(canViewAiDetails && isReAudit && !task?.isAiReAudit && (task?.human_verified || task?.human_overturned));

      setCriteriaStatus(shouldPreload ? (task.criteriaStatus || {}) : {});
      setSelectedViolations(shouldPreload ? (task.failedReasons || []) : []);
      setCustomRemark(shouldPreload ? (task.remarks || '') : '');
      setReplacements(shouldPreload ? (task.replacements || []) : []);
      setZoomLevel(1);
      setRotation(0);
      setShowFatalPicker(false);
      setShowBlanketFatalModal(false);
      setBlanketReasonIndex(0);
      setHighlightedFailureIndex(0);
      setHighlightedToolIndex(0);
    }
  }, [task, isReAudit]);

  if (!task) return null;

  const currentCriterion = rules[activeCriterionIndex] || rules[0] || INITIAL_CENTRAL_RULES[0];
  const fieldKey = currentCriterion.field || currentCriterion.imageKey;
  
  // Fast normalize Locus URLs to CDN to eliminate 302 redirects & relative path mismatches
  const rawImgUrl = task.images?.[fieldKey] || '';
  const originalUrl = (() => {
    if (!rawImgUrl || typeof rawImgUrl !== 'string') return '';
    let u = rawImgUrl.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('data:') && !u.startsWith('blob:')) {
      const stripped = u.replace(/^\/+/, '');
      if (stripped.startsWith('v1/client/')) {
        u = `https://assets.locus-api.com/${stripped}`;
      } else {
        u = `https://assets.locus-api.com/v1/client/lenskart-dlc/task/${task.id || task.taskId}/file/${stripped}`;
      }
    }
    u = u.replace(/^http:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
    u = u.replace(/^https:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
    u = u.replace(/^http:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
    u = u.replace(/^https:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
    return u;
  })();

  // Current criterion AI diagnostic (gated strictly by page access)
  const currentCriterionAiStatus = useMemo(() => {
    if (!canViewAiDetails || !currentCriterion) return null;
    const cid = currentCriterion.id;
    const fid = currentCriterion.field || currentCriterion.imageKey;
    const st = aiCriteriaMap[cid] || (fid ? aiCriteriaMap[fid] : null);
    
    // Find matching AI failure reason
    const matchingReason = aiFailedList.find(r => {
      const lower = String(r).toLowerCase();
      if ((cid === 'selfie' || fid === 'selfie') && (lower.includes('selfie') || lower.includes('t-shirt') || lower.includes('badge') || lower.includes('id card'))) return true;
      if ((cid === 'torches' || fid === 'torches') && (lower.includes('torch') || lower.includes('penlight') || lower.includes('blue') || lower.includes('yellow'))) return true;
      if ((cid === 'visionChart' || fid === 'visionChart') && (lower.includes('chart') || lower.includes('standee') || lower.includes('vision'))) return true;
      if ((cid === 'toolkit' || fid === 'toolkit') && (lower.includes('toolkit') || lower.includes('sanitizer') || lower.includes('jcc') || lower.includes('frame') || lower.includes('ruler'))) return true;
      if ((cid === 'trialLenses' || fid === 'trialLenses' || fid === 'frameDisplay') && (lower.includes('lens') || lower.includes('display') || lower.includes('tray'))) return true;
      return false;
    });

    if (!st && !matchingReason && !isAiReAudit) return null;
    return {
      status: st || (matchingReason ? 'FAIL' : 'PASS'),
      reason: matchingReason || null
    };
  }, [currentCriterion, aiCriteriaMap, aiFailedList, isAiReAudit, canViewAiDetails]);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 0.75));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleResetView = () => {
    setZoomLevel(1);
    setRotation(0);
  };

  const handleToggleCriterionStatus = (key, status) => {
    const updated = { ...criteriaStatus, [key]: status };
    setCriteriaStatus(updated);
  };

  const toggleViolation = (violation) => {
    if (selectedViolations.includes(violation)) {
      setSelectedViolations(selectedViolations.filter(v => v !== violation));
    } else {
      setSelectedViolations([...selectedViolations, violation]);
    }
  };

  // Add Replacement Item
  const handleAddReplacement = (itemData) => {
    let itemToAdd = itemData;

    if (!itemToAdd && selectedItemToAdd) {
      for (const cat of EQUIPMENT_CATALOGUE) {
        const found = cat.items.find(i => i.id === selectedItemToAdd);
        if (found) {
          itemToAdd = { ...found, category: cat.category };
          break;
        }
      }
    }

    if (!itemToAdd) {
      alert('Please select an equipment or consumable item.');
      return;
    }

    const newEntry = {
      id: `${itemToAdd.id}_${Date.now()}`,
      itemId: itemToAdd.id,
      itemName: itemToAdd.name,
      category: itemToAdd.category || 'General Equipment',
      type: itemToAdd.type || 'Asset',
      condition: selectedCondition,
      urgency: selectedUrgency,
      notes: replacementNotes.trim() || `Flagged during audit of ${currentCriterion.title}`,
      reportedAt: new Date().toISOString(),
      reportedBy: auditorName || 'Auditor',
      posStatus: 'FLAGGED_BY_AUDITOR'
    };

    const updated = [...replacements, newEntry];
    setReplacements(updated);
    setReplacementNotes('');
    setSelectedItemToAdd('');
    onUpdateReplacements?.(task.id, updated);
  };

  const handleRemoveReplacement = (id) => {
    const updated = replacements.filter(r => r.id !== id);
    setReplacements(updated);
    onUpdateReplacements?.(task.id, updated);
  };

  // Helper to determine if a specific rule/checkpoint is passed
  const isRulePassed = (r) => {
    const key = r.id;
    const altKey = r.field || r.imageKey;
    return criteriaStatus[key] === 'PASS' || (altKey && criteriaStatus[altKey] === 'PASS');
  };

  // Count checkpoints marked as PASS
  const passedCheckpointsCount = useMemo(() => {
    return rules.filter(isRulePassed).length;
  }, [rules, criteriaStatus]);

  // All checkpoints must be passed before "PASS AUDIT (P)" can be submitted
  const allItemsPassed = rules.length > 0 && passedCheckpointsCount === rules.length;

  // Immediate Quick Pass Execution
  const handlePassClick = () => {
    if (!allItemsPassed) {
      alert(`Cannot Pass Audit: Only ${passedCheckpointsCount} of ${rules.length} items have been passed. Every item must be audited and marked PASS before completing the audit.`);
      return;
    }

    const allPassedCriteria = {};
    rules.forEach(r => {
      allPassedCriteria[r.id || r.imageKey] = 'PASS';
    });
    onPassAudit(task.id, {
      remarks: customRemark || 'All SOP criteria verified and passed.',
      criteriaStatus: allPassedCriteria,
      replacements: replacements,
      taskData: task
    });
  };

  // Immediate Blanket Fatal Execution
  const triggerBlanketFatal = (reasonIdx) => {
    const selectedReason = BLANKET_FATAL_REASONS[reasonIdx] || BLANKET_FATAL_REASONS[0];
    const allFailedCriteria = {};
    rules.forEach(r => {
      allFailedCriteria[r.id || r.imageKey] = 'FAIL';
    });

    onFatalAudit(task.id, {
      failedReasons: [selectedReason],
      remarks: `Blanket Fatal: ${selectedReason}`,
      criteriaStatus: allFailedCriteria,
      replacements: replacements,
      taskData: task,
      emailNotified: false
    });

    setShowBlanketFatalModal(false);
    if (hasNext) onNextTask();
    else onClose();
  };

  // Count checkpoints marked as FAIL
  const failedCheckpoints = useMemo(() => {
    return Object.entries(criteriaStatus).filter(([_, status]) => status === 'FAIL').map(([id]) => id);
  }, [criteriaStatus]);

  const hasFatalCriteria = selectedViolations.length > 0 || Boolean(customRemark && customRemark.trim().length > 0);
  const canSubmitFatal = failedCheckpoints.length > 0 && hasFatalCriteria;

  const handleConfirmFatal = () => {
    // 1. Strict Requirement: Without any failed items, no one can mark fatal by clicking the button!
    if (failedCheckpoints.length === 0) {
      alert('Cannot mark as FATAL: No checkpoint/item has been marked as FAIL. You must mark at least one checkpoint as FAIL before submitting a fatal audit.');
      return;
    }

    // 2. Strict Requirement: Must select at least 1 criteria reason or provide specific remarks for fatal
    if (!hasFatalCriteria) {
      alert('Please select at least one fatal failure criteria reason (or enter specific feedback) for the failed items.');
      setRightPanelTab('sop');
      setActiveZone('criteria');
      setShowFatalPicker(true);
      return;
    }

    // Reconcile and finalize item-level criteria statuses:
    // Mark failed stations as FAIL and remaining stations as PASS to prevent contradictory all-PASS states
    const finalizedCriteria = {};
    const textReasons = [...(selectedViolations || []), customRemark || ''].join(' ');
    const parsedFails = parseFailedStationsFromText(textReasons);

    rules.forEach(r => {
      const key = r.id || r.imageKey;
      const isMarkedFail = criteriaStatus[key] === 'FAIL' || failedCheckpoints.includes(key) || parsedFails.includes(key);
      finalizedCriteria[key] = isMarkedFail ? 'FAIL' : 'PASS';
    });

    // Guard: Ensure at least one checkpoint is explicitly FAIL
    const hasFail = Object.values(finalizedCriteria).some(v => v === 'FAIL');
    if (!hasFail) {
      const currentKey = currentCriterion?.id || currentCriterion?.imageKey || 'selfie';
      finalizedCriteria[currentKey] = 'FAIL';
    }

    onFatalAudit(task.id, {
      failedReasons: selectedViolations.length > 0 ? selectedViolations : [customRemark.trim()],
      remarks: customRemark.trim(),
      criteriaStatus: finalizedCriteria,
      replacements: replacements,
      taskData: task,
      emailNotified: false
    });

    if (hasNext) onNextTask();
    else onClose();
  };

  // ====================================================================
  // SPEEDRUN VIM HOTKEYS & GLOBAL KEYBOARD LISTENER
  // ====================================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Strict guard against text inputs globally
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

      // Modal Mode: Blanket Fatal Overlay Active
      if (showBlanketFatalModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowBlanketFatalModal(false);
          return;
        }
        if (e.key === '1') {
          e.preventDefault();
          triggerBlanketFatal(0);
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          triggerBlanketFatal(1);
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          triggerBlanketFatal(2);
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          setBlanketReasonIndex(prev => Math.max(0, prev - 1));
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          setBlanketReasonIndex(prev => Math.min(2, prev + 1));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          triggerBlanketFatal(blanketReasonIndex);
          return;
        }
        return;
      }

      // 2. Zone Switches & [v + p] / [v + c] Verdict Combinations
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setActiveZone('remarks');
        setRightPanelTab('sop');
        setVerdictLeaderActive(false);
        setTimeout(() => {
          if (remarksSelectRef.current) {
            remarksSelectRef.current.focus();
            try {
              if (typeof remarksSelectRef.current.showPicker === 'function') {
                remarksSelectRef.current.showPicker();
              }
            } catch (err) {}
          }
        }, 40);
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setActiveZone('verdict');
        setRightPanelTab('sop');
        setVerdictLeaderActive(true);
        if (verdictTimeoutRef.current) clearTimeout(verdictTimeoutRef.current);
        verdictTimeoutRef.current = setTimeout(() => {
          setVerdictLeaderActive(false);
        }, 3500);
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        // [v + c] combination: Mark current item FAIL and open fatal criteria picker
        if (verdictLeaderActive || activeZone === 'verdict') {
          handleToggleCriterionStatus(currentCriterion.id, 'FAIL');
          setShowFatalPicker(true);
          setRightPanelTab('sop');
          setActiveZone('criteria');
          setVerdictLeaderActive(false);
          return;
        }

        // Standalone [c] outside verdict: Switch to Criteria Zone
        setActiveZone('criteria');
        setRightPanelTab('sop');
        setShowFatalPicker(true);
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setActiveZone('tools');
        setRightPanelTab('replacements');
        setVerdictLeaderActive(false);
        return;
      }

      // 3. Image Controls: [1], [2], [3], [4], [5] & [ArrowLeft] / [ArrowRight]
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const photoIndex = parseInt(e.key, 10) - 1;
        if (photoIndex >= 0 && photoIndex < rules.length) {
          e.preventDefault();
          setActiveCriterionIndex(photoIndex);
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveCriterionIndex(prev => (prev > 0 ? prev - 1 : rules.length - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveCriterionIndex(prev => (prev < rules.length - 1 ? prev + 1 : 0));
        return;
      }

      // 4. Section Traversal: [ArrowUp], [ArrowDown], [j], [k]
      if (['ArrowUp', 'k', 'K'].includes(e.key)) {
        e.preventDefault();
        if (activeZone === 'verdict') {
          setActiveCriterionIndex(prev => (prev > 0 ? prev - 1 : rules.length - 1));
        } else if (activeZone === 'criteria') {
          const failuresCount = (currentCriterion.commonFailures || []).length;
          if (failuresCount > 0) {
            setHighlightedFailureIndex(prev => (prev > 0 ? prev - 1 : failuresCount - 1));
          }
        } else if (activeZone === 'tools') {
          const toolsCount = (currentCriterion.relevantEquipment || []).length;
          if (toolsCount > 0) {
            setHighlightedToolIndex(prev => (prev > 0 ? prev - 1 : toolsCount - 1));
          }
        }
        return;
      }

      if (['ArrowDown', 'j', 'J'].includes(e.key)) {
        e.preventDefault();
        if (activeZone === 'verdict') {
          setActiveCriterionIndex(prev => (prev < rules.length - 1 ? prev + 1 : 0));
        } else if (activeZone === 'criteria') {
          const failuresCount = (currentCriterion.commonFailures || []).length;
          if (failuresCount > 0) {
            setHighlightedFailureIndex(prev => (prev < failuresCount - 1 ? prev + 1 : 0));
          }
        } else if (activeZone === 'tools') {
          const toolsCount = (currentCriterion.relevantEquipment || []).length;
          if (toolsCount > 0) {
            setHighlightedToolIndex(prev => (prev < toolsCount - 1 ? prev + 1 : 0));
          }
        }
        return;
      }

      // 5. Toggle Highlighted Item: [Space] or [Enter]
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (activeZone === 'verdict') {
          const key = currentCriterion.id || currentCriterion.imageKey;
          const currentStatus = criteriaStatus[key];
          handleToggleCriterionStatus(key, currentStatus === 'FAIL' ? 'PASS' : 'FAIL');
        } else if (activeZone === 'criteria') {
          const failures = currentCriterion.commonFailures || [];
          if (failures[highlightedFailureIndex]) {
            toggleViolation(failures[highlightedFailureIndex]);
          }
        } else if (activeZone === 'tools') {
          const tools = currentCriterion.relevantEquipment || [];
          if (tools[highlightedToolIndex]) {
            handleAddReplacement(tools[highlightedToolIndex]);
          }
        }
        return;
      }

      // 6. Submissions & Item Pass: [v + p] / [p], [f], [Escape]
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();

        // [v + p] combination: Mark current item PASS and advance to next photo
        if (verdictLeaderActive || activeZone === 'verdict') {
          handleToggleCriterionStatus(currentCriterion.id, 'PASS');
          setVerdictLeaderActive(false);
          if (activeCriterionIndex < rules.length - 1) {
            setActiveCriterionIndex(prev => prev + 1);
          }
          return;
        }

        // Standalone [p] outside verdict mode: Quick Pass entire audit (Only if all items passed)
        if (!allItemsPassed) {
          // Strictly prevent accidental quick pass until every item is marked PASS
          return;
        }

        handlePassClick();
        if (hasNext) onNextTask();
        else onClose();
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setShowBlanketFatalModal(true);
        setBlanketReasonIndex(0);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showBlanketFatalModal, 
    blanketReasonIndex, 
    activeZone, 
    activeCriterionIndex, 
    highlightedFailureIndex, 
    highlightedToolIndex, 
    criteriaStatus, 
    selectedViolations, 
    replacements, 
    rules, 
    hasNext, 
    hasPrev, 
    currentCriterion,
    verdictLeaderActive,
    allItemsPassed
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-3 md:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Modal Container */}
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-[98vw] 2xl:max-w-7xl h-[96vh] max-h-[96vh] flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Top Header Bar */}
        <div className="px-5 py-3 bg-slate-850 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
              isReAudit 
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                : 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
            }`}>
              {isReAudit ? <Scale className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-black text-white">TASK #{task.taskId}</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {task.zone}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                  Facility: {task.facilityCode}
                </span>

                {isReAudit ? (
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-amber-500 text-slate-950 flex items-center gap-1 shadow-sm animate-pulse">
                    <Scale className="w-3 h-3" />
                    SENIOR RE-AUDIT MODE
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    PENDING MANUAL AUDIT
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                FE: <span className="text-white font-semibold">{task.feName}</span> (ID: <strong className="text-slate-200">{task.feId}</strong> • Code: {task.feCode}) • Date: {task.date}
              </div>
            </div>
          </div>

          {/* Quick task pagination & close */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onPrevTask}
              disabled={!hasPrev}
              className={`p-1.5 rounded-lg border transition-colors ${
                hasPrev 
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300' 
                  : 'border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              title="Previous Task"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNextTask}
              disabled={!hasNext}
              className={`p-1.5 rounded-lg border transition-colors ${
                hasNext 
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300' 
                  : 'border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              title="Next Task"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors ml-2 cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SPEEDRUN VIM HOTKEYS STATUS BAR */}
        <div className="px-4 py-1.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[11px] overflow-x-auto text-slate-400 select-none">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sky-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> Fast Auditing Hotkeys:
            </span>
            <div className="flex items-center gap-1.5 font-mono">
              <span className={`px-1.5 py-0.5 rounded border transition-all ${
                activeZone === 'remarks' 
                  ? 'bg-purple-500/20 text-purple-300 border-purple-400 font-bold' 
                  : 'bg-slate-900 border-slate-800'
              }`}>
                [r] Remarks
              </span>
              <span className={`px-1.5 py-0.5 rounded border transition-all ${
                verdictLeaderActive 
                  ? 'bg-emerald-500 text-black border-emerald-300 font-bold animate-pulse' 
                  : activeZone === 'verdict' 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 font-bold' 
                  : 'bg-slate-900 border-slate-800'
              }`}>
                [v] Verdict {verdictLeaderActive ? '(press p or c)' : ''}
              </span>
              <span className={`px-1.5 py-0.5 rounded border ${activeZone === 'criteria' ? 'bg-red-500/20 text-red-300 border-red-400 font-bold' : 'bg-slate-900 border-slate-800'}`}>
                [c] Criteria
              </span>
              <span className={`px-1.5 py-0.5 rounded border ${activeZone === 'tools' ? 'bg-amber-500/20 text-amber-300 border-amber-400 font-bold' : 'bg-slate-900 border-slate-800'}`}>
                [o] Tool Orders
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span>[1-5] Jump Photo</span>
            <span>&bull;</span>
            <span className="text-purple-400 font-bold">[r] Remarks</span>
            <span>&bull;</span>
            <span className="text-emerald-400 font-bold">[v+p] Item Pass</span>
            <span>&bull;</span>
            <span className="text-red-400 font-bold">[v+c] Item Fail</span>
            <span>&bull;</span>
            <span className="text-red-400 font-bold">[f] Blanket Fatal</span>
          </div>
        </div>

        {/* AI Audit Human Verification Banner */}
        {isAiAudited && (
          <div className="px-5 py-3 bg-gradient-to-r from-sky-950/90 via-slate-900 to-indigo-950/90 border-b border-sky-500/40 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-white text-xs">
                    AI Audit Human Verification
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    task.auditStatus === 'FATAL' 
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40' 
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}>
                    AI Verdict: {task.auditStatus}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                    Model: {task.auditedBy || 'AI Auditor'}
                  </span>
                  {humanVerificationStatus === 'VERIFIED' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500 text-white flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Human Confirmed
                    </span>
                  ) : humanVerificationStatus === 'OVERTURNED' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" />
                      Human Overruled
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                      ⏳ Awaiting Reviewer Verification
                    </span>
                  )}
                </div>
                {task.remarks && (
                  <p className="text-[11px] text-slate-300 mt-0.5 max-w-2xl truncate">
                    <strong className="text-white">AI Remarks:</strong> {task.remarks}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onConfirmAiVerdict?.(task.id);
                  if (hasNext) onNextTask?.();
                  else onClose?.();
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                title="Confirm AI Verdict & save human sign-off"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Confirm AI</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetV = task.auditStatus === 'FATAL' ? 'PASS' : 'FATAL';
                  const reason = prompt(
                    `Enter reason to overturn AI verdict to ${targetV}:`, 
                    task.auditStatus === 'FATAL' ? 'SOP compliant upon clinical visual review' : 'Checklist non-compliance detected by reviewer'
                  );
                  if (reason) {
                    onOverturnAiVerdict?.(task.id, targetV, reason);
                    if (hasNext) onNextTask?.();
                    else onClose?.();
                  }
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                title={task.auditStatus === 'FATAL' ? "Overturn FATAL strike to PASS" : "Overturn PASS to FATAL"}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Overturn</span>
              </button>
            </div>
          </div>
        )}

        {/* AI Re-Audit Guidance Banner */}
        {isAiReAudit && (
          <div className="px-5 py-3 bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-b border-amber-500/40 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-xs">
                    {task.auditStatus === 'PASSED' ? '🚨 AI False Positive Re-Audit' : '⚖️ Clinical Re-Audit (AI Audit Disputed)'}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    Orig Auditor: {task.auditedBy || task.audited_by_name || 'Gemini AI'}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    task.auditStatus === 'FATAL' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    Orig AI: {task.auditStatus}
                  </span>
                  {task.auditStatus === 'PASSED' && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-rose-500 text-white animate-pulse">
                      Scrutinize for Missed Non-Compliance
                    </span>
                  )}
                </div>
                {task.reAuditReason && (
                  <p className="text-[11px] text-amber-200 mt-0.5">
                    <strong>QA Reviewer Flag:</strong> &ldquo;{task.reAuditReason}&rdquo;
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-300 font-mono bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-lg">
              <span>AI Criterias:</span>
              <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-black">
                🤖 AI FAIL
              </span>
              <span>and</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                🤖 AI PASS
              </span>
            </div>
          </div>
        )}

        {/* Regular Re-Audit Banner (if active without AI context) */}
        {isReAudit && !isAiReAudit && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Contested Grounds:</strong> &ldquo;{task.disputeReason || 'FE contested this fatal strike'}&rdquo; ({task.disputeCategory || 'Checklist Dispute'})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOverturnAudit?.(task.id, customRemark || 'Contestation approved upon Senior QA photo re-audit.')}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Overturn Strike (Pass)
              </button>
              <button
                type="button"
                onClick={() => onUpholdAudit?.(task.id, customRemark || 'Fatal strike upheld upon Senior QA re-audit.')}
                className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Uphold Strike
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Criteria Switcher Tabs (From Central Rules Engine) */}
        <div className="bg-slate-800/90 border-b border-slate-700/80 px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
          {rules.map((crit, idx) => {
            const fieldKey = crit.field || crit.imageKey;
            const hasMedia = Boolean(task.images?.[fieldKey]);
            const isCurrent = idx === activeCriterionIndex;
            const status = criteriaStatus[crit.id || fieldKey];

            // AI Status for this criterion (strictly gated by canViewAiDetails)
            const aiCritStatus = canViewAiDetails ? (aiCriteriaMap[crit.id] || (fieldKey ? aiCriteriaMap[fieldKey] : null)) : null;
            const isAiFail = Boolean(canViewAiDetails && aiCritStatus === 'FAIL');
            const isAiPass = Boolean(canViewAiDetails && aiCritStatus === 'PASS');

            // Color titles background directly instead of inserting icons to eliminate layout jumping / sizing jumps
            let tabStyle = '';
            if (status === 'PASS') {
              tabStyle = isCurrent
                ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400/60'
                : 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-900/60';
            } else if (status === 'FAIL') {
              tabStyle = isCurrent
                ? 'bg-rose-600 text-white shadow-md ring-1 ring-rose-400/60'
                : 'bg-rose-950/70 text-rose-300 border border-rose-500/50 hover:bg-rose-900/60';
            } else {
              tabStyle = isCurrent
                ? 'bg-blue-600 text-white shadow-md ring-1 ring-blue-400/60'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-700/60 border border-slate-800';
            }

            return (
              <button
                key={crit.id}
                onClick={() => {
                  setActiveCriterionIndex(idx);
                  handleResetView();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${tabStyle}`}
              >
                <span className="font-mono text-[11px] opacity-75">[{idx + 1}]</span>
                <span>{crit.label || crit.title}</span>
                {!hasMedia && <span className="text-[10px] text-slate-500">(No URL)</span>}

                {/* AI Selected Criteria Badges */}
                {isAiFail && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm flex items-center gap-0.5 animate-pulse">
                    <span>🤖 AI FAIL</span>
                  </span>
                )}
                {isAiPass && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold flex items-center gap-0.5">
                    <span>🤖 AI PASS</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Main Content */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-0">
          
          {/* Left Column: Image Viewer (7 cols) - Fixed Height, Static Coordinates, No Scroll */}
          <div className="lg:col-span-7 bg-slate-950 p-4 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 overflow-hidden h-full min-h-0">
            {/* Criterion brief & itemized pass/fail buttons */}
            <div className={`shrink-0 mt-1 p-3 bg-slate-900/60 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-all ${
              verdictLeaderActive
                ? 'border-emerald-400 bg-emerald-950/30 ring-2 ring-emerald-500/40 shadow-lg'
                : activeZone === 'verdict'
                ? 'border-emerald-500/50 bg-emerald-950/10'
                : 'border-slate-800'
            }`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 block text-[11px]">SOP Rule:</span>
                  {verdictLeaderActive && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/40 animate-pulse">
                      Verdict Active: press [p] or [c]
                    </span>
                  )}
                </div>
                <span className="text-slate-200 font-medium">{currentCriterion.description}</span>

                {/* AI Evaluation Insight for Current Criterion */}
                {currentCriterionAiStatus && (
                  <div className={`mt-2 p-2 rounded-lg border text-xs flex items-start gap-2 ${
                    currentCriterionAiStatus.status === 'FAIL'
                      ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                      : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  }`}>
                    <span className="text-sm shrink-0">{currentCriterionAiStatus.status === 'FAIL' ? '🤖⚠️' : '🤖✅'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-[10px] font-black uppercase tracking-wider">
                          AI Pre-Audit: {currentCriterionAiStatus.status === 'FAIL' ? 'FLAGGED NON-COMPLIANT (FAIL)' : 'VERIFIED COMPLIANT (PASS)'}
                        </strong>
                      </div>
                      <p className="text-[10px] mt-0.5 leading-snug">
                        {currentCriterionAiStatus.reason || (currentCriterionAiStatus.status === 'FAIL' ? 'The AI vision engine flagged non-compliance on this station photo.' : 'The AI vision engine verified this photo as compliant with DLC SOP.')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleToggleCriterionStatus(currentCriterion.id, 'PASS');
                    if (activeCriterionIndex < rules.length - 1) {
                      setActiveCriterionIndex(prev => prev + 1);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    criteriaStatus[currentCriterion.id] === 'PASS'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-300 hover:text-emerald-400 hover:bg-slate-700'
                  }`}
                  title="Mark this item as passed [Shortcut: v + p]"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Pass Item</span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/40 text-emerald-300 border border-emerald-500/30">v+p</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleCriterionStatus(currentCriterion.id, 'FAIL');
                    setShowFatalPicker(true);
                    setRightPanelTab('sop');
                    setActiveZone('criteria');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    criteriaStatus[currentCriterion.id] === 'FAIL'
                      ? 'bg-red-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-300 hover:text-red-400 hover:bg-slate-700'
                  }`}
                  title="Mark this item as failed [Shortcut: v + c]"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Fail Item</span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/40 text-red-300 border border-red-500/30">v+c</span>
                </button>
              </div>
            </div>
            
            {/* Image Toolbar */}
            <div className="shrink-0 flex items-center justify-between my-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 font-medium">Viewing:</span>
                <span className={`font-semibold px-2 py-0.5 rounded transition-colors ${
                  criteriaStatus[currentCriterion.id] === 'PASS'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : criteriaStatus[currentCriterion.id] === 'FAIL'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'text-white'
                }`}>
                  {currentCriterion.title}
                </span>
                {originalUrl ? (
                  <a
                    href={originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px] underline"
                    title="Open original Locus link"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Locus Link
                  </a>
                ) : (
                  <span className="text-[11px] text-amber-400">No Image In Log</span>
                )}
              </div>

              {/* Viewer Controls */}
              <div className="flex items-center space-x-1 bg-slate-900 border border-slate-700/80 rounded-lg p-1">
                <button onClick={handleZoomIn} className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer" title="Zoom In (+)">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleZoomOut} className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer" title="Zoom Out (-)">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleRotate} className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer" title="Rotate 90 deg">
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleResetView} className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white font-mono cursor-pointer" title="Reset Zoom & Rotation">
                  Reset
                </button>
              </div>
            </div>

            {/* Image Stage - Stable Fixed Coordinates, Zero Scroll */}
            <div className="relative flex-1 min-h-0 w-full bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-2 group select-none">
              {originalUrl ? (
                <div 
                  className="w-full h-full flex items-center justify-center overflow-hidden transition-transform duration-200 select-none"
                  style={{ transform: `scale(${zoomLevel}) rotate(${rotation}deg)` }}
                >
                  <img
                    src={originalUrl}
                    alt={currentCriterion.title}
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain rounded shadow-lg select-none"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mb-3">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div className="text-sm font-bold text-white">No Photo In Locus Export</div>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Field Executive did not upload an image for <strong>{currentCriterion.title}</strong> during this visit.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleCriterionStatus(currentCriterion.id, 'FAIL');
                      toggleViolation(`Missing mandatory photo for ${currentCriterion.title}`);
                      setShowFatalPicker(true);
                      setRightPanelTab('sop');
                      setActiveZone('criteria');
                    }}
                    className="mt-4 px-3.5 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Flag Missing Photo Violation</span>
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Independent Scrollable Content for SOP, Criterias, Remarks & POS Orders */}
          <div className="lg:col-span-5 flex flex-col h-full min-h-0 overflow-hidden bg-slate-850">
            
            {/* Pinned Tab Switcher Header at Top */}
            <div className="shrink-0 px-5 pt-4 pb-2 border-b border-slate-700/60 bg-slate-850">
              <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700/80">
                <button
                  onClick={() => {
                    setRightPanelTab('sop');
                    setActiveZone('criteria');
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    rightPanelTab === 'sop'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  SOP & Fatals [v/c]
                </button>

                <button
                  onClick={() => {
                    setRightPanelTab('replacements');
                    setActiveZone('tools');
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    rightPanelTab === 'replacements'
                      ? 'bg-sky-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  City Admin POS Equipment ({replacements.length})
                </button>
              </div>
            </div>

            {/* Scrollable Middle Container: SOP, Criterias, Remarks, POS Orders */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 min-h-0">

              {/* TAB 1: SOP Checklist & Fatal Violations */}
              {rightPanelTab === 'sop' && (
                <div className="space-y-4">
                  
                  {/* Central SOP Checklist */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-blue-400" />
                      Centrally Mandated SOP Standards
                    </h4>
                    <div className="space-y-1.5">
                      {(currentCriterion.standards || []).map((std, i) => (
                        <div key={i} className="flex items-start space-x-2 text-xs text-slate-300 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                          <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          <span>{std}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fatal Violations Selector (Active Zone c) */}
                  <div className={`p-3 rounded-xl border transition-all ${
                    activeZone === 'criteria' ? 'border-red-500/50 bg-red-950/10' : 'border-transparent'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        Fatal Failure Reasons ({activeZone === 'criteria' ? 'Zone [c] Active' : ''})
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {selectedViolations.length} selected &bull; [j/k] traverse &bull; [Enter/Space] toggle
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {(currentCriterion.commonFailures || []).map((reason, i) => {
                        const isSelected = selectedViolations.includes(reason);
                        const isHighlighted = activeZone === 'criteria' && highlightedFailureIndex === i;

                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              toggleViolation(reason);
                              setHighlightedFailureIndex(i);
                            }}
                            className={`w-full text-left p-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between border cursor-pointer ${
                              isSelected
                                ? 'bg-red-500/20 text-red-300 border-red-500/60 shadow-sm'
                                : isHighlighted
                                ? 'bg-slate-800 text-white border-amber-400/80 ring-1 ring-amber-400/40'
                                : 'bg-slate-900/40 text-slate-400 hover:text-slate-200 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            <span className="truncate pr-2">{reason}</span>
                            {isSelected ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded border border-slate-700 flex-shrink-0"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Auditor Remarks with Fast Multi-Select Accumulator */}
                  <div className={`space-y-1.5 p-2 rounded-xl transition-all ${
                    activeZone === 'remarks' 
                      ? 'border border-purple-500/50 bg-purple-950/20 ring-1 ring-purple-500/30' 
                      : 'border border-transparent'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        Auditor Remarks & Feedback to FE:
                        {activeZone === 'remarks' && (
                          <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold border border-purple-500/40">
                            Zone [r]
                          </span>
                        )}
                      </label>
                      <div className="flex items-center gap-2">
                        {customRemark && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomRemark('');
                              setSelectedRemarkPreset('');
                            }}
                            className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Clear all remarks"
                          >
                            Clear All
                          </button>
                        )}
                        <span className="text-[10px] text-sky-400 font-medium">+ Multi-Select [r]</span>
                      </div>
                    </div>

                    {/* Preselected Remarks Dropdown (Appends on select without overwriting) */}
                    <select
                      ref={remarksSelectRef}
                      value={selectedRemarkPreset}
                      onFocus={() => setActiveZone('remarks')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        if (val === 'custom') {
                          setSelectedRemarkPreset('custom');
                          return;
                        }
                        // Append new remark line without overwriting previous items' remarks
                        setCustomRemark(prev => {
                          const trimmed = prev ? prev.trim() : '';
                          if (!trimmed) return val;
                          const lines = trimmed.split('\n').map(l => l.trim());
                          if (lines.includes(val)) return trimmed; // Avoid duplicate lines
                          return `${trimmed}\n${val}`;
                        });
                        // Reset dropdown back to placeholder so next item remark can be picked immediately
                        setSelectedRemarkPreset('');
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">+ Add Pre-set Remark to List...</option>
                      <option value={`Wrong / Blank Image for ${currentCriterion.label || currentCriterion.title || 'Current Item'}`}>
                        Wrong / Blank Image for {currentCriterion.label || currentCriterion.title || 'Current Item'}
                      </option>
                      <option value="Repeated / recycled image uploaded">
                        Repeated image
                      </option>
                      <option value="All images missing / blank / black">
                        All images missing / blank / black
                      </option>
                      <option value="Missing required equipment from toolkit">
                        Missing required equipment from toolkit
                      </option>
                      <option value="Blurry / unreadable photo uploaded">
                        Blurry / unreadable photo uploaded
                      </option>
                      <option value="Incomplete equipment kit displayed">
                        Incomplete equipment kit displayed
                      </option>
                      <option value="custom">
                        Custom remark (type below)...
                      </option>
                    </select>

                    {/* Removable chips for accumulated multi-item remarks */}
                    {customRemark && customRemark.trim().split('\n').filter(Boolean).length > 1 && (
                      <div className="flex flex-wrap gap-1 py-0.5">
                        {customRemark.trim().split('\n').filter(Boolean).map((line, idx) => (
                          <span 
                            key={idx} 
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-700/80 text-[10px] text-slate-300 shadow-sm"
                          >
                            <span className="truncate max-w-[240px] font-medium">{line}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const remaining = customRemark
                                  .trim()
                                  .split('\n')
                                  .filter(Boolean)
                                  .filter((_, i) => i !== idx)
                                  .join('\n');
                                setCustomRemark(remaining);
                              }}
                              className="text-slate-500 hover:text-rose-400 font-bold ml-0.5 cursor-pointer"
                              title="Remove this remark"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Custom Remark Textarea: Display is BLOCK only when 'custom' is selected, otherwise NONE (hidden) */}
                    <div className={selectedRemarkPreset === 'custom' ? 'block space-y-1.5 pt-1' : 'hidden'}>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-medium text-slate-300">Custom Auditor Remark:</span>
                        <button
                          type="button"
                          onClick={() => setSelectedRemarkPreset('')}
                          className="text-[10px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
                        >
                          Hide Box
                        </button>
                      </div>
                      <textarea
                        value={customRemark}
                        onChange={(e) => setCustomRemark(e.target.value)}
                        rows={3}
                        placeholder="Type custom auditor remark here..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans leading-relaxed"
                      />
                    </div>

                    {selectedRemarkPreset !== 'custom' && (
                      <button
                        type="button"
                        onClick={() => setSelectedRemarkPreset('custom')}
                        className="text-[11px] text-sky-400 hover:text-sky-300 underline flex items-center gap-1 cursor-pointer pt-0.5"
                      >
                        + Type custom remark...
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: Equipment Replacement & City POS Order Zone (Active Zone o) */}
              {rightPanelTab === 'replacements' && (
                <div className={`space-y-4 p-2 rounded-xl border transition-all ${
                  activeZone === 'tools' ? 'border-sky-500/50 bg-sky-950/10' : 'border-transparent'
                }`}>
                  <div className="bg-sky-950/30 border border-sky-500/30 rounded-xl p-3 text-xs">
                    <span className="font-bold text-sky-300 block mb-0.5 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-sky-400" />
                      City Admin POS Ordering Requisition (Zone [o])
                    </span>
                    <p className="text-[11px] text-sky-200/80">
                      Use <strong>[j/k]</strong> and <strong>[Enter/Space]</strong> to quick-flag tools for <strong>{task.facilityCode}</strong>.
                    </p>
                  </div>

                  {/* Quick Pick: Items visible in current photo */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Quick Pick ({currentCriterion.title.split(':')[0]} Items):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(currentCriterion.relevantEquipment || []).map((item, idx) => {
                        const isHighlighted = activeZone === 'tools' && highlightedToolIndex === idx;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              handleAddReplacement(item);
                              setHighlightedToolIndex(idx);
                            }}
                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                              isHighlighted
                                ? 'bg-sky-600 text-white border-sky-300 ring-1 ring-sky-300 shadow-sm'
                                : 'bg-slate-800 hover:bg-sky-600/30 text-slate-300 hover:text-sky-200 border-slate-700 hover:border-sky-500/50'
                            }`}
                          >
                            <Plus className="w-3 h-3 text-sky-400" />
                            <span>{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Manual Item Selector Form */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">
                      Add Custom / Other Item:
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Select Item:</label>
                        <select
                          value={selectedItemToAdd}
                          onChange={(e) => setSelectedItemToAdd(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          <option value="">-- Choose Equipment --</option>
                          {EQUIPMENT_CATALOGUE.map(cat => (
                            <optgroup key={cat.category} label={cat.category}>
                              {cat.items.map(i => (
                                <option key={i.id} value={i.id}>{i.name} ({i.type})</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Fault Condition:</label>
                        <select
                          value={selectedCondition}
                          onChange={(e) => setSelectedCondition(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          {FAULT_CONDITIONS.map(cond => (
                            <option key={cond} value={cond}>{cond}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Order Urgency:</label>
                        <select
                          value={selectedUrgency}
                          onChange={(e) => setSelectedUrgency(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          {REPLACEMENT_URGENCY.map(u => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Auditor Notes / Defect Reason:</label>
                        <input
                          type="text"
                          value={replacementNotes}
                          onChange={(e) => setReplacementNotes(e.target.value)}
                          placeholder="e.g. Broken lens, battery dead"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-slate-500"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddReplacement(null)}
                      className="w-full py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      Add to City Admin POS Requisition
                    </button>
                  </div>

                  {/* List of Flagged Items */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Flagged for City Admin POS Ordering ({replacements.length} items):
                    </span>
                    {replacements.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500 bg-slate-900/40 rounded-lg border border-slate-800">
                        No equipment issues flagged for this visit yet.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {replacements.map(rep => (
                          <div
                            key={rep.id}
                            className="p-2 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-between text-xs"
                          >
                            <div className="overflow-hidden pr-2">
                              <span className="font-bold text-white block truncate">{rep.itemName}</span>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                                <span className="text-amber-400 font-medium">{rep.condition}</span>
                                <span>•</span>
                                <span className={rep.urgency === 'IMMEDIATE' ? 'text-red-400 font-bold' : 'text-sky-300'}>
                                  {rep.urgency}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveReplacement(rep.id)}
                              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>

            {/* Pinned Bottom Decision Actions */}
            <div className="shrink-0 p-4 border-t border-slate-700/80 bg-slate-850 flex flex-col gap-2.5">
              {/* Quick AI Verification Buttons if task is AI-audited */}
              {isAiAudited && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onConfirmAiVerdict?.(task.id);
                      if (hasNext) onNextTask?.();
                      else onClose?.();
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <CheckCheck className="w-4 h-4 text-white" />
                    <span>CONFIRM AI VERDICT ({task.auditStatus})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const targetV = task.auditStatus === 'FATAL' ? 'PASS' : 'FATAL';
                      const reason = prompt(
                        `Enter reason to overturn AI verdict to ${targetV}:`, 
                        task.auditStatus === 'FATAL' ? 'SOP compliant upon clinical visual review' : 'Checklist non-compliance detected by reviewer'
                      );
                      if (reason) {
                        onOverturnAiVerdict?.(task.id, targetV, reason);
                        if (hasNext) onNextTask?.();
                        else onClose?.();
                      }
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <RotateCcw className="w-4 h-4 text-white" />
                    <span>OVERTURN TO {task.auditStatus === 'FATAL' ? 'PASS' : 'FATAL'}</span>
                  </button>
                </div>
              )}

              {/* Standard / Manual Fallback Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePassClick}
                  disabled={!allItemsPassed}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    allItemsPassed
                      ? 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60 shadow-none'
                  }`}
                  title={
                    allItemsPassed
                      ? 'All checklist items verified and passed! Click or press [p] to submit Pass Audit.'
                      : `Disabled: Review & pass all ${rules.length} items to enable Pass Audit (${passedCheckpointsCount}/${rules.length} passed)`
                  }
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${allItemsPassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span>Manual Pass (P)</span>
                  {allItemsPassed ? (
                    <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-white/20 text-white font-mono">
                      All Passed
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-400">
                      {passedCheckpointsCount}/{rules.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleConfirmFatal}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    canSubmitFatal
                      ? 'bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 hover:border-slate-600'
                  }`}
                  title={
                    failedCheckpoints.length === 0
                      ? 'Requires at least 1 checkpoint marked as FAIL'
                      : !hasFatalCriteria
                      ? 'Requires at least 1 fatal failure criteria reason selected'
                      : 'Click to record FATAL penalty for failed items'
                  }
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${canSubmitFatal ? 'text-white' : 'text-amber-400'}`} />
                  <span>Manual Fatal</span>
                  {failedCheckpoints.length === 0 ? (
                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-700">
                      Needs Fail
                    </span>
                  ) : !hasFatalCriteria ? (
                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Pick Reason
                    </span>
                  ) : (
                    <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-white/20 text-white font-mono">
                      {failedCheckpoints.length} Failed
                    </span>
                  )}
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* ==================================================================== */}
        {/* BLANKET FATAL RAPID-FIRE MODAL OVERLAY (Triggered on [f]) */}
        {/* ==================================================================== */}
        {showBlanketFatalModal && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-slate-900 border-2 border-red-500/80 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-base">Blanket Fatal Non-Compliance Strike</h3>
                    <p className="text-[11px] text-slate-400">Task #{task.taskId} &bull; FE: {task.feName}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowBlanketFatalModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Select one of the <strong>top 3 objective auditor reasons</strong>. This immediately records the fatal strike with <code className="text-red-300">email_notified = false</code> and auto-advances to the next pending task.
              </p>

              {/* Top 3 Objective Reasons */}
              <div className="space-y-2 font-sans">
                {BLANKET_FATAL_REASONS.map((reason, idx) => {
                  const isSelected = blanketReasonIndex === idx;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => triggerBlanketFatal(idx)}
                      onMouseEnter={() => setBlanketReasonIndex(idx)}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-red-600 text-white border-red-400 font-bold shadow-lg shadow-red-900/40 ring-2 ring-red-400/50'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-black/40 text-xs font-mono font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs">{reason}</span>
                      </div>
                      
                      <CornerDownLeft className="w-4 h-4 opacity-70" />
                    </button>
                  );
                })}
              </div>

              {/* Keybindings guide inside modal */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Press <strong>[1]</strong>, <strong>[2]</strong>, or <strong>[3]</strong> to submit</span>
                <span><strong>[Esc]</strong> Cancel</span>
              </div>

            </div>
          </div>
        )}

      </div>

    </div>
  );
}
