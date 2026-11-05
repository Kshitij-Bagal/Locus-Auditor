/**
 * Access Control & Permission Architecture for Locus Auditor
 * 
 * Provides:
 * 1. Exact Default Role Presets for all corporate roles.
 * 2. Editable Live Role Presets synced with LocalStorage and Supabase.
 * 3. Separation of default role presets vs granted page access (overrides).
 * 4. hasAccess(profile, pageName) evaluation using live dynamic presets.
 * 5. Bidirectional mapping between page IDs and human-readable page names.
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
    label: 'Upload Task',
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
    label: 'D + 1 Escalations',
    fullName: 'D+1 SLA Breach Escalations',
    description: 'Overdue audit monitoring escalated to Business Head (BH) & General Manager (GM)',
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
  },
  {
    id: 'fatalObjection',
    label: 'Fatal objection',
    fullName: 'Fatal Objection & Dispute Meet Hub',
    description: 'Senior Auditor review for contested strikes, dispute meets, and re-auditing',
    category: 'Governance'
  },
  {
    id: 'emailDispatch',
    label: 'Mail Dispatch',
    fullName: 'Daily Fatal Mail Dispatch Engine',
    description: 'Automated & manual FE fatal notification dispatch, leadership digests, and delivery logs',
    category: 'Governance'
  },
  {
    id: 'forensicsLab',
    label: 'Forensics Lab',
    fullName: 'Image Forensics & Deduplication Lab',
    description: 'Inspect photo metadata, SHA-256 byte fingerprints, and perceptual dHash reuse',
    category: 'Governance'
  },
  {
    id: 'executiveDashboard',
    label: 'Executive Summary',
    fullName: 'Executive Leadership Overview & Analytics',
    description: 'Date-wise task compliance, image integrity, strike rates, and cross-hierarchy filters for GM, BH & SuperAdmin',
    category: 'Governance'
  }
];

// Mapping between Page ID and Human-Readable Page Label
export const PAGE_ID_TO_LABEL = {
  audits: 'Audits',
  upload: 'Upload Task',
  allocation: 'Roster & Workload',
  escalations: 'D + 1 Escalations',
  rules: 'Quality Rules',
  replacements: 'Tool Orders',
  managerPortal: 'Cluster Oversight',
  fePortal: 'My Visits',
  users: 'User Accounts',
  accessControl: 'Access Control',
  fatalObjection: 'Fatal objection',
  emailDispatch: 'Mail Dispatch',
  forensicsLab: 'Forensics Lab',
  executiveDashboard: 'Executive Summary'
};

export const PAGE_LABEL_TO_ID = {
  'Audits': 'audits',
  'Upload Task': 'upload',
  'Upload Tasks': 'upload',
  'Roster & Workload': 'allocation',
  'D + 1 Escalations': 'escalations',
  'D+1 Escalations': 'escalations',
  'Quality Rules': 'rules',
  'Tool Orders': 'replacements',
  'Cluster Oversight': 'managerPortal',
  'My Visits': 'fePortal',
  'User Accounts': 'users',
  'Access Control': 'accessControl',
  'Fatal objection': 'fatalObjection',
  'Fatal Objection': 'fatalObjection',
  'Mail Dispatch': 'emailDispatch',
  'Email Dispatch': 'emailDispatch',
  'Forensics Lab': 'forensicsLab',
  'Image Forensics Lab': 'forensicsLab',
  'Image Forensics': 'forensicsLab',
  'Executive Summary': 'executiveDashboard'
};

// 9 Standard Corporate Roles represented in the system
export const ALL_ROLES = [
  'SuperAdmin',
  'City Admin',
  'Auditor',
  'AM',
  'RM',
  'Central Ops',
  'GM',
  'BH',
  'FE'
];

// ====================================================================
// EXACT DEFAULT ROLE PRESETS (Baseline Defaults)
// ====================================================================
export const DEFAULT_ROLE_PRESETS = {
  SuperAdmin: [
    'Executive Summary',
    'Audits',
    'Upload Task',
    'Roster & Workload',
    'D + 1 Escalations',
    'Quality Rules',
    'Tool Orders',
    'Cluster Oversight',
    'User Accounts',
    'Access Control',
    'Fatal objection',
    'Mail Dispatch',
    'Forensics Lab'
  ],
  'City Admin': [
    'Audits',
    'Tool Orders'
  ],
  Admin: [ // alias for City Admin
    'Audits',
    'Tool Orders'
  ],
  Auditor: [
    'Audits',
    'Forensics Lab'
  ],
  AM: [
    'Tool Orders',
    'Cluster Oversight'
  ],
  RM: [
    'Tool Orders',
    'Cluster Oversight'
  ],
  'Central Ops': [
    'Audits',
    'Upload Task',
    'Tool Orders',
    'Cluster Oversight',
    'Forensics Lab'
  ],
  GM: [
    'Executive Summary',
    'Audits',
    'Upload Task',
    'Roster & Workload',
    'D + 1 Escalations',
    'Quality Rules',
    'Tool Orders',
    'Cluster Oversight',
    'Fatal objection',
    'Mail Dispatch',
    'Forensics Lab'
  ],
  BH: [
    'Executive Summary',
    'Audits',
    'Roster & Workload',
    'D + 1 Escalations',
    'Quality Rules',
    'Cluster Oversight',
    'Mail Dispatch',
    'Forensics Lab'
  ],
  FE: [
    'My Visits'
  ]
};

// Storage Key for Live Editable Role Presets
export const CUSTOM_ROLE_PRESETS_KEY = 'locus_custom_role_presets_v4';

// In-memory cache for live role presets
let inMemoryLiveRolePresets = null;

/**
 * Normalizes role names into canonical keys
 */
