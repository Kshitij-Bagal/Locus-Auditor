import * as XLSX from 'xlsx';

// Helper to sanitize and clean Field Executive name
export function cleanFeName(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'Unassigned';
  const parts = rawName.split('_');
  if (parts.length > 1) {
    return parts.slice(1).join(' ').trim();
  }
  return rawName.trim();
}

export function extractFeCode(rawName, fallbackId = '') {
  if (!rawName || typeof rawName !== 'string') return fallbackId || 'N/A';
  const parts = rawName.split('_');
  if (parts.length > 1) {
    return parts[0].trim();
  }
  return fallbackId || 'N/A';
}

// Normalized matching for dynamic column detection
function findColumnValue(row, patterns) {
  const keys = Object.keys(row);
  for (const pattern of patterns) {
    const matchedKey = keys.find(k => {
      const normalizedKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedPattern = pattern.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedKey.includes(normalizedPattern) || normalizedPattern.includes(normalizedKey);
    });
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
      return String(row[matchedKey]).trim();
    }
  }
  return '';
}

export function transformRawRow(row, index) {
  const taskId = findColumnValue(row, ['TASK ID', 'task_id', 'taskid']) || `TASK-${index + 1}`;
  const rawFeName = findColumnValue(row, ['RIDER NAME', 'fe_name', 'fename', 'rider_name', 'INITIAL RIDER NAME']);
  const feId = findColumnValue(row, ['RIDER ID', 'rider_id', 'fe_id']);
  const feCode = extractFeCode(rawFeName, feId);
  const feName = cleanFeName(rawFeName);

  const date = findColumnValue(row, ['DISPATCH DATE', 'dispatch_date', 'date', 'CREATED AT', 'SLOT START']) || '27/10/2026';
  const zone = findColumnValue(row, ['ZONE', 'zone']) || 'Unknown Zone';
  const teamName = findColumnValue(row, ['TEAM NAME', 'team', 'city', 'hub']) || 'Ahmedabad';
  const facilityCode = teamName || 'Ahmedabad';
  const status = (findColumnValue(row, ['TASK STATUS', 'task_status', 'VISIT STATUS', 'status']) || 'PENDING').toUpperCase();

  const customerName = findColumnValue(row, ['CUSTOMER NAME', 'customer_name']) || 'Customer';
  const customerAddress = findColumnValue(row, ['CUSTOMER ADDRESS', 'customer_address', 'address']) || '';
  const pincode = findColumnValue(row, ['PINCODE', 'pincode', 'pin_code']) || '';
  const reason = findColumnValue(row, ['Choose a reason', 'reason', 'cancellation_reason']) || '';
  const pin = findColumnValue(row, ['Pin', 'pin', 'otp']) || '';

  // 5 Audit Media URLs
  const selfie = findColumnValue(row, [
    'Click a sefie of yourself showing Lenskart Tshirt & id card',
    'selfie',
    'tshirt',
    'id card'
  ]);

  const torches = findColumnValue(row, [
    'Upload an image of working Blue torch & Yellow torch',
    'blue torch',
    'yellow torch',
    'torch'
  ]);

  const visionChart = findColumnValue(row, [
    'Upload image of the vision chart & standee',
    'vision chart',
    'standee',
    'chart'
  ]);

  const toolkit = findColumnValue(row, [
    'Upload an image of near vision book, trial frame, JCC, Mirror, Sanitizer & Measurement Tape',
    'near vision book',
    'trial frame',
    'toolkit',
    'sanitizer'
  ]);

  const frameDisplay = findColumnValue(row, [
    'Add a click image of the frame displayed at the customer’s house.',
    'frame displayed',
    'customer’s house',
    'customers house',
    'frame'
  ]);

  const images = {
    selfie,
    torches,
    visionChart,
    toolkit,
    frameDisplay
  };

  const imageCount = [selfie, torches, visionChart, toolkit, frameDisplay].filter(Boolean).length;
  const hasImages = imageCount > 0;

  return {
    id: taskId,
    taskId,
    rawFeName,
    feCode,
    feName,
    feId,
    facilityCode,
    feEmail: `${(feCode || 'fe').toLowerCase()}@lenskart.in`,
    date,
    zone,
    teamName,
    status,
    customerName,
    customerAddress,
    pincode,
    reason,
    pin,
    images,
    imageCount,
    hasImages,
    // Audit Status: PENDING | PASSED | FATAL
    auditStatus: 'PENDING',
    auditedAt: null,
    auditedBy: '',
    auditedLocation: 'Ahmedabad Hub',
    uploadedAt: new Date().toISOString(),
    allocatedAt: null,
    failedReasons: [],
    remarks: '',
    emailSent: false,
    emailSentAt: null,
    warningLevel: null,
    criteriaStatus: {
      selfie: 'UNREVIEWED',
      torches: 'UNREVIEWED',
      visionChart: 'UNREVIEWED',
      toolkit: 'UNREVIEWED',
      frameDisplay: 'UNREVIEWED',
      pin: 'UNREVIEWED'
    },
    // Faulty Equipment & Consumable Replacements Array
    replacements: []
  };
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!jsonData || jsonData.length === 0) {
          throw new Error('The uploaded file contains no data rows.');
        }

        const tasks = jsonData.map((row, idx) => transformRawRow(row, idx));
        resolve({ tasks, totalRows: jsonData.length, sheetName: firstSheetName });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

