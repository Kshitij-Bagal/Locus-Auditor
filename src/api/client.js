// ====================================================================
// REST API CLIENT LAYER FOR LOCUS QUALITY & COMPLIANCE PLATFORM
// Encapsulates all backend REST calls, authentication, and database writes.
// ====================================================================

import { createClient } from '@supabase/supabase-js';
import { 
  getSavedPermissionsMap, 
  saveUserPagePermissions, 
  deriveRolesFromPages, 
  parseRoles 
} from '../utils/accessHelper.js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isConfigured = Boolean(
  cleanUrl && 
  supabaseAnonKey && 
  !cleanUrl.includes('your-project-id')
);

const supabase = isConfigured
  ? createClient(cleanUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;

// ====================================================================
// 1. AUTHENTICATION REST API (Supabase Auth Email + Password)
// ====================================================================

export const authApi = {
  // Sign in with Email and Password (Strictly authenticates actual registered users from Supabase)
  async signIn(email, password) {
    if (!supabase) {
      throw new Error('Supabase client is not configured. Please verify your environment configuration.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = typeof password === 'string' ? password.trim() : '';

    if (!cleanEmail) {
      throw new Error('Please enter your corporate email address.');
    }
    if (!cleanPassword) {
      throw new Error('Please enter your password.');
    }

    let authUser = null;
    let authErrorDetails = null;

    // 1. Attempt standard password authentication against Supabase Auth
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword
      });

      if (authError) {
        authErrorDetails = authError;
      } else if (authData?.user) {
        authUser = authData.user;
      }
    } catch (e) {
      authErrorDetails = e;
    }

    // 2. If Auth service failed or user is not yet initialized in auth.users:
    if (!authUser) {
      // Check if user is registered in public.profiles table
      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!profData) {
        throw new Error('User profile not found. Please contact SuperAdmin to register your corporate account.');
      }

      if (profData.is_active === false) {
        throw new Error('Your account has been deactivated. Please contact SuperAdmin.');
      }

      // Attempt on-demand auth account creation only if user does not already have an auth_user_id
      if (!profData.auth_user_id) {
        try {
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: cleanEmail,
            password: cleanPassword,
            options: {
              data: {
                full_name: profData.full_name,
                role: profData.role,
                facility_code: profData.facility_code,
                person_id: profData.person_id
              }
            }
          });

          if (!signUpErr && signUpData?.user) {
            authUser = signUpData.user;
            await supabase
              .from('profiles')
              .update({ auth_user_id: authUser.id })
              .eq('id', profData.id);
          }
        } catch (ex) {
          console.warn('Supabase Auth on-demand signUp note:', ex.message);
        }
      }

      // STRICT AUTHENTICATION GUARD: If credentials did not match, REJECT immediately!
      // Never bypass password verification for registered profiles.
      if (!authUser) {
        throw new Error(
          authErrorDetails?.message === 'Invalid login credentials'
            ? 'Invalid email or password. Please use your designated staff password.'
            : (authErrorDetails?.message || 'Invalid email or password. Please check your credentials.')
        );
      }
    }

    // 3. Retrieve complete profile from public.profiles
    let profile = null;
    if (authUser) {
      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .or(`id.eq.${authUser.id},auth_user_id.eq.${authUser.id},email.eq.${cleanEmail}`)
        .maybeSingle();

      if (profData) {
        profile = { ...profData };
      } else {
        throw new Error('User profile record not found in system database.');
      }

      // Enrich profile with cached page permissions & derived multi-roles
      const permMap = getSavedPermissionsMap();
      const userKey = cleanEmail;
      const idKey = profile.id ? String(profile.id).toLowerCase() : '';
      const savedPages = permMap[userKey] || permMap[idKey] || profile.granted_page_access || profile.page_access;

      if (Array.isArray(savedPages) && savedPages.length > 0) {
        profile.granted_page_access = profile.granted_page_access || savedPages;
        profile.page_access = savedPages;
        profile.pageAccess = savedPages;
        const derived = deriveRolesFromPages(savedPages);
        const currentRoles = parseRoles(profile.roles || [profile.role]);
        profile.roles = Array.from(new Set([...currentRoles, ...derived]));
      } else {
        profile.roles = parseRoles(profile.roles || [profile.role]);
      }
    }

    return { user: authUser, profile };
  },

  // Sign out
  async signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
  },

  // Get active session
  async getSession() {
    if (!supabase) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .or(`id.eq.${session.user.id},auth_user_id.eq.${session.user.id},email.eq.${session.user.email.toLowerCase()}`)
        .maybeSingle();

      const baseProfile = profile ? { ...profile } : {
        id: session.user.id,
        email: session.user.email,
        full_name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
        role: session.user.user_metadata?.role || 'Auditor',
        roles: session.user.user_metadata?.roles || [session.user.user_metadata?.role || 'Auditor'],
        facility_code: session.user.user_metadata?.facility_code || 'Ahmedabad'
      };

      const permMap = getSavedPermissionsMap();
      const userKey = session.user.email.toLowerCase();
      const idKey = String(baseProfile.id || session.user.id).toLowerCase();
      const savedPages = permMap[userKey] || permMap[idKey] || baseProfile.granted_page_access || baseProfile.page_access;

      if (Array.isArray(savedPages) && savedPages.length > 0) {
        baseProfile.granted_page_access = baseProfile.granted_page_access || savedPages;
        baseProfile.page_access = savedPages;
        baseProfile.pageAccess = savedPages;
        const derived = deriveRolesFromPages(savedPages);
        const currentRoles = parseRoles(baseProfile.roles || [baseProfile.role]);
        baseProfile.roles = Array.from(new Set([...currentRoles, ...derived]));
      } else {
        baseProfile.roles = parseRoles(baseProfile.roles || [baseProfile.role]);
      }

      return {
        user: session.user,
        profile: baseProfile
      };
    } catch (e) {
      return null;
    }
  }
};

// ====================================================================
// 2. TASKS REST API (Central Ops Write & Auditor Updates)
// ====================================================================