export function normalizeRoleName(rawRole) {
  if (!rawRole || typeof rawRole !== 'string') return 'Auditor';
  const clean = rawRole.trim().toLowerCase();
  
  if (clean === 'admin' || clean === 'city admin' || clean === 'cityadmin') return 'City Admin';
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

/**
 * Retrieve the current live role presets (from memory, localStorage, or fallback to default).
 * Automatically ensures canonical formatting (human labels) and alias sync.
 */
export function getLiveRolePresets() {
  if (inMemoryLiveRolePresets) {
    return inMemoryLiveRolePresets;
  }

  try {
    const saved = localStorage.getItem(CUSTOM_ROLE_PRESETS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        // Deep merge with DEFAULT_ROLE_PRESETS to ensure all roles and keys exist
        const merged = { ...DEFAULT_ROLE_PRESETS };
        Object.entries(parsed).forEach(([role, pages]) => {
          if (Array.isArray(pages)) {
            // Normalize page items to canonical labels
            merged[role] = pages.map(p => PAGE_ID_TO_LABEL[p] || p);
          }
        });
        // Keep Admin aliased to City Admin
        if (merged['City Admin']) {
          merged['Admin'] = [...merged['City Admin']];
        }
        inMemoryLiveRolePresets = merged;
        return inMemoryLiveRolePresets;
      }
    }
  } catch (e) {
    console.warn('Failed to parse custom role presets from storage:', e);
  }

  // Fallback to clone of defaults
  inMemoryLiveRolePresets = JSON.parse(JSON.stringify(DEFAULT_ROLE_PRESETS));
  return inMemoryLiveRolePresets;
}

/**
 * Persist updated live role presets to memory and localStorage,
 * and broadcast an event across the window.
 */
export function setLiveRolePresets(newPresets) {
  if (!newPresets || typeof newPresets !== 'object') return false;

  const clean = { ...DEFAULT_ROLE_PRESETS };
  Object.entries(newPresets).forEach(([role, pages]) => {
    if (Array.isArray(pages)) {
      clean[role] = pages.map(p => PAGE_ID_TO_LABEL[p] || p);
    }
  });

  // Ensure Admin alias mirrors City Admin
  if (clean['City Admin']) {
    clean['Admin'] = [...clean['City Admin']];
  }

  inMemoryLiveRolePresets = clean;

  try {
    localStorage.setItem(CUSTOM_ROLE_PRESETS_KEY, JSON.stringify(clean));
  } catch (e) {
    console.warn('Failed to save custom role presets to localStorage:', e);
  }

  // Broadcast change for immediate UI re-evaluation
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('locus_presets_updated', { detail: clean }));
    } catch (e) {}
  }

  return clean;
}

/**
 * Reset all role presets back to original system defaults
 */
export function resetRolePresetsToDefault() {
  try {
    localStorage.removeItem(CUSTOM_ROLE_PRESETS_KEY);
  } catch (e) {}
  inMemoryLiveRolePresets = JSON.parse(JSON.stringify(DEFAULT_ROLE_PRESETS));

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('locus_presets_updated', { detail: inMemoryLiveRolePresets }));
    } catch (e) {}
  }

  return inMemoryLiveRolePresets;
}

/**
 * Dynamic Proxy export for ROLE_PRESETS so existing references in components
 * automatically evaluate against the live editable presets.
 */
