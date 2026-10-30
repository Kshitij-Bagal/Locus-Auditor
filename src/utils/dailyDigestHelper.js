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
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      return dateInput.trim();
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

// Helper: Parse task audit date
export function getTaskAuditDateYMD(task) {
  if (!task) return '';
  const dateField = task.auditedAt || task.audited_at || task.dispatchDate || task.dispatch_date;
  if (!dateField) return '';
  return normalizeDateToYMD(dateField);
}

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
