import React, { useState } from 'react';
import { 
  X, 
  LogIn, 
  UserCheck, 
  ShieldCheck, 
  Lock, 
  Building2, 
  BadgeAlert,
  ArrowRight,
  ShieldAlert,
  Users
} from 'lucide-react';

const PRESET_USERS = [
  { role: 'SuperAdmin', name: 'Kshitij Bagal', email: 'superadmin@lenskart.in', facilityCode: 'All', personId: 'EMP001' },
  { role: 'BH', name: 'Sunil Kumar (Business Head)', email: 'bh.lenskart@lenskart.in', facilityCode: 'All', personId: 'EMP002' },
  { role: 'GM', name: 'Rajesh Sharma (General Manager)', email: 'gm.quality@lenskart.in', facilityCode: 'All', personId: 'EMP003' },
  { role: 'Admin', name: 'Abhay Pandey (City Admin)', email: 'admin.ahmedabad@lenskart.in', facilityCode: 'Ahmedabad', personId: 'EMP004' },
  { role: 'Central Ops', name: 'Rohan Mehta (Central Ops)', email: 'ops.central@lenskart.in', facilityCode: 'All', personId: 'EMP005' },
  { role: 'Auditor', name: 'Pooja Verma (Auditor)', email: 'auditor.pooja@lenskart.in', facilityCode: 'Ahmedabad', personId: 'AUD001' },
  { role: 'FE', name: 'Mohammed Aman Shaikh', email: 'fe.aman@lenskart.in', facilityCode: 'Ahmedabad', personId: '227563', feCode: 'LKH3149' },
  { role: 'FE', name: 'Rai Balvant Bimlesh', email: 'fe.balvant@lenskart.in', facilityCode: 'Ahmedabad', personId: '213812', feCode: 'LKH2976' }
];

export default function LoginModal({
  isOpen,
  onClose,
  tasks,
  onLoginRole,
  onLoginAsFE,
  currentUserRole
}) {
  const [authMode, setAuthMode] = useState('CORPORATE'); // 'CORPORATE' | 'FE_CREDENTIALS'
  const [facilityCode, setFacilityCode] = useState('Ahmedabad');
  const [personId, setPersonId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleFeSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!personId.trim()) {
      setErrorMsg('Please enter your Person ID / Rider ID.');
      return;
    }

    // Match task by Person ID or Code
    const matchedTask = tasks.find(t => 
      (t.feId && String(t.feId).trim() === personId.trim()) ||
      (t.feCode && String(t.feCode).toLowerCase() === personId.trim().toLowerCase())
    );

    if (!matchedTask) {
      setErrorMsg(`No records found for Person ID "${personId}". Please check your ID or choose from demo list.`);
      return;
    }

    onLoginAsFE({
      personId: matchedTask.feId || personId.trim(),
      facilityCode: facilityCode.trim() || matchedTask.facilityCode || 'Ahmedabad',
      feCode: matchedTask.feCode,
      name: matchedTask.feName
    });
    onClose();
  };

  const handleQuickLogin = (preset) => {
    if (preset.role === 'FE') {
      onLoginAsFE(preset);
    } else {
      onLoginRole(preset.role, preset);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-850 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Lenskart DLC Portal Authentication
              </h3>
              <p className="text-xs text-slate-400">
                Role-Based Access: SuperAdmin, City Admin, GM, BH, Central Ops, Auditor, FE
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher: Corporate Roles vs FE Credentials */}
        <div className="bg-slate-800/80 p-2 flex border-b border-slate-700/60">
          <button
            onClick={() => setAuthMode('CORPORATE')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              authMode === 'CORPORATE' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Corporate Roles (SuperAdmin / GM / BH / City Admin / Ops / Auditor)
          </button>
          <button
            onClick={() => setAuthMode('FE_CREDENTIALS')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              authMode === 'FE_CREDENTIALS' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Field Executive (Facility Code + Person ID)
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          
          {authMode === 'FE_CREDENTIALS' ? (
            <form onSubmit={handleFeSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Facility / Hub Code:
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={facilityCode}
                    onChange={(e) => setFacilityCode(e.target.value)}
                    placeholder="e.g. Ahmedabad, DLC-AHM"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Person ID / Rider ID:
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={personId}
                    onChange={(e) => setPersonId(e.target.value)}
                    placeholder="e.g. 227563, 213812..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 text-xs">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Sign In to FE Compliance Portal
              </button>
            </form>
          ) : (
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block mb-2">
                Select Persona / Role to Test Dashboard:
              </span>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {PRESET_USERS.map(user => (
                  <button
                    key={`${user.role}_${user.email}`}
                    type="button"
                    onClick={() => handleQuickLogin(user)}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/60 hover:bg-indigo-950/20 transition-all flex items-center justify-between text-xs cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.2 rounded font-mono ${
                          user.role === 'SuperAdmin' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' :
                          user.role === 'BH' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                          user.role === 'GM' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                          user.role === 'Admin' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' :
                          user.role === 'Central Ops' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                          user.role === 'FE' ? 'bg-red-500/20 text-red-300 border border-red-500/40' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {user.role === 'Admin' ? 'City Admin' : user.role}
                        </span>
                        <span className="font-bold text-white group-hover:text-indigo-300">{user.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        {user.email} • Hub: {user.facilityCode}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
