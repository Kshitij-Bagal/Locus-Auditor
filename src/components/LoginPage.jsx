import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  ShieldAlert, 
  ArrowRight, 
  AlertCircle, 
  Eye, 
  EyeOff,
  Building2,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { authApi } from '../api/client.js';

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSignIn = async (e) => {
    e?.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setErrorMsg('Please enter your corporate email address.');
      return;
    }
    if (!cleanPassword) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);

    try {
      const { user, profile } = await authApi.signIn(cleanEmail, cleanPassword);
      if (!profile && !user) {
        throw new Error('User profile not found. Please contact SuperAdmin.');
      }
      onLoginSuccess(profile || {
        id: user.id,
        email: user.email,
        full_name: cleanEmail.split('@')[0],
        role: 'Auditor',
        facility_code: 'Ahmedabad'
      });
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please check your email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100 relative overflow-hidden">
      
      {/* Background radial glow decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 items-center justify-center shadow-xl shadow-blue-500/25 ring-1 ring-white/20 mb-2">
            <ShieldAlert className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Lenskart DLC Operations
          </h1>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Central Field Quality, Equipment Audit & Compliance System
          </p>
        </div>

        {/* Login Card */}
        <div className="mt-8 bg-slate-900/95 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-5">
          
          <div className="pb-1">
            <h2 className="text-sm font-bold text-white">
              Corporate Account Sign In
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter your registered corporate email and password to access the portal.
            </p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            
            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Corporate Email Address
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. yourname@lenskart.in"
                  required
                  autoFocus
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 flex items-start gap-2.5 text-xs text-red-300 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>

        {/* Security Notice */}
        <div className="text-center mt-6 text-[11px] text-slate-500 space-y-1">
          <div>Authorized Lenskart & Dealskart Staff Access Only</div>
          <div>Granular Role-Based Permissions Protected by Supabase Auth</div>
        </div>

      </div>
    </div>
  );
}
