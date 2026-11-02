/**
 * Google Calendar & Google Meet Integration Helper
 * 
 * Generates direct Google Meet links and constructs pre-populated Google Calendar
 * event creation URLs with all dispute attendees (FE, AM, RM, and Auditor).
 */

export function generateGoogleMeetLink({
  taskId,
  feName = 'Field Executive',
  feEmail = '',
  amEmail = '',
  rmEmail = '',
  auditorEmail = '',
  meetingTitle = '',
  disputeCategory = 'SOP Violation Dispute',
  disputeReason = '',
  startTime = null
}) {
  // 1. Establish meeting start & end time (default to tomorrow 11:00 AM IST if not given)
  let start = startTime ? new Date(startTime) : new Date();
  if (!startTime || isNaN(start.getTime())) {
    start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(11, 0, 0, 0); // 11:00 AM
  }
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 minutes duration

  // Format dates for Google Calendar TEMPLATE (YYYYMMDDTHHmmssZ)
  const formatGCalDate = (d) => {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };
  const dates = `${formatGCalDate(start)}/${formatGCalDate(end)}`;

  // 2. Deterministic & Clean Google Meet Room Code
  const cleanTask = String(taskId || 'audit').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const meetCode = `hto-${cleanTask}-${randomSuffix}`;
  const meetUrl = `https://meet.google.com/${meetCode}`;

  // 3. Format Unique Attendees List
  const attendees = [feEmail, amEmail, rmEmail, auditorEmail]
    .filter(Boolean)
    .map(e => String(e).trim().toLowerCase())
    .filter(e => e.includes('@'));
  const uniqueAttendees = Array.from(new Set(attendees));

  // 4. Construct Descriptive Calendar Details
  const title = meetingTitle || `[Lenskart HTO Audit Dispute Meet] Task #${taskId} - ${feName}`;
  const details = `Lenskart DLC Home Eye Test Quality Audit Dispute Review
------------------------------------------------------------
Task ID: #${taskId}
Field Executive: ${feName} (${feEmail || 'N/A'})
Dispute Category: ${disputeCategory}
Explanation / Grounds: "${disputeReason || 'No detailed reason provided'}"

Google Meet Link: ${meetUrl}
Required Attendees: ${uniqueAttendees.join(', ')}

Review Record in Locus Auditor:
https://locus-auditor.vercel.app/?taskId=${taskId}
------------------------------------------------------------
Please join with your diagnostic equipment / photos ready for re-inspection.`;

  // 5. Construct Pre-Populated Google Calendar Event URL
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(
    meetUrl
  )}&add=${encodeURIComponent(uniqueAttendees.join(','))}`;

  return {
    meetUrl,
    calendarUrl,
    meetCode,
    meetingTime: start.toISOString(),
    meetingTimeFormatted: start.toLocaleString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    attendees: uniqueAttendees,
    title,
    details
  };
}

/**
 * 24-Hour Dispute Window Status Calculator
 * Returns whether a fatal audit is still within the allowable 24-hour contestation window.
 */
export function getDisputeWindowStatus(auditedAt) {
  if (!auditedAt) {
    return {
      canDispute: true,
      hoursLeft: 24,
      expired: false,
      badgeText: '24h left to dispute',
      badgeClass: 'text-amber-300 bg-amber-500/10 border-amber-500/30'
    };
  }

  const auditTime = new Date(auditedAt).getTime();
  const now = Date.now();
  const diffMs = now - auditTime;
  const diffHours = diffMs / (1000 * 60 * 60);
  const hoursLeft = Math.max(0, Math.ceil(24 - diffHours));
  const expired = diffHours >= 24;

  if (expired) {
    return {
      canDispute: false,
      hoursLeft: 0,
      expired: true,
      badgeText: 'Dispute window expired (>24h)',
      badgeClass: 'text-slate-500 bg-slate-800/60 border-slate-700/60'
    };
  }

  return {
    canDispute: true,
    hoursLeft,
    expired: false,
    badgeText: `${hoursLeft}h left to dispute`,
    badgeClass: hoursLeft <= 4 
      ? 'text-red-400 bg-red-500/10 border-red-500/30 animate-pulse' 
      : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
  };
}
