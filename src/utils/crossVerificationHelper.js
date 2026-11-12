/**
 * Cross-Verification & Auditor vs AI Compliance Helper
 * 
 * Provides station-level and overall verdict comparison between:
 * 1. Human City Auditor manual audits
 * 2. Automated AI Engine audits (Gemini 3.8 / 1.5 Flash)
 */

import { 
  isAiAuditedTask, 
  getHumanVerificationStatus, 
  isAwaitingHumanVerification 
} from '../lib/supabase.js';

export const AUDIT_STATIONS = [
  { id: 'selfie', label: '1. Selfie & ID Card', shortLabel: 'Selfie' },
  { id: 'torches', label: '2. Blue & Yellow Torches', shortLabel: 'Torches' },
  { id: 'visionChart', label: '3. Vision Chart & Standee', shortLabel: 'Chart' },
  { id: 'toolkit', label: '4. Refraction Toolkit', shortLabel: 'Kit' },
  { id: 'frameDisplay', label: '5. Frame Display Tray', shortLabel: 'Frames' }
];

/**
 * Robust Keyword Parser: Maps remarks, failed reasons, or dispute notes to specific audit station IDs.
 */
export function parseFailedStationsFromText(text = '') {
  if (!text || typeof text !== 'string') return [];
  const s = text.toLowerCase();
  const matched = new Set();

  // 1. Selfie & ID Card
  if (
    s.includes('selfie') || 
    s.includes('t-shirt') || 
    s.includes('tshirt') || 
    s.includes('polo') || 
    s.includes('id card') || 
    s.includes('id badge') || 
    s.includes('id_card') || 
    s.includes('lanyard') || 
    s.includes('uniform')
  ) {
    matched.add('selfie');
  }

  // 2. Blue & Yellow Torches
  if (
    s.includes('torch') || 
    s.includes('penlight') || 
    s.includes('blue') || 
    s.includes('yellow') || 
    s.includes('batteries') || 
    s.includes('battery') || 
    s.includes('light beam') ||
    s.includes('switched off') ||
    s.includes('dead')
  ) {
    matched.add('torches');
  }

  // 3. Vision Chart & Standee
  if (
    s.includes('vision chart') || 
    s.includes('standee') || 
    s.includes('snellen') || 
    s.includes('logmar') || 
    s.includes('telescop') || 
    s.includes('chart setup') ||
    s.includes('vision_chart') ||
    s.includes('eye level') ||
    (s.includes('chart') && !s.includes('toolkit'))
  ) {
    matched.add('visionChart');
  }

  // 4. Complete Refraction Toolkit
  if (
    s.includes('toolkit') || 
    s.includes('refraction') || 
    s.includes('trial frame') || 
    s.includes('trial_frame') || 
    s.includes('jcc') || 
    s.includes('cross cylinder') || 
    s.includes('mirror') || 
    s.includes('hand mirror') || 
    s.includes('sanitizer') || 
    s.includes('pd tape') || 
    s.includes('near vision') || 
    s.includes('reading test') ||
    s.includes('handheld')
  ) {
    matched.add('toolkit');
  }

  // 5. Frame Display Tray
  if (
    s.includes('frame display') || 
    s.includes('frame_display') || 
    s.includes('tray') || 
    s.includes('showcase') || 
    s.includes('unpacked') || 
    s.includes('carry bag') || 
    s.includes('sample frame') || 
    s.includes('optical frame') ||
    s.includes('living room') ||
    (s.includes('display') && !s.includes('vision')) ||
    (s.includes('frame') && !s.includes('trial frame'))
  ) {
    matched.add('frameDisplay');
  }

  return Array.from(matched);
}

/**
 * Normalize station pass/fail status
 */
export function normalizeStationStatus(val) {
  if (!val) return null;
  const s = String(val).trim().toUpperCase();
  if (s === 'PASS' || s === 'PASSED' || s === 'TRUE' || s === 'OK') return 'PASS';
  if (s === 'FAIL' || s === 'FAILED' || s === 'FATAL' || s === 'FALSE') return 'FAIL';
  return null;
}

/**
 * Detects if an identifier or name belongs to an automated AI model rather than a human City Admin.
 * AI models must NEVER be presented as City Admins or Human Auditors.
 */