// Export Audited Tasks to Excel
export function exportAuditReport(tasks, filename = 'Locus_FE_Audit_Report.xlsx') {
  const exportData = tasks.map(t => {
    const replacementStr = (t.replacements || [])
      .map(r => `${r.itemName} (${r.condition} - ${r.urgency})`)
      .join('; ');

    return {
      'TASK ID': t.taskId,
      'FE NAME': t.feName,
      'RIDER CODE': t.feCode,
      'RIDER ID': t.feId,
      'FACILITY / CITY': t.facilityCode,
      'ZONE': t.zone,
      'DATE': t.date,
      'TASK STATUS': t.status,
      'AUDIT STATUS': t.auditStatus,
      'AUDIT TIMESTAMP': t.auditedAt ? new Date(t.auditedAt).toLocaleString() : 'Not Audited',
      'AUDITOR': t.auditedBy || 'N/A',
      'AUDIT LOCATION': t.auditedLocation || 'N/A',
      'FATAL REASONS': t.failedReasons.join('; '),
      'REPLACEMENTS ORDERED': replacementStr,
      'AUDITOR REMARKS': t.remarks,
      'WARNING EMAIL SENT': t.emailSent ? 'YES' : 'NO',
      'WARNING LEVEL': t.warningLevel || 'None',
      'CUSTOMER NAME': t.customerName,
      'CUSTOMER ADDRESS': t.customerAddress,
      'PIN / OTP': t.pin,
      'SELFIE URL': t.images.selfie,
      'TORCHES URL': t.images.torches,
      'CHART URL': t.images.visionChart,
      'TOOLKIT URL': t.images.toolkit,
      'FRAME URL': t.images.frameDisplay
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Summary');
  XLSX.writeFile(workbook, filename);
}

// Export Central Supply & Equipment Replacement Requisition Report
export function exportReplacementReport(tasks, filename = 'Lenskart_FE_Asset_Replacement_Orders.xlsx') {
  const allReplacements = [];
  tasks.forEach(t => {
    (t.replacements || []).forEach(r => {
      allReplacements.push({
        'TASK ID': t.taskId,
        'DISPATCH DATE': t.date,
        'FACILITY / HUB': t.facilityCode,
        'ZONE': t.zone,
        'FE NAME': t.feName,
        'RIDER ID': t.feId,
        'RIDER CODE': t.feCode,
        'ITEM NAME': r.itemName,
        'CATEGORY': r.category,
        'ASSET / CONSUMABLE': r.type,
        'FAULT / CONDITION': r.condition,
        'REPLACEMENT URGENCY': r.urgency,
        'AUDITOR REMARKS': r.notes || t.remarks || 'Replacement required',
        'REPORTED AT': r.reportedAt ? new Date(r.reportedAt).toLocaleString() : new Date().toLocaleString(),
        'REPORTED BY AUDITOR': r.reportedBy || t.auditedBy || 'Central Auditor',
        'ORDER STATUS': r.status || 'PENDING_PROCUREMENT'
      });
    });
  });

  // Aggregate by item
  const itemSummary = {};
  allReplacements.forEach(r => {
    const key = r['ITEM NAME'];
    if (!itemSummary[key]) {
      itemSummary[key] = {
        'ITEM NAME': key,
        'CATEGORY': r['CATEGORY'],
        'ASSET / CONSUMABLE': r['ASSET / CONSUMABLE'],
        'TOTAL UNITS NEEDED': 0,
        'CRITICAL (IMMEDIATE)': 0,
        'HIGH PRIORITY': 0,
        'ROUTINE RESTOCK': 0,
        'AFFECTED HUBS': new Set()
      };
    }
    itemSummary[key]['TOTAL UNITS NEEDED']++;
    if (r['REPLACEMENT URGENCY'] === 'IMMEDIATE') itemSummary[key]['CRITICAL (IMMEDIATE)']++;
    if (r['REPLACEMENT URGENCY'] === 'HIGH') itemSummary[key]['HIGH PRIORITY']++;
    if (r['REPLACEMENT URGENCY'] === 'NORMAL') itemSummary[key]['ROUTINE RESTOCK']++;
    itemSummary[key]['AFFECTED HUBS'].add(r['FACILITY / HUB']);
  });

  const summaryData = Object.values(itemSummary).map(s => ({
    ...s,
    'AFFECTED HUBS': Array.from(s['AFFECTED HUBS']).join(', ')
  }));

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Requisition Summary
  const wsSummary = XLSX.utils.json_to_sheet(summaryData.length > 0 ? summaryData : [{ 'Status': 'No replacement requests recorded yet' }]);
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Procurement Summary');

  // Sheet 2: Detailed Dispatch Breakdown
  const wsDetail = XLSX.utils.json_to_sheet(allReplacements.length > 0 ? allReplacements : [{ 'Status': 'No replacement requests recorded yet' }]);
  XLSX.utils.book_append_sheet(workbook, wsDetail, 'FE Replacement Orders');

  XLSX.writeFile(workbook, filename);
}
