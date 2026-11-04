/**
 * Image Forensics & Deduplication Engine
 * 
 * Provides:
 * 1. Cryptographic SHA-256 Byte Fingerprinting (100% exact bit match)
 * 2. Perceptual Difference Hashing (dHash 64-bit) for visual clone & screenshot detection
 *    (resilient to re-compression, minor cropping, format changes, and brightness shifts)
 * 3. EXIF Metadata Extraction (DateTimeOriginal, Camera Make/Model, Software, GPS)
 * 4. Automated Batch Scanning across all field tasks with CORS proxy fallback
 * 5. Cluster & Collusion Detection (Identical Files, Resized/Cropped Clones, Stale Photos)
 */

// In-memory cache for downloaded buffers to avoid duplicate network roundtrips
const bufferCache = new Map();

/**
 * Universal Image Fetcher with CORS Proxy Fallback
 * @param {string} url 
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchImageBuffer(url) {
  if (!url || typeof url !== 'string') throw new Error('Invalid image URL');

  if (bufferCache.has(url)) {
    return bufferCache.get(url);
  }

  // 1. Try direct fetch first
  try {
    const directResp = await fetch(url, { mode: 'cors' });
    if (directResp.ok) {
      const buf = await directResp.arrayBuffer();
      bufferCache.set(url, buf);
      return buf;
    }
  } catch (directErr) {
    // CORS or network error, proceed to proxy fallback
  }

  // 2. Fallback to serverless image proxy
  try {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
    const proxyResp = await fetch(proxyUrl);
    if (!proxyResp.ok) {
      throw new Error(`Proxy returned HTTP ${proxyResp.status} ${proxyResp.statusText}`);
    }
    const buf = await proxyResp.arrayBuffer();
    bufferCache.set(url, buf);
    return buf;
  } catch (proxyErr) {
    throw new Error(`Failed to load image from both direct & proxy endpoints: ${proxyErr.message}`);
  }
}

/**
 * Computes SHA-256 hash of an ArrayBuffer using Web Crypto API
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} Hexadecimal SHA-256 hash
 */
export async function computeSHA256(buffer) {
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.error('SHA-256 computation failed:', err);
    return null;
  }
}

/**
 * Computes 64-bit Perceptual Difference Hash (dHash) from an image element or canvas
 * Algorithm:
 * 1. Downsample image to 9x8 pixels
 * 2. Convert to grayscale luminance
 * 3. Compare adjacent horizontal pixels (P[x] > P[x+1] -> 1 else 0)
 * 4. Yields 8 rows * 8 comparisons = 64-bit binary fingerprint
 * 
 * @param {HTMLImageElement|ImageBitmap} img
 * @returns {{ hashHex: string, hashBinary: string, grid: number[][] }}
 */
export function computeDHash(img) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, 9, 8);
    const imgData = ctx.getImageData(0, 0, 9, 8).data;

    const gray = [];
    for (let y = 0; y < 8; y++) {
      const row = [];
      for (let x = 0; x < 9; x++) {
        const idx = (y * 9 + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        row.push(luma);
      }
      gray.push(row);
    }

    let binary = '';
    const diffGrid = [];
    for (let y = 0; y < 8; y++) {
      const diffRow = [];
      for (let x = 0; x < 8; x++) {
        const bit = gray[y][x] > gray[y][x + 1] ? '1' : '0';
        binary += bit;
        diffRow.push(bit === '1' ? 255 : 40);
      }
      diffGrid.push(diffRow);
    }

    let hex = '';
    for (let i = 0; i < binary.length; i += 4) {
      const nibble = binary.substring(i, i + 4);
      hex += parseInt(nibble, 2).toString(16);
    }

    return {
      hashHex: hex.toUpperCase(),
      hashBinary: binary,
      grid: diffGrid
    };
  } catch (err) {
    console.error('dHash computation failed:', err);
    return null;
  }
}

/**
 * Computes Hamming Distance (number of differing bits) between two 64-bit binary strings or hex hashes
 * @param {string} hashA (64-bit binary or 16-char hex)
 * @param {string} hashB (64-bit binary or 16-char hex)
 * @returns {number} Distance in range 0..64
 */