export function isAiAuditorName(name) {
  if (!name || typeof name !== 'string') return false;
  const s = name.trim().toLowerCase();
  return (
    s.includes('gemini') ||
    s.includes('gpt') ||
    s.includes('claude') ||
    s.includes('llama') ||
    s.includes('groq') ||
    s.includes('openrouter') ||
    s.includes('deepseek') ||
    s.includes('ai engine') ||
    s.includes('ai model') ||
    s.includes('ai audit') ||
    s === 'ai' ||
    s.startsWith('ai ') ||
    s.endsWith(' ai') ||
    s.includes('artificial intelligence') ||
    s.includes('auto-audit')
  );
}

/**
 * Compute cross-verification metrics and station-level compliance for an individual task.
 * STRICT POLICY: AI data must NEVER be treated as an Auditor Verdict.
 * Under "Auditor Verdict", ONLY genuine human City Admin verdicts may appear.
 */
export function getTaskCrossVerification(task) {
  if (!task) {
    return {
      isHumanAudited: false,
      humanStatus: 'PENDING',
      humanAuditorName: null,
      humanAuditedAt: null,
      isAiAudited: false,
      aiStatus: 'PENDING',
      aiAuditorName: null,
      aiConfidenceScore: null,
      aiAuditedAt: null,
      isDualAudited: false,
      agreementStatus: 'UNAUDITED',
      complianceScore: null,
      matchingStations: 0,
      evaluatedStations: 0,
      stationDetails: [],
      stationDiscrepancies: []
    };
  }

  const rawAuditStatus = String(task.auditStatus || task.audit_status || 'PENDING').trim().toUpperCase();
  const auditedBy = String(task.auditedBy || task.audited_by_name || '').trim();
  const remarks = String(task.remarks || task.auditor_remarks || '');

  // Look up local AI verdict ledger if available in browser
  let localAiData = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const rawLedger = window.localStorage.getItem('locus_ai_verdicts_ledger');
      if (rawLedger) {
        const parsed = JSON.parse(rawLedger);
        localAiData = parsed[String(task.id)] || parsed[String(task.taskId)] || null;
      }
    } catch (_) {}
  }

  // Detect explicit human verification or overturn action
  const isExplicitVerification = Boolean(
    task.human_verified || 
    task.humanVerified || 
    task.human_overturned || 
    task.humanOverturned || 
    task.humanStatus === 'VERIFIED' || 
    task.humanStatus === 'OVERTURNED' ||
    remarks.includes('[Human Verified') || 
    remarks.includes('[Human Overturned')
  );

  // Detect AI presence on this task
  const hasDedicatedAiField = Boolean(task.aiAuditStatus || task.ai_audit_status);
  const isAuditedByAi = isAiAuditorName(auditedBy);
  const isLegacyAiAudit = isAiAuditedTask(task) || isAuditedByAi;

  // 1. Human / City Admin Verdict (STRICTLY real human City Admins only - NEVER AI)
  let isHumanAudited = false;
  let humanStatus = 'PENDING';
  let humanAuditorName = null;
  let humanAuditedAt = null;

  // A human audit is only valid if:
  // - Explicit human verification / overturn was conducted
  // - OR auditedBy is a real human (not an AI model) AND status is PASSED or FATAL
  const hasRealHumanAuditorName = Boolean(auditedBy && !isAiAuditorName(auditedBy));

  if (isExplicitVerification) {
    isHumanAudited = true;
    const isOverturn = Boolean(
      task.human_overturned || 
      task.humanOverturned || 
      task.humanStatus === 'OVERTURNED' || 
      remarks.includes('[Human Overturned')
    );

    if (remarks.includes('[Human Overturned FATAL to PASS')) {
      humanStatus = 'PASSED';
    } else if (remarks.includes('[Human Overturned PASS to FATAL')) {
      humanStatus = 'FATAL';
    } else if (isOverturn) {
      humanStatus = (rawAuditStatus === 'FATAL' ? 'PASSED' : 'FATAL');
    } else {
      humanStatus = (rawAuditStatus === 'FATAL' ? 'FATAL' : 'PASSED');
    }

    const reviewerMatch = remarks.match(/\[Human (?:Verified|Overturned)[^\]]*by ([^:\]]+)/);
    const reviewerName = task.verified_by || task.verifiedBy || (reviewerMatch ? reviewerMatch[1].trim() : null) || task.assignedAuditorName;
    humanAuditorName = (reviewerName && !isAiAuditorName(reviewerName)) ? reviewerName : 'City Admin';
    humanAuditedAt = task.verified_at || task.verifiedAt || task.auditedAt || task.audited_at || null;
  } else if (hasRealHumanAuditorName && (rawAuditStatus === 'PASSED' || rawAuditStatus === 'FATAL')) {
    isHumanAudited = true;
    humanStatus = rawAuditStatus;
    humanAuditorName = auditedBy;
    humanAuditedAt = task.auditedAt || task.audited_at || null;
  } else {
    // No human has audited this task yet. It is PENDING City Admin audit.
    // Under NO circumstances does an AI model's verdict count as an Auditor Verdict!
    isHumanAudited = false;
    humanStatus = 'PENDING';
    humanAuditorName = null;
    humanAuditedAt = null;
  }

  // 2. AI Verdict (Belongs strictly in AI Verdict column)
  let isAiAudited = false;
  let aiStatus = 'PENDING';
  let aiAuditorName = null;
  let aiConfidenceScore = null;
  let aiAuditedAt = null;

  if (hasDedicatedAiField) {
    const rawAiStatus = String(task.aiAuditStatus || task.ai_audit_status).trim().toUpperCase();
    if (rawAiStatus === 'PASSED' || rawAiStatus === 'FATAL') {
      isAiAudited = true;
      aiStatus = rawAiStatus;
      aiAuditorName = task.aiAuditorName || task.ai_auditor_name || (isAuditedByAi ? auditedBy : 'gemini-3.8-flash');
    }
  } else if (localAiData?.aiAuditStatus) {
    const rawAiStatus = String(localAiData.aiAuditStatus).trim().toUpperCase();
    if (rawAiStatus === 'PASSED' || rawAiStatus === 'FATAL') {
      isAiAudited = true;
      aiStatus = rawAiStatus;
      aiAuditorName = localAiData.aiAuditorName || 'gemini-3.8-flash';
    }
  } else if (isExplicitVerification) {
    // A task that was explicitly verified or overturned was by definition audited by AI!
    isAiAudited = true;
    if (remarks.includes('[Human Overturned FATAL to PASS')) {
      aiStatus = 'FATAL'; // The AI gave FATAL, which human overturned to PASS
    } else if (remarks.includes('[Human Overturned PASS to FATAL')) {
      aiStatus = 'PASSED'; // The AI gave PASS, which human overturned to FATAL
    } else if (task.human_overturned || task.humanOverturned || task.humanStatus === 'OVERTURNED') {
      aiStatus = (humanStatus === 'PASSED' ? 'FATAL' : 'PASSED');
    } else {
      // Confirmed verification: AI verdict matches rawAuditStatus
      aiStatus = (rawAuditStatus === 'FATAL' ? 'FATAL' : 'PASSED');
    }
    const candidateAi = task.aiAuditStatus ? (task.aiAuditorName || task.ai_auditor_name) : null;
    if (candidateAi && isAiAuditorName(candidateAi)) {
      aiAuditorName = candidateAi;
    } else if (task.auditorModel && isAiAuditorName(task.auditorModel)) {
      aiAuditorName = task.auditorModel;
    } else if (isAuditedByAi) {
      aiAuditorName = auditedBy;
    } else {
      aiAuditorName = 'gemini-3.8-flash';
    }
  } else if (isLegacyAiAudit) {
    isAiAudited = true;
    if (rawAuditStatus === 'PASSED' || rawAuditStatus === 'FATAL') {
      aiStatus = rawAuditStatus;
    } else if (remarks.toLowerCase().includes('ai passed')) {
      aiStatus = 'PASSED';
    } else {
      aiStatus = 'FATAL';
    }
    aiAuditorName = isAuditedByAi ? auditedBy : (task.aiAuditorName || 'gemini-3.8-flash');
  }

  let conf = (task.aiConfidenceScore !== undefined && task.aiConfidenceScore !== null) 
    ? Number(task.aiConfidenceScore) 
    : (task.ai_confidence_score !== undefined && task.ai_confidence_score !== null 
        ? Number(task.ai_confidence_score) 
        : (localAiData?.aiConfidenceScore ? Number(localAiData.aiConfidenceScore) : null));

  if (!conf || conf === 0) {
    const confMatch = remarks.match(/(?:Conf|Confidence|Score)[:\s]+(\d+)%/i);
    if (confMatch) {
      conf = Number(confMatch[1]);
    } else if (isAiAudited) {
      conf = 95;
    }
  }
  aiConfidenceScore = conf;

  aiAuditedAt = task.aiAuditedAt || task.ai_audited_at || localAiData?.aiAuditedAt || (isLegacyAiAudit ? task.auditedAt : null);

  // 3. Dual-Audit Detection (BOTH City Admin AND AI have audited or verified)
  const isDualAudited = Boolean(isHumanAudited && isAiAudited);

  // 4. Station-by-Station Compliance Evaluation
  let humanCriteria = { ...(task.criteriaStatus || task.criteria_status || {}) };
  let aiCriteria = { ...(task.aiCriteriaStatus || task.ai_criteria_status || localAiData?.aiCriteriaStatus || {}) };

  // Reconcile Human / City Admin Station Criteria
  if (humanStatus === 'PASSED') {
    // If human audit status is PASSED, all 5 stations must be PASS
    AUDIT_STATIONS.forEach(st => {
      humanCriteria[st.id] = 'PASS';
    });
  } else if (humanStatus === 'FATAL') {
    // If human verdict is FATAL, human criteria CANNOT be all PASS!
    // If all stations are currently PASS or empty, derive failed stations from remarks / failed reasons:
    const hasAnyHumanFail = AUDIT_STATIONS.some(st => normalizeStationStatus(humanCriteria[st.id]) === 'FAIL');
    if (!hasAnyHumanFail) {
      const combinedReasonText = [
        ...(Array.isArray(task.failedReasons) ? task.failedReasons : []),
        ...(Array.isArray(task.failed_reasons) ? task.failed_reasons : []),
        remarks,
        task.disputeReason || '',
        task.disputeCategory || ''
      ].join(' ');

      const failedStationIds = parseFailedStationsFromText(combinedReasonText);
      if (failedStationIds.length > 0) {
        AUDIT_STATIONS.forEach(st => {
          humanCriteria[st.id] = failedStationIds.includes(st.id) ? 'FAIL' : 'PASS';
        });
      } else {
        // If blanket fatal or no station keyword detected, all stations failed
        AUDIT_STATIONS.forEach(st => {
          humanCriteria[st.id] = 'FAIL';
        });
      }
    } else {
      // Ensure missing stations are set to PASS
      AUDIT_STATIONS.forEach(st => {
        if (!humanCriteria[st.id]) humanCriteria[st.id] = 'PASS';
      });
    }
  }

  // Reconcile AI Station Criteria
  if (isAiAudited) {
    if (aiStatus === 'PASSED') {
      // For AI PASSED audits, all stations must be PASS
      AUDIT_STATIONS.forEach(st => {
        aiCriteria[st.id] = 'PASS';
      });
    } else if (aiStatus === 'FATAL') {
      // For AI FATAL audits, at least one station must be FAIL
      const hasAnyAiFail = AUDIT_STATIONS.some(st => normalizeStationStatus(aiCriteria[st.id]) === 'FAIL');
      if (!hasAnyAiFail) {
        const aiReasonText = [
          task.aiRemarks || '',
          ...(Array.isArray(task.aiFailedReasons) ? task.aiFailedReasons : []),
          ...(Array.isArray(task.ai_failed_reasons) ? task.ai_failed_reasons : []),
          remarks.includes('Original AI:') ? remarks.split('Original AI:')[1] : remarks
        ].join(' ');

        const aiFailedIds = parseFailedStationsFromText(aiReasonText);
        if (aiFailedIds.length > 0) {
          AUDIT_STATIONS.forEach(st => {
            aiCriteria[st.id] = aiFailedIds.includes(st.id) ? 'FAIL' : 'PASS';
          });
        } else if (remarks.includes('[Human Overturned FATAL to PASS')) {
          const overturnMatch = remarks.match(/\[Human Overturned FATAL to PASS[^:]*:\s*([^\]]+)\]/);
          const overturnReason = overturnMatch ? overturnMatch[1] : remarks;
          const overturnedIds = parseFailedStationsFromText(overturnReason);
          AUDIT_STATIONS.forEach(st => {
            aiCriteria[st.id] = overturnedIds.includes(st.id) ? 'FAIL' : 'PASS';
          });
        } else {
          AUDIT_STATIONS.forEach(st => {
            aiCriteria[st.id] = 'FAIL';
          });
        }
      } else {
        AUDIT_STATIONS.forEach(st => {
          if (!aiCriteria[st.id]) aiCriteria[st.id] = 'PASS';
        });
      }
    }
  } else {
    aiCriteria = {};
  }

  let evaluatedStations = 0;
  let matchingStations = 0;
  const stationDetails = [];
  const stationDiscrepancies = [];

  AUDIT_STATIONS.forEach(st => {
    const hVal = normalizeStationStatus(humanCriteria[st.id]);
    const aVal = normalizeStationStatus(aiCriteria[st.id]);
    const isStationEvaluated = Boolean(hVal && aVal);
    const doesStationMatch = isStationEvaluated ? hVal === aVal : null;

    if (isStationEvaluated) {
      evaluatedStations++;
      if (doesStationMatch) {
        matchingStations++;
      } else {
        const discType = (hVal === 'FAIL' && aVal === 'PASS') ? 'AI_FP' : 'AI_FN';
        stationDiscrepancies.push({
          stationId: st.id,
          label: st.label,
          shortLabel: st.shortLabel,
          human: hVal,
          ai: aVal,
          type: discType
        });
      }
    }

    stationDetails.push({
      id: st.id,
      label: st.label,
      shortLabel: st.shortLabel,
      humanStatus: hVal,
      aiStatus: aVal,
      isEvaluated: isStationEvaluated,
      matches: doesStationMatch
    });
  });

  // Compliance score percentage (e.g. 5/5 = 100%, 4/5 = 80%)
  let complianceScore = null;
  if (evaluatedStations > 0) {
    complianceScore = Math.round((matchingStations / evaluatedStations) * 100);
  } else if (isDualAudited) {
    complianceScore = humanStatus === aiStatus ? 100 : 0;
  }

  // Overall Verdict Agreement Status
  let agreementStatus = 'UNAUDITED';
  if (isDualAudited) {
    if (humanStatus === aiStatus) {
      agreementStatus = 'AGREEMENT';
    } else if (humanStatus === 'FATAL' && aiStatus === 'PASSED') {
      agreementStatus = 'AI_FP'; // AI False Positive (AI passed a task that human found fatal)
    } else if (humanStatus === 'PASSED' && aiStatus === 'FATAL') {
      agreementStatus = 'AI_FN'; // AI False Negative (AI marked fatal on a task that human passed)
    } else {
      agreementStatus = 'DISCREPANCY';
    }
  } else if (isHumanAudited || isAiAudited) {
    agreementStatus = 'PENDING_DUAL';
  }

  return {
    isHumanAudited,
    humanStatus,
    humanAuditorName,
    humanAuditedAt,
    isAiAudited,
    aiStatus,
    aiAuditorName,
    aiConfidenceScore,
    aiAuditedAt,
    isDualAudited,
    agreementStatus,
    complianceScore,
    matchingStations,
    evaluatedStations,
    stationDetails,
    stationDiscrepancies
  };
}

