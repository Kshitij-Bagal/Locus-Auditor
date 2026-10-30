import { createClient } from '@supabase/supabase-js';

// Sanitize the URL to remove trailing slashes or accidentally pasted /rest/v1/
const rawUrl = import.meta?.env?.VITE_SUPABASE_URL || '';
const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  cleanUrl && 
  supabaseAnonKey && 
  !cleanUrl.includes('your-project-id')
);

export const supabase = isSupabaseConfigured
  ? createClient(cleanUrl, supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 10 } }
    })
  : null;

// ====================================================================
// HEALTH CHECK: Verify if Supabase tables exist
// ====================================================================
export async function checkSupabaseHealth() {
  if (!supabase) return { connected: false, tablesReady: false, error: 'Supabase credentials not configured' };
  try {
    const { data, error } = await supabase.from('tasks').select('id').limit(1);
    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        return { connected: true, tablesReady: false, error: 'Database reachable, but tables not yet created. Run supabase_schema.sql in the SQL Editor.' };
      }
      return { connected: true, tablesReady: false, error: error.message };
    }
    return { connected: true, tablesReady: true, count: data?.length ?? 0 };
  } catch (err) {
    return { connected: false, tablesReady: false, error: err.message };
  }
}

// ====================================================================
// TASK SYNC FUNCTIONS
// ====================================================================
export async function fetchTasksFromSupabase() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data) return [];

    return data.map(row => ({
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
      allocationBatchId: row.allocation_batch_id,
      auditStatus: row.audit_status || 'PENDING',
      auditedAt: row.audited_at,
      auditedById: row.audited_by_id,
      auditedBy: row.audited_by_name,
      auditedLocation: row.audited_location,
      failedReasons: Array.isArray(row.failed_reasons) ? row.failed_reasons : [],
      remarks: row.auditor_remarks || '',
      warningLevel: row.warning_level,
      emailSent: Boolean(row.email_sent),
      emailSentAt: row.email_sent_at,
      criteriaStatus: row.criteria_status || {},
      replacements: Array.isArray(row.replacements) ? row.replacements : []
    }));
  } catch (err) {
    console.warn('Failed to fetch tasks from Supabase:', err.message);
    return null;
  }
}

export async function upsertTaskToSupabase(task) {
  if (!supabase) return false;
  try {
    const payload = {
      id: task.id,
      task_id: task.taskId || task.id,
      team_name: task.teamName || task.facilityCode || 'Ahmedabad',
      facility_code: task.facilityCode || task.teamName || 'Ahmedabad',
      zone: task.zone,
      dispatch_date: task.date,
      status: task.status,
      fe_name: task.feName,
      fe_code: task.feCode,
      fe_id: task.feId,
      fe_email: task.feEmail,
      customer_name: task.customerName,
      customer_address: task.customerAddress,
      pincode: task.pincode,
      delivery_pin: task.pin,
      cancellation_reason: task.reason,
      image_urls: task.images || {},
      image_count: task.imageCount || 0,
      has_images: task.hasImages ?? false,
      assigned_auditor_id: task.assignedAuditorId || null,
      assigned_auditor_name: task.assignedAuditorName || null,
      allocated_at: task.allocatedAt || null,
      allocation_batch_id: task.allocationBatchId || null,
      audit_status: task.auditStatus || 'PENDING',
      audited_at: task.auditedAt || null,
      audited_by_name: task.auditedBy || null,
      audited_location: task.auditedLocation || null,
      failed_reasons: task.failedReasons || [],
      auditor_remarks: task.remarks || '',
      warning_level: task.warningLevel || null,
      email_sent: task.emailSent || false,
      email_sent_at: task.emailSentAt || null,
      criteria_status: task.criteriaStatus || {},
      replacements: task.replacements || [],
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('tasks').upsert(payload);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Failed to upsert task to Supabase:', err.message);
    return false;
  }
}

export async function bulkUpsertTasksToSupabase(tasksArray) {
  if (!supabase || !tasksArray?.length) return false;
  try {
    const rows = tasksArray.map(task => ({
      id: task.id,
      task_id: task.taskId || task.id,
      team_name: task.teamName || task.facilityCode || 'Ahmedabad',
      facility_code: task.facilityCode || task.teamName || 'Ahmedabad',
      zone: task.zone,
      dispatch_date: task.date,
      status: task.status,
      fe_name: task.feName,
      fe_code: task.feCode,
      fe_id: task.feId,
      fe_email: task.feEmail,
      customer_name: task.customerName,
      customer_address: task.customerAddress,
      pincode: task.pincode,
      delivery_pin: task.pin,
      cancellation_reason: task.reason,
      image_urls: task.images || {},
      image_count: task.imageCount || 0,
      has_images: task.hasImages ?? false,
      audit_status: task.auditStatus || 'PENDING',
      criteria_status: task.criteriaStatus || {},
      failed_reasons: task.failedReasons || [],
      replacements: task.replacements || []
    }));

    // Chunk into blocks of 100 for network safety
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from('tasks').upsert(chunk);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.warn('Failed to bulk upsert tasks:', err.message);
    return false;
  }
}

// ====================================================================
// SOP RULES SYNC FUNCTIONS (2-Step Review Model)
// ====================================================================
export async function fetchRulesFromSupabase() {
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
      isMandatory: r.is_mandatory ?? true,
      triggersFatal: r.triggers_fatal ?? true,
      status: r.status || 'PUBLISHED',
      draft: r.draft_standards ? {
        standards: r.draft_standards,
        commonFailures: r.draft_failures,
        draftedBy: r.drafted_by_name,
        draftedAt: r.drafted_at
      } : null,
      publishedBy: r.published_by_name,
      publishedAt: r.published_at
    }));
  } catch (err) {
    console.warn('Failed to fetch rules from Supabase:', err.message);
    return null;
  }
}