export const tasksApi = {
  // Central Ops Write Operation: Ingest parsed Locus dispatch tasks
  async uploadDispatches(parsedTasks) {
    if (!parsedTasks || parsedTasks.length === 0) return { count: 0 };

    if (!supabase) {
      return { count: parsedTasks.length, local: true };
    }

    // Pre-fetch any existing records for these IDs so we NEVER overwrite assigned auditors, allocation dates, or audit statuses
    const ids = parsedTasks.map(t => String(t.id || t.taskId));
    const existingMap = new Map();
    const fetchChunkSize = 200;

    for (let i = 0; i < ids.length; i += fetchChunkSize) {
      const chunkIds = ids.slice(i, i + fetchChunkSize);
      try {
        const { data: existingRows } = await supabase
          .from('tasks')
          .select('id, assigned_auditor_id, assigned_auditor_name, allocated_at, allocation_batch_id, audit_status, audited_at, audited_by_name, audited_location, criteria_status, failed_reasons, replacements, auditor_remarks, warning_level, created_at')
          .in('id', chunkIds);
        
        if (existingRows) {
          existingRows.forEach(r => existingMap.set(String(r.id), r));
        }
      } catch (err) {
        console.warn('Could not pre-fetch existing tasks during upload:', err.message);
      }
    }

    const rows = parsedTasks.map(t => {
      const existing = existingMap.get(String(t.id || t.taskId));
      return {
        id: String(t.id || t.taskId),
        task_id: String(t.taskId || t.id),
        team_name: t.teamName || t.facilityCode || 'Ahmedabad',
        facility_code: t.facilityCode || t.teamName || 'Ahmedabad',
        zone: t.zone || 'Unknown Zone',
        dispatch_date: t.date || existing?.dispatch_date || '',
        status: t.status || existing?.status || 'COMPLETED',
        fe_name: t.feName || existing?.fe_name || 'Unassigned',
        fe_code: t.feCode || existing?.fe_code || '',
        fe_id: t.feId || existing?.fe_id || '',
        fe_email: t.feEmail || existing?.fe_email || '',
        customer_name: t.customerName || existing?.customer_name || '',
        customer_address: t.customerAddress || existing?.customer_address || '',
        pincode: t.pincode || existing?.pincode || '',
        delivery_pin: t.pin || existing?.delivery_pin || '',
        cancellation_reason: t.reason || existing?.cancellation_reason || '',
        image_urls: t.images || existing?.image_urls || {},
        image_count: t.imageCount !== undefined ? t.imageCount : (existing?.image_count || 0),
        has_images: t.hasImages !== undefined ? Boolean(t.hasImages) : Boolean(existing?.has_images),
        // PRESERVE ASSIGNMENT IF IT ALREADY EXISTED!
        assigned_auditor_id: existing?.assigned_auditor_id || t.assignedAuditorId || null,
        assigned_auditor_name: existing?.assigned_auditor_name || t.assignedAuditorName || null,
        allocated_at: existing?.allocated_at || t.allocatedAt || null,
        allocation_batch_id: existing?.allocation_batch_id || t.allocationBatchId || null,
        // PRESERVE AUDIT STATUS IF ALREADY AUDITED OR IN PROGRESS!
        audit_status: existing?.audit_status || t.auditStatus || 'PENDING',
        audited_at: existing?.audited_at || null,
        audited_by_name: existing?.audited_by_name || null,
        audited_location: existing?.audited_location || null,
        criteria_status: existing?.criteria_status || t.criteriaStatus || {},
        failed_reasons: existing?.failed_reasons || t.failedReasons || [],
        replacements: existing?.replacements || t.replacements || [],
        auditor_remarks: existing?.auditor_remarks || null,
        warning_level: existing?.warning_level || null,
        created_at: existing?.created_at || new Date().toISOString()
      };
    });

    // Chunk in batches of 100 for network safety
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from('tasks').upsert(chunk);
      if (error) throw error;
    }

    return { count: rows.length, success: true };
  },

  // Save task auto-allocations to Supabase tasks table
  async saveAllocations(allocatedTasks) {
    if (!allocatedTasks || allocatedTasks.length === 0) return { success: true, count: 0 };
    if (!supabase) return { success: true, count: allocatedTasks.length, local: true };

    try {
      const chunkSize = 50;
      for (let i = 0; i < allocatedTasks.length; i += chunkSize) {
        const chunk = allocatedTasks.slice(i, i + chunkSize);
        const promises = chunk.map(t => {
          // If assignedAuditorId is a valid UUID, persist both id and name.
          // If not UUID (e.g. mock id), persist null for UUID foreign key to prevent constraint violation
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.assignedAuditorId);
          return supabase
            .from('tasks')
            .update({
              assigned_auditor_id: isUUID ? t.assignedAuditorId : null,
              assigned_auditor_name: t.assignedAuditorName || null,
              allocated_at: t.allocatedAt || new Date().toISOString(),
              allocation_batch_id: t.allocationBatchId || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', String(t.id || t.taskId));
        });
        await Promise.all(promises);
      }
      return { success: true, count: allocatedTasks.length };
    } catch (err) {
      console.warn('tasksApi.saveAllocations error:', err.message);
      throw err;
    }
  },

  // Reassign single task to new auditor (Used by BH, GM, SuperAdmin on D+1 breaches)
  async reassignTask({ taskId, auditorId, auditorName }) {
    if (!supabase) return { success: true };
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auditorId);
      const { error } = await supabase
        .from('tasks')
        .update({
          assigned_auditor_id: isUUID ? auditorId : null,
          assigned_auditor_name: auditorName || null,
          allocated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', String(taskId));

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.warn('tasksApi.reassignTask error:', err.message);
      throw err;
    }
  },

  // Batch Auto-Fatal: Mark all completed leads with missing/blank images as FATAL in Supabase
  async autoFatalBlankTasks(taskIds) {
    if (!taskIds || taskIds.length === 0) return { count: 0, success: true };
    if (!supabase) return { count: taskIds.length, success: true, local: true };

    try {
      const payload = {
        audit_status: 'FATAL',
        audited_at: new Date().toISOString(),
        audited_by_name: 'Auto Fatal by System',
        audited_location: 'Central Compliance Engine',
        auditor_remarks: 'Auto fatal by system: Completed task with zero mandatory photo evidence uploaded.',
        failed_reasons: ['Missing mandatory photo evidence (Zero images uploaded)'],
        criteria_status: {
          selfie: 'FAIL',
          toolkit: 'FAIL',
          torches: 'FAIL',
          visionChart: 'FAIL',
          frameDisplay: 'FAIL'
        },
        replacements: [],
        email_sent: false,
        email_sent_at: null,
        email_recipients: [],
        updated_at: new Date().toISOString()
      };

      const chunkSize = 100;
      let totalUpdated = 0;
      for (let i = 0; i < taskIds.length; i += chunkSize) {
        const chunk = taskIds.slice(i, i + chunkSize);
        // STRICT SAFETY GUARD: Only update tasks that have NEVER been audited!
        // Never touch or overwrite tasks that a human auditor has already audited.
        const { error } = await supabase
          .from('tasks')
          .update(payload)
          .in('id', chunk)
          .or('audit_status.is.null,audit_status.eq.PENDING')
          .is('audited_at', null);

        if (error) {
          console.error('tasksApi.autoFatalBlankTasks error:', error);
          throw error;
        }
        totalUpdated += chunk.length;
      }

      return { count: totalUpdated, success: true };
    } catch (err) {
      console.warn('tasksApi.autoFatalBlankTasks failed:', err.message);
      throw err;
    }
  },

  // Get all tasks from database (handles Supabase PostgREST default 1,000-row limit via automated range pagination)
  async getTasks() {
    if (!supabase) return null;
    try {
      let allRows = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allRows = allRows.concat(data);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            from += pageSize;
          }
        }
      }

      // Deduplicate rows by task ID to prevent duplicate React keys or inflated metrics
      const seenIds = new Set();
      const uniqueRows = [];
      for (const row of allRows) {
        const rowId = String(row.id || row.task_id);
        if (!seenIds.has(rowId)) {
          seenIds.add(rowId);
          uniqueRows.push(row);
        }
      }

      return uniqueRows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        teamName: row.team_name,
        facilityCode: row.facility_code || row.team_name,
        zone: row.zone,
        date: row.dispatch_date,
        status: row.status,
        feName: row.fe_name,
        feCode: row.fe_code,
        feId: row.fe_id,
        feEmail: row.fe_email,
        customerName: row.customer_name,
        customerAddress: row.customer_address,
        pincode: row.pincode,
        pin: row.delivery_pin,
        reason: row.cancellation_reason,
        images: row.image_urls || {},
        imageCount: row.image_count || 0,
        hasImages: Boolean(row.has_images),
        assignedAuditorId: row.assigned_auditor_id,
        assignedAuditorName: row.assigned_auditor_name,
        allocatedAt: row.allocated_at,
        uploadedAt: row.uploaded_at || row.created_at || null,
        createdAt: row.created_at || null,
        auditStatus: row.audit_status || 'PENDING',
        auditedAt: row.audited_at,
        auditedBy: row.audited_by_name,
        auditedLocation: row.audited_location,
        failedReasons: Array.isArray(row.failed_reasons) ? row.failed_reasons : [],
        remarks: row.auditor_remarks || '',
        warningLevel: row.warning_level,
        emailSent: Boolean(row.email_sent),
        emailSentAt: row.email_sent_at,
        criteriaStatus: row.criteria_status || {},
        replacements: Array.isArray(row.replacements) ? row.replacements : [],
        disputeStatus: row.dispute_status || 'NONE',
        disputeCategory: row.dispute_category || null,
        disputeReason: row.dispute_reason || null,
        disputeRaisedByRole: row.dispute_raised_by_role || null,
        disputeRaisedByName: row.dispute_raised_by_name || null,
        disputeRaisedAt: row.dispute_raised_at || null,
        disputeMeetUrl: row.dispute_meet_url || null,
        disputeMeetTime: row.dispute_meet_time || null,
        disputeMeetRequestedBy: row.dispute_meet_requested_by || null,
        disputeResolvedAt: row.dispute_resolved_at || null,
        disputeResolvedByName: row.dispute_resolved_by_name || null,
        disputeResolutionRemarks: row.dispute_resolution_remarks || null,
        disputeProofUrl: row.dispute_proof_url || null,
        totalTokens: row.total_tokens || 0,
        total_tokens: row.total_tokens || 0,
        auditorModel: row.auditor_model || row.audited_by_name || null,
        needsReAudit: Boolean(
          row.needs_reaudit || 
          row.audit_status === 'NEEDS_REAUDIT' || 
          (row.auditor_remarks && (row.auditor_remarks.includes('[AI Audit Failed') || row.auditor_remarks.includes('[AI Audit Rejected')))
        ),
        reAuditReason: (() => {
          if (!row.auditor_remarks) return null;
          const match = row.auditor_remarks.match(/\[AI Audit (?:Failed|Rejected) [^:]+: ([^\]]+)\]/);
          return match ? match[1] : null;
        })()
      }));
    } catch (e) {
      console.warn('tasksApi.getTasks error:', e.message);
      return null;
    }
  },

  // Auditor PASS write operation
  async passAudit({ taskId, auditorName, auditorLocation, remarks, criteriaStatus, replacements, taskData, totalTokens = null }) {
    // 1. Update task in tasks table
    if (supabase) {
      const updatePayload = {
        audit_status: 'PASSED',
        audited_at: new Date().toISOString(),
        audited_by_name: auditorName,
        audited_location: auditorLocation,
        auditor_remarks: remarks || 'Passed all mandatory criteria',
        criteria_status: criteriaStatus || {},
        failed_reasons: [],
        replacements: replacements || [],
        updated_at: new Date().toISOString()
      };

      if (totalTokens !== null && totalTokens !== undefined) {
        updatePayload.total_tokens = Number(totalTokens);
      }

      let { error } = await supabase.from('tasks').update(updatePayload).eq('id', String(taskId));

      // Resilient fallback if 'total_tokens' column hasn't been added to tasks table via SQL yet
      if (error && error.message && error.message.includes('total_tokens')) {
        console.warn('Supabase tasks table is missing total_tokens column. Please run the SQL snippet.');
        delete updatePayload.total_tokens;
        const retry = await supabase.from('tasks').update(updatePayload).eq('id', String(taskId));
        error = retry.error;
      }

      if (error) {
        console.error('tasksApi.passAudit Supabase error:', error);
        throw new Error(error.message || 'Failed to update pass audit in Supabase');
      }
    }

    // 2. If any equipment is flagged as faulty, write to replacement_orders
    if (replacements && replacements.length > 0 && supabase) {
      await replacementsApi.flagMultiple({
        taskId: String(taskId),
        feId: taskData?.feId || '',
        feName: taskData?.feName || '',
        feCode: taskData?.feCode || '',
        facilityCode: taskData?.facilityCode || 'Ahmedabad',
        zone: taskData?.zone || '',
        items: replacements,
        auditorName
      });
    }

    return { success: true, status: 'PASSED' };
  },

  // Auditor FAIL / FATAL write operation (triggers email to FE, AM, RM first)
  async failAudit({
    taskId,
    taskData,
    failedReasons,
    remarks,
    criteriaStatus,
    replacements,
    auditorName,
    auditorLocation,
    feEmail,
    amEmail,
    rmEmail,
    improvementTips,
    immediateEmail = false,
    totalTokens = null
  }) {
    // 1. Single immediate email only if explicitly enabled (default is false to use daily scheduled batch)
    const recipients = [feEmail, amEmail, rmEmail].filter(Boolean);
    let emailDispatch = null;

    if (immediateEmail) {
      try {
        emailDispatch = await emailApi.sendAuditFailNotice({
          taskId,
          feEmail: feEmail || `${taskData?.feCode?.toLowerCase() || 'fe'}@lenskart.in`,
          amEmail: amEmail || `am.${(taskData?.facilityCode || 'ahmedabad').toLowerCase()}@lenskart.in`,
          rmEmail: rmEmail || 'rm.west@lenskart.in',
          feName: taskData?.feName || 'Field Executive',
          failedReasons: failedReasons || ['SOP criteria non-compliance'],
          remarks: remarks || '',
          improvementTips: improvementTips || [
            'Ensure official Lenskart polo uniform and ID card are visible in selfie',
            'Deploy telescoping standee on level surface and maintain 6/6 eye-level distance',
            'Verify both blue and yellow penlights are operational and active'
          ],
          auditorName
        });
      } catch (e) {
        console.warn('Single immediate email dispatch warning:', e.message);
      }
    }

    // 2. Write FATAL status to database with email_sent = false (queuing for daily batch)
    if (supabase) {
      const updatePayload = {
        audit_status: 'FATAL',
        audited_at: new Date().toISOString(),
        audited_by_name: auditorName,
        audited_location: auditorLocation,
        auditor_remarks: remarks || '',
        failed_reasons: failedReasons || [],
        criteria_status: criteriaStatus || {},
        replacements: replacements || [],
        email_sent: immediateEmail ? true : false,
        email_sent_at: immediateEmail ? new Date().toISOString() : null,
        email_recipients: recipients,
        updated_at: new Date().toISOString()
      };

      if (totalTokens !== null && totalTokens !== undefined) {
        updatePayload.total_tokens = Number(totalTokens);
      }

      let { error } = await supabase.from('tasks').update(updatePayload).eq('id', String(taskId));

      // Resilient fallback if 'total_tokens' column hasn't been added to tasks table via SQL yet
      if (error && error.message && error.message.includes('total_tokens')) {
        console.warn('Supabase tasks table is missing total_tokens column. Please run the SQL snippet.');
        delete updatePayload.total_tokens;
        const retry = await supabase.from('tasks').update(updatePayload).eq('id', String(taskId));
        error = retry.error;
      }

      if (error) {
        console.error('tasksApi.failAudit Supabase error:', error);
        throw new Error(error.message || 'Failed to record fatal audit in Supabase');
      }
    }

    // 3. Write flagged faulty items to replacement_orders
    if (replacements && replacements.length > 0 && supabase) {
      await replacementsApi.flagMultiple({
        taskId: String(taskId),
        feId: taskData?.feId || '',
        feName: taskData?.feName || '',
        feCode: taskData?.feCode || '',
        facilityCode: taskData?.facilityCode || 'Ahmedabad',
        zone: taskData?.zone || '',
        items: replacements,
        auditorName
      });
    }

    return { 
      success: true, 
      status: 'FATAL',
      emailSent: immediateEmail,
      recipients,
      emailDispatch
    };
  },

  // Human reviewer fails an AI audit and queues it for clinical human re-audit
  async failAiAudit({
    taskId,
    taskData,
    reviewerName,
    reason,
    originalRemarks,
    criteriaStatus,
    failedReasons
  }) {
    if (supabase) {
      const updatedRemarks = `[AI Audit Failed / Re-Audit Requested by ${reviewerName}: ${reason}] ${originalRemarks || ''}`.trim();
      
      const updatePayload = {
        audit_status: 'NEEDS_REAUDIT',
        auditor_remarks: updatedRemarks,
        criteria_status: criteriaStatus || taskData?.criteriaStatus || taskData?.criteria_status || {},
        failed_reasons: failedReasons || taskData?.failedReasons || taskData?.failed_reasons || [],
        updated_at: new Date().toISOString()
      };

      let { error } = await supabase.from('tasks').update(updatePayload).eq('id', String(taskId));

      // If 'NEEDS_REAUDIT' violates an audit_status check constraint in Supabase, fallback to 'PENDING'
      if (error && (error.message.includes('check constraint') || error.message.includes('invalid input value for enum'))) {
        console.warn('audit_status check constraint detected; falling back to PENDING with remarks stamp');
        updatePayload.audit_status = 'PENDING';
        const retry = await supabase.from('tasks').update(updatePayload).eq('id', String(taskId));
        error = retry.error;
      }

      if (error) {
        console.error('tasksApi.failAiAudit error:', error);
        throw new Error(error.message || 'Failed to queue task for re-audit in Supabase');
      }
    }

    return { success: true, status: 'NEEDS_REAUDIT' };
  },

  // Batch sync audits from local state / recovery cache to Supabase
  async syncAuditedTasks(tasksToSync) {
    if (!tasksToSync || tasksToSync.length === 0 || !supabase) return { count: 0, errors: [] };
    let successCount = 0;
    const errors = [];

    for (const t of tasksToSync) {
      const isFatal = t.auditStatus === 'FATAL' || t.audit_status === 'FATAL';
      const isPassed = t.auditStatus === 'PASSED' || t.audit_status === 'PASSED';
      if (!isFatal && !isPassed) continue;

      try {
        const payload = {
          audit_status: isFatal ? 'FATAL' : 'PASSED',
          audited_at: t.auditedAt || t.audited_at || new Date().toISOString(),
          audited_by_name: t.auditedBy || t.audited_by_name || 'Central Auditor',
          audited_location: t.auditedLocation || t.audited_location || 'Ahmedabad Hub',
          auditor_remarks: t.remarks || t.auditor_remarks || '',
          criteria_status: t.criteriaStatus || t.criteria_status || {},
          failed_reasons: t.failedReasons || t.failed_reasons || [],
          replacements: t.replacements || [],
          email_sent: Boolean(t.emailSent || t.email_sent),
          email_sent_at: t.emailSentAt || t.email_sent_at || null,
          email_recipients: Array.isArray(t.emailRecipients || t.email_recipients) ? (t.emailRecipients || t.email_recipients) : [],
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', String(t.id || t.taskId));

        if (error) {
          errors.push({ id: t.id, error: error.message });
        } else {
          successCount++;
        }
      } catch (err) {
        errors.push({ id: t.id, error: err.message });
      }
    }

    return { count: successCount, errors };
  },

  // Raise Fatal Objection / Dispute (FE or AM/RM)
  async raiseDispute({ taskId, category, reason, proofUrl, raisedByRole, raisedByName, scheduleMeet, meetUrl, meetTime }) {
    const isMeet = Boolean(scheduleMeet && meetUrl);
    const updates = {
      dispute_status: isMeet ? 'MEET_SCHEDULED' : 'PENDING_REVIEW',
      dispute_category: category,
      dispute_reason: reason,
      dispute_proof_url: proofUrl || null,
      dispute_raised_by_role: raisedByRole || 'FE',
      dispute_raised_by_name: raisedByName || 'Staff',
      dispute_raised_at: new Date().toISOString(),
      dispute_meet_url: isMeet ? meetUrl : null,
      dispute_meet_time: isMeet ? meetTime : null,
      dispute_meet_requested_by: isMeet ? raisedByName : null,
      updated_at: new Date().toISOString()
    };

    if (supabase) {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) {
        console.warn('tasksApi.raiseDispute DB error:', error.message);
        throw error;
      }
    }

    return { 
      success: true, 
      status: updates.dispute_status, 
      updates 
    };
  },

  // Senior Auditor / GM overturns dispute (marks PASSED, zeros strike)
  async overturnDispute(taskId, { resolvedByName, remarks } = {}) {
    const updates = {
      audit_status: 'PASSED',
      failed_reasons: [],
      dispute_status: 'RESOLVED_OVERTURNED',
      dispute_resolved_at: new Date().toISOString(),
      dispute_resolved_by_name: resolvedByName || 'Senior Auditor',
      dispute_resolution_remarks: remarks || 'Strike overturned by senior auditor/GM.',
      auditor_remarks: remarks ? `[Overturned Strike]: ${remarks}` : 'Passed upon dispute re-audit',
      updated_at: new Date().toISOString()
    };

    if (supabase) {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) {
        console.warn('tasksApi.overturnDispute DB error:', error.message);
        throw error;
      }
    }

    return { success: true, updates };
  },

  // Senior Auditor / GM upholds fatal strike
  async upholdDispute(taskId, { resolvedByName, remarks } = {}) {
    const updates = {
      dispute_status: 'RESOLVED_UPHELD',
      dispute_resolved_at: new Date().toISOString(),
      dispute_resolved_by_name: resolvedByName || 'Senior Auditor',
      dispute_resolution_remarks: remarks || 'Fatal strike upheld after objection review.',
      updated_at: new Date().toISOString()
    };

    if (supabase) {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) {
        console.warn('tasksApi.upholdDispute DB error:', error.message);
        throw error;
      }
    }

    return { success: true, updates };
  }
};

