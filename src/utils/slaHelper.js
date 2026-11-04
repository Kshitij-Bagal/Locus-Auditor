/**
 * SLA & D+1 Audit Escalation Engine for Locus Auditor
 * 
 * Business Rule:
 * Day D dispatches with photo evidence must be audited within the same day.
 * Any completed audit from Day D that remains PENDING into D+1 (>24 hours or calendar day passed)
 * is an SLA breach and is automatically escalated to:
 * - Business Head (BH)
 * - General Manager (GM)
 * 
 * Unaudited tasks from previous days MUST be highlighted in both:
 * 1. D+1 Escalations Console (for leadership visibility and intervention)
 * 2. Auto-Allocation Roster (for immediate carryover reallocation to on-duty staff)
 */

/**
 * Robustly parses various date formats into a Date object:
 * - 'YYYY-MM-DD'
 * - 'DD/MM/YYYY'
 * - 'DD-MM-YYYY'
 * - ISO string
 */
export function parseTaskDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  
  // ISO format or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY (e.g. 03/11/2026 or 03/11/2026 03:00 PM)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed)) {
    const datePart = trimmed.split(' ')[0];
    const [day, month, year] = datePart.split('/');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(d.getTime())) return d;
  }

  // DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}/.test(trimmed)) {
    const datePart = trimmed.split(' ')[0];
    const [day, month, year] = datePart.split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback to standard JS Date
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Determines SLA status for a task:
 * - Audited tasks (PASSED or FATAL) are closed out.
 * - Tasks with auditStatus === 'PENDING' (or un-audited) whose field visit occurred on a previous date
 *   or whose allocation/creation is >= 24h old are D+1 BREACHED.
 * - Reallocating a task does NOT reset its D+1 breach clock.
 * - Both assigned and unassigned carryover tasks are flagged for leadership escalation.
 */
export function getTaskSLAStatus(task, referenceTime = new Date()) {
  if (!task) {
    return { isOverdue: false, status: 'UNKNOWN' };
  }

  // Completed or fatal audits are already closed
  const auditStatus = String(task.auditStatus || task.audit_status || 'PENDING').toUpperCase();
  if (auditStatus === 'PASSED' || auditStatus === 'FATAL') {
    return {
      isOverdue: false,
      status: 'CLOSED',
      auditStatus,
      slaLabel: auditStatus === 'PASSED' ? 'Passed' : 'Fatal'
    };
  }

  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);

  // 1. Check dispatch date calendar day difference (Day D vs Today)
  const dispatchDate = parseTaskDate(task.date || task.dispatch_date);
  let daysDiff = 0;
  if (dispatchDate) {
    const dStart = new Date(dispatchDate.getFullYear(), dispatchDate.getMonth(), dispatchDate.getDate()).getTime();
    const nStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    daysDiff = Math.max(0, Math.round((nStart - dStart) / (1000 * 60 * 60 * 24)));
  }

  // 2. Check time elapsed from ingestion / creation baseline
  const baselineTimeStr = task.uploadedAt || task.created_at || task.createdAt || task.allocatedAt;
  let baselineDate = baselineTimeStr ? new Date(baselineTimeStr) : null;
  let elapsedHoursFromBaseline = 0;
  if (baselineDate && !isNaN(baselineDate.getTime())) {
    elapsedHoursFromBaseline = Math.floor((now.getTime() - baselineDate.getTime()) / (1000 * 60 * 60));
  }

  // D+1 SLA Breach Criteria:
  // - Either dispatch calendar date was yesterday or earlier (daysDiff >= 1)
  // - OR >= 24 hours have elapsed since ingestion/allocation
  const isOverdue = daysDiff >= 1 || elapsedHoursFromBaseline >= 24;

  if (isOverdue) {
    const effectiveHours = Math.max(daysDiff * 24, elapsedHoursFromBaseline, 24);
    const severity = (effectiveHours >= 48 || daysDiff >= 2) ? 'CRITICAL' : 'HIGH';
    const isAssigned = Boolean(task.assignedAuditorId || task.assignedAuditorName);

    return {
      isOverdue: true,
      status: 'BREACHED',
      severity,
      hoursOverdue: effectiveHours,
      daysOverdue: Math.max(1, daysDiff),
      slaLabel: `D+${Math.max(1, daysDiff)} Overdue (+${effectiveHours}h)${!isAssigned ? ' - Unassigned' : ''}`,
      escalatedTo: 'Business Head (BH) & General Manager (GM)',
      auditorName: isAssigned ? (task.assignedAuditorName || 'Assigned Auditor') : 'Unassigned (Backlog)',
      auditorId: task.assignedAuditorId || null,
      isUnassigned: !isAssigned
    };
  }

  // Within SLA (On Track)
  const isAssigned = Boolean(task.assignedAuditorId || task.assignedAuditorName);
  if (!isAssigned) {
    return {
      isOverdue: false,
      status: 'UNASSIGNED',
      slaLabel: 'Awaiting Allocation'
    };
  }

  const remainingHours = Math.max(0, 24 - elapsedHoursFromBaseline);
  return {
    isOverdue: false,
    status: 'ON_TRACK',
    hoursRemaining: remainingHours,
    slaLabel: `Within SLA (${remainingHours}h left)`,
    auditorName: task.assignedAuditorName
  };
}

/**
 * Filter all tasks that are currently D+1 overdue and pending
 */
export function filterDPlusOneOverdueTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(t => getTaskSLAStatus(t).isOverdue);
}

/**
 * Summarize overdue breaches by Auditor (including unassigned backlog group)
 */
export function groupOverdueByAuditor(tasks) {
  const map = new Map();

  tasks.forEach(t => {
    const sla = getTaskSLAStatus(t);
    if (!sla.isOverdue) return;

    const isUnassigned = !t.assignedAuditorId && !t.assignedAuditorName;
    const auditorKey = isUnassigned ? 'UNASSIGNED_BACKLOG' : (t.assignedAuditorId || t.assignedAuditorName);
    const auditorName = isUnassigned ? 'Unassigned (Backlog)' : (t.assignedAuditorName || t.assignedAuditorId || 'Unknown Auditor');

    if (!map.has(auditorKey)) {
      map.set(auditorKey, {
        auditorId: isUnassigned ? null : t.assignedAuditorId,
        auditorName,
        isUnassigned,
        tasks: [],
        count: 0,
        maxHoursOverdue: 0,
        criticalCount: 0
      });
    }

    const entry = map.get(auditorKey);
    entry.tasks.push(t);
    entry.count++;
    if (sla.hoursOverdue > entry.maxHoursOverdue) {
      entry.maxHoursOverdue = sla.hoursOverdue;
    }
    if (sla.severity === 'CRITICAL') {
      entry.criticalCount++;
    }
  });

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
