/**
 * SLA & D+1 Audit Escalation Engine for Locus Auditor
 * 
 * Business Rule:
 * Day D dispatches allocated to auditors must be audited within the same day.
 * Any audit allocated on Day D that remains PENDING into D+1 (>24 hours)
 * is an SLA breach and is automatically escalated to:
 * - Sunil Kumar (Business Head - Home Visits)
 * - Rajesh Sharma (General Manager - Quality & Compliance)
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

  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(d.getTime())) return d;
  }

  // DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}/.test(trimmed)) {
    const [day, month, year] = trimmed.split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback to standard JS Date
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Determines SLA status for a task:
 * - Completed audits are closed out.
 * - Unassigned tasks are awaiting allocation.
 * - SLA is STRICTLY counted from the date/time the task was uploaded and allocated to the auditor (allocatedAt or uploadedAt).
 * - Lead/dispatch date in the field is NEVER used to calculate audit SLA.
 * - Assigned pending tasks >= 24 hours since allocation/upload are D+1 BREACHED.
 */
export function getTaskSLAStatus(task, referenceTime = new Date()) {
  if (!task) {
    return { isOverdue: false, status: 'UNKNOWN' };
  }

  // Completed or fatal audits are already closed
  if (task.auditStatus && task.auditStatus !== 'PENDING') {
    return {
      isOverdue: false,
      status: 'CLOSED',
      auditStatus: task.auditStatus,
      slaLabel: task.auditStatus === 'PASSED' ? 'Passed' : 'Fatal'
    };
  }

  // Unassigned tasks without an auditor
  const isAssigned = Boolean(task.assignedAuditorId || task.assignedAuditorName);
  if (!isAssigned) {
    return {
      isOverdue: false,
      status: 'UNASSIGNED',
      slaLabel: 'Awaiting Allocation'
    };
  }

  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);

  // SLA is strictly measured from the date/time the task was uploaded and allocated to the auditor!
  // NEVER from the lead / dispatch date.
  const baselineTimeStr = task.allocatedAt || task.uploadedAt || task.createdAt || task.created_at;
  let baselineDate = baselineTimeStr ? new Date(baselineTimeStr) : null;
  if (!baselineDate || isNaN(baselineDate.getTime())) {
    baselineDate = now;
  }

  const elapsedMs = Math.max(0, now.getTime() - baselineDate.getTime());
  const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));

  // D+1 SLA Breach Criteria:
  // 24+ hours elapsed since allocation/upload to the auditor
  const isOverdue = elapsedHours >= 24;

  if (isOverdue) {
    const effectiveHours = Math.max(elapsedHours, 24);
    const severity = effectiveHours >= 48 ? 'CRITICAL' : 'HIGH';

    return {
      isOverdue: true,
      status: 'BREACHED',
      severity,
      hoursOverdue: effectiveHours,
      daysOverdue: Math.max(1, Math.floor(effectiveHours / 24)),
      slaLabel: `D+1 Overdue (+${effectiveHours}h)`,
      escalatedTo: 'BH (Sunil Kumar) & GM (Rajesh Sharma)',
      auditorName: task.assignedAuditorName || 'Unknown Auditor',
      auditorId: task.assignedAuditorId || null
    };
  }

  // Within SLA (On Track)
  const remainingHours = Math.max(0, 24 - elapsedHours);
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
 * Summarize overdue breaches by Auditor
 */
export function groupOverdueByAuditor(tasks) {
  const map = new Map();

  tasks.forEach(t => {
    const sla = getTaskSLAStatus(t);
    if (!sla.isOverdue) return;

    const auditorKey = t.assignedAuditorId || t.assignedAuditorName || 'Unassigned';
    const auditorName = t.assignedAuditorName || t.assignedAuditorId || 'Unknown Auditor';

    if (!map.has(auditorKey)) {
      map.set(auditorKey, {
        auditorId: t.assignedAuditorId,
        auditorName,
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
