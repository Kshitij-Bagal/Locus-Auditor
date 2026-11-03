import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

// In local development behind corporate firewalls/proxies (e.g. Lenskart network), permit TLS negotiation
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import { 
  normalizeDateToYMD, 
  getTaskBatchDateYMD,
  aggregateFeFatalDigests, 
  buildFeFatalWarningEmailHtml, 
  buildFeFatalWarningEmailText,
  aggregateGmBhExecutiveSummary,
  buildGmBhExecutiveSummaryHtml,
  buildGmBhExecutiveSummaryText
} from '../../src/utils/dailyDigestHelper.js';

/**
 * Universal FE Fatal-Only Aggregated Warning Email Cron Endpoint
 * Compatible with Vercel Cron Jobs (/api/cron/daily-fe-fatal-digest) and Vite Dev Server.
 * 
 * Logic:
 * 1. Aggregates all audited tasks for target date grouped by Field Executive (FE).
 * 2. Strictly filters for FEs with >= 1 Fatal strike (0 fatals = NO email sent).
 * 3. Resolves direct Area Manager (AM) and Regional Manager (RM) for each FE.
 * 4. Dispatches 1 consolidated warning email to FE, CC'ing AM & RM.
 * 5. Updates Supabase tasks to mark email_notified = true.
 */
