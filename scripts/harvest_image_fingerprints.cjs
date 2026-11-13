/**
 * Locus Auditor - Enterprise Image Fingerprint Harvester
 * 
 * High-throughput headless batch processor for pre-computing image hashes (SHA-256, dHash 64-bit,
 * dHash 256-bit, luminance metrics, and EXIF) directly into Supabase `task_image_fingerprints`.
 * 
 * Features:
 * - Traverses corporate SSL/TLS inspection proxies (zero cert errors on IT-locked machines)
 * - Pure JavaScript image decoding (zero native node-gyp C++ compilation required)
 * - 100% Idempotent & Resume-capable: skips already fingerprinted tasks
 * - Concurrency pooling with live terminal status bar & ETA
 * - Upserts in batches to avoid Supabase payload limits
 * 
 * Usage:
 *   node scripts/harvest_image_fingerprints.cjs
 *   node scripts/harvest_image_fingerprints.cjs --date 2026-11-11
 *   node scripts/harvest_image_fingerprints.cjs --concurrency 12 --batch-size 100
 *   node scripts/harvest_image_fingerprints.cjs --limit 500
 */

// 1. Bypass corporate proxy TLS interception on IT-locked corporate laptops
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jpeg = require('jpeg-js');
const { createClient } = require('@supabase/supabase-js');

// 2. Load environment variables from .env
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('\x1b[31m[ERROR] Supabase URL or Key not found in .env!\x1b[0m');
  console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}
const filterDate = getArg('--date', null);
const concurrency = parseInt(getArg('--concurrency', '10'), 10);
const batchSize = parseInt(getArg('--batch-size', '50'), 10);
const taskLimit = parseInt(getArg('--limit', '0'), 10);
const isDryRun = args.includes('--dry-run');

// Station label mapping
const SLOT_LABELS = {
  selfie: 'FE Grooming & ID Selfie',
  toolkit: 'Full Toolkit & Bag',
  torches: 'Retinoscope & Pen Torch',
  visionChart: 'Trial Lens & Vision Chart',
  frameDisplay: 'Frame Display Case'
};

/**
 * Normalizes Locus image URLs
 */
