import React, { useState } from 'react';
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
  SendHorizontal
} from 'lucide-react';

export default function EmailModal({
  task,
  onClose,
  onSendEmail,
  auditorName
}) {
  const [copied, setCopied] = useState(false);
  const facility = (task?.facilityCode || 'Ahmedabad').toLowerCase();
  
  const [feEmail, setFeEmail] = useState(task?.feEmail || `${task?.feCode?.toLowerCase() || 'fe'}@lenskart.in`);
  const [amEmail, setAmEmail] = useState(`am.${facility}@lenskart.in`);
  const [rmEmail, setRmEmail] = useState('rm.quality@lenskart.in');

  if (!task) return null;

  const subject = `[FATAL NOTICE] Audit Non-Compliance Strike - Task #${task.taskId} | FE: ${task.feName}`;

  const violationsText = task.failedReasons && task.failedReasons.length > 0 
    ? task.failedReasons.map((r, i) => `   ${i + 1}. [FAIL] ${r}`).join('\n')
    : `   1. [FAIL] SOP image inspection criteria violated (${task.remarks || 'Non-compliance detected'})`;

  const emailBody = `Dear ${task.feName || 'Field Executive'} (ID: ${task.feId} • Code: ${task.feCode}),

CC: Area Manager (${amEmail}) & Regional Manager (${rmEmail})

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

  const handleSendAndClose = () => {
    onSendEmail(task.id, {
      feEmail,
      amEmail,
      rmEmail,
      body: emailBody
    });
    onClose();
  };

  const handleOpenClient = () => {
    const allRecipients = [feEmail, amEmail, rmEmail].filter(Boolean).join(',');
    const mailtoUrl = `mailto:${encodeURIComponent(allRecipients)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    handleSendAndClose();
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
                  Tri-Party Audit Failure Notice
                </span>
                <span className="text-xs text-slate-400 font-mono">Task #{task.taskId}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Dispatch Fatal Notice to FE, AM & RM
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Recipient inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                1. Field Executive (FE):
              </label>
              <input
                type="email"
                value={feEmail}
                onChange={(e) => setFeEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                2. Area Manager (AM):
              </label>
              <input
                type="email"
                value={amEmail}
                onChange={(e) => setAmEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                3. Regional Manager (RM):
              </label>
              <input
                type="email"
                value={rmEmail}
                onChange={(e) => setRmEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          </div>

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
              rows={12}
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
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Open in Outlook / Mail app"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span>Launch Mail Client</span>
            </button>

            <button
              onClick={handleSendAndClose}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <SendHorizontal className="w-3.5 h-3.5" />
              <span>Confirm & Dispatch Notice</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
