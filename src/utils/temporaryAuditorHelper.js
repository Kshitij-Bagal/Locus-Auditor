/**
 * Temporary Auditor Surge Capacity & Dynamic Access Control Engine
 * 
 * Business Rule:
 * 1. Any staff member can be added as a "Temporary Auditor" for surge periods (e.g. 1 hour shift).
 * 2. Each temporary auditor has an exact numerical task quota input (e.g. 15 tasks).
 * 3. Temporary auditors are granted immediate access to the Audits Console ('audits').
 * 4. During auto-allocation, exact quota tasks are deducted first for temporary auditors,
 *    and the remaining tasks in the pool are distributed equally among permanent auditors / City Admins.
 * 5. As soon as all assigned tasks are audited (pending === 0), access to the Audits Console
 *    is automatically revoked dynamically.
 */

import { saveUserPagePermissions, getSavedPermissionsMap } from './accessHelper.js';

export const TEMP_AUDITOR_REGISTRY_KEY = 'locus_temp_auditors_registry_v1';

/**
 * Load the persistent map of temporary auditors
 * Returns: { [userIdOrEmail]: { id, email, name, role, targetQuota, isTemporary: true, accessStatus: 'ACTIVE' | 'QUOTA_COMPLETED', addedAt, completedAt } }
 */
