import React, { useState, useMemo, useEffect } from 'react';
import { 
  Key, 
  ShieldCheck, 
  Check, 
  Search, 
  UserCheck, 
  RotateCw, 
  Save, 
  Sparkles, 
  Info, 
  Lock, 
  Building2, 
  Sliders, 
  CheckCircle2, 
  FileSpreadsheet, 
  Upload, 
  Cpu, 
  AlertTriangle, 
  ShoppingBag, 
  User, 
  Copy,
  ShieldAlert,
  Clock,
  Mail
} from 'lucide-react';
import { 
  SYSTEM_PAGES, 
  parseRoles, 
  displayRoleName, 
  getUserEffectivePages, 
  saveUserPagePermissions,
  deriveRolesFromPages,
  ROLE_DEFAULT_PAGES 
} from '../utils/accessHelper.js';
import SuperAdminCronEngine from './SuperAdminCronEngine.jsx';

export default function AccessControlPanel({
  users = [],
  tasks = [],
  currentUser,
  onSaveUserPermissions,
  onRefreshUsers
}) {
  const [activeAdminTab, setActiveAdminTab] = useState('cronEngine'); // 'cronEngine' | 'permissions'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');

  // Count pending fatal strikes for today
  const pendingFatalFeCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const fatalFEs = new Set();
    (tasks || []).forEach(t => {
      const d = (t.auditedAt || t.audited_at || t.dispatchDate || t.dispatch_date || '').slice(0, 10);
      const status = (t.auditStatus || t.audit_status || '').toUpperCase();
      if (d === today && status === 'FATAL') {
        const feKey = t.feCode || t.fe_code || t.feId || t.feName;
        if (feKey) fatalFEs.add(feKey);
      }
    });
    return fatalFEs.size;
  }, [tasks]);
  // Local state for modified permissions: map of { [userEmailOrId]: string[] }
  const [customPermissions, setCustomPermissions] = useState(() => {
    const initialMap = {};
    users.forEach(u => {
      const key = u.email ? u.email.toLowerCase() : u.id;
      initialMap[key] = getUserEffectivePages(u);
    });
    return initialMap;
  });

  // Synchronize customPermissions whenever users prop updates from Supabase
  useEffect(() => {
    setCustomPermissions(prev => {
      const updated = { ...prev };
      users.forEach(u => {
        const key = (u.email || u.id).toLowerCase();
        // If not touched yet in this session, keep in sync with user's effective pages
        if (!updated[key]) {
          updated[key] = getUserEffectivePages(u);
        }
      });
      return updated;
    });
  }, [users]);

  const [savingUser, setSavingUser] = useState(null);
  const [savedSuccessMap, setSavedSuccessMap] = useState({});
  const [sqlCopied, setSqlCopied] = useState(false);

  const handleCopySql = () => {
    navigator.clipboard.writeText('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS page_access TEXT[];');
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2500);
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = u.full_name?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        const matchCode = u.person_id?.toLowerCase().includes(q) || u.employee_code?.toLowerCase().includes(q);
        const matchHub = u.facility_code?.toLowerCase().includes(q) || u.city?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchCode && !matchHub) return false;
      }

      if (selectedRoleFilter !== 'ALL') {
        const userRoles = parseRoles(u.roles || [u.role]);
        if (!userRoles.includes(selectedRoleFilter)) return false;
      }

      return true;
    });
  }, [users, searchQuery, selectedRoleFilter]);

  // Toggle single page for user
  const handleTogglePage = (user, pageId) => {
    const key = (user.email || user.id).toLowerCase();
    const currentPages = customPermissions[key] || getUserEffectivePages(user);

    let updatedPages;
    if (currentPages.includes(pageId)) {
      updatedPages = currentPages.filter(p => p !== pageId);
    } else {
      updatedPages = [...currentPages, pageId];
    }

    setCustomPermissions(prev => ({
      ...prev,
      [key]: updatedPages
    }));
  };

  // Apply quick preset to user
  const handleApplyPreset = (user, presetType) => {
    const key = (user.email || user.id).toLowerCase();
    let newPages = [];

    if (presetType === 'ALL') {
      newPages = SYSTEM_PAGES.map(p => p.id);
    } else if (presetType === 'AUDITOR') {
      newPages = ['audits'];
    } else if (presetType === 'CITY_ADMIN') {
      newPages = ['audits', 'replacements', 'escalations', 'managerPortal'];
    } else if (presetType === 'CITY_ADMIN_AND_AUDITOR') {
      newPages = ['audits', 'replacements', 'escalations', 'managerPortal'];
    } else if (presetType === 'CENTRAL_OPS') {
      newPages = ['audits', 'upload', 'allocation', 'escalations', 'replacements', 'managerPortal'];
    } else if (presetType === 'RESET') {
      // Reset to default union for assigned roles
      const roles = parseRoles(user.roles || [user.role]);
      const set = new Set();
      roles.forEach(r => (ROLE_DEFAULT_PAGES[r] || []).forEach(p => set.add(p)));
      newPages = Array.from(set);
    }

    setCustomPermissions(prev => ({
      ...prev,
      [key]: newPages
    }));
  };

  // Save permissions for single user
  const handleSavePermissions = async (user) => {
    const key = (user.email || user.id).toLowerCase();
    const pagesToSave = customPermissions[key] || getUserEffectivePages(user);

    setSavingUser(user.id);
    try {
      // 1. Save to local storage cache for BOTH email and id
      if (user.email) saveUserPagePermissions(user.email, pagesToSave);
      if (user.id) saveUserPagePermissions(user.id, pagesToSave);

      // 2. Call parent to update state and sync to Supabase (updating roles & profiles)
      if (onSaveUserPermissions) {
        await onSaveUserPermissions(user.id, user.email, pagesToSave);
      }

      setSavedSuccessMap(prev => ({ ...prev, [user.id]: true }));
      setTimeout(() => {
        setSavedSuccessMap(prev => ({ ...prev, [user.id]: false }));
      }, 3000);
    } catch (err) {
      alert(`Failed to save permissions: ${err.message}`);
    } finally {
      setSavingUser(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      
      {/* SuperAdmin Top Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveAdminTab('cronEngine')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeAdminTab === 'cronEngine'
              ? 'bg-gradient-to-r from-red-600/30 via-red-500/20 to-purple-600/30 text-white border border-red-500/40 shadow-lg shadow-red-950/40'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <span>Daily FE Fatal Dispatch Engine (Schedulable Cron)</span>
          {pendingFatalFeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white animate-pulse">
              {pendingFatalFeCount} FEs
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveAdminTab('permissions')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeAdminTab === 'permissions'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-lg'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Key className="w-4 h-4 text-purple-400" />
          <span>User & Role Page Permissions Matrix</span>
        </button>
      </div>

      {activeAdminTab === 'cronEngine' ? (
        <SuperAdminCronEngine
          tasks={tasks}
          users={users}
          currentUser={currentUser}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Direct Access Control Panel
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Live Page Authorization
                </span>
              </div>
              <h2 className="text-2xl font-black text-white mt-1">
                Granular User & Role Page Access Matrix
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">
                Directly configure which pages and consoles are accessible to which staff member. Direct page permissions override role limitations immediately (e.g. enabling City Admin Tool Orders + Auditor queues for multi-role staff).
              </p>
            </div>

            {onRefreshUsers && (
              <button
                onClick={onRefreshUsers}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer self-start md:self-auto"
              >
                <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                <span>Reload Staff</span>
              </button>
            )}
          </div>

      {/* Guide Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 text-xs text-slate-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-white text-sm">
              Multi-Role & Direct Page Authorization
            </div>
            <p className="text-slate-400 leading-relaxed max-w-3xl">
              Saving pages automatically updates the user's Supabase database roles (<code className="text-sky-300">profiles.roles</code>) and stores their page access cache.
              For example, granting <strong>Audits</strong> + <strong>City Admin Tool Orders</strong> automatically assigns both <strong className="text-white">City Admin</strong> and <strong className="text-white">Auditor</strong> roles so they persist across logins and devices.
            </p>
          </div>
        </div>

        {/* SQL Sync Snippet Button */}
        <button
          onClick={handleCopySql}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 self-end md:self-auto"
          title="Copy optional SQL to create page_access column in Supabase"
        >
          {sqlCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-sky-400" />}
          <span>{sqlCopied ? 'SQL Copied!' : 'Copy SQL Schema Helper'}</span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Staff by Name, Email, Hub or Employee Code..."
            className="w-full bg-slate-850 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Filter by Role:</span>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="bg-slate-850 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Roles</option>
            <option value="Admin">City Admin (Admin)</option>
            <option value="Auditor">Auditor</option>
            <option value="Central Ops">Central Ops</option>
            <option value="GM">General Manager (GM)</option>
            <option value="BH">Business Head (BH)</option>
            <option value="FE">Field Executive (FE)</option>
            <option value="SuperAdmin">SuperAdmin</option>
          </select>
        </div>
      </div>

      {/* Users Permission Matrix Cards */}
      <div className="space-y-4">
        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
            No staff accounts found matching your search.
          </div>
        ) : (
          filteredUsers.map(user => {
            const key = (user.email || user.id).toLowerCase();
            const effectivePages = customPermissions[key] || getUserEffectivePages(user);
            const userRoles = parseRoles(user.roles || [user.role]);
            const derivedRoles = deriveRolesFromPages(effectivePages);
            const isSuperAdmin = userRoles.includes('SuperAdmin') || user.role === 'SuperAdmin';
            const isSaving = savingUser === user.id;
            const isSaved = savedSuccessMap[user.id];

            return (
              <div 
                key={user.id || user.email}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700/80 transition-all shadow-lg space-y-4"
              >
                {/* User Info Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-300 font-bold flex items-center justify-center border border-blue-500/30 text-sm">
                      {(user.full_name || user.name || 'U').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {user.full_name || user.name}
                        </span>
                        {/* Display all active roles as separate badges */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {userRoles.map(r => (
                            <span 
                              key={r}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                r === 'Admin' ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' :
                                r === 'Auditor' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                r === 'SuperAdmin' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                                r === 'BH' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                r === 'GM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {displayRoleName(r)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="font-mono text-slate-300">{user.email}</span>
                        <span>•</span>
                        <span>Hub: {user.facility_code || user.city || 'Ahmedabad'}</span>
                        {user.person_id && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-slate-400">ID: {user.person_id}</span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-[11px] text-purple-300 font-semibold flex items-center gap-1">
                          Syncing Roles: {derivedRoles.map(r => `[${displayRoleName(r)}]`).join(' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Preset Buttons & Save Action */}
                  <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                    <span className="text-[11px] text-slate-500 font-medium mr-1">Presets:</span>
                    <button
                      onClick={() => handleApplyPreset(user, 'AUDITOR')}
                      className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition-colors"
                      title="Grant Audits page only"
                    >
                      Auditor Only
                    </button>
                    <button
                      onClick={() => handleApplyPreset(user, 'CITY_ADMIN_AND_AUDITOR')}
                      className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-sky-950/40 hover:bg-sky-900/60 text-sky-300 border border-sky-500/30 transition-colors"
                      title="Grant City Admin Tool Orders + Audits Console"
                    >
                      City Admin + Auditor
                    </button>
                    <button
                      onClick={() => handleApplyPreset(user, 'ALL')}
                      className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-500/30 transition-colors"
                      title="Grant All Pages"
                    >
                      Full Access
                    </button>
                    <button
                      onClick={() => handleSavePermissions(user)}
                      disabled={isSaving}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer ${
                        isSaved 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                      }`}
                    >
                      {isSaving ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : isSaved ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>{isSaved ? 'Saved!' : 'Save Access'}</span>
                    </button>
                  </div>
                </div>

                {/* Granular Pages Checkboxes Grid */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Authorized Workspaces & Consoles ({effectivePages.length} active):</span>
                    {isSuperAdmin && (
                      <span className="text-purple-400 font-semibold normal-case text-xs">
                        👑 SuperAdmin holds full administrative override
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {SYSTEM_PAGES.map(page => {
                      const isChecked = effectivePages.includes(page.id);
                      return (
                        <label
                          key={page.id}
                          className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 cursor-pointer transition-all select-none ${
                            isChecked
                              ? 'bg-blue-600/15 border-blue-500/40 text-white font-semibold'
                              : 'bg-slate-850/50 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTogglePage(user, page.id)}
                            className="rounded border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-slate-900 cursor-pointer"
                          />
                          <span className="truncate" title={page.description}>
                            {page.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>
      </>
      )}

    </div>
  );
}
