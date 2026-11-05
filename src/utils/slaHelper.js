/**
 * SLA & D+1 Audit Escalation Engine for Locus Auditor
 * 
 * Business Rule:
 * Day D uploaded dispatches with photo evidence must be audited within the same day.
 * Any batch from Day D that remains PENDING into D+1 (>24 hours or calendar day passed since batch upload)
 * is an SLA breach and is automatically escalated to:
 * - Business Head (BH)
 * - General Manager (GM)
 * 
 * STRICT ESCALATION ELIGIBILITY:
 * 1. Must consider the task's BATCH UPLOAD DATE, NOT the actual field visit date from data!
 *    Tasks uploaded today are in today's active shift and must NEVER be flagged as D+1 overdue.
 * 2. Only tasks that HAVE compliance photos (hasImages === true and imageCount > 0) are auditable.
 * 3. Only tasks that HAVE BEEN ASSIGNED to an auditor are escalated. Unassigned backlog is excluded.
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
 * Resolves the batch upload / ingestion date of a task.
 * STRICT POLICY: For SLA breach evaluation and escalation, the system strictly considers the
 * task's batch upload date (uploadedAt / created_at), NEVER the actual field visit date (date / dispatch_date).
 * If a task was uploaded today, it is in today's active batch and is NEVER flagged as D+1 breached.
 */
export function getTaskBatchUploadDate(task) {
  if (!task) return null;

  // 1. Check upload timestamp properties
  const uploadTimeStr = task.uploadedAt || 
                        task.uploaded_at || 
                        task.uploadDate || 
                        task.upload_date || 
                        task.createdAt || 
                        task.created_at;

  if (uploadTimeStr) {
    const d = parseTaskDate(uploadTimeStr);
    if (d && !isNaN(d.getTime())) return d;
  }

  // 2. Fallback to allocation timestamp if task was allocated
  if (task.allocatedAt || task.allocated_at) {
    const d = parseTaskDate(task.allocatedAt || task.allocated_at);
    if (d && !isNaN(d.getTime())) return d;
  }

  // 3. Fallback to allocationBatchId timestamp (e.g. ALLOC_1730700000000)
  const batchId = task.allocationBatchId || task.allocation_batch_id;
  if (batchId) {
    const match = String(batchId).match(/ALLOC_(\d+)/);
    if (match && match[1]) {
      const d = new Date(Number(match[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

/**
 * Determines SLA status for a task:
 * - Audited tasks (PASSED or FATAL) are closed out.
 * - STRICT POLICY: Evaluates SLA strictly using the task's BATCH UPLOAD DATE, never the actual visit date from data.
 * - Tasks uploaded today are in today's active shift (uploadDaysDiff === 0) and are strictly ON TRACK.
 * - Only tasks uploaded on previous days (uploadDaysDiff >= 1 or elapsed >= 24h since upload)
 *   that are assigned and have images are flagged as D+1 BREACHED.
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

  // STRICT REQUIREMENT 1: In Escalation there should be ONLY audits that have images
  const hasImages = Boolean(task.hasImages || task.has_images) && (
    Number(task.imageCount || task.image_count) > 0 || 
    (task.images && typeof task.images === 'object' && Object.values(task.images).some(Boolean))
  );
  if (!hasImages) {
    return {
      isOverdue: false,
      status: 'NO_IMAGES',
      slaLabel: 'No Images Uploaded'
    };
  }

  // STRICT REQUIREMENT 1: In Escalation there should be ONLY audits that have been assigned to an auditor
  const isAssigned = Boolean(
    task.assignedAuditorId || 
    task.assignedAuditorName || 
    task.assigned_auditor_id || 
    task.assigned_auditor_name
  );
  if (!isAssigned) {
    return {
      isOverdue: false,
      status: 'UNASSIGNED',
      slaLabel: 'Awaiting Allocation'
    };
  }

  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);

  // STRICT REQUIREMENT: Evaluate SLA strictly from the Task Batch Upload Date, NEVER the actual visit date (task.date) from data
  // Tasks uploaded today are in today's active shift and are NEVER escalated into D+1.
  const batchUploadDate = getTaskBatchUploadDate(task);

  let uploadDaysDiff = 0;
  let elapsedHoursFromUpload = 0;

  if (batchUploadDate) {
    const uStart = new Date(batchUploadDate.getFullYear(), batchUploadDate.getMonth(), batchUploadDate.getDate()).getTime();
    const nStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    uploadDaysDiff = Math.max(0, Math.round((nStart - uStart) / (1000 * 60 * 60 * 24)));
    elapsedHoursFromUpload = Math.max(0, Math.floor((now.getTime() - batchUploadDate.getTime()) / (1000 * 60 * 60)));
  }

  // D+1 SLA Breach Criteria based on BATCH UPLOAD DATE:
  // - Task upload batch was yesterday or earlier (uploadDaysDiff >= 1)
  // - OR >= 24 hours have elapsed since the task batch was uploaded
  // If uploaded TODAY (uploadDaysDiff === 0 and elapsedHoursFromUpload < 24), it is STRICTLY WITHIN SLA!
  const isOverdue = uploadDaysDiff >= 1 || elapsedHoursFromUpload >= 24;

  if (isOverdue) {
    const effectiveHours = Math.max(uploadDaysDiff * 24, elapsedHoursFromUpload, 24);
    const severity = (effectiveHours >= 48 || uploadDaysDiff >= 2) ? 'CRITICAL' : 'HIGH';

    return {
      isOverdue: true,
      status: 'BREACHED',
      severity,
      hoursOverdue: effectiveHours,
      daysOverdue: Math.max(1, uploadDaysDiff),
      slaLabel: `D+${Math.max(1, uploadDaysDiff)} Overdue (+${effectiveHours}h since upload)`,
      escalatedTo: 'Business Head (BH) & General Manager (GM)',
      auditorName: task.assignedAuditorName || task.assignedAuditorId || 'Assigned Auditor',
      auditorId: task.assignedAuditorId || null,
      isUnassigned: false
    };
  }

  // Within SLA (On Track)
  const remainingHours = Math.max(0, 24 - elapsedHoursFromUpload);
  return {
    isOverdue: false,
    status: 'ON_TRACK',
    hoursRemaining: remainingHours,
    slaLabel: `Within SLA (${remainingHours}h left)`,
    auditorName: task.assignedAuditorName || task.assignedAuditorId
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