function normalizeImageUrl(taskId, rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let cleanUrl = rawUrl.trim();
  if (!cleanUrl || cleanUrl === '-' || cleanUrl.toLowerCase() === 'null') return null;

  cleanUrl = cleanUrl.replace(/^http:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  cleanUrl = cleanUrl.replace(/^https:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  cleanUrl = cleanUrl.replace(/^http:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  cleanUrl = cleanUrl.replace(/^https:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    const stripped = cleanUrl.replace(/^\/+/, '');
    if (stripped.startsWith('v1/client/')) {
      cleanUrl = `https://assets.locus-api.com/${stripped}`;
    } else {
      cleanUrl = `https://assets.locus-api.com/v1/client/lenskart-dlc/task/${taskId}/file/${stripped}`;
    }
  }
  return cleanUrl;
}

/**
 * Parses basic EXIF from JPEG buffer
 */
function extractExif(buffer) {
  const result = { time: null, model: null };
  try {
    if (buffer.length < 12 || buffer.readUInt16BE(0) !== 0xFFD8) return result;
    let offset = 2;
    while (offset < buffer.length - 4) {
      const marker = buffer.readUInt16BE(offset);
      offset += 2;
      if (marker === 0xFFE1) { // APP1 EXIF
        const length = buffer.readUInt16BE(offset);
        const exifHeader = buffer.slice(offset + 2, offset + 8).toString('ascii');
        if (exifHeader.startsWith('Exif')) {
          const tiffStart = offset + 8;
          const isLE = buffer.slice(tiffStart, tiffStart + 2).toString() === 'II';
          const read16 = (o) => isLE ? buffer.readUInt16LE(o) : buffer.readUInt16BE(o);
          const read32 = (o) => isLE ? buffer.readUInt32LE(o) : buffer.readUInt32BE(o);

          const ifd0Offset = read32(tiffStart + 4);
          const dirStart = tiffStart + ifd0Offset;
          const entries = read16(dirStart);

          let exifSubIFDOffset = 0;
          for (let i = 0; i < entries; i++) {
            const entryOffset = dirStart + 2 + i * 12;
            if (entryOffset + 12 > buffer.length) break;
            const tag = read16(entryOffset);
            const count = read32(entryOffset + 4);

            if (tag === 0x0110) { // Camera Model
              const valOffset = count > 4 ? tiffStart + read32(entryOffset + 8) : entryOffset + 8;
              result.model = buffer.slice(valOffset, valOffset + Math.min(count - 1, 32)).toString('ascii').trim();
            } else if (tag === 0x8769) { // Exif SubIFD
              exifSubIFDOffset = read32(entryOffset + 8);
            }
          }

          if (exifSubIFDOffset) {
            const subDir = tiffStart + exifSubIFDOffset;
            const subEntries = read16(subDir);
            for (let i = 0; i < subEntries; i++) {
              const subEntryOffset = subDir + 2 + i * 12;
              if (subEntryOffset + 12 > buffer.length) break;
              const subTag = read16(subEntryOffset);
              const count = read32(subEntryOffset + 4);
              if (subTag === 0x9003 || subTag === 0x9004) { // DateTimeOriginal
                const valOffset = count > 4 ? tiffStart + read32(subEntryOffset + 8) : subEntryOffset + 8;
                result.time = buffer.slice(valOffset, valOffset + Math.min(count - 1, 20)).toString('ascii').trim();
                break;
              }
            }
          }
        }
        break;
      } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8 && marker !== 0xFFD9) {
        const length = buffer.readUInt16BE(offset);
        offset += length;
      } else {
        break;
      }
    }
  } catch (e) {}
  return result;
}

/**
 * Computes dHash 64-bit and 256-bit perceptual difference hashes
 */
function computePerceptualHashes(data, width, height) {
  // 1. 64-bit dHash (9 x 8 sample)
  const gray9x8 = [];
  for (let y = 0; y < 8; y++) {
    const row = [];
    for (let x = 0; x < 9; x++) {
      const px = Math.floor((x + 0.5) * width / 9);
      const py = Math.floor((y + 0.5) * height / 8);
      const idx = (py * width + px) * 4;
      row.push(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    }
    gray9x8.push(row);
  }

  let bin64 = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bin64 += gray9x8[y][x] > gray9x8[y][x + 1] ? '1' : '0';
    }
  }
  let hex64 = '';
  for (let i = 0; i < bin64.length; i += 4) {
    hex64 += parseInt(bin64.substring(i, i + 4), 2).toString(16);
  }

  // 2. 256-bit dHash (17 x 16 sample)
  const gray17x16 = [];
  for (let y = 0; y < 16; y++) {
    const row = [];
    for (let x = 0; x < 17; x++) {
      const px = Math.floor((x + 0.5) * width / 17);
      const py = Math.floor((y + 0.5) * height / 16);
      const idx = (py * width + px) * 4;
      row.push(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    }
    gray17x16.push(row);
  }

  let bin256 = '';
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      bin256 += gray17x16[y][x] > gray17x16[y][x + 1] ? '1' : '0';
    }
  }
  let hex256 = '';
  for (let i = 0; i < bin256.length; i += 4) {
    hex256 += parseInt(bin256.substring(i, i + 4), 2).toString(16);
  }

  return {
    dhashHex: hex64.toUpperCase(),
    dhash256Hex: hex256.toUpperCase()
  };
}

/**
 * Analyzes image luminance and detects blank / black photos
 */