export async function dailyFeFatalDigestCronHandler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-cron-secret'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    // 1. Authorization Check (CRON_SECRET or Internal App Request)
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers['authorization'] || '';
    const customHeader = req.headers['x-cron-secret'] || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const isAuthorized = !cronSecret || bearerToken === cronSecret || customHeader === cronSecret || req.headers['x-requested-by'] === 'locus-portal';

    if (!isAuthorized) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing CRON_SECRET header.' }));
      return;
    }

    // Parse URL query and body
    let query = {};
    if (req.url && req.url.includes('?')) {
      const qs = req.url.split('?')[1];
      query = Object.fromEntries(new URLSearchParams(qs));
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    } else if (!body && req.method === 'POST') {
      body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
        });
      });
    }
    body = body || {};

    let requestedDate = query.date || body.date;
    const force = query.force === 'true' || body.force === true;
    const feCodeTarget = query.feCode || body.feCode;
    const dryRun = query.dryRun === 'true' || body.dryRun === true;
    const portalBaseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || 'https://locus-auditor.vercel.app';

    // 2. Initialize Supabase Client
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://qaxzlidehuekecsrztsy.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFheHpsaWRlaHVla2Vjc3J6dHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxODM5NTksImV4cCI6MjEwODc1OTk1OX0.zTFzRDWehSATI78_I38zNZ85jWtBQsbv0LGXvgRptoo';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Load Tasks & Users
    let tasks = body.tasks;
    let users = body.users;

    if (!tasks || tasks.length === 0) {
      const { data: dbTasks, error: taskErr } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (!taskErr && dbTasks) tasks = dbTasks;
      else tasks = [];
    }

    if (!users || users.length === 0) {
      const { data: dbProfiles, error: profErr } = await supabase
        .from('profiles')
        .select('*');
      if (!profErr && dbProfiles) users = dbProfiles;
      else users = [];
    }

    // Determine target upload date batch:
    // If not explicitly provided in request, resolve to latest upload date with pending fatals or today
    let targetDate = requestedDate;
    if (!targetDate && tasks.length > 0) {
      const pendingTask = tasks.find(t => (t.audit_status === 'FATAL' || t.auditStatus === 'FATAL') && !t.email_sent);
      if (pendingTask) {
        targetDate = getTaskBatchDateYMD(pendingTask);
      }
    }
    if (!targetDate) {
      targetDate = normalizeDateToYMD(new Date());
    }

    // 4. Aggregate FE-level fatal digests
    // strictly filters for FEs with fatalCount >= 1!
    let feDigests = aggregateFeFatalDigests({
      tasks,
      users,
      targetDate,
      portalBaseUrl
    });

    // Targeted Single FE filter
    if (feCodeTarget) {
      const target = String(feCodeTarget).trim().toLowerCase();
      feDigests = feDigests.filter(f => {
        const c = String(f.feCode || '').trim().toLowerCase();
        const em = String(f.feEmail || '').trim().toLowerCase();
        const k = String(f.feKey || '').trim().toLowerCase();
        const nm = String(f.feName || '').trim().toLowerCase();
        return (c && (c === target || c.includes(target) || target.includes(c))) ||
               (em && (em === target || em.includes(target))) ||
               (k && (k === target || k.includes(target))) ||
               (nm && target.length >= 3 && nm.includes(target));
      });

      // STRICT SAFETY GUARANTEE: If a specific FE code was targeted, NEVER fall back to all FEs!
      if (feDigests.length === 0) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: `Target Field Executive '${feCodeTarget}' was not found in the queue of fatal strikes for batch date ${targetDate}. Dispatch aborted to prevent sending to incorrect recipients.`,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          results: []
        }));
        return;
      }

      // Restrict strictly to the single targeted FE
      if (feDigests.length > 1) {
        feDigests = [feDigests[0]];
      }
    }

    // 5. Check already dispatched FEs if not forcing and not targeted single dispatch
    let alreadyDispatchedFeCodes = new Set();
    if (!force && !feCodeTarget) {
      try {
        const { data: existingLogs } = await supabase
          .from('daily_fe_fatal_dispatch_logs')
          .select('fe_code, sent_status')
          .eq('digest_date', targetDate)
          .eq('sent_status', 'SENT');

        if (existingLogs && existingLogs.length > 0) {
          existingLogs.forEach(l => alreadyDispatchedFeCodes.add(String(l.fe_code).toLowerCase()));
        }
      } catch (err) {
        // Table might not exist yet; fallback to checking task email_notified
      }
    }

    // 6. Setup Email Transport Credentials (Brevo API | Resend | SMTP)
    const creds = body.credentials || {};
    const brevoApiKey = creds.brevoApiKey || process.env.BREVO_API_KEY;
    const resendApiKey = creds.resendApiKey || process.env.RESEND_API_KEY;
    const smtpHost = creds.smtpHost || process.env.SMTP_HOST;
    const smtpPort = creds.smtpPort || process.env.SMTP_PORT || '587';
    const smtpUser = creds.smtpUser || process.env.SMTP_USER;
    const smtpPass = creds.smtpPass || process.env.SMTP_PASS;
    const fromAddress = creds.fromAddress || process.env.BREVO_FROM_EMAIL || process.env.EMAIL_FROM || 'Lenskart Quality Audit <kshitijbagal@gmail.com>';

    let provider = null;
    if (brevoApiKey) provider = 'brevo';
    else if (resendApiKey) provider = 'resend';
    else if (smtpHost && smtpUser && smtpPass) provider = 'smtp';

    const dispatchEmail = async ({ to, cc, subject, html, text }) => {
      if (dryRun) {
        return { success: true, mode: 'DRY_RUN', id: `dry_run_${Date.now()}` };
      }

      if (!provider) {
        throw new Error('No email credentials configured. Please configure BREVO_API_KEY, RESEND_API_KEY, or SMTP credentials.');
      }

      // 1. BREVO REST API DISPATCH
      if (provider === 'brevo') {
        let senderName = 'Lenskart Quality Audit';
        let senderEmail = 'kshitijbagal@gmail.com';
        if (fromAddress && fromAddress.includes('@')) {
          const match = fromAddress.match(/(.*?)\s*<(.+?)>/);
          if (match) {
            senderName = match[1].trim() || senderName;
            senderEmail = match[2].trim();
          } else {
            senderEmail = fromAddress.trim();
          }
        }

        const toList = (Array.isArray(to) ? to : [to]).map(e => {
          if (typeof e === 'string') return { email: e.trim() };
          return e;
        });

        const ccList = cc && cc.length > 0 ? (Array.isArray(cc) ? cc : [cc]).map(e => {
          if (typeof e === 'string') return { email: e.trim() };
          return e;
        }) : undefined;

        const brevoPayload = {
          sender: { name: senderName, email: senderEmail },
          to: toList,
          subject,
          htmlContent: html || text?.replace(/\n/g, '<br/>') || '<p>Audit Notification</p>',
          textContent: text
        };

        if (ccList && ccList.length > 0) brevoPayload.cc = ccList;

        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(brevoPayload)
        });

        const respData = await resp.json();
        if (!resp.ok) {
          throw new Error(`Brevo Error (${resp.status}): ${respData.message || JSON.stringify(respData)}`);
        }
        return { success: true, id: respData.messageId, provider: 'brevo' };
      }

      // 2. RESEND API DISPATCH
      if (provider === 'resend') {
        const resend = new Resend(resendApiKey);
        const resp = await resend.emails.send({
          from: fromAddress.includes('@') ? fromAddress : 'Lenskart Quality Audit <onboarding@resend.dev>',
          to: Array.isArray(to) ? to : [to],
          cc: cc && cc.length > 0 ? (Array.isArray(cc) ? cc : [cc]) : undefined,
          subject,
          html,
          text
        });
        if (resp.error) throw new Error(resp.error.message);
        return { success: true, id: resp.data?.id, provider: 'resend' };
      }

      // 3. SMTP RELAY DISPATCH
      if (provider === 'smtp') {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort, 10),
          secure: parseInt(smtpPort, 10) === 465,
          auth: { user: smtpUser, pass: smtpPass }
        });
        const info = await transporter.sendMail({
          from: fromAddress.includes('@') ? fromAddress : `Lenskart Quality Audit <${smtpUser}>`,
          to: Array.isArray(to) ? to.join(', ') : to,
          cc: cc && cc.length > 0 ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
          subject,
          text,
          html
        });
        return { success: true, id: info.messageId, provider: 'smtp' };
      }
    };

    // ====================================================================
    // 7A. TRIAL MODE / GM & BH EXECUTIVE SUMMARY DISPATCH
    // Dispatches comprehensive daily quality macro-overview to GM, BH & SuperAdmin
    // ====================================================================
    const isLeadershipTrial = query.action === 'send_executive_summary' ||
      body.action === 'send_executive_summary' ||
      query.trialLeadershipOnly === 'true' ||
      body.trialLeadershipOnly === true ||
      (process.env.TRIAL_LEADERSHIP_ONLY === 'true' && query.forceFE !== 'true' && body.forceFE !== true);

    if (isLeadershipTrial) {
      // 1. Compile Executive Macro Summary Data
      const summaryData = aggregateGmBhExecutiveSummary({
        tasks,
        users,
        targetDate,
        portalBaseUrl
      });

      // 2. Identify GM, BH and SuperAdmin recipients
      let leadershipEmails = [];
      if (Array.isArray(body.leadershipEmails) && body.leadershipEmails.length > 0) {
        leadershipEmails = body.leadershipEmails;
      } else if (typeof query.leadershipEmails === 'string') {
        leadershipEmails = query.leadershipEmails.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        // Query users with role GM, BH or SuperAdmin
        (users || []).forEach(u => {
          const roles = Array.isArray(u.roles) ? u.roles : [u.role];
          const isEligible = roles.some(r => {
            const rNorm = String(r || '').toLowerCase();
            return rNorm.includes('gm') || 
                   rNorm.includes('bh') || 
                   rNorm.includes('superadmin') || 
                   rNorm.includes('general manager') || 
                   rNorm.includes('business head');
          });
          const email = (u.email || '').trim().toLowerCase();
          const isReal = email && email.includes('@') && !email.includes('example.com') && !email.includes('demo') && !email.includes('gm.quality') && !email.includes('bh.lenskart');
          if (isEligible && isReal) {
            leadershipEmails.push(email);
          }
        });

        // Deduplicate
        leadershipEmails = Array.from(new Set(leadershipEmails));
      }

      // Fallback defaults if none found
      if (leadershipEmails.length === 0) {
        leadershipEmails = [
          'mayank.gupta1@lenskart.in',
          'ankita.aggarwal@lenskart.com',
          'kshitijbagal@lenskart.com'
        ];
      }

      const execSubject = `[EXECUTIVE SUMMARY] Lenskart Quality Audit Overview - ${targetDate} (Pass: ${summaryData.passRate}% | Fatals: ${summaryData.totalFatal})`;
      const execHtml = buildGmBhExecutiveSummaryHtml({ summaryData, portalBaseUrl });
      const execText = buildGmBhExecutiveSummaryText({ summaryData, portalBaseUrl });

      let dispatchResult = null;
      let dispatchError = null;

      try {
        dispatchResult = await dispatchEmail({
          to: leadershipEmails,
          subject: execSubject,
          html: execHtml,
          text: execText
        });
      } catch (err) {
        console.error('Failed to dispatch Executive Summary email to leadership:', err.message);
        dispatchError = err.message;
      }

      const logStatus = dispatchError ? 'FAILED' : (dryRun ? 'DRY_RUN' : 'SENT');

      // Record dispatch log
      try {
        if (!dryRun) {
          await supabase.from('daily_fe_fatal_dispatch_logs').insert({
            digest_date: targetDate,
            fe_code: 'EXECUTIVE_SUMMARY_GM_BH',
            fe_name: 'GM & BH Executive Briefing',
            fe_email: leadershipEmails.join(', '),
            hub: 'NATIONAL',
            fatal_count: summaryData.totalFatal,
            total_audited: summaryData.totalAudited,
            task_ids: [],
            sent_status: logStatus,
            error_message: dispatchError,
            sent_at: new Date().toISOString()
          });
        }
      } catch (logErr) {}

      res.statusCode = dispatchError ? 500 : 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: !dispatchError,
        mode: dryRun ? 'DRY_RUN_LEADERSHIP' : 'TRIAL_LEADERSHIP_ONLY',
        digestDate: targetDate,
        targetAudience: 'GM, BH & SuperAdmin Only',
        recipients: leadershipEmails,
        provider: provider || (dryRun ? 'dryRun' : 'none'),
        dispatchResult,
        error: dispatchError,
        summary: {
          totalAudited: summaryData.totalAudited,
          totalPassed: summaryData.totalPassed,
          totalFatal: summaryData.totalFatal,
          passRate: summaryData.passRate,
          fatalRate: summaryData.fatalRate,
          hubsCovered: summaryData.hubBreakdown.length,
          fatalFEsCount: summaryData.feFatalList.length
        }
      }));
      return;
    }

    // ====================================================================
    // 7B. NORMAL FE-LEVEL FATAL STRIKE DISPATCH
    // Strictly dispatched to FEs with >= 1 Fatal strike (CC: direct AM & RM)
    // ====================================================================
    const results = [];
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const feDigest of feDigests) {
      const feCodeLower = String(feDigest.feCode).toLowerCase();

      // Check if all fatal tasks for this FE were already notified and force isn't set (ignored if single FE target dispatch)
      const allTasksAlreadyNotified = !force && !feCodeTarget && feDigest.fatalTasks.every(t => {
        const sourceTask = (tasks || []).find(st => (st.id || st.taskId) === t.taskId);
        return sourceTask?.email_sent === true;
      });

      if (!force && !feCodeTarget && (alreadyDispatchedFeCodes.has(feCodeLower) || allTasksAlreadyNotified)) {
        skippedCount++;
        results.push({
          feCode: feDigest.feCode,
          feName: feDigest.feName,
          fatalCount: feDigest.fatalCount,
          status: 'SKIPPED_ALREADY_SENT',
          reason: `Digest already sent for ${feDigest.feCode} on ${targetDate}. Pass force=true to re-dispatch.`
        });
        continue;
      }

      const subject = `[FORMAL WARNING] Lenskart DLC Quality Audit - ${feDigest.fatalCount} Fatal Strike${feDigest.fatalCount > 1 ? 's' : ''} Recorded (${targetDate})`;
      const html = buildFeFatalWarningEmailHtml({ feDigest, portalBaseUrl });
      const text = buildFeFatalWarningEmailText({ feDigest, portalBaseUrl });

      const toEmail = feDigest.feEmail;
      const ccEmails = [feDigest.amEmail, feDigest.rmEmail].filter(Boolean);

      let dispatchResult = null;
      let dispatchError = null;

      try {
        dispatchResult = await dispatchEmail({
          to: toEmail,
          cc: ccEmails,
          subject,
          html,
          text
        });
        sentCount++;
      } catch (err) {
        const detail = err?.cause?.message || err?.cause?.code || '';
        console.error(`Failed to dispatch fatal warning to FE ${feDigest.feCode}:`, err.message, err?.cause);
        dispatchError = detail ? `${err.message}: ${detail}` : err.message;
        failedCount++;
      }

      const logStatus = dispatchError ? 'FAILED' : (dryRun ? 'DRY_RUN' : 'SENT');

      // Update Supabase tasks: mark email_sent = true
      if (logStatus === 'SENT' || logStatus === 'DRY_RUN') {
        const fatalTaskIds = feDigest.fatalTasks.map(ft => ft.taskId).filter(Boolean);
        if (fatalTaskIds.length > 0 && !dryRun) {
          try {
            await supabase
              .from('tasks')
              .update({
                email_sent: true,
                email_sent_at: new Date().toISOString(),
                email_recipients: [toEmail, ...ccEmails],
                updated_at: new Date().toISOString()
              })
              .in('id', fatalTaskIds);
          } catch (taskUpdErr) {
            console.warn('Could not update task email_sent status:', taskUpdErr.message);
          }
        }
      }

      // Record dispatch log
      try {
        if (!dryRun) {
          await supabase.from('daily_fe_fatal_dispatch_logs').insert({
            digest_date: targetDate,
            fe_code: feDigest.feCode,
            fe_name: feDigest.feName,
            fe_email: toEmail,
            am_email: feDigest.amEmail,
            rm_email: feDigest.rmEmail,
            hub: feDigest.hub,
            fatal_count: feDigest.fatalCount,
            total_audited: feDigest.totalAudited,
            task_ids: feDigest.fatalTasks.map(t => t.taskId),
            sent_status: logStatus,
            error_message: dispatchError,
            sent_at: new Date().toISOString()
          });
        }
      } catch (logErr) {
        // Fallback gracefully if table not created
      }

      results.push({
        feCode: feDigest.feCode,
        feName: feDigest.feName,
        feEmail: toEmail,
        amEmail: feDigest.amEmail,
        rmEmail: feDigest.rmEmail,
        fatalCount: feDigest.fatalCount,
        taskCount: feDigest.fatalTasks.length,
        status: logStatus,
        error: dispatchError,
        dispatchResult
      });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      digestDate: targetDate,
      mode: dryRun ? 'DRY_RUN' : 'LIVE',
      totalFatalFEs: feDigests.length,
      sentCount,
      skippedCount,
      failedCount,
      provider: provider || (dryRun ? 'dryRun' : 'none'),
      results
    }));

  } catch (error) {
    console.error('Daily FE Fatal Digest Cron Error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: error.message || 'Internal Server Error while running daily FE fatal digest cron',
      code: 'FE_FATAL_CRON_FAILED'
    }));
  }
}

// Default export for Vercel Serverless Function
export default async function handler(req, res) {
  return dailyFeFatalDigestCronHandler(req, res);
}
