import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { 
  normalizeDateToYMD, 
  aggregateFeFatalDigests, 
  buildFeFatalWarningEmailHtml, 
  buildFeFatalWarningEmailText 
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

    const targetDate = query.date || body.date || normalizeDateToYMD(new Date());
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
        .order('audited_at', { ascending: false });
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

    // 4. Aggregate FE-level fatal digests
    // strictly filters for FEs with fatalCount >= 1!
    let feDigests = aggregateFeFatalDigests({
      tasks,
      users,
      targetDate,
      portalBaseUrl
    });

    if (feCodeTarget) {
      feDigests = feDigests.filter(f => 
        (f.feCode && f.feCode.toLowerCase() === feCodeTarget.toLowerCase()) ||
        (f.feEmail && f.feEmail.toLowerCase() === feCodeTarget.toLowerCase())
      );
    }

    // 5. Check already dispatched FEs if not forcing
    let alreadyDispatchedFeCodes = new Set();
    if (!force) {
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

    // 6. Setup Email Transport Credentials
    const creds = body.credentials || {};
    const resendApiKey = creds.resendApiKey || process.env.RESEND_API_KEY;
    const smtpHost = creds.smtpHost || process.env.SMTP_HOST;
    const smtpPort = creds.smtpPort || process.env.SMTP_PORT || '587';
    const smtpUser = creds.smtpUser || process.env.SMTP_USER;
    const smtpPass = creds.smtpPass || process.env.SMTP_PASS;
    const fromAddress = creds.fromAddress || process.env.EMAIL_FROM || 'Lenskart Quality Audit <alerts@lenskart.in>';

    let provider = null;
    if (resendApiKey) provider = 'resend';
    else if (smtpHost && smtpUser && smtpPass) provider = 'smtp';

    const dispatchEmail = async ({ to, cc, subject, html, text }) => {
      if (dryRun) {
        return { success: true, mode: 'DRY_RUN', id: `dry_run_${Date.now()}` };
      }

      if (!provider) {
        throw new Error('No email credentials configured. Please configure RESEND_API_KEY or SMTP credentials.');
      }

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

    // 7. Process and Dispatch Each Fatal FE
    const results = [];
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const feDigest of feDigests) {
      const feCodeLower = String(feDigest.feCode).toLowerCase();

      // Check if all fatal tasks for this FE were already notified and force isn't set
      const allTasksAlreadyNotified = !force && feDigest.fatalTasks.every(t => {
        const sourceTask = (tasks || []).find(st => (st.id || st.taskId) === t.taskId);
        return sourceTask?.email_notified === true || sourceTask?.email_sent === true;
      });

      if (!force && (alreadyDispatchedFeCodes.has(feCodeLower) || allTasksAlreadyNotified)) {
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
        console.error(`Failed to dispatch fatal warning to FE ${feDigest.feCode}:`, err.message);
        dispatchError = err.message;
        failedCount++;
      }

      const logStatus = dispatchError ? 'FAILED' : (dryRun ? 'DRY_RUN' : 'SENT');

      // Update Supabase tasks: mark email_notified = true
      if (logStatus === 'SENT' || logStatus === 'DRY_RUN') {
        const fatalTaskIds = feDigest.fatalTasks.map(ft => ft.taskId).filter(Boolean);
        if (fatalTaskIds.length > 0 && !dryRun) {
          try {
            await supabase
              .from('tasks')
              .update({
                email_notified: true,
                email_sent: true,
                email_sent_at: new Date().toISOString(),
                email_recipients: [toEmail, ...ccEmails],
                updated_at: new Date().toISOString()
              })
              .in('id', fatalTaskIds);
          } catch (taskUpdErr) {
            console.warn('Could not update task email_notified status:', taskUpdErr.message);
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
