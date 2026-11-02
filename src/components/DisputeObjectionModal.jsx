import React, { useState, useMemo } from 'react';
import { 
  X, 
  AlertTriangle, 
  Calendar, 
  Video, 
  Clock, 
  Send, 
  CheckCircle, 
  FileText, 
  Upload, 
  ShieldAlert, 
  ExternalLink,
  Users,
  Info
} from 'lucide-react';
import { generateGoogleMeetLink, getDisputeWindowStatus } from '../utils/calendarHelper.js';

export const DISPUTE_CATEGORIES = [
  'Locus Sync Issue',
  'Camera Hardware Fault',
  'Customer Denied',
  'Kit Replacement Delay',
  'False Positive / Clinical Disagreement',
  'Other Grounds'
];

export default function DisputeObjectionModal({
  task,
  currentUser,
  isOpen,
  onClose,
  onSubmitDispute
}) {
  if (!isOpen || !task) return null;

  const roles = Array.isArray(currentUser?.roles) ? currentUser.roles : [currentUser?.role || ''];
  const isManager = roles.some(r => ['AM', 'RM', 'Admin', 'SuperAdmin', 'GM'].includes(r));
  const isFE = roles.includes('FE') || currentUser?.role === 'FE';

  const windowStatus = getDisputeWindowStatus(task.auditedAt);

  const [category, setCategory] = useState(DISPUTE_CATEGORIES[0]);
  const [reason, setReason] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [isSchedulingMeet, setIsSchedulingMeet] = useState(isManager); // default to meet for AM/RM
  const [meetDate, setMeetDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return tomorrow.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  });
  const [submitting, setSubmitting] = useState(false);

  // Attendees resolution
  const attendeesData = useMemo(() => {
    const feEmail = task.feEmail || `${(task.feCode || 'fe').toLowerCase()}@lenskart.in`;
    const amEmail = task.amEmail || currentUser?.reporting_manager_email || 'am.operations@lenskart.in';
    const rmEmail = task.rmEmail || currentUser?.regional_manager_email || 'rm.quality@lenskart.in';
    const auditorEmail = task.assignedAuditorEmail || task.auditedByEmail || 'qa.audit@lenskart.in';

    return {
      feEmail,
      amEmail,
      rmEmail,
      auditorEmail,
      list: [feEmail, amEmail, rmEmail, auditorEmail]
    };
  }, [task, currentUser]);

  // Preview Google Meet Info
  const meetPreview = useMemo(() => {
    if (!isSchedulingMeet) return null;
    return generateGoogleMeetLink({
      taskId: task.taskId || task.id,
      feName: task.feName,
      feEmail: attendeesData.feEmail,
      amEmail: attendeesData.amEmail,
      rmEmail: attendeesData.rmEmail,
      auditorEmail: attendeesData.auditorEmail,
      disputeCategory: category,
      disputeReason: reason,
      startTime: meetDate ? new Date(meetDate) : null
    });
  }, [isSchedulingMeet, task, attendeesData, category, reason, meetDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Please provide your explanation / grounds for disputing this fatal audit.');
      return;
    }

    setSubmitting(true);
    try {
      let meetPayload = null;
      if (isManager && isSchedulingMeet && meetPreview) {
        // Open Google Calendar event in new tab
        window.open(meetPreview.calendarUrl, '_blank');
        meetPayload = {
          meetUrl: meetPreview.meetUrl,
          meetTime: meetPreview.meetingTime,
          meetRequestedBy: currentUser?.full_name || currentUser?.name || 'Area Manager'
        };
      }

      await onSubmitDispute({
        taskId: task.id || task.taskId,
        category,
        reason: reason.trim(),
        proofUrl: proofUrl.trim(),
        raisedByRole: isFE ? 'FE' : (isManager ? (currentUser?.role || 'AM') : 'Staff'),
        raisedByName: currentUser?.full_name || currentUser?.name || 'Staff',
        scheduleMeet: Boolean(meetPayload),
        ...meetPayload
      });

      onClose();
    } catch (err) {
      alert(`Failed to submit dispute: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Raise Fatal Audit Objection &bull; Task #{task.taskId}
              </h3>
              <p className="text-[11px] text-slate-400">
                FE: <strong className="text-slate-200">{task.feName}</strong> ({task.feCode}) &bull; Hub: {task.facilityCode}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 24-Hour Dispute Window Badge Banner */}
        <div className="px-5 py-2.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-300">Contestation Window:</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${windowStatus.badgeClass}`}>
              {windowStatus.badgeText}
            </span>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            Audited: {task.auditedAt ? new Date(task.auditedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Today'}
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-200">
          
          {/* Summary of Violations Marked by QA */}
          <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/30 space-y-1.5">
            <span className="font-bold text-red-300 block uppercase tracking-wider text-[10px]">
              Fatal Violations Marked by Central QA:
            </span>
            <ul className="list-disc pl-4 text-[11px] text-red-200 space-y-0.5">
              {(task.failedReasons || ['SOP checklist violation']).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {task.remarks && (
              <p className="text-[11px] text-slate-400 italic pt-1 border-t border-red-500/20">
                &ldquo;{task.remarks}&rdquo;
              </p>
            )}
          </div>

          {/* Dispute Category Selector */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">
              Dispute Category <span className="text-red-400">*</span>:
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {DISPUTE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Explanation Remarks */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">
              Explanation & Counter-Grounds <span className="text-red-400">*</span>:
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="State why this fatal mark was incorrect or unavoidable (e.g. Locus server timed out photo upload, camera lens moisture, customer rushed refraction, etc.)..."
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Counter-Proof URL / Photo */}
          <div>
            <label className="block font-bold text-slate-300 mb-1">
              Counter-Proof Link / Photo URL (Optional):
            </label>
            <input
              type="url"
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="https://drive.google.com/... or uploaded photo link"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* AM & RM EXCLUSIVE: Google Meet Dispute Scheduling */}
          {isManager && (
            <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-white text-xs">
                    Area / Regional Manager: Schedule Dispute Google Meet
                  </span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSchedulingMeet}
                    onChange={(e) => setIsSchedulingMeet(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-300 font-semibold">Enable Meet</span>
                </label>
              </div>

              {isSchedulingMeet && (
                <div className="space-y-3 pt-2 border-t border-slate-800 animate-fade-in">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Meeting Date & Time:</label>
                    <input
                      type="datetime-local"
                      value={meetDate}
                      onChange={(e) => setMeetDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 w-full sm:w-auto"
                    />
                  </div>

                  {meetPreview && (
                    <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] space-y-1 font-mono">
                      <div className="text-amber-300 font-bold flex items-center gap-1 font-sans">
                        <span>📅 Google Meet Event:</span>
                        <span className="text-white">{meetPreview.meetUrl}</span>
                      </div>
                      <div className="text-slate-400">
                        Attendees in copy: {attendeesData.list.join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Note for FE */}
          {isFE && (
            <div className="p-3 rounded-lg bg-slate-850 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <span>
                As a Field Executive, your objection is submitted directly into the <strong>Fatal Objection Hub</strong> for Senior QA review. Your Area Manager or Regional Manager can also schedule a joint Google Meet review if required.
              </span>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || !windowStatus.canDispute}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-900/30 transition-all cursor-pointer disabled:opacity-40"
            >
              {submitting ? (
                <span>Submitting...</span>
              ) : isManager && isSchedulingMeet ? (
                <>
                  <Calendar className="w-4 h-4" />
                  <span>Submit Objection & Open Google Meet</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Objection for Review</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
