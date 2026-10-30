/**
 * Access Control & Page Permissions Helper for Locus Auditor
 * 
 * Provides:
 * 1. Role normalization (e.g. 'City Admin' -> 'Admin', multi-role string parsing)
 * 2. Granular page definitions
 * 3. Role-to-page default mappings
 * 4. User-specific page permission resolution (direct overrides)
 * 5. Persistent local storage sync
 */

// All standard pages available in the Locus Auditor system
export const SYSTEM_PAGES = [
  {
    id: 'audits',
    label: 'Audits',
    fullName: 'Audits Console',
    description: 'Inspect field visit photos, pass or fatal equipment compliance',
    category: 'Core Operations'
  },
  {
    id: 'upload',
    label: 'Upload Tasks',
    fullName: 'Daily Task Ingestion',
    description: 'Upload daily Locus dispatch spreadsheet with routes and customer OTPs',
    category: 'Operations'
  },
  {
    id: 'allocation',
    label: 'Roster & Workload',
    fullName: 'Auto-Allocation & Roster',
    description: 'Auditor attendance, shifts, equal photo task distribution',
    category: 'Operations'
  },
  {
    id: 'escalations',
    label: 'D+1 Escalations',
    fullName: 'D+1 SLA Breach Escalations',
    description: 'Overdue audit monitoring escalated to Sunil Kumar (BH) & Rajesh Sharma (GM)',
    category: 'Governance'
  },
  {
    id: 'rules',
    label: 'Quality Rules',
    fullName: 'Central SOP Rules Studio',
    description: 'Central SOP criteria, mandatory checklist & fatal failure triggers',
    category: 'Governance'
  },
  {
    id: 'replacements',
    label: 'Tool Orders',
    fullName: 'City Admin POS Orders',
    description: 'Asset replacement requisition & POS dispatch tracking for broken tools',
    category: 'Asset Management'
  },
  {
    id: 'managerPortal',
    label: 'Cluster Oversight',
    fullName: 'AM & RM Cluster Operations Portal',
    description: 'Monitor FE fatal strikes, task statistics, compliance & daily digests for teams under your management',
    category: 'Field Management'
  },
  {
    id: 'fePortal',
    label: 'My Visits',
    fullName: 'Field Executive Self-Service',
    description: 'Field executive self-service visit ledger & equipment compliance',
    category: 'Field Executive'
  },
  {
    id: 'users',
    label: 'User Accounts',
    fullName: 'User Profile & RBAC Registry',
    description: 'Corporate staff registry, credentials, and role assignments',
    category: 'Administration'
  },
  {
    id: 'accessControl',
    label: 'Access Control',
    fullName: 'Granular Page Access Panel',
    description: 'Configure and override exact page permissions per user and role',
    category: 'Administration'
  }
];

// Normalize role names (e.g. handles 'City Admin' -> 'Admin')
export function normalizeRoleName(rawRole) {
  if (!rawRole || typeof rawRole !== 'string') return 'Auditor';
  const clean = rawRole.trim().toLowerCase();
  
  if (clean === 'admin' || clean === 'city admin' || clean === 'cityadmin') return 'Admin';
  if (clean === 'superadmin' || clean === 'super admin' || clean === 'super_admin') return 'SuperAdmin';
  if (clean === 'central ops' || clean === 'centralops' || clean === 'ops' || clean === 'central_ops') return 'Central Ops';
  if (clean === 'auditor') return 'Auditor';
  if (clean === 'fe' || clean === 'field executive' || clean === 'rider') return 'FE';
  if (clean === 'gm' || clean === 'general manager' || clean === 'general_manager') return 'GM';
  if (clean === 'bh' || clean === 'business head' || clean === 'business_head') return 'BH';
  if (clean === 'am' || clean === 'area manager' || clean === 'area_manager') return 'AM';
  if (clean === 'rm' || clean === 'regional manager' || clean === 'regional_manager') return 'RM';
  
  return rawRole.trim();
}

// Display friendly name for badges
export function displayRoleName(role) {
  const norm = normalizeRoleName(role);
  if (norm === 'Admin') return 'City Admin';
  if (norm === 'BH') return 'Business Head';
  if (norm === 'GM') return 'General Manager';
  if (norm === 'AM') return 'Area Manager';
  if (norm === 'RM') return 'Regional Manager';
  if (norm === 'FE') return 'Field Executive';
  return norm;
}

// Parse string or array of roles into a normalized array of roles
export function parseRoles(raw) {
  if (!raw) return ['Auditor'];
  if (Array.isArray(raw)) {
    const list = raw.map(normalizeRoleName).filter(Boolean);
    return list.length > 0 ? Array.from(new Set(list)) : ['Auditor'];
  }
  if (typeof raw === 'string') {
    const list = raw.split(/[,/|]/).map(normalizeRoleName).filter(Boolean);
    return list.length > 0 ? Array.from(new Set(list)) : ['Auditor'];
  }
  return ['Auditor'];
}