export function getTempAuditorsRegistry() {
  try {
    const saved = localStorage.getItem(TEMP_AUDITOR_REGISTRY_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.warn('Failed to parse temporary auditors registry:', e);
    return {};
  }
}

/**
 * Save updated registry to localStorage and dispatch update events
 */
function persistRegistry(registry) {
  try {
    localStorage.setItem(TEMP_AUDITOR_REGISTRY_KEY, JSON.stringify(registry));
    window.dispatchEvent(new CustomEvent('locus_presets_updated'));
    window.dispatchEvent(new CustomEvent('locus_temp_auditor_changed', { detail: registry }));
    return true;
  } catch (e) {
    console.warn('Failed to persist temporary auditors registry:', e);
    return false;
  }
}

/**
 * Look up a temporary auditor entry by ID, email, or full name
 */
export function findTempAuditorEntry(identifier) {
  if (!identifier) return null;
  const reg = getTempAuditorsRegistry();
  const cleanId = String(identifier).trim().toLowerCase();

  // Direct key lookup
  if (reg[cleanId]) return reg[cleanId];

  // Search by id, email, or name
  for (const key of Object.keys(reg)) {
    const entry = reg[key];
    if (
      String(entry.id || '').toLowerCase() === cleanId ||
      String(entry.email || '').toLowerCase() === cleanId ||
      String(entry.name || '').toLowerCase() === cleanId
    ) {
      return entry;
    }
  }

  return null;
}

/**
 * Check if a user is a temporary auditor and their access has been revoked due to quota completion
 */
export function isTempAuditorAccessRevoked(identifier) {
  const entry = findTempAuditorEntry(identifier);
  if (!entry) return false;
  return entry.accessStatus === 'QUOTA_COMPLETED' || entry.accessStatus === 'REVOKED';
}

/**
 * Register or update a staff member as a temporary surge auditor
 */
export function registerTempAuditor({
  userId,
  email,
  name,
  role = 'Staff',
  hub = 'Ahmedabad',
  employeeCode = '',
  targetQuota = 15
}) {
  if (!userId && !email) return false;

  const reg = getTempAuditorsRegistry();
  const primaryKey = String(userId || email).trim().toLowerCase();
  const cleanQuota = Math.max(1, parseInt(targetQuota, 10) || 15);

  const entry = {
    id: userId || primaryKey,
    userId: userId || primaryKey,
    email: email || '',
    name: name || email || 'Temporary Auditor',
    full_name: name || email || 'Temporary Auditor',
    role,
    hub,
    employeeCode,
    isTemporary: true,
    targetQuota: cleanQuota,
    accessStatus: 'ACTIVE',
    addedAt: new Date().toISOString(),
    completedAt: null
  };

  reg[primaryKey] = entry;
  if (email) {
    reg[String(email).trim().toLowerCase()] = entry;
  }

  // Grant access to Audits page
  const permMap = getSavedPermissionsMap();
  const currentGranted = permMap[primaryKey] || (email ? permMap[String(email).trim().toLowerCase()] : []) || [];
  const updatedGranted = Array.from(new Set([...currentGranted, 'audits', 'Audits']));
  saveUserPagePermissions(primaryKey, updatedGranted, email);

  persistRegistry(reg);
  return entry;
}

/**
 * Update the task quota for a temporary auditor
 */
export function updateTempAuditorQuota(identifier, newQuota) {
  const reg = getTempAuditorsRegistry();
  const entry = findTempAuditorEntry(identifier);
  if (!entry) return false;

  const parsedQuota = Math.max(1, parseInt(newQuota, 10) || 15);
  entry.targetQuota = parsedQuota;

  // If quota was updated, ensure their access is active
  entry.accessStatus = 'ACTIVE';
  entry.completedAt = null;

  reg[String(entry.id).toLowerCase()] = entry;
  if (entry.email) {
    reg[String(entry.email).toLowerCase()] = entry;
  }

  // Ensure access is re-granted
  const permMap = getSavedPermissionsMap();
  const currentGranted = permMap[String(entry.id).toLowerCase()] || [];
  const updatedGranted = Array.from(new Set([...currentGranted, 'audits', 'Audits']));
  saveUserPagePermissions(entry.id, updatedGranted, entry.email);

  persistRegistry(reg);
  return entry;
}

/**
 * Mark a temporary auditor as completed and dynamically revoke their Audits page access
 */
export function markTempAuditorCompleted(identifier) {
  const reg = getTempAuditorsRegistry();
  const entry = findTempAuditorEntry(identifier);
  if (!entry) return false;

  entry.accessStatus = 'QUOTA_COMPLETED';
  entry.completedAt = new Date().toISOString();

  reg[String(entry.id).toLowerCase()] = entry;
  if (entry.email) {
    reg[String(entry.email).toLowerCase()] = entry;
  }

  // Revoke 'audits' from granted permissions
  const permMap = getSavedPermissionsMap();
  const kId = String(entry.id).toLowerCase();
  const kEmail = entry.email ? String(entry.email).toLowerCase() : null;

  const existingPages = permMap[kId] || (kEmail ? permMap[kEmail] : []) || [];
  const revokedPages = existingPages.filter(p => p !== 'audits' && p !== 'Audits' && p !== 'audit');
  saveUserPagePermissions(entry.id, revokedPages, entry.email);

  persistRegistry(reg);
  return entry;
}

/**
 * Check if an auditor is temporary and whether their pending tasks have reached 0
 * If pending === 0, automatically revoke their Audits page access.
 * Returns: { isTemporary: boolean, wasRevoked: boolean, pendingCount: number, entry: object | null }
 */
export function checkAndRevokeTempAuditorIfComplete(auditorIdOrName, tasks = []) {
  if (!auditorIdOrName) return { isTemporary: false, wasRevoked: false };

  const entry = findTempAuditorEntry(auditorIdOrName);
  if (!entry || !entry.isTemporary) {
    return { isTemporary: false, wasRevoked: false };
  }

  // Count remaining pending auditable tasks for this auditor
  const pendingCount = tasks.filter(t => {
    const matchesAuditor = (
      (t.assignedAuditorId && String(t.assignedAuditorId).toLowerCase() === String(entry.id).toLowerCase()) ||
      (t.assignedAuditorName && String(t.assignedAuditorName).toLowerCase().trim() === String(entry.name).toLowerCase().trim()) ||
      (entry.email && t.assignedAuditorEmail && String(t.assignedAuditorEmail).toLowerCase() === String(entry.email).toLowerCase())
    );
    const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
    const isPending = !t.auditStatus || t.auditStatus === 'PENDING';
    return matchesAuditor && hasPhotos && isPending;
  }).length;

  // If pending is 0 and they are currently marked ACTIVE, revoke their access!
  if (pendingCount === 0 && entry.accessStatus === 'ACTIVE') {
    markTempAuditorCompleted(entry.id);
    return {
      isTemporary: true,
      wasRevoked: true,
      pendingCount: 0,
      entry
    };
  }

  return {
    isTemporary: true,
    wasRevoked: false,
    pendingCount,
    entry
  };
}

/**
 * Remove a staff member completely from the temporary auditor roster
 */
export function removeTempAuditor(identifier) {
  const reg = getTempAuditorsRegistry();
  const entry = findTempAuditorEntry(identifier);
  if (!entry) return false;

  delete reg[String(entry.id).toLowerCase()];
  if (entry.email) {
    delete reg[String(entry.email).toLowerCase()];
  }

  // Revoke 'audits' access
  const permMap = getSavedPermissionsMap();
  const kId = String(entry.id).toLowerCase();
  const existingPages = permMap[kId] || [];
  const revokedPages = existingPages.filter(p => p !== 'audits' && p !== 'Audits');
  saveUserPagePermissions(entry.id, revokedPages, entry.email);

  persistRegistry(reg);
  return true;
}
