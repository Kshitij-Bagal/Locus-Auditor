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
  Info,
  Zap,
  Key,
  Trash2,
  Plus
} from 'lucide-react';
import { runAutoAllocationAlgorithm } from '../lib/supabase.js';
import { rosterApi, tasksApi } from '../api/client.js';
import { parseRoles, hasAccess, displayRoleName, isEligibleForAuditRoster } from '../utils/accessHelper.js';
import { getTaskBatchDateYMD } from '../utils/dailyDigestHelper.js';
import { 
  getTempAuditorsRegistry, 
  registerTempAuditor, 
  updateTempAuditorQuota, 
  removeTempAuditor 
} from '../utils/temporaryAuditorHelper.js';

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
  const [isAddTempAuditor, setIsAddTempAuditor] = useState(true);
  const [tempQuotaInput, setTempQuotaInput] = useState(15);

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
        shiftStatus: 'AVAILABLE',
        isTemporary: false,
        targetQuota: null
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

      // 3. Merge active temporary surge auditors from registry
      const tempReg = getTempAuditorsRegistry();
      const tempEntries = Object.values(tempReg).filter(Boolean);
      const seenIds = new Set(baseRoster.map(b => String(b.id).toLowerCase()));

      tempEntries.forEach(entry => {
        const entryIdKey = String(entry.id).toLowerCase();
        if (!seenIds.has(entryIdKey)) {
          seenIds.add(entryIdKey);
          baseRoster.push({
            id: entry.id,
            auth_user_id: entry.userId || entry.id,
            full_name: entry.name || entry.full_name || 'Temporary Auditor',
            email: entry.email,
            hub: entry.hub || 'Surge Shift',
            employeeCode: entry.employeeCode || '',
            role: entry.role || 'Temporary Auditor',
            roles: [entry.role || 'Temporary Auditor'],
            shiftStatus: 'AVAILABLE',
            isTemporary: true,
            targetQuota: entry.targetQuota || 15,
            accessStatus: entry.accessStatus || 'ACTIVE'
          });
        } else {
          baseRoster = baseRoster.map(b => {
            if (String(b.id).toLowerCase() === entryIdKey) {
              return {
                ...b,
                isTemporary: true,
                targetQuota: entry.targetQuota || 15,
                accessStatus: entry.accessStatus || 'ACTIVE'
              };
            }
            return b;
          });
        }
      });

      if (isMounted) {
        setRoster(baseRoster);
      }
    }

    initRoster();

    // Listen for temporary auditor updates from across components
    const handleTempChanged = () => {
      const tempReg = getTempAuditorsRegistry();
      setRoster(prev => {
        return prev.map(a => {
          const entry = tempReg[String(a.id).toLowerCase()] || (a.email ? tempReg[String(a.email).toLowerCase()] : null);
          if (entry) {
            return {
              ...a,
              isTemporary: true,
              targetQuota: entry.targetQuota,
              accessStatus: entry.accessStatus
            };
          }
          return a;
        });
      });
    };

    window.addEventListener('locus_temp_auditor_changed', handleTempChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('locus_temp_auditor_changed', handleTempChanged);
    };
  }, [actualAuditorsFromUsers]);

  // Helper: Strictly check whether a task has already been audited by an auditor
  // Never touch, reassign, or auto-fatal any task that has already been audited!
  const isTaskAlreadyAudited = (t) => {
    if (!t) return false;
    const status = String(t.auditStatus || t.audit_status || '').toUpperCase();
    if (status === 'PASSED' || status === 'FATAL') return true;
    if (t.auditedAt || t.audited_at || t.auditedBy || t.audited_by_name) return true;
    return false;
  };

  // Available upload batch dates in tasks
  const availableBatchDates = useMemo(() => {
    const map = new Map();
    (tasks || []).forEach(t => {
      const d = getTaskBatchDateYMD(t);
      if (!d) return;
      const current = map.get(d) || { total: 0, pending: 0, fatal: 0, passed: 0 };
      current.total++;
      const st = (t.auditStatus || t.audit_status || 'PENDING').toUpperCase();
      if (st === 'FATAL') current.fatal++;
      else if (st === 'PASSED') current.passed++;
      else current.pending++;
      map.set(d, current);
    });
    return Array.from(map.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [tasks]);

  // Default to latest batch date
  const [selectedBatchDate, setSelectedBatchDate] = useState(() => '');
  // Carryover toggle: Always keep un-audited tasks from previous days in active slots and pool
  const [includeCarryover, setIncludeCarryover] = useState(true);

  useEffect(() => {
    if (!selectedBatchDate && availableBatchDates.length > 0) {
      setSelectedBatchDate(availableBatchDates[0].date);
    }
  }, [availableBatchDates, selectedBatchDate]);

  // Carryover pending tasks with photos from previous days that remain un-audited
  const carryoverPendingTasks = useMemo(() => {
    return (tasks || []).filter(t => {
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      if (!hasPhotos || isTaskAlreadyAudited(t)) return false;
      const d = getTaskBatchDateYMD(t);
      return selectedBatchDate && selectedBatchDate !== 'ALL' && d !== selectedBatchDate;
    });
  }, [tasks, selectedBatchDate]);

  // Scoped tasks: Includes selected batch date PLUS active un-audited carryover tasks from previous days
  const scopedTasks = useMemo(() => {
    if (!selectedBatchDate || selectedBatchDate === 'ALL') return tasks;
    return tasks.filter(t => {
      const d = getTaskBatchDateYMD(t);
      if (d === selectedBatchDate) return true;
      if (includeCarryover) {
        const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
        return hasPhotos && !isTaskAlreadyAudited(t);
      }
      return false;
    });
  }, [tasks, selectedBatchDate, includeCarryover]);

  // Strictly filter unassigned tasks that HAVE AUDIT PHOTOS waiting for an auditor
  const unassignedPool = useMemo(() => {
    return scopedTasks.filter(t => {
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      const isUnassigned = !t.assignedAuditorId && !t.assignedAuditorName;
      return hasPhotos && !isTaskAlreadyAudited(t) && isUnassigned;
    });
  }, [scopedTasks]);

  // All pending tasks with photos (both currently assigned and unassigned) that can be re-distributed
  const pendingAuditablePool = useMemo(() => {
    return scopedTasks.filter(t => {
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      return hasPhotos && !isTaskAlreadyAudited(t);
    });
  }, [scopedTasks]);

  // Tasks without audit photos that are purposefully excluded from allocation
  const unassignedWithoutPhotos = useMemo(() => {
    return scopedTasks.filter(t => {
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      const isUnassigned = !t.assignedAuditorId && !t.assignedAuditorName;
      return !hasPhotos && !isTaskAlreadyAudited(t) && isUnassigned;
    });
  }, [scopedTasks]);

  // Completed leads with missing/blank image evidence eligible for Auto-Fatal by System
  const blankCompletedTasks = useMemo(() => {
    return scopedTasks.filter(t => {
      const isCompleted = String(t.status || '').toUpperCase() === 'COMPLETED';
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && typeof t.images === 'object' && Object.values(t.images).some(Boolean)));
      return isCompleted && !hasPhotos && !isTaskAlreadyAudited(t);
    });
  }, [scopedTasks]);

  // Active auditors not on leave
  const activeAuditors = useMemo(() => {
    return roster.filter(a => a.shiftStatus !== 'ON_LEAVE');
  }, [roster]);

  const tempAuditors = useMemo(() => activeAuditors.filter(a => a.isTemporary), [activeAuditors]);
  const permanentAuditors = useMemo(() => activeAuditors.filter(a => !a.isTemporary), [activeAuditors]);
  const tempTotalQuota = useMemo(() => {
    return tempAuditors.reduce((sum, a) => sum + (Math.max(0, parseInt(a.targetQuota ?? a.quota ?? 15, 10))), 0);
  }, [tempAuditors]);

  // Estimate tasks per permanent auditor for the active batch after deducting temp auditor exact quotas
  const expectedSharePerAuditor = useMemo(() => {
    const poolSize = unassignedPool.length > 0 ? unassignedPool.length : pendingAuditablePool.length;
    if (activeAuditors.length === 0 || poolSize === 0) return 0;
    const remainingForPermanent = Math.max(0, poolSize - tempTotalQuota);
    if (permanentAuditors.length === 0) return 0;
    const permWeight = permanentAuditors.reduce((sum, a) => sum + (a.shiftStatus === 'HALF_DAY' ? 0.5 : 1), 0);
    return permWeight > 0 ? Math.round(remainingForPermanent / permWeight) : 0;
  }, [unassignedPool.length, pendingAuditablePool.length, activeAuditors.length, tempTotalQuota, permanentAuditors]);

  // Workload count per auditor for the active batch (accurately checks both ID and Name and highlights carryover)
  const auditorWorkloadMap = useMemo(() => {
    const map = {};
    roster.forEach(a => {
      const audId = String(a.id || '').toLowerCase();
      const audAuthId = String(a.auth_user_id || '').toLowerCase();
      const audName = String(a.full_name || '').toLowerCase().trim();

      const assigned = scopedTasks.filter(t => {
        const tId = String(t.assignedAuditorId || '').toLowerCase();
        const tName = String(t.assignedAuditorName || '').toLowerCase().trim();

        const matchId = tId && (tId === audId || tId === audAuthId);
        const matchName = tName && audName && tName === audName;
        return matchId || matchName;
      });

      const todayBatchAssigned = assigned.filter(t => getTaskBatchDateYMD(t) === selectedBatchDate);
      const carryoverAssigned = assigned.filter(t => getTaskBatchDateYMD(t) !== selectedBatchDate && !isTaskAlreadyAudited(t));

      const pending = assigned.filter(t => !isTaskAlreadyAudited(t)).length;
      const completed = assigned.filter(t => isTaskAlreadyAudited(t)).length;

      map[a.id] = {
        total: assigned.length,
        todayBatch: todayBatchAssigned.length,
        carryover: carryoverAssigned.length,
        pending,
        completed
      };
    });
    return map;
  }, [roster, scopedTasks, selectedBatchDate]);

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
      // 1. Run fair distribution algorithm using actual auditors on the active batch
      const result = runAutoAllocationAlgorithm({
        tasks: scopedTasks,
        rosterAuditors: roster
      });

      // Merge newly allocated tasks back into the full tasks array
      const allocMap = new Map((result.allocatedTasks || []).map(t => [String(t.id || t.taskId), t]));
      const allUpdatedTasks = tasks.map(t => allocMap.get(String(t.id || t.taskId)) || t);

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
        allocateCallback(allUpdatedTasks);
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
      // 1. Reset assignments ONLY on pending tasks with photos in the active batch
      const resetTasks = tasks.map(t => {
        const isFromBatch = !selectedBatchDate || selectedBatchDate === 'ALL' || getTaskBatchDateYMD(t) === selectedBatchDate;
        const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
        if (isFromBatch && hasPhotos && !isTaskAlreadyAudited(t)) {
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

      const batchResetTasks = resetTasks.filter(t => !selectedBatchDate || selectedBatchDate === 'ALL' || getTaskBatchDateYMD(t) === selectedBatchDate);

      // 2. Run equal distribution algorithm across currently active auditors for active batch
      const result = runAutoAllocationAlgorithm({
        tasks: batchResetTasks,
        rosterAuditors: roster
      });

      const allocMap = new Map((result.allocatedTasks || []).map(t => [String(t.id || t.taskId), t]));
      const allUpdatedTasks = resetTasks.map(t => allocMap.get(String(t.id || t.taskId)) || t);

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
        allocateCallback(allUpdatedTasks);
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

  // Dedicated handler to reallocate only the carryover D+1 overdue tasks among active on-duty auditors
  const handleReallocateCarryoverTasks = async () => {
    if (carryoverPendingTasks.length === 0) {
      alert('No carryover pending tasks from previous days to reallocate.');
      return;
    }
    if (activeAuditors.length === 0) {
      alert('All auditors are marked on leave. Please mark at least one auditor as Available.');
      return;
    }

    const confirmMsg = `Reallocate all ${carryoverPendingTasks.length} D+1 carryover tasks from previous days equally among ${activeAuditors.length} active on-duty auditor(s)?\n\nCompleted audits remain strictly untouched.`;
    if (!window.confirm(confirmMsg)) return;

    setIsAllocating(true);
    try {
      const result = runAutoAllocationAlgorithm({
        tasks: carryoverPendingTasks,
        rosterAuditors: activeAuditors
      });

      const allocMap = new Map((result.allocatedTasks || []).map(t => [String(t.id || t.taskId), t]));
      const allUpdatedTasks = tasks.map(t => allocMap.get(String(t.id || t.taskId)) || t);

      if (result.allocatedTasks && result.allocatedTasks.length > 0) {
        await tasksApi.saveAllocations(result.allocatedTasks);
      }

      if (allocateCallback) {
        allocateCallback(allUpdatedTasks);
      }

      setAllocationLog({
        timestamp: new Date().toLocaleTimeString(),
        assignedCount: result.newlyAssignedCount,
        note: `Reallocated ${result.newlyAssignedCount} D+1 carryover tasks across ${activeAuditors.length} auditors`
      });
    } catch (err) {
      alert(`Carryover reallocation error: ${err.message}`);
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

  // Update quota for temporary auditor
  const handleUpdateAuditorQuota = (auditorId, newQuota) => {
    const cleanQuota = Math.max(1, parseInt(newQuota, 10) || 15);
    updateTempAuditorQuota(auditorId, cleanQuota);
    setRoster(prev => prev.map(a => a.id === auditorId ? { ...a, targetQuota: cleanQuota } : a));
  };

  // Re-activate a temporary auditor whose quota was completed
  const handleReactivateTempAuditor = (auditorId) => {
    const aud = roster.find(a => a.id === auditorId);
    const newQuota = window.prompt(`Enter additional task quota to assign to ${aud?.full_name || 'auditor'}:`, '15');
    if (!newQuota) return;
    const cleanQuota = Math.max(1, parseInt(newQuota, 10) || 15);
    updateTempAuditorQuota(auditorId, cleanQuota);
    setRoster(prev => prev.map(a => a.id === auditorId ? { ...a, targetQuota: cleanQuota, accessStatus: 'ACTIVE' } : a));
  };

  // Remove temporary auditor
  const handleRemoveTempAuditor = (auditorId) => {
    if (!window.confirm('Remove this temporary auditor from surge roster and revoke Audits page access?')) return;
    removeTempAuditor(auditorId);
    setRoster(prev => prev.filter(a => a.id !== auditorId));
  };

  // Add staff member to allocation roster without modifying their system role
  const handlePromoteStaff = () => {
    if (!selectedStaffToPromote) return;
    const targetUser = users.find(u => u.id === selectedStaffToPromote);
    if (!targetUser) return;

    if (isAddTempAuditor) {
      const cleanQuota = Math.max(1, parseInt(tempQuotaInput, 10) || 15);
      registerTempAuditor({
        userId: targetUser.id,
        email: targetUser.email,
        name: targetUser.full_name || targetUser.name,
        role: targetUser.role,
        hub: targetUser.facility_code || targetUser.city || 'Surge Shift',
        employeeCode: targetUser.employee_code || targetUser.person_id || '',
        targetQuota: cleanQuota
      });

      setRoster(prev => [
        ...prev.filter(p => p.id !== targetUser.id),
        {
          id: targetUser.id,
          auth_user_id: targetUser.auth_user_id || targetUser.id,
          full_name: targetUser.full_name || targetUser.name,
          email: targetUser.email,
          hub: targetUser.facility_code || targetUser.city || 'Surge Shift',
          employeeCode: targetUser.employee_code || targetUser.person_id || '',
          role: targetUser.role,
          roles: parseRoles(targetUser.roles || [targetUser.role]),
          shiftStatus: 'AVAILABLE',
          isTemporary: true,
          targetQuota: cleanQuota,
          accessStatus: 'ACTIVE'
        }
      ]);
    } else {
      // Standard permanent auditor promotion
      setRoster(prev => [
        ...prev.filter(p => p.id !== targetUser.id),
        {
          id: targetUser.id,
          auth_user_id: targetUser.auth_user_id || targetUser.id,
          full_name: targetUser.full_name || targetUser.name,
          email: targetUser.email,
          hub: targetUser.facility_code || targetUser.city || 'National',
          employeeCode: targetUser.employee_code || targetUser.person_id || '',
          role: targetUser.role,
          roles: parseRoles(targetUser.roles || [targetUser.role]),
          shiftStatus: 'AVAILABLE',
          isTemporary: false,
          targetQuota: null
        }
      ]);
    }

    setShowAddAuditorModal(false);
    setSelectedStaffToPromote('');
    setIsAddTempAuditor(true);
    setTempQuotaInput(15);
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
          {/* Active Shift Batch Selector */}
          {availableBatchDates.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-sm">
                <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
                <select
                  value={selectedBatchDate}
                  onChange={(e) => setSelectedBatchDate(e.target.value)}
                  className="bg-transparent text-xs text-sky-300 font-bold focus:outline-none cursor-pointer pr-1"
                  title="Select upload batch to focus allocation and workloads strictly on today's active shift"
                >
                  <option value="ALL" className="bg-slate-800 text-white font-bold">All Batches ({tasks.length} cumulative)</option>
                  {availableBatchDates.map((b, idx) => (
                    <option key={b.date} value={b.date} className="bg-slate-800 text-white font-semibold">
                      Batch {b.date} {idx === 0 ? '★ Today / Latest' : ''} ({b.total} tasks • {b.pending} to audit)
                    </option>
                  ))}
                </select>
              </div>

              {/* Include Carryover Toggle */}
              {carryoverPendingTasks.length > 0 && selectedBatchDate !== 'ALL' && (
                <label 
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-sm select-none ${
                    includeCarryover 
                      ? 'bg-amber-950/70 border-amber-500/60 text-amber-200' 
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                  title="Keep all pending tasks from previous days active in slots and available for allocation"
                >
                  <input
                    type="checkbox"
                    checked={includeCarryover}
                    onChange={(e) => setIncludeCarryover(e.target.checked)}
                    className="rounded border-amber-500/40 bg-slate-950 text-amber-500"
                  />
                  <span>Include {carryoverPendingTasks.length} D+1 Carryover</span>
                </label>
              )}
            </div>
          )}

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

      {/* D+1 Carryover Backlog Alert Banner */}
      {carryoverPendingTasks.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/80 via-amber-950/40 to-slate-900 border border-amber-500/50 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0 animate-pulse">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
                  D+1 Escalation Notice
                </span>
                <h3 className="text-white font-bold text-sm">
                  {carryoverPendingTasks.length} Un-Audited Tasks from Previous Days Active in System
                </h3>
              </div>
              <p className="text-slate-300 text-xs mt-0.5">
                These visits have completed photos from previous dates that remain unaudited. They are actively escalated to <strong>Business Head (BH) & General Manager (GM)</strong> in the D+1 Console.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleReallocateCarryoverTasks}
              disabled={isAllocating || activeAuditors.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 flex items-center gap-2 transition-all cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Reallocate {carryoverPendingTasks.length} Carryover Tasks</span>
            </button>
          </div>
        </div>
      )}

        {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Ready for Allocation</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{unassignedPool.length}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {tempTotalQuota > 0 
              ? `Exact ${tempTotalQuota} temp quota + ${Math.max(0, unassignedPool.length - tempTotalQuota)} permanent` 
              : 'With photos • Waiting for auditor'}
          </p>
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
            <span className="text-xs font-semibold">On-Duty Auditors</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {activeAuditors.length} <span className="text-xs font-normal text-slate-400">/ {roster.length} registered</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {tempAuditors.length > 0 
              ? `${permanentAuditors.length} permanent + ${tempAuditors.length} temporary surge`
              : 'Available for day dispatches'}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Permanent Share</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-blue-400">
            ~{expectedSharePerAuditor} <span className="text-xs font-normal text-slate-400">tasks</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {tempTotalQuota > 0 ? `After ${tempTotalQuota} surge quota deduction` : 'Equal photo task distribution'}
          </p>
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
              const isTemp = Boolean(auditor.isTemporary);
              const isQuotaCompleted = isTemp && stats.pending === 0 && stats.completed > 0;

              return (
                <div 
                  key={auditor.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    isLeave 
                      ? 'bg-slate-950/40 opacity-70' 
                      : isTemp
                      ? 'bg-amber-950/10 hover:bg-amber-950/20'
                      : 'hover:bg-slate-850/50'
                  }`}
                >
                  {/* Auditor Info */}
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      isTemp
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : isLeave 
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

                        {isTemp ? (
                          <span className="text-[10px] px-2 py-0.5 rounded font-black font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm">
                            <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span>TEMPORARY AUDITOR</span>
                          </span>
                        ) : (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${
                            auditor.role === 'City Admin' || auditor.role === 'Admin'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                              : auditor.role === 'Central Ops'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {displayRoleName(auditor.role) || 'Auditor'}
                          </span>
                        )}

                        {/* Access status for temporary auditor */}
                        {isTemp && (
                          isQuotaCompleted ? (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Quota Done • Access Revoked</span>
                            </span>
                          ) : stats.pending > 0 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                              <Key className="w-3 h-3 text-sky-400" />
                              <span>Audits Access Active</span>
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              <span>Ready for Allocation</span>
                            </span>
                          )
                        )}

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

                  {/* Temporary Auditor Quota Input OR Current Assigned Counts */}
                  <div className="flex items-center gap-3.5 text-xs flex-wrap">
                    
                    {/* Exact Quota Input Field for Temporary Auditors */}
                    {isTemp && (
                      <div className="flex items-center gap-1.5 bg-slate-950/80 border border-amber-500/40 rounded-xl px-2.5 py-1.5 shadow-inner">
                        <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>Exact Quota:</span>
                        </span>
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={auditor.targetQuota ?? 15}
                          onChange={(e) => handleUpdateAuditorQuota(auditor.id, e.target.value)}
                          className="w-14 px-1.5 py-0.5 bg-slate-900 border border-amber-500/60 text-amber-200 font-mono font-black text-xs rounded text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                          title="Exact number of tasks to assign to this temporary auditor in the allocation run"
                        />
                        <span className="text-[11px] text-slate-400">tasks</span>
                      </div>
                    )}

                    <div className="bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                      <span className="text-[10px] text-amber-400 font-bold uppercase block">Pending</span>
                      <span className="font-extrabold text-amber-300 text-xs">{stats.pending} to do</span>
                      {stats.carryover > 0 && (
                        <span className="text-[9px] text-rose-400 font-mono block mt-0.5 font-bold">
                          ({stats.carryover} D+1 overdue)
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Audited</span>
                      <span className="font-bold text-emerald-400">{stats.completed} done</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Total Workload</span>
                      <span className="font-bold text-slate-300">{stats.total}</span>
                    </div>
                  </div>

                  {/* Shift Selector Buttons OR Temporary Auditor Actions */}
                  <div className="flex items-center gap-1.5 self-start sm:self-auto">
                    {isTemp ? (
                      <div className="flex items-center gap-2">
                        {isQuotaCompleted && (
                          <button
                            onClick={() => handleReactivateTempAuditor(auditor.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                            title="Assign more tasks and re-grant Audits access"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Assign More</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveTempAuditor(auditor.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-700 transition-colors cursor-pointer"
                          title="Remove from Temporary Auditor Roster"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
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
              Select an existing staff member to add to the audit roster for photo compliance checks.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Select Staff Member:
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

            {/* Temporary Surge Auditor Option */}
            <div className="p-3.5 bg-amber-950/25 border border-amber-500/30 rounded-xl space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAddTempAuditor}
                  onChange={(e) => setIsAddTempAuditor(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-800"
                />
                <div>
                  <span className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Add as Temporary Auditor (Surge Capacity)</span>
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    This staff member will be granted immediate access to the <strong>Audits Console</strong> for their surge shift. Once all their assigned tasks are audited, their Audits page access is <strong>automatically revoked</strong>.
                  </p>
                </div>
              </label>

              {isAddTempAuditor && (
                <div className="pt-2.5 border-t border-amber-500/20 flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-slate-300">
                    Exact Tasks to Allocate (Quota):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={tempQuotaInput}
                      onChange={(e) => setTempQuotaInput(e.target.value)}
                      className="w-20 px-2 py-1 bg-slate-900 border border-amber-500/50 rounded-lg text-xs font-bold text-center text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      title="Number of tasks this temporary auditor will audit"
                    />
                    <span className="text-xs text-slate-400">tasks</span>
                  </div>
                </div>
              )}
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
                {isAddTempAuditor ? 'Add as Temp Auditor' : 'Add as Permanent Auditor'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