// Default page access configuration per role
export const ROLE_DEFAULT_PAGES = {
  SuperAdmin: SYSTEM_PAGES.map(p => p.id),
  Admin: ['audits', 'replacements', 'escalations', 'managerPortal'], // City Admin
  'Central Ops': ['audits', 'upload', 'allocation', 'escalations', 'replacements', 'managerPortal'],
  GM: ['rules', 'escalations', 'allocation', 'replacements', 'managerPortal'],
  BH: ['rules', 'escalations', 'allocation', 'replacements', 'managerPortal'],
  Auditor: ['audits'],
  AM: ['managerPortal', 'audits', 'replacements'],
  RM: ['managerPortal', 'audits', 'replacements'],
  FE: ['fePortal']
};

// Automatically derive database roles from granted page IDs
export function deriveRolesFromPages(pageIds = []) {
  if (!Array.isArray(pageIds) || pageIds.length === 0) return ['Auditor'];

  const roleSet = new Set();
  
  if (pageIds.includes('users') || pageIds.includes('accessControl')) {
    roleSet.add('SuperAdmin');
  }
  if (pageIds.includes('replacements')) {
    roleSet.add('Admin'); // City Admin
  }
  if (pageIds.includes('upload') || pageIds.includes('allocation')) {
    roleSet.add('Central Ops');
  }
  if (pageIds.includes('rules')) {
    roleSet.add('GM');
  }
  if (pageIds.includes('escalations') && !pageIds.includes('replacements') && !pageIds.includes('upload')) {
    roleSet.add('BH');
  }
  if (pageIds.includes('audits')) {
    roleSet.add('Auditor');
  }
  if (pageIds.includes('fePortal')) {
    roleSet.add('FE');
  }

  if (roleSet.size === 0) {
    roleSet.add('Auditor');
  }

  // Prioritize primary role order: SuperAdmin > Admin > Central Ops > GM > BH > Auditor > FE
  const priority = ['SuperAdmin', 'Admin', 'Central Ops', 'GM', 'BH', 'Auditor', 'AM', 'RM', 'FE'];
  return Array.from(roleSet).sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
}

// Storage key for user page overrides
export const USER_PERMISSIONS_STORAGE_KEY = 'locus_user_page_permissions_v2';

// Load all saved custom user page overrides
export function getSavedPermissionsMap() {
  try {
    const saved = localStorage.getItem(USER_PERMISSIONS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
}

// Save custom page permissions for a specific user (supports email and/or id)
export function saveUserPagePermissions(userEmailOrId, pageIds, secondaryKey = null) {
  try {
    const map = getSavedPermissionsMap();
    if (userEmailOrId) {
      const key1 = String(userEmailOrId).trim().toLowerCase();
      map[key1] = Array.isArray(pageIds) ? pageIds : [];
    }
    if (secondaryKey) {
      const key2 = String(secondaryKey).trim().toLowerCase();
      map[key2] = Array.isArray(pageIds) ? pageIds : [];
    }
    localStorage.setItem(USER_PERMISSIONS_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch (e) {
    console.warn('Failed to save user permissions:', e);
    return false;
  }
}

/**
 * Resolves the effective accessible pages for a given user.
 * 
 * Priority:
 * 1. SuperAdmin: Full access to all pages.
 * 2. Explicit direct user override (from database profile.page_access or localStorage map).
 * 3. Union of default pages for all roles assigned to the user.
 */
export function getUserEffectivePages(user) {
  if (!user) return [];

  const roles = parseRoles(user.roles || [user.role]);
  const isSuperAdmin = roles.includes('SuperAdmin') || user.role === 'SuperAdmin';

  if (isSuperAdmin) {
    return SYSTEM_PAGES.map(p => p.id);
  }

  // Check direct overrides from localStorage
  const permMap = getSavedPermissionsMap();
  const emailKey = user.email ? String(user.email).trim().toLowerCase() : '';
  const idKey = user.id ? String(user.id).trim().toLowerCase() : '';

  const cleanPages = (pages) => {
    if (!Array.isArray(pages)) return [];
    // Auto-migrate any legacy feRegistry reference to managerPortal
    const migrated = pages.map(p => p === 'feRegistry' ? 'managerPortal' : p);
    return Array.from(new Set(migrated.filter(p => p !== 'feRegistry')));
  };

  const savedOverride = permMap[emailKey] || permMap[idKey];
  if (Array.isArray(savedOverride) && savedOverride.length > 0) {
    return cleanPages(savedOverride);
  }

  // Check direct database profile attribute (e.g. profile.page_access)
  if (Array.isArray(user.page_access) && user.page_access.length > 0) {
    return cleanPages(user.page_access);
  }
  if (Array.isArray(user.pageAccess) && user.pageAccess.length > 0) {
    return cleanPages(user.pageAccess);
  }

  // Compute union of default pages for all assigned roles
  const pagesSet = new Set();
  roles.forEach(r => {
    const defaults = ROLE_DEFAULT_PAGES[r] || [];
    defaults.forEach(p => pagesSet.add(p));
  });

  // Fallback to Auditor page if empty
  if (pagesSet.size === 0) {
    pagesSet.add('audits');
  }

  return cleanPages(Array.from(pagesSet));
}

// Quick check if a user is authorized to view a specific page
export function hasPageAccess(user, pageId) {
  if (!user || !pageId) return false;
  const effectivePages = getUserEffectivePages(user);
  return effectivePages.includes(pageId);
}