export function calculateHammingDistance(hashA, hashB) {
  if (!hashA || !hashB) return 64;

  let binA = hashA;
  let binB = hashB;

  if (binA.length === 16 && !binA.includes(' ')) {
    binA = Array.from(binA).map(h => parseInt(h, 16).toString(2).padStart(4, '0')).join('');
  }
  if (binB.length === 16 && !binB.includes(' ')) {
    binB = Array.from(binB).map(h => parseInt(h, 16).toString(2).padStart(4, '0')).join('');
  }

  const len = Math.min(binA.length, binB.length);
  let distance = 0;
  for (let i = 0; i < len; i++) {
    if (binA[i] !== binB[i]) {
      distance++;
    }
  }
  distance += Math.abs(binA.length - binB.length);
  return distance;
}

/**
 * Extracts standard EXIF metadata from a JPEG ArrayBuffer (Make, Model, DateTimeOriginal, Software, GPS)
 * @param {ArrayBuffer} buffer
 * @returns {object} Extracted metadata
 */
export function extractExifMetadata(buffer) {
  const result = {
    hasExif: false,
    make: null,
    model: null,
    dateTimeOriginal: null,
    dateTimeDigitized: null,
    software: null,
    orientation: null,
    gps: null,
    jfif: false
  };

  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4) return result;

    if (view.getUint16(0) !== 0xFFD8) {
      return result; // Not a standard JPEG
    }

    let offset = 2;
    while (offset < view.byteLength - 2) {
      const marker = view.getUint16(offset);
      offset += 2;

      if (marker === 0xFFE0) {
        result.jfif = true;
        const length = view.getUint16(offset);
        offset += length;
        continue;
      }

      if (marker === 0xFFE1) {
        result.hasExif = true;
        const length = view.getUint16(offset);
        const exifHeader = String.fromCharCode(
          view.getUint8(offset + 2),
          view.getUint8(offset + 3),
          view.getUint8(offset + 4),
          view.getUint8(offset + 5)
        );

        if (exifHeader === 'Exif') {
          parseTiff(view, offset + 8, result);
        }
        offset += length;
        continue;
      }

      if (marker === 0xFFDA || marker === 0xFFD9) {
        break;
      }

      if ((marker & 0xFF00) === 0xFF00) {
        const length = view.getUint16(offset);
        offset += length;
      } else {
        offset++;
      }
    }
  } catch (err) {
    // Graceful stop
  }

  return result;
}

function parseTiff(view, tiffStart, result) {
  try {
    const endianness = view.getUint16(tiffStart);
    const littleEndian = endianness === 0x4949;

    const fortyTwo = view.getUint16(tiffStart + 2, littleEndian);
    if (fortyTwo !== 0x002A) return;

    const firstIFDOffset = view.getUint32(tiffStart + 4, littleEndian);
    if (firstIFDOffset < 8) return;

    readIFD(view, tiffStart, tiffStart + firstIFDOffset, littleEndian, result);
  } catch (e) {}
}

function readIFD(view, tiffStart, dirStart, littleEndian, result) {
  try {
    if (dirStart + 2 > view.byteLength) return;
    const entries = view.getUint16(dirStart, littleEndian);
    let exifSubIFDOffset = null;
    let gpsSubIFDOffset = null;

    for (let i = 0; i < entries; i++) {
      const entryOffset = dirStart + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) break;

      const tag = view.getUint16(entryOffset, littleEndian);
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);

      const getVal = () => {
        if (type === 2) {
          const valOffset = count > 4 ? tiffStart + view.getUint32(entryOffset + 8, littleEndian) : entryOffset + 8;
          let str = '';
          for (let c = 0; c < count - 1; c++) {
            if (valOffset + c < view.byteLength) {
              const char = view.getUint8(valOffset + c);
              if (char === 0) break;
              str += String.fromCharCode(char);
            }
          }
          return str.trim();
        }
        if (type === 3) return view.getUint16(entryOffset + 8, littleEndian);
        if (type === 4) return view.getUint32(entryOffset + 8, littleEndian);
        return null;
      };

      if (tag === 0x010F) result.make = getVal();
      else if (tag === 0x0110) result.model = getVal();
      else if (tag === 0x0131) result.software = getVal();
      else if (tag === 0x0132) result.dateTimeOriginal = getVal();
      else if (tag === 0x0112) result.orientation = getVal();
      else if (tag === 0x8769) exifSubIFDOffset = view.getUint32(entryOffset + 8, littleEndian);
      else if (tag === 0x8825) gpsSubIFDOffset = view.getUint32(entryOffset + 8, littleEndian);
    }

    if (exifSubIFDOffset) {
      const subEntries = view.getUint16(tiffStart + exifSubIFDOffset, littleEndian);
      for (let i = 0; i < subEntries; i++) {
        const subOffset = tiffStart + exifSubIFDOffset + 2 + i * 12;
        if (subOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(subOffset, littleEndian);
        const count = view.getUint32(subOffset + 4, littleEndian);

        if (tag === 0x9003 || tag === 0x9004) {
          const valOffset = count > 4 ? tiffStart + view.getUint32(subOffset + 8, littleEndian) : subOffset + 8;
          let str = '';
          for (let c = 0; c < count - 1; c++) {
            if (valOffset + c < view.byteLength) {
              str += String.fromCharCode(view.getUint8(valOffset + c));
            }
          }
          if (tag === 0x9003) result.dateTimeOriginal = str.trim();
          if (tag === 0x9004) result.dateTimeDigitized = str.trim();
        }
      }
    }

    if (gpsSubIFDOffset) {
      result.gps = 'GPS Coordinates present';
    }
  } catch (e) {}
}