export const ROLE_PRESETS = new Proxy({}, {
  get(target, prop) {
    const live = getLiveRolePresets();
    if (typeof prop === 'string') {
      const direct = live[prop];
      if (direct) return direct;
      const normalized = normalizeRoleName(prop);
      if (live[normalized]) return live[normalized];
    }
    return live[prop] || [];
  },
  has(target, prop) {
    const live = getLiveRolePresets();
    return prop in live || (typeof prop === 'string' && normalizeRoleName(prop) in live);
  },
  ownKeys() {
    const live = getLiveRolePresets();
    return Reflect.ownKeys(live);
  },
  getOwnPropertyDescriptor(target, prop) {
    const live = getLiveRolePresets();
    return {
      value: live[prop] || (typeof prop === 'string' ? live[normalizeRoleName(prop)] : undefined),
      enumerable: true,
      configurable: true
    };
  }
});

// Display friendly name for badges
export function displayRoleName(role) {
  const norm = normalizeRoleName(role);
  if (norm === 'City Admin' || norm === 'Admin') return 'City Admin';
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

/**
 * Determines whether a user is eligible for the daily audit roster and workload allocation.
 * 
 * OPERATIONAL POLICIES:
 * 1. Must have access to the Audits Console ('audits').
 * 2. Dedicated Auditor personnel do not exist currently; all auditing is handled by City Admins.
 * 3. Supervisory, field, and governance roles (AM, RM, GM, BH, FE) are excluded.
 * 4. SuperAdmin can be optionally included if acting as City Admin via the `includeSuperAdmin` toggle.
 */
export function isEligibleForAuditRoster(user, { includeSuperAdmin = false } = {}) {
  if (!user || user.is_active === false) return false;
  
  // 1. Must have granted or preset access to the Audits Console
  if (!hasAccess(user, 'audits')) {
    return false;
  }

  const primaryRole = normalizeRoleName(user.role);
  const roles = parseRoles(user.roles || [user.role]);

  // If includeSuperAdmin is enabled and this user is a SuperAdmin, include them in the roster
  const isSuperAdmin = primaryRole === 'SuperAdmin' || roles.includes('SuperAdmin');
  if (includeSuperAdmin && isSuperAdmin) {
    return true;
  }

  // Strictly exclude top-level governance & field roles (they do not perform photo audits)
  const EXCLUDED_ROLES = ['AM', 'RM', 'GM', 'BH', 'FE', 'SuperAdmin'];
  if (EXCLUDED_ROLES.includes(primaryRole)) {
    return false;
  }

  // Currently, only City Admins handle audits (no dedicated auditor personnel available)
  const isCityAdmin = primaryRole === 'City Admin' || 
                      primaryRole === 'Admin' || 
                      roles.includes('City Admin') || 
                      roles.includes('Admin');

  return isCityAdmin;
}

// Local storage cache key for user granted pages
export const USER_PERMISSIONS_STORAGE_KEY = 'locus_user_granted_access_v3';

// Load saved granted permissions map from localStorage
export function getSavedPermissionsMap() {
  try {
    const saved = localStorage.getItem(USER_PERMISSIONS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
}

// Save granted page permissions for a specific user
export function saveUserPagePermissions(userEmailOrId, grantedPages = [], secondaryKey = null) {
  try {
    const map = getSavedPermissionsMap();
    const cleanList = Array.isArray(grantedPages) ? grantedPages : [];
    if (userEmailOrId) {
      const k1 = String(userEmailOrId).trim().toLowerCase();
      map[k1] = cleanList;
    }
    if (secondaryKey) {
      const k2 = String(secondaryKey).trim().toLowerCase();
      map[k2] = cleanList;
    }
    localStorage.setItem(USER_PERMISSIONS_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch (e) {
    console.warn('Failed to save user granted permissions:', e);
    return false;
  }
}

/**
 * Core Permission Check: hasAccess(profile, pageName)
 * 
 * User has access if pageName is in live ROLE_PRESETS[profile.role] OR in profile.granted_page_access.
 * Supports pageName as either human-readable label (e.g. 'Fatal objection') or page ID (e.g. 'fatalObjection').
 */
export function hasAccess(profile, pageName) {
  if (!profile || !pageName) return false;

  const targetLabel = PAGE_ID_TO_LABEL[pageName] || pageName;
  const targetId = PAGE_LABEL_TO_ID[pageName] || pageName;

  // SuperAdmin has global bypass
  const primaryRole = normalizeRoleName(profile.role);
  if (primaryRole === 'SuperAdmin') return true;
  if (Array.isArray(profile.roles) && profile.roles.some(r => normalizeRoleName(r) === 'SuperAdmin')) {
    return true;
  }

  // Temporary Auditor Dynamic Access Control for 'audits' Console
  // Revokes access immediately once quota is completed, or grants access while active
  if (targetId === 'audits') {
    try {
      const savedTemp = localStorage.getItem('locus_temp_auditors_registry_v1');
      if (savedTemp) {
        const tempReg = JSON.parse(savedTemp);
        const uId = profile.id ? String(profile.id).toLowerCase() : '';
        const uEmail = profile.email ? String(profile.email).toLowerCase() : '';
        const entry = tempReg[uId] || tempReg[uEmail];
        if (entry && entry.isTemporary) {
          if (entry.accessStatus === 'QUOTA_COMPLETED' || entry.accessStatus === 'REVOKED') {
            return false; // Dynamic revocation: quota completed
          }
          if (entry.accessStatus === 'ACTIVE') {
            return true; // Active temporary surge auditor
          }
        }
      }
    } catch (e) {}
  }

  // 1. Check Live Role Presets for primary role and multi-roles
  const livePresets = getLiveRolePresets();
  const rolesToCheck = parseRoles(profile.roles || [profile.role]);
  for (const r of rolesToCheck) {
    const preset = livePresets[r] || livePresets[normalizeRoleName(r)] || [];
    if (preset.includes(targetLabel) || preset.includes(targetId)) {
      return true;
    }
  }

  // 2. Check profile.granted_page_access (or legacy page_access)
  const granted = profile.granted_page_access || profile.grantedPageAccess || profile.page_access || profile.pageAccess || [];
  if (Array.isArray(granted)) {
    if (granted.includes(targetLabel) || granted.includes(targetId)) {
      return true;
    }
  }

  // 3. Check persistent localStorage cache for granted pages
  const permMap = getSavedPermissionsMap();
  const emailKey = profile.email ? String(profile.email).trim().toLowerCase() : '';
  const idKey = profile.id ? String(profile.id).trim().toLowerCase() : '';
  const cachedGranted = permMap[emailKey] || permMap[idKey];
  if (Array.isArray(cachedGranted)) {
    if (cachedGranted.includes(targetLabel) || cachedGranted.includes(targetId)) {
      return true;
    }
  }

  return false;
}

// Backward compatibility alias for hasAccess
export function hasPageAccess(user, pageId) {
  return hasAccess(user, pageId);
}

/**
 * Resolves the effective accessible page IDs for a given user.
 */
export function getUserEffectivePages(profile) {
  if (!profile) return [];
  return SYSTEM_PAGES
    .filter(page => hasAccess(profile, page.id))
    .map(page => page.id);
}

/**
 * Returns the granted pages specifically (excluding pages already included in live role preset).
 */
export function getUserGrantedPages(profile) {
  if (!profile) return [];
  const livePresets = getLiveRolePresets();
  const rolesToCheck = parseRoles(profile.roles || [profile.role]);
  const rolePresetPages = new Set();
  rolesToCheck.forEach(r => {
    const preset = livePresets[r] || livePresets[normalizeRoleName(r)] || [];
    preset.forEach(p => {
      rolePresetPages.add(p);
      if (PAGE_LABEL_TO_ID[p]) rolePresetPages.add(PAGE_LABEL_TO_ID[p]);
    });
  });

  const rawGranted = profile.granted_page_access || profile.grantedPageAccess || profile.page_access || profile.pageAccess || [];
  const permMap = getSavedPermissionsMap();
  const emailKey = profile.email ? String(profile.email).trim().toLowerCase() : '';
  const idKey = profile.id ? String(profile.id).trim().toLowerCase() : '';
  const cached = permMap[emailKey] || permMap[idKey] || [];

  const combined = Array.from(new Set([...(Array.isArray(rawGranted) ? rawGranted : []), ...(Array.isArray(cached) ? cached : [])]));
  
  // Return page IDs that are NOT in role preset
  return combined
    .map(p => PAGE_LABEL_TO_ID[p] || p)
    .filter(p => !rolePresetPages.has(p) && !rolePresetPages.has(PAGE_ID_TO_LABEL[p]));
}

// Helper: derive primary roles from page sets (if needed for profile seeding)
export function deriveRolesFromPages(pageIds = []) {
  if (!Array.isArray(pageIds) || pageIds.length === 0) return ['Auditor'];
  const roleSet = new Set();
  if (pageIds.includes('users') || pageIds.includes('accessControl')) roleSet.add('SuperAdmin');
  if (pageIds.includes('replacements')) roleSet.add('City Admin');
  if (pageIds.includes('upload') || pageIds.includes('allocation')) roleSet.add('Central Ops');
  if (pageIds.includes('rules') || pageIds.includes('fatalObjection')) roleSet.add('GM');
  if (pageIds.includes('escalations')) roleSet.add('BH');
  if (pageIds.includes('audits')) roleSet.add('Auditor');
  if (pageIds.includes('fePortal')) roleSet.add('FE');
  if (roleSet.size === 0) roleSet.add('Auditor');
  return Array.from(roleSet);
}