/**
 * Filter matchers
 */
export function matchesAiFilter(task, filter) {
  if (!filter || filter === 'ALL') return true;
  const cross = getTaskCrossVerification(task);

  switch (filter) {
    case 'AI_AUDITED':
      return cross.isAiAudited;
    case 'AI_PENDING':
      return !cross.isAiAudited;
    case 'AI_PASSED':
      return cross.aiStatus === 'PASSED';
    case 'AI_FATAL':
      return cross.aiStatus === 'FATAL';
    default:
      return true;
  }
}

export function matchesHumanFilter(task, filter) {
  if (!filter || filter === 'ALL') return true;
  const cross = getTaskCrossVerification(task);

  switch (filter) {
    case 'HUMAN_AUDITED':
      return cross.isHumanAudited;
    case 'HUMAN_PENDING':
      return !cross.isHumanAudited;
    case 'HUMAN_PASSED':
      return cross.humanStatus === 'PASSED';
    case 'HUMAN_FATAL':
      return cross.humanStatus === 'FATAL';
    default:
      return true;
  }
}

export function matchesCrossFilter(task, filter) {
  if (!filter || filter === 'ALL') return true;
  const cross = getTaskCrossVerification(task);

  switch (filter) {
    case 'DUAL_AUDITED':
      return cross.isDualAudited;
    case 'AGREEMENT':
      return cross.isDualAudited && cross.agreementStatus === 'AGREEMENT';
    case 'DISCREPANCY':
      return cross.isDualAudited && cross.agreementStatus !== 'AGREEMENT';
    case 'AI_FP':
      return cross.agreementStatus === 'AI_FP';
    case 'AI_FN':
      return cross.agreementStatus === 'AI_FN';
    case 'HIGH_COMPLIANCE':
      return cross.complianceScore !== null && cross.complianceScore >= 80;
    case 'LOW_COMPLIANCE':
      return cross.complianceScore !== null && cross.complianceScore < 80;
    case 'PENDING_DUAL':
      return !cross.isDualAudited;
    default:
      return true;
  }
}