/**
 * Evaluates pairwise forensic relationship between two analyzed images
 * @param {object} imgA Analyzed image result
 * @param {object} imgB Analyzed image result
 * @returns {object} Detailed verdict & similarity
 */
export function evaluatePairwiseForensics(imgA, imgB) {
  if (!imgA || !imgB || !imgA.dHash || !imgB.dHash) {
    return {
      status: 'PENDING',
      similarityPct: 0,
      hammingDistance: 64,
      verdict: 'Incomplete inspection data',
      color: 'slate',
      isExactByteDuplicate: false,
      isPerceptualDuplicate: false
    };
  }

  const isExactByteDuplicate = Boolean(imgA.sha256 && imgB.sha256 && imgA.sha256 === imgB.sha256);
  const hammingDistance = calculateHammingDistance(imgA.dHash.hashBinary, imgB.dHash.hashBinary);
  const similarityPct = Math.max(0, Math.min(100, Math.round(((64 - hammingDistance) / 64) * 100)));

  if (isExactByteDuplicate) {
    return {
      status: 'EXACT_DUPLICATE',
      similarityPct: 100,
      hammingDistance: 0,
      verdict: '🚨 100% Exact Bit Duplicate',
      recommendation: 'FATAL STRIKE: Zero doubt. Identical file submitted across visits.',
      color: 'rose',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      isExactByteDuplicate: true,
      isPerceptualDuplicate: true
    };
  }

  if (hammingDistance <= 2) {
    return {
      status: 'PERCEPTUAL_CLONE',
      similarityPct,
      hammingDistance,
      verdict: '🚨 Visual Clone (Resized / Screenshot)',
      recommendation: 'FATAL STRIKE: Same photograph was cropped, screenshotted, or re-compressed.',
      color: 'red',
      badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
      isExactByteDuplicate: false,
      isPerceptualDuplicate: true
    };
  }

  if (hammingDistance <= 5) {
    return {
      status: 'HIGH_SIMILARITY',
      similarityPct,
      hammingDistance,
      verdict: '⚠️ High Probability Reuse / Same Framing',
      recommendation: 'FLAG FOR REVIEW: Extremely close angle/lighting. High likelihood of duplicate staging.',
      color: 'amber',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      isExactByteDuplicate: false,
      isPerceptualDuplicate: true
    };
  }

  if (hammingDistance <= 10) {
    return {
      status: 'MODERATE_SIMILARITY',
      similarityPct,
      hammingDistance,
      verdict: '🔍 Moderate Staging Similarity',
      recommendation: 'ACCEPTABLE VARIANT: Common equipment setup, but distinct photo capture.',
      color: 'yellow',
      badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
      isExactByteDuplicate: false,
      isPerceptualDuplicate: false
    };
  }

  return {
    status: 'DISTINCT_AUTHENTIC',
    similarityPct,
    hammingDistance,
    verdict: '✅ Distinct Authentic Photo',
    recommendation: 'PASSED: Verified unique image. Zero visual or cryptographic overlap.',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    isExactByteDuplicate: false,
    isPerceptualDuplicate: false
  };
}

/**
 * Fully inspects a single image item
 * @param {object} item 
 * @returns {Promise<object>}
 */
export async function inspectSingleImage(item) {
  const startTime = performance.now();
  const buffer = await fetchImageBuffer(item.url);
  const sha256 = await computeSHA256(buffer);
  const exif = extractExifMetadata(buffer);

  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const objectUrl = URL.createObjectURL(blob);

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to render canvas for image'));
    img.src = objectUrl;
  });

  const dHash = computeDHash(img);
  const durationMs = Math.round(performance.now() - startTime);

  return {
    ...item,
    fileSize: buffer.byteLength,
    width: img.naturalWidth,
    height: img.naturalHeight,
    sha256,
    dHash,
    exif,
    objectUrl,
    durationMs
  };
}

