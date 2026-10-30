import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { 
  normalizeDateToYMD, 
  aggregateDailyDigest, 
  buildDailyDigestHtml, 
  buildDailyDigestText 
} from '../../src/utils/dailyDigestHelper.js';

/**
 * Universal Daily Audit Digest & Escalation Cron Endpoint
 * Compatible with Vercel Cron Jobs (/api/cron/daily-digest) and Vite Dev Server middleware.
 */
export async function dailyDigestCronHandler(req, res) {
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
    // 1. Authorization Check (CRON_SECRET)
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
    const managerEmailTarget = query.managerEmail || body.managerEmail;
    const dryRun = query.dryRun === 'true' || body.dryRun === true;
    const portalBaseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || 'https://locus-auditor.vercel.app';

    // 2. Initialize Supabase Client
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://qaxzlidehuekecsrztsy.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFheHpsaWRlaHVla2Vjc3J6dHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxODM5NTksImV4cCI6MjEwODc1OTk1OX0.zTFzRDWehSATI78_I38zNZ85jWtBQsbv0LGXvgRptoo';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Load Tasks & Users (either from payload or from Supabase database)
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

    // 4. Identify all Managers (Area Managers & Regional Managers)
    const eligibleManagers = users.filter(u => {
      const roles = Array.isArray(u.roles) ? u.roles : [u.role];
      const isAM = roles.includes('AM') || roles.includes('Area Manager');
      const isRM = roles.includes('RM') || roles.includes('Regional Manager');
      if (!isAM && !isRM) return false;
      if (managerEmailTarget) {
        return u.email && u.email.toLowerCase() === managerEmailTarget.toLowerCase();
      }
      return true;
    });

    if (eligibleManagers.length === 0) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        digestDate: targetDate,
        message: 'No eligible AM or RM profiles found to process.',
        processedCount: 0,
        sentCount: 0,
        skippedCount: 0
      }));
      return;
    }

    // 5. Check Idempotency Logs in Supabase
    let alreadySentEmails = new Set();
    if (!force) {
      try {
        const { data: existingLogs } = await supabase
          .from('daily_digest_logs')
          .select('recipient_email, sent_status')
          .eq('digest_date', targetDate)
          .eq('sent_status', 'SENT');

        if (existingLogs && existingLogs.length > 0) {
          existingLogs.forEach(l => {
            if (l.recipient_email) alreadySentEmails.add(l.recipient_email.toLowerCase());
          });
        }
      } catch (logErr) {
        console.warn('Could not check existing daily_digest_logs:', logErr.message);
      }
    }

    // 6. Setup Email Provider (Resend or SMTP)
    const resendApiKey = body.credentials?.resendApiKey || process.env.RESEND_API_KEY;
    const smtpHost = body.credentials?.smtpHost || process.env.SMTP_HOST;
    const smtpUser = body.credentials?.smtpUser || process.env.SMTP_USER;
    const smtpPass = body.credentials?.smtpPass || process.env.SMTP_PASS;
    const smtpPort = body.credentials?.smtpPort || process.env.SMTP_PORT || 587;
    const fromAddress = body.credentials?.fromAddress || process.env.EMAIL_FROM || 'Lenskart Quality Audit <onboarding@resend.dev>';

    const provider = resendApiKey ? 'resend' : smtpHost ? 'smtp' : null;

    // Helper: Dispatch single email
    const dispatchEmail = async ({ to, subject, html, text }) => {
      if (dryRun) {
        return { success: true, id: 'dry-run-preview', provider: 'dryRun' };
      }

      if (!provider) {
        throw new Error('No email service configured (Resend API Key or SMTP credentials required).');
      }

      if (provider === 'resend') {
        const resend = new Resend(resendApiKey);
        const resp = await resend.emails.send({
          from: fromAddress.includes('@') ? fromAddress : 'onboarding@resend.dev',
          to: Array.isArray(to) ? to : [to],
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
          from: fromAddress.includes('@') ? fromAddress : `Lenskart Audit <${smtpUser}>`,
          to: Array.isArray(to) ? to.join(', ') : to,
          subject,
          text,
          html
        });
        return { success: true, id: info.messageId, provider: 'smtp' };
      }
    };

    // 7. Aggregate & Dispatch for each Manager
    const results = [];
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const manager of eligibleManagers) {
      const email = (manager.email || '').toLowerCase().trim();
      if (!email) continue;

      const roles = Array.isArray(manager.roles) ? manager.roles : [manager.role];
      const role = roles.includes('RM') || manager.role === 'RM' ? 'RM' : 'AM';

      // Idempotency: Skip if already successfully sent today (unless force=true)
      if (alreadySentEmails.has(email) && !force) {
        skippedCount++;
        results.push({
          managerEmail: email,
          managerName: manager.full_name,
          role,
          status: 'SKIPPED_ALREADY_SENT',
          reason: `Digest already sent for ${targetDate}. Pass force=true to re-dispatch.`
        });
        continue;
      }

      // Compute Aggregation
      const digest = aggregateDailyDigest({
        tasks,
        users,
        targetDate,
        manager,
        role,
        portalBaseUrl
      });

      const subject = `[Daily Audit Digest] ${digest.clusterOrRegion} Quality Summary (${targetDate}) - ${digest.fatalCount} Fatals | ${digest.complianceRate}% Compliance`;
      const html = buildDailyDigestHtml({ digest, portalBaseUrl });
      const text = buildDailyDigestText({ digest, portalBaseUrl });

      let dispatchResult = null;
      let dispatchError = null;

      try {
        dispatchResult = await dispatchEmail({
          to: email,
          subject,
          html,
          text
        });
        sentCount++;
      } catch (sendErr) {
        console.error(`Failed to dispatch digest to ${email}:`, sendErr.message);
        dispatchError = sendErr.message;
        failedCount++;
      }

      const logStatus = dispatchResult ? 'SENT' : 'FAILED';

      // Upsert record into daily_digest_logs in Supabase
      try {
        await supabase
          .from('daily_digest_logs')
          .upsert({
            digest_date: targetDate,
            recipient_email: email,
            recipient_name: manager.full_name,
            recipient_role: role,
            cluster_or_region: digest.clusterOrRegion,
            total_audited: digest.totalAudited,
            total_passed: digest.totalPassed,
            fatal_count: digest.fatalCount,
            compliance_rate: digest.complianceRate,
            repeat_offenders: digest.repeatOffenders,
            common_failures: digest.commonFailures,
            fatal_incidents: digest.fatalIncidents,
            sent_status: logStatus,
            sent_at: new Date().toISOString(),
            error_message: dispatchError
          }, {
            onConflict: 'digest_date,recipient_email'
          });
      } catch (dbErr) {
        console.warn('Logging daily_digest_log to Supabase failed:', dbErr.message);
      }

      results.push({
        managerEmail: email,
        managerName: manager.full_name,
        role,
        clusterOrRegion: digest.clusterOrRegion,
        totalAudited: digest.totalAudited,
        fatalCount: digest.fatalCount,
        complianceRate: digest.complianceRate,
        repeatOffendersCount: digest.repeatOffenders.length,
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
      processedCount: eligibleManagers.length,
      sentCount,
      skippedCount,
      failedCount,
      provider: provider || (dryRun ? 'dryRun' : 'none'),
      results
    }));

  } catch (error) {
    console.error('Daily Digest Cron Error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: error.message || 'Internal Server Error while running daily digest cron',
      code: 'CRON_EXECUTION_FAILED'
    }));
  }
}

// Default export for Vercel Serverless Function
export default async function handler(req, res) {
  return dailyDigestCronHandler(req, res);
}