export async function saveRuleToSupabase(rule) {
  if (!supabase) return false;
  try {
    const payload = {
      id: rule.id,
      image_key: rule.imageKey || rule.id,
      title: rule.title,
      description: rule.description,
      standards: rule.standards || [],
      common_failures: rule.commonFailures || [],
      is_mandatory: rule.isMandatory ?? true,
      triggers_fatal: rule.triggersFatal ?? true,
      status: rule.status || 'PUBLISHED',
      draft_standards: rule.draft?.standards || null,
      draft_failures: rule.draft?.commonFailures || null,
      drafted_by_name: rule.draft?.draftedBy || null,
      drafted_at: rule.draft?.draftedAt || null,
      published_by_name: rule.publishedBy || null,
      published_at: rule.publishedAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('audit_criteria_rules').upsert(payload);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Failed to save rule to Supabase:', err.message);
    return false;
  }
}

// ====================================================================
// REPLACEMENT ORDERS & POS SYNC FUNCTIONS
// ====================================================================
export async function fetchReplacementOrdersFromSupabase() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('replacement_orders')
      .select('*')
      .order('reported_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Failed to fetch replacement orders:', err.message);
    return null;
  }
}

export async function createReplacementOrderInSupabase(order) {
  if (!supabase) return false;
  try {
    const payload = {
      task_id: order.taskId,
      fe_id: order.feId,
      fe_name: order.feName,
      fe_code: order.feCode,
      facility_code: order.facilityCode || 'Ahmedabad',
      zone: order.zone,
      item_id: order.itemId,
      item_name: order.itemName,
      category: order.category,
      type: order.type,
      fault_condition: order.faultCondition,
      urgency: order.urgency || 'NORMAL',
      auditor_notes: order.auditorNotes || '',
      pos_status: 'FLAGGED_BY_AUDITOR',
      reported_by_name: order.reportedByName || 'Auditor',
      reported_at: new Date().toISOString()
    };

    const { error } = await supabase.from('replacement_orders').insert(payload);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Failed to create replacement order in Supabase:', err.message);
    return false;
  }
}

export async function updatePosOrderInSupabase(orderId, updates) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('replacement_orders')
      .update({
        pos_status: updates.posStatus,
        pos_order_number: updates.posOrderNumber,
        pos_ordered_at: updates.posOrderedAt,
        pos_ordered_by_name: updates.posOrderedByName,
        disbursed_to_fe_at: updates.disbursedToFeAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Failed to update POS order in Supabase:', err.message);
    return false;
  }
}

// ====================================================================
// AUDITOR ROSTER SYNC FUNCTIONS
// ====================================================================
export async function fetchRosterFromSupabase(date = new Date().toISOString().slice(0, 10)) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('auditor_roster')
      .select('*')
      .eq('roster_date', date);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Failed to fetch roster from Supabase:', err.message);
    return null;
  }
}

export async function upsertRosterInSupabase(rosterEntry) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('auditor_roster').upsert({
      auditor_id: rosterEntry.auditorId || rosterEntry.id,
      auditor_name: rosterEntry.auditorName || rosterEntry.full_name || rosterEntry.name,
      roster_date: rosterEntry.rosterDate || new Date().toISOString().slice(0, 10),
      shift_status: rosterEntry.shiftStatus || 'AVAILABLE',
      daily_quota: rosterEntry.dailyQuota || 50,
      current_assigned: rosterEntry.currentAssigned || 0,
      completed_count: rosterEntry.completedCount || 0,
      notes: rosterEntry.notes || '',
      updated_at: new Date().toISOString()
    });

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Failed to upsert roster to Supabase:', err.message);
    return false;
  }
}

