import React, { useRef } from 'react';
import { 
  ShieldAlert, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  RefreshCw, 
  UserCheck, 
  Globe, 
  Wrench,
  LogIn,
  LogOut,
  User,
  ShoppingBag,
  Cpu,
  ShieldCheck,
  Building2,
  Sliders,
  Database
} from 'lucide-react';

export default function Header({ 
  onFileUpload, 
  onExport, 
  onReset, 
  auditorName, 
  setAuditorName,
  auditorLocation,
  onOpenSync,
  isCloudSyncActive,
  stats,
  activeTab,
  setActiveTab,
  currentUserRole,
  currentFE,
  onOpenLogin,
  onLogoutRole,
  supabaseHealth,
  onOpenSupabaseSetup
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const isSuperAdmin = currentUserRole === 'SuperAdmin';
  const isBH = currentUserRole === 'BH';
  const isGM = currentUserRole === 'GM';
  const isCityAdmin = currentUserRole === 'Admin' || currentUserRole === 'AM';
  const isCentralOps = currentUserRole === 'Central Ops';

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-xl backdrop-blur-md bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3.5 gap-4">
          
          {/* Brand & Role Badge */}
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Lenskart Operations
                </span>
                <span className="text-xs text-slate-400 font-mono">Locus DLC v2.5</span>
              </div>
              <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                FE Quality & Compliance Platform
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  currentUserRole === 'SuperAdmin' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                  currentUserRole === 'BH' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                  currentUserRole === 'GM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                  currentUserRole === 'Admin' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' :
                  currentUserRole === 'Central Ops' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                  currentUserRole === 'FE' ? 'bg-red-500/20 text-red-300 border-red-500/40' :
                  'bg-slate-700 text-slate-300 border-slate-600'
                }`}>
                  {currentUserRole === 'Admin' ? 'City Admin' : currentUserRole} Mode
                </span>
              </h1>
            </div>
          </div>

          {/* Dynamic Navigation Tabs (Hidden in FE mode) */}
          {currentUserRole !== 'FE' && (
            <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 self-start md:self-auto overflow-x-auto max-w-full">
              
              {/* Tab 1: Task Audits */}
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'audit'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Task Audits ({stats.withImages})
              </button>

              {/* Tab 2: Auto-Allocation & Roster */}
              <button
                onClick={() => setActiveTab('allocation')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'allocation'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                Allocation & Roster
              </button>

              {/* Tab 3: Central SOP Rule Studio (GM, BH, SuperAdmin) */}
              {(isGM || isBH || isSuperAdmin) && (
                <button
                  onClick={() => setActiveTab('rules')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeTab === 'rules'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  SOP Rule Studio
                </button>
              )}

              {/* Tab 4: Asset Replacements & City POS Orders */}
              <button
                onClick={() => setActiveTab('replacements')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'replacements'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />
                Asset Orders
                {stats.replacementsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500 text-white font-bold">
                    {stats.replacementsCount}
                  </span>
                )}
              </button>

              {/* Tab 5: FE Fatal Registry */}
              <button
                onClick={() => setActiveTab('fe')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'fe'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                FE Registry ({stats.totalFEs})
                {stats.fatalCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-red-500 text-white font-bold animate-pulse">
                    {stats.fatalCount}
                  </span>
                )}
              </button>

              {/* Tab 6: SuperAdmin User Management */}
              {isSuperAdmin && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeTab === 'users'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 text-purple-400" />
                  Users & RBAC
                </button>
              )}

            </div>
          )}

          {/* Right Header Controls */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* If logged in as FE */}
            {currentUserRole === 'FE' ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-indigo-950/60 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 text-xs text-indigo-200">
                  <User className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
                  <span>FE: <strong>{currentFE?.name}</strong></span>
                </div>
                <button
                  onClick={onLogoutRole}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400" />
                  Switch Role
                </button>
              </div>
            ) : (
              <>
                {/* Supabase Cloud DB Status Pill */}
                <button
                  onClick={onOpenSupabaseSetup}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    supabaseHealth?.tablesReady
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                      : supabaseHealth?.connected
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 animate-pulse'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                  }`}
                  title="Click to view Supabase Cloud Database setup and table status"
                >
                  <Database className="w-3.5 h-3.5 text-current" />
                  <span>
                    {supabaseHealth?.tablesReady
                      ? 'Cloud DB Live'
                      : supabaseHealth?.connected
                      ? 'Tables Pending'
                      : 'Cloud DB'}
                  </span>
                </button>

                {/* Switch Role Button */}
                <button
                  onClick={onOpenLogin}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Switch Role or FE Login"
                >
                  <LogIn className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Role: {currentUserRole === 'Admin' ? 'City Admin' : currentUserRole}</span>
                </button>

                {/* Upload Button */}
                {(isCentralOps || isSuperAdmin) && (
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Upload new Locus Excel or CSV file"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload
                    </button>
                  </>
                )}

                {/* Export Report Button */}
                <button
                  onClick={onExport}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Export complete audit summary to Excel"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  Export
                </button>

                {/* Reset button */}
                <button
                  onClick={onReset}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all cursor-pointer"
                  title="Reset to default sample data"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </>
            )}

          </div>

        </div>
      </div>
    </header>
  );
}
