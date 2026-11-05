import React, { useState, useMemo } from 'react';
import { 
  Users, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  TrendingUp, 
  MapPin, 
  Search, 
  Filter, 
  Download, 
  UserCheck, 
  Building2, 
  ShoppingBag, 
  Clock, 
  ChevronRight, 
  Info, 
  Award,
  Layers,
  Phone,
  SendHorizontal,
  Video,
  XCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseRoles, displayRoleName } from '../utils/accessHelper.js';
import DisputeObjectionModal from './DisputeObjectionModal.jsx';
import { getDisputeWindowStatus } from '../utils/calendarHelper.js';

// Phonetic and canonical name normalizer for robust manager matching
export function normalizeManagerName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
    .replace(/chaudhary|choudhary|choudhari/g, 'choudhary')
    .replace(/santhosh|santosh/g, 'santosh')
    .replace(/gerg|garg/g, 'garg');
}

export function matchManagerName(nameA, nameB) {
  if (!nameA || !nameB) return false;
  if (nameA === 'ALL' || nameB === 'ALL') return true;
  const rawA = String(nameA).toLowerCase().trim();
  const rawB = String(nameB).toLowerCase().trim();
  if (rawA === rawB || rawA.includes(rawB) || rawB.includes(rawA)) return true;

  const normA = normalizeManagerName(nameA);
  const normB = normalizeManagerName(nameB);
  if (normA && normB && (normA === normB || normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  // Token matching for tokens of length >= 3
  const tokensA = String(nameA).toLowerCase().split(/[\s,.-]+/).filter(t => t.length >= 3);
  const tokensB = String(nameB).toLowerCase().split(/[\s,.-]+/).filter(t => t.length >= 3);
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      const nta = normalizeManagerName(ta);
      const ntb = normalizeManagerName(tb);
      if (nta === ntb || (nta.length >= 4 && ntb.length >= 4 && (nta.includes(ntb) || ntb.includes(nta)))) {
        return true;
      }
    }
  }

  return false;
}

