import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Menu, 
  X, 
  LogOut, 
  FileSpreadsheet, 
  Upload, 
  Cpu, 
  ShieldCheck, 
  ShoppingBag, 
  Sliders, 
  User, 
  Building2,
  AlertTriangle,
  Key,
  Briefcase
} from 'lucide-react';
import { hasPageAccess, parseRoles, displayRoleName } from '../utils/accessHelper.js';

export default function Navbar({
  currentUser,
  activePage,
  onNavigate,
  onLogout,
  overdueCount = 0
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Multi-Role Support: Extract and normalize all roles assigned to this user
  const userRoles = parseRoles(currentUser?.roles || [currentUser?.role || 'Auditor']);

  // Role & Permission Based Page Definitions
  const allNavItems = [
    {
      id: 'audits',
      label: 'Audits',
      icon: FileSpreadsheet,
      allowedRoles: ['Auditor', 'Central Ops', 'Admin', 'AM', 'RM', 'SuperAdmin']
    },
    {
      id: 'upload',
      label: 'Upload Tasks',
      icon: Upload,
      allowedRoles: ['Central Ops', 'SuperAdmin']
    },
    {
      id: 'allocation',
      label: 'Roster & Workload',
      icon: Cpu,
      allowedRoles: ['Central Ops', 'GM', 'BH', 'SuperAdmin']
    },
    {
      id: 'escalations',
      label: 'D+1 Escalations',
      icon: AlertTriangle,
      badge: overdueCount > 0 ? overdueCount : null,
      allowedRoles: ['BH', 'GM', 'Central Ops', 'Admin', 'SuperAdmin']
    },
    {
      id: 'rules',
      label: 'Quality Rules',
      icon: ShieldCheck,
      allowedRoles: ['GM', 'BH', 'SuperAdmin']
    },
    {
      id: 'replacements',
      label: 'Tool Orders',
      icon: ShoppingBag,
      allowedRoles: ['Admin', 'AM', 'Central Ops', 'GM', 'BH', 'SuperAdmin']
    },
    {
      id: 'managerPortal',
      label: 'Cluster Oversight',
      icon: Briefcase,
      allowedRoles: ['AM', 'RM', 'Admin', 'GM', 'BH', 'Central Ops', 'SuperAdmin']
    },
    {
      id: 'fePortal',
      label: 'My Visits',
      icon: User,
      allowedRoles: ['FE']
    },
    {
      id: 'users',
      label: 'User Accounts',
      icon: Sliders,
      allowedRoles: ['SuperAdmin']
    },
    {
      id: 'accessControl',
      label: 'Access Control',
      icon: Key,
      allowedRoles: ['SuperAdmin']
    }
  ];

  // Filter approved navigation items using the granular Access Control helper
  const approvedNavItems = allNavItems.filter(item => {
    return hasPageAccess(currentUser, item.id);
  });

  const handleSelectPage = (pageId) => {
    onNavigate(pageId);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl backdrop-blur-md bg-opacity-95">
      <div className="w-full px-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Brand Logo & Title (Fixed width, clean spacing, never wraps or collides) */}
          <div className="flex items-center space-x-2.5 shrink-0 select-none">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10 shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-[10px] font-black tracking-wider uppercase px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Lenskart DLC
                </span>
                <span className="text-xs font-bold text-white tracking-tight">Audit Console</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5 whitespace-nowrap">
                {userRoles.map(r => (
                  <span key={r} className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                    r === 'SuperAdmin' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                    r === 'BH' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                    r === 'GM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                    r === 'Admin' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' :
                    r === 'Central Ops' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                    r === 'Auditor' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                    r === 'AM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                    r === 'RM' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                    r === 'FE' ? 'bg-red-500/20 text-red-300 border-red-500/40' :
                    'bg-slate-700 text-slate-300 border-slate-600'
                  }`}>
                    {displayRoleName(r)}
                  </span>
                ))}
                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">
                  • {currentUser?.facility_code || 'Ahmedabad'}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links: Compact Icons by default, expands text label on hover or active */}
          <div className="hidden lg:flex items-center gap-1 flex-1 justify-center min-w-0 px-2 py-1">
            {approvedNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectPage(item.id)}
                  title={item.label}
                  className={`group relative flex items-center rounded-xl py-1.5 transition-all duration-300 ease-in-out cursor-pointer shrink-0 select-none ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-bold px-3'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/90 px-2.5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  
                  {/* Label: Always visible when active; expands smoothly on hover when inactive */}
                  <span className={`text-xs font-semibold whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
                    isActive
                      ? 'max-w-[140px] opacity-100 ml-2'
                      : 'max-w-0 opacity-0 group-hover:max-w-[140px] group-hover:opacity-100 group-hover:ml-2'
                  }`}>
                    {item.label}
                  </span>

                  {/* Overdue / Alert Badge */}
                  {item.badge && (
                    <span className={`rounded-full font-black text-[9px] bg-red-500 text-white animate-pulse transition-all ${
                      isActive 
                        ? 'ml-1.5 px-1.5 py-0.2'
                        : 'absolute -top-1 -right-1 px-1.5 py-0.2 shadow-md shadow-red-500/50'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* User Profile & Logout (Desktop: Anchored on the right, never pushed off-screen) */}
          <div className="hidden sm:flex items-center space-x-2.5 shrink-0 ml-auto pl-3 border-l border-slate-800">
            <div className="text-right">
              <div className="text-xs font-bold text-white flex items-center justify-end gap-1">
                <span className="truncate max-w-[130px]">
                  {currentUser?.full_name || currentUser?.email?.split('@')[0] || 'User'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]">
                {currentUser?.email || ''}
              </div>
            </div>

            <button
              onClick={onLogout}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-red-950/40 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/40 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex lg:hidden items-center space-x-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Responsive Hamburger Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-900/98 backdrop-blur-xl px-4 pt-3 pb-4 space-y-2 animate-in slide-in-from-top-2 duration-200 shadow-2xl">
          
          {/* User info header on mobile */}
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between mb-2">
            <div>
              <div className="text-xs font-bold text-white">
                {currentUser?.full_name || currentUser?.email}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 flex-wrap">
                {userRoles.map(r => (
                  <span key={r} className="text-sky-400 font-semibold">{displayRoleName(r)}</span>
                ))}
                <span>•</span>
                <span>{currentUser?.facility_code || 'Ahmedabad'}</span>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-900/30 text-red-300 border border-red-500/30 flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" />
              Logout
            </button>
          </div>

          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
            Menu Navigation:
          </div>

          {/* Page Links */}
          <div className="grid grid-cols-1 gap-1">
            {approvedNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectPage(item.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-current" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

        </div>
      )}
    </nav>
  );
}