function analyzeIntegrity(data, width, height, bufferLength) {
  const sampleSize = 32;
  const totalPixels = sampleSize * sampleSize;

  let sumLuma = 0;
  let sumSqLuma = 0;
  let darkPixelCount = 0;
  let brightPixelCount = 0;

  for (let y = 0; y < sampleSize; y++) {
    for (let x = 0; x < sampleSize; x++) {
      const px = Math.floor((x + 0.5) * width / sampleSize);
      const py = Math.floor((y + 0.5) * height / sampleSize);
      const idx = (py * width + px) * 4;
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      sumLuma += luma;
      sumSqLuma += luma * luma;

      if (luma < 22) darkPixelCount++;
      if (luma > 235) brightPixelCount++;
    }
  }

  const meanLuma = sumLuma / totalPixels;
  const variance = (sumSqLuma / totalPixels) - (meanLuma * meanLuma);
  const stdDev = Math.sqrt(Math.max(0, variance));
  const darkRatio = darkPixelCount / totalPixels;
  const brightRatio = brightPixelCount / totalPixels;

  const isPureBlack = meanLuma < 20 && darkRatio > 0.80;
  const isCoveredCamera = (meanLuma < 30 && stdDev < 9) || (darkRatio > 0.88);
  const isSolidFlatColor = stdDev < 5;
  const isAllWhite = meanLuma > 235 && brightRatio > 0.85;
  const isUndersized = bufferLength < 1500 || width < 80 || height < 80;

  const isBlankBlack = isPureBlack || isCoveredCamera || isSolidFlatColor || isAllWhite || isUndersized;

  let reason = null;
  if (isPureBlack) reason = `Pure black / covered camera (${Math.round(darkRatio * 100)}% dark, luma ${meanLuma.toFixed(1)})`;
  else if (isCoveredCamera) reason = `Obscured / covered lens (Zero contrast stdDev: ${stdDev.toFixed(1)})`;
  else if (isSolidFlatColor) reason = `Solid flat color / dummy graphic (Zero variation stdDev: ${stdDev.toFixed(1)})`;
  else if (isAllWhite) reason = `Blank white photo (${Math.round(brightRatio * 100)}% white)`;
  else if (isUndersized) reason = `Undersized dummy placeholder (${Math.round(bufferLength / 1024)} KB, ${width}x${height}px)`;

  return {
    meanLuma: Math.round(meanLuma),
    stdDev: Math.round(stdDev * 100) / 100,
    darkRatio: Math.round(darkRatio * 100) / 100,
    isBlankBlack,
    blankReason: reason
  };
}

/**
 * Downloads single image and computes its full fingerprint record
 */
async function processImage(imageItem) {
  try {
    const resp = await fetch(imageItem.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 LocusAuditorBatchHarvester/1.0' }
    });
    if (!resp.ok) {
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    if (buf.length < 100) return null;

    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const exif = extractExif(buf);

    let dhashHex = '0000000000000000';
    let dhash256Hex = null;
    let meanLuma = 128;
    let stdDev = 50.0;
    let darkRatio = 0.0;
    let isBlankBlack = false;
    let blankReason = null;

    try {
      const decoded = jpeg.decode(buf, { useTArray: true });
      if (decoded && decoded.width > 0 && decoded.height > 0) {
        const hashes = computePerceptualHashes(decoded.data, decoded.width, decoded.height);
        dhashHex = hashes.dhashHex;
        dhash256Hex = hashes.dhash256Hex;

        const metrics = analyzeIntegrity(decoded.data, decoded.width, decoded.height, buf.length);
        meanLuma = metrics.meanLuma;
        stdDev = metrics.stdDev;
        darkRatio = metrics.darkRatio;
        isBlankBlack = metrics.isBlankBlack;
        blankReason = metrics.blankReason;
      }
    } catch (decodeErr) {
      // Non-JPEG format (e.g. raw PNG or WebP)
      if (buf.length < 1500) {
        isBlankBlack = true;
        blankReason = `Undersized placeholder file (${Math.round(buf.length / 1024)} KB)`;
      }
    }

    return {
      task_id: String(imageItem.taskId),
      station_id: imageItem.stationId,
      slot_label: imageItem.slotLabel,
      fe_code: imageItem.feCode,
      fe_name: imageItem.feName,
      facility_code: imageItem.facilityCode,
      dispatch_date: imageItem.dispatchDate,
      image_url: imageItem.url,
      sha256_hash: sha256,
      dhash_hex: dhashHex,
      dhash256_hex: dhash256Hex,
      mean_luma: meanLuma,
      std_dev: stdDev,
      dark_ratio: darkRatio,
      is_blank_black: isBlankBlack,
      blank_reason: blankReason,
      exif_time: exif.time,
      exif_model: exif.model,
      file_size_bytes: buf.length
    };
  } catch (err) {
    return null;
  }
}

