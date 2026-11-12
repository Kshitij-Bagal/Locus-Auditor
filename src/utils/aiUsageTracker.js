/**
 * Unified Daily AI API Request Tracker (RPD: Requests Per Day)
 * 
 * Provides centralized tracking, real-time synchronization, and role breakdown
 * for all AI API calls across the platform (Task SOP Audits, FE Grooming Checks, Forensics Lab, Key Checks).
 */

import { settingsApi } from '../api/client.js';

export function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getActiveUserInfo() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('locus_auth_user') : null;
    if (raw) {
      const u = JSON.parse(raw);
      const role = Array.isArray(u.roles) && u.roles.length > 0 
        ? u.roles[0] 
        : (u.role || 'Auditor');
      const email = u.email || 'staff@lenskart.com';
      const name = u.full_name || u.name || 'Staff User';
      return { role, email, name };
    }
  } catch (_) {}
  return { role: 'SuperAdmin', email: 'admin@lenskart.com', name: 'SuperAdmin' };
}

function normalizeRecord(raw, date) {
  if (!raw || typeof raw !== 'object' || raw.date !== date) {
    return {
      date,
      totalRequests: 0,
      totalTokens: 0,
      byRole: {},
      byFeature: {},
      byModel: {},
      recentCalls: [],
      lastUpdated: new Date().toISOString()
    };
  }

  return {
    date,
    totalRequests: Math.max(0, Number(raw.totalRequests ?? raw.requests) || 0),
    totalTokens: Math.max(0, Number(raw.totalTokens) || 0),
    byRole: raw.byRole && typeof raw.byRole === 'object' ? { ...raw.byRole } : {},
    byFeature: raw.byFeature && typeof raw.byFeature === 'object' ? { ...raw.byFeature } : {},
    byModel: raw.byModel && typeof raw.byModel === 'object' ? { ...raw.byModel } : {},
    recentCalls: Array.isArray(raw.recentCalls) ? raw.recentCalls.slice(0, 30) : [],
    lastUpdated: raw.lastUpdated || new Date().toISOString()
  };
}

/**
 * Get current cached unified AI usage for today
 */
export function getUnifiedAiUsage(dateStr = null) {
  const date = dateStr || getTodayYMD();
  if (typeof window === 'undefined') return normalizeRecord(null, date);

  try {
    const rawUnified = localStorage.getItem(`locus_unified_ai_rpd_${date}`);
    if (rawUnified) {
      const parsed = JSON.parse(rawUnified);
      if (parsed && parsed.date === date) return normalizeRecord(parsed, date);
    }

    // Fallback: check legacy daily tracker key
    const rawLegacy = localStorage.getItem(`locus_daily_ai_audit_tracker_${date}`);
    if (rawLegacy) {
      const legacy = JSON.parse(rawLegacy);
      if (legacy && legacy.date === date) {
        return normalizeRecord({
          date,
          totalRequests: legacy.requests || 0,
          totalTokens: legacy.totalTokens || 0,
          byRole: { 'SuperAdmin': legacy.requests || 0 },
          byFeature: { 'Task Audit': legacy.requests || 0 }
        }, date);
      }
    }
  } catch (_) {}

  return normalizeRecord(null, date);
}

/**
 * Fetch remote usage from Supabase and merge with local
 */
