// ====================================================================
// CLI User Seeder for Supabase
// Usage: node scripts/seed_users.js [path-to-excel-file]
// ====================================================================

import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Parse .env manually
let rawUrl = '';
let supabaseAnonKey = '';
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (key === 'VITE_SUPABASE_URL') rawUrl = val;
      if (key === 'VITE_SUPABASE_ANON_KEY') supabaseAnonKey = val;
    }
  });
}

const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

if (!cleanUrl || !supabaseAnonKey) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured in .env');
  process.exit(1);
}

const supabase = createClient(cleanUrl, supabaseAnonKey);

const filePath = process.argv[2] || 'Lenskart_User_Seeder_Template.xlsx';

if (!fs.existsSync(filePath)) {
  console.log(`File not found: ${filePath}`);
  console.log('Generating sample template: Lenskart_User_Seeder_Template.xlsx ...');
  
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

  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Users");
  XLSX.writeFile(wb, 'Lenskart_User_Seeder_Template.xlsx');
  console.log('Template created: Lenskart_User_Seeder_Template.xlsx');
  console.log('Fill in your users and rerun: node scripts/seed_users.js Lenskart_User_Seeder_Template.xlsx');
  process.exit(0);
}

console.log(`Reading users from: ${filePath}`);
const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

console.log(`Found ${rows.length} rows to seed into Supabase...`);

async function seedUsers() {
  let successCount = 0;
  const processedRows = [];

  console.log('\n--- Pass 1: Creating Users & Profiles in Supabase ---');

  for (const row of rows) {
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

    const employeeCode = findVal(['employee_code', 'employeecode', 'employee code', 'person code', 'person id', 'rider id']);
    const facilityCode = findVal(['facility_code', 'facilitycode', 'facility code', 'hub']) || 'Ahmedabad';
    const fullName = findVal(['name', 'full name', 'employee name']) || '';
    const rawRole = findVal(['role', 'user role', 'designation']) || 'Auditor';
    const mobile = findVal(['mobile', 'phone', 'phone no', 'contact']);
    const email = findVal(['email', 'users email', 'user email', 'mail']).toLowerCase();
    const amName = findVal(['am', 'area manager', 'reporting manager', 'reporting_manager']);
    const rmName = findVal(['rm', 'regional manager', 'regional_manager']);
    const isActiveRaw = findVal(['is_active', 'isactive', 'is active', 'status', 'active']);
    const city = findVal(['city']) || facilityCode || 'Ahmedabad';
    const zone = findVal(['zone']) || 'Ahmedabad_Zone1';
    const password = findVal(['password', 'pass']) || 'Lenskart@2026';
    
    // Multi-role support (e.g. "SuperAdmin, Auditor, Admin")
    const parsedRoles = rawRole
      ? rawRole.split(/[,/|]/).map(r => r.trim()).filter(Boolean)
      : ['Auditor'];
    const validRoles = ['SuperAdmin', 'Admin', 'BH', 'GM', 'RM', 'AM', 'Central Ops', 'Auditor', 'FE'];
    const matchedRoles = parsedRoles
      .map(pr => validRoles.find(r => r.toLowerCase() === pr.toLowerCase()))
      .filter(Boolean);
    const finalRoles = matchedRoles.length > 0 ? matchedRoles : ['Auditor'];
    const role = finalRoles[0];

    const isActive = isActiveRaw !== '' 
      ? !['false', '0', 'no', 'inactive'].includes(isActiveRaw.toLowerCase())
      : true;

    if (!email) continue;

    try {
      // 1. Create or register user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            facility_code: facilityCode,
            person_id: employeeCode
          }
        }
      });

      if (authError && !authError.message.includes('already registered')) {
        console.warn(`Auth signup for ${email}:`, authError.message);
      }

      const userId = authData?.user?.id;

      // 2. Ensure profile exists in public.profiles with manager hierarchy
      if (userId) {
        await supabase.from('profiles').upsert({
          id: userId,
          email,
          full_name: fullName,
          role,
          roles: finalRoles,
          facility_code: facilityCode,
          person_id: employeeCode,
          employee_code: employeeCode,
          city,
          zone,
          phone: mobile,
          reporting_manager_name: amName,
          regional_manager_name: rmName,
          reporting_manager_email: amName.includes('@') ? amName : '',
          regional_manager_email: rmName.includes('@') ? rmName : '',
          is_active: isActive,
          updated_at: new Date().toISOString()
        });

        processedRows.push({
          userId,
          email,
          fullName,
          amName,
          rmName
        });
      }

      successCount++;
      console.log(`✓ Seeded ${fullName} (${finalRoles.join(', ')} • ${city} | AM: ${amName || '-'} | RM: ${rmName || '-'})`);
    } catch (e) {
      console.warn(`Error seeding ${email}:`, e.message);
    }
  }

  // Pass 2: Establish Relational UUID Foreign Keys for AM and RM
  console.log('\n--- Pass 2: Linking Relational Foreign Keys (UUID) for AM & RM ---');
  try {
    const { data: allProfiles, error: fetchErr } = await supabase.from('profiles').select('id, full_name, email, person_id');
    if (!fetchErr && allProfiles && allProfiles.length > 0) {
      for (const item of processedRows) {
        let amMatch = null;
        let rmMatch = null;

        if (item.amName) {
          const t = item.amName.toLowerCase().trim();
          amMatch = allProfiles.find(p => 
            p.full_name?.toLowerCase().trim() === t ||
            p.email?.toLowerCase().trim() === t ||
            p.person_id?.toLowerCase().trim() === t
          );
        }

        if (item.rmName) {
          const t = item.rmName.toLowerCase().trim();
          rmMatch = allProfiles.find(p => 
            p.full_name?.toLowerCase().trim() === t ||
            p.email?.toLowerCase().trim() === t ||
            p.person_id?.toLowerCase().trim() === t
          );
        }

        if (amMatch || rmMatch) {
          const updatePayload = {};
          if (amMatch) {
            updatePayload.reporting_manager_id = amMatch.id;
            updatePayload.reporting_manager_name = amMatch.full_name;
            updatePayload.reporting_manager_email = amMatch.email;
          }
          if (rmMatch) {
            updatePayload.regional_manager_id = rmMatch.id;
            updatePayload.regional_manager_name = rmMatch.full_name;
            updatePayload.regional_manager_email = rmMatch.email;
          }

          await supabase.from('profiles').update(updatePayload).eq('id', item.userId);
          console.log(`🔗 Linked ${item.fullName} -> AM UUID: ${amMatch ? amMatch.id.slice(0, 8) + '... (' + amMatch.full_name + ')' : '-'} | RM UUID: ${rmMatch ? rmMatch.id.slice(0, 8) + '... (' + rmMatch.full_name + ')' : '-'}`);
        }
      }
    }
  } catch (linkErr) {
    console.warn('Manager UUID linking note:', linkErr.message);
  }

  console.log(`\nComplete! Successfully processed and linked ${successCount} / ${rows.length} users into Supabase.`);
}

seedUsers();