// ====================================================================
// 3. REPLACEMENTS & CITY ADMIN POS ORDERS REST API
// ====================================================================

export const replacementsApi = {
  async flagMultiple({ taskId, feId, feName, feCode, facilityCode, zone, items, auditorName }) {
    if (!supabase || !items?.length) return;
    const orders = items.map(item => ({
      task_id: taskId,
      fe_id: feId,
      fe_name: feName,
      fe_code: feCode,
      facility_code: facilityCode,
      zone: zone,
      item_id: item.id,
      item_name: item.name,
      category: item.category || 'Clinical Equipment',
      type: item.type || 'Asset',
      fault_condition: item.faultCondition || 'Faulty item identified during photo audit',
      urgency: item.urgency || item.severity || 'NORMAL', // 'CRITICAL', 'HIGH', 'NORMAL'
      auditor_notes: item.notes || '',
      pos_status: 'FLAGGED_BY_AUDITOR',
      reported_by_name: auditorName,
      reported_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('replacement_orders').insert(orders);
    if (error) console.warn('Failed to insert replacement orders:', error.message);
  },

  async getOrders() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('replacement_orders')
        .select('*')
        .order('reported_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (e) {
      return [];
    }
  },

  // City Admin updates POS order status
  async updatePosStatus(orderId, { posStatus, posOrderNumber, orderedByName }) {
    if (!supabase) return { success: true };
    const updates = {
      pos_status: posStatus,
      updated_at: new Date().toISOString()
    };
    if (posOrderNumber) updates.pos_order_number = posOrderNumber;
    if (orderedByName) updates.pos_ordered_by_name = orderedByName;
    if (posStatus === 'ORDERED_ON_POS') updates.pos_ordered_at = new Date().toISOString();
    if (posStatus === 'DISBURSED_TO_FE') updates.disbursed_to_fe_at = new Date().toISOString();

    const { error } = await supabase
      .from('replacement_orders')
      .update(updates)
      .eq('id', orderId);

    if (error) throw error;
    return { success: true };
  }
};

// ====================================================================
// 4. CENTRAL RULES REST API (GM Draft -> BH Publish)
// ====================================================================

export const rulesApi = {
  async getRules() {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('audit_criteria_rules')
        .select('*')
        .order('station_order', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      return data.map(r => ({
        id: r.id,
        imageKey: r.image_key,
        title: r.title,
        description: r.description,
        standards: r.standards || [],
        commonFailures: r.common_failures || [],
        improvementTips: r.improvement_tips || [],
        isMandatory: r.is_mandatory ?? true,
        triggersFatal: r.triggers_fatal ?? true,
        status: r.status || 'PUBLISHED',
        draft: r.draft_standards ? {
          standards: r.draft_standards,
          commonFailures: r.draft_failures,
          improvementTips: r.draft_tips,
          draftedBy: r.drafted_by_name,
          draftedAt: r.drafted_at
        } : null,
        publishedBy: r.published_by_name,
        publishedAt: r.published_at
      }));
    } catch (e) {
      return null;
    }
  },

  async saveDraft(ruleId, draftData, user) {
    if (!supabase) return { success: true };
    const { error } = await supabase
      .from('audit_criteria_rules')
      .update({
        status: 'DRAFT_PENDING_BH',
        draft_standards: draftData.standards,
        draft_failures: draftData.commonFailures,
        draft_tips: draftData.improvementTips,
        drafted_by_name: user?.full_name || 'General Manager',
        drafted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', ruleId);

    if (error) throw error;
    return { success: true };
  },

  async publishRule(ruleId, ruleData, user) {
    if (!supabase) return { success: true };
    const { error } = await supabase
      .from('audit_criteria_rules')
      .update({
        title: ruleData.title,
        description: ruleData.description,
        standards: ruleData.standards,
        common_failures: ruleData.commonFailures,
        improvement_tips: ruleData.improvementTips || [],
        status: 'PUBLISHED',
        draft_standards: null,
        draft_failures: null,
        draft_tips: null,
        published_by_name: user?.full_name || 'Business Head',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', ruleId);

    if (error) throw error;
    return { success: true };
  }
};

// ====================================================================
// 5. AUDIT FAILURE EMAIL NOTIFICATION SERVICE (FE, AM, RM)
// ====================================================================

const EMAIL_CONFIG_KEY = 'locus_email_gateway_config_v1';

export const emailApi = {
  // Read configured gateway credentials (Brevo, Resend or SMTP)
  getGatewayConfig() {
    const brevoEnvKey = import.meta.env.VITE_BREVO_API_KEY || '';
    try {
      const saved = localStorage.getItem(EMAIL_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          if (!parsed.brevoApiKey) parsed.brevoApiKey = brevoEnvKey;
          if (!parsed.fromAddress || parsed.fromAddress.includes('lenskart.com') || parsed.fromAddress.includes('resend.dev')) {
            parsed.fromAddress = 'Lenskart Quality Audit <kshitijbagal@gmail.com>';
          }
          if (parsed.provider !== 'smtp' && parsed.provider !== 'resend') {
            parsed.provider = 'brevo';
          }
          return parsed;
        }
      }
    } catch (e) {}
    return {
      provider: 'brevo',
      brevoApiKey: brevoEnvKey,
      resendApiKey: '',
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      fromAddress: 'Lenskart Quality Audit <kshitijbagal@gmail.com>'
    };
  },

  // Persist updated email gateway credentials
  saveGatewayConfig(config) {
    localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(config));
    return config;
  },

  // Test live email connectivity
  async testConnection(targetEmail) {
    const config = this.getGatewayConfig();
    return this.sendRealEmail({
      to: [targetEmail],
      subject: '[TEST] Lenskart DLC Email Gateway Verification',
      text: `This is a verification test from Lenskart DLC Quality Audit System.\nProvider: ${config.provider}\nTimestamp: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
          <h2 style="color: #38bdf8; margin: 0 0 10px 0;">Email Gateway Active</h2>
          <p style="color: #94a3b8; font-size: 14px;">Your Lenskart DLC Quality Audit mail gateway is properly configured and successfully delivering live messages.</p>
          <div style="background: #1e293b; padding: 12px; border-radius: 8px; margin-top: 15px; font-size: 13px;">
            <strong>Provider:</strong> ${config.provider.toUpperCase()}<br/>
            <strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </div>
        </div>
      `,
      customCredentials: config
    });
  },

  // Direct HTTP dispatch to backend serverless / dev endpoint (/api/send-email)
  async sendRealEmail({ to, cc, bcc, subject, text, html, customCredentials }) {
    const config = customCredentials || this.getGatewayConfig();
    
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to,
        cc,
        bcc,
        subject,
        text,
        html,
        provider: config.provider,
        credentials: {
          brevoApiKey: config.brevoApiKey || import.meta.env.VITE_BREVO_API_KEY || '',
          resendApiKey: config.resendApiKey,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpUser: config.smtpUser,
          smtpPass: config.smtpPass,
          fromAddress: config.fromAddress
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to dispatch email notice');
    }
    return data;
  },

  // Main Audit Failure Notice Dispatch
  async sendAuditFailNotice({
    taskId,
    feEmail,
    amEmail,
    rmEmail,
    feName,
    failedReasons,
    remarks,
    improvementTips,
    auditorName
  }) {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const toRecipients = [feEmail].filter(Boolean);
    const ccRecipients = [amEmail, rmEmail].filter(Boolean);

    // Generate structured plain text payload
    const subject = `[URGENT] Lenskart DLC Audit Failure Notice - Task #${taskId} (${feName || 'Field Executive'})`;
    const body = `Dear ${feName || 'Field Executive'},

This is an automated formal notification from the Lenskart Home Eye Test / DLC Central Quality Audit System.

Your recent dispatch visit (Task ID: ${taskId}) has been audited and marked with a FATAL NON-COMPLIANCE STRIKE by Central Quality Auditor ${auditorName} on ${timestamp}.

----------------------------------------------------------------------
SPECIFIC AUDIT FAILURE REASONS IDENTIFIED:
----------------------------------------------------------------------
${(failedReasons || []).map((r, i) => `${i + 1}. [FAIL] ${r}`).join('\n')}

${remarks ? `Auditor Remarks: "${remarks}"\n` : ''}
----------------------------------------------------------------------
MANDATORY CORRECTIVE ACTIONS & GUIDELINES FOR FUTURE AUDITS:
----------------------------------------------------------------------
${(improvementTips || []).map((tip, i) => `${i + 1}. ${tip}`).join('\n')}

CC Recipients:
- Area Manager (AM): ${amEmail} (Immediate hub coaching & kit inspection required)
- Regional Manager (RM): ${rmEmail} (Regional compliance escalation record)

Please coordinate with your Area Manager to review standard operating procedures (SOP) before your next dispatch shift.

Central Quality & Compliance Division
Lenskart DLC Operations`;

    // Generate rich HTML template
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
          .header { background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%); color: #ffffff; padding: 24px; text-align: left; }
          .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
          .title { margin: 0; font-size: 20px; font-weight: 800; }
          .content { padding: 24px; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; }
          .fail-item { background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px 14px; border-radius: 4px; margin-bottom: 8px; color: #991b1b; font-weight: 600; font-size: 13px; }
          .tip-item { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 10px 14px; border-radius: 4px; margin-bottom: 8px; color: #1e293b; font-size: 13px; }
          .remarks-box { background: #fffbeb; border: 1px dashed #f59e0b; padding: 12px 14px; border-radius: 6px; color: #92400e; font-size: 13px; margin-bottom: 20px; font-style: italic; }
          .cc-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px; font-size: 12px; color: #475569; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="badge">FATAL AUDIT STRIKE NOTICE</span>
            <h1 class="title">Quality Non-Compliance Notice</h1>
            <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">Task #${taskId} • Lenskart Home Eye Test</p>
          </div>
          
          <div class="content">
            <p style="font-size: 14px; line-height: 1.5;">Dear <strong>${feName || 'Field Executive'}</strong>,</p>
            <p style="font-size: 13px; color: #475569; line-height: 1.5;">
              Your recent home eye test dispatch (Task <strong>#${taskId}</strong>) was audited by Central Quality Auditor <strong>${auditorName || 'Central QA'}</strong> on <strong>${timestamp}</strong> and has been issued a <strong>FATAL AUDIT STRIKE</strong>.
            </p>

            ${remarks ? `
              <div class="section">
                <div class="section-title">Auditor Remarks</div>
                <div class="remarks-box">"${remarks}"</div>
              </div>
            ` : ''}

            <div class="section">
              <div class="section-title">Violations Identified</div>
              ${(failedReasons || []).map(r => `<div class="fail-item">&#9888; ${r}</div>`).join('')}
            </div>

            <div class="section">
              <div class="section-title">Mandatory Action Checklist</div>
              ${(improvementTips || []).map(tip => `<div class="tip-item">&#10004; ${tip}</div>`).join('')}
            </div>

            <div class="section">
              <div class="section-title">Escalation & Supervision Hierarchy</div>
              <div class="cc-box">
                <div><strong>Area Manager (AM):</strong> ${amEmail} (Kit inspection & direct coaching required)</div>
                <div style="margin-top: 6px;"><strong>Regional Manager (RM):</strong> ${rmEmail} (Regional compliance audit record)</div>
              </div>
            </div>
          </div>

          <div class="footer">
            Central Quality & Compliance Division • Lenskart Solutions Pvt. Ltd.<br/>
            This is an automated system dispatch generated by Locus Auditor.
          </div>
        </div>
      </body>
      </html>
    `;

    // Attempt Real Email Dispatch via /api/send-email
    let liveDispatchResult = null;
    let liveDispatchError = null;

    try {
      liveDispatchResult = await this.sendRealEmail({
        to: toRecipients,
        cc: ccRecipients,
        subject,
        text: body,
        html
      });
    } catch (err) {
      console.warn('Real email dispatch encountered an issue:', err.message);
      liveDispatchError = err.message;
    }

    // Log to Supabase audit_email_logs
    if (supabase) {
      try {
        await supabase.from('audit_email_logs').insert({
          task_id: taskId,
          fe_email: feEmail,
          am_email: amEmail,
          rm_email: rmEmail,
          reasons: failedReasons,
          improvement_tips: improvementTips,
          sent_by: auditorName || 'Central Quality Auditor',
          status: liveDispatchResult ? 'DELIVERED' : 'FAILED',
          error_message: liveDispatchError,
          provider_response: liveDispatchResult
        });
      } catch (err) {
        console.warn('Logging email notice to DB failed:', err.message);
      }
    }

    // Fallback mailto link
    const mailtoRecipients = [feEmail, amEmail, rmEmail].filter(Boolean).join(',');
    const mailtoLink = `mailto:${encodeURIComponent(mailtoRecipients)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    return {
      success: Boolean(liveDispatchResult),
      liveDelivered: Boolean(liveDispatchResult),
      deliveryDetails: liveDispatchResult,
      deliveryError: liveDispatchError,
      taskId,
      recipients: [feEmail, amEmail, rmEmail],
      subject,
      body,
      html,
      mailtoLink
    };
  }
};

// ====================================================================
// 6. USER PROFILE & SEEDER REST API (Direct Supabase Database Writes)
// ====================================================================

export const usersApi = {
  // Fetch all user profiles from Supabase, enriched with custom permissions & multi-roles
  async getUsers() {
    if (!supabase) return [];
    try {
      let allProfiles = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          console.warn('Error fetching profiles from Supabase:', error.message);
          break;
        }
        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allProfiles = allProfiles.concat(data);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            from += pageSize;
          }
        }
      }

      const permMap = getSavedPermissionsMap();
      return allProfiles.map(u => {
        const emailKey = u.email ? String(u.email).trim().toLowerCase() : '';
        const idKey = u.id ? String(u.id).trim().toLowerCase() : '';
        const savedPages = permMap[emailKey] || permMap[idKey] || u.granted_page_access || u.page_access;

        if (Array.isArray(savedPages) && savedPages.length > 0) {
          const derived = deriveRolesFromPages(savedPages);
          const currentRoles = parseRoles(u.roles || [u.role]);
          const combinedRoles = Array.from(new Set([...currentRoles, ...derived]));
          return {
            ...u,
            role: u.role || combinedRoles[0] || 'Auditor',
            roles: combinedRoles,
            granted_page_access: u.granted_page_access || savedPages,
            page_access: savedPages,
            pageAccess: savedPages
          };
        }

        return {
          ...u,
          granted_page_access: u.granted_page_access || [],
          roles: parseRoles(u.roles || [u.role])
        };
      });
    } catch (err) {
      console.warn('Network exception fetching profiles:', err.message);
      return [];
    }
  },

  // Bulk import users with automatic duplicate checking and direct database insertion
  async importUsers(parsedUsers) {
    if (!parsedUsers || parsedUsers.length === 0) {
      return { insertedCount: 0, skippedCount: 0, imported: [], skipped: [] };
    }

    if (!supabase) {
      // Local fallback mode when Supabase is not configured
      return {
        insertedCount: parsedUsers.length,
        skippedCount: 0,
        imported: parsedUsers,
        skipped: []
      };
    }

    // Step A: Fetch all existing user emails and employee codes from Supabase
    let existingEmails = new Set();
    let existingPersonIds = new Set();

    try {
      const { data: existingProfiles, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, email, person_id, employee_code, full_name');

      if (!fetchErr && existingProfiles) {
        existingProfiles.forEach(p => {
          if (p.email) existingEmails.add(p.email.trim().toLowerCase());
          if (p.person_id) existingPersonIds.add(String(p.person_id).trim().toLowerCase());
          if (p.employee_code) existingPersonIds.add(String(p.employee_code).trim().toLowerCase());
        });
      }
    } catch (fetchEx) {
      console.warn('Could not query existing profiles for deduplication:', fetchEx.message);
    }

    const rowsToInsert = [];
    const skippedRows = [];

    // Step B: Check each row — if user already exists, SKIP THAT ROW ONLY and proceed!
    for (const row of parsedUsers) {
      const email = (row.email || '').trim().toLowerCase();
      const code = String(row.employee_code || row.person_id || '').trim().toLowerCase();

      const emailMatches = email && existingEmails.has(email);
      const codeMatches = code && existingPersonIds.has(code);

      if (emailMatches || codeMatches) {
        const reason = emailMatches 
          ? `Email '${email}' is already registered` 
          : `Employee Code '${code}' already exists in database`;
        
        skippedRows.push({
          ...row,
          skipReason: reason
        });
        continue; // SKIP THIS ROW ONLY!
      }

      // Track within this batch to prevent intra-sheet duplicates
      if (email) existingEmails.add(email);
      if (code) existingPersonIds.add(code);

      rowsToInsert.push(row);
    }

    if (rowsToInsert.length === 0) {
      return {
        insertedCount: 0,
        skippedCount: skippedRows.length,
        imported: [],
        skipped: skippedRows
      };
    }

    // Step C: Attempt direct server-side auth & profile creation via RPC in micro-batches (e.g. 60 rows)
    // Micro-batching prevents statement timeouts and HTTP limits when importing large spreadsheets (500+ rows)!
    const BATCH_SIZE = 60;
    let rpcSuccess = false;
    let totalRpcInserted = 0;
    let totalRpcSkipped = 0;
    const allRpcInserted = [];
    const allRpcSkipped = [...skippedRows];

    try {
      for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
        const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
        const { data: rpcResult, error: rpcError } = await supabase.rpc('bulk_register_lenskart_users', {
          users_payload: batch
        });

        if (rpcError) {
          throw rpcError;
        }

        if (rpcResult) {
          rpcSuccess = true;
          totalRpcInserted += (rpcResult.insertedCount ?? 0);
          totalRpcSkipped += (rpcResult.skippedCount ?? 0);
          if (rpcResult.inserted) allRpcInserted.push(...rpcResult.inserted);
          if (rpcResult.skipped) allRpcSkipped.push(...rpcResult.skipped);
        }
      }

      if (rpcSuccess) {
        return {
          insertedCount: totalRpcInserted,
          skippedCount: totalRpcSkipped + skippedRows.length,
          imported: allRpcInserted,
          skipped: allRpcSkipped
        };
      }
    } catch (rpcEx) {
      console.warn('RPC bulk_register_lenskart_users fallback to direct table write:', rpcEx.message);
    }

    // Fallback: Direct insert/sync profiles into public.profiles
    const successfullyInserted = [];

    for (const u of rowsToInsert) {
      const cleanEmail = u.email.trim().toLowerCase();
      const cleanName = (u.full_name || cleanEmail.split('@')[0]).trim();
      const cleanCode = String(u.employee_code || u.person_id || '').trim();

      const profilePayload = {
        email: cleanEmail,
        full_name: cleanName,
        role: u.role || 'Auditor',
        roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role || 'Auditor'],
        facility_code: u.facility_code || u.city || 'Ahmedabad Hub',
        city: u.city || u.facility_code || 'Ahmedabad',
        zone: u.zone || 'Ahmedabad_Zone1',
        person_id: cleanCode,
        employee_code: cleanCode,
        phone: u.phone || u.mobile || '',
        reporting_manager_name: u.am_name || u.reporting_manager_name || '',
        regional_manager_name: u.rm_name || u.regional_manager_name || '',
        reporting_manager_email: u.reporting_manager_email || '',
        regional_manager_email: u.regional_manager_email || '',
        is_active: u.is_active !== undefined ? u.is_active : true,
        updated_at: new Date().toISOString()
      };

      try {
        const { data: inserted, error: insertErr } = await supabase
          .from('profiles')
          .insert(profilePayload)
          .select()
          .single();

        if (insertErr) {
          console.warn(`Profile insert error for ${cleanEmail}:`, insertErr.message);
          // Fallback to upsert on email conflict
          const { data: upserted } = await supabase
            .from('profiles')
            .upsert(profilePayload, { onConflict: 'email' })
            .select()
            .single();

          if (upserted) successfullyInserted.push(upserted);
        } else if (inserted) {
          successfullyInserted.push(inserted);
        }
      } catch (insertEx) {
        console.warn(`Error writing profile for ${cleanEmail}:`, insertEx.message);
      }
    }

    // Step D: Pass 2 — Establish Relational Foreign Keys (UUID) for AM and RM
    try {
      const { data: allCurrentProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, person_id, employee_code');

      if (allCurrentProfiles && allCurrentProfiles.length > 0) {
        for (const prof of successfullyInserted) {
          const amTarget = (prof.reporting_manager_name || '').trim().toLowerCase();
          const rmTarget = (prof.regional_manager_name || '').trim().toLowerCase();

          if (!amTarget && !rmTarget) continue;

          let amMatch = null;
          let rmMatch = null;

          if (amTarget) {
            amMatch = allCurrentProfiles.find(p => 
              p.full_name?.trim().toLowerCase() === amTarget ||
              p.email?.trim().toLowerCase() === amTarget ||
              p.person_id?.trim().toLowerCase() === amTarget ||
              p.employee_code?.trim().toLowerCase() === amTarget
            );
          }

          if (rmTarget) {
            rmMatch = allCurrentProfiles.find(p => 
              p.full_name?.trim().toLowerCase() === rmTarget ||
              p.email?.trim().toLowerCase() === rmTarget ||
              p.person_id?.trim().toLowerCase() === rmTarget ||
              p.employee_code?.trim().toLowerCase() === rmTarget
            );
          }

          if (amMatch || rmMatch) {
            const updates = {};
            if (amMatch) {
              updates.reporting_manager_id = amMatch.id;
              updates.reporting_manager_name = amMatch.full_name;
              updates.reporting_manager_email = amMatch.email;
            }
            if (rmMatch) {
              updates.regional_manager_id = rmMatch.id;
              updates.regional_manager_name = rmMatch.full_name;
              updates.regional_manager_email = rmMatch.email;
            }

            await supabase
              .from('profiles')
              .update(updates)
              .eq('id', prof.id);

            // Reflect in returned object
            if (amMatch) {
              prof.reporting_manager_id = amMatch.id;
              prof.reporting_manager_email = amMatch.email;
            }
            if (rmMatch) {
              prof.regional_manager_id = rmMatch.id;
              prof.regional_manager_email = rmMatch.email;
            }
          }
        }
      }
    } catch (linkErr) {
      console.warn('Linking manager UUIDs note:', linkErr.message);
    }

    return {
      insertedCount: successfullyInserted.length,
      skippedCount: skippedRows.length,
      imported: successfullyInserted,
      skipped: skippedRows
    };
  },

  // Add a single user directly to Supabase
  async addUser(userData) {
    if (!supabase) return { ...userData, id: `usr_${Date.now()}` };

    const email = userData.email?.trim().toLowerCase();
    const code = String(userData.employee_code || userData.person_id || '').trim().toLowerCase();

    // Check duplicate
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, email, person_id, employee_code')
      .or(`email.eq.${email},person_id.eq.${code}`);

    if (existing && existing.length > 0) {
      throw new Error(`A user with email '${email}' or employee code '${code}' already exists.`);
    }

    // Attempt direct auth.users + profiles creation via server RPC
    try {
      const { data: rpcId, error: rpcErr } = await supabase.rpc('register_single_lenskart_user', {
        p_email: email,
        p_full_name: userData.full_name,
        p_role: userData.role || 'Auditor',
        p_facility_code: userData.facility_code || 'Ahmedabad Hub',
        p_city: userData.city || userData.facility_code || 'Ahmedabad',
        p_zone: userData.zone || 'Ahmedabad_Zone1',
        p_employee_code: code,
        p_phone: userData.phone || userData.mobile || '',
        p_am_name: userData.reporting_manager_name || userData.am_name || '',
        p_rm_name: userData.regional_manager_name || userData.rm_name || '',
        p_password: userData.password || null
      });

      if (!rpcErr && rpcId) {
        return {
          id: rpcId,
          auth_user_id: rpcId,
          email,
          full_name: userData.full_name,
          role: userData.role || 'Auditor',
          facility_code: userData.facility_code || 'Ahmedabad Hub',
          person_id: code,
          employee_code: code,
          is_active: true
        };
      }
    } catch (rpcEx) {
      console.warn('RPC register_single_lenskart_user fallback:', rpcEx.message);
    }

    const payload = {
      email,
      full_name: userData.full_name,
      role: userData.role || 'Auditor',
      roles: Array.isArray(userData.roles) ? userData.roles : [userData.role || 'Auditor'],
      facility_code: userData.facility_code || 'Ahmedabad Hub',
      city: userData.city || userData.facility_code || 'Ahmedabad',
      zone: userData.zone || 'Ahmedabad_Zone1',
      person_id: code,
      employee_code: code,
      phone: userData.phone || userData.mobile || '',
      reporting_manager_name: userData.reporting_manager_name || userData.am_name || '',
      regional_manager_name: userData.regional_manager_name || userData.rm_name || '',
      reporting_manager_email: userData.reporting_manager_email || '',
      regional_manager_email: userData.regional_manager_email || '',
      is_active: userData.is_active !== undefined ? userData.is_active : true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update user role in Supabase
  async updateUserRole(userId, newRole) {
    if (!supabase) return;
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole, roles: [newRole], updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  },

  // Update multiple roles in Supabase
  async updateUserRoles(userId, rolesList) {
    if (!supabase) return;
    const primary = Array.isArray(rolesList) && rolesList.length > 0 ? rolesList[0] : 'Auditor';
    const { error } = await supabase
      .from('profiles')
      .update({ role: primary, roles: rolesList, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  },

  // Update granular page permissions & roles in Supabase & local storage cache (Access Control Panel)
  async updateUserPermissions(userId, userEmail, pageIds) {
    const cleanEmail = userEmail ? String(userEmail).trim().toLowerCase() : '';
    const cleanId = userId ? String(userId).trim() : '';

    // 1. Derive corresponding roles from page permissions
    const derivedRoles = deriveRolesFromPages(pageIds);
    const primaryRole = derivedRoles[0] || 'Auditor';

    // 2. Persist in local storage cache for instant offline & cross-tab lookup
    if (cleanEmail) saveUserPagePermissions(cleanEmail, pageIds);
    if (cleanId) saveUserPagePermissions(cleanId, pageIds);

    if (!supabase) return { success: true, roles: derivedRoles, role: primaryRole };

    // 3. Persist to Supabase public.profiles (role & roles columns exist in Supabase schema)
    try {
      const rolePayload = {
        role: primaryRole,
        roles: derivedRoles,
        granted_page_access: pageIds,
        page_access: pageIds,
        updated_at: new Date().toISOString()
      };

      let query = supabase.from('profiles').update(rolePayload);
      if (cleanId && !cleanId.startsWith('usr_')) {
        query = query.eq('id', cleanId);
      } else if (cleanEmail) {
        query = query.eq('email', cleanEmail);
      } else if (cleanId) {
        query = query.eq('id', cleanId);
      }

      const { error } = await query;
      if (error) {
        console.warn('Error updating profile roles in Supabase:', error.message);
      }

      return { success: true, roles: derivedRoles, role: primaryRole };
    } catch (err) {
      console.warn('updateUserPermissions exception:', err.message);
      return { success: true, roles: derivedRoles, role: primaryRole };
    }
  },

  // Toggle user active status in Supabase
  async toggleUserActive(userId, isActive) {
    if (!supabase) return;
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  }
};

// ====================================================================
// 7. AUDITOR ROSTER & SHIFT MANAGEMENT REST API
// ====================================================================

export const rosterApi = {
  // Fetch today's roster from auditor_roster table
  async getRoster(date = new Date().toISOString().slice(0, 10)) {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('auditor_roster')
        .select('*')
        .eq('roster_date', date);

      if (error) {
        console.warn('rosterApi.getRoster error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('rosterApi.getRoster exception:', err.message);
      return [];
    }
  },

  // Update or set an auditor's shift status in auditor_roster
  async updateShiftStatus({ auditorId, auditorName, shiftStatus, date = new Date().toISOString().slice(0, 10), currentAssigned = 0 }) {
    if (!supabase) return { success: true };
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auditorId);
      if (!isUUID) return { success: true, localOnly: true };

      const { data, error } = await supabase
        .from('auditor_roster')
        .upsert({
          auditor_id: auditorId,
          auditor_name: auditorName || 'Auditor',
          roster_date: date,
          shift_status: shiftStatus,
          current_assigned: currentAssigned,
          updated_at: new Date().toISOString()
        }, { onConflict: 'auditor_id,roster_date' });

      if (error) {
        console.warn('rosterApi.updateShiftStatus error:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      console.warn('rosterApi.updateShiftStatus exception:', err.message);
      return { success: false, error: err.message };
    }
  },

  // Sync workload assigned counts after auto-allocation
  async syncAllocationCounts(workloads, date = new Date().toISOString().slice(0, 10)) {
    if (!supabase || !workloads) return;
    try {
      const auditorIds = Object.keys(workloads);
      for (const audId of auditorIds) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(audId);
        if (!isUUID) continue;

        const info = workloads[audId];
        const totalAssigned = (info.alreadyAssigned || 0) + (info.newlyAssigned?.length || 0);
        await supabase
          .from('auditor_roster')
          .upsert({
            auditor_id: audId,
            auditor_name: info.auditor?.full_name || info.auditor?.name || 'Auditor',
            roster_date: date,
            shift_status: info.auditor?.shiftStatus || 'AVAILABLE',
            current_assigned: totalAssigned,
            updated_at: new Date().toISOString()
          }, { onConflict: 'auditor_id,roster_date' });
      }
    } catch (err) {
      console.warn('rosterApi.syncAllocationCounts exception:', err.message);
    }
  }
};

// ====================================================================
// 8. DAILY QUALITY AUDIT DIGEST & ESCALATION REST API
// ====================================================================

const DIGEST_CACHE_KEY = 'locus_daily_digest_cache_v1';

export const dailyDigestApi = {
  // Fetch historical daily digests
  async getDigestLogs({ date, recipientEmail, role } = {}) {
    if (supabase) {
      try {
        let query = supabase
          .from('daily_digest_logs')
          .select('*')
          .order('sent_at', { ascending: false });

        if (date) query = query.eq('digest_date', date);
        if (recipientEmail) query = query.eq('recipient_email', recipientEmail.toLowerCase().trim());
        if (role) query = query.eq('recipient_role', role);

        const { data, error } = await query;
        if (!error && data) {
          localStorage.setItem(DIGEST_CACHE_KEY, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Failed to query daily_digest_logs from Supabase:', err.message);
      }
    }

    // LocalStorage fallback cache
    try {
      const saved = localStorage.getItem(DIGEST_CACHE_KEY);
      if (saved) {
        let list = JSON.parse(saved);
        if (date) list = list.filter(l => l.digest_date === date);
        if (recipientEmail) list = list.filter(l => l.recipient_email?.toLowerCase() === recipientEmail.toLowerCase());
        return list;
      }
    } catch (e) {}

    return [];
  },

  // Trigger or run daily digest cron on demand
  async triggerDigest({ date, force = false, managerEmail, dryRun = false, tasks, users }) {
    const gatewayConfig = emailApi.getGatewayConfig();

    const response = await fetch('/api/cron/daily-digest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-by': 'locus-portal'
      },
      body: JSON.stringify({
        date,
        force,
        managerEmail,
        dryRun,
        tasks,
        users,
        credentials: {
          resendApiKey: gatewayConfig.resendApiKey,
          smtpHost: gatewayConfig.smtpHost,
          smtpPort: gatewayConfig.smtpPort,
          smtpUser: gatewayConfig.smtpUser,
          smtpPass: gatewayConfig.smtpPass,
          fromAddress: gatewayConfig.fromAddress
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to execute daily digest cron');
    }
    return data;
  },

  // Manager Acknowledgement (Audit Accountability Trail)
  async acknowledgeDigest(logId, currentUser) {
    const timestamp = new Date().toISOString();
    const ackName = currentUser?.full_name || currentUser?.name || 'Area Manager';
    const ackId = currentUser?.id || null;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('daily_digest_logs')
          .update({
            acknowledged_at: timestamp,
            acknowledged_by_id: ackId,
            acknowledged_by_name: ackName,
            updated_at: timestamp
          })
          .eq('id', logId)
          .select()
          .single();

        if (!error && data) return { success: true, data };
      } catch (err) {
        console.warn('dailyDigestApi.acknowledgeDigest error:', err.message);
      }
    }

    // Local fallback update
    try {
      const saved = localStorage.getItem(DIGEST_CACHE_KEY);
      if (saved) {
        const list = JSON.parse(saved).map(item => {
          if (item.id === logId) {
            return {
              ...item,
              acknowledged_at: timestamp,
              acknowledged_by_name: ackName
            };
          }
          return item;
        });
        localStorage.setItem(DIGEST_CACHE_KEY, JSON.stringify(list));
      }
    } catch (e) {}

    return { 
      success: true, 
      acknowledged_at: timestamp,
      acknowledged_by_name: ackName
    };
  }
};

// ====================================================================
// 10. DAILY FE FATAL DISPATCH REST API (FATAL-ONLY AGGREGATION CRON)
// ====================================================================

const FE_FATAL_LOGS_CACHE_KEY = 'locus_fe_fatal_dispatch_logs_v1';

export const feFatalDigestApi = {
  // Query pending fatal tasks for a target date
  async getPendingFatalStrikes(date = null) {
    if (supabase) {
      try {
        let query = supabase
          .from('tasks')
          .select('*')
          .eq('audit_status', 'FATAL');
        
        const { data, error } = await query;
        if (!error && data) {
          if (!date) return data;
          return data.filter(t => {
            const tDate = (t.uploaded_at || t.created_at || t.dispatch_date || t.audited_at || '').slice(0, 10);
            return tDate === date;
          });
        }
      } catch (e) {
        console.warn('Failed to query pending fatal strikes from Supabase:', e.message);
      }
    }
    return [];
  },

  // Query dispatch history logs
  async getDispatchLogs(date = null) {
    if (typeof window !== 'undefined' && sessionStorage.getItem('locus_table_dispatch_logs_missing') === 'true') {
      try {
        const cached = localStorage.getItem(FE_FATAL_LOGS_CACHE_KEY);
        if (cached) {
          let list = JSON.parse(cached);
          if (date) list = list.filter(l => l.digest_date === date);
          return list;
        }
      } catch (e) {}
      return [];
    }

    if (supabase) {
      try {
        let query = supabase
          .from('daily_fe_fatal_dispatch_logs')
          .select('*')
          .order('sent_at', { ascending: false });
        
        if (date) query = query.eq('digest_date', date);
        const { data, error } = await query;
        if (error) {
          if (error.code === 'PGRST205' && typeof window !== 'undefined') {
            sessionStorage.setItem('locus_table_dispatch_logs_missing', 'true');
          }
        } else if (data) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('locus_table_dispatch_logs_missing');
          }
          localStorage.setItem(FE_FATAL_LOGS_CACHE_KEY, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        // Fallback to local cache
      }
    }

    try {
      const cached = localStorage.getItem(FE_FATAL_LOGS_CACHE_KEY);
      if (cached) {
        let list = JSON.parse(cached);
        if (date) list = list.filter(l => l.digest_date === date);
        return list;
      }
    } catch (e) {}

    return [];
  },

  // Trigger or run FE fatal digest cron on demand (or dry run preview)
  async triggerFeFatalDispatch({ date, force = false, feCode, dryRun = false, tasks, users }) {
    const gatewayConfig = emailApi.getGatewayConfig();

    const response = await fetch('/api/cron/daily-fe-fatal-digest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-by': 'locus-portal'
      },
      body: JSON.stringify({
        date,
        force,
        feCode,
        dryRun,
        tasks,
        users,
        credentials: {
          brevoApiKey: gatewayConfig.brevoApiKey || import.meta.env.VITE_BREVO_API_KEY || '',
          resendApiKey: gatewayConfig.resendApiKey,
          smtpHost: gatewayConfig.smtpHost,
          smtpPort: gatewayConfig.smtpPort,
          smtpUser: gatewayConfig.smtpUser,
          smtpPass: gatewayConfig.smtpPass,
          fromAddress: gatewayConfig.fromAddress
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to execute daily FE fatal digest cron');
    }

    // Cache logs locally if live dispatch
    if (!dryRun && data.results) {
      try {
        const cached = JSON.parse(localStorage.getItem(FE_FATAL_LOGS_CACHE_KEY) || '[]');
        const updated = [...data.results.map(r => ({
          id: `log_${Date.now()}_${r.feCode}`,
          digest_date: data.digestDate,
          fe_code: r.feCode,
          fe_name: r.feName,
          fe_email: r.feEmail,
          am_email: r.amEmail,
          rm_email: r.rmEmail,
          fatal_count: r.fatalCount,
          sent_status: r.status,
          sent_at: new Date().toISOString(),
          error_message: r.error
        })), ...cached].slice(0, 50);
        localStorage.setItem(FE_FATAL_LOGS_CACHE_KEY, JSON.stringify(updated));
      } catch (e) {}
    }

    return data;
  },

  // Dispatch General Executive Summary to GM, BH & SuperAdmin
  async dispatchGmBhExecutiveSummary({ date, tasks, users, dryRun = false, leadershipEmails }) {
    const gatewayConfig = emailApi.getGatewayConfig();

    const response = await fetch('/api/cron/daily-fe-fatal-digest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-by': 'locus-portal'
      },
      body: JSON.stringify({
        action: 'send_executive_summary',
        date,
        dryRun,
        tasks,
        users,
        leadershipEmails,
        credentials: {
          brevoApiKey: gatewayConfig.brevoApiKey || import.meta.env.VITE_BREVO_API_KEY || '',
          resendApiKey: gatewayConfig.resendApiKey,
          smtpHost: gatewayConfig.smtpHost,
          smtpPort: gatewayConfig.smtpPort,
          smtpUser: gatewayConfig.smtpUser,
          smtpPass: gatewayConfig.smtpPass,
          fromAddress: gatewayConfig.fromAddress
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to dispatch GM & BH executive summary');
    }
    return data;
  },

  // Dispatch Consolidated Team Digest to AMs & RMs
  async dispatchTeamDigest({ date, managerEmail, role, dryRun = false, tasks, users }) {
    const gatewayConfig = emailApi.getGatewayConfig();

    const response = await fetch('/api/cron/daily-fe-fatal-digest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-by': 'locus-portal'
      },
      body: JSON.stringify({
        action: 'send_team_digest',
        date,
        managerEmail,
        role,
        dryRun,
        tasks,
        users,
        credentials: {
          brevoApiKey: gatewayConfig.brevoApiKey || import.meta.env.VITE_BREVO_API_KEY || '',
          resendApiKey: gatewayConfig.resendApiKey,
          smtpHost: gatewayConfig.smtpHost,
          smtpPort: gatewayConfig.smtpPort,
          smtpUser: gatewayConfig.smtpUser,
          smtpPass: gatewayConfig.smtpPass,
          fromAddress: gatewayConfig.fromAddress
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to dispatch team digest');
    }
    return data;
  }
};

// ====================================================================
// 8. SYSTEM SETTINGS & LIVE ROLE PRESETS REST API
// ====================================================================

export const settingsApi = {
  // Fetch system setting by key (e.g., 'role_presets')
  async getSetting(key, defaultValue = null) {
    // If the table is missing from Supabase schema, cleanly avoid failing network calls
    if (typeof window !== 'undefined' && sessionStorage.getItem('locus_table_system_settings_missing') === 'true') {
      try {
        const cached = localStorage.getItem(`locus_setting_${key}`);
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return defaultValue;
    }

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('*')
          .eq('key', key)
          .maybeSingle();

        if (error) {
          if (error.code === 'PGRST205' && typeof window !== 'undefined') {
            sessionStorage.setItem('locus_table_system_settings_missing', 'true');
          }
        } else if (data?.value) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('locus_table_system_settings_missing');
          }
          try {
            localStorage.setItem(`locus_setting_${key}`, JSON.stringify(data.value));
          } catch (e) {}
          return data.value;
        }
      } catch (err) {
        // Fallback to local storage
      }
    }

    try {
      const cached = localStorage.getItem(`locus_setting_${key}`);
      if (cached) return JSON.parse(cached);
    } catch (e) {}

    return defaultValue;
  },

  // Set system setting by key (persists to Supabase and local cache)
  async setSetting(key, value, updatedBy = null) {
    try {
      localStorage.setItem(`locus_setting_${key}`, JSON.stringify(value));
    } catch (e) {}

    if (typeof window !== 'undefined' && sessionStorage.getItem('locus_table_system_settings_missing') === 'true') {
      return value;
    }

    if (supabase) {
      try {
        const payload = {
          key,
          value,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy || 'SuperAdmin'
        };
        const { error } = await supabase
          .from('system_settings')
          .upsert(payload, { onConflict: 'key' });

        if (error) {
          if (error.code === 'PGRST205' && typeof window !== 'undefined') {
            sessionStorage.setItem('locus_table_system_settings_missing', 'true');
          }
        } else if (typeof window !== 'undefined') {
          sessionStorage.removeItem('locus_table_system_settings_missing');
        }
      } catch (err) {}
    }
    return value;
  },

  // Specialized helpers for Role Presets
  async getRolePresets() {
    return this.getSetting('role_presets', null);
  },

  async saveRolePresets(presets, updatedBy) {
    return this.setSetting('role_presets', presets, updatedBy);
  }
};

