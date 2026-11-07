/**
 * Daily Quality Audit Digest & Escalation Helper
 * 
 * Aggregates daily audit records for Area Managers (AMs) and Regional Managers (RMs),
 * identifies rolling 7-day repeat offenders (≥ 2 Fatal marks), computes compliance metrics,
 * and builds responsive, enterprise-grade HTML email templates.
 */

// Helper: Normalize any date input to YYYY-MM-DD in local/Asia-Kolkata timezone
export function normalizeDateToYMD(dateInput = new Date()) {
  try {
    if (!dateInput) return new Date().toISOString().slice(0, 10);
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      return dateInput.trim();
    }
    // Handle DD/MM/YYYY or DD/MM/YYYY HH:mm AM/PM (e.g. '01/11/2026 06:30 AM')
    if (typeof dateInput === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateInput.trim())) {
      const parts = dateInput.trim().split(/[\s/]+/);
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    // Format in IST/local standard YYYY-MM-DD
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

// Helper: Get rolling 7-day window dates [startStr, endStr]
export function getRolling7DayRange(targetDateStr) {
  const endDate = new Date(targetDateStr);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6); // 7 days inclusive: today + past 6 days
  return {
    startStr: normalizeDateToYMD(startDate),
    endStr: normalizeDateToYMD(endDate),
    startDate,
    endDate
  };
}

// Helper: Parse task batch date
// STRICT RULE: Prioritize Upload Date (uploadedAt / created_at) so that delayed audits completed in the morning
// (e.g. 5:00 AM) remain in their original upload day's batch rather than leaking into the next day.
export function getTaskBatchDateYMD(task) {
  if (!task) return '';
  const dateField = task.uploadedAt || 
                    task.uploaded_at || 
                    task.createdAt || 
                    task.created_at || 
                    task.dispatchDate || 
                    task.dispatch_date || 
                    task.date || 
                    task.auditedAt || 
                    task.audited_at;
  if (!dateField) return '';
  return normalizeDateToYMD(dateField);
}

// Backwards compatibility alias
export const getTaskAuditDateYMD = getTaskBatchDateYMD;

/**
 * Filter tasks assigned or reporting to a specific manager (AM or RM)
 */
export function filterTasksForManager(tasks = [], users = [], manager) {
  if (!manager) return tasks;

  const managerEmail = (manager.email || '').trim().toLowerCase();
  const managerName = (manager.full_name || manager.name || '').trim().toLowerCase();
  const managerId = manager.id ? String(manager.id) : '';
  const isAM = (manager.roles || []).includes('AM') || manager.role === 'AM';
  const isRM = (manager.roles || []).includes('RM') || manager.role === 'RM';
  const hub = (manager.facility_code || manager.city || '').trim().toLowerCase();

  // Step 1: Build a set of FE IDs and employee codes reporting to this manager
  const supervisedFeKeys = new Set();

  (users || []).forEach(u => {
    const roles = u.roles || [u.role];
    const isFE = roles.includes('FE') || (u.employee_code && u.employee_code.startsWith('FE'));
    if (!isFE) return;

    let matches = false;
    if (isAM) {
      if (u.reporting_manager_email && u.reporting_manager_email.trim().toLowerCase() === managerEmail) matches = true;
      if (u.reporting_manager_name && u.reporting_manager_name.trim().toLowerCase() === managerName) matches = true;
      if (u.reporting_manager_id && String(u.reporting_manager_id) === managerId) matches = true;
      if (!u.reporting_manager_email && !u.reporting_manager_name && hub && (u.facility_code?.toLowerCase() === hub || u.city?.toLowerCase() === hub)) {
        matches = true;
      }
    } else if (isRM) {
      if (u.regional_manager_email && u.regional_manager_email.trim().toLowerCase() === managerEmail) matches = true;
      if (u.regional_manager_name && u.regional_manager_name.trim().toLowerCase() === managerName) matches = true;
      if (u.regional_manager_id && String(u.regional_manager_id) === managerId) matches = true;
      if (hub && (u.facility_code?.toLowerCase() === hub || u.city?.toLowerCase() === hub || u.zone?.toLowerCase().includes(hub))) {
        matches = true;
      }
    }

    if (matches) {
      if (u.id) supervisedFeKeys.add(String(u.id).toLowerCase());
      if (u.employee_code) supervisedFeKeys.add(String(u.employee_code).toLowerCase());
      if (u.person_id) supervisedFeKeys.add(String(u.person_id).toLowerCase());
      if (u.email) supervisedFeKeys.add(String(u.email).toLowerCase());
      if (u.full_name) supervisedFeKeys.add(String(u.full_name).toLowerCase());
    }
  });

  // Step 2: Match tasks
  return (tasks || []).filter(t => {
    // Direct FE key match
    const feCode = String(t.feCode || t.fe_code || '').toLowerCase();
    const feId = String(t.feId || t.fe_id || '').toLowerCase();
    const feEmail = String(t.feEmail || t.fe_email || '').toLowerCase();
    const feName = String(t.feName || t.fe_name || '').toLowerCase();

    if (supervisedFeKeys.has(feCode) || supervisedFeKeys.has(feId) || supervisedFeKeys.has(feEmail) || supervisedFeKeys.has(feName)) {
      return true;
    }

    // Direct AM/RM email on task
    if (isAM && (t.amEmail || t.reporting_manager_email)) {
      const taskAmEmail = String(t.amEmail || t.reporting_manager_email).toLowerCase();
      if (taskAmEmail === managerEmail) return true;
    }
    if (isRM && (t.rmEmail || t.regional_manager_email)) {
      const taskRmEmail = String(t.rmEmail || t.regional_manager_email).toLowerCase();
      if (taskRmEmail === managerEmail) return true;
    }

    // Hub fallback match if no direct hierarchy
    const taskHub = String(t.facilityCode || t.facility_code || t.city || t.teamName || '').toLowerCase();
    if (hub && taskHub === hub) return true;

    return false;
  });
}

/**
 * Aggregate daily audit performance for a manager
 */
