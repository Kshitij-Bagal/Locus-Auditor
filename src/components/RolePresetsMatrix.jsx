import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Check, 
  X, 
  RotateCw, 
  Save, 
  Sparkles, 
  Info, 
  AlertTriangle, 
  Cloud, 
  Layers, 
  Sliders, 
  Key, 
  FileSpreadsheet, 
  Upload, 
  Cpu, 
  ShoppingBag, 
  Briefcase, 
  User, 
  Scale, 
  CheckCircle2, 
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { 
  SYSTEM_PAGES, 
  ALL_ROLES, 
  DEFAULT_ROLE_PRESETS, 
  getLiveRolePresets, 
  setLiveRolePresets, 
  resetRolePresetsToDefault,
  normalizeRoleName,
  displayRoleName,
  parseRoles,
  PAGE_ID_TO_LABEL,
  PAGE_LABEL_TO_ID
} from '../utils/accessHelper.js';
import { settingsApi } from '../api/client.js';

// Page Icons Mapping
const PAGE_ICONS = {
  audits: FileSpreadsheet,
  upload: Upload,
  allocation: Cpu,
  escalations: AlertTriangle,
  rules: ShieldCheck,
  replacements: ShoppingBag,
  managerPortal: Briefcase,
  fePortal: User,
  users: Sliders,
  accessControl: Key,
  fatalObjection: Scale
};

// Role Visual Theme Styling
const ROLE_THEMES = {
  SuperAdmin: {
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    headerGlow: 'from-purple-900/40 via-purple-800/10 to-transparent',
    desc: 'Unrestricted Master Governance & RBAC Authority'
  },
  'City Admin': {
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    headerGlow: 'from-sky-900/40 via-sky-800/10 to-transparent',
    desc: 'Hub Logistics, POS Requisitions & Quality Audits'
  },
  Auditor: {
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    headerGlow: 'from-emerald-900/40 via-emerald-800/10 to-transparent',
    desc: 'Line-Item Photo Compliance & Rapid Auditing'
  },
  AM: {
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    headerGlow: 'from-blue-900/40 via-blue-800/10 to-transparent',
    desc: 'Area Field Operations, Tool Orders & Dispute Scheduling'
  },
  RM: {
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    headerGlow: 'from-indigo-900/40 via-indigo-800/10 to-transparent',
    desc: 'Regional Governance, Cluster Tracking & Escalation Meets'
  },
  'Central Ops': {
    badge: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    headerGlow: 'from-teal-900/40 via-teal-800/10 to-transparent',
    desc: 'Locus Spreadsheet Ingestion, Audits & Tools'
  },
  GM: {
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    headerGlow: 'from-amber-900/40 via-amber-800/10 to-transparent',
    desc: 'General Management, SOP Criteria & Dispute Ruling'
  },
  BH: {
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    headerGlow: 'from-rose-900/40 via-rose-800/10 to-transparent',
    desc: 'Business Head, Workload Allocations & D+1 SLA Breaches'
  },
  FE: {
    badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    headerGlow: 'from-slate-800/40 via-slate-800/10 to-transparent',
    desc: 'Field Executives, Daily Visits & Personal Fatal Disputes'
  }
};