// ====================================================================
// FIELD EXECUTIVE (FE) AUTH VALIDATION
// ====================================================================
export async function validateFEWithSupabase(facilityCode, personId) {
  if (!supabase) return null;
  try {
    const normalizedFacility = facilityCode.trim().toLowerCase();
    const normalizedPersonId = personId.trim();

    // 1. Check in profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('person_id', normalizedPersonId)
      .ilike('facility_code', normalizedFacility)
      .single();

    if (profile) return profile;

    // 2. Check in tasks
    const { data: task } = await supabase
      .from('tasks')
      .select('fe_name, fe_code, fe_id, facility_code, team_name')
      .eq('fe_id', normalizedPersonId)
      .ilike('facility_code', normalizedFacility)
      .limit(1)
      .single();

    if (task) {
      return {
        id: `fe_${task.fe_id}`,
        full_name: task.fe_name,
        role: 'FE',
        facility_code: task.facility_code || task.team_name,
        person_id: task.fe_id,
        email: `${task.fe_code?.toLowerCase() || 'fe'}@lenskart.in`
      };
    }
    return null;
  } catch (err) {
    console.warn('FE auth validation against Supabase failed:', err.message);
    return null;
  }
}

// ====================================================================
// REALTIME SUBSCRIPTIONS
// ====================================================================
export function subscribeToTable(table, onPayload) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`public:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
      onPayload(payload);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ====================================================================
// AUTO-ALLOCATION ENGINE (Pure Equal Distribution Among Active Auditors)
// Ensures 100% of pending tasks with images are evenly divided. Zero tasks left pending.
// ====================================================================

export function runAutoAllocationAlgorithm({
  tasks,
  rosterAuditors
}) {
  // 1. Strictly filter tasks that HAVE COMPLIANCE AUDIT PHOTOS (hasImages === true and imageCount > 0)
  // Tasks without uploaded equipment photos cannot be audited and must NEVER be allocated.
  const actionablePool = tasks.filter(t => {
    const hasPhotos = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
    const isPending = !t.auditStatus || t.auditStatus === 'PENDING';
    const isUnassigned = !t.assignedAuditorId && !t.assignedAuditorName;
    return hasPhotos && isPending && isUnassigned;
  });

  // 2. Filter available auditors who are not on leave
  const activeAuditors = rosterAuditors.filter(a => a.shiftStatus !== 'ON_LEAVE');

  if (activeAuditors.length === 0 || actionablePool.length === 0) {
    return {
      allocatedTasks: tasks,
      newlyAssignedCount: 0,
      auditorWorkloads: {}
    };
  }

  // 3. Workload buckets for each active auditor
  const auditorWorkloads = {};
  activeAuditors.forEach(a => {
    // Weight: 0.5 for HALF_DAY, 1.0 for AVAILABLE / full day
    const weight = a.shiftStatus === 'HALF_DAY' ? 0.5 : 1.0;
    const alreadyAssigned = tasks.filter(t => 
      t.assignedAuditorId === a.id && t.auditStatus === 'PENDING'
    ).length;

    auditorWorkloads[a.id] = {
      auditor: a,
      weight,
      alreadyAssigned,
      newlyAssigned: []
    };
  });

  // 4. Pure Equal Distribution (Assigns every single task in queue)
  const batchId = `ALLOC_${Date.now()}`;
  const unassignedQueue = [...actionablePool];
  let newlyAssignedCount = 0;

  while (unassignedQueue.length > 0) {
    // Sort auditors by lowest current assigned workload to ensure perfectly even distribution
    const sortedAuditorIds = Object.keys(auditorWorkloads).sort((idA, idB) => {
      const loadA = (auditorWorkloads[idA].alreadyAssigned + auditorWorkloads[idA].newlyAssigned.length) / auditorWorkloads[idA].weight;
      const loadB = (auditorWorkloads[idB].alreadyAssigned + auditorWorkloads[idB].newlyAssigned.length) / auditorWorkloads[idB].weight;
      return loadA - loadB;
    });

    const nextAuditorId = sortedAuditorIds[0];
    const taskToAssign = unassignedQueue.shift();

    taskToAssign.assignedAuditorId = auditorWorkloads[nextAuditorId].auditor.id;
    taskToAssign.assignedAuditorName = auditorWorkloads[nextAuditorId].auditor.full_name || auditorWorkloads[nextAuditorId].auditor.name;
    taskToAssign.assignedAuditorEmail = auditorWorkloads[nextAuditorId].auditor.email || null;
    taskToAssign.allocatedAt = new Date().toISOString();
    taskToAssign.allocationBatchId = batchId;

    auditorWorkloads[nextAuditorId].newlyAssigned.push(taskToAssign.id);
    newlyAssignedCount++;
  }

  // 5. Update complete tasks list
  const updatedTasks = tasks.map(t => {
    const matched = actionablePool.find(ap => ap.id === t.id);
    return matched || t;
  });

  return {
    allocatedTasks: updatedTasks,
    newlyAssignedCount,
    auditorWorkloads,
    batchId
  };
}