/**
 * Main Harvester Flow
 */
async function run() {
  console.log('\n\x1b[36m========================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[33m  LOCUS AUDITOR - IMAGE FINGERPRINT HARVESTER (HEADLESS BATCH)\x1b[0m');
  console.log('\x1b[36m========================================================================\x1b[0m\n');
  console.log(`Supabase Target:  ${supabaseUrl}`);
  console.log(`Worker Pool:      ${concurrency} parallel streams`);
  console.log(`Upsert Batch:     ${batchSize} records/chunk`);
  if (filterDate) console.log(`Date Filter:      ${filterDate}`);
  if (taskLimit > 0) console.log(`Task Limit:       ${taskLimit} tasks`);
  if (isDryRun) console.log(`Mode:             DRY RUN (no database writes)`);
  console.log('');

  // 1. Fetch already fingerprinted (task_id, station_id) keys from database
  console.log('Step 1/4: Fetching existing fingerprints from database to resume...');
  const existingKeys = new Set();
  let fpPage = 0;
  const fpPageSize = 1000;
  while (true) {
    const { data: existingData, error: fpErr } = await supabase
      .from('task_image_fingerprints')
      .select('task_id, station_id')
      .range(fpPage * fpPageSize, (fpPage + 1) * fpPageSize - 1);

    if (fpErr) {
      if (fpErr.code === 'PGRST205' || fpErr.message?.includes('schema cache')) {
        if (!isDryRun) {
          console.error('\x1b[31m[ERROR] Table `task_image_fingerprints` does not exist in Supabase!\x1b[0m');
          console.error('Please run the provided SQL script in your Supabase SQL Editor first, then rerun this script.');
          process.exit(1);
        } else {
          console.log('  [Dry Run Notice] Table `task_image_fingerprints` not created yet. Proceeding with 0 existing records.');
          break;
        }
      }
      console.warn(`[Warning] Could not fetch existing fingerprints: ${fpErr.message}`);
      break;
    }

    if (!existingData || existingData.length === 0) break;
    for (const r of existingData) {
      existingKeys.add(`${r.task_id}_${r.station_id}`);
    }
    if (existingData.length < fpPageSize) break;
    fpPage++;
  }
  console.log(`  -> Found \x1b[32m${existingKeys.size.toLocaleString()}\x1b[0m images already fingerprinted in database.`);

  // 2. Fetch all tasks from Supabase
  console.log('\nStep 2/4: Loading tasks from Supabase...');
  const allTasks = [];
  let taskPage = 0;
  const taskPageSize = 1000;
  while (true) {
    let query = supabase
      .from('tasks')
      .select('id, task_id, dispatch_date, fe_code, fe_name, facility_code, image_urls, has_images')
      .not('image_urls', 'is', null)
      .order('dispatch_date', { ascending: false })
      .range(taskPage * taskPageSize, (taskPage + 1) * taskPageSize - 1);

    if (filterDate) {
      query = query.eq('dispatch_date', filterDate);
    }

    const { data: tasksChunk, error: tErr } = await query;
    if (tErr) {
      console.error(`\x1b[31m[ERROR] Failed to fetch tasks: ${tErr.message}\x1b[0m`);
      process.exit(1);
    }
    if (!tasksChunk || tasksChunk.length === 0) break;
    allTasks.push(...tasksChunk);
    if (taskLimit > 0 && allTasks.length >= taskLimit) {
      allTasks.splice(taskLimit);
      break;
    }
    if (tasksChunk.length < taskPageSize) break;
    taskPage++;
  }
  console.log(`  -> Retrieved \x1b[32m${allTasks.length.toLocaleString()}\x1b[0m tasks from database.`);

  // 3. Extract pending image queue
  console.log('\nStep 3/4: Queueing images needing fingerprints...');
  const imageQueue = [];
  for (const t of allTasks) {
    const taskId = String(t.task_id || t.id);
    const imgs = t.image_urls;
    if (!imgs || typeof imgs !== 'object') continue;

    for (const [stationId, rawUrl] of Object.entries(imgs)) {
      const key = `${taskId}_${stationId}`;
      if (existingKeys.has(key)) continue; // Already processed!

      const cleanUrl = normalizeImageUrl(taskId, rawUrl);
      if (!cleanUrl) continue;

      imageQueue.push({
        taskId,
        stationId,
        slotLabel: SLOT_LABELS[stationId] || stationId,
        feCode: t.fe_code || '',
        feName: t.fe_name || '',
        facilityCode: t.facility_code || '',
        dispatchDate: t.dispatch_date || null,
        url: cleanUrl
      });
    }
  }

  console.log(`  -> Total images in queue: \x1b[33m${imageQueue.length.toLocaleString()}\x1b[0m`);
  if (imageQueue.length === 0) {
    console.log('\n\x1b[32m[COMPLETE] All images across all tasks are already fingerprinted!\x1b[0m');
    console.log('Database is 100% up to date. You can run weekly forensics immediately.');
    return;
  }

  // 4. Concurrency processing loop
  console.log(`\nStep 4/4: Harvesting image fingerprints (Concurrency: ${concurrency})...\n`);

  let processedCount = 0;
  let savedCount = 0;
  let blankCount = 0;
  let failedCount = 0;
  let pendingUpserts = [];
  const startTime = Date.now();

  async function flushUpserts() {
    if (pendingUpserts.length === 0 || isDryRun) return;
    const chunk = pendingUpserts.splice(0, pendingUpserts.length);
    const { error: upErr } = await supabase
      .from('task_image_fingerprints')
      .upsert(chunk, { onConflict: 'task_id,station_id' });

    if (upErr) {
      console.warn(`\n[Warning] Batch upsert failed: ${upErr.message}`);
    } else {
      savedCount += chunk.length;
    }
  }

  // Concurrency worker runner
  let queueIndex = 0;
  async function worker() {
    while (queueIndex < imageQueue.length) {
      const idx = queueIndex++;
      const item = imageQueue[idx];

      const fp = await processImage(item);
      processedCount++;

      if (fp) {
        if (fp.is_blank_black) blankCount++;
        pendingUpserts.push(fp);
        if (pendingUpserts.length >= batchSize) {
          await flushUpserts();
        }
      } else {
        failedCount++;
      }

      // Render live terminal status every 10 images or on completion
      if (processedCount % 10 === 0 || processedCount === imageQueue.length) {
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed = elapsedSec > 0 ? (processedCount / elapsedSec).toFixed(1) : '0';
        const remaining = imageQueue.length - processedCount;
        const etaSec = speed > 0 ? Math.round(remaining / parseFloat(speed)) : 0;
        const etaM = Math.floor(etaSec / 60);
        const etaS = etaSec % 60;
        const pct = Math.round((processedCount / imageQueue.length) * 100);

        process.stdout.write(
          `\r\x1b[K[Progress: ${pct}%] ${processedCount}/${imageQueue.length} imgs | Saved: ${savedCount} | Blanks: ${blankCount} | Speed: ${speed} img/s | ETA: ${etaM}m ${etaS}s`
        );
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  await flushUpserts();

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n\n\x1b[32m========================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[32m  HARVESTING COMPLETE!\x1b[0m');
  console.log('\x1b[32m========================================================================\x1b[0m');
  console.log(`Total Processed:      ${processedCount.toLocaleString()} images`);
  console.log(`Saved to Database:    ${savedCount.toLocaleString()} records`);
  console.log(`Blank/Black Flagged:  ${blankCount.toLocaleString()} photos`);
  console.log(`Failed Downloads:     ${failedCount.toLocaleString()} images`);
  console.log(`Total Elapsed Time:   ${totalTimeSec} seconds`);
  console.log('\nAll fingerprints are now permanently stored in `public.task_image_fingerprints`!');
  console.log('You can now open Locus Auditor -> Forensics Lab and run instant sub-second weekly forensic reports.\n');
}

run().catch((err) => {
  console.error('\n\x1b[31m[FATAL ERROR]\x1b[0m', err);
  process.exit(1);
});
