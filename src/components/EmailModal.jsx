import React, { useState, useEffect } from 'react';
import { 
  X, 
  Mail, 
  Send, 
  Copy, 
  Check, 
  ExternalLink, 
  AlertTriangle, 
  ShieldAlert,
  User,
  Clock,
  SendHorizontal,
  Settings,
  Key,
  Server,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { emailApi } from '../api/client.js';

export default function EmailModal({
  task,
  onClose,
  onSendEmail,
  auditorName
}) {
  const [copied, setCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { success: boolean, message: string }
  const [showSettings, setShowSettings] = useState(false);
  
  // Gateway Settings State
  const [gatewayConfig, setGatewayConfig] = useState(() => emailApi.getGatewayConfig());
  const [testEmailTarget, setTestEmailTarget] = useState('');
  const [isTestingGateway, setIsTestingGateway] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState(null); // { type: 'success' | 'error', message: string }

  const facility = (task?.facilityCode || 'Ahmedabad').toLowerCase();
  
  // Real resolved emails from FE profile hierarchy
  const [feEmail, setFeEmail] = useState(
    task?.feEmail || 
    (task?.feCode ? `${task.feCode.toLowerCase()}@lenskart.in` : 'fe@lenskart.in')
  );
  const [amEmail, setAmEmail] = useState(
    task?.amEmail || 
    task?.reporting_manager_email || 
    `am.${facility}@lenskart.in`
  );
  const [rmEmail, setRmEmail] = useState(
    task?.rmEmail || 
    task?.regional_manager_email || 
    'rm.quality@lenskart.in'
  );

  const amDisplayName = task?.amName || 'Area Manager';
  const rmDisplayName = task?.rmName || 'Regional Manager';

  // Check if gateway is configured
  const isGatewayReady = Boolean(
    (gatewayConfig.provider === 'resend' && gatewayConfig.resendApiKey) ||
    (gatewayConfig.provider === 'smtp' && gatewayConfig.smtpHost && gatewayConfig.smtpUser && gatewayConfig.smtpPass)
  );

  if (!task) return null;

  const subject = `[FATAL NOTICE] Audit Non-Compliance Strike - Task #${task.taskId} | FE: ${task.feName || 'Field Executive'}`;

  const violationsText = task.failedReasons && task.failedReasons.length > 0 
    ? task.failedReasons.map((r, i) => `   ${i + 1}. [FAIL] ${r}`).join('\n')
    : `   1. [FAIL] SOP image inspection criteria violated (${task.remarks || 'Non-compliance detected'})`;

  const emailBody = `Dear ${task.feName || 'Field Executive'} (ID: ${task.feId || 'N/A'} • Code: ${task.feCode || 'N/A'}),

CC: Area Manager: ${amDisplayName} (${amEmail})
CC: Regional Manager: ${rmDisplayName} (${rmEmail})

This is an automated formal notification from the Central Quality & Compliance Division regarding your recent Lenskart DLC dispatch visit.

Your uploaded inspection images for Task ID: ${task.taskId} on ${task.date} failed mandatory standard operating procedure (SOP) checks and have been recorded as a FATAL AUDIT STRIKE by Central Auditor ${auditorName || 'Central QA Lead'}.

======================================================================
1. REASONS FOR AUDIT FAILURE:
======================================================================
${violationsText}

${task.remarks ? `Auditor Remarks: "${task.remarks}"\n` : ''}
======================================================================
2. ACTIONABLE WAYS TO IMPROVE FUTURE AUDITS:
======================================================================
• Uniform & Identification: Ensure your official Lenskart polo shirt is worn properly and your employee photo ID card is clearly legible in the selfie station before knocking on the customer door.
• Diagnostic Torches: Check battery levels before each shift. Illuminate and place both Cobalt Blue and Amber Yellow penlights side-by-side on a flat surface.
• Acuity Standee: Mount the vision chart securely on the telescoping standee at patient seated eye-level. Never tape or pin charts to the customer's walls.
• Refraction Kit Hygiene: Sanitize your hands and place all 6 clinical tools (Trial frame, JCC, near vision card, mirror, PD ruler, sanitizer) neatly in the tray.
• Merchandising: Showcase frames in the multi-grid tray neatly on the customer living room table.

======================================================================
3. NEXT STEPS FOR AM & FE:
======================================================================
• Area Manager (${amEmail}): Conduct immediate kit review and coaching with ${task.feName} before their next dispatch run.
• Regional Manager (${rmEmail}): This strike has been logged into the national compliance registry.

Central Quality & Compliance Division
Lenskart DLC Operations`;

  const handleCopy = () => {
    navigator.clipboard.writeText(emailBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveGateway = () => {
    emailApi.saveGatewayConfig(gatewayConfig);
    setGatewayStatus({
      type: 'success',
      message: 'Gateway configuration saved successfully.'
    });
    setTimeout(() => setGatewayStatus(null), 3500);
  };

  const handleTestGateway = async () => {
    if (!testEmailTarget) {
      setGatewayStatus({
        type: 'error',
        message: 'Please enter a recipient email address to send the test message.'
      });
      return;
    }

    setIsTestingGateway(true);
    setGatewayStatus(null);

    try {
      // Save first
      emailApi.saveGatewayConfig(gatewayConfig);
      const res = await emailApi.testConnection(testEmailTarget);
      setGatewayStatus({
        type: 'success',
        message: `Test email successfully delivered to ${testEmailTarget}! (ID: ${res.id || 'OK'})`
      });
    } catch (err) {
      setGatewayStatus({
        type: 'error',
        message: `Delivery failed: ${err.message}`
      });
    } finally {
      setIsTestingGateway(false);
    }
  };

  const handleSendLiveNotice = async () => {
    setIsSending(true);
    setSendResult(null);

    try {
      await onSendEmail(task.id, {
        feEmail,
        amEmail,
        rmEmail,
        body: emailBody
      });
      
      setSendResult({
        success: true,
        message: `Real email notice dispatched to ${feEmail}, CC: ${amEmail}, ${rmEmail}`
      });

      // Brief delay so user sees confirmation
      setTimeout(() => {
        onClose();
      }, 1200);

    } catch (err) {
      setSendResult({
        success: false,
        message: `Failed to dispatch real email: ${err.message}`
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenClient = () => {
    const allRecipients = [feEmail, amEmail, rmEmail].filter(Boolean).join(',');
    const mailtoUrl = `mailto:${encodeURIComponent(allRecipients)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    onSendEmail(task.id, {
      feEmail,
      amEmail,
      rmEmail,
      body: emailBody
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-850 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                  Real Email Dispatch
                </span>
                <span className="text-xs text-slate-400 font-mono">Task #{task.taskId}</span>
                {isGatewayReady ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Gateway Active ({gatewayConfig.provider.toUpperCase()})
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Gateway Setup Needed
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Dispatch Real Notice to FE, AM & RM Inboxes
              </h3>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                showSettings 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Configure Email Gateway (Resend / SMTP)"
            >
              <Settings className="w-4 h-4" />
              <span>Gateway Settings</span>
              {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Email Gateway Configuration Drawer */}
          {showSettings && (
            <div className="p-4 rounded-xl bg-slate-950 border border-blue-500/30 space-y-3.5 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <Server className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-white text-xs uppercase tracking-wider">
                    Email Delivery Provider Settings
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGatewayConfig(prev => ({ ...prev, provider: 'resend' }))}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                      gatewayConfig.provider === 'resend'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Resend API (Cloud)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGatewayConfig(prev => ({ ...prev, provider: 'smtp' }))}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                      gatewayConfig.provider === 'smtp'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    SMTP (Gmail / Outlook)
                  </button>
                </div>
              </div>

              {/* Provider 1: Resend */}
              {gatewayConfig.provider === 'resend' ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">
                      Resend API Key:
                    </label>
                    <input
                      type="password"
                      value={gatewayConfig.resendApiKey || ''}
                      onChange={(e) => setGatewayConfig(prev => ({ ...prev, resendApiKey: e.target.value }))}
                      placeholder="re_1234567890abcdef..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Free API key from <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-blue-400 underline">resend.com/api-keys</a>. Allows instant delivery to inboxes without complex server setups.
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">
                      Sender "From" Address:
                    </label>
                    <input
                      type="text"
                      value={gatewayConfig.fromAddress || ''}
                      onChange={(e) => setGatewayConfig(prev => ({ ...prev, fromAddress: e.target.value }))}
                      placeholder="Lenskart Quality Audit <onboarding@resend.dev>"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Use <code className="text-amber-300">onboarding@resend.dev</code> for testing, or your verified corporate domain (e.g. <code className="text-sky-300">quality@lenskart.in</code>).
                    </span>
                  </div>
                </div>
              ) : (
                /* Provider 2: SMTP Relay */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">SMTP Host:</label>
                    <input
                      type="text"
                      value={gatewayConfig.smtpHost || ''}
                      onChange={(e) => setGatewayConfig(prev => ({ ...prev, smtpHost: e.target.value }))}
                      placeholder="smtp.gmail.com or smtp.office365.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">SMTP Port:</label>
                    <input
                      type="number"
                      value={gatewayConfig.smtpPort || 587}
                      onChange={(e) => setGatewayConfig(prev => ({ ...prev, smtpPort: parseInt(e.target.value, 10) }))}
                      placeholder="587 or 465"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">SMTP Username / Email:</label>
                    <input
                      type="text"
                      value={gatewayConfig.smtpUser || ''}
                      onChange={(e) => setGatewayConfig(prev => ({ ...prev, smtpUser: e.target.value }))}
                      placeholder="audits@lenskart.in or your.email@gmail.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">SMTP Password / App Password:</label>
                    <input
                      type="password"
                      value={gatewayConfig.smtpPass || ''}
                      onChange={(e) => setGatewayConfig(prev => ({ ...prev, smtpPass: e.target.value }))}
                      placeholder="App-specific password"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Live Test & Save Controls */}
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <input
                    type="email"
                    value={testEmailTarget}
                    onChange={(e) => setTestEmailTarget(e.target.value)}
                    placeholder="Enter email to test connectivity..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleTestGateway}
                    disabled={isTestingGateway}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    {isTestingGateway ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Test Mail</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveGateway}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Configuration</span>
                </button>
              </div>

              {gatewayStatus && (
                <div className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                  gatewayStatus.type === 'success' 
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' 
                    : 'bg-red-500/10 border border-red-500/30 text-red-300'
                }`}>
                  {gatewayStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{gatewayStatus.message}</span>
                </div>
              )}

            </div>
          )}

          {/* Recipient inputs with resolved AM/RM names */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                  1. Field Executive (FE):
                </label>
                {task?.feCode && (
                  <span className="text-[10px] text-sky-400 font-mono">[{task.feCode}]</span>
                )}
              </div>
              <input
                type="email"
                value={feEmail}
                onChange={(e) => setFeEmail(e.target.value)}
                placeholder="fe.email@lenskart.in"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
              />
              <span className="text-[10px] text-slate-500 truncate block mt-0.5" title={task?.feName}>
                {task?.feName || 'Executive'}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                  2. Area Manager (AM):
                </label>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                  CC
                </span>
              </div>
              <input
                type="email"
                value={amEmail}
                onChange={(e) => setAmEmail(e.target.value)}
                placeholder="am.email@lenskart.in"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 font-semibold truncate block mt-0.5" title={amDisplayName}>
                {amDisplayName}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                  3. Regional Manager (RM):
                </label>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
                  CC
                </span>
              </div>
              <input
                type="email"
                value={rmEmail}
                onChange={(e) => setRmEmail(e.target.value)}
                placeholder="rm.email@lenskart.in"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 font-semibold truncate block mt-0.5" title={rmDisplayName}>
                {rmDisplayName}
              </span>
            </div>
          </div>

          {/* Dispatch Feedback / Error notice */}
          {sendResult && (
            <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              sendResult.success 
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' 
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}>
              {sendResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />}
              <span>{sendResult.message}</span>
            </div>
          )}

          {/* Formatted Notice Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                Official Notice Preview (Reasons & Improvement Guidelines):
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            </div>
            <textarea
              readOnly
              rows={11}
              value={emailBody}
              className="w-full font-mono text-[11px] leading-relaxed bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-300 resize-none focus:outline-none"
            />
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-850 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleOpenClient}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Fallback: Open Outlook or default mail client"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Launch Mail Client</span>
              <span className="sm:hidden">Mail App</span>
            </button>

            <button
              onClick={handleSendLiveNotice}
              disabled={isSending}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white shadow-lg shadow-red-500/25 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching to Inboxes...</span>
                </>
              ) : (
                <>
                  <SendHorizontal className="w-3.5 h-3.5" />
                  <span>Dispatch Real Email Notice</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
