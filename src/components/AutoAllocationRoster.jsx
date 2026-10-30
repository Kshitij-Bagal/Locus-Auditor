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
  Loader2,
  Info
} from 'lucide-react';
import { runAutoAllocationAlgorithm } from '../lib/supabase.js';
import { rosterApi, tasksApi } from '../api/client.js';

export default function AutoAllocationRoster({
  tasks = [],
  users = [],
  onAutoAllocate,
  onTasksAllocated,
  onUpdateUserRole,
  currentUserRole
}) {
  const allocateCallback = onAutoAllocate || onTasksAllocated;

  // Filter real auditors from active users list
  const actualAuditorsFromUsers = useMemo(() => {
    return (users || []).filter(u => {
      if (u.is_active === false) return false;
      const roleMatch = u.role === 'Auditor';
      const rolesMatch = Array.isArray(u.roles) && u.roles.includes('Auditor');
      const emailMatch = u.email && u.email.toLowerCase().includes('auditor');
      return roleMatch || rolesMatch || emailMatch;
    });
  }, [users]);

  // Auditor team roster state
  const [roster, setRoster] = useState([]);
  const [allocationLog, setAllocationLog] = useState(null);
  const [isAllocating, setIsAllocating] = useState(false);
  const [showAddAuditorModal, setShowAddAuditorModal] = useState(false);
  const [selectedStaffToPromote, setSelectedStaffToPromote] = useState('');

  // Sync roster with real users and fetch persisted shift statuses from Supabase
  useEffect(() => {
    let isMounted = true;

    async function initRoster() {
      // 1. Initial mapping from actual users
      let baseRoster = actualAuditorsFromUsers.map(u => ({
        id: u.id,
        auth_user_id: u.auth_user_id || u.id,
        full_name: u.full_name || u.name || 'Auditor',
        email: u.email,
        hub: u.facility_code || u.city || 'Ahmedabad',
        employeeCode: u.employee_code || u.person_id || '',
        shiftStatus: 'AVAILABLE'
      }));

      // Fallback: If no users currently tagged as Auditor, provide Pooja Verma corporate seed
      if (baseRoster.length === 0) {
        baseRoster = [
          { 
            id: 'usr_auditor_pooja', 
            full_name: 'Pooja Verma', 
            email: 'auditor.pooja@lenskart.in', 
            hub: 'Ahmedabad Hub', 
            employeeCode: 'AUD001',
            shiftStatus: 'AVAILABLE' 
          }
        ];
      }

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

  // Tasks without audit photos that are purposefully excluded from allocation
  const unassignedWithoutPhotos = useMemo(() => {
    return tasks.filter(t => {
      const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      const isPending = !t.auditStatus || t.auditStatus === 'PENDING';
      const isUnassigned = !t.assignedAuditorId && !t.assignedAuditorName;
      return !hasPhotos && isPending && isUnassigned;
    });
  }, [tasks]);

  // Active auditors not on leave
  const activeAuditors = useMemo(() => {
    return roster.filter(a => a.shiftStatus !== 'ON_LEAVE');
  }, [roster]);

  // Estimate tasks per auditor
  const expectedSharePerAuditor = useMemo(() => {
    if (activeAuditors.length === 0 || unassignedPool.length === 0) return 0;
    const totalWeight = activeAuditors.reduce((sum, a) => sum + (a.shiftStatus === 'HALF_DAY' ? 0.5 : 1), 0);
    return totalWeight > 0 ? Math.round(unassignedPool.length / totalWeight) : 0;
  }, [unassignedPool.length, activeAuditors]);

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

  // Quick Promote Staff to Auditor Role
  const handlePromoteStaff = async () => {
    if (!selectedStaffToPromote) return;
    const targetUser = users.find(u => u.id === selectedStaffToPromote);
    if (!targetUser) return;

    if (onUpdateUserRole) {
      await onUpdateUserRole(targetUser.id, 'Auditor');
    }

    setRoster(prev => [
      ...prev,
      {
        id: targetUser.id,
        auth_user_id: targetUser.auth_user_id || targetUser.id,
        full_name: targetUser.full_name || targetUser.name,
        email: targetUser.email,
        hub: targetUser.facility_code || targetUser.city || 'National',
        employeeCode: targetUser.employee_code || targetUser.person_id || '',
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
          </div>
          <h2 className="text-2xl font-black text-white mt-1">
            Equal Task Distribution & Auditor Allocations
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Divides 100% of pending tasks with photos equally among actual registered auditors in Supabase. Each auditor will only see their own allocated queue.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
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
            <span className="text-xs font-semibold">Excluded (No Photos)</span>
            <ShieldAlert className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-300">{unassignedWithoutPhotos.length}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">Cannot audit • Omitted from queue</p>
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
                      <div className="font-bold text-white text-xs flex items-center gap-2">
                        <span>{auditor.full_name}</span>
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
