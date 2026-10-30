import React, { useState, useMemo } from 'react';
import { 
  Users, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Mail, 
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
  SendHorizontal
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseRoles, displayRoleName } from '../utils/accessHelper.js';
import DailyDigestManagerView from './DailyDigestManagerView.jsx';

export default function ClusterManagerPortal({
  tasks = [],
  users = [],
  currentUser,
  onOpenEmailForTask,
  onNavigate,
  onFilterFE
}) {
  const [activeTab, setActiveTab] = useState('scorecard'); // 'scorecard' | 'fatals' | 'amComparison'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrikeFilter, setSelectedStrikeFilter] = useState('ALL'); // 'ALL' | 'CLEAN' | 'STRIKES_1' | 'STRIKES_2_PLUS'
  
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
    return (users || []).filter(u => {
      const roles = parseRoles(u.roles || [u.role]);
      return roles.includes('RM');
    });
  }, [users]);

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

    // Pass A: Seed FEs from users registry
    (users || []).forEach(u => {
      const roles = parseRoles(u.roles || [u.role]);
      if (roles.includes('FE') || (u.employee_code && u.employee_code.startsWith('FE'))) {
        const key = String(u.employee_code || u.person_id || u.email || u.id).trim().toLowerCase();
        
        // Find direct AM
        let amName = u.reporting_manager_name || '';
        let amEmail = u.reporting_manager_email || '';
        if ((!amName || !amEmail) && u.reporting_manager_id) {
          const amUser = users.find(m => m.id === u.reporting_manager_id);
          if (amUser) {
            amName = amUser.full_name;
            amEmail = amUser.email;
          }
        }

        // Find direct RM
        let rmName = u.regional_manager_name || '';
        let rmEmail = u.regional_manager_email || '';
        if ((!rmName || !rmEmail) && u.regional_manager_id) {
          const rmUser = users.find(m => m.id === u.regional_manager_id);
          if (rmUser) {
            rmName = rmUser.full_name;
            rmEmail = rmUser.email;
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
          amName: task.amName || 'Area Manager',
          amEmail: task.amEmail || 'am.operations@lenskart.in',
          rmName: task.rmName || 'Regional Manager',
          rmEmail: task.rmEmail || 'rm.quality@lenskart.in',
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
  }, [users, tasks]);

  // 2. Filter FEs according to Manager Hierarchy Scope & UI Filters
  const scopedFEs = useMemo(() => {
    return feMasterList.filter(fe => {
      // AM Scope: If logged in user is AM (or AM filter selected)
      if (selectedAmFilter !== 'ALL') {
        const amTarget = selectedAmFilter.toLowerCase().trim();
        const matchAmName = fe.amName.toLowerCase().includes(amTarget);
        const matchAmEmail = fe.amEmail.toLowerCase().includes(amTarget);
        if (!matchAmName && !matchAmEmail) return false;
      }

      // RM Scope: If logged in user is RM (or RM filter selected)
      if (selectedRmFilter !== 'ALL') {
        const rmTarget = selectedRmFilter.toLowerCase().trim();
        const matchRmName = fe.rmName.toLowerCase().includes(rmTarget);
        const matchRmEmail = fe.rmEmail.toLowerCase().includes(rmTarget);
        if (!matchRmName && !matchRmEmail) return false;
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

    feMasterList.forEach(fe => {
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
  }, [feMasterList]);

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
              onChange={(e) => setSelectedRmFilter(e.target.value)}
              disabled={isRM && !isExecutive}
              className="bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-800">All Regions</option>
              {allRegionalManagers.map(rm => (
                <option key={rm.id || rm.email} value={rm.full_name || rm.email} className="bg-slate-800">
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
              {allAreaManagers.map(am => (
                <option key={am.id || am.email} value={am.full_name || am.email} className="bg-slate-800">
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

        <button
          onClick={() => setActiveTab('dailyDigest')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'dailyDigest'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Daily Digest & Escalation</span>
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

                              {fe.fatalTasksList.length > 0 && onOpenEmailForTask && (
                                <button
                                  onClick={() => onOpenEmailForTask(fe.fatalTasksList[0])}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                                  title="Draft warning notice to FE, AM and RM"
                                >
                                  <Mail className="w-3.5 h-3.5 text-sky-400" />
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
              {scopedFatalTasks.map(task => (
                <div 
                  key={task.id}
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
                      {onOpenEmailForTask && (
                        <button
                          onClick={() => onOpenEmailForTask(task)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Mail className="w-3 h-3" />
                          <span>Dispatch / Resend Notice</span>
                        </button>
                      )}
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
                </div>
              ))}
            </div>
          )}
        </div>
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

      {/* TAB 4: DAILY QUALITY AUDIT DIGEST & ESCALATION SYSTEM */}
      {activeTab === 'dailyDigest' && (
        <DailyDigestManagerView
          tasks={tasks}
          users={users}
          currentUser={currentUser}
          scopedFEs={scopedFEs}
          scopedFatalTasks={scopedFatalTasks}
          onOpenEmailForTask={onOpenEmailForTask}
          onNavigate={onNavigate}
        />
      )}

    </div>
  );
}