/**
 * Calculate comprehensive summary metrics for a list of tasks
 */
export function calculateCrossVerificationStats(tasks = []) {
  let humanAuditedCount = 0;
  let humanPassedCount = 0;
  let humanFatalCount = 0;
  let humanPendingCount = 0;

  let aiAuditedCount = 0;
  let aiPassedCount = 0;
  let aiFatalCount = 0;
  let aiPendingCount = 0;

  let dualAuditedCount = 0;
  let dualAgreedCount = 0;
  let dualDiscrepancyCount = 0;
  let aiFpCount = 0;
  let aiFnCount = 0;

  let totalComplianceSum = 0;
  let complianceEvaluatedCount = 0;

  tasks.forEach(t => {
    const cross = getTaskCrossVerification(t);

    if (cross.isHumanAudited) {
      humanAuditedCount++;
      if (cross.humanStatus === 'PASSED') humanPassedCount++;
      if (cross.humanStatus === 'FATAL') humanFatalCount++;
    } else {
      humanPendingCount++;
    }

    if (cross.isAiAudited) {
      aiAuditedCount++;
      if (cross.aiStatus === 'PASSED') aiPassedCount++;
      if (cross.aiStatus === 'FATAL') aiFatalCount++;
    } else {
      aiPendingCount++;
    }

    if (cross.isDualAudited) {
      dualAuditedCount++;
      if (cross.agreementStatus === 'AGREEMENT') {
        dualAgreedCount++;
      } else {
        dualDiscrepancyCount++;
        if (cross.agreementStatus === 'AI_FP') aiFpCount++;
        if (cross.agreementStatus === 'AI_FN') aiFnCount++;
      }

      if (cross.complianceScore !== null) {
        totalComplianceSum += cross.complianceScore;
        complianceEvaluatedCount++;
      }
    }
  });

  const agreementRate = dualAuditedCount > 0 
    ? Math.round((dualAgreedCount / dualAuditedCount) * 100) 
    : 0;

  const averageCompliance = complianceEvaluatedCount > 0 
    ? Math.round(totalComplianceSum / complianceEvaluatedCount) 
    : 0;

  return {
    total: tasks.length,
    humanAuditedCount,
    humanPassedCount,
    humanFatalCount,
    humanPendingCount,
    aiAuditedCount,
    aiPassedCount,
    aiFatalCount,
    aiPendingCount,
    dualAuditedCount,
    dualAgreedCount,
    dualDiscrepancyCount,
    aiFpCount,
    aiFnCount,
    agreementRate,
    averageCompliance
  };
}

/**
 * Checks if a task is currently awaiting human audit / verification review.
 * A task needs human review if:
 * 1. It is an AI-audited task where human verification is still PENDING.
 * 2. It has an AI verdict, but human has not yet submitted their own audit.
 * 3. It is an un-audited manual task (status is PENDING or blank).
 */
export function isTaskPendingHumanReview(task) {
  if (!task) return false;
  const cross = getTaskCrossVerification(task);
  return !cross.isHumanAudited || cross.humanStatus === 'PENDING';
}

