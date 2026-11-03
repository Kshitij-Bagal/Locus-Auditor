import nodemailer from 'nodemailer';
import { Resend } from 'resend';

/**
 * Universal Serverless Email Dispatch Handler
 * Compatible with Vercel Serverless Functions (/api/send-email)
 * and Vite Dev Server middleware.
 */
export async function sendEmailHandler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }));
    return;
  }

  try {
    // Parse body if not already parsed
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    } else if (!body) {
      body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (e) {
            resolve({});
          }
        });
      });
    }

    const {
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      provider: requestedProvider,
      credentials = {}
    } = body || {};

    if (!to || (!text && !html)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: 'Missing required fields: "to" and ("html" or "text") are required.' 
      }));
      return;
    }

    // Determine Provider: brevo | resend | smtp
    const brevoApiKey = credentials.brevoApiKey || process.env.BREVO_API_KEY;
    const resendApiKey = credentials.resendApiKey || process.env.RESEND_API_KEY;
    const smtpHost = credentials.smtpHost || process.env.SMTP_HOST;
    const smtpUser = credentials.smtpUser || process.env.SMTP_USER;
    const smtpPass = credentials.smtpPass || process.env.SMTP_PASS;
    const smtpPort = credentials.smtpPort || process.env.SMTP_PORT || 587;
    const fromAddress = credentials.fromAddress || process.env.BREVO_FROM_EMAIL || process.env.EMAIL_FROM || 'Lenskart Quality Audit <kshitijbagal@gmail.com>';

    const provider = requestedProvider || (brevoApiKey ? 'brevo' : resendApiKey ? 'resend' : smtpHost ? 'smtp' : null);

    if (!provider) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'No email service configured. Please provide a BREVO_API_KEY, Resend API key, or SMTP credentials in Email Settings.',
        code: 'NO_GATEWAY_CONFIGURED'
      }));
      return;
    }

    // ==========================================
    // 1. DISPATCH VIA BREVO (SENDINBLUE) REST API
    // ==========================================
    if (provider === 'brevo') {
      if (!brevoApiKey) {
        throw new Error('Brevo API Key is missing. Please configure BREVO_API_KEY in environment variables.');
      }

      // Format sender
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

      // Format recipients
      const toList = (Array.isArray(to) ? to : [to]).map(e => {
        if (typeof e === 'string') return { email: e.trim() };
        return e;
      });

      const ccList = cc ? (Array.isArray(cc) ? cc : [cc]).map(e => {
        if (typeof e === 'string') return { email: e.trim() };
        return e;
      }) : undefined;

      const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]).map(e => {
        if (typeof e === 'string') return { email: e.trim() };
        return e;
      }) : undefined;

      const brevoPayload = {
        sender: { name: senderName, email: senderEmail },
        to: toList,
        subject: subject || 'Lenskart DLC Quality Audit Notification',
        htmlContent: html || text?.replace(/\n/g, '<br/>') || '<p>Audit Notification</p>',
        textContent: text
      };

      if (ccList && ccList.length > 0) brevoPayload.cc = ccList;
      if (bccList && bccList.length > 0) brevoPayload.bcc = bccList;

      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(brevoPayload)
      });

      const brevoData = await brevoResponse.json();

      if (!brevoResponse.ok) {
        throw new Error(`Brevo Delivery Failed (${brevoResponse.status}): ${brevoData.message || JSON.stringify(brevoData)}`);
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        provider: 'brevo',
        messageId: brevoData.messageId,
        to: toList,
        cc: ccList,
        message: 'Email delivered successfully via Brevo'
      }));
      return;
    }

    // ==========================================
    // 2. DISPATCH VIA RESEND API
    // ==========================================
    if (provider === 'resend') {
      if (!resendApiKey) {
        throw new Error('Resend API Key is missing. Please enter your Resend API Key.');
      }

      const resend = new Resend(resendApiKey);
      const toList = Array.isArray(to) ? to : [to];
      const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined;

      const payload = {
        from: fromAddress.includes('@') ? fromAddress : 'onboarding@resend.dev',
        to: toList,
        subject: subject || 'Lenskart DLC Audit Notification',
        html: html || text.replace(/\n/g, '<br/>'),
        text: text
      };

      if (ccList && ccList.length > 0) {
        payload.cc = ccList;
      }

      const response = await resend.emails.send(payload);

      if (response.error) {
        throw new Error(`Resend Delivery Failed: ${response.error.message}`);
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        provider: 'resend',
        id: response.data?.id,
        to: toList,
        cc: ccList,
        message: 'Email delivered successfully via Resend'
      }));
      return;
    }

    // ==========================================
    // 2. DISPATCH VIA SMTP RELAY (Nodemailer)
    // ==========================================
    if (provider === 'smtp') {
      if (!smtpHost || !smtpUser || !smtpPass) {
        throw new Error('SMTP Host, Username, and Password are required for SMTP delivery.');
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: parseInt(smtpPort, 10) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const mailOptions = {
        from: fromAddress.includes('@') ? fromAddress : `Lenskart Audit <${smtpUser}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
        subject: subject || 'Lenskart DLC Audit Notification',
        text: text,
        html: html || text.replace(/\n/g, '<br/>')
      };

      const info = await transporter.sendMail(mailOptions);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        provider: 'smtp',
        id: info.messageId,
        to,
        cc,
        message: 'Email delivered successfully via SMTP'
      }));
      return;
    }

    throw new Error(`Unsupported email provider: ${provider}`);

  } catch (error) {
    console.error('Email Dispatch Error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: error.message || 'Internal Server Error while sending email',
      code: 'DISPATCH_FAILED'
    }));
  }
}

// Default export for Vercel Serverless Function
export default async function handler(req, res) {
  return sendEmailHandler(req, res);
}
