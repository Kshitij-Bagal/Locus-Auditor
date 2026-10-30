import React, { useState, useRef, useEffect } from 'react';
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
  Briefcase,
  ChevronDown
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
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
  const adminDropdownRef = useRef(null);
  const closeTimerRef = useRef(null);

  // Smooth on-hover open / close handlers with anti-flicker delay
  const handleAdminMouseEnter = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setAdminDropdownOpen(true);
  };

  const handleAdminMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      setAdminDropdownOpen(false);
    }, 180);
  };

  // Close admin dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target)) {
        setAdminDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

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

  // Separate into primary operational links and secondary administrative dropdown
  const adminPageIds = ['users', 'accessControl', 'fePortal'];
  const primaryNavItems = approvedNavItems.filter(item => !adminPageIds.includes(item.id));
  const adminNavItems = approvedNavItems.filter(item => adminPageIds.includes(item.id));
  const isAdminActive = adminNavItems.some(item => item.id === activePage);

  const handleSelectPage = (pageId) => {
    onNavigate(pageId);
    setMobileMenuOpen(false);
    setAdminDropdownOpen(false);
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl backdrop-blur-md bg-opacity-95">
      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Brand Logo & Title (Fixed width, never overflows or wraps vertically) */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10 shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-[10px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Lenskart DLC
                </span>
                <span className="text-xs font-bold text-white tracking-tight">Audit Dashboard</span>
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

          {/* Desktop Navigation Links (Responsive & Cleanly Grouped) */}
          <div className="hidden lg:flex items-center gap-1 flex-1 justify-center min-w-0 px-2 overflow-x-auto no-scrollbar">
            {primaryNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectPage(item.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-red-500 text-white animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Admin & Settings On-Hover Dropdown Menu (Consolidates User Accounts & Access Control) */}
            {adminNavItems.length > 0 && (
              <div 
                className="relative shrink-0" 
                ref={adminDropdownRef}
                onMouseEnter={handleAdminMouseEnter}
                onMouseLeave={handleAdminMouseLeave}
              >
                <button
                  onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    isAdminActive
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-bold'
                      : adminDropdownOpen
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  aria-expanded={adminDropdownOpen}
                >
                  <Sliders className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isAdminActive 
                      ? adminNavItems.find(i => i.id === activePage)?.label || 'Administration'
                      : 'Administration'}
                  </span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${adminDropdownOpen ? 'rotate-180 text-white' : 'text-slate-400'}`} />
                </button>

                {/* Dropdown Menu (Opens on hover and click with anti-flicker bridge) */}
                {adminDropdownOpen && (
                  <div className="absolute right-0 top-full pt-1.5 w-56 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl p-1.5 backdrop-blur-xl ring-1 ring-white/10">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1 border-b border-slate-800 mb-1 flex items-center justify-between">
                        <span>System Administration</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
                          Admin
                        </span>
                      </div>
                      
                      {adminNavItems.map(item => {
                        const Icon = item.icon;
                        const isActive = activePage === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSelectPage(item.id)}
                            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2.5 cursor-pointer group ${
                              isActive
                                ? 'bg-blue-600 text-white font-bold shadow-sm'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                            }`}
                          >
                            <div className={`p-1 rounded-md shrink-0 ${
                              isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-white'
                            }`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">{item.label}</div>
                              <div className={`text-[10px] truncate ${isActive ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-400'}`}>
                                {item.id === 'users' && 'Staff registry & credentials'}
                                {item.id === 'accessControl' && 'Granular RBAC page studio'}
                                {item.id === 'fePortal' && 'Field executive self-service'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Profile & Logout (Anchored on the right, never pushed off-screen) */}
          <div className="hidden sm:flex items-center space-x-2.5 shrink-0 ml-auto pl-2 border-l border-slate-800/80">
            <div className="text-right">
              <div className="text-xs font-bold text-white flex items-center justify-end gap-1">
                <span className="truncate max-w-[140px]">
                  {currentUser?.full_name || currentUser?.email?.split('@')[0] || 'User'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
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
