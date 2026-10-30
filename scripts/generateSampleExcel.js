import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import sample data
import { RAW_SAMPLE_DATA } from '../src/data/sampleData.js';

const worksheet = XLSX.utils.json_to_sheet(RAW_SAMPLE_DATA);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Locus_Dispatch_Export');

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const outPath = path.join(publicDir, 'sample_locus_tasks.xlsx');
XLSX.writeFile(workbook, outPath);
console.log('Sample Excel file written to:', outPath);