export default function ClusterManagerPortal({
  tasks = [],
  users = [],
  currentUser,
  onOpenEmailForTask,
  onNavigate,
  onFilterFE,
  onRaiseDispute
}) {
  const [activeTab, setActiveTab] = useState('scorecard'); // 'scorecard' | 'fatals' | 'amComparison'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrikeFilter, setSelectedStrikeFilter] = useState('ALL'); // 'ALL' | 'CLEAN' | 'STRIKES_1' | 'STRIKES_2_PLUS'
  const [disputeModalTask, setDisputeModalTask] = useState(null);
  
  // User Role Detection
  const userRoles = useMemo(() => {
    return parseRoles(currentUser?.roles || [currentUser?.role || 'Auditor']);
  }, [currentUser]);

  const isAM = userRoles.includes('AM');
  const isRM = userRoles.includes('RM');
  const isSuperAdmin = userRoles.includes('SuperAdmin');
  const isExecutive = isSuperAdmin || userRoles.includes('GM') || userRoles.includes('BH') || userRoles.includes('Central Ops');

  // Discover all distinct AMs and RMs from the database user profiles
  const allAreaManagers = useMemo(() => {
    return (users || []).filter(u => {
      const roles = parseRoles(u.roles || [u.role]);
      return roles.includes('AM');
    });
  }, [users]);

  const allRegionalManagers = useMemo(() => {
    // 1. Direct RMs by role in users
    const list = (users || []).filter(u => {
      const roles = parseRoles(u.roles || [u.role]);
      return roles.includes('RM') || (u.facility_code && String(u.facility_code).startsWith('RM'));
    });

    const seenNames = new Set(list.map(u => normalizeManagerName(u.full_name || u.name)));

    // 2. Discover operational RMs referenced in user profiles (regional_manager_name) or tasks
    (users || []).forEach(u => {
      const rmName = u.regional_manager_name;
      if (rmName && rmName !== 'Regional Manager') {
        const norm = normalizeManagerName(rmName);
        if (norm && !seenNames.has(norm)) {
          seenNames.add(norm);
          list.push({
            id: u.regional_manager_id || `rm_${norm}`,
            full_name: rmName,
            email: u.regional_manager_email || '',
            facility_code: u.facility_code || ''
          });
        }
      }
    });

    (tasks || []).forEach(t => {
      const rmName = t.rmName;
      if (rmName && rmName !== 'Regional Manager') {
        const norm = normalizeManagerName(rmName);
        if (norm && !seenNames.has(norm)) {
          seenNames.add(norm);
          list.push({
            id: `rm_task_${norm}`,
            full_name: rmName,
            email: t.rmEmail || '',
            facility_code: t.facilityCode || ''
          });
        }
      }
    });

    return list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [users, tasks]);

  // Initial Filter State based on logged-in manager identity
  const [selectedAmFilter, setSelectedAmFilter] = useState(() => {
    if (isAM && !isExecutive && !isRM) {
      return currentUser?.full_name || currentUser?.email || 'ALL';
    }
    return 'ALL';
  });

  const [selectedRmFilter, setSelectedRmFilter] = useState(() => {
    if (isRM && !isExecutive) {
      return currentUser?.full_name || currentUser?.email || 'ALL';
    }
    return 'ALL';
  });

  // 1. Build Comprehensive Field Executives (FE) List with Manager Hierarchy
  const feMasterList = useMemo(() => {
    const feMap = new Map();

    // Map of AM users by id, email, and normalized name for fast hierarchy lookup
    const amUserMap = new Map();
    (users || []).forEach(u => {
      const roles = parseRoles(u.roles || [u.role]);
      if (roles.includes('AM')) {
        if (u.id) amUserMap.set(String(u.id), u);
        if (u.email) amUserMap.set(u.email.toLowerCase().trim(), u);
        const norm = normalizeManagerName(u.full_name || u.name);
        if (norm) amUserMap.set(norm, u);
      }
    });

    // Pass A: Seed FEs from users registry
    (users || []).forEach(u => {
      const roles = parseRoles(u.roles || [u.role]);
      if (roles.includes('FE') || (u.employee_code && String(u.employee_code).startsWith('FE'))) {
        const key = String(u.employee_code || u.person_id || u.email || u.id).trim().toLowerCase();
        
        // Find direct AM
        let amName = u.reporting_manager_name || '';
        let amEmail = u.reporting_manager_email || '';
        let amUser = null;

        if (u.reporting_manager_id && amUserMap.has(String(u.reporting_manager_id))) {
          amUser = amUserMap.get(String(u.reporting_manager_id));
        } else if (amEmail && amUserMap.has(amEmail.toLowerCase().trim())) {
          amUser = amUserMap.get(amEmail.toLowerCase().trim());
        } else if (amName) {
          const normAm = normalizeManagerName(amName);
          if (normAm && amUserMap.has(normAm)) {
            amUser = amUserMap.get(normAm);
          } else {
            amUser = (users || []).find(m => matchManagerName(m.full_name || m.name, amName));
          }
        }

        if (amUser) {
          amName = amUser.full_name || amUser.name || amName;
          amEmail = amUser.email || amEmail;
        }

        // Find direct RM
        let rmName = u.regional_manager_name || '';
        let rmEmail = u.regional_manager_email || '';
        let rmId = u.regional_manager_id || '';

        // If RM is missing on FE profile, inherit from reporting AM
        if ((!rmName || rmName === 'Regional Manager') && amUser) {
          rmName = amUser.regional_manager_name || rmName;
          rmEmail = amUser.regional_manager_email || rmEmail;
          rmId = amUser.regional_manager_id || rmId;
        }

        // If we have an rmId, look up RM profile in users
        if (rmId && (!rmName || rmName === 'Regional Manager' || !rmEmail)) {
          const rmUser = (users || []).find(m => String(m.id) === String(rmId));
          if (rmUser) {
            rmName = rmUser.full_name || rmUser.name || rmName;
            rmEmail = rmUser.email || rmEmail;
          }
        }

        // If still no RM, try matching by city/hub
        if (!rmName || rmName === 'Regional Manager') {
          const hubTarget = u.facility_code || u.city;
          if (hubTarget) {
            const hubMatch = allRegionalManagers.find(rm => rm.facility_code && String(rm.facility_code).toLowerCase().includes(String(hubTarget).toLowerCase()));
            if (hubMatch) {
              rmName = hubMatch.full_name;
              rmEmail = hubMatch.email;
              rmId = hubMatch.id;
            }
          }
        }

        // Canonicalize RM name against allRegionalManagers
        if (rmName && rmName !== 'Regional Manager') {
          const canonicalRm = allRegionalManagers.find(r => matchManagerName(r.full_name || r.name, rmName) || (rmEmail && r.email && r.email.toLowerCase() === rmEmail.toLowerCase()));
          if (canonicalRm) {
            rmName = canonicalRm.full_name || canonicalRm.name;
            if (!rmEmail) rmEmail = canonicalRm.email;
            if (!rmId) rmId = canonicalRm.id;
          }
        }

        feMap.set(key, {
          key,
          id: u.id,
          name: u.full_name || u.name || 'Field Executive',
          code: u.employee_code || u.person_id || 'FE',
          personId: u.person_id || u.employee_code || '',
          email: u.email || '',
          phone: u.phone || u.mobile || '',
          hub: u.facility_code || u.city || 'Ahmedabad',
          city: u.city || u.facility_code || 'Ahmedabad',
          zone: u.zone || 'Central Zone',
          amName: amName || 'Area Manager',
          amEmail: amEmail || 'am.operations@lenskart.in',
          rmName: rmName || 'Regional Manager',
          rmEmail: rmEmail || 'rm.quality@lenskart.in',
          rmId: rmId || '',
          totalTasks: 0,
          completedTasks: 0,
          withImages: 0,
          auditedTasks: 0,
          passedTasks: 0,
          fatalTasks: 0,
          replacementsCount: 0,
          fatalTasksList: []
        });
      }
    });

    // Pass B: Ingest tasks into FE buckets
    tasks.forEach(task => {
      const tCode = String(task.feCode || '').trim().toLowerCase();
      const tId = String(task.feId || '').trim().toLowerCase();
      const tEmail = String(task.feEmail || '').trim().toLowerCase();
      const tName = String(task.feName || '').trim().toLowerCase();

      // Find match in map
      let matched = null;
      if (tCode && feMap.has(tCode)) matched = feMap.get(tCode);
      else if (tId && feMap.has(tId)) matched = feMap.get(tId);
      else if (tEmail && feMap.has(tEmail)) matched = feMap.get(tEmail);
      else {
        // Find by name in seeded FEs
        for (const fe of feMap.values()) {
          const feNameLow = fe.name.toLowerCase();
          if (tName && (feNameLow === tName || feNameLow.includes(tName) || tName.includes(feNameLow))) {
            matched = fe;
            break;
          }
        }
      }

      // If task FE not yet in map, create entry dynamically
      if (!matched) {
        let taskAmName = task.amName || '';
        let taskAmEmail = task.amEmail || '';
        let taskRmName = task.rmName || '';
        let taskRmEmail = task.rmEmail || '';

        // Match canonical RM
        if (taskRmName) {
          const canonicalRm = allRegionalManagers.find(r => matchManagerName(r.full_name || r.name, taskRmName));
          if (canonicalRm) {
            taskRmName = canonicalRm.full_name || canonicalRm.name;
            if (!taskRmEmail) taskRmEmail = canonicalRm.email;
          }
        }

        const dynamicKey = tCode || tId || tEmail || `fe_${Date.now()}`;
        matched = {
          key: dynamicKey,
          id: dynamicKey,
          name: task.feName || 'Field Executive',
          code: task.feCode || task.feId || 'N/A',
          personId: task.feId || task.feCode || '',
          email: task.feEmail || `${(task.feCode || 'fe').toLowerCase()}@lenskart.in`,
          phone: '',
          hub: task.facilityCode || task.teamName || 'Ahmedabad',
          city: task.city || task.facilityCode || 'Ahmedabad',
          zone: task.zone || 'Central Zone',
          amName: taskAmName || 'Area Manager',
          amEmail: taskAmEmail || 'am.operations@lenskart.in',
          rmName: taskRmName || 'Regional Manager',
          rmEmail: taskRmEmail || 'rm.quality@lenskart.in',
          rmId: '',
          totalTasks: 0,
          completedTasks: 0,
          withImages: 0,
          auditedTasks: 0,
          passedTasks: 0,
          fatalTasks: 0,
          replacementsCount: 0,
          fatalTasksList: []
        };
        feMap.set(dynamicKey, matched);
      }

      // Aggregate task stats
      matched.totalTasks += 1;
      if (task.status === 'COMPLETED') matched.completedTasks += 1;
      if (task.hasImages) matched.withImages += 1;

      if (task.auditStatus === 'PASSED') {
        matched.auditedTasks += 1;
        matched.passedTasks += 1;
      } else if (task.auditStatus === 'FATAL') {
        matched.auditedTasks += 1;
        matched.fatalTasks += 1;
        matched.fatalTasksList.push(task);
      }

      if (Array.isArray(task.replacements) && task.replacements.length > 0) {
        matched.replacementsCount += task.replacements.length;
      }
    });

    return Array.from(feMap.values());
  }, [users, tasks, allRegionalManagers]);

  // Dynamic AM list scoped by selected RM (if an RM is selected)
  const availableAreaManagers = useMemo(() => {
    if (selectedRmFilter === 'ALL') {
      return allAreaManagers;
    }
    const amsUnderRm = new Set();
    feMasterList.forEach(fe => {
      if (matchManagerName(fe.rmName, selectedRmFilter) || (fe.rmEmail && fe.rmEmail.toLowerCase().includes(selectedRmFilter.toLowerCase().trim()))) {
        if (fe.amName && fe.amName !== 'Area Manager') amsUnderRm.add(normalizeManagerName(fe.amName));
        if (fe.amEmail) amsUnderRm.add(fe.amEmail.toLowerCase().trim());
      }
    });

    const filtered = allAreaManagers.filter(am => {
      const norm = normalizeManagerName(am.full_name || am.name);
      const email = (am.email || '').toLowerCase().trim();
      return amsUnderRm.has(norm) || (email && amsUnderRm.has(email)) || matchManagerName(am.regional_manager_name, selectedRmFilter);
    });

    return filtered.length > 0 ? filtered : allAreaManagers;
  }, [allAreaManagers, selectedRmFilter, feMasterList]);

  // 2. Filter FEs according to Manager Hierarchy Scope & UI Filters
  const scopedFEs = useMemo(() => {
    return feMasterList.filter(fe => {
      // AM Scope: If logged in user is AM (or AM filter selected)
      if (selectedAmFilter !== 'ALL') {
        const amTarget = selectedAmFilter.trim();
        const matchAmName = matchManagerName(fe.amName, amTarget);
        const matchAmEmail = fe.amEmail && fe.amEmail.toLowerCase().includes(amTarget.toLowerCase());
        if (!matchAmName && !matchAmEmail) return false;
      }

      // RM Scope: If logged in user is RM (or RM filter selected)
      if (selectedRmFilter !== 'ALL') {
        const rmTarget = selectedRmFilter.trim();
        const matchRmName = matchManagerName(fe.rmName, rmTarget);
        const matchRmEmail = fe.rmEmail && fe.rmEmail.toLowerCase().includes(rmTarget.toLowerCase());
        const matchRmId = fe.rmId && String(fe.rmId) === String(rmTarget);
        if (!matchRmName && !matchRmEmail && !matchRmId) return false;
      }

      // Text search
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = fe.name.toLowerCase().includes(q);
        const matchCode = fe.code.toLowerCase().includes(q);
        const matchHub = fe.hub.toLowerCase().includes(q);
        const matchEmail = fe.email.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchHub && !matchEmail) return false;
      }

      // Strike Filter
      if (selectedStrikeFilter === 'CLEAN' && fe.fatalTasks > 0) return false;
      if (selectedStrikeFilter === 'STRIKES_1' && fe.fatalTasks !== 1) return false;
      if (selectedStrikeFilter === 'STRIKES_2_PLUS' && fe.fatalTasks < 2) return false;

      return true;
    });
  }, [feMasterList, selectedAmFilter, selectedRmFilter, searchQuery, selectedStrikeFilter]);

  // 3. Extract All Fatal Task Incidents under this Scoped Manager
  const scopedFatalTasks = useMemo(() => {
    const list = [];
    scopedFEs.forEach(fe => {
      fe.fatalTasksList.forEach(t => {
        list.push({
          ...t,
          feObject: fe
        });
      });
    });
    return list.sort((a, b) => new Date(b.auditedAt || b.allocatedAt || 0) - new Date(a.auditedAt || a.allocatedAt || 0));
  }, [scopedFEs]);

  // 4. Executive KPI Metrics for Scoped Cluster
  const clusterMetrics = useMemo(() => {
    const totalFEs = scopedFEs.length;
    let totalVisits = 0;
    let totalAudited = 0;
    let totalPassed = 0;
    let totalFatals = 0;
    let totalReplacements = 0;
    let cleanFEs = 0;
    let atRiskFEs = 0;

    scopedFEs.forEach(fe => {
      totalVisits += fe.totalTasks;
      totalAudited += fe.auditedTasks;
      totalPassed += fe.passedTasks;
      totalFatals += fe.fatalTasks;
      totalReplacements += fe.replacementsCount;
      if (fe.fatalTasks === 0) cleanFEs += 1;
      if (fe.fatalTasks >= 2) atRiskFEs += 1;
    });

    const fatalRate = totalAudited > 0 ? ((totalFatals / totalAudited) * 100).toFixed(1) : 0;

    return {
      totalFEs,
      totalVisits,
      totalAudited,
      totalPassed,
      totalFatals,
      totalReplacements,
      cleanFEs,
      atRiskFEs,
      fatalRate
    };
  }, [scopedFEs]);

  // 5. AM Grouping Comparison (For RM & Senior Management)
  const amComparisonData = useMemo(() => {
    const map = new Map();

    const pool = selectedRmFilter !== 'ALL'
      ? feMasterList.filter(fe => matchManagerName(fe.rmName, selectedRmFilter) || (fe.rmEmail && fe.rmEmail.toLowerCase().includes(selectedRmFilter.toLowerCase().trim())))
      : feMasterList;

    pool.forEach(fe => {
      const amKey = fe.amEmail || fe.amName || 'Unassigned AM';
      if (!map.has(amKey)) {
        map.set(amKey, {
          amName: fe.amName || 'Area Manager',
          amEmail: fe.amEmail || '',
          hub: fe.hub,
          rmName: fe.rmName,
          feCount: 0,
          totalVisits: 0,
          auditedVisits: 0,
          fatalCount: 0,
          replacementsCount: 0
        });
      }

      const entry = map.get(amKey);
      entry.feCount += 1;
      entry.totalVisits += fe.totalTasks;
      entry.auditedVisits += fe.auditedTasks;
      entry.fatalCount += fe.fatalTasks;
      entry.replacementsCount += fe.replacementsCount;
    });

    return Array.from(map.values())
      .map(item => ({
        ...item,
        fatalRate: item.auditedVisits > 0 ? ((item.fatalCount / item.auditedVisits) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.fatalCount - a.fatalCount || b.totalVisits - a.totalVisits);
  }, [feMasterList, selectedRmFilter]);

  // Export Cluster Quality Report to Excel
  const handleExportClusterExcel = () => {
    const dataToExport = scopedFEs.map(fe => ({
      'FE NAME': fe.name,
      'RIDER CODE': fe.code,
      'EMPLOYEE ID': fe.personId,
      'CORPORATE EMAIL': fe.email,
      'HUB / CITY': fe.hub,
      'ZONE': fe.zone,
      'REPORTING AM NAME': fe.amName,
      'REPORTING AM EMAIL': fe.amEmail,
      'REGIONAL RM NAME': fe.rmName,
      'REGIONAL RM EMAIL': fe.rmEmail,
      'TOTAL CUSTOMER VISITS': fe.totalTasks,
      'COMPLETED VISITS': fe.completedTasks,
      'AUDITED VISITS': fe.auditedTasks,
      'PASSED AUDITS': fe.passedTasks,
      'FATAL STRIKES': fe.fatalTasks,
      'FATAL RATE %': fe.auditedTasks > 0 ? `${((fe.fatalTasks / fe.auditedTasks) * 100).toFixed(1)}%` : '0%',
      'TOOL REPLACEMENTS ORDERED': fe.replacementsCount,
      'COMPLIANCE STATUS': fe.fatalTasks === 0 ? 'CLEAN (0 Strikes)' : fe.fatalTasks === 1 ? 'WARNING (1 Strike)' : 'ACTION REQUIRED (2+ Strikes)'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cluster_Scorecard');
    XLSX.writeFile(wb, `Lenskart_AM_RM_Cluster_Scorecard_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 via-orange-600 to-amber-400 border border-amber-500/40 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {isAM ? 'Area Manager (AM) Operations' : isRM ? 'Regional Manager (RM) Cluster' : 'AM & RM Cluster Operations'}
                </span>
                <span className="text-[10px] text-slate-400">
                  Direct Field Executive Oversight & Strike Ledger
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-white mt-1">
                {isAM 
                  ? `Area Hub Scorecard: ${currentUser?.full_name || 'Area Operations'}`
                  : isRM 
                  ? `Regional Cluster Scorecard: ${currentUser?.full_name || 'Regional Operations'}`
                  : 'National AM & RM Field Team Operations Portal'
                }
              </h2>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportClusterExcel}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
              title="Download Excel breakdown of all FEs under this manager"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Export Cluster Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Manager Hierarchy Filter Controls (Interactive for RM & Senior Executives) */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-sky-400" />
            <span>Hierarchy Scope:</span>
          </span>

          {/* RM Filter Dropdown */}
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400 mr-2 font-medium">Regional RM:</span>
            <select
              value={selectedRmFilter}
              onChange={(e) => {
                setSelectedRmFilter(e.target.value);
                setSelectedAmFilter('ALL');
              }}
              disabled={isRM && !isExecutive}
              className="bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-800">All Regions</option>
              {allRegionalManagers.map(rm => (
                <option key={rm.id || rm.email || rm.full_name} value={rm.full_name || rm.email} className="bg-slate-800">
                  {rm.full_name || rm.email}
                </option>
              ))}
            </select>
          </div>

          {/* AM Filter Dropdown */}
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400 mr-2 font-medium">Area AM:</span>
            <select
              value={selectedAmFilter}
              onChange={(e) => setSelectedAmFilter(e.target.value)}
              disabled={isAM && !isExecutive && !isRM}
              className="bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-800">All Area Managers</option>
              {availableAreaManagers.map(am => (
                <option key={am.id || am.email || am.full_name} value={am.full_name || am.email} className="bg-slate-800">
                  {am.full_name || am.email} ({am.facility_code || am.city || 'Hub'})
                </option>
              ))}
            </select>
          </div>

          {(selectedAmFilter !== 'ALL' || selectedRmFilter !== 'ALL') && (
            <button
              onClick={() => {
                if (isExecutive) {
                  setSelectedAmFilter('ALL');
                  setSelectedRmFilter('ALL');
                }
              }}
              className="text-[11px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="text-right text-[11px] text-slate-400">
          Showing <strong className="text-white">{scopedFEs.length}</strong> FEs across cluster
        </div>
      </div>

      {/* Executive KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Supervised FEs</div>
          <div className="text-2xl font-black text-white mt-1">{clusterMetrics.totalFEs}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Active field staff</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Customer Visits</div>
          <div className="text-2xl font-black text-sky-400 mt-1">{clusterMetrics.totalVisits}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{clusterMetrics.totalAudited} audited by QA</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fatal Strikes</div>
          <div className="text-2xl font-black text-red-400 mt-1">{clusterMetrics.totalFatals}</div>
          <div className="text-[10px] text-red-400/80 mt-0.5">SOP violations logged</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fatal Rate %</div>
          <div className={`text-2xl font-black mt-1 ${
            Number(clusterMetrics.fatalRate) > 10 ? 'text-red-400' :
            Number(clusterMetrics.fatalRate) > 5 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {clusterMetrics.fatalRate}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Target: &lt;5% fatal</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Clean Record FEs</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{clusterMetrics.cleanFEs}</div>
          <div className="text-[10px] text-emerald-400/80 mt-0.5">0 fatal strikes</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tool Requisitions</div>
          <div className="text-2xl font-black text-amber-300 mt-1">{clusterMetrics.totalReplacements}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">POS tool orders needed</div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('scorecard')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'scorecard'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>FE Compliance Scorecard ({scopedFEs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('fatals')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'fatals'
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Fatal Incidents Feed ({scopedFatalTasks.length})</span>
        </button>

        {(isRM || isExecutive) && (
          <button
            onClick={() => setActiveTab('amComparison')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'amComparison'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Area Managers (AM) Comparison ({amComparisonData.length})</span>
          </button>
        )}
      </div>

      {/* TAB 1: FE COMPLIANCE SCORECARD */}
      {activeTab === 'scorecard' && (
        <div className="space-y-4">
          
          {/* Sub-toolbar: Search & Strike filter */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between text-xs">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search FE Name, Employee Code, Hub, Email..."
                className="w-full bg-slate-850 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Filter by Strike Record:</span>
              <select
                value={selectedStrikeFilter}
                onChange={(e) => setSelectedStrikeFilter(e.target.value)}
                className="bg-slate-850 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All FEs</option>
                <option value="CLEAN">Clean Record (0 Fatal Strikes)</option>
                <option value="STRIKES_1">1 Fatal Strike (Warning)</option>
                <option value="STRIKES_2_PLUS">2+ Fatal Strikes (Action Required)</option>
              </select>
            </div>
          </div>

          {/* FEs Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-850 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <th className="py-3 px-4">Field Executive</th>
                    <th className="py-3 px-4">Hub / Location</th>
                    <th className="py-3 px-4">Direct Area Manager (AM)</th>
                    <th className="py-3 px-4 text-center">Customer Visits</th>
                    <th className="py-3 px-4 text-center">Passed</th>
                    <th className="py-3 px-4 text-center">Fatal Strikes</th>
                    <th className="py-3 px-4 text-center">Fatal Rate</th>
                    <th className="py-3 px-4 text-center">Replacements</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {scopedFEs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No Field Executives found for this manager / search criteria.
                      </td>
                    </tr>
                  ) : (
                    scopedFEs.map(fe => {
                      const fatalRate = fe.auditedTasks > 0 ? Math.round((fe.fatalTasks / fe.auditedTasks) * 100) : 0;
                      return (
                        <tr key={fe.key} className="hover:bg-slate-850/60 transition-colors">
                          
                          {/* FE Identity */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 font-bold flex items-center justify-center text-xs shrink-0 border border-slate-700">
                                {fe.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <span>{fe.name}</span>
                                  {fe.code && (
                                    <span className="font-mono text-sky-400 text-[10px]">[{fe.code}]</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">{fe.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Hub */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="text-slate-300 font-medium">{fe.hub}</div>
                            <div className="text-[10px] text-slate-500">{fe.zone}</div>
                          </td>

                          {/* Direct AM */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="text-slate-300 font-semibold">{fe.amName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{fe.amEmail}</div>
                          </td>

                          {/* Customer Visits */}
                          <td className="py-3.5 px-4 text-center font-bold text-white">
                            {fe.totalTasks}
                          </td>

                          {/* Passed */}
                          <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                            {fe.passedTasks}
                          </td>

                          {/* Fatal Strikes Badge */}
                          <td className="py-3.5 px-4 text-center">
                            {fe.fatalTasks === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>0 Clean</span>
                              </span>
                            ) : fe.fatalTasks === 1 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <AlertTriangle className="w-3 h-3" />
                                <span>1 Strike</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">
                                <ShieldAlert className="w-3 h-3" />
                                <span>{fe.fatalTasks} Strikes</span>
                              </span>
                            )}
                          </td>

                          {/* Fatal Rate */}
                          <td className="py-3.5 px-4 text-center font-bold">
                            <span className={
                              fatalRate > 10 ? 'text-red-400' :
                              fatalRate > 5 ? 'text-amber-400' : 'text-emerald-400'
                            }>
                              {fatalRate}%
                            </span>
                          </td>

                          {/* Replacements */}
                          <td className="py-3.5 px-4 text-center">
                            {fe.replacementsCount > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold text-[10px]">
                                {fe.replacementsCount} items
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">None</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  if (onFilterFE) onFilterFE(fe.name || fe.code);
                                  else if (onNavigate) onNavigate('audits');
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                                title="Filter customer visits by this FE on Audits Console"
                              >
                                <Filter className="w-3 h-3 text-sky-400" />
                                <span>Visits ({fe.totalTasks})</span>
                              </button>

                              {fe.fatalTasks > 0 && (
                                <button
                                  onClick={() => {
                                    setSearchQuery(fe.name);
                                    setActiveTab('fatals');
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 transition-colors cursor-pointer"
                                  title="View all fatal audit incidents for this FE"
                                >
                                  View {fe.fatalTasks} Fatals
                                </button>
                              )}
                            </div>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FATAL INCIDENTS FEED */}
      {activeTab === 'fatals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-1">
            <div>
              <h3 className="font-bold text-white text-sm">
                Fatal SOP Non-Compliance Incidents ({scopedFatalTasks.length})
              </h3>
              <p className="text-xs text-slate-400">
                Audited dispatches that incurred a formal strike. Tri-party notification sent to FE, AM, and RM.
              </p>
            </div>
          </div>

          {scopedFatalTasks.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2 opacity-80" />
              <div className="font-bold text-white text-sm">No Fatal Violations in Selected Cluster!</div>
              <p className="text-slate-500 mt-0.5">All field executives are adhering to clinical SOP guidelines.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scopedFatalTasks.map((task, idx) => (
                <div 
                  key={`${task.id || task.taskId}_${idx}`}
                  className="p-4 rounded-xl bg-slate-900 border border-red-500/30 hover:border-red-500/50 transition-all shadow-md space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-red-400">
                        Task #{task.taskId}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">
                        FATAL STRIKE
                      </span>
                      <span className="text-xs text-slate-400">
                        Date: <strong className="text-slate-300">{task.date || 'Today'}</strong>
                      </span>
                      <span className="text-xs text-slate-400">
                        Hub: <strong className="text-slate-300">{task.facilityCode || task.teamName}</strong>
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>Auditor: <strong className="text-white">{task.auditedBy || 'Central Auditor'}</strong></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Field Executive (FE)</span>
                      <div className="font-bold text-white text-sm mt-0.5">{task.feName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{task.feEmail || `${task.feCode}@lenskart.in`}</div>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Reporting AM & RM</span>
                      <div className="text-slate-200 mt-0.5 font-semibold">AM: {task.amName || task.feObject?.amName || 'Area Manager'}</div>
                      <div className="text-slate-400 text-[11px] font-mono">{task.amEmail || task.feObject?.amEmail}</div>
                      <div className="text-slate-400 text-[10px] font-mono mt-0.5">RM: {task.rmEmail || task.feObject?.rmEmail}</div>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Failure Reasons</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(task.failedReasons || ['SOP Failure']).map((r, rIdx) => (
                          <span key={rIdx} className="px-2 py-0.5 rounded bg-red-950/60 border border-red-500/30 text-red-300 text-[10px] font-semibold">
                            {r}
                          </span>
                        ))}
                      </div>
                      {task.remarks && (
                        <div className="text-[11px] text-slate-400 italic mt-1">
                          "{task.remarks}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fatal Objection & Dispute Actions Bar */}
                  {(() => {
                    const windowStatus = getDisputeWindowStatus(task.auditedAt);
                    const disputeStatus = task.disputeStatus || task.dispute_status || 'NONE';

                    return (
                      <div className="pt-2.5 mt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${windowStatus.badgeClass}`}>
                            {windowStatus.badgeText}
                          </span>

                          {disputeStatus === 'PENDING_REVIEW' && (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" />
                              Objection Under Review
                            </span>
                          )}

                          {disputeStatus === 'MEET_SCHEDULED' && (
                            <a
                              href={task.disputeMeetUrl || task.dispute_meet_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 border border-amber-400 px-2.5 py-0.5 rounded flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                            >
                              <Video className="w-3 h-3" />
                              <span>📅 Google Meet Scheduled</span>
                              <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                            </a>
                          )}

                          {disputeStatus === 'RESOLVED_OVERTURNED' && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Strike Overturned (Passed)
                            </span>
                          )}

                          {disputeStatus === 'RESOLVED_UPHELD' && (
                            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              Fatal Strike Upheld
                            </span>
                          )}
                        </div>

                        {disputeStatus === 'NONE' && (
                          <button
                            onClick={() => setDisputeModalTask(task)}
                            disabled={!windowStatus.canDispute}
                            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                              windowStatus.canDispute
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md cursor-pointer'
                                : 'bg-slate-850 text-slate-500 border border-slate-750 cursor-not-allowed'
                            }`}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>{windowStatus.canDispute ? 'Raise Objection / Schedule Meet' : 'Dispute Window Expired'}</span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dispute Modal for AM / RM */}
      {disputeModalTask && (
        <DisputeObjectionModal
          task={disputeModalTask}
          currentUser={currentUser}
          isOpen={Boolean(disputeModalTask)}
          onClose={() => setDisputeModalTask(null)}
          onSubmitDispute={onRaiseDispute}
        />
      )}

      {/* TAB 3: AM COMPARISON RANKING */}
      {activeTab === 'amComparison' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-1">
            <div>
              <h3 className="font-bold text-white text-sm">
                Regional Area Managers (AM) Team Benchmark
              </h3>
              <p className="text-xs text-slate-400">
                Compare compliance performance, fatal rate percentages, and team sizes across all Area Managers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {amComparisonData.map((am, idx) => (
              <div 
                key={am.amEmail || idx}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all shadow-md space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold flex items-center justify-center text-xs">
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{am.amName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{am.amEmail}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedAmFilter(am.amName);
                      setActiveTab('scorecard');
                    }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-[10px] font-bold border border-slate-700 transition-colors cursor-pointer"
                  >
                    View Team
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                  <div className="bg-slate-950 p-2 rounded-lg">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Team FEs</span>
                    <span className="text-sm font-black text-white">{am.feCount}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Fatal Strikes</span>
                    <span className="text-sm font-black text-red-400">{am.fatalCount}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Fatal Rate</span>
                    <span className={`text-sm font-black ${
                      Number(am.fatalRate) > 10 ? 'text-red-400' :
                      Number(am.fatalRate) > 5 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {am.fatalRate}%
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                  <span>Hub: <strong className="text-slate-300">{am.hub || 'Ahmedabad'}</strong></span>
                  <span>{am.totalVisits} Customer Visits</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
