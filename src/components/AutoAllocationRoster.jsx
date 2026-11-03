import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  RotateCw, 
  Coffee, 
  UserX, 
  UserCheck, 
  ArrowRight, 
  TrendingUp, 
  Cpu, 
  Layers, 
  Sparkles, 
  UserPlus, 
  Building2, 
  ShieldAlert, 
  ShieldCheck, 
  Loader2, 
  Info 
} from 'lucide-react';
import { runAutoAllocationAlgorithm } from '../lib/supabase.js';
import { rosterApi, tasksApi } from '../api/client.js';
import { parseRoles, hasAccess, displayRoleName, isEligibleForAuditRoster } from '../utils/accessHelper.js';

export default function AutoAllocationRoster({
  tasks = [],
  users = [],
  onAutoAllocate,
  onTasksAllocated,
  onUpdateTasks,
  onAutoFatalTasks,
  onUpdateUserRole,
  currentUserRole
}) {
  const allocateCallback = onAutoAllocate || onTasksAllocated;

  // Persistent toggle: Include SuperAdmin in task distribution pool
  const [includeSuperAdmin, setIncludeSuperAdmin] = useState(() => {
    try {
      const saved = localStorage.getItem('locus_roster_include_superadmin');
      return saved === 'true';
    } catch (e) {
      return false;
    }
  });

  const handleToggleIncludeSuperAdmin = () => {
    setIncludeSuperAdmin(prev => {
      const next = !prev;
      try {
        localStorage.setItem('locus_roster_include_superadmin', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Filter eligible auditors from active users list:
  // Operational Policy: City Admins who hold access to the Audits page handle all photo auditing.
  // SuperAdmin can optionally be toggled into the distribution pool when also working as City Admin.
  const actualAuditorsFromUsers = useMemo(() => {
    return (users || []).filter(u => isEligibleForAuditRoster(u, { includeSuperAdmin }));
  }, [users, includeSuperAdmin]);

  // Auditor team roster state
  const [roster, setRoster] = useState([]);
  const [allocationLog, setAllocationLog] = useState(null);
  const [isAllocating, setIsAllocating] = useState(false);
  const [isAutoFatalling, setIsAutoFatalling] = useState(false);
  const [showAddAuditorModal, setShowAddAuditorModal] = useState(false);
  const [selectedStaffToPromote, setSelectedStaffToPromote] = useState('');

  // Sync roster with real users and fetch persisted shift statuses from Supabase
  useEffect(() => {
    let isMounted = true;

    async function initRoster() {
      // 1. Initial mapping from actual users (including City Admins and Central Ops)
      let baseRoster = actualAuditorsFromUsers.map(u => ({
        id: u.id,
        auth_user_id: u.auth_user_id || u.id,
        full_name: u.full_name || u.name || 'Auditor',
        email: u.email,
        hub: u.facility_code || u.city || 'Ahmedabad',
        employeeCode: u.employee_code || u.person_id || '',
        role: u.role || 'Auditor',
        roles: parseRoles(u.roles || [u.role]),
        shiftStatus: 'AVAILABLE'
      }));

      // 2. Fetch today's persistent shifts from Supabase auditor_roster
      try {
        const todayRoster = await rosterApi.getRoster();
        if (todayRoster && todayRoster.length > 0) {
          const shiftMap = new Map();
          todayRoster.forEach(r => shiftMap.set(r.auditor_id, r.shift_status));

          baseRoster = baseRoster.map(aud => {
            const savedShift = shiftMap.get(aud.id);
            if (savedShift) {
              return { ...aud, shiftStatus: savedShift };
            }
            return aud;
          });
        }
      } catch (err) {
        console.warn('Could not sync today shifts from database:', err.message);
      }

      if (isMounted) {
        setRoster(baseRoster);
      }
    }

    initRoster();

    return () => {
      isMounted = false;
    };
  }, [actualAuditorsFromUsers]);

  // Strictly filter unassigned tasks that HAVE AUDIT PHOTOS waiting for an auditor
  // (Tasks without images cannot be audited for equipment compliance and are omitted)
  const unassignedPool = useMemo(() => {
    return tasks.filter(t => {
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      const isPending = !t.auditStatus || t.auditStatus === 'PENDING';
      const isUnassigned = !t.assignedAuditorId && !t.assignedAuditorName;
      return hasPhotos && isPending && isUnassigned;
    });
  }, [tasks]);

  // Helper: Strictly check whether a task has already been audited by an auditor
  // Never touch, reassign, or auto-fatal any task that has already been audited!
  const isTaskAlreadyAudited = (t) => {
    if (!t) return false;
    const status = String(t.auditStatus || t.audit_status || '').toUpperCase();
    if (status === 'PASSED' || status === 'FATAL') return true;
    if (t.auditedAt || t.audited_at || t.auditedBy || t.audited_by_name) return true;
    return false;
  };

  // All pending tasks with photos (both currently assigned and unassigned) that can be re-distributed
  const pendingAuditablePool = useMemo(() => {
    return tasks.filter(t => {
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      return hasPhotos && !isTaskAlreadyAudited(t);
    });
  }, [tasks]);

  // Tasks without audit photos that are purposefully excluded from allocation
  const unassignedWithoutPhotos = useMemo(() => {
    return tasks.filter(t => {
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      const isUnassigned = !t.assignedAuditorId && !t.assignedAuditorName;
      return !hasPhotos && !isTaskAlreadyAudited(t) && isUnassigned;
    });
  }, [tasks]);

  // Completed leads with missing/blank image evidence eligible for Auto-Fatal by System
  // STRICT RULE: Only include leads that are strictly UN-AUDITED / PENDING!
  // If an auditor has already reviewed/audited this task, it must remain strictly untouched!
  const blankCompletedTasks = useMemo(() => {
    return (tasks || []).filter(t => {
      const isCompleted = String(t.status || '').toUpperCase() === 'COMPLETED';
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && typeof t.images === 'object' && Object.values(t.images).some(Boolean)));
      return isCompleted && !hasPhotos && !isTaskAlreadyAudited(t);
    });
  }, [tasks]);

  // Active auditors not on leave
  const activeAuditors = useMemo(() => {
    return roster.filter(a => a.shiftStatus !== 'ON_LEAVE');
  }, [roster]);

  // Estimate tasks per auditor
  const expectedSharePerAuditor = useMemo(() => {
    const poolSize = unassignedPool.length > 0 ? unassignedPool.length : pendingAuditablePool.length;
    if (activeAuditors.length === 0 || poolSize === 0) return 0;
    const totalWeight = activeAuditors.reduce((sum, a) => sum + (a.shiftStatus === 'HALF_DAY' ? 0.5 : 1), 0);
    return totalWeight > 0 ? Math.round(poolSize / totalWeight) : 0;
  }, [unassignedPool.length, pendingAuditablePool.length, activeAuditors]);

  // Workload count per auditor (accurately checks both ID and Name)
  const auditorWorkloadMap = useMemo(() => {
    const map = {};
    roster.forEach(a => {
      const audId = String(a.id || '').toLowerCase();
      const audAuthId = String(a.auth_user_id || '').toLowerCase();
      const audName = String(a.full_name || '').toLowerCase().trim();

      const assigned = tasks.filter(t => {
        const tId = String(t.assignedAuditorId || '').toLowerCase();
        const tName = String(t.assignedAuditorName || '').toLowerCase().trim();

        const matchId = tId && (tId === audId || tId === audAuthId);
        const matchName = tName && audName && tName === audName;
        return matchId || matchName;
      });

      const pending = assigned.filter(t => t.auditStatus === 'PENDING').length;
      const completed = assigned.filter(t => t.auditStatus !== 'PENDING').length;

      map[a.id] = {
        total: assigned.length,
        pending,
        completed
      };
    });
    return map;
  }, [roster, tasks]);

  // Shift status toggle & DB persistence
  const handleUpdateShift = async (auditorId, newStatus) => {
    const auditor = roster.find(a => a.id === auditorId);
    setRoster(prev => prev.map(a => {
      if (a.id === auditorId) {
        return { ...a, shiftStatus: newStatus };
      }
      return a;
    }));

    if (auditor) {
      const currentStats = auditorWorkloadMap[auditorId] || { total: 0 };
      await rosterApi.updateShiftStatus({
        auditorId,
        auditorName: auditor.full_name,
        shiftStatus: newStatus,
        currentAssigned: currentStats.total
      });
    }
  };

  // Direct Auto-Fatal by System: Mark all completed leads with missing/blank images as FATAL
  const handleAutoFatalBlankTasks = async () => {
    if (blankCompletedTasks.length === 0) {
      alert('No pending completed tasks without images found. All completed tasks either have photos or have already been audited.');
      return;
    }

    const confirmed = window.confirm(
      `Mark all ${blankCompletedTasks.length} completed tasks without images as FATAL?\n\n` +
      `• Database Attribution: "Auto Fatal by System"\n` +
      `• Failure Reason: Missing mandatory photo evidence (Zero images uploaded)\n` +
      `• Scope: ${blankCompletedTasks.length} leads in Supabase database.\n\n` +
      `Do you want to proceed?`
    );

    if (!confirmed) return;

    setIsAutoFatalling(true);

    try {
      // Filter strictly un-audited target tasks
      const safeTargetTasks = blankCompletedTasks.filter(t => !isTaskAlreadyAudited(t));
      if (safeTargetTasks.length === 0) {
        alert('All zero-photo completed tasks have already been audited. Nothing to auto-fatal.');
        return;
      }

      const targetIds = safeTargetTasks.map(t => String(t.id || t.taskId));
      await tasksApi.autoFatalBlankTasks(targetIds);

      const targetIdSet = new Set(targetIds);
      const nowIso = new Date().toISOString();
      const updatedTasks = tasks.map(t => {
        const tid = String(t.id || t.taskId);
        if (targetIdSet.has(tid)) {
          // Never overwrite any task that was already audited
          if (isTaskAlreadyAudited(t)) return t;

          return {
            ...t,
            auditStatus: 'FATAL',
            audit_status: 'FATAL',
            auditedAt: nowIso,
            auditedBy: 'Auto Fatal by System',
            audited_by_name: 'Auto Fatal by System',
            auditedLocation: 'Central Compliance Engine',
            auditor_remarks: 'Auto fatal by system: Completed task with zero mandatory photo evidence uploaded.',
            failedReasons: ['Missing mandatory photo evidence (Zero images uploaded)'],
            criteriaStatus: {
              selfie: 'FAIL',
              toolkit: 'FAIL',
              torches: 'FAIL',
              visionChart: 'FAIL',
              frameDisplay: 'FAIL'
            },
            replacements: [],
            emailSent: false,
            email_sent: false
          };
        }
        return t;
      });

      if (onAutoFatalTasks) {
        onAutoFatalTasks(updatedTasks, targetIds.length);
      } else if (onUpdateTasks) {
        onUpdateTasks(updatedTasks);
      } else if (allocateCallback) {
        allocateCallback(updatedTasks);
      }

      setAllocationLog({
        timestamp: new Date().toLocaleTimeString(),
        assignedCount: targetIds.length,
        note: `Applied FATAL to ${targetIds.length} completed leads with zero photos (Auto Fatal by System)`
      });
    } catch (err) {
      console.error('Auto-fatal error:', err);
      alert(`Auto-fatal error: ${err.message}`);
    } finally {
      setIsAutoFatalling(false);
    }
  };

  // Pure Equal Distribution Run
  const handleRunAllocation = async () => {
    if (unassignedPool.length === 0) {
      alert('No unassigned tasks waiting to be audited. All tasks are currently assigned.');
      return;
    }
    if (activeAuditors.length === 0) {
      alert('All auditors are marked on leave. Please mark at least one auditor as Available.');
      return;
    }

    setIsAllocating(true);

    try {
      // 1. Run fair distribution algorithm using actual auditors
      const result = runAutoAllocationAlgorithm({
        tasks,
        rosterAuditors: roster
      });

      // 2. Persist allocations in Supabase tasks table
      if (result.allocatedTasks && result.allocatedTasks.length > 0) {
        await tasksApi.saveAllocations(result.allocatedTasks);
      }

      // 3. Sync workload counters in Supabase auditor_roster
      if (result.auditorWorkloads) {
        await rosterApi.syncAllocationCounts(result.auditorWorkloads);
      }

      // 4. Update parent state
      if (allocateCallback) {
        allocateCallback(result.allocatedTasks);
      }

      setAllocationLog({
        timestamp: new Date().toLocaleTimeString(),
        assignedCount: result.newlyAssignedCount,
        workloads: result.auditorWorkloads
      });
    } catch (err) {
      alert(`Auto-allocation error: ${err.message}`);
    } finally {
      setIsAllocating(false);
    }
  };

  // Re-distribute all pending tasks equally among active auditors on shift
  const handleReallocateAllTasks = async () => {
    if (pendingAuditablePool.length === 0) {
      alert('No pending tasks with photos available for redistribution.');
      return;
    }
    if (activeAuditors.length === 0) {
      alert('All auditors are marked on leave. Please mark at least one auditor as Available.');
      return;
    }

    const confirmMsg = `Are you sure you want to re-distribute all ${pendingAuditablePool.length} pending tasks equally among the ${activeAuditors.length} active auditor(s) on shift?\n\nAlready completed audits (PASSED or FATAL) will remain strictly untouched.`;
    if (!window.confirm(confirmMsg)) return;

    setIsAllocating(true);

    try {
      // 1. Reset assignments ONLY on pending tasks with photos (completed audits are preserved completely)
      const resetTasks = tasks.map(t => {
        const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
        const isPending = !t.auditStatus || t.auditStatus === 'PENDING';
        if (hasPhotos && isPending) {
          return {
            ...t,
            assignedAuditorId: null,
            assignedAuditorName: null,
            assignedAuditorEmail: null,
            allocatedAt: null,
            allocationBatchId: null
          };
        }
        return t;
      });

      // 2. Run equal distribution algorithm across currently active auditors
      const result = runAutoAllocationAlgorithm({
        tasks: resetTasks,
        rosterAuditors: roster
      });

      // 3. Persist new allocations in Supabase tasks table
      if (result.allocatedTasks && result.allocatedTasks.length > 0) {
        await tasksApi.saveAllocations(result.allocatedTasks);
      }

      // 4. Sync workload counters in Supabase auditor_roster
      if (result.auditorWorkloads) {
        await rosterApi.syncAllocationCounts(result.auditorWorkloads);
      }

      // 5. Update parent state
      if (allocateCallback) {
        allocateCallback(result.allocatedTasks);
      }

      setAllocationLog({
        timestamp: new Date().toLocaleTimeString(),
        assignedCount: result.newlyAssignedCount,
        workloads: result.auditorWorkloads,
        note: `Re-distributed all ${result.newlyAssignedCount} pending tasks among ${activeAuditors.length} active auditors`
      });
    } catch (err) {
      alert(`Re-allocation error: ${err.message}`);
    } finally {
      setIsAllocating(false);
    }
  };

  // Emergency leave redistribution
  const handleReallocateLeaveAuditor = async (leaveAuditorId) => {
    const leaveAuditor = roster.find(a => a.id === leaveAuditorId);
    if (!leaveAuditor) return;

    setIsAllocating(true);

    try {
      const audId = String(leaveAuditorId).toLowerCase();
      const audName = String(leaveAuditor.full_name || '').toLowerCase().trim();

      // Reset pending tasks of this auditor
      const resetTasks = tasks.map(t => {
        const tId = String(t.assignedAuditorId || '').toLowerCase();
        const tName = String(t.assignedAuditorName || '').toLowerCase().trim();
        const isThisAuditor = (tId && tId === audId) || (tName && tName === audName);

        if (isThisAuditor && t.auditStatus === 'PENDING') {
          return {
            ...t,
            assignedAuditorId: null,
            assignedAuditorName: null,
            allocatedAt: null
          };
        }
        return t;
      });

      // Mark on leave in UI & DB
      await handleUpdateShift(leaveAuditorId, 'ON_LEAVE');

      // Distribute among remaining active auditors
      const remainingActive = roster.filter(a => a.id !== leaveAuditorId && a.shiftStatus !== 'ON_LEAVE');

      if (remainingActive.length === 0) {
        alert(`${leaveAuditor.full_name} is marked On Leave. No other active auditors available for redistribution.`);
        if (allocateCallback) allocateCallback(resetTasks);
        return;
      }

      const result = runAutoAllocationAlgorithm({
        tasks: resetTasks,
        rosterAuditors: remainingActive
      });

      // Persist reassigned tasks to Supabase
      if (result.allocatedTasks && result.allocatedTasks.length > 0) {
        await tasksApi.saveAllocations(result.allocatedTasks);
      }

      if (result.auditorWorkloads) {
        await rosterApi.syncAllocationCounts(result.auditorWorkloads);
      }

      if (allocateCallback) {
        allocateCallback(result.allocatedTasks);
      }

      setAllocationLog({
        timestamp: new Date().toLocaleTimeString(),
        assignedCount: result.newlyAssignedCount,
        workloads: result.auditorWorkloads,
        note: `Redistributed pending tasks from ${leaveAuditor.full_name}`
      });
    } catch (err) {
      alert(`Redistribution failed: ${err.message}`);
    } finally {
      setIsAllocating(false);
    }
  };

  // Add staff member to allocation roster without modifying their system role
  const handlePromoteStaff = () => {
    if (!selectedStaffToPromote) return;
    const targetUser = users.find(u => u.id === selectedStaffToPromote);
    if (!targetUser) return;

    // Preserve exact user role in the system - no role mutation
    setRoster(prev => [
      ...prev,
      {
        id: targetUser.id,
        auth_user_id: targetUser.auth_user_id || targetUser.id,
        full_name: targetUser.full_name || targetUser.name,
        email: targetUser.email,
        hub: targetUser.facility_code || targetUser.city || 'National',
        employeeCode: targetUser.employee_code || targetUser.person_id || '',
        role: targetUser.role,
        roles: parseRoles(targetUser.roles || [targetUser.role]),
        shiftStatus: 'AVAILABLE'
      }
    ]);

    setShowAddAuditorModal(false);
    setSelectedStaffToPromote('');
  };

  // Staff members eligible to be added to auditor team
  const nonAuditorStaff = useMemo(() => {
    const existingAuditorIds = new Set(roster.map(r => r.id));
    return (users || []).filter(u => !existingAuditorIds.has(u.id));
  }, [users, roster]);

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      
      {/* Title & Description */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Workload & Real Auditor Roster
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Live Database Sync</span>
            </span>
            {includeSuperAdmin && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1 animate-pulse">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>SuperAdmin in Roster</span>
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-white mt-1">
            Equal Task Distribution & Auditor Allocations
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Divides 100% of pending tasks with photos equally among active {includeSuperAdmin ? 'City Admins & SuperAdmin' : 'City Admins'} handling auditing on shift in Supabase. Each member only sees their allocated queue.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Include SuperAdmin in Distribution Toggle Button */}
          <button
            type="button"
            onClick={handleToggleIncludeSuperAdmin}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
              includeSuperAdmin
                ? 'bg-purple-950/70 border-purple-500/60 text-purple-200 hover:bg-purple-900/70 ring-1 ring-purple-500/30'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border-slate-700'
            }`}
            title="Toggle whether to include SuperAdmin in the task distribution pool"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${includeSuperAdmin ? 'text-purple-400' : 'text-slate-500'}`} />
            <span>Include SuperAdmin:</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-black uppercase ${
              includeSuperAdmin 
                ? 'bg-purple-500 text-white shadow-sm' 
                : 'bg-slate-900 text-slate-400 border border-slate-700'
            }`}>
              {includeSuperAdmin ? 'ON' : 'OFF'}
            </span>
          </button>

          {nonAuditorStaff.length > 0 && (
            <button
              onClick={() => setShowAddAuditorModal(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-sky-400" />
              <span>Add Auditor</span>
            </button>
          )}

          <button
            onClick={handleRunAllocation}
            disabled={isAllocating || unassignedPool.length === 0 || activeAuditors.length === 0}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white shadow-lg shadow-blue-500/25 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 self-start md:self-auto"
            title={unassignedPool.length === 0 ? "No unassigned tasks remaining" : `Distribute ${unassignedPool.length} unassigned tasks`}
          >
            {isAllocating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Distributing to Supabase...</span>
              </>
            ) : (
              <>
                <Cpu className="w-4 h-4" />
                <span>Distribute All Tasks ({unassignedPool.length})</span>
              </>
            )}
          </button>

          <button
            onClick={handleReallocateAllTasks}
            disabled={isAllocating || pendingAuditablePool.length === 0 || activeAuditors.length === 0}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-600/25 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 self-start md:self-auto"
            title={pendingAuditablePool.length === 0 ? "No pending tasks to reallocate" : `Re-distribute all ${pendingAuditablePool.length} pending tasks equally among active auditors`}
          >
            {isAllocating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Re-distributing...</span>
              </>
            ) : (
              <>
                <RotateCw className="w-4 h-4" />
                <span>Re-distribute Tasks ({pendingAuditablePool.length})</span>
              </>
            )}
          </button>

          {/* Direct Auto-Fatal Blank Image Tasks Button */}
          <button
            type="button"
            onClick={handleAutoFatalBlankTasks}
            disabled={isAutoFatalling || isAllocating || blankCompletedTasks.length === 0}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg self-start md:self-auto border ${
              blankCompletedTasks.length > 0
                ? 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white border-rose-500/40 shadow-rose-600/25 ring-1 ring-rose-500/30'
                : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-60'
            }`}
            title={
              blankCompletedTasks.length === 0
                ? 'No pending completed tasks without images'
                : `Apply FATAL to all ${blankCompletedTasks.length} completed tasks missing mandatory photos (Recorded as Auto Fatal by System)`
            }
          >
            {isAutoFatalling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Applying Auto-Fatal ({blankCompletedTasks.length})...</span>
              </>
            ) : (
              <>
                <ShieldAlert className={`w-4 h-4 ${blankCompletedTasks.length > 0 ? 'text-rose-200' : 'text-slate-500'}`} />
                <span>Auto-Fatal Blank Image Leads ({blankCompletedTasks.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Ready for Allocation</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{unassignedPool.length}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">With photos • Waiting for auditor</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Blank Image Leads</span>
            <ShieldAlert className={`w-4 h-4 ${blankCompletedTasks.length > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
          </div>
          <div className={`text-2xl font-black ${blankCompletedTasks.length > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
            {blankCompletedTasks.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {blankCompletedTasks.length > 0 ? 'Zero photos • Ready for auto-fatal' : 'All zero-photo leads processed'}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Active Auditors</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {activeAuditors.length} <span className="text-xs font-normal text-slate-400">/ {roster.length} registered</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Available for day's dispatches</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Share Per Auditor</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-blue-400">
            ~{expectedSharePerAuditor} <span className="text-xs font-normal text-slate-400">tasks</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Equal photo task distribution</p>
        </div>

      </div>

      {/* Success Notification */}
      {allocationLog && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white">Task Distribution Saved to Database!</span>
              <span className="text-emerald-300 ml-2">
                Assigned <strong>{allocationLog.assignedCount} tasks</strong> across {Object.keys(allocationLog.workloads || {}).length} auditors at {allocationLog.timestamp}.
                {allocationLog.note && ` (${allocationLog.note})`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Auditor Shift & Workload Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-850 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="font-bold text-sm text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-400" />
            <span>Actual Auditors & Current Live Workloads</span>
          </div>
          <span className="text-xs text-slate-400">
            Shifts and assignments automatically persist in Supabase
          </span>
        </div>

        {roster.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Users className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="font-bold text-white text-sm">No Auditors Found</h4>
            <p className="text-xs max-w-sm mx-auto">
              Please assign the Auditor role to staff members in User Management or click "Add Auditor" above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {roster.map(auditor => {
              const stats = auditorWorkloadMap[auditor.id] || { total: 0, pending: 0, completed: 0 };
              const isLeave = auditor.shiftStatus === 'ON_LEAVE';
              const isHalfDay = auditor.shiftStatus === 'HALF_DAY';

              return (
                <div 
                  key={auditor.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    isLeave ? 'bg-slate-950/40 opacity-70' : 'hover:bg-slate-850/50'
                  }`}
                >
                  {/* Auditor Info */}
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isLeave 
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                        : isHalfDay
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {(auditor.full_name || 'AU').split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-bold text-white text-xs flex items-center gap-2 flex-wrap">
                        <span>{auditor.full_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${
                          auditor.role === 'City Admin' || auditor.role === 'Admin'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : auditor.role === 'Central Ops'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {displayRoleName(auditor.role) || 'Auditor'}
                        </span>
                        {auditor.employeeCode && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-sky-400 font-mono">
                            {auditor.employeeCode}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">({auditor.hub})</span>
                      </div>
                      <div className="text-[11px] text-slate-400">{auditor.email}</div>
                    </div>
                  </div>

                  {/* Current Assigned Counts */}
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Assigned</span>
                      <span className="font-bold text-white">{stats.total} tasks</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Pending</span>
                      <span className="font-bold text-amber-400">{stats.pending} left</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Audited</span>
                      <span className="font-bold text-emerald-400">{stats.completed} done</span>
                    </div>
                  </div>

                  {/* Shift Selector Buttons */}
                  <div className="flex items-center gap-1.5 self-start sm:self-auto">
                    <button
                      onClick={() => handleUpdateShift(auditor.id, 'AVAILABLE')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        auditor.shiftStatus === 'AVAILABLE'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Available
                    </button>

                    <button
                      onClick={() => handleUpdateShift(auditor.id, 'HALF_DAY')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        auditor.shiftStatus === 'HALF_DAY'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Half Day
                    </button>

                    <button
                      onClick={() => handleReallocateLeaveAuditor(auditor.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        auditor.shiftStatus === 'ON_LEAVE'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title="Mark on leave and redistribute pending tasks to active team in Supabase"
                    >
                      On Leave
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Auditor Modal */}
      {showAddAuditorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                <span>Add Staff to Auditor Roster</span>
              </h3>
              <button 
                onClick={() => setShowAddAuditorModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Select an existing staff member to add to the quality auditor team and enable task allocations.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Select Employee:
              </label>
              <select
                value={selectedStaffToPromote}
                onChange={(e) => setSelectedStaffToPromote(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Choose a staff member --</option>
                {nonAuditorStaff.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.name} ({s.email}) - {s.role}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddAuditorModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePromoteStaff}
                disabled={!selectedStaffToPromote}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors cursor-pointer shadow-md"
              >
                Add as Auditor
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