export async function fetchRemoteUnifiedAiUsage(dateStr = null) {
  const date = dateStr || getTodayYMD();
  const local = getUnifiedAiUsage(date);

  try {
    const [remoteUnified, remoteLegacy] = await Promise.all([
      settingsApi.getSetting(`unified_ai_rpd_${date}`, null).catch(() => null),
      settingsApi.getSetting(`daily_ai_audit_tracker_${date}`, null).catch(() => null)
    ]);

    const remoteUnifiedNorm = remoteUnified && remoteUnified.date === date ? normalizeRecord(remoteUnified, date) : null;
    const legacyReqs = (remoteLegacy && remoteLegacy.date === date && typeof remoteLegacy.requests === 'number') ? remoteLegacy.requests : 0;
    const legacyTokens = (remoteLegacy && remoteLegacy.date === date && typeof remoteLegacy.totalTokens === 'number') ? remoteLegacy.totalTokens : 0;

    const maxRequests = Math.max(
      local.totalRequests,
      remoteUnifiedNorm?.totalRequests || 0,
      legacyReqs
    );

    const maxTokens = Math.max(
      local.totalTokens,
      remoteUnifiedNorm?.totalTokens || 0,
      legacyTokens
    );

    // Merge byRole
    const mergedByRole = { ...local.byRole };
    if (remoteUnifiedNorm?.byRole) {
      Object.entries(remoteUnifiedNorm.byRole).forEach(([role, count]) => {
        mergedByRole[role] = Math.max(mergedByRole[role] || 0, Number(count) || 0);
      });
    }

    // Merge byFeature
    const mergedByFeature = { ...local.byFeature };
    if (remoteUnifiedNorm?.byFeature) {
      Object.entries(remoteUnifiedNorm.byFeature).forEach(([feat, count]) => {
        mergedByFeature[feat] = Math.max(mergedByFeature[feat] || 0, Number(count) || 0);
      });
    }

    // Merge byModel
    const mergedByModel = { ...local.byModel };
    if (remoteUnifiedNorm?.byModel) {
      Object.entries(remoteUnifiedNorm.byModel).forEach(([model, count]) => {
        mergedByModel[model] = Math.max(mergedByModel[model] || 0, Number(count) || 0);
      });
    }

    // Merge recent calls
    const seenIds = new Set();
    const mergedCalls = [];
    [...(local.recentCalls || []), ...(remoteUnifiedNorm?.recentCalls || [])].forEach(call => {
      if (!call) return;
      const key = call.id || `${call.timestamp}_${call.role}_${call.feature}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        mergedCalls.push(call);
      }
    });

    mergedCalls.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const finalRecord = {
      date,
      totalRequests: maxRequests,
      totalTokens: maxTokens,
      byRole: mergedByRole,
      byFeature: mergedByFeature,
      byModel: mergedByModel,
      recentCalls: mergedCalls.slice(0, 30),
      lastUpdated: new Date().toISOString()
    };

    try {
      localStorage.setItem(`locus_unified_ai_rpd_${date}`, JSON.stringify(finalRecord));
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('locus_ai_rpd_updated', { detail: finalRecord }));
    }

    return finalRecord;
  } catch (err) {
    return local;
  }
}

/**
 * Increment and record an AI API call across any role or feature.
 */
export function recordAiApiCall({
  feature = 'Task Audit',
  model = 'gemini-3.8-flash',
  tokens = 1500,
  status = 'SUCCESS',
  role = null,
  email = null,
  details = null
} = {}) {
  const date = getTodayYMD();
  const current = getUnifiedAiUsage(date);
  const user = getActiveUserInfo();

  const finalRole = role || user.role || 'SuperAdmin';
  const finalEmail = email || user.email || 'staff@lenskart.com';
  const finalTokens = Math.max(1, Number(tokens) || 1500);

  const updatedRequests = current.totalRequests + 1;
  const updatedTokens = current.totalTokens + finalTokens;

  const nextByRole = { ...current.byRole };
  nextByRole[finalRole] = (nextByRole[finalRole] || 0) + 1;

  const nextByFeature = { ...current.byFeature };
  nextByFeature[feature] = (nextByFeature[feature] || 0) + 1;

  const nextByModel = { ...current.byModel };
  nextByModel[model] = (nextByModel[model] || 0) + 1;

  const newEntry = {
    id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    role: finalRole,
    email: finalEmail,
    feature,
    model,
    tokens: finalTokens,
    status,
    details: details || null
  };

  const nextCalls = [newEntry, ...(current.recentCalls || [])].slice(0, 30);

  const updatedRecord = {
    date,
    totalRequests: updatedRequests,
    totalTokens: updatedTokens,
    byRole: nextByRole,
    byFeature: nextByFeature,
    byModel: nextByModel,
    recentCalls: nextCalls,
    lastUpdated: new Date().toISOString()
  };

  try {
    localStorage.setItem(`locus_unified_ai_rpd_${date}`, JSON.stringify(updatedRecord));
  } catch (_) {}

  // Local Broadcast to Navbar and other components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('locus_ai_rpd_updated', { detail: updatedRecord }));
  }

  // Asynchronous remote synchronization to Supabase system_settings
  settingsApi.setSetting(`unified_ai_rpd_${date}`, updatedRecord, finalEmail).catch(() => {});

  // Legacy sync
  settingsApi.setSetting(`daily_ai_audit_tracker_${date}`, {
    date,
    requests: updatedRequests,
    totalTokens: updatedTokens,
    lastUpdated: new Date().toISOString()
  }, finalEmail).catch(() => {});

  return updatedRecord;
}

/**
 * Subscribe to real-time RPD updates
 */
export function subscribeToUnifiedAiUsage(callback, pollIntervalMs = 20000) {
  if (typeof window === 'undefined') return () => {};

  const handleUpdate = (e) => {
    if (e?.detail) callback(e.detail);
    else callback(getUnifiedAiUsage());
  };

  const handleStorage = (e) => {
    if (e.key && e.key.includes('unified_ai_rpd')) {
      callback(getUnifiedAiUsage());
    }
  };

  window.addEventListener('locus_ai_rpd_updated', handleUpdate);
  window.addEventListener('storage', handleStorage);

  // Initial remote fetch
  fetchRemoteUnifiedAiUsage().then(data => callback(data)).catch(() => {});

  // Background polling for cross-machine updates
  const timer = setInterval(() => {
    fetchRemoteUnifiedAiUsage().then(data => callback(data)).catch(() => {});
  }, pollIntervalMs);

  return () => {
    window.removeEventListener('locus_ai_rpd_updated', handleUpdate);
    window.removeEventListener('storage', handleStorage);
    clearInterval(timer);
  };
}
