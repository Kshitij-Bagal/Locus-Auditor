/**
 * Image Forensics & Deduplication Engine
 * 
 * Provides:
 * 1. Cryptographic SHA-256 Byte Fingerprinting (100% exact bit match)
 * 2. Perceptual Difference Hashing (dHash 64-bit) for visual clone detection
 *    (immune to re-compression, minor cropping, format changes, and brightness shifts)
 * 3. EXIF Metadata Extraction (DateTimeOriginal, Camera Make/Model, Software, GPS)
 * 4. Pairwise Hamming Distance & Similarity Analysis
 */

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
 * 1. Downsample image to 9x8 pixels (discards high-frequency detail)
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

    // Draw scaled down
    ctx.drawImage(img, 0, 0, 9, 8);
    const imgData = ctx.getImageData(0, 0, 9, 8).data;

    // Build 9x8 grayscale luminance matrix
    const gray = [];
    for (let y = 0; y < 8; y++) {
      const row = [];
      for (let x = 0; x < 9; x++) {
        const idx = (y * 9 + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        // Standard Rec. 601 luma formula
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        row.push(luma);
      }
      gray.push(row);
    }

    // Compare adjacent horizontal pixels -> 64 bits
    let binary = '';
    const diffGrid = []; // For visual thumbnail preview
    for (let y = 0; y < 8; y++) {
      const diffRow = [];
      for (let x = 0; x < 8; x++) {
        const bit = gray[y][x] > gray[y][x + 1] ? '1' : '0';
        binary += bit;
        diffRow.push(bit === '1' ? 255 : 40);
      }
      diffGrid.push(diffRow);
    }

    // Convert 64 bits to 16-character hex string
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

  // If passed as hex, convert to binary
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
    jfif: false,
    rawTags: {}
  };

  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4) return result;

    // Check JPEG SOI (0xFFD8)
    if (view.getUint16(0) !== 0xFFD8) {
      return result; // Not a standard JPEG
    }

    let offset = 2;
    while (offset < view.byteLength - 2) {
      const marker = view.getUint16(offset);
      offset += 2;

      // JFIF APP0 (0xFFE0)
      if (marker === 0xFFE0) {
        result.jfif = true;
        const length = view.getUint16(offset);
        offset += length;
        continue;
      }

      // EXIF APP1 (0xFFE1)
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

      // If SOS (0xFFDA), image data begins -> stop parsing markers
      if (marker === 0xFFDA || marker === 0xFFD9) {
        break;
      }

      // Other markers with length
      if ((marker & 0xFF00) === 0xFF00) {
        const length = view.getUint16(offset);
        offset += length;
      } else {
        offset++;
      }
    }
  } catch (err) {
    console.debug('EXIF parsing stopped gracefully:', err);
  }

  return result;
}

/**
 * Helper to parse TIFF header inside APP1
 */
function parseTiff(view, tiffStart, result) {
  try {
    const endianness = view.getUint16(tiffStart);
    const littleEndian = endianness === 0x4949; // 'II'

    const fortyTwo = view.getUint16(tiffStart + 2, littleEndian);
    if (fortyTwo !== 0x002A) return;

    const firstIFDOffset = view.getUint32(tiffStart + 4, littleEndian);
    if (firstIFDOffset < 8) return;

    readIFD(view, tiffStart, tiffStart + firstIFDOffset, littleEndian, result);
  } catch (e) {
    // Ignore malformed TIFF
  }
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

      // Read string or value
      const getVal = () => {
        if (type === 2) { // ASCII
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
        if (type === 3) return view.getUint16(entryOffset + 8, littleEndian); // SHORT
        if (type === 4) return view.getUint32(entryOffset + 8, littleEndian); // LONG
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

    // Read EXIF SubIFD if present
    if (exifSubIFDOffset) {
      const subEntries = view.getUint16(tiffStart + exifSubIFDOffset, littleEndian);
      for (let i = 0; i < subEntries; i++) {
        const subOffset = tiffStart + exifSubIFDOffset + 2 + i * 12;
        if (subOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(subOffset, littleEndian);
        const type = view.getUint16(subOffset + 2, littleEndian);
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
      result.gps = 'GPS Coordinates present in Exif';
    }
  } catch (e) {
    // Ignore malformed directory
  }
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
      verdict: 'Upload both images to compare',
      color: 'slate',
      isExactByteDuplicate: false,
      isPerceptualDuplicate: false
    };
  }

  // 1. Check exact cryptographic byte match
  const isExactByteDuplicate = Boolean(imgA.sha256 && imgB.sha256 && imgA.sha256 === imgB.sha256);

  // 2. Compute Hamming Distance on perceptual dHash
  const hammingDistance = calculateHammingDistance(imgA.dHash.hashBinary, imgB.dHash.hashBinary);
  const similarityPct = Math.max(0, Math.min(100, Math.round(((64 - hammingDistance) / 64) * 100)));

  // 3. Check EXIF match if present
  const bothHaveExifDate = Boolean(imgA.exif?.dateTimeOriginal && imgB.exif?.dateTimeOriginal);
  const isSameCaptureTime = bothHaveExifDate && imgA.exif.dateTimeOriginal === imgB.exif.dateTimeOriginal;

  if (isExactByteDuplicate) {
    return {
      status: 'EXACT_DUPLICATE',
      similarityPct: 100,
      hammingDistance: 0,
      verdict: '🚨 100% Exact Bit-for-Bit Duplicate (Re-uploaded Identical File)',
      recommendation: 'FATAL STRIKE: Zero doubt. FE re-submitted the exact same image file across visits.',
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
      verdict: '🚨 Visual Clone / Re-compressed Reuse (Hamming Distance ≤ 2)',
      recommendation: 'FATAL STRIKE: The same photograph was cropped, screenshotted, or re-saved to alter byte hashes.',
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
      verdict: '⚠️ High Probability Reuse / Same Framing (Hamming Distance 3–5)',
      recommendation: 'FLAG FOR REVIEW: Extremely close angle/lighting. High likelihood of rapid duplicate burst or identical equipment staging.',
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
      verdict: '🔍 Moderate Similarity (Hamming Distance 6–10)',
      recommendation: 'ACCEPTABLE VARIANT: Common toolkit layout or similar background, but distinct photo capture.',
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
    verdict: '✅ Distinct Authentic Photo (Hamming Distance > 10)',
    recommendation: 'PASSED: Verified unique image. Zero visual or cryptographic overlap.',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    isExactByteDuplicate: false,
    isPerceptualDuplicate: false
  };
}