export function aggregateDailyDigest({
  tasks = [],
  users = [],
  targetDate = new Date(),
  manager,
  role = 'AM', // 'AM' | 'RM'
  portalBaseUrl = 'https://locus-auditor.vercel.app'
}) {
  const targetDateStr = normalizeDateToYMD(targetDate);
  const { startStr: sevenDaysAgoStr } = getRolling7DayRange(targetDateStr);

  const managerTasks = filterTasksForManager(tasks, users, manager);

  // 1. Audits performed today (Target Date)
  const todayAudits = managerTasks.filter(t => {
    const dStr = getTaskAuditDateYMD(t);
    const status = t.auditStatus || t.audit_status;
    const isAudited = status === 'PASSED' || status === 'FATAL';
    return isAudited && dStr === targetDateStr;
  });

  // Fallback: if no audits strictly matched targetDateStr, check if any dispatches were audited today
  const auditedTodayList = todayAudits.length > 0 ? todayAudits : managerTasks.filter(t => {
    const status = t.auditStatus || t.audit_status;
    return (status === 'PASSED' || status === 'FATAL') && (t.auditedAt || t.audited_at)?.startsWith(targetDateStr);
  });

  const totalAudited = auditedTodayList.length;
  const fatalAudits = auditedTodayList.filter(t => (t.auditStatus || t.audit_status) === 'FATAL');
  const passedAudits = auditedTodayList.filter(t => (t.auditStatus || t.audit_status) === 'PASSED');
  const fatalCount = fatalAudits.length;
  const passedCount = passedAudits.length;

  const complianceRate = totalAudited > 0 ? Number(((passedCount / totalAudited) * 100).toFixed(1)) : 100;
  const fatalRate = totalAudited > 0 ? Number(((fatalCount / totalAudited) * 100).toFixed(1)) : 0;

  // 2. Rolling 7-Day Window Analysis for Repeat Offenders (≥ 2 Fatal marks)
  const rolling7DayAudits = managerTasks.filter(t => {
    const dStr = getTaskAuditDateYMD(t);
    return dStr >= sevenDaysAgoStr && dStr <= targetDateStr;
  });

  const fe7DayFatalMap = new Map();
  rolling7DayAudits.forEach(t => {
    const status = t.auditStatus || t.audit_status;
    if (status !== 'FATAL') return;

    const feKey = String(t.feCode || t.fe_code || t.feId || t.fe_id || t.feName || 'unknown').trim();
    const feName = t.feName || t.fe_name || 'Field Executive';
    const feCode = t.feCode || t.fe_code || t.feId || 'N/A';
    const taskDate = getTaskAuditDateYMD(t);

    if (!fe7DayFatalMap.has(feKey)) {
      fe7DayFatalMap.set(feKey, {
        feKey,
        feName,
        feCode,
        fatalCount7Days: 0,
        strikes: [],
        mostRecentDate: taskDate
      });
    }

    const feEntry = fe7DayFatalMap.get(feKey);
    feEntry.fatalCount7Days += 1;
    feEntry.strikes.push({
      taskId: t.taskId || t.id,
      date: taskDate,
      reasons: t.failedReasons || t.failed_reasons || []
    });
    if (taskDate > feEntry.mostRecentDate) {
      feEntry.mostRecentDate = taskDate;
    }
  });

  // Flag repeat offenders: ≥ 2 Fatal strikes in 7 days
  const repeatOffenders = Array.from(fe7DayFatalMap.values())
    .filter(item => item.fatalCount7Days >= 2)
    .sort((a, b) => b.fatalCount7Days - a.fatalCount7Days);

  // 3. Breakdown of Common Failure Root Causes (from today's fatals)
  const failureReasonCounts = {};
  fatalAudits.forEach(t => {
    const reasons = t.failedReasons || t.failed_reasons || [];
    if (Array.isArray(reasons) && reasons.length > 0) {
      reasons.forEach(r => {
        const cleanReason = String(r).trim();
        failureReasonCounts[cleanReason] = (failureReasonCounts[cleanReason] || 0) + 1;
      });
    } else {
      const fallback = t.remarks || t.auditorRemarks || 'General SOP Violation';
      failureReasonCounts[fallback] = (failureReasonCounts[fallback] || 0) + 1;
    }
  });

  const commonFailures = Object.entries(failureReasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // 4. Detailed Today's Fatal Incidents List
  const fatalIncidents = fatalAudits.map(t => {
    const taskId = t.taskId || t.id;
    return {
      taskId,
      feName: t.feName || t.fe_name || 'Field Executive',
      feCode: t.feCode || t.fe_code || t.feId || 'N/A',
      reasons: t.failedReasons || t.failed_reasons || ['SOP checklist failure'],
      remarks: t.remarks || t.auditorRemarks || '',
      auditedAt: t.auditedAt || t.audited_at || new Date().toISOString(),
      auditedBy: t.auditedBy || t.audited_by_name || 'Central QA Lead',
      portalUrl: `${portalBaseUrl.replace(/\/$/, '')}/?taskId=${taskId}`
    };
  });

  const clusterOrRegion = manager?.facility_code || manager?.city || manager?.zone || (role === 'RM' ? 'Regional Territory' : 'Cluster Hub');

  return {
    digestDate: targetDateStr,
    rolling7DayStart: sevenDaysAgoStr,
    recipientEmail: manager?.email || '',
    recipientName: manager?.full_name || manager?.name || 'Manager',
    recipientRole: role,
    clusterOrRegion,
    totalAudited,
    totalPassed: passedCount,
    fatalCount,
    complianceRate,
    fatalRate,
    repeatOffenders,
    commonFailures,
    fatalIncidents
  };
}

/**
 * Generate enterprise-grade responsive HTML email for the Daily Digest
 */
export function buildDailyDigestHtml({ digest, portalBaseUrl = 'https://locus-auditor.vercel.app' }) {
  const {
    digestDate,
    recipientName,
    recipientRole,
    clusterOrRegion,
    totalAudited,
    totalPassed,
    fatalCount,
    complianceRate,
    repeatOffenders = [],
    commonFailures = [],
    fatalIncidents = []
  } = digest;

  const dateFormatted = new Date(digestDate).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const portalLink = portalBaseUrl.replace(/\/$/, '');

  // Render Repeat Offenders Alert Box
  const repeatOffendersHtml = repeatOffenders.length > 0 ? `
    <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <span style="background-color: #DC2626; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
          URGENT ATTENTION
        </span>
        <span style="margin-left: 8px; font-size: 14px; font-weight: 700; color: #991B1B;">
          High-Risk Repeat Offenders Detected (Rolling 7-Day Window)
        </span>
      </div>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #7F1D1D; line-height: 1.5;">
        The following <strong>${repeatOffenders.length}</strong> Field Executive(s) under your management have accumulated <strong>&ge; 2 Fatal Non-Compliance strikes</strong> in the past 7 days. Immediate in-person kit inspection and coaching are required:
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: #ffffff; border-radius: 6px; overflow: hidden; border: 1px solid #FECACA;">
        <thead>
          <tr style="background-color: #FEE2E2; color: #991B1B; text-align: left;">
            <th style="padding: 8px 12px; font-weight: 600;">Field Executive</th>
            <th style="padding: 8px 12px; font-weight: 600;">Employee Code</th>
            <th style="padding: 8px 12px; font-weight: 600; text-align: center;">7-Day Fatal Strikes</th>
            <th style="padding: 8px 12px; font-weight: 600;">Most Recent Strike</th>
          </tr>
        </thead>
        <tbody>
          ${repeatOffenders.map(ro => `
            <tr style="border-bottom: 1px solid #FEE2E2;">
              <td style="padding: 8px 12px; font-weight: 600; color: #1E293B;">${ro.feName}</td>
              <td style="padding: 8px 12px; color: #64748B; font-family: monospace;">${ro.feCode}</td>
              <td style="padding: 8px 12px; text-align: center;">
                <span style="background-color: #EF4444; color: #ffffff; font-weight: 700; padding: 2px 8px; border-radius: 10px; font-size: 11px;">
                  ${ro.fatalCount7Days} Strikes
                </span>
              </td>
              <td style="padding: 8px 12px; color: #475569;">${ro.mostRecentDate || 'Today'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : `
    <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 600;">
        &#10004; Zero repeat offenders flagged in the rolling 7-day period. Keep up the high standard!
      </p>
    </div>
  `;

  // Render Today's Fatal Incidents Table
  const fatalIncidentsHtml = fatalIncidents.length > 0 ? `
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase; color: #1E293B; letter-spacing: 0.5px; margin: 0 0 12px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">
        Today's Fatal Non-Compliance Occurrences (${fatalIncidents.length})
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #F8FAFC; color: #475569; text-align: left; font-size: 11px; text-transform: uppercase;">
            <th style="padding: 10px 12px; font-weight: 700;">Task ID</th>
            <th style="padding: 10px 12px; font-weight: 700;">Field Executive</th>
            <th style="padding: 10px 12px; font-weight: 700;">Fatal Reasons / Checkpoints Failed</th>
            <th style="padding: 10px 12px; font-weight: 700; text-align: center;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${fatalIncidents.map(fi => `
            <tr style="border-bottom: 1px solid #E2E8F0; background-color: #FFFFFF;">
              <td style="padding: 10px 12px; font-family: monospace; font-weight: 600; color: #0284C7; vertical-align: top;">
                #${fi.taskId}
              </td>
              <td style="padding: 10px 12px; vertical-align: top;">
                <div style="font-weight: 700; color: #1E293B;">${fi.feName}</div>
                <div style="color: #64748B; font-size: 11px; font-family: monospace;">[${fi.feCode}]</div>
              </td>
              <td style="padding: 10px 12px; vertical-align: top;">
                <ul style="margin: 0; padding-left: 16px; color: #DC2626;">
                  ${fi.reasons.map(r => `<li style="margin-bottom: 4px;"><strong>${r}</strong></li>`).join('')}
                </ul>
                ${fi.remarks ? `<div style="margin-top: 6px; font-size: 11px; color: #64748B; font-style: italic;">Remarks: "${fi.remarks}"</div>` : ''}
              </td>
              <td style="padding: 10px 12px; text-align: center; vertical-align: middle;">
                <a href="${fi.portalUrl}" target="_blank" style="display: inline-block; background-color: #DC2626; color: #FFFFFF; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 11px; white-space: nowrap;">
                  Inspect &rarr;
                </a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : `
    <div style="background-color: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #16A34A; font-weight: 700;">
        &#10004; Excellent Work! Zero fatal non-compliance strikes were recorded today in your cluster.
      </p>
    </div>
  `;

  // Render Top Failure Root Causes
  const commonFailuresHtml = commonFailures.length > 0 ? `
    <div style="margin-bottom: 24px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px;">
      <h3 style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; margin: 0 0 10px 0;">
        Top Failure Root Causes Across Cluster Today
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        ${commonFailures.map((cf, idx) => `
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 6px 0; color: #1E293B; font-weight: 500;">
              <span style="color: #64748B; margin-right: 6px;">#${idx + 1}</span> ${cf.reason}
            </td>
            <td style="padding: 6px 0; text-align: right; color: #DC2626; font-weight: 700;">
              ${cf.count} occurrences
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Daily Quality Audit Digest - Lenskart HTO</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px; color: #1E293B; }
        .wrapper { max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
        @media only screen and (max-width: 600px) {
          .kpi-container { flex-direction: column !important; }
          .kpi-card { margin-bottom: 8px !important; width: 100% !important; }
        }
      </style>
    </head>
    <body style="background-color: #F1F5F9; padding: 20px 10px; margin: 0;">
      <div class="wrapper" style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); color: #FFFFFF; padding: 24px; border-bottom: 3px solid #DC2626;">
          <table style="width: 100%;">
            <tr>
              <td>
                <div style="display: inline-block; background-color: rgba(220, 38, 38, 0.2); border: 1px solid rgba(220, 38, 38, 0.4); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #FCA5A5; letter-spacing: 0.5px; margin-bottom: 8px;">
                  DAILY AUDIT DIGEST &bull; ${recipientRole} EXECUTIVE SUMMARY
                </div>
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #FFFFFF;">
                  Lenskart Home Try-On (HTO) Quality Audit
                </h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #94A3B8;">
                  ${clusterOrRegion} &bull; ${dateFormatted}
                </p>
              </td>
              <td style="text-align: right; vertical-align: top;">
                <span style="font-size: 11px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 6px; color: #E2E8F0;">
                  Recipient: <strong>${recipientName}</strong>
                </span>
              </td>
            </tr>
          </table>
        </div>

        <!-- Body Container -->
        <div style="padding: 24px;">
          
          <p style="font-size: 14px; margin: 0 0 20px 0; color: #334155; line-height: 1.5;">
            Dear <strong>${recipientName}</strong>,
            <br/>
            Here is your daily consolidated Quality Auditing summary for <strong>${clusterOrRegion}</strong> on <strong>${dateFormatted}</strong>. This digest aggregates all inspected field visits and highlights fatal non-compliance occurrences requiring supervisor intervention.
          </p>

          <!-- KPI Metric Summary Cards -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; text-align: center; width: 33%;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">Total Audited</div>
                <div style="font-size: 26px; font-weight: 800; color: #0284C7; margin-top: 4px;">${totalAudited}</div>
                <div style="font-size: 11px; color: #94A3B8; margin-top: 2px;">Inspected Visits</div>
              </td>
              <td style="background-color: ${fatalCount > 0 ? '#FEF2F2' : '#F0FDF4'}; border: 1px solid ${fatalCount > 0 ? '#FCA5A5' : '#86EFAC'}; border-radius: 8px; padding: 14px; text-align: center; width: 33%;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${fatalCount > 0 ? '#DC2626' : '#16A34A'}; letter-spacing: 0.5px;">Fatal Strikes</div>
                <div style="font-size: 26px; font-weight: 800; color: ${fatalCount > 0 ? '#D93025' : '#16A34A'}; margin-top: 4px;">${fatalCount}</div>
                <div style="font-size: 11px; color: ${fatalCount > 0 ? '#B91C1C' : '#15803D'}; margin-top: 2px;">Non-Compliance</div>
              </td>
              <td style="background-color: #F0FDF4; border: 1px solid #86EFAC; border-radius: 8px; padding: 14px; text-align: center; width: 33%;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #16A34A; letter-spacing: 0.5px;">Compliance Rate</div>
                <div style="font-size: 26px; font-weight: 800; color: #1E8E3E; margin-top: 4px;">${complianceRate}%</div>
                <div style="font-size: 11px; color: #15803D; margin-top: 2px;">${totalPassed} Passed Audits</div>
              </td>
            </tr>
          </table>

          <!-- Repeat Offenders Alert Block -->
          ${repeatOffendersHtml}

          <!-- Today's Fatal Incidents Table -->
          ${fatalIncidentsHtml}

          <!-- Common Failure Reasons -->
          ${commonFailuresHtml}

          <!-- Actionable Review CTA -->
          <div style="background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); border-radius: 8px; padding: 18px 20px; text-align: center; margin-top: 24px;">
            <p style="margin: 0 0 12px 0; color: #F8FAFC; font-size: 13px;">
              Review full photo audit records, replacement requests, and auditor remarks on the live platform:
            </p>
            <a href="${portalLink}" target="_blank" style="display: inline-block; background-color: #DC2626; color: #FFFFFF; font-weight: 700; font-size: 13px; padding: 10px 24px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(220,38,38,0.3);">
              Open Cluster Oversight Dashboard &rarr;
            </a>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 24px; font-size: 11px; color: #94A3B8; text-align: center; line-height: 1.5;">
          <strong>Lenskart Solutions Pvt. Ltd. &bull; Home Try-On (HTO) Central Quality & Governance</strong><br/>
          This is an automated daily digest dispatched at 20:00 IST. To acknowledge review or log corrective coaching sessions, visit the Cluster Oversight Console.
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * Generate plain text fallback for the Daily Digest
 */
export function buildDailyDigestText({ digest, portalBaseUrl = 'https://locus-auditor.vercel.app' }) {
  const {
    digestDate,
    recipientName,
    recipientRole,
    clusterOrRegion,
    totalAudited,
    totalPassed,
    fatalCount,
    complianceRate,
    repeatOffenders = [],
    fatalIncidents = []
  } = digest;

  const repeatOffendersText = repeatOffenders.length > 0
    ? repeatOffenders.map(ro => `- ${ro.feName} (${ro.feCode}): ${ro.fatalCount7Days} fatal strikes in past 7 days`).join('\n')
    : 'None (Clean record across cluster)';

  const fatalText = fatalIncidents.length > 0
    ? fatalIncidents.map(fi => `Task #${fi.taskId} | FE: ${fi.feName} (${fi.feCode})\nViolations: ${fi.reasons.join(', ')}\nRemarks: ${fi.remarks || 'None'}`).join('\n\n')
    : 'Zero fatal incidents today!';

  return `LENSKART HTO DAILY QUALITY AUDIT DIGEST
Date: ${digestDate}
Territory / Cluster: ${clusterOrRegion}
Recipient: ${recipientName} (${recipientRole})

==================================================
DAILY KPI SUMMARY:
==================================================
Total Audited Today: ${totalAudited}
Passed Audits:       ${totalPassed}
Fatal Strikes:       ${fatalCount}
Compliance Rate:     ${complianceRate}%

==================================================
HIGH-RISK REPEAT OFFENDERS (≥ 2 Fatal Strikes in 7 Days):
==================================================
${repeatOffendersText}

==================================================
TODAY'S FATAL AUDIT OCCURRENCES:
==================================================
${fatalText}

Review all details in portal: ${portalBaseUrl}

Lenskart Central Quality & Governance Division`;
}

// ====================================================================
// FIELD EXECUTIVE (FE) LEVEL FATAL AGGREGATION & EMAIL BUILDER
// Dispatched strictly to FEs with >= 1 Fatal strike (CC: direct AM & RM)
// ====================================================================

/**
 * Aggregate today's audits at the FE level, strictly isolating FEs with >= 1 Fatal.
 * FEs with 0 fatals are completely excluded to conserve email quotas.
 */
export function aggregateFeFatalDigests({
  tasks = [],
  users = [],
  targetDate,
  targetDateStr,
  portalBaseUrl = 'https://locus-auditor.vercel.app'
}) {
  const targetDateStrNormalized = normalizeDateToYMD(targetDateStr || targetDate || new Date());
  const feMap = new Map();

  // Filter tasks belonging to target upload batch date
  tasks.forEach(t => {
    const taskDate = getTaskAuditDateYMD(t);
    const status = t.auditStatus || t.audit_status;
    const isAudited = status === 'PASSED' || status === 'FATAL';

    if (!isAudited || taskDate !== targetDateStrNormalized) return;

    const feKey = String(t.feCode || t.fe_code || t.feId || t.fe_id || t.feName || 'unknown').trim().toLowerCase();

    if (!feMap.has(feKey)) {
      // Find matching FE profile in users registry (Intelligent multi-attribute match)
      const tCode = String(t.feCode || t.fe_code || t.feId || '').trim().toLowerCase();
      const tEmail = String(t.feEmail || t.fe_email || '').trim().toLowerCase();
      const tName = String(t.feName || t.fe_name || '').trim().toLowerCase();

      const feUser = users.find(u => {
        if (!u) return false;
        const uCode = String(u.employee_code || u.person_id || '').trim().toLowerCase();
        const uEmail = String(u.email || '').trim().toLowerCase();
        const uName = String(u.full_name || '').trim().toLowerCase();

        // 1. Match on FE code (e.g. LKH1703) in uCode, uEmail, or uName
        if (tCode) {
          if (uCode === tCode || uEmail.startsWith(tCode) || uEmail.includes(tCode) || uName.includes(tCode)) {
            return true;
          }
        }
        // 2. Exact email match
        if (tEmail && uEmail && tEmail === uEmail) return true;
        // 3. Name match (e.g. 'LKH1703_Amit Kumar Gouda' contains 'Amit Kumar Gouda')
        if (tName && tName.length >= 3) {
          if (uName === tName || uName.includes(tName) || tName.includes(uName)) {
            return true;
          }
        }
        return false;
      });

      const hub = String(t.facilityCode || t.facility_code || t.city || t.teamName || feUser?.facility_code || feUser?.city || '').trim();
      const hubLower = hub.toLowerCase();

      // 1. Resolve direct Area Manager (AM)
      let amEmail = feUser?.reporting_manager_email || t.amEmail || t.reporting_manager_email;
      let amName = feUser?.reporting_manager_name || t.amName || t.reporting_manager_name;

      if (!amEmail && amName) {
        const amObj = users.find(u => {
          const uName = String(u.full_name || u.name || '').trim().toLowerCase();
          const target = String(amName).trim().toLowerCase();
          return (uName === target || uName.includes(target) || target.includes(uName)) && u.email;
        });
        if (amObj) amEmail = amObj.email;
      }

      if ((!amEmail || !amName) && feUser?.reporting_manager_id) {
        const amObj = users.find(u => String(u.id) === String(feUser.reporting_manager_id));
        if (amObj) {
          amEmail = amObj.email;
          amName = amObj.full_name;
        }
      }

      // Fallback AM by Hub/Facility
      if (!amEmail && hubLower) {
        const amObj = users.find(u => {
          const roles = u.roles || [u.role];
          const isAM = roles.some(r => String(r).toUpperCase() === 'AM' || String(r).toLowerCase().includes('area manager'));
          const uHub = String(u.facility_code || u.city || '').toLowerCase();
          return isAM && (uHub.includes(hubLower) || hubLower.includes(uHub));
        });
        if (amObj) {
          amEmail = amObj.email;
          amName = amName || amObj.full_name;
        }
      }

      // 2. Resolve Regional Manager (RM)
      let rmEmail = feUser?.regional_manager_email || t.rmEmail || t.regional_manager_email;
      let rmName = feUser?.regional_manager_name || t.rmName || t.regional_manager_name;

      if (!rmEmail && rmName) {
        const rmObj = users.find(u => {
          const roles = u.roles || [u.role];
          const isRM = roles.some(r => String(r).toUpperCase() === 'RM' || String(r).toLowerCase().includes('regional manager'));
          const uName = String(u.full_name || u.name || '').trim().toLowerCase();
          const target = String(rmName).trim().toLowerCase();
          return isRM && (uName === target || uName.includes(target) || target.includes(uName)) && u.email;
        });
        if (rmObj) {
          rmEmail = rmObj.email;
          rmName = rmObj.full_name || rmName;
        }
      }

      if ((!rmEmail || !rmName) && feUser?.regional_manager_id) {
        const rmObj = users.find(u => String(u.id) === String(feUser.regional_manager_id));
        if (rmObj) {
          rmEmail = rmObj.email;
          rmName = rmObj.full_name;
        }
      }

      // Fallback RM strictly by City / Hub / Zone
      if (!rmEmail && hubLower) {
        const rmObj = users.find(u => {
          const roles = u.roles || [u.role];
          const isRM = roles.some(r => String(r).toUpperCase() === 'RM' || String(r).toLowerCase().includes('regional manager'));
          const uCity = String(u.city || u.facility_code || '').toLowerCase();
          return isRM && (uCity.includes(hubLower) || hubLower.includes(uCity));
        });
        if (rmObj) {
          rmEmail = rmObj.email;
          rmName = rmName || rmObj.full_name;
        }
      }

      feMap.set(feKey, {
        feKey,
        feCode: t.feCode || t.fe_code || t.feId || feUser?.employee_code || 'N/A',
        feName: t.feName || t.fe_name || feUser?.full_name || 'Field Executive',
        feEmail: feUser?.email || t.feEmail || t.fe_email || `${(t.feCode || 'fe').toLowerCase()}@lenskart.in`,
        fePhone: feUser?.phone || t.fePhone || '',
        hub: hub || 'Ahmedabad Hub',
        amName: amName || 'Area Manager',
        amEmail: amEmail || 'am.operations@lenskart.in',
        rmName: rmName || 'Regional Manager',
        rmEmail: rmEmail || 'rm.quality@lenskart.in',
        digestDate: targetDateStr,
        totalAudited: 0,
        passedCount: 0,
        fatalCount: 0,
        fatalTasks: [],
        replacements: []
      });
    }

    const feEntry = feMap.get(feKey);
    feEntry.totalAudited += 1;

    if (status === 'PASSED') {
      feEntry.passedCount += 1;
    } else if (status === 'FATAL') {
      feEntry.fatalCount += 1;
      const taskId = t.taskId || t.id;
      feEntry.fatalTasks.push({
        taskId,
        date: taskDate,
        failedReasons: t.failedReasons || t.failed_reasons || ['SOP checklist failure'],
        remarks: t.remarks || t.auditorRemarks || '',
        auditedBy: t.auditedBy || t.audited_by_name || 'Central QA',
        replacements: t.replacements || [],
        portalUrl: `${portalBaseUrl.replace(/\/$/, '')}/?taskId=${taskId}`
      });

      if (Array.isArray(t.replacements) && t.replacements.length > 0) {
        feEntry.replacements.push(...t.replacements);
      }
    }
  });

  // STRICT FILTER: Only return FEs who have >= 1 Fatal strike!
  // FEs with 0 fatals are completely excluded to conserve email quota!
  return Array.from(feMap.values())
    .filter(fe => fe.fatalCount >= 1)
    .sort((a, b) => b.fatalCount - a.fatalCount);
}

/**
 * Generate high-impact Tri-Party Warning Email for an FE with fatal strikes.
 * TO: FE, CC: direct AM & RM.
 */
export function buildFeFatalWarningEmailHtml({ feDigest, portalBaseUrl = 'https://locus-auditor.vercel.app' }) {
  const {
    feName,
    feCode,
    feEmail,
    amName,
    amEmail,
    rmName,
    rmEmail,
    hub,
    digestDate,
    totalAudited,
    passedCount,
    fatalCount,
    fatalTasks = [],
    replacements = []
  } = feDigest;

  const dateFormatted = new Date(digestDate).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const portalLink = portalBaseUrl.replace(/\/$/, '');

  // Render list of fatal visits
  const fatalTasksHtml = fatalTasks.map((ft, idx) => `
    <div style="background-color: #FFFFFF; border: 1px solid #FECACA; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.03);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #FEE2E2; padding-bottom: 8px; margin-bottom: 10px;">
        <span style="font-family: monospace; font-size: 13px; font-weight: 700; color: #DC2626;">
          Incident #${idx + 1} &bull; Task ID #${ft.taskId}
        </span>
        <a href="${ft.portalUrl}" target="_blank" style="background-color: #DC2626; color: #FFFFFF; text-decoration: none; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 4px;">
          Inspect Photos &rarr;
        </a>
      </div>

      <div style="margin-bottom: 8px;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #991B1B; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">
          Identified Checklist Violations:
        </span>
        <ul style="margin: 0; padding-left: 18px; color: #B91C1C; font-size: 13px;">
          ${ft.failedReasons.map(r => `<li style="margin-bottom: 3px;"><strong>[FAIL] ${r}</strong></li>`).join('')}
        </ul>
      </div>

      ${ft.remarks ? `
        <div style="background-color: #FFFBEB; border: 1px dashed #F59E0B; border-radius: 6px; padding: 8px 12px; margin-top: 8px; font-size: 12px; color: #92400E; font-style: italic;">
          <strong>Auditor Remarks:</strong> "${ft.remarks}"
        </div>
      ` : ''}

      ${ft.replacements && ft.replacements.length > 0 ? `
        <div style="margin-top: 8px; font-size: 11px; color: #475569;">
          <strong>Equipment Flagged for Replacement:</strong> ${ft.replacements.map(r => r.name || r.itemName).join(', ')}
        </div>
      ` : ''}
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Quality Audit Non-Compliance Strike Notice - Lenskart DLC</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px; color: #1E293B; }
        .wrapper { max-width: 660px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #E2E8F0; }
      </style>
    </head>
    <body style="background-color: #F1F5F9; padding: 20px 10px; margin: 0;">
      <div class="wrapper" style="max-width: 660px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0;">
        
        <!-- Red Warning Header Banner -->
        <div style="background: linear-gradient(135deg, #991B1B 0%, #DC2626 100%); color: #FFFFFF; padding: 22px 24px;">
          <div style="display: inline-block; background-color: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            FORMAL AUDIT NON-COMPLIANCE STRIKE NOTICE
          </div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #FFFFFF;">
            Quality Audit Failure Notice &bull; ${fatalCount} Fatal Strike${fatalCount > 1 ? 's' : ''}
          </h1>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #FEE2E2;">
            Field Executive: <strong>${feName}</strong> (Code: ${feCode}) &bull; ${hub} &bull; ${dateFormatted}
          </p>
        </div>

        <div style="padding: 24px;">
          
          <!-- Addressee Box -->
          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; font-size: 12px; line-height: 1.6;">
            <div><strong>TO (Field Executive):</strong> ${feName} &lt;${feEmail}&gt;</div>
            <div style="margin-top: 4px; color: #64748B;"><strong>Hub / Cluster:</strong> ${hub} &bull; <strong>Direct AM:</strong> ${amName || 'Assigned AM'}</div>
          </div>

          <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 16px 0;">
            Dear <strong>${feName}</strong>,
            <br/>
            Central Quality Auditing has concluded inspection of your customer visits conducted on <strong>${dateFormatted}</strong>. Out of <strong>${totalAudited}</strong> visits audited today, <strong>${fatalCount}</strong> visit${fatalCount > 1 ? 's were' : ' was'} marked with <strong>FATAL NON-COMPLIANCE STRIKES</strong> due to violation of mandatory Lenskart SOP standards.
          </p>

          <!-- Day's Metric Pills -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 20px;">
            <tr>
              <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px; text-align: center; width: 33%;">
                <div style="font-size: 11px; color: #64748B; font-weight: 600;">Total Audited</div>
                <div style="font-size: 20px; font-weight: 800; color: #0284C7; margin-top: 2px;">${totalAudited}</div>
              </td>
              <td style="background-color: #F0FDF4; border: 1px solid #86EFAC; border-radius: 8px; padding: 10px; text-align: center; width: 33%;">
                <div style="font-size: 11px; color: #166534; font-weight: 600;">Passed</div>
                <div style="font-size: 20px; font-weight: 800; color: #16A34A; margin-top: 2px;">${passedCount}</div>
              </td>
              <td style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 10px; text-align: center; width: 33%;">
                <div style="font-size: 11px; color: #991B1B; font-weight: 700;">Fatal Strikes</div>
                <div style="font-size: 20px; font-weight: 800; color: #DC2626; margin-top: 2px;">${fatalCount}</div>
              </td>
            </tr>
          </table>

          <!-- Fatal Occurrences Details -->
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: #1E293B; letter-spacing: 0.5px; margin: 0 0 10px 0;">
              Specific Fatal Audit Occurrences (${fatalCount}):
            </h3>
            ${fatalTasksHtml}
          </div>

          <!-- MANDATORY ACTION INSTRUCTIONS -->
          <div style="background-color: #FEF2F2; border: 2px solid #DC2626; border-radius: 10px; padding: 18px; margin-bottom: 24px;">
            <div style="font-size: 14px; font-weight: 800; color: #991B1B; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>&#9888;</span> MANDATORY ACTIONS REQUIRED BEFORE NEXT SHIFT
            </div>
            
            <p style="font-size: 13px; color: #7F1D1D; line-height: 1.5; margin: 0 0 10px 0;">
              <strong>1. Written Clarification:</strong> You must submit a written reply explaining the root cause of each identified SOP non-compliance before your next scheduled customer visit.
            </p>

            <p style="font-size: 13px; color: #7F1D1D; line-height: 1.5; margin: 0 0 10px 0;">
              <strong>2. Mandatory In-Person Kit Review:</strong> Present your equipment kit (torches, trial frame, near vision chart, standee, and uniform) to your Area Manager (<strong>${amName}</strong>) for physical inspection prior to departure.
            </p>

            <p style="font-size: 13px; color: #7F1D1D; line-height: 1.5; margin: 0;">
              <strong>3. Quality Escalation:</strong> Accumulating 2 or more strikes within a 7-day period triggers formal review and temporary route suspension under Lenskart DLC governance policy.
            </p>
          </div>

          <!-- Direct Link to Portal -->
          <div style="text-align: center; margin-top: 20px;">
            <a href="${portalLink}" target="_blank" style="display: inline-block; background-color: #0F172A; color: #FFFFFF; font-weight: 700; font-size: 13px; padding: 10px 24px; border-radius: 8px; text-decoration: none;">
              Open Locus Auditor Portal &rarr;
            </a>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px 24px; font-size: 11px; color: #94A3B8; text-align: center; line-height: 1.5;">
          <strong>Lenskart Solutions Pvt. Ltd. &bull; DLC Home Eye Test Quality & Governance Division</strong><br/>
          This is an official automated dispatch generated from photo audit records.
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * Generate plain text counterpart for the FE Fatal Warning Email
 */
export function buildFeFatalWarningEmailText({ feDigest, portalBaseUrl = 'https://locus-auditor.vercel.app' }) {
  const {
    feName,
    feCode,
    feEmail,
    amName,
    amEmail,
    rmName,
    rmEmail,
    hub,
    digestDate,
    totalAudited,
    passedCount,
    fatalCount,
    fatalTasks = []
  } = feDigest;

  const fatalDetails = fatalTasks.map((ft, i) => `
Incident #${i + 1} - Task ID: #${ft.taskId}
Checklist Violations:
${ft.failedReasons.map(r => `  - [FAIL] ${r}`).join('\n')}
Auditor Remarks: "${ft.remarks || 'None'}"
Review URL: ${ft.portalUrl}
`).join('\n----------------------------------------\n');

  return `[FORMAL WARNING] LENSKART DLC QUALITY AUDIT NON-COMPLIANCE NOTICE
Date: ${digestDate}
Field Executive: ${feName} (${feCode})
Hub: ${hub}
Direct Reporting AM: ${amName || 'Assigned Area Manager'}

TO: ${feEmail}

============================================================
DAY'S AUDIT SUMMARY:
============================================================
Total Visits Audited: ${totalAudited}
Visits Passed:        ${passedCount}
FATAL STRIKES:        ${fatalCount}

============================================================
FATAL OCCURRENCES DETAILS:
============================================================
${fatalDetails}

============================================================
MANDATORY ACTIONS REQUIRED:
============================================================
1. Submit written explanation for each non-compliance before your next shift.
2. Complete mandatory in-person kit inspection with your Area Manager (${amName}).
3. Re-read SOP guidelines for all failed checkpoints.

Lenskart Central Quality & Governance Division
Portal: ${portalBaseUrl}`;
}

// ====================================================================
// CONSOLIDATED TEAM QUALITY DIGEST FOR AREA MANAGERS (AM) & REGIONAL MANAGERS (RM)
// Consolidates all FEs with fatal strikes under their supervision into 1 single email
// ====================================================================

/**
 * Aggregates all FEs with fatal strikes grouped by Area Manager (AM) and Regional Manager (RM)
 * @param {object} params
 * @param {Array} params.feDigests Array of FE fatal digests from aggregateFeFatalDigests
 * @param {string|Date} params.targetDate Target date string or Date object
 * @returns {object} { ams: Array, rms: Array, allManagers: Array, totalAmCount: number, totalRmCount: number, targetDate: string }
 */
export function aggregateTeamFatalSummaries({ feDigests = [], targetDate = new Date() }) {
  const targetDateStr = normalizeDateToYMD(targetDate);
  const amMap = new Map();
  const rmMap = new Map();

  feDigests.forEach(fe => {
    // 1. Group by Area Manager (AM)
    const amKey = (fe.amEmail || '').toLowerCase().trim() || `am_${(fe.amName || 'unassigned').toLowerCase().replace(/\s+/g, '_')}`;
    if (!amMap.has(amKey)) {
      amMap.set(amKey, {
        id: `am_${amKey}`,
        role: 'AM',
        roleTitle: 'Area Manager',
        managerName: fe.amName || 'Area Manager',
        managerEmail: fe.amEmail || '',
        hub: fe.hub || 'Central Hub',
        rmName: fe.rmName || '',
        rmEmail: fe.rmEmail || '',
        targetDate: targetDateStr,
        fes: [],
        totalFatalStrikes: 0,
        totalTasksAudited: 0,
        totalPassed: 0
      });
    }
    const amEntry = amMap.get(amKey);
    amEntry.fes.push(fe);
    amEntry.totalFatalStrikes += (fe.fatalCount || 0);
    amEntry.totalTasksAudited += (fe.totalAudited || 0);
    amEntry.totalPassed += (fe.passedCount || 0);

    // 2. Group by Regional Manager (RM)
    const rmKey = (fe.rmEmail || '').toLowerCase().trim() || `rm_${(fe.rmName || 'unassigned').toLowerCase().replace(/\s+/g, '_')}`;
    if (!rmMap.has(rmKey)) {
      rmMap.set(rmKey, {
        id: `rm_${rmKey}`,
        role: 'RM',
        roleTitle: 'Regional Manager',
        managerName: fe.rmName || 'Regional Manager',
        managerEmail: fe.rmEmail || '',
        hub: fe.hub || 'Region',
        targetDate: targetDateStr,
        fes: [],
        totalFatalStrikes: 0,
        totalTasksAudited: 0,
        totalPassed: 0
      });
    }
    const rmEntry = rmMap.get(rmKey);
    rmEntry.fes.push(fe);
    rmEntry.totalFatalStrikes += (fe.fatalCount || 0);
    rmEntry.totalTasksAudited += (fe.totalAudited || 0);
    rmEntry.totalPassed += (fe.passedCount || 0);
  });

  const ams = Array.from(amMap.values()).sort((a, b) => b.totalFatalStrikes - a.totalFatalStrikes);
  const rms = Array.from(rmMap.values()).sort((a, b) => b.totalFatalStrikes - a.totalFatalStrikes);

  return {
    ams,
    rms,
    allManagers: [...ams, ...rms],
    totalAmCount: ams.length,
    totalRmCount: rms.length,
    targetDate: targetDateStr
  };
}

/**
 * Builds high-impact, professional consolidated HTML team digest email for AM or RM
 */
export function buildAmRmConsolidatedTeamDigestHtml({ managerSummary, portalBaseUrl = 'https://locus-auditor.vercel.app' }) {
  const {
    managerName,
    managerEmail,
    role,
    roleTitle,
    hub,
    targetDate,
    fes = [],
    totalFatalStrikes,
    totalTasksAudited,
    totalPassed
  } = managerSummary;

  const dateFormatted = new Date(targetDate).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const portalLink = portalBaseUrl.replace(/\/$/, '');

  const feCardsHtml = fes.map((fe, feIdx) => {
    const tasksHtml = (fe.fatalTasks || []).map((t, tIdx) => `
      <div style="background-color: #FEF2F2; border-left: 3px solid #DC2626; padding: 10px 12px; margin-bottom: 8px; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-family: monospace; font-size: 12px; font-weight: 700; color: #991B1B;">
            Incident #${tIdx + 1} &bull; Task ID #${t.taskId}
          </span>
          <a href="${t.portalUrl}" target="_blank" style="background-color: #DC2626; color: #FFFFFF; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 3px; text-decoration: none;">
            Inspect Photos &rarr;
          </a>
        </div>
        <ul style="margin: 0; padding-left: 16px; color: #B91C1C; font-size: 12px;">
          ${(t.failedReasons || []).map(r => `<li><strong>${r}</strong></li>`).join('')}
        </ul>
        ${t.remarks ? `
          <div style="margin-top: 6px; font-size: 11px; color: #78350F; background: #FFFBEB; padding: 4px 8px; border-radius: 4px;">
            Auditor note: "${t.remarks}"
          </div>
        ` : ''}
      </div>
    `).join('');

    return `
      <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #F1F5F9; padding-bottom: 10px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 15px; font-weight: 800; color: #0F172A;">
              ${feIdx + 1}. ${fe.feName} <span style="font-family: monospace; font-size: 12px; color: #64748B;">(${fe.feCode})</span>
            </div>
            <div style="font-size: 11px; color: #64748B; margin-top: 2px;">
              Email: ${fe.feEmail} &bull; Hub: ${fe.hub}
            </div>
          </div>
          <span style="background-color: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 12px;">
            ${fe.fatalCount} Fatal Strike${fe.fatalCount > 1 ? 's' : ''}
          </span>
        </div>
        <div>
          ${tasksHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Consolidated Team Quality Audit Digest - Lenskart DLC</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px; color: #1E293B; }
      </style>
    </head>
    <body style="background-color: #F1F5F9; padding: 20px 10px; margin: 0;">
      <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); color: #FFFFFF; padding: 24px;">
          <div style="display: inline-block; background-color: rgba(255,255,255,0.15); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            CONSOLIDATED TEAM QUALITY DIGEST &bull; ${roleTitle.toUpperCase()}
          </div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #FFFFFF;">
            Team Quality Audit Summary &bull; ${fes.length} FE${fes.length > 1 ? 's' : ''} Flagged
          </h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #E0E7FF;">
            ${roleTitle}: <strong>${managerName}</strong> &bull; ${hub} &bull; ${dateFormatted}
          </p>
        </div>

        <div style="padding: 24px;">
          
          <!-- Recipient info box -->
          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #475569;">
            <div><strong>Addressed TO (${roleTitle}):</strong> ${managerName} &lt;${managerEmail}&gt;</div>
            <div style="margin-top: 3px; font-size: 11px; color: #64748B;">This consolidated digest replaces individual FE notification CCs to protect your inbox.</div>
          </div>

          <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 16px 0;">
            Dear <strong>${managerName}</strong>,
            <br/>
            Central Quality Auditing has finalized all photo audits for visits completed on <strong>${dateFormatted}</strong>. Under your supervision, <strong>${fes.length} Field Executive${fes.length > 1 ? 's have' : ' has'}</strong> incurred <strong>${totalFatalStrikes} fatal non-compliance strike${totalFatalStrikes > 1 ? 's' : ''}</strong> today.
          </p>

          <!-- Metric Cards -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 24px;">
            <tr>
              <td style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px; text-align: center; width: 33%;">
                <div style="font-size: 11px; color: #991B1B; font-weight: 700;">Flagged FEs</div>
                <div style="font-size: 24px; font-weight: 900; color: #DC2626; margin-top: 2px;">${fes.length}</div>
              </td>
              <td style="background-color: #FFF1F2; border: 1px solid #FDA4AF; border-radius: 8px; padding: 12px; text-align: center; width: 33%;">
                <div style="font-size: 11px; color: #9F1239; font-weight: 700;">Total Strikes</div>
                <div style="font-size: 24px; font-weight: 900; color: #E11D48; margin-top: 2px;">${totalFatalStrikes}</div>
              </td>
              <td style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px; text-align: center; width: 33%;">
                <div style="font-size: 11px; color: #166534; font-weight: 700;">Team Audits Passed</div>
                <div style="font-size: 24px; font-weight: 900; color: #16A34A; margin-top: 2px;">${totalPassed}</div>
              </td>
            </tr>
          </table>

          <!-- Breakdown per FE -->
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 13px; font-weight: 800; text-transform: uppercase; color: #0F172A; letter-spacing: 0.5px; margin: 0 0 12px 0;">
              Field Executive Breakdown &amp; Incidents:
            </h3>
            ${feCardsHtml}
          </div>

          <!-- Mandatory Manager Action Box -->
          <div style="background-color: #FEF2F2; border: 2px solid #DC2626; border-radius: 10px; padding: 18px; margin-bottom: 24px;">
            <div style="font-size: 14px; font-weight: 800; color: #991B1B; margin-bottom: 8px;">
              &#9888; MANDATORY ${roleTitle.toUpperCase()} SUPERVISORY ACTIONS
            </div>
            <ol style="margin: 0; padding-left: 18px; color: #7F1D1D; font-size: 13px; line-height: 1.6;">
              <li style="margin-bottom: 6px;">
                <strong>Morning Kit &amp; Standee Inspection:</strong> Physically inspect the diagnostic equipment (torches, trial lenses, near vision chart, standee, and uniform) for all flagged FEs before shift departure.
              </li>
              <li style="margin-bottom: 6px;">
                <strong>Collect Written Explanations:</strong> Ensure each flagged FE has submitted their root cause clarification.
              </li>
              <li>
                <strong>Escalate Repeat Strikes:</strong> FEs with 2 or more strikes within 7 days must be reviewed for temporary route suspension.
              </li>
            </ol>
          </div>

          <!-- CTA to Portal -->
          <div style="text-align: center; margin-top: 20px;">
            <a href="${portalLink}/manager" target="_blank" style="display: inline-block; background-color: #0F172A; color: #FFFFFF; font-weight: 700; font-size: 13px; padding: 10px 24px; border-radius: 8px; text-decoration: none;">
              Open Cluster Manager Portal &rarr;
            </a>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px 24px; font-size: 11px; color: #94A3B8; text-align: center;">
          <strong>Lenskart Solutions Pvt. Ltd. &bull; DLC Home Eye Test Quality &amp; Governance Division</strong><br/>
          Automated corporate team digest dispatched strictly via Central Mail Dispatch.
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * Builds plain text counterpart for the consolidated team digest email
 */
export function buildAmRmConsolidatedTeamDigestText({ managerSummary, portalBaseUrl = 'https://locus-auditor.vercel.app' }) {
  const {
    managerName,
    managerEmail,
    roleTitle,
    hub,
    targetDate,
    fes = [],
    totalFatalStrikes,
    totalPassed
  } = managerSummary;

  const feListText = fes.map((fe, i) => `
${i + 1}. ${fe.feName} (${fe.feCode}) - ${fe.fatalCount} Fatal Strike(s)
   Email: ${fe.feEmail} | Hub: ${fe.hub}
   Incidents:
${(fe.fatalTasks || []).map(t => `   - Task #${t.taskId}: ${t.failedReasons.join(', ')} (Review: ${t.portalUrl})`).join('\n')}
`).join('\n----------------------------------------\n');

  return `LENSKART DLC & HTO - CONSOLIDATED TEAM QUALITY AUDIT DIGEST
Date: ${targetDate}
${roleTitle}: ${managerName} (${managerEmail})
Hub/Region: ${hub}

============================================================
TEAM QUALITY SUMMARY:
============================================================
Flagged FEs with Strikes: ${fes.length}
Total Fatal Strikes:     ${totalFatalStrikes}
Visits Passed:           ${totalPassed}

============================================================
FLAGGED FIELD EXECUTIVES BREAKDOWN:
============================================================
${feListText}

============================================================
MANDATORY SUPERVISORY ACTIONS:
============================================================
1. Physically inspect diagnostic kit & standee for each flagged FE before morning dispatch.
2. Confirm each FE has provided root cause clarification.
3. Review 7-day strike threshold for repeat non-compliance.

Cluster Manager Portal: ${portalBaseUrl}/manager
Lenskart Central Quality & Governance Division`;
}

// ====================================================================
// GENERAL EXECUTIVE SUMMARY FOR GM, BH & SUPERADMIN
// High-level macro overview across all hubs, SOP failure Pareto, and FEs with strikes
// ====================================================================

/**
 * Aggregate complete day's audit snapshot for executive leadership (GM & BH)
 */
/**
 * Helper to resolve the supervisory Area Manager (AM) for a given task
 */
export function resolveAmForTask(t, users = []) {
  const tCode = String(t.feCode || t.fe_code || t.feId || '').trim().toLowerCase();
  const tEmail = String(t.feEmail || t.fe_email || '').trim().toLowerCase();
  const tName = String(t.feName || t.fe_name || '').trim().toLowerCase();

  const feUser = users.find(u => {
    if (!u) return false;
    const uCode = String(u.employee_code || u.person_id || '').trim().toLowerCase();
    const uEmail = String(u.email || '').trim().toLowerCase();
    const uName = String(u.full_name || u.name || '').trim().toLowerCase();

    if (tCode && (uCode === tCode || uEmail.startsWith(tCode) || uEmail.includes(tCode) || uName.includes(tCode))) {
      return true;
    }
    if (tEmail && uEmail && tEmail === uEmail) return true;
    if (tName && tName.length >= 3 && (uName === tName || uName.includes(tName) || tName.includes(uName))) {
      return true;
    }
    return false;
  });

  let amName = feUser?.reporting_manager_name || t.amName || t.reporting_manager_name;
  let amEmail = feUser?.reporting_manager_email || t.amEmail || t.reporting_manager_email;

  if (!amEmail && amName) {
    const target = String(amName).trim().toLowerCase();
    const amObj = users.find(u => {
      const uName = String(u.full_name || u.name || '').trim().toLowerCase();
      return (uName === target || uName.includes(target) || target.includes(uName)) && u.email;
    });
    if (amObj) amEmail = amObj.email;
  }

  if ((!amEmail || !amName) && feUser?.reporting_manager_id) {
    const amObj = users.find(u => String(u.id) === String(feUser.reporting_manager_id));
    if (amObj) {
      if (!amEmail) amEmail = amObj.email;
      if (!amName) amName = amObj.full_name || amObj.name;
    }
  }

  // Fallback to City Admin or unassigned
  if (!amName) {
    const city = String(t.city || t.facilityCode || t.facility_code || '').trim();
    if (city) {
      const cityAdmin = users.find(u => {
        const roles = Array.isArray(u.roles) ? u.roles : [u.role];
        const isMgr = roles.some(r => {
          const norm = String(r || '').toLowerCase();
          return norm.includes('am') || norm.includes('area manager') || norm.includes('city admin');
        });
        const uCity = String(u.facility_code || u.city || '').toLowerCase();
        return isMgr && uCity === city.toLowerCase() && u.email;
      });
      if (cityAdmin) {
        amName = cityAdmin.full_name || cityAdmin.name;
        amEmail = cityAdmin.email;
      }
    }
  }

  return {
    amName: amName || 'Central Operations',
    amEmail: amEmail || '',
    city: String(t.city || t.facilityCode || t.facility_code || feUser?.city || 'Central Zone').trim()
  };
}

/**
 * Extract the authoritative operations Zone from a task record.
 * Prioritizes the tasks table's zone column (t.zone) to accurately group all tasks by zone.
 */
export function extractTaskZone(t) {
  if (!t) return 'Central Zone';
  const rawZone = String(
    t.zone || 
    t.Zone || 
    t.zone_name || 
    t.hub_zone || 
    t.facility_zone || 
    ''
  ).trim();

  if (rawZone && 
      rawZone.toLowerCase() !== 'unknown' && 
      rawZone.toLowerCase() !== 'unknown zone' &&
      rawZone.toLowerCase() !== 'null' &&
      rawZone.toLowerCase() !== 'undefined') {
    return rawZone;
  }

  // Fallback to city or facility code only if zone column is unpopulated
  const rawCity = String(t.city || t.teamName || t.facilityCode || t.facility_code || '').trim();
  if (rawCity && 
      rawCity.toLowerCase() !== 'unknown' && 
      rawCity.toLowerCase() !== 'unknown zone' &&
      rawCity.toLowerCase() !== 'null' &&
      rawCity.toLowerCase() !== 'undefined') {
    return rawCity;
  }

  return 'Central Operations Zone';
}

/**
 * Aggregate complete day's audit snapshot for executive leadership (GM & BH)
 * Optimized for high-level governance: Macro Overview, Zone Scorecard, AM Supervisory Performance, Top SOP Pareto.
 * (Tasks are grouped strictly by the tasks table's zone section)
 */
export function aggregateGmBhExecutiveSummary({
  tasks = [],
  users = [],
  targetDate = new Date(),
  portalBaseUrl = 'https://locus-auditor.vercel.app'
}) {
  const targetDateStr = normalizeDateToYMD(targetDate);

  // 1. Identify tasks audited on target date (or tasks dispatched on target date)
  let auditedToday = (tasks || []).filter(t => {
    const dStr = getTaskAuditDateYMD(t);
    const status = t.auditStatus || t.audit_status;
    const isAudited = status === 'PASSED' || status === 'FATAL';
    return isAudited && dStr === targetDateStr;
  });

  // If strict date filter yields 0 (e.g. initial demo/test run), fallback to all audited tasks currently in system
  if (auditedToday.length === 0) {
    auditedToday = (tasks || []).filter(t => {
      const status = t.auditStatus || t.audit_status;
      return status === 'PASSED' || status === 'FATAL';
    });
  }

  const totalAudited = auditedToday.length;
  const passedTasks = auditedToday.filter(t => (t.auditStatus || t.audit_status) === 'PASSED');
  const fatalTasks = auditedToday.filter(t => (t.auditStatus || t.audit_status) === 'FATAL');
  const totalPassed = passedTasks.length;
  const totalFatal = fatalTasks.length;
  const passRate = totalAudited > 0 ? Math.round((totalPassed / totalAudited) * 100) : 100;
  const fatalRate = totalAudited > 0 ? Math.round((totalFatal / totalAudited) * 100) : 0;

  // 2. Zone Performance Scorecard (Grouped strictly by the tasks table's zone section)
  const zoneMap = new Map();
  auditedToday.forEach(t => {
    const rawZone = extractTaskZone(t);
    const zoneKey = rawZone.toUpperCase();
    if (!zoneMap.has(zoneKey)) {
      zoneMap.set(zoneKey, { zone: rawZone, audited: 0, passed: 0, fatal: 0 });
    }
    const entry = zoneMap.get(zoneKey);
    entry.audited++;
    if ((t.auditStatus || t.audit_status) === 'FATAL') entry.fatal++;
    else entry.passed++;
  });

  const zoneBreakdown = Array.from(zoneMap.values()).map(z => ({
    ...z,
    passRate: z.audited > 0 ? Math.round((z.passed / z.audited) * 100) : 100
  })).sort((a, b) => b.fatal - a.fatal || b.audited - a.audited);

  // 3. Area Manager (AM) Supervisory Breakdown (Replaces FE-level fatal details)
  const amMap = new Map();
  auditedToday.forEach(t => {
    const amInfo = resolveAmForTask(t, users);
    const amKey = (amInfo.amEmail || amInfo.amName || 'unassigned').toLowerCase().trim();
    const isFatal = (t.auditStatus || t.audit_status) === 'FATAL';
    const feIdentifier = String(t.feCode || t.fe_code || t.feId || t.feName || 'unknown').trim().toLowerCase();
    const taskZone = extractTaskZone(t);

    if (!amMap.has(amKey)) {
      amMap.set(amKey, {
        amName: amInfo.amName,
        amEmail: amInfo.amEmail,
        zones: new Set(),
        audited: 0,
        passed: 0,
        fatal: 0,
        fatalFEs: new Set()
      });
    }

    const entry = amMap.get(amKey);
    entry.audited++;
    if (taskZone) entry.zones.add(taskZone);
    if (isFatal) {
      entry.fatal++;
      entry.fatalFEs.add(feIdentifier);
    } else {
      entry.passed++;
    }
  });

  const amBreakdown = Array.from(amMap.values()).map(m => ({
    amName: m.amName,
    amEmail: m.amEmail,
    zoneList: Array.from(m.zones).join(', ') || 'Central Zone',
    cityList: Array.from(m.zones).join(', ') || 'Central Zone',
    audited: m.audited,
    passed: m.passed,
    fatal: m.fatal,
    passRate: m.audited > 0 ? Math.round((m.passed / m.audited) * 100) : 100,
    fatalFEsCount: m.fatalFEs.size
  })).sort((a, b) => b.fatal - a.fatal || b.audited - a.audited);

  // 4. Pareto of SOP Non-Compliance Reasons
  const reasonMap = new Map();
  fatalTasks.forEach(t => {
    const reasons = Array.isArray(t.failedReasons) ? t.failedReasons : (t.failed_reasons || []);
    reasons.forEach(r => {
      if (!r) return;
      const count = reasonMap.get(r) || 0;
      reasonMap.set(r, count + 1);
    });
  });

  const topFailureReasons = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percent: totalFatal > 0 ? Math.round((count / totalFatal) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  return {
    digestDate: targetDateStr,
    totalAudited,
    totalPassed,
    totalFatal,
    passRate,
    fatalRate,
    zoneBreakdown,
    cityBreakdown: zoneBreakdown.map(z => ({ ...z, city: z.zone })),
    amBreakdown,
    topFailureReasons,
    portalBaseUrl,
    // Backwards-compatibility aliases
    hubBreakdown: zoneBreakdown.map(z => ({ hub: z.zone, ...z })),
    feFatalList: []
  };
}

/**
 * Generate responsive, executive HTML email for GM, BH, and SuperAdmin
 * Clean, lightweight, high-level governance briefing with City/Zone & AM Scorecards.
 */
export function buildGmBhExecutiveSummaryHtml({ summaryData, portalBaseUrl = 'https://locus-auditor.vercel.app' }) {
  const {
    digestDate,
    totalAudited,
    totalPassed,
    totalFatal,
    passRate,
    fatalRate,
    zoneBreakdown = [],
    cityBreakdown = [],
    amBreakdown = [],
    topFailureReasons = []
  } = summaryData;

  const effectiveZones = (zoneBreakdown && zoneBreakdown.length > 0) ? zoneBreakdown : cityBreakdown;

  const rulesUrl = `${portalBaseUrl}/rules`;
  const auditsUrl = `${portalBaseUrl}/audits`;

  // Zone Performance Scorecard Rows
  const zoneRowsHtml = effectiveZones.length > 0 ? effectiveZones.map(z => {
    const zoneName = z.zone || z.city || 'Central Zone';
    const statusColor = z.fatal > 0 ? '#DC2626' : '#16A34A';
    const statusBg = z.fatal > 0 ? '#FEF2F2' : '#F0FDF4';
    return `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 14px; font-weight: 700; color: #0F172A; font-size: 13px;">${zoneName}</td>
        <td style="padding: 10px 14px; text-align: center; color: #334155; font-size: 13px;">${z.audited}</td>
        <td style="padding: 10px 14px; text-align: center; color: #16A34A; font-weight: 700; font-size: 13px;">${z.passed}</td>
        <td style="padding: 10px 14px; text-align: center; color: ${z.fatal > 0 ? '#DC2626' : '#94A3B8'}; font-weight: 700; font-size: 13px;">${z.fatal}</td>
        <td style="padding: 10px 14px; text-align: right;">
          <span style="display: inline-block; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; background-color: ${statusBg}; color: ${statusColor};">
            ${z.passRate}% Pass
          </span>
        </td>
      </tr>
    `;
  }).join('') : `
    <tr><td colspan="5" style="padding: 16px; text-align: center; color: #94A3B8;">No zone activity recorded today.</td></tr>
  `;

  // Area Manager (AM) Supervisory Rows
  const amRowsHtml = amBreakdown.length > 0 ? amBreakdown.map(m => {
    const statusColor = m.fatal > 0 ? '#DC2626' : '#16A34A';
    const statusBg = m.fatal > 0 ? '#FEF2F2' : '#F0FDF4';
    return `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 14px; font-size: 12px;">
          <strong style="color: #0F172A; font-size: 13px;">${m.amName}</strong>
          ${m.amEmail ? `<br/><span style="color: #64748B; font-size: 11px;">${m.amEmail}</span>` : ''}
        </td>
        <td style="padding: 10px 14px; font-size: 12px; color: #475569; font-weight: 600;">${m.zoneList || m.cityList}</td>
        <td style="padding: 10px 14px; text-align: center; font-size: 13px; color: #334155;">${m.audited}</td>
        <td style="padding: 10px 14px; text-align: center; font-size: 13px; font-weight: 800; color: ${m.fatal > 0 ? '#DC2626' : '#94A3B8'};">
          ${m.fatal}
        </td>
        <td style="padding: 10px 14px; text-align: center;">
          <span style="display: inline-block; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; background-color: ${statusBg}; color: ${statusColor};">
            ${m.passRate}%
          </span>
        </td>
        <td style="padding: 10px 14px; text-align: center; font-size: 12px; color: ${m.fatalFEsCount > 0 ? '#DC2626' : '#64748B'}; font-weight: ${m.fatalFEsCount > 0 ? '700' : '400'};">
          ${m.fatalFEsCount > 0 ? `${m.fatalFEsCount} FE${m.fatalFEsCount > 1 ? 's' : ''}` : '&mdash;'}
        </td>
      </tr>
    `;
  }).join('') : `
    <tr><td colspan="6" style="padding: 16px; text-align: center; color: #94A3B8;">No manager data available.</td></tr>
  `;

  // Top failure reasons rows
  const failureRowsHtml = topFailureReasons.length > 0 ? topFailureReasons.slice(0, 5).map((r, i) => `
    <tr style="border-bottom: 1px solid #F1F5F9;">
      <td style="padding: 8px 12px; font-size: 12px; font-weight: 700; color: #DC2626; width: 28px;">#${i + 1}</td>
      <td style="padding: 8px 12px; font-size: 12px; color: #1E293B; font-weight: 600;">${r.reason}</td>
      <td style="padding: 8px 12px; font-size: 12px; text-align: right; color: #DC2626; font-weight: 700;">${r.count} strike${r.count > 1 ? 's' : ''} (${r.percent}%)</td>
    </tr>
  `).join('') : `
    <tr><td colspan="3" style="padding: 12px; text-align: center; color: #16A34A; font-size: 12px; font-weight: 600;">Clean record: Zero SOP fatal failures recorded today!</td></tr>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Lenskart DLC Executive Quality Overview</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0F172A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
      
      <!-- Container -->
      <div style="max-width: 680px; margin: 24px auto; background-color: #FFFFFF; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4); border: 1px solid #E2E8F0;">
        
        <!-- Executive Header -->
        <div style="background: linear-gradient(135deg, #0A1128 0%, #1C2541 50%, #0F172A 100%); padding: 32px 28px; text-align: left; border-bottom: 3px solid #38BDF8;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td>
                <span style="display: inline-block; background-color: rgba(56, 189, 248, 0.15); color: #38BDF8; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">
                  EXECUTIVE BRIEFING &bull; GM &amp; BH QUALITY OVERVIEW
                </span>
                <h1 style="color: #FFFFFF; font-size: 24px; font-weight: 900; margin: 12px 0 4px 0; letter-spacing: -0.5px;">
                  Lenskart Home Try-On (HTO) Quality Snapshot
                </h1>
                <p style="color: #94A3B8; font-size: 13px; margin: 0;">
                  National Operations Quality Performance for <strong style="color: #F8FAFC;">${digestDate}</strong>
                </p>
              </td>
            </tr>
          </table>
        </div>

        <!-- High-Impact KPI Row -->
        <div style="background-color: #F8FAFC; padding: 20px 24px; border-bottom: 1px solid #E2E8F0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <!-- Audited -->
              <td style="width: 25%; padding: 8px; text-align: center;">
                <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  <div style="font-size: 11px; color: #64748B; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Audited</div>
                  <div style="font-size: 26px; font-weight: 900; color: #0F172A; margin-top: 4px;">${totalAudited}</div>
                  <div style="font-size: 10px; color: #94A3B8; margin-top: 2px;">Visits Reviewed</div>
                </div>
              </td>
              <!-- Pass Rate -->
              <td style="width: 25%; padding: 8px; text-align: center;">
                <div style="background: #FFFFFF; border: 1px solid #BBF7D0; border-radius: 10px; padding: 14px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  <div style="font-size: 11px; color: #16A34A; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Pass Rate</div>
                  <div style="font-size: 26px; font-weight: 900; color: #16A34A; margin-top: 4px;">${passRate}%</div>
                  <div style="font-size: 10px; color: #16A34A; margin-top: 2px;">${totalPassed} Passed</div>
                </div>
              </td>
              <!-- Fatal Strikes -->
              <td style="width: 25%; padding: 8px; text-align: center;">
                <div style="background: #FFFFFF; border: 1px solid ${totalFatal > 0 ? '#FECACA' : '#E2E8F0'}; border-radius: 10px; padding: 14px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  <div style="font-size: 11px; color: #DC2626; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Fatal Strikes</div>
                  <div style="font-size: 26px; font-weight: 900; color: #DC2626; margin-top: 4px;">${totalFatal}</div>
                  <div style="font-size: 10px; color: #DC2626; margin-top: 2px;">SOP Violations</div>
                </div>
              </td>
              <!-- Fatal Rate -->
              <td style="width: 25%; padding: 8px; text-align: center;">
                <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  <div style="font-size: 11px; color: #64748B; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Fatal Rate</div>
                  <div style="font-size: 26px; font-weight: 900; color: ${fatalRate > 10 ? '#DC2626' : '#0F172A'}; margin-top: 4px;">${fatalRate}%</div>
                  <div style="font-size: 10px; color: #94A3B8; margin-top: 2px;">National Benchmark</div>
                </div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Main Body -->
        <div style="padding: 24px;">

          <!-- SECTION 1: Zone Quality Performance Scorecard -->
          <h2 style="font-size: 14px; font-weight: 800; color: #0F172A; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Zone Quality Performance Scorecard
          </h2>
          <table style="width: 100%; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
            <thead>
              <tr style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                <th style="padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Zone</th>
                <th style="padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Audited</th>
                <th style="padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 800; color: #16A34A; text-transform: uppercase;">Passed</th>
                <th style="padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 800; color: #DC2626; text-transform: uppercase;">Fatal</th>
                <th style="padding: 10px 14px; text-align: right; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              ${zoneRowsHtml}
            </tbody>
          </table>

          <!-- SECTION 2: Area Manager (AM) Supervisory Scorecard -->
          <h2 style="font-size: 14px; font-weight: 800; color: #0F172A; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Area Manager (AM) Supervisory Governance
          </h2>
          <table style="width: 100%; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
            <thead>
              <tr style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                <th style="padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Area Manager</th>
                <th style="padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Supervised Zone(s)</th>
                <th style="padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Audited</th>
                <th style="padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 800; color: #DC2626; text-transform: uppercase;">Fatals</th>
                <th style="padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Pass %</th>
                <th style="padding: 10px 14px; text-align: center; font-size: 11px; font-weight: 800; color: #DC2626; text-transform: uppercase;">Affected FEs</th>
              </tr>
            </thead>
            <tbody>
              ${amRowsHtml}
            </tbody>
          </table>

          <!-- SECTION 3: Top SOP Non-Compliance Criteria Pareto -->
          <h2 style="font-size: 14px; font-weight: 800; color: #0F172A; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Top SOP Non-Compliance Criteria Pareto
          </h2>
          <table style="width: 100%; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
            <tbody>
              ${failureRowsHtml}
            </tbody>
          </table>

          <!-- SECTION 4: Executive Action Buttons -->
          <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); border-radius: 10px; padding: 22px 24px; text-align: center; margin-top: 12px;">
            <p style="color: #F8FAFC; font-size: 13px; font-weight: 600; margin: 0 0 14px 0;">
              Calibrate audit rules, review disputes, or inspect quality queues:
            </p>
            <div style="display: inline-block;">
              <a href="${rulesUrl}" target="_blank" style="display: inline-block; background-color: #38BDF8; color: #0F172A; font-weight: 800; font-size: 12px; padding: 10px 18px; border-radius: 6px; text-decoration: none; margin-right: 8px;">
                Open GM &amp; BH Rules Studio &rarr;
              </a>
              <a href="${auditsUrl}" target="_blank" style="display: inline-block; background-color: #334155; color: #F8FAFC; font-weight: 700; font-size: 12px; padding: 10px 18px; border-radius: 6px; text-decoration: none;">
                View Live Audit Queue &rarr;
              </a>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 24px; font-size: 11px; color: #94A3B8; text-align: center; line-height: 1.6;">
          <strong>Lenskart Solutions Pvt. Ltd. &bull; Central Quality Operations &amp; Governance</strong><br/>
          Confidential leadership briefing for General Managers (GM), Business Heads (BH), and SuperAdmins.<br/>
          Automated Daily Executive Dispatch Engine &bull; Dispatched via Brevo Mail Gateway
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * Plain text fallback for GM & BH Executive Summary
 */
export function buildGmBhExecutiveSummaryText({ summaryData, portalBaseUrl = 'https://locus-auditor.vercel.app' }) {
  const {
    digestDate,
    totalAudited,
    totalPassed,
    totalFatal,
    passRate,
    fatalRate,
    zoneBreakdown = [],
    cityBreakdown = [],
    amBreakdown = [],
    topFailureReasons = []
  } = summaryData;

  const effectiveZones = (zoneBreakdown && zoneBreakdown.length > 0) ? zoneBreakdown : cityBreakdown;

  const zoneText = effectiveZones.map(z => 
    `- ${z.zone || z.city}: Audited: ${z.audited} | Passed: ${z.passed} | Fatal: ${z.fatal} | Pass Rate: ${z.passRate}%`
  ).join('\n');

  const amText = amBreakdown.map(m =>
    `- ${m.amName} (${m.zoneList || m.cityList}): Audited: ${m.audited} | Passed: ${m.passed} | Fatal: ${m.fatal} | Pass Rate: ${m.passRate}% | Affected FEs: ${m.fatalFEsCount}`
  ).join('\n');

  const failureText = topFailureReasons.map((r, i) =>
    `#${i + 1} ${r.reason}: ${r.count} strike(s) (${r.percent}%)`
  ).join('\n');

  return `LENSKART DLC & HTO - EXECUTIVE QUALITY AUDIT BRIEFING
Date: ${digestDate}
Confidential Leadership Report for GM, BH & SuperAdmin

============================================================
EXECUTIVE KPI SUMMARY:
============================================================
Total Visits Audited: ${totalAudited}
Visits Passed:        ${totalPassed}
Overall Pass Rate:    ${passRate}%
Fatal Strikes:        ${totalFatal}
Fatal Incident Rate:  ${fatalRate}%

============================================================
ZONE QUALITY PERFORMANCE SCORECARD:
============================================================
${zoneText || 'No zone activity recorded today.'}

============================================================
AREA MANAGER (AM) SUPERVISORY GOVERNANCE:
============================================================
${amText || 'No manager activity recorded today.'}

============================================================
TOP SOP NON-COMPLIANCE PARETO:
============================================================
${failureText || 'Zero fatal failures recorded.'}

Quality Rules Studio: ${portalBaseUrl}/rules
Central Audits Console: ${portalBaseUrl}/audits

Lenskart Central Quality & Governance Division`;
}

