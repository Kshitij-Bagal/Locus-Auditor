import React, { useState, useRef } from 'react';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Building2, 
  Mail, 
  User, 
  Search,
  CheckCircle2,
  Lock,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  Key
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseRoles, normalizeRoleName, displayRoleName } from '../utils/accessHelper.js';

const ALL_ROLES = [
  'SuperAdmin',
  'Admin',          // City Admin
  'BH',             // Business Head
  'GM',             // General Manager
  'RM',             // Regional Manager
  'AM',             // Area Manager
  'Central Ops',
  'Auditor',
  'FE'
];

export default function UserManagement({
  users = [],
  onAddUser,
  onAddMultipleUsers,
  onImportUsers,
  onUpdateUserRole,
  onToggleUserActive,
  onNavigate
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [importNotification, setImportNotification] = useState(null);
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Single user form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Auditor');
  const [facilityCode, setFacilityCode] = useState('Ahmedabad');
  const [personId, setPersonId] = useState('');
  const [reportingManagerEmail, setReportingManagerEmail] = useState('');
  const [regionalManagerEmail, setRegionalManagerEmail] = useState('');

  const filteredUsers = users.filter(u => {
    if (selectedRoleFilter !== 'ALL' && u.role !== selectedRoleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = 
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.facility_code?.toLowerCase().includes(q) ||
        u.person_id?.toLowerCase().includes(q) ||
        u.reporting_manager_email?.toLowerCase().includes(q) ||
        u.regional_manager_email?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const handleCreateUser = (e) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      alert('Please fill in Name and Email.');
      return;
    }

    onAddUser({
      id: `usr_${Date.now()}`,
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      role,
      facility_code: facilityCode.trim(),
      person_id: personId.trim() || `EMP_${Date.now().toString().slice(-4)}`,
      reporting_manager_email: reportingManagerEmail.trim().toLowerCase(),
      regional_manager_email: regionalManagerEmail.trim().toLowerCase(),
      is_active: true,
      created_at: new Date().toISOString()
    });

    setFullName('');
    setEmail('');
    setPersonId('');
    setReportingManagerEmail('');
    setRegionalManagerEmail('');
    setShowAddModal(false);
  };

  // Download Sample Excel Template for User Seeding
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "employee_code": "EMP001",
        "facility_code": "Ahmedabad Hub",
        "name": "Kshitij Bagal",
        "role": "SuperAdmin, Auditor, Admin",
        "mobile": "9876543200",
        "email": "superadmin@lenskart.in",
        "am": "",
        "rm": "",
        "is_Active": "TRUE",
        "city": "Ahmedabad",
        "zone": "Ahmedabad_Zone1"
      },
      {
        "employee_code": "227563",
        "facility_code": "Ahmedabad Hub",
        "name": "Mohammed Aman Shaikh",
        "role": "FE",
        "mobile": "9876543215",
        "email": "fe.aman@lenskart.in",
        "am": "Abhay Pandey",
        "rm": "Sanjay Verma",
        "is_Active": "TRUE",
        "city": "Ahmedabad",
        "zone": "Ahmedabad_Zone1"
      },
      {
        "employee_code": "213812",
        "facility_code": "Ahmedabad Hub",
        "name": "Rai Balvant Bimlesh",
        "role": "FE",
        "mobile": "9876543216",
        "email": "fe.balvant@lenskart.in",
        "am": "Abhay Pandey",
        "rm": "Sanjay Verma",
        "is_Active": "TRUE",
        "city": "Ahmedabad",
        "zone": "Ahmedabad_Zone2"
      },
      {
        "employee_code": "AM001",
        "facility_code": "Ahmedabad Hub",
        "name": "Abhay Pandey",
        "role": "AM, Admin",
        "mobile": "9876543212",
        "email": "am.abhay@lenskart.in",
        "am": "",
        "rm": "Sanjay Verma",
        "is_Active": "TRUE",
        "city": "Ahmedabad",
        "zone": "Ahmedabad_Zone1"
      },
      {
        "employee_code": "RM001",
        "facility_code": "All",
        "name": "Sanjay Verma",
        "role": "RM",
        "mobile": "9876543218",
        "email": "rm.west@lenskart.in",
        "am": "",
        "rm": "",
        "is_Active": "TRUE",
        "city": "All",
        "zone": "West"
      },
      {
        "employee_code": "AUD001",
        "facility_code": "Ahmedabad Hub",
        "name": "Pooja Verma",
        "role": "Auditor",
        "mobile": "9876543210",
        "email": "auditor.pooja@lenskart.in",
        "am": "",
        "rm": "",
        "is_Active": "TRUE",
        "city": "Ahmedabad",
        "zone": "Ahmedabad_Zone1"
      },
      {
        "employee_code": "OPS001",
        "facility_code": "All",
        "name": "Rohan Mehta",
        "role": "Central Ops",
        "mobile": "9876543211",
        "email": "ops.central@lenskart.in",
        "am": "",
        "rm": "",
        "is_Active": "TRUE",
        "city": "All",
        "zone": "National"
      },
      {
        "employee_code": "GM001",
        "facility_code": "All",
        "name": "Rajesh Sharma",
        "role": "GM",
        "mobile": "9876543213",
        "email": "gm.quality@lenskart.in",
        "am": "",
        "rm": "",
        "is_Active": "TRUE",
        "city": "All",
        "zone": "National"
      },
      {
        "employee_code": "BH001",
        "facility_code": "All",
        "name": "Sunil Kumar",
        "role": "BH",
        "mobile": "9876543214",
        "email": "bh.lenskart@lenskart.in",
        "am": "",
        "rm": "",
        "is_Active": "TRUE",
        "city": "All",
        "zone": "National"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users_Template");
    XLSX.writeFile(workbook, "Lenskart_User_Profile_Seeder_Final.xlsx");
  };

  // Import Users Excel File directly into Supabase (skipping existing duplicates)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setIsImporting(true);
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);

        if (!rawRows || rawRows.length === 0) {
          alert('No user rows found in the uploaded file.');
          setIsImporting(false);
          return;
        }

        // Pass 1: Parse rows into user objects
        const rawParsedUsers = rawRows.map((row, idx) => {
          // Normalize column keys (case-insensitive & handles underscores/spaces)
          const findVal = (names) => {
            for (const key of Object.keys(row)) {
              const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
              for (const n of names) {
                if (cleanKey === n.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                  return String(row[key]).trim();
                }
              }
            }
            return '';
          };

          const employeeCode = findVal(['employee_code', 'employeecode', 'employee code', 'person code', 'person id', 'rider id']) || `EMP_${idx + 1}`;
          const facilityCode = findVal(['facility_code', 'facilitycode', 'facility code', 'hub']) || 'Ahmedabad';
          const fullName = findVal(['name', 'full name', 'employee name']) || '';
          const rawRole = findVal(['role', 'user role', 'designation']) || 'Auditor';
          const mobile = findVal(['mobile', 'phone', 'phone no', 'contact']) || '';
          const email = findVal(['email', 'users email', 'user email', 'mail']).toLowerCase();
          const amName = findVal(['am', 'area manager', 'reporting manager', 'reporting_manager']);
          const rmName = findVal(['rm', 'regional manager', 'regional_manager']);
          const isActiveRaw = findVal(['is_active', 'isactive', 'is active', 'status', 'active']);
          const city = findVal(['city']) || facilityCode || 'Ahmedabad';
          const zone = findVal(['zone']) || 'Ahmedabad_Zone1';

          // Validate or fallback roles (supports multi-role strings like "City Admin, Auditor" or "SuperAdmin, Admin")
          const finalRoles = parseRoles(rawRole);
          const primaryRole = finalRoles[0] || 'Auditor';

          const isActive = isActiveRaw !== '' 
            ? !['false', '0', 'no', 'inactive'].includes(isActiveRaw.toLowerCase())
            : true;

          return {
            id: `usr_${Date.now()}_${idx}`,
            email: email || `user_${idx}@lenskart.in`,
            full_name: fullName || email.split('@')[0] || `Employee ${idx + 1}`,
            role: primaryRole,
            roles: finalRoles,
            facility_code: facilityCode,
            person_id: employeeCode,
            employee_code: employeeCode,
            city,
            zone,
            phone: mobile,
            mobile,
            is_active: isActive,
            am_name: amName,
            rm_name: rmName,
            reporting_manager_name: amName,
            regional_manager_name: rmName,
            reporting_manager_id: null,
            regional_manager_id: null,
            reporting_manager_email: '',
            regional_manager_email: '',
            created_at: new Date().toISOString()
          };
        }).filter(u => u.email && u.full_name);

        // Pass 2: Relational Foreign Key Resolution (match AM & RM names to profile UUID and email)
        const allKnown = [...users, ...rawParsedUsers];
        const newUsers = rawParsedUsers.map(u => {
          let amMatch = null;
          let rmMatch = null;

          if (u.am_name) {
            const target = u.am_name.toLowerCase().trim();
            amMatch = allKnown.find(k => 
              k.full_name?.toLowerCase().trim() === target ||
              k.email?.toLowerCase().trim() === target ||
              k.person_id?.toLowerCase().trim() === target
            );
          }

          if (u.rm_name) {
            const target = u.rm_name.toLowerCase().trim();
            rmMatch = allKnown.find(k => 
              k.full_name?.toLowerCase().trim() === target ||
              k.email?.toLowerCase().trim() === target ||
              k.person_id?.toLowerCase().trim() === target
            );
          }

          return {
            ...u,
            reporting_manager_id: amMatch ? amMatch.id : null,
            reporting_manager_name: amMatch ? amMatch.full_name : u.am_name,
            reporting_manager_email: amMatch ? amMatch.email : (u.am_name.includes('@') ? u.am_name : ''),
            regional_manager_id: rmMatch ? rmMatch.id : null,
            regional_manager_name: rmMatch ? rmMatch.full_name : u.rm_name,
            regional_manager_email: rmMatch ? rmMatch.email : (u.rm_name.includes('@') ? u.rm_name : '')
          };
        });

        // Step 3: Trigger Supabase Direct Import with single-row skip deduplication
        let result = null;
        if (onImportUsers) {
          result = await onImportUsers(newUsers);
        } else if (onAddMultipleUsers) {
          result = await onAddMultipleUsers(newUsers);
        } else if (onAddUser) {
          for (const u of newUsers) {
            await onAddUser(u);
          }
        }

        const insertedCount = result?.insertedCount ?? newUsers.length;
        const skippedCount = result?.skippedCount ?? 0;
        const skipped = result?.skipped ?? [];

        setImportNotification({
          fileName: file.name,
          total: newUsers.length,
          insertedCount,
          skippedCount,
          skipped
        });
        setShowSkippedDetails(false);
      } catch (err) {
        alert('Failed to import Excel file: ' + err.message);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            SuperAdmin
          </span>
          <h2 className="text-2xl font-black text-white mt-1">
            User Accounts
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Add and manage team members, roles, and assigned hubs directly in Supabase.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {onNavigate && (
            <button
              onClick={() => onNavigate('accessControl')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-purple-600/20 cursor-pointer"
              title="Directly configure page permissions per user and role"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Access Control Panel</span>
            </button>
          )}

          {/* Download Template */}
          <button
            onClick={handleDownloadTemplate}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download Excel template with sample rows"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Download Template</span>
          </button>

          {/* Import Users Excel */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className={`px-3 py-2 rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all ${
              isImporting 
                ? 'bg-blue-800 text-blue-200 cursor-wait' 
                : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
            }`}
            title="Upload Excel sheet to seed users directly into Supabase"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing to Supabase...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Import Users from Excel</span>
              </>
            )}
          </button>

          {/* Add Single User */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Single User</span>
          </button>
        </div>
      </div>

      {/* Import Notification Banner with Duplicate Skipped Breakdown */}
      {importNotification && (
        <div className={`p-4 rounded-xl border text-xs animate-in fade-in space-y-3 ${
          importNotification.insertedCount > 0 
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
            : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {importNotification.insertedCount > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <Info className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <div>
                <span className="font-bold text-white text-sm">
                  {importNotification.insertedCount > 0 ? 'Supabase Sync Completed' : 'Import Complete (No New Users Needed)'}
                </span>
                <p className="text-slate-300 text-xs mt-0.5">
                  Processed <code className="font-mono text-white font-semibold">{importNotification.fileName}</code> with automatic duplicate protection.
                </p>
              </div>
            </div>

            <button
              onClick={() => setImportNotification(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Summary Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>+{importNotification.insertedCount} New Users Added to Supabase</span>
            </span>

            <span className={`px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1.5 ${
              importNotification.skippedCount > 0 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{importNotification.skippedCount} Existing Users Skipped</span>
            </span>

            {importNotification.skippedCount > 0 && (
              <button
                onClick={() => setShowSkippedDetails(prev => !prev)}
                className="ml-auto text-xs font-semibold text-sky-400 hover:text-sky-300 underline flex items-center gap-1 cursor-pointer"
              >
                <span>{showSkippedDetails ? 'Hide' : 'View'} Skipped Details ({importNotification.skippedCount})</span>
                {showSkippedDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Collapsible Skipped Rows Details Table */}
          {showSkippedDetails && importNotification.skipped && importNotification.skipped.length > 0 && (
            <div className="mt-3 bg-slate-950/80 rounded-xl border border-slate-800 p-3 space-y-2">
              <div className="font-semibold text-slate-300 text-[11px] flex items-center justify-between">
                <span>Skipped Rows (Already Registered in Supabase):</span>
                <span className="text-slate-500 font-mono">Row-by-row bypass</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {importNotification.skipped.map((s, sIdx) => (
                  <div key={sIdx} className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                    <div>
                      <span className="font-bold text-white mr-2">{s.full_name || s.name || 'User'}</span>
                      <span className="font-mono text-sky-400 text-[10px]">[{s.employee_code || s.person_id || 'ID'}]</span>
                      <span className="text-slate-400 ml-2 font-mono">{s.email}</span>
                    </div>
                    <span className="text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono text-[10px] shrink-0">
                      {s.skipReason || 'Already exists in database'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Excel Columns Format Guide Box */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2">
        <div className="font-bold text-white flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-sky-400" />
          <span>Excel Sheet Columns for User Seeding:</span>
        </div>
        <p className="text-[11px] text-slate-400">
          Upload an Excel (.xlsx) file with these 11 headers to register staff and link Area & Regional Managers:
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="px-2 py-1 rounded bg-slate-800 text-sky-300 font-mono text-[11px] font-semibold border border-slate-700">employee_code</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-sky-300 font-mono text-[11px] font-semibold border border-slate-700">facility_code</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-sky-300 font-mono text-[11px] font-semibold border border-slate-700">name</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-emerald-300 font-mono text-[11px] font-semibold border border-slate-700">role</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">mobile</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-sky-300 font-mono text-[11px] font-semibold border border-slate-700">email</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-amber-300 font-mono text-[11px] font-semibold border border-slate-700">am</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-amber-300 font-mono text-[11px] font-semibold border border-slate-700">rm</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">is_Active</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-sky-300 font-mono text-[11px] font-semibold border border-slate-700">city</span>
          <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">zone</span>
        </div>
        <div className="text-[11px] text-slate-400 pt-1 flex flex-wrap gap-3">
          <span>• <strong>am & rm</strong>: Put the manager's name (e.g. <em>Abhay Pandey</em>). The system automatically links their UUID reference and email.</span>
          <span>• <strong>role</strong>: Supports multiple roles (e.g. <code className="text-slate-300">SuperAdmin, Auditor, Admin</code>).</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search team member by name, email, or hub..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Role:</span>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white cursor-pointer"
          >
            <option value="ALL">All Roles ({users.length})</option>
            {ALL_ROLES.map(r => (
              <option key={r} value={r}>
                {r === 'Admin' ? 'City Admin' : r} ({users.filter(u => u.role === r).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-850 text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-800">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Hub / City</th>
                <th className="py-3 px-4">Person ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No users match your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-850/60 transition-colors">
                    
                    {/* User */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{user.full_name}</div>
                      <div className="text-[11px] text-slate-400">{user.email}</div>
                      {(user.reporting_manager_email || user.regional_manager_email) && (
                        <div className="text-[10px] text-sky-400/90 mt-0.5 flex flex-wrap gap-1 font-mono">
                          {user.reporting_manager_email && <span>AM: {user.reporting_manager_email}</span>}
                          {user.reporting_manager_email && user.regional_manager_email && <span className="text-slate-600">•</span>}
                          {user.regional_manager_email && <span>RM: {user.regional_manager_email}</span>}
                        </div>
                      )}
                    </td>

                    {/* Role Badges (supports multi-role display) */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {parseRoles(user.roles || [user.role || 'Auditor']).map(r => (
                          <span key={r} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            r === 'SuperAdmin' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                            r === 'BH' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                            r === 'GM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                            r === 'Admin' ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' :
                            r === 'Central Ops' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                            r === 'Auditor' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                            r === 'FE' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                            'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {displayRoleName(r)}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Hub */}
                    <td className="py-3 px-4 text-slate-300 font-medium">
                      {user.facility_code || 'All Hubs'}
                    </td>

                    {/* Person ID */}
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {user.person_id || 'N/A'}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        user.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Change Role / Toggle Status / Access Link */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <select
                          value={user.role}
                          onChange={(e) => onUpdateUserRole(user.id, e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-300 cursor-pointer focus:outline-none"
                          title="Change primary role"
                        >
                          {ALL_ROLES.map(r => (
                            <option key={r} value={r}>
                              {r === 'Admin' ? 'City Admin' : r}
                            </option>
                          ))}
                        </select>
                        {onNavigate && (
                          <button
                            onClick={() => onNavigate('accessControl')}
                            className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 transition-colors cursor-pointer"
                            title="Open Access Control Panel for multi-role page permissions"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Single User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">Add New Team Member</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Corporate Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ramesh@lenskart.in"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    {ALL_ROLES.map(r => (
                      <option key={r} value={r}>{r === 'Admin' ? 'City Admin' : r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Hub / City</label>
                  <input
                    type="text"
                    value={facilityCode}
                    onChange={(e) => setFacilityCode(e.target.value)}
                    placeholder="e.g. Ahmedabad"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Person ID / Rider ID</label>
                <input
                  type="text"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  placeholder="e.g. 213812 or EMP105"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Reporting AM Email</label>
                  <input
                    type="email"
                    value={reportingManagerEmail}
                    onChange={(e) => setReportingManagerEmail(e.target.value)}
                    placeholder="am.abhay@lenskart.in"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Regional RM Email</label>
                  <input
                    type="email"
                    value={regionalManagerEmail}
                    onChange={(e) => setRegionalManagerEmail(e.target.value)}
                    placeholder="rm.west@lenskart.in"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md"
                >
                  Save User
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
