import React, { useState, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar.jsx';
import LoginPage from './components/LoginPage.jsx';
import UploadPage from './components/UploadPage.jsx';
import StatsCards from './components/StatsCards.jsx';
import FilterBar from './components/FilterBar.jsx';
import TaskTable from './components/TaskTable.jsx';
import TaskCardGrid from './components/TaskCardGrid.jsx';
import AuditModal from './components/AuditModal.jsx';
import EmailModal from './components/EmailModal.jsx';
import CentralRuleStudio from './components/CentralRuleStudio.jsx';
import AutoAllocationRoster from './components/AutoAllocationRoster.jsx';
import AssetRequisitionDashboard from './components/AssetRequisitionDashboard.jsx';
import UserManagement from './components/UserManagement.jsx';
import FEPortal from './components/FEPortal.jsx';
import DPlusOneEscalationDashboard from './components/DPlusOneEscalationDashboard.jsx';
import AccessControlPanel from './components/AccessControlPanel.jsx';
import ClusterManagerPortal from './components/ClusterManagerPortal.jsx';

import { authApi, tasksApi, rulesApi, replacementsApi, emailApi, usersApi, rosterApi } from './api/client.js';
import { INITIAL_CENTRAL_RULES } from './data/centralRules.js';
import { exportAuditReport } from './utils/excelParser.js';
import { getTaskSLAStatus, filterDPlusOneOverdueTasks } from './utils/slaHelper.js';
import { runAutoAllocationAlgorithm } from './lib/supabase.js';
import { 
  parseRoles, 
  hasPageAccess, 
  deriveRolesFromPages, 
  getUserEffectivePages, 
  getSavedPermissionsMap, 
  saveUserPagePermissions 
} from './utils/accessHelper.js';

import { 
  Upload, 
  Download, 
  FileCheck, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Layers, 
  Wrench, 
  FileSpreadsheet,
  Cpu,
  Inbox,
  UserCheck
} from 'lucide-react';

const AUTH_USER_KEY = 'locus_auth_user_v4';
const TASKS_CACHE_KEY = 'locus_tasks_cache_v4';

export default function App() {
  // Current Authenticated User (Supabase Auth Email + Password)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_USER_KEY);
      if (saved) {
        const u = JSON.parse(saved);
        const permMap = getSavedPermissionsMap();
        const emailKey = (u.email || '').trim().toLowerCase();
        const idKey = u.id ? String(u.id).toLowerCase() : '';
        const savedPages = permMap[emailKey] || permMap[idKey] || u.page_access;

        if (Array.isArray(savedPages) && savedPages.length > 0) {
          const derived = deriveRolesFromPages(savedPages);
          const currentRoles = parseRoles(u.roles || [u.role]);
          return {
            ...u,
            roles: Array.from(new Set([...currentRoles, ...derived])),
            page_access: savedPages,
            pageAccess: savedPages
          };
        }
        return {
          ...u,
          roles: parseRoles(u.roles || [u.role])
        };
      }
    } catch (e) {}
    return null;
  });

  // Active Page Navigation
  const [activePage, setActivePage] = useState(() => {
    const roles = parseRoles(currentUser?.roles || [currentUser?.role || 'Auditor']);
    if (roles.includes('AM') || roles.includes('RM')) return 'managerPortal';
    if (roles.includes('Central Ops')) return 'upload';
    if (roles.includes('FE')) return 'fePortal';
    if (roles.includes('Admin')) return 'replacements';
    if (roles.includes('GM') || roles.includes('BH')) return 'rules';
    return 'audits';
  });

  // Dispatches Data: Starts EMPTY by default (No fake demo data)
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem(TASKS_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Centrally Governed Rules (GM & BH)
  const [rules, setRules] = useState(INITIAL_CENTRAL_RULES);

  // Users List (SuperAdmin)
  const [users, setUsers] = useState([
    { id: 'usr_1', full_name: 'Kshitij Bagal', email: 'superadmin@lenskart.in', role: 'SuperAdmin', facility_code: 'All', person_id: 'EMP001', is_active: true },
    { id: 'usr_2', full_name: 'Sunil Kumar (Business Head)', email: 'bh.lenskart@lenskart.in', role: 'BH', facility_code: 'All', person_id: 'EMP002', is_active: true },
    { id: 'usr_3', full_name: 'Rajesh Sharma (General Manager)', email: 'gm.quality@lenskart.in', role: 'GM', facility_code: 'All', person_id: 'EMP003', is_active: true },
    { id: 'usr_4', full_name: 'Abhay Pandey (City Admin)', email: 'admin.ahmedabad@lenskart.in', role: 'Admin', facility_code: 'Ahmedabad', person_id: 'EMP004', is_active: true },
    { id: 'usr_5', full_name: 'Rohan Mehta (Central Ops)', email: 'ops.central@lenskart.in', role: 'Central Ops', facility_code: 'All', person_id: 'EMP005', is_active: true },
    { id: 'usr_6', full_name: 'Pooja Verma (Auditor)', email: 'auditor.pooja@lenskart.in', role: 'Auditor', facility_code: 'Ahmedabad', person_id: 'AUD001', is_active: true },
    { id: 'usr_7', full_name: 'Mohammed Aman Shaikh', email: 'fe.aman@lenskart.in', role: 'FE', facility_code: 'Ahmedabad', person_id: '227563', is_active: true }
  ]);

  // UI & Filter States
  const [viewMode, setViewMode] = useState('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedAuditStatus, setSelectedAuditStatus] = useState('ALL');
  const [selectedAuditorFilter, setSelectedAuditorFilter] = useState('ALL');
  const [onlyWithImages, setOnlyWithImages] = useState(false);
  const [onlyDPlusOneOverdue, setOnlyDPlusOneOverdue] = useState(false);

  // Modals
  const [inspectingTask, setInspectingTask] = useState(null);
  const [emailingTask, setEmailingTask] = useState(null);
  const [toast, setToast] = useState(null);

  // Auditor and Supervisor Role Detection (handles multi-role strings & arrays)
  const userRoles = useMemo(() => {
    return parseRoles(currentUser?.roles || [currentUser?.role || 'Auditor']);
  }, [currentUser]);

  const isSuperAdmin = userRoles.includes('SuperAdmin');
  const isCentralOps = userRoles.includes('Central Ops');

  // National supervisor mode (can view all auditors' tasks across India):
  // STRICTLY restricted to SuperAdmin and Central Ops!
  const canViewAllAuditorsTasks = isSuperAdmin || isCentralOps;

  // Auditor scoping mode:
  // If the user has Auditor role (even if combined with City Admin/Admin, BH, GM):
  // In the Audits console, they must strictly only see tasks allocated to THEM!
  const isAuditorOnly = !canViewAllAuditorsTasks;

  const isSupervisorOrAdmin = useMemo(() => {
    return isSuperAdmin || 
      userRoles.includes('Central Ops') || 
      userRoles.includes('Admin') ||
      userRoles.includes('BH') ||
      userRoles.includes('GM');
  }, [isSuperAdmin, userRoles]);

  // Actual real auditors list from users (supports multi-role parsing)
  const realAuditors = useMemo(() => {
    return (users || []).filter(u => 
      u.is_active !== false && 
      (parseRoles(u.roles || [u.role]).includes('Auditor') || (u.email && u.email.toLowerCase().includes('auditor')))
    );
  }, [users]);

  // Sync session on mount
  useEffect(() => {
    async function loadData() {
      // 1. Check active Supabase Auth session
      const session = await authApi.getSession();
      if (session?.profile) {
        setCurrentUser(session.profile);
      }

      // 2. Fetch tasks from REST API
      const dbTasks = await tasksApi.getTasks();
      if (dbTasks && dbTasks.length > 0) {
        setTasks(dbTasks);
      }

      // 3. Fetch rules from REST API
      const dbRules = await rulesApi.getRules();
      if (dbRules && dbRules.length > 0) {
        setRules(dbRules);
      }

      // 4. Fetch user profiles from Supabase database
      const dbUsers = await usersApi.getUsers();
      if (dbUsers && dbUsers.length > 0) {
        setUsers(dbUsers);
      }
    }
    loadData();
  }, []);

  // Persist cache
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(AUTH_USER_KEY);
      }
      localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
    } catch (e) {}
  }, [currentUser, tasks]);

  // Security & UX guard: ONLY redirect if user is STRICTLY GM or BH without Auditor or SuperAdmin privilege
  useEffect(() => {
    const userRoles = Array.isArray(currentUser?.roles) && currentUser.roles.length > 0
      ? currentUser.roles
      : [currentUser?.role || 'Auditor'];

    const hasAuditorPrivilege = userRoles.includes('Auditor') || userRoles.includes('SuperAdmin');
    const isStrictOnlyGMorBH = (userRoles.includes('BH') || userRoles.includes('GM')) && !hasAuditorPrivilege;

    if (isStrictOnlyGMorBH && activePage === 'audits') {
      setActivePage('rules');
    }
  }, [currentUser, activePage]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Auth Handlers
  const handleLoginSuccess = (userProfile) => {
    // Enrich with permissions cache & derive multi-roles
    const permMap = getSavedPermissionsMap();
    const cleanEmail = (userProfile.email || '').trim().toLowerCase();
    const idKey = userProfile.id ? String(userProfile.id).toLowerCase() : '';
    const savedPages = permMap[cleanEmail] || permMap[idKey] || userProfile.page_access;

    let enrichedProfile = { ...userProfile };
    if (Array.isArray(savedPages) && savedPages.length > 0) {
      enrichedProfile.page_access = savedPages;
      enrichedProfile.pageAccess = savedPages;
      const derived = deriveRolesFromPages(savedPages);
      const currentRoles = parseRoles(userProfile.roles || [userProfile.role]);
      enrichedProfile.roles = Array.from(new Set([...currentRoles, ...derived]));
    } else {
      enrichedProfile.roles = parseRoles(userProfile.roles || [userProfile.role]);
    }

    setCurrentUser(enrichedProfile);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(enrichedProfile));

    // Route to appropriate first page according to effective page permissions
    const accessible = getUserEffectivePages(enrichedProfile);
    const userRoleList = parseRoles(enrichedProfile.roles || [enrichedProfile.role]);
    if ((userRoleList.includes('AM') || userRoleList.includes('RM')) && accessible.includes('managerPortal')) {
      setActivePage('managerPortal');
    } else if (accessible.includes('audits')) {
      setActivePage('audits');
    } else if (accessible.includes('upload')) {
      setActivePage('upload');
    } else if (accessible.includes('rules')) {
      setActivePage('rules');
    } else if (accessible.includes('replacements')) {
      setActivePage('replacements');
    } else if (accessible.length > 0) {
      setActivePage(accessible[0]);
    } else {
      setActivePage('audits');
    }

    showToast(`Welcome back, ${enrichedProfile.full_name || enrichedProfile.email}!`, 'success');
  };

  const handleLogout = async () => {
    await authApi.signOut();
    setCurrentUser(null);
    localStorage.removeItem(AUTH_USER_KEY);
    showToast('Signed out successfully.', 'info');
  };

  // Central Ops Write Operation: Upload Dispatches
  const handleUploadDispatches = async (parsedTasks) => {
    try {
      showToast(`Writing ${parsedTasks.length} dispatches to database...`, 'info');
      const res = await tasksApi.uploadDispatches(parsedTasks);
      setTasks(parsedTasks);
      showToast(`Write operation complete! Ingested ${parsedTasks.length} tasks.`, 'success');
      return res;
    } catch (err) {
      showToast(`Upload write failed: ${err.message}`, 'error');
      throw err;
    }
  };

  const handleExportTasks = () => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      exportAuditReport(tasks, `Locus_Dispatch_Audit_Report_${dateStr}.xlsx`);
      showToast('Audit report exported to Excel!', 'success');
    } catch (err) {
      showToast(`Export failed: ${err.message}`, 'error');
    }
  };

  // Auditor Actions: PASS (Write directly to DB)
  const handlePassAudit = async (taskId, auditPayload) => {
    try {
      const target = tasks.find(t => t.id === taskId);
      await tasksApi.passAudit({
        taskId,
        auditorName: currentUser?.full_name || 'Central Auditor',
        auditorLocation: currentUser?.facility_code || 'Ahmedabad Hub',
        remarks: auditPayload.remarks,
        criteriaStatus: auditPayload.criteriaStatus,
        replacements: auditPayload.replacements,
        taskData: target
      });

      // Update local state
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            auditStatus: 'PASSED',
            auditedAt: new Date().toISOString(),
            auditedBy: currentUser?.full_name || 'Auditor',
            remarks: auditPayload.remarks,
            criteriaStatus: auditPayload.criteriaStatus,
            replacements: auditPayload.replacements || []
          };
        }
        return t;
      }));

      showToast(`Task #${taskId} PASSED and saved to database!`, 'success');

      // Next task in queue
      const nextTask = tasks.find(t => t.id !== taskId && t.hasImages && t.auditStatus === 'PENDING');
      setInspectingTask(nextTask || null);
    } catch (err) {
      showToast(`Failed to save audit: ${err.message}`, 'error');
    }
  };

  // Auditor Actions: FATAL (Dispatches Email Notice to FE, AM, RM first, then saves to DB)
  const handleFatalAudit = async (taskId, auditPayload) => {
    const target = tasks.find(t => t.id === taskId);
    setInspectingTask(null);

    // Look up FE in users registry to automatically obtain their direct AM and RM emails
    const feUser = users.find(u => {
      if (!u) return false;
      const tId = String(target.feId || '').trim();
      const tCode = String(target.feCode || '').trim().toLowerCase();
      const uPersonId = String(u.person_id || u.employee_code || '').trim().toLowerCase();
      const tName = String(target.feName || '').trim().toLowerCase();
      const uName = String(u.full_name || '').trim().toLowerCase();
      const tEmail = String(target.feEmail || '').trim().toLowerCase();
      const uEmail = String(u.email || '').trim().toLowerCase();

      return (tId && uPersonId === tId) ||
             (tCode && (uPersonId === tCode || uEmail.includes(tCode))) ||
             (tEmail && uEmail === tEmail) ||
             (tName && (uName === tName || uName.includes(tName) || tName.includes(uName)));
    });

    let resolvedAmEmail = feUser?.reporting_manager_email || target.amEmail;
    let resolvedAmName = feUser?.reporting_manager_name || target.amName;
    let resolvedRmEmail = feUser?.regional_manager_email || target.rmEmail;
    let resolvedRmName = feUser?.regional_manager_name || target.rmName;

    // If AM or RM was linked via UUID foreign key (reporting_manager_id / regional_manager_id)
    if (!resolvedAmEmail && feUser?.reporting_manager_id) {
      const amObj = users.find(u => u.id === feUser.reporting_manager_id);
      if (amObj) {
        resolvedAmEmail = amObj.email;
        resolvedAmName = amObj.full_name;
      }
    }
    if (!resolvedRmEmail && feUser?.regional_manager_id) {
      const rmObj = users.find(u => u.id === feUser.regional_manager_id);
      if (rmObj) {
        resolvedRmEmail = rmObj.email;
        resolvedRmName = rmObj.full_name;
      }
    }

    // Fallback: look up by hub / facility code for AM and RM
    const hub = target.facilityCode || target.teamName || target.city;
    if (!resolvedAmEmail && hub) {
      const amObj = users.find(u => {
        const roles = parseRoles(u.roles || [u.role]);
        return roles.includes('AM') && (u.facility_code === hub || u.city === hub);
      });
      if (amObj) {
        resolvedAmEmail = amObj.email;
        resolvedAmName = amObj.full_name;
      }
    }
    if (!resolvedRmEmail) {
      const rmObj = users.find(u => {
        const roles = parseRoles(u.roles || [u.role]);
        return roles.includes('RM');
      });
      if (rmObj) {
        resolvedRmEmail = rmObj.email;
        resolvedRmName = rmObj.full_name;
      }
    }

    // Open Tri-Party Email Modal with auto-resolved AM and RM emails
    const updatedTaskForEmail = {
      ...target,
      feEmail: feUser?.email || target.feEmail || `${(target.feCode || 'fe').toLowerCase()}@lenskart.in`,
      feName: target.feName || feUser?.full_name,
      amEmail: resolvedAmEmail || 'am.operations@lenskart.in',
      amName: resolvedAmName || 'Area Manager',
      rmEmail: resolvedRmEmail || 'rm.quality@lenskart.in',
      rmName: resolvedRmName || 'Regional Manager',
      failedReasons: auditPayload.failedReasons,
      remarks: auditPayload.remarks,
      criteriaStatus: auditPayload.criteriaStatus,
      replacements: auditPayload.replacements
    };

    setEmailingTask(updatedTaskForEmail);
  };

  // Email Modal Confirm & Dispatch Callback
  const handleConfirmEmailAndFatal = async (taskId, { feEmail, amEmail, rmEmail, body }) => {
    try {
      const target = emailingTask || tasks.find(t => t.id === taskId);
      
      showToast('Dispatching email notice to FE, AM, RM & recording strike...', 'info');

      await tasksApi.failAudit({
        taskId,
        taskData: target,
        failedReasons: target.failedReasons || ['SOP non-compliance'],
        remarks: target.remarks || '',
        criteriaStatus: target.criteriaStatus || {},
        replacements: target.replacements || [],
        auditorName: currentUser?.full_name || 'Central Auditor',
        auditorLocation: currentUser?.facility_code || 'Ahmedabad Hub',
        feEmail,
        amEmail,
        rmEmail,
        improvementTips: [
          'Wear official Lenskart polo uniform with employee photo ID clearly visible',
          'Mount vision chart on telescoping standee at patient seated eye-level (never tape to walls)',
          'Ensure both Blue and Yellow ophthalmic penlights are powered and tested',
          'Organize all 6 clinical tools in clean condition inside kit tray',
          'Display optical frame trays neatly on living room flat surface'
        ]
      });

      // Update state
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            auditStatus: 'FATAL',
            auditedAt: new Date().toISOString(),
            auditedBy: currentUser?.full_name || 'Auditor',
            failedReasons: target.failedReasons || [],
            remarks: target.remarks || '',
            emailSent: true,
            emailSentAt: new Date().toISOString(),
            replacements: target.replacements || []
          };
        }
        return t;
      }));

      setEmailingTask(null);
      showToast(`FATAL recorded! Formal notice dispatched to FE, AM & RM.`, 'error');

      // Next task
      const nextTask = tasks.find(t => t.id !== taskId && t.hasImages && t.auditStatus === 'PENDING');
      if (nextTask) setInspectingTask(nextTask);
    } catch (err) {
      showToast(`Error recording fatal audit: ${err.message}`, 'error');
    }
  };

  // Rule Studio Actions (GM Draft -> BH Publish)
  const handleSaveRuleDraft = async (ruleId, draftData) => {
    await rulesApi.saveDraft(ruleId, draftData, currentUser);
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, status: 'DRAFT_PENDING_BH', draft: draftData } : r));
    showToast(`Proposed draft for rule "${ruleId}" submitted to Business Head!`, 'success');
  };

  const handleApproveRuleDraft = async (ruleId) => {
    const target = rules.find(r => r.id === ruleId);
    if (target?.draft) {
      await rulesApi.publishRule(ruleId, target.draft, currentUser);
      setRules(prev => prev.map(r => {
        if (r.id === ruleId) {
          return {
            ...r,
            ...r.draft,
            status: 'PUBLISHED',
            draft: null,
            publishedBy: currentUser?.full_name || 'Business Head',
            publishedAt: new Date().toISOString()
          };
        }
        return r;
      }));
      showToast(`Rule "${ruleId}" published live to national auditors!`, 'success');
    }
  };

  const handleDirectPublishRule = async (ruleId, ruleData) => {
    await rulesApi.publishRule(ruleId, ruleData, currentUser);
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...ruleData, status: 'PUBLISHED', draft: null } : r));
    showToast(`Rule "${ruleId}" directly published (BH Authority)!`, 'success');
  };

  // City Admin POS Ordering Action
  const handleUpdateReplacementPosStatus = async (taskId, repId, statusData) => {
    await replacementsApi.updatePosStatus(repId, {
      posStatus: statusData.posStatus,
      posOrderNumber: statusData.posOrderNumber,
      orderedByName: currentUser?.full_name || 'City Admin'
    });

    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const updatedReps = (t.replacements || []).map(r => r.id === repId ? { ...r, ...statusData } : r);
        return { ...t, replacements: updatedReps };
      }
      return t;
    }));
    showToast('POS replacement status updated!', 'success');
  };

  // User Management Actions (Direct Supabase Database Writes)
  const handleAddUser = async (newUser) => {
    try {
      showToast(`Adding ${newUser.full_name} to Supabase...`, 'info');
      const inserted = await usersApi.addUser(newUser);
      setUsers(prev => [inserted, ...prev]);
      showToast(`Added ${newUser.full_name} directly to Supabase!`, 'success');
    } catch (err) {
      showToast(`Failed to add user: ${err.message}`, 'error');
    }
  };

  const handleImportUsers = async (parsedRows) => {
    try {
      showToast(`Checking and syncing ${parsedRows.length} users with Supabase...`, 'info');
      const result = await usersApi.importUsers(parsedRows);

      // Refresh full users list directly from Supabase
      const latestUsers = await usersApi.getUsers();
      if (latestUsers && latestUsers.length > 0) {
        setUsers(latestUsers);
      } else if (result.imported && result.imported.length > 0) {
        setUsers(prev => [...result.imported, ...prev]);
      }

      if (result.insertedCount > 0 && result.skippedCount > 0) {
        showToast(`Imported ${result.insertedCount} new users into Supabase. Skipped ${result.skippedCount} existing.`, 'success');
      } else if (result.insertedCount > 0) {
        showToast(`Successfully added ${result.insertedCount} users directly to Supabase!`, 'success');
      } else {
        showToast(`All ${result.skippedCount} users already exist in Supabase database (skipped).`, 'info');
      }

      return result;
    } catch (err) {
      showToast(`User import failed: ${err.message}`, 'error');
      throw err;
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      await usersApi.updateUserRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      showToast('User role updated in Supabase.', 'info');
    } catch (err) {
      showToast(`Failed to update role: ${err.message}`, 'error');
    }
  };

  const handleToggleUserActive = async (userId) => {
    try {
      const targetUser = users.find(u => u.id === userId);
      const newStatus = targetUser ? !targetUser.is_active : false;
      await usersApi.toggleUserActive(userId, newStatus);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: newStatus } : u));
      showToast(`User ${newStatus ? 'activated' : 'deactivated'} in Supabase.`, 'info');
    } catch (err) {
      showToast(`Failed to toggle status: ${err.message}`, 'error');
    }
  };

  // Auto-Allocation Execution Handler: Persist directly to Supabase
  const handleAutoAllocate = async (customTasks, workloads) => {
    try {
      showToast('Preparing equal distribution across active auditors...', 'info');
      let tasksToSave = customTasks;
      let workloadsToSave = workloads;

      // If invoked directly without pre-calculated tasks (e.g. from Upload prompt)
      if (!tasksToSave) {
        const activeRoster = realAuditors.map(u => ({
          id: u.id,
          auth_user_id: u.auth_user_id || u.id,
          full_name: u.full_name || u.name,
          email: u.email,
          shiftStatus: 'AVAILABLE'
        }));
        const res = runAutoAllocationAlgorithm({
          tasks,
          rosterAuditors: activeRoster
        });
        tasksToSave = res.allocatedTasks;
        workloadsToSave = res.auditorWorkloads;
      }

      setTasks(tasksToSave);
      await tasksApi.saveAllocations(tasksToSave);
      if (workloadsToSave) {
        await rosterApi.syncAllocationCounts(workloadsToSave);
      }
      showToast('Tasks distributed equally among actual auditors and saved to database!', 'success');
      return true;
    } catch (err) {
      showToast(`Allocation save failed: ${err.message}`, 'error');
      throw err;
    }
  };

  // Reassignment Handler for D+1 Overdue Audits (BH & GM Console)
  const handleReassignTask = async ({ taskId, auditorId, auditorName }) => {
    try {
      showToast(`Reassigning task to ${auditorName}...`, 'info');
      await tasksApi.reassignTask({ taskId, auditorId, auditorName });
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            assignedAuditorId: auditorId,
            assignedAuditorName: auditorName,
            allocatedAt: new Date().toISOString()
          };
        }
        return t;
      }));
      showToast(`Task successfully reassigned to ${auditorName}!`, 'success');
    } catch (err) {
      showToast(`Reassignment failed: ${err.message}`, 'error');
      throw err;
    }
  };

  // Formal SLA Escalation Notice
  const handleSendEscalationNotice = (auditorName) => {
    showToast(`Escalation warning sent to ${auditorName}. CC: Sunil Kumar (BH) & Rajesh Sharma (GM).`, 'success');
  };

  // Direct Page Access Control: Save granular page permissions per user
  const handleSaveUserPermissions = async (userId, userEmail, pageIds) => {
    try {
      showToast('Persisting page permissions to Supabase & local cache...', 'info');
      const res = await usersApi.updateUserPermissions(userId, userEmail, pageIds);
      const derivedRoles = res?.roles || deriveRolesFromPages(pageIds);
      const primaryRole = res?.role || derivedRoles[0] || 'Auditor';

      // Update state in active users list
      setUsers(prev => prev.map(u => {
        const uEmail = (u.email || '').toLowerCase();
        const targetEmail = (userEmail || '').toLowerCase();
        if (u.id === userId || (uEmail && uEmail === targetEmail)) {
          return { 
            ...u, 
            role: primaryRole,
            roles: derivedRoles,
            page_access: pageIds, 
            pageAccess: pageIds 
          };
        }
        return u;
      }));

      // If current user's permissions were updated, update currentUser state immediately
      const curEmail = (currentUser?.email || '').toLowerCase();
      const targetEmail = (userEmail || '').toLowerCase();
      if (currentUser?.id === userId || (curEmail && curEmail === targetEmail)) {
        const updatedUser = {
          ...currentUser,
          role: primaryRole,
          roles: derivedRoles,
          page_access: pageIds,
          pageAccess: pageIds
        };
        setCurrentUser(updatedUser);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
      }

      showToast(`Access & roles updated for ${userEmail || 'staff'}!`, 'success');
    } catch (err) {
      showToast(`Failed to update page permissions: ${err.message}`, 'error');
    }
  };

  // Scoped Visible Tasks:
  // Each auditor strictly only sees tasks allocated to them!
  // SuperAdmin and Central Ops oversee all tasks, with optional filter by specific auditor
  const visibleTasks = useMemo(() => {
    // 1. Auditor mode: filter strictly by assigned auditor ID, email, person_id, or full name
    if (isAuditorOnly) {
      const myId = String(currentUser?.id || '').toLowerCase();
      const myAuthId = String(currentUser?.auth_user_id || '').toLowerCase();
      const myName = String(currentUser?.full_name || '').toLowerCase().trim();
      const myEmail = String(currentUser?.email || '').toLowerCase().trim();
      const myPersonId = String(currentUser?.person_id || currentUser?.employee_code || '').toLowerCase().trim();

      return tasks.filter(task => {
        const assignedId = String(task.assignedAuditorId || '').toLowerCase();
        const assignedName = String(task.assignedAuditorName || '').toLowerCase().trim();
        const assignedEmail = String(task.assignedAuditorEmail || '').toLowerCase().trim();

        // Must be assigned to someone
        if (!assignedId && !assignedName && !assignedEmail) return false;

        const matchId = assignedId && (
          assignedId === myId || 
          assignedId === myAuthId || 
          (myPersonId && assignedId === myPersonId)
        );
        const matchEmail = assignedEmail && myEmail && assignedEmail === myEmail;
        const matchName = assignedName && myName && (
          assignedName === myName || 
          myName.includes(assignedName) || 
          assignedName.includes(myName)
        );

        return Boolean(matchId || matchEmail || matchName);
      });
    }

    // 2. SuperAdmin / Central Ops mode: filter by selected auditor if chosen in FilterBar
    if (selectedAuditorFilter !== 'ALL') {
      if (selectedAuditorFilter === 'UNASSIGNED') {
        return tasks.filter(t => !t.assignedAuditorId && !t.assignedAuditorName);
      }
      return tasks.filter(t => {
        const tAudName = String(t.assignedAuditorName || '').toLowerCase();
        const tAudId = String(t.assignedAuditorId || '').toLowerCase();
        const filterVal = selectedAuditorFilter.toLowerCase();
        return tAudName === filterVal || tAudId === filterVal;
      });
    }

    return tasks;
  }, [tasks, isAuditorOnly, currentUser, selectedAuditorFilter]);

  // KPI Calculations (derived from visible tasks)
  const stats = useMemo(() => {
    const total = visibleTasks.length;
    const completed = visibleTasks.filter(t => t.status === 'COMPLETED').length;
    const cancelled = visibleTasks.filter(t => t.status === 'CANCELLED').length;
    const withImages = visibleTasks.filter(t => t.hasImages).length;
    const passed = visibleTasks.filter(t => t.auditStatus === 'PASSED').length;
    const fatal = visibleTasks.filter(t => t.auditStatus === 'FATAL').length;
    const pending = visibleTasks.filter(t => t.hasImages && (!t.auditStatus || t.auditStatus === 'PENDING')).length;
    const auditedCount = passed + fatal;
    const fatalRate = auditedCount > 0 ? Math.round((fatal / auditedCount) * 100) : 0;

    let replacementsCount = 0;
    visibleTasks.forEach(t => {
      if (t.replacements && Array.isArray(t.replacements)) {
        replacementsCount += t.replacements.length;
      }
    });

    const uniqueFEs = new Set(visibleTasks.map(t => t.feId || t.feCode).filter(Boolean));
    const uniqueZones = new Set(visibleTasks.map(t => t.zone).filter(Boolean));
    const fesWithFatal = new Set(visibleTasks.filter(t => t.auditStatus === 'FATAL').map(t => t.feId || t.feCode).filter(Boolean));

    return {
      total,
      completed,
      cancelled,
      withImages,
      passed,
      fatal,
      fatalCount: fatal,
      pending,
      pendingImages: pending,
      auditedCount,
      fatalRate,
      replacementsCount,
      totalFEs: uniqueFEs.size,
      totalZones: uniqueZones.size || 1,
      fesWithFatals: fesWithFatal.size,
      emailsSent: fatal
    };
  }, [visibleTasks]);

  // Distinct Zones and Task Statuses extracted dynamically from visible tasks
  const availableZones = useMemo(() => {
    const set = new Set();
    visibleTasks.forEach(t => {
      if (t.zone && typeof t.zone === 'string' && t.zone.trim()) {
        set.add(t.zone.trim());
      }
    });
    if (set.size === 0) {
      return ['Ahmedabad_Zone1', 'Ahmedabad_Zone2', 'Ahmedabad_Zone3'];
    }
    return Array.from(set).sort();
  }, [visibleTasks]);

  const availableStatuses = useMemo(() => {
    const set = new Set();
    visibleTasks.forEach(t => {
      if (t.status && typeof t.status === 'string' && t.status.trim()) {
        set.add(t.status.trim());
      }
    });
    if (set.size === 0) {
      return ['COMPLETED', 'CANCELLED'];
    }
    return Array.from(set).sort();
  }, [visibleTasks]);

  // Global D+1 overdue tasks (breached SLA across all dispatches)
  const overdueTasks = useMemo(() => {
    return filterDPlusOneOverdueTasks(tasks);
  }, [tasks]);

  // Auditor-specific overdue tasks (for urgent alert banner in auditor view)
  const myOverdueTasks = useMemo(() => {
    if (!isAuditorOnly) return [];
    return visibleTasks.filter(t => getTaskSLAStatus(t).isOverdue);
  }, [isAuditorOnly, visibleTasks]);

  // Filtered Tasks for Auditing (derived from visibleTasks)
  const filteredTasks = useMemo(() => {
    return visibleTasks.filter(task => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesId = task.taskId?.toLowerCase().includes(q);
        const matchesFE = task.feName?.toLowerCase().includes(q) || task.feCode?.toLowerCase().includes(q);
        const matchesCust = task.customerName?.toLowerCase().includes(q) || task.customerAddress?.toLowerCase().includes(q);
        const matchesPin = task.pin?.toLowerCase().includes(q) || task.pincode?.includes(q);
        if (!matchesId && !matchesFE && !matchesCust && !matchesPin) return false;
      }

      if (selectedZone !== 'ALL' && task.zone !== selectedZone) return false;
      if (selectedStatus !== 'ALL' && task.status !== selectedStatus) return false;
      if (selectedAuditStatus !== 'ALL' && task.auditStatus !== selectedAuditStatus) return false;
      if (onlyWithImages && !task.hasImages) return false;
      if (onlyDPlusOneOverdue && !getTaskSLAStatus(task).isOverdue) return false;

      return true;
    });
  }, [visibleTasks, searchQuery, selectedZone, selectedStatus, selectedAuditStatus, onlyWithImages, onlyDPlusOneOverdue]);

  // If user is not logged in, show dedicated Login Page
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2.5 text-xs font-semibold border animate-in slide-in-from-bottom-3 duration-200 ${
          toast.type === 'success' ? 'bg-emerald-900/90 text-emerald-200 border-emerald-500/50' :
          toast.type === 'error' ? 'bg-red-900/90 text-red-200 border-red-500/50' :
          'bg-slate-850 text-slate-200 border-slate-700'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-400" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Responsive Navigation Bar with Mobile Hamburger Menu */}
      <Navbar
        currentUser={currentUser}
        activePage={activePage}
        onNavigate={setActivePage}
        onLogout={handleLogout}
        overdueCount={overdueTasks.length}
      />

      {/* Page Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* PAGE 1: UPLOAD DISPATCHES (Central Ops Write Operation) */}
        {activePage === 'upload' && (
          <UploadPage
            onUploadComplete={handleUploadDispatches}
            totalIngestedCount={tasks.length}
            onExportTasks={handleExportTasks}
            tasks={tasks}
            onNavigate={setActivePage}
            onAutoAllocate={handleAutoAllocate}
            auditors={realAuditors}
          />
        )}

        {/* PAGE 2: IMAGE AUDITS CONSOLE */}
        {activePage === 'audits' && (
          <div className="space-y-6">
            
            {/* KPI Cards */}
            <StatsCards stats={stats} onFilterQuick={(status) => setSelectedAuditStatus(status)} />

            {/* Urgent SLA Alert Banner for Auditor if any of their tasks are D+1 overdue */}
            {isAuditorOnly && myOverdueTasks.length > 0 && (
              <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-200 animate-pulse shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-600/30 text-red-300 flex items-center justify-center shrink-0 border border-red-500/40">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">
                      ⚠️ URGENT SLA NOTICE: {myOverdueTasks.length} D+1 Overdue Task(s) in Your Queue
                    </div>
                    <p className="text-red-300/90 text-xs mt-0.5">
                      These audits have exceeded the 24-hour limit and are actively escalated to <strong>Sunil Kumar (BH)</strong> & <strong>Rajesh Sharma (GM)</strong>. Please audit them immediately.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOnlyDPlusOneOverdue(!onlyDPlusOneOverdue)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    onlyDPlusOneOverdue 
                      ? 'bg-white text-red-950 shadow-md' 
                      : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {onlyDPlusOneOverdue ? 'Showing Overdue Only' : `Filter My ${myOverdueTasks.length} Overdue Audits`}
                </button>
              </div>
            )}

            {/* Filter Bar */}
            <FilterBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedZone={selectedZone}
              setSelectedZone={setSelectedZone}
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              selectedAuditStatus={selectedAuditStatus}
              setSelectedAuditStatus={setSelectedAuditStatus}
              selectedAuditor={selectedAuditorFilter}
              setSelectedAuditor={setSelectedAuditorFilter}
              auditors={realAuditors}
              isAuditorOnly={isAuditorOnly}
              onlyWithImages={onlyWithImages}
              setOnlyWithImages={setOnlyWithImages}
              onlyDPlusOneOverdue={onlyDPlusOneOverdue}
              setOnlyDPlusOneOverdue={setOnlyDPlusOneOverdue}
              overdueCount={overdueTasks.length}
              viewMode={viewMode}
              setViewMode={setViewMode}
              zones={availableZones}
              statuses={availableStatuses}
              totalCount={visibleTasks.length}
              filteredCount={filteredTasks.length}
              onClearFilters={() => {
                setSearchQuery('');
                setSelectedZone('ALL');
                setSelectedStatus('ALL');
                setSelectedAuditStatus('ALL');
                setSelectedAuditorFilter('ALL');
                setOnlyWithImages(false);
                setOnlyDPlusOneOverdue(false);
              }}
              hasActiveFilters={Boolean(
                searchQuery || 
                selectedZone !== 'ALL' || 
                selectedStatus !== 'ALL' || 
                selectedAuditStatus !== 'ALL' || 
                selectedAuditorFilter !== 'ALL' || 
                onlyWithImages ||
                onlyDPlusOneOverdue
              )}
            />

            {/* Empty State when no dispatches uploaded */}
            {tasks.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-4 max-w-xl mx-auto my-8">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 text-blue-400 flex items-center justify-center mx-auto ring-1 ring-blue-500/20">
                  <Inbox className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white">No Dispatches Ingested Yet</h3>
                <p className="text-xs text-slate-400">
                  Central Operations can upload the raw Locus dispatch spreadsheet to populate today's routes and audit images.
                </p>
                {(currentUser.role === 'Central Ops' || currentUser.role === 'SuperAdmin') && (
                  <button
                    onClick={() => setActivePage('upload')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Go to Upload Dispatches</span>
                  </button>
                )}
              </div>
            ) : isAuditorOnly && visibleTasks.length === 0 ? (
              /* Dedicated Empty State for Auditor when 0 tasks are assigned to them */
              <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-3 max-w-xl mx-auto my-8 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-sky-600/10 text-sky-400 flex items-center justify-center mx-auto ring-1 ring-sky-500/20">
                  <UserCheck className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white">No Tasks Allocated to Your Queue</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  You currently have 0 assigned dispatches. Once Central Operations runs the Auto-Allocation Roster, your assigned audits will automatically appear here.
                </p>
              </div>
            ) : (
              /* Tasks Table or Grid View */
              viewMode === 'table' ? (
                <TaskTable
                  tasks={filteredTasks}
                  onInspect={(task) => setInspectingTask(task)}
                  onAuditTask={(task) => setInspectingTask(task)}
                  onQuickPass={(task) => handlePassAudit(task.id, { remarks: 'Quick pass by auditor' })}
                  onQuickFatal={(task) => setInspectingTask(task)}
                  onOpenEmail={(task) => setInspectingTask(task)}
                />
              ) : (
                <TaskCardGrid
                  tasks={filteredTasks}
                  onInspect={(task) => setInspectingTask(task)}
                  onAuditTask={(task) => setInspectingTask(task)}
                  onQuickPass={(task) => handlePassAudit(task.id, { remarks: 'Quick pass by auditor' })}
                  onQuickFatal={(task) => setInspectingTask(task)}
                  onOpenEmail={(task) => setInspectingTask(task)}
                />
              )
            )}

          </div>
        )}

        {/* PAGE 3: AUTO-ALLOCATION & ROSTER */}
        {activePage === 'allocation' && (
          <AutoAllocationRoster
            tasks={tasks}
            users={users}
            onAutoAllocate={handleAutoAllocate}
            onTasksAllocated={handleAutoAllocate}
            onUpdateUserRole={handleUpdateUserRole}
            currentUserRole={currentUser.role}
          />
        )}

        {/* PAGE: D+1 AUDIT SLA ESCALATION CONSOLE (BH & GM) */}
        {activePage === 'escalations' && (
          <DPlusOneEscalationDashboard
            tasks={tasks}
            auditors={realAuditors}
            currentUser={currentUser}
            onAuditTask={(task) => setInspectingTask(task)}
            onReassignTask={handleReassignTask}
            onSendEscalationNotice={handleSendEscalationNotice}
          />
        )}

        {/* PAGE 4: CENTRAL SOP RULE STUDIO (GM & BH) */}
        {activePage === 'rules' && (
          <CentralRuleStudio
            rules={rules}
            currentUserRole={currentUser.role}
            currentUserName={currentUser.full_name}
            onSaveDraft={handleSaveRuleDraft}
            onApproveDraft={handleApproveRuleDraft}
            onDirectPublish={handleDirectPublishRule}
          />
        )}

        {/* PAGE 5: ASSET REQUISITIONS & CITY ADMIN POS ORDERS */}
        {activePage === 'replacements' && (
          <AssetRequisitionDashboard
            tasks={tasks}
            currentUserRole={currentUser.role}
            auditorLocation={currentUser.facility_code}
            onUpdatePosStatus={handleUpdateReplacementPosStatus}
          />
        )}

        {/* PAGE: AM & RM CLUSTER OVERSIGHT PORTAL */}
        {activePage === 'managerPortal' && (
          <ClusterManagerPortal
            tasks={tasks}
            users={users}
            currentUser={currentUser}
            onOpenEmailForTask={(task) => setEmailingTask(task)}
            onNavigate={setActivePage}
            onFilterFE={(feCode) => {
              setSearchQuery(feCode);
              setActivePage('audits');
            }}
          />
        )}

        {/* PAGE 7: FE SELF-SERVICE PORTAL */}
        {activePage === 'fePortal' && (
          <FEPortal
            currentFE={currentUser}
            tasks={tasks}
            onLogout={handleLogout}
          />
        )}

        {/* PAGE 8: SUPERADMIN USER MANAGEMENT */}
        {activePage === 'users' && (
          <UserManagement
            users={users}
            onAddUser={handleAddUser}
            onImportUsers={handleImportUsers}
            onAddMultipleUsers={handleImportUsers}
            onUpdateUserRole={handleUpdateUserRole}
            onToggleUserActive={handleToggleUserActive}
            onNavigate={setActivePage}
          />
        )}

        {/* PAGE 9: GRANULAR ACCESS CONTROL PANEL */}
        {activePage === 'accessControl' && (
          <AccessControlPanel
            users={users}
            currentUser={currentUser}
            onSaveUserPermissions={handleSaveUserPermissions}
            onRefreshUsers={async () => {
              const fresh = await usersApi.getUsers();
              if (fresh && fresh.length > 0) setUsers(fresh);
            }}
          />
        )}

      </main>

      {/* SYSTEMATIC AUDIT & IMAGE INSPECTION MODAL */}
      {inspectingTask && (
        <AuditModal
          task={inspectingTask}
          onClose={() => setInspectingTask(null)}
          onPassAudit={handlePassAudit}
          onFatalAudit={handleFatalAudit}
          onNextTask={() => {
            const idx = filteredTasks.findIndex(t => t.id === inspectingTask.id);
            if (idx >= 0 && idx < filteredTasks.length - 1) {
              setInspectingTask(filteredTasks[idx + 1]);
            }
          }}
          onPrevTask={() => {
            const idx = filteredTasks.findIndex(t => t.id === inspectingTask.id);
            if (idx > 0) {
              setInspectingTask(filteredTasks[idx - 1]);
            }
          }}
          hasNext={filteredTasks.findIndex(t => t.id === inspectingTask.id) < filteredTasks.length - 1}
          hasPrev={filteredTasks.findIndex(t => t.id === inspectingTask.id) > 0}
          auditorName={currentUser.full_name}
          auditorLocation={currentUser.facility_code}
          rules={rules}
        />
      )}

      {/* TRI-PARTY AUDIT FAILURE NOTICE EMAIL MODAL (FE, AM, RM) */}
      {emailingTask && (
        <EmailModal
          task={emailingTask}
          onClose={() => setEmailingTask(null)}
          onSendEmail={handleConfirmEmailAndFatal}
          auditorName={currentUser.full_name}
        />
      )}

    </div>
  );
}