/**
 * Extracts all valid image items from a list of tasks
 * @param {Array} tasks
 * @returns {Array<object>}
 */
export function extractTaskImageItems(tasks = []) {
  const items = [];
  const knownKeys = ['selfie', 'toolkit', 'torches', 'visionChart', 'frameDisplay'];

  for (const t of tasks) {
    const taskId = String(t.id || t.taskId);
    const feName = t.feName || t.fe_name || 'Unassigned';
    const feCode = t.feCode || t.fe_code || '';
    const feEmail = t.feEmail || t.fe_email || '';
    const city = t.city || t.facilityCode || t.facility_code || t.teamName || '';
    const date = t.date || t.dispatch_date || '';
    const imgs = t.images || t.image_urls || {};

    if (imgs && typeof imgs === 'object') {
      for (const [key, rawUrl] of Object.entries(imgs)) {
        if (rawUrl && typeof rawUrl === 'string' && rawUrl.trim().startsWith('http')) {
          items.push({
            id: `${taskId}_${key}`,
            taskId,
            task: t,
            feName,
            feCode,
            feEmail,
            city,
            date,
            slotName: key,
            slotLabel: formatSlotLabel(key),
            url: rawUrl.trim()
          });
        }
      }
    }
  }

  return items;
}

function formatSlotLabel(key) {
  const map = {
    selfie: 'FE Grooming & ID Selfie',
    toolkit: 'Full Toolkit & Bag',
    torches: 'Retinoscope & Pen Torch',
    visionChart: 'Trial Lens & Vision Chart',
    frameDisplay: 'Frame Display Case'
  };
  return map[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Runs automated batch forensic scan across all task image items
 * Detects:
 * 1. Exact SHA-256 Byte Duplicates (Same file submitted to multiple tasks)
 * 2. Perceptual dHash Clones (Hamming Distance <= 4, e.g. screenshot or cropped reuse)
 * 3. Stale Photos (EXIF capture timestamp is older than visit dispatch date)
 * 4. Cross-FE Collusion (Different FEs sharing identical or cloned equipment photos)
 * 
 * @param {Array} imageItems Array from extractTaskImageItems
 * @param {Function} onProgress Callback ({ current, total, item, foundCount })
 * @param {object} abortSignal Optional AbortController signal
 * @returns {Promise<object>} Complete forensic cluster report
 */
export async function runBatchForensicScan(imageItems, onProgress, abortSignal = null) {
  const total = imageItems.length;
  const inspectedItems = [];
  const errors = [];

  // 1. Process images with concurrency pool of 4
  const concurrency = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < total) {
      if (abortSignal?.aborted) break;
      const index = cursor++;
      const item = imageItems[index];

      try {
        const inspected = await inspectSingleImage(item);
        inspectedItems.push(inspected);
      } catch (err) {
        errors.push({ item, error: err.message });
      }

      if (onProgress) {
        onProgress({
          current: Math.min(cursor, total),
          total,
          item,
          inspectedCount: inspectedItems.length,
          errorCount: errors.length
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  // 2. Identify Exact Cryptographic Duplicates (SHA-256 Clusters)
  const shaMap = new Map();
  for (const item of inspectedItems) {
    if (!item.sha256) continue;
    if (!shaMap.has(item.sha256)) shaMap.set(item.sha256, []);
    shaMap.get(item.sha256).push(item);
  }

  const exactClusters = [];
  for (const [sha256, group] of shaMap.entries()) {
    // Only flag if used across different tasks
    const uniqueTasks = new Set(group.map(g => g.taskId));
    if (uniqueTasks.size > 1) {
      const feCodes = Array.from(new Set(group.map(g => g.feCode)));
      exactClusters.push({
        id: `exact_${sha256.substring(0, 10)}`,
        type: 'EXACT_BYTE_DUPLICATE',
        title: '100% Bit-for-Bit Duplicate File Uploaded',
        severity: 'CRITICAL',
        sha256,
        items: group,
        taskCount: uniqueTasks.size,
        feCount: feCodes.length,
        isCrossFE: feCodes.length > 1,
        recommendation: 'FATAL: Re-uploaded identical file across tasks. Zero doubt fraud.'
      });
    }
  }

  // 3. Identify Perceptual Visual Clones & Resized/Cropped Photos (dHash Clustering)
  // We compare photos within the same category/slotName or cross-task to catch visual reuse
  const perceptualPairs = [];
  const evaluatedPairs = new Set();

  for (let i = 0; i < inspectedItems.length; i++) {
    for (let j = i + 1; j < inspectedItems.length; j++) {
      const a = inspectedItems[i];
      const b = inspectedItems[j];

      // Skip comparing an image to itself or within the same task
      if (a.taskId === b.taskId) continue;

      // Skip if already flagged as exact bit duplicate
      if (a.sha256 && b.sha256 && a.sha256 === b.sha256) continue;

      const pairKey = [a.id, b.id].sort().join('___');
      if (evaluatedPairs.has(pairKey)) continue;
      evaluatedPairs.add(pairKey);

      // Compare visual difference
      const dist = calculateHammingDistance(a.dHash.hashBinary, b.dHash.hashBinary);

      // Hamming <= 4 means >= 93.75% identical visual structure (screenshot, re-compression, crop)
      if (dist <= 4) {
        const similarityPct = Math.round(((64 - dist) / 64) * 100);
        const isCrossFE = a.feCode !== b.feCode;

        perceptualPairs.push({
          id: `perc_${pairKey}`,
          type: 'PERCEPTUAL_CLONE',
          title: dist <= 2 
            ? 'Resized / Screenshotted Visual Clone' 
            : 'Re-framed / High Similarity Equipment Reuse',
          severity: dist <= 2 ? 'HIGH' : 'MEDIUM',
          similarityPct,
          hammingDistance: dist,
          itemA: a,
          itemB: b,
          isCrossFE,
          recommendation: isCrossFE 
            ? 'FATAL / COLLUSION: Different FEs sharing identical equipment photo.' 
            : 'FATAL: FE recycled old equipment photo by re-saving or cropping.'
        });
      }
    }
  }

  // 4. Identify Stale / Historical Photos via EXIF Date Mismatch
  const stalePhotoAlerts = [];
  for (const item of inspectedItems) {
    if (item.exif?.dateTimeOriginal && item.date) {
      try {
        // Parse EXIF date "YYYY:MM:DD HH:MM:SS"
        const parts = item.exif.dateTimeOriginal.split(' ')[0].split(':');
        if (parts.length === 3) {
          const exifYMD = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          
          // Parse Task date (supports DD/MM/YYYY or YYYY-MM-DD)
          let taskYMD = null;
          if (item.date.includes('/')) {
            const dp = item.date.split(' ')[0].split('/');
            if (dp.length === 3) taskYMD = `${dp[2]}-${dp[1].padStart(2, '0')}-${dp[0].padStart(2, '0')}`;
          } else if (item.date.includes('-')) {
            taskYMD = item.date.split(' ')[0];
          }

          if (taskYMD && exifYMD !== taskYMD) {
            stalePhotoAlerts.push({
              id: `stale_${item.id}`,
              type: 'STALE_PHOTO_DATE_MISMATCH',
              title: 'Historical Photo Captured on Different Day',
              severity: 'MEDIUM',
              item,
              exifDate: item.exif.dateTimeOriginal,
              taskDate: item.date,
              cameraModel: item.exif.model || 'Unknown Device',
              recommendation: `WARNING: Camera captured on ${exifYMD}, but visit was on ${taskYMD}. Photo was taken beforehand.`
            });
          }
        }
      } catch (e) {}
    }
  }

  // Gather Summary Metrics
  const affectedTasks = new Set();
  const affectedFEs = new Set();

  exactClusters.forEach(c => {
    c.items.forEach(it => {
      affectedTasks.add(it.taskId);
      if (it.feCode) affectedFEs.add(it.feCode);
    });
  });

  perceptualPairs.forEach(p => {
    affectedTasks.add(p.itemA.taskId);
    affectedTasks.add(p.itemB.taskId);
    if (p.itemA.feCode) affectedFEs.add(p.itemA.feCode);
    if (p.itemB.feCode) affectedFEs.add(p.itemB.feCode);
  });

  stalePhotoAlerts.forEach(s => {
    affectedTasks.add(s.item.taskId);
    if (s.item.feCode) affectedFEs.add(s.item.feCode);
  });

  return {
    scannedCount: inspectedItems.length,
    totalImages: total,
    errors,
    exactClusters,
    perceptualPairs,
    stalePhotoAlerts,
    summary: {
      totalViolations: exactClusters.length + perceptualPairs.length + stalePhotoAlerts.length,
      affectedTaskCount: affectedTasks.size,
      affectedFeCount: affectedFEs.size,
      affectedTaskIds: Array.from(affectedTasks),
      affectedFeCodes: Array.from(affectedFEs)
    }
  };
}