export default function RolePresetsMatrix({ users = [], currentUser }) {
  // Working state for presets: { [role]: string[] } (pages as human labels)
  const [matrixState, setMatrixState] = useState(() => {
    return JSON.parse(JSON.stringify(getLiveRolePresets()));
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [searchRole, setSearchRole] = useState('');
  const [searchPage, setSearchPage] = useState('');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Compute number of staff registered under each role
  const roleUserCounts = useMemo(() => {
    const counts = {};
    ALL_ROLES.forEach(r => { counts[r] = 0; });
    
    users.forEach(u => {
      const roles = parseRoles(u.roles || [u.role]);
      roles.forEach(r => {
        const canonical = normalizeRoleName(r);
        if (counts[canonical] !== undefined) {
          counts[canonical]++;
        }
      });
    });
    return counts;
  }, [users]);

  // Check if current matrixState differs from the saved live presets
  const isDirty = useMemo(() => {
    const live = getLiveRolePresets();
    for (const role of ALL_ROLES) {
      const currentPages = matrixState[role] || [];
      const livePages = live[role] || [];
      if (currentPages.length !== livePages.length) return true;
      const setA = new Set(currentPages);
      for (const p of livePages) {
        if (!setA.has(p)) return true;
      }
    }
    return false;
  }, [matrixState]);

  // Check if a role is customized compared to system baseline DEFAULT_ROLE_PRESETS
  const getRoleCustomizedCount = useMemo(() => {
    let customizedRolesCount = 0;
    ALL_ROLES.forEach(role => {
      const current = matrixState[role] || [];
      const def = DEFAULT_ROLE_PRESETS[role] || [];
      const setCur = new Set(current);
      const setDef = new Set(def);
      const isDiff = current.length !== def.length || [...setCur].some(p => !setDef.has(p));
      if (isDiff) customizedRolesCount++;
    });
    return customizedRolesCount;
  }, [matrixState]);

  // Load from Supabase on mount
  useEffect(() => {
    async function syncFromCloud() {
      try {
        const cloudPresets = await settingsApi.getRolePresets();
        if (cloudPresets && typeof cloudPresets === 'object') {
          setLiveRolePresets(cloudPresets);
          setMatrixState(JSON.parse(JSON.stringify(getLiveRolePresets())));
        }
      } catch (err) {
        console.warn('Initial role presets cloud fetch error:', err);
      }
    }
    syncFromCloud();
  }, []);

  // Listen for external updates
  useEffect(() => {
    const handleExternalUpdate = (e) => {
      if (e?.detail) {
        setMatrixState(JSON.parse(JSON.stringify(e.detail)));
      }
    };
    window.addEventListener('locus_presets_updated', handleExternalUpdate);
    return () => window.removeEventListener('locus_presets_updated', handleExternalUpdate);
  }, []);

  // Toggle single cell
  const handleToggleCell = (role, pageLabel) => {
    // Safety guard: Prevent accidental lockout of SuperAdmin from Access Control
    if (role === 'SuperAdmin' && (pageLabel === 'Access Control' || pageLabel === 'User Accounts')) {
      const current = matrixState[role] || [];
      if (current.includes(pageLabel)) {
        const proceed = window.confirm(
          `Security Warning: Disabling "${pageLabel}" for SuperAdmin will restrict administrative authority. Are you sure?`
        );
        if (!proceed) return;
      }
    }

    setMatrixState(prev => {
      const currentList = prev[role] || [];
      let updated;
      if (currentList.includes(pageLabel)) {
        updated = currentList.filter(p => p !== pageLabel);
      } else {
        updated = [...currentList, pageLabel];
      }
      return {
        ...prev,
        [role]: updated
      };
    });
  };

  // Row shortcut: Grant all pages to role
  const handleGrantAllForRole = (role) => {
    const allLabels = SYSTEM_PAGES.map(p => p.label);
    setMatrixState(prev => ({
      ...prev,
      [role]: allLabels
    }));
  };

  // Row shortcut: Clear all pages for role
  const handleClearAllForRole = (role) => {
    if (role === 'SuperAdmin') {
      const confirm = window.confirm('Are you sure you want to clear all permissions for SuperAdmin?');
      if (!confirm) return;
    }
    setMatrixState(prev => ({
      ...prev,
      [role]: []
    }));
  };

  // Row shortcut: Reset role to system default
  const handleResetRoleToDefault = (role) => {
    const def = DEFAULT_ROLE_PRESETS[role] || [];
    setMatrixState(prev => ({
      ...prev,
      [role]: [...def]
    }));
  };

  // Global Action: Save to Supabase and LocalStorage
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // 1. Update in-memory & LocalStorage
      const saved = setLiveRolePresets(matrixState);
      
      // 2. Persist to Supabase system_settings table
      await settingsApi.saveRolePresets(saved, currentUser?.email || currentUser?.full_name || 'SuperAdmin');

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert(`Failed to save role presets: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Global Action: Reset all roles to DEFAULT_ROLE_PRESETS
  const handleResetAllToDefault = async () => {
    const fresh = resetRolePresetsToDefault();
    setMatrixState(JSON.parse(JSON.stringify(fresh)));
    try {
      await settingsApi.saveRolePresets(fresh, currentUser?.email || 'SuperAdmin');
    } catch (e) {}
    setConfirmResetOpen(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Filtered lists
  const filteredRoles = useMemo(() => {
    if (!searchRole) return ALL_ROLES;
    const q = searchRole.toLowerCase();
    return ALL_ROLES.filter(r => 
      r.toLowerCase().includes(q) || 
      displayRoleName(r).toLowerCase().includes(q)
    );
  }, [searchRole]);

  const filteredPages = useMemo(() => {
    if (!searchPage) return SYSTEM_PAGES;
    const q = searchPage.toLowerCase();
    return SYSTEM_PAGES.filter(p => 
      p.label.toLowerCase().includes(q) || 
      p.fullName.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }, [searchPage]);

  // Calculate total enabled permissions across whole grid
  const totalPermissionsEnabled = useMemo(() => {
    let count = 0;
    ALL_ROLES.forEach(r => {
      count += (matrixState[r] || []).length;
    });
    return count;
  }, [matrixState]);

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Control Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Live Role Presets Matrix
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Cloud className="w-3.5 h-3.5" />
                Real-Time Cloud Synchronization
              </span>
              {getRoleCustomizedCount > 0 ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {getRoleCustomizedCount} Role(s) Customized
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Standard Baseline Defaults Active
                </span>
              )}
            </div>
            
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Role-Wise Default Presets Matrix</span>
              {isDirty && (
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                  Unsaved Changes
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Define the default base console access for each of the 9 corporate roles. Changes take effect across all sessions immediately without code deployment or browser restarts.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setConfirmResetOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Reset all roles to factory default presets"
            >
              <RotateCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset to Defaults</span>
            </button>

            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
                isDirty 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/60 ring-2 ring-emerald-500/50 animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving to Cloud...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>Presets Saved Live!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{isDirty ? 'Save Changes Now' : 'Save Presets'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Stat Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-900/70 rounded-xl p-2.5 border border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total System Roles</div>
            <div className="text-lg font-black text-white mt-0.5">{ALL_ROLES.length} Roles</div>
          </div>
          <div className="bg-slate-900/70 rounded-xl p-2.5 border border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">System Consoles</div>
            <div className="text-lg font-black text-white mt-0.5">{SYSTEM_PAGES.length} Consoles</div>
          </div>
          <div className="bg-slate-900/70 rounded-xl p-2.5 border border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Permissions</div>
            <div className="text-lg font-black text-indigo-400 mt-0.5">{totalPermissionsEnabled} / {ALL_ROLES.length * SYSTEM_PAGES.length}</div>
          </div>
          <div className="bg-slate-900/70 rounded-xl p-2.5 border border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered Staff in DB</div>
            <div className="text-lg font-black text-emerald-400 mt-0.5">{users.length} Users</div>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchRole}
              onChange={(e) => setSearchRole(e.target.value)}
              placeholder="Filter by role name..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {searchRole && (
              <button 
                onClick={() => setSearchRole('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchPage}
              onChange={(e) => setSearchPage(e.target.value)}
              placeholder="Filter page columns..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {searchPage && (
              <button 
                onClick={() => setSearchPage('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 shrink-0 self-center">
          <Info className="w-3.5 h-3.5 text-indigo-400" />
          <span>Click any cell to toggle default access for that role</span>
        </div>
      </div>

      {/* The 2D Interactive Matrix Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl relative">
        <table className="w-full border-collapse text-left text-xs">
          {/* Table Header: Columns are Pages */}
          <thead>
            <tr className="bg-slate-900/90 border-b border-slate-800 backdrop-blur sticky top-0 z-20">
              {/* Role Title Column Header (Fixed Left) */}
              <th className="py-4 px-4 font-black text-slate-200 tracking-wider uppercase text-[11px] min-w-[220px] bg-slate-900 border-r border-slate-800 sticky left-0 z-30">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-400" />
                  <span>Role & Description</span>
                </div>
              </th>

              {/* Page Column Headers */}
              {filteredPages.map(page => {
                const PageIcon = PAGE_ICONS[page.id] || Layers;
                return (
                  <th 
                    key={page.id} 
                    className="py-3 px-3 font-bold text-slate-300 text-center min-w-[110px] max-w-[130px] border-r border-slate-800/80 hover:bg-slate-800/40 transition-colors"
                    title={`${page.fullName} - ${page.description}`}
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div className="w-7 h-7 rounded-lg bg-slate-800/90 border border-slate-700/80 flex items-center justify-center text-slate-300">
                        <PageIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[11px] font-bold text-white whitespace-nowrap">
                        {page.label}
                      </span>
                      <span className="text-[9px] font-medium text-slate-500 uppercase tracking-tighter truncate max-w-[95px]">
                        {page.category}
                      </span>
                    </div>
                  </th>
                );
              })}

              {/* Row Actions Header */}
              <th className="py-4 px-3 font-bold text-slate-400 text-center uppercase tracking-wider text-[10px] min-w-[150px] bg-slate-900">
                Quick Shortcuts
              </th>
            </tr>
          </thead>

          {/* Table Body: Rows are Roles */}
          <tbody className="divide-y divide-slate-800/80">
            {filteredRoles.map(role => {
              const theme = ROLE_THEMES[role] || ROLE_THEMES.Auditor;
              const grantedList = matrixState[role] || [];
              const defaultList = DEFAULT_ROLE_PRESETS[role] || [];
              const userCount = roleUserCounts[role] || 0;

              // Check if modified from default preset
              const setCur = new Set(grantedList);
              const setDef = new Set(defaultList);
              const isRoleCustomized = grantedList.length !== defaultList.length || [...setCur].some(p => !setDef.has(p));

              return (
                <tr 
                  key={role} 
                  className="hover:bg-slate-900/40 transition-colors group"
                >
                  {/* Fixed Left Role Header Cell */}
                  <td className="py-3.5 px-4 bg-slate-950/90 group-hover:bg-slate-900/60 border-r border-slate-800 sticky left-0 z-10 transition-colors">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black px-2.5 py-0.5 rounded border ${theme.badge}`}>
                          {role}
                        </span>

                        {isRoleCustomized ? (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Customized from system default">
                            Custom
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium text-slate-500">
                            Default
                          </span>
                        )}

                        <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {grantedList.length} / {SYSTEM_PAGES.length}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 font-medium truncate max-w-[210px]" title={theme.desc}>
                        {theme.desc}
                      </div>

                      <div className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <User className="w-2.5 h-2.5 text-slate-500" />
                        <span>{userCount} {userCount === 1 ? 'staff member' : 'staff members'} in DB</span>
                      </div>
                    </div>
                  </td>

                  {/* 11 Checkbox Cells */}
                  {filteredPages.map(page => {
                    const isGranted = grantedList.includes(page.label);
                    const wasDefault = defaultList.includes(page.label);
                    const isCellCustomized = isGranted !== wasDefault;

                    return (
                      <td 
                        key={page.id} 
                        className="py-3 px-2 text-center border-r border-slate-800/60 cursor-pointer select-none transition-colors hover:bg-indigo-950/20"
                        onClick={() => handleToggleCell(role, page.label)}
                      >
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCell(role, page.label);
                            }}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer relative ${
                              isGranted
                                ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 shadow-md shadow-emerald-950/50 hover:bg-emerald-500/30 ring-1 ring-emerald-500/30'
                                : 'bg-slate-900 border border-slate-800 text-slate-600 hover:border-slate-700 hover:text-slate-400'
                            }`}
                            title={`${role} -> ${page.label}: ${isGranted ? 'Granted' : 'Revoked'} (Click to toggle)`}
                          >
                            {isGranted ? (
                              <Check className="w-4 h-4 stroke-[3]" />
                            ) : (
                              <span className="text-[10px] text-slate-700 font-bold">•</span>
                            )}

                            {/* Small indicator dot if changed from default */}
                            {isCellCustomized && (
                              <span 
                                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-950" 
                                title="Modified from baseline default"
                              />
                            )}
                          </button>
                        </div>
                      </td>
                    );
                  })}

                  {/* Row Quick Action Buttons */}
                  <td className="py-3 px-3 text-center whitespace-nowrap bg-slate-950/60 group-hover:bg-slate-900/40 transition-colors">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleGrantAllForRole(role)}
                        className="text-[10px] font-bold px-2 py-1 rounded bg-slate-900 hover:bg-emerald-950/50 text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-700/50 transition-all cursor-pointer"
                        title={`Grant all ${SYSTEM_PAGES.length} pages to ${role}`}
                      >
                        All
                      </button>

                      <button
                        type="button"
                        onClick={() => handleClearAllForRole(role)}
                        className="text-[10px] font-bold px-2 py-1 rounded bg-slate-900 hover:bg-red-950/50 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-700/50 transition-all cursor-pointer"
                        title={`Clear all pages for ${role}`}
                      >
                        Clear
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResetRoleToDefault(role)}
                        className="text-[10px] font-bold px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-all cursor-pointer"
                        title={`Reset ${role} to original default preset`}
                      >
                        Default
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Explanatory Legend & Architecture Note */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Default Role Presets</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Every staff member automatically inherits these pages based on their primary and assigned roles.
            </p>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Individual User Overrides</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Admins can grant additional pages to individual users in the "User Individual Access" tab without modifying the global role preset.
            </p>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Amber Modified Dots</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Cells marked with an amber dot highlight permissions that deviate from the factory default baseline.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Reset All to Factory Defaults */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Reset All Role Presets?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This action will reset the default page access for all 9 roles back to their standard system baseline. Any customized role mappings will be reverted.
            </p>
            <div className="flex justify-end gap-2.5 mt-5">
              <button
                onClick={() => setConfirmResetOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAllToDefault}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Confirm Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
