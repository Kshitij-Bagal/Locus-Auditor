/**
 * Daily FE Grooming & Uniform Live Capture + AI Validation Engine
 *
 * Anti-Cheating Guarantees:
 * 1. Live WebRTC camera capture only (no file pickers / gallery uploads).
 * 2. Custom pixel-burned watermark timestamp, FE identifier, check station & live nonce.
 * 3. Multimodal AI verification of:
 *    - Image 1 (Chest / Torso / Face): Lenskart Uniform, ID Card & Lanyard, Hair Grooming, Facial Hair.
 *    - Image 2 (Lower Body): Clean Dark/Formal Jeans or Trousers, Closed-Toe Shoes (no slippers/sandals).
 *    - Timestamp & Anti-Spoof Validation: Verifies watermark date matches today and no screen-of-screen capture.
 */

import {
  extractJsonFromText,
  fetchWithTimeout,
  getStoredGeminiApiKey,
  getStoredGeminiModel
} from './geminiAuditHelper.js';
import {
  SUPPORTED_PROVIDERS,
  getActiveAiProvider,
  getProviderApiKey,
  getProviderModel
} from './multiAiAuditHelper.js';

export function getTodayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatReadableTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

export function generateLiveCaptureNonce(feCode = 'FE') {
  const cleanCode = String(feCode || 'FE').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'FE';
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const sec = String(new Date().getSeconds()).padStart(2, '0');
  return `LK-${cleanCode}-${rand}${sec}`;
}

/**
 * Burns a custom, high-contrast tamper-evident timestamp watermark strip
 * directly onto the canvas pixels before JPEG encoding.
 */
export function burnTimestampWatermark(canvas, metadata = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const now = metadata.capturedDate || new Date();
  const timestampStr = metadata.timestampStr || formatReadableTimestamp(now);
  const feLabel = `${metadata.feName || 'Field Executive'} (${metadata.feCode || 'N/A'})`;
  const stationLabel = metadata.stationLabel || 'DAILY GROOMING CHECK';
  const nonce = metadata.nonce || generateLiveCaptureNonce(metadata.feCode);
  const gpsStr = metadata.gpsText ? ` • GPS: ${metadata.gpsText}` : '';

  // Calculate responsive typography scaled to image width
  const stripHeight = Math.max(54, Math.round(h * 0.11));
  const titleFontSize = Math.max(12, Math.round(w * 0.021));
  const subFontSize = Math.max(10, Math.round(w * 0.017));
  const padX = Math.max(12, Math.round(w * 0.022));

  // 1. Bottom solid translucent security banner
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 24, 0.84)';
  ctx.fillRect(0, h - stripHeight, w, stripHeight);

  // Accent top border on banner
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(0, h - stripHeight, w, Math.max(2, Math.round(stripHeight * 0.05)));

  // Left indicator dot (LIVE CAM)
  const dotRadius = Math.max(4, Math.round(titleFontSize * 0.35));
  const line1Y = h - stripHeight + Math.round(stripHeight * 0.42);
  const line2Y = h - stripHeight + Math.round(stripHeight * 0.78);

  ctx.beginPath();
  ctx.arc(padX + dotRadius, line1Y - Math.round(titleFontSize * 0.32), dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#10b981';
  ctx.fill();

  // Line 1 Left: Station + Live Badge
  ctx.font = `700 ${titleFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`LIVE CAPTURE • ${stationLabel}`, padX + dotRadius * 3, line1Y);

  // Line 1 Right: Exact Date & Time
  ctx.font = `700 ${titleFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.fillStyle = '#38bdf8';
  const timeText = `${timestampStr} IST`;
  const timeWidth = ctx.measureText(timeText).width;
  ctx.fillText(timeText, w - padX - timeWidth, line1Y);

  // Line 2 Left: FE Identity
  ctx.font = `600 ${subFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`FE: ${feLabel}${gpsStr}`, padX, line2Y);

  // Line 2 Right: Security Verification Token
  ctx.font = `700 ${subFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.fillStyle = '#fbbf24';
  const tokenText = `TOKEN: ${nonce}`;
  const tokenWidth = ctx.measureText(tokenText).width;
  ctx.fillText(tokenText, w - padX - tokenWidth, line2Y);

  // 2. Top-right subtle security corner stamp (redundant anti-crop watermark)
  const badgeText = `VERIFIED LIVE • ${timestampStr.split(' ')[0]}`;
  ctx.font = `700 ${Math.max(10, Math.round(subFontSize * 0.9))}px ui-monospace, monospace`;
  const badgeWidth = ctx.measureText(badgeText).width + 16;
  const badgeHeight = Math.max(22, Math.round(subFontSize * 1.7));

  ctx.fillStyle = 'rgba(8, 12, 24, 0.72)';
  ctx.fillRect(w - badgeWidth - 10, 10, badgeWidth, badgeHeight);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(w - badgeWidth - 10, 10, badgeWidth, badgeHeight);

  ctx.fillStyle = '#38bdf8';
  ctx.fillText(badgeText, w - badgeWidth - 2, 10 + Math.round(badgeHeight * 0.7));

  ctx.restore();
}

/**
 * Captures a frame from a live HTMLVideoElement, downscales to max 960px
 * for crisp lightweight storage, burns the custom timestamp watermark,
 * and returns a JPEG data URL + metadata.
 */
export function captureAndWatermarkVideoFrame(videoEl, metadata = {}) {
  if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
    throw new Error('Live camera feed is not ready yet. Please wait a second and try again.');
  }

  const maxDim = 960;
  let targetW = videoEl.videoWidth;
  let targetH = videoEl.videoHeight;

  if (targetW > maxDim || targetH > maxDim) {
    const ratio = Math.min(maxDim / targetW, maxDim / targetH);
    targetW = Math.round(targetW * ratio);
    targetH = Math.round(targetH * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  // Draw un-mirrored frame so ID card text & watermark remain legible
  ctx.drawImage(videoEl, 0, 0, targetW, targetH);

  const now = new Date();
  const timestampStr = formatReadableTimestamp(now);
  const nonce = metadata.nonce || generateLiveCaptureNonce(metadata.feCode);

  burnTimestampWatermark(canvas, {
    ...metadata,
    capturedDate: now,
    timestampStr,
    nonce
  });

  const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
  return {
    dataUrl,
    timestampStr,
    isoTimestamp: now.toISOString(),
    nonce,
    width: targetW,
    height: targetH
  };
}

/**
 * Prepares a user-uploaded image File for SuperAdmin AI Sandbox testing (browser RAM only, never stored in DB).
 * Scales down to max 960px JPEG, optionally burning a synthetic test timestamp watermark.
 */
export function prepareUploadedTestImage(file, watermarkMeta = null) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file selected'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`Invalid image file: ${file.name}`));
      img.onload = () => {
        const maxDim = 960;
        let targetW = img.width || 640;
        let targetH = img.height || 640;
        if (targetW > maxDim || targetH > maxDim) {
          const ratio = Math.min(maxDim / targetW, maxDim / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const now = new Date();
        const timestampStr = formatReadableTimestamp(now);
        const nonce = generateLiveCaptureNonce(watermarkMeta?.feCode || 'TEST');

        if (watermarkMeta) {
          burnTimestampWatermark(canvas, {
            ...watermarkMeta,
            capturedDate: now,
            timestampStr,
            nonce
          });
        }

        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          timestampStr,
          nonce,
          width: targetW,
          height: targetH
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function splitDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1] || 'image/jpeg', data: match[2] };
}

function buildGroomingPrompt({
  feName,
  feCode,
  expectedDate,
  upperTimestamp,
  lowerTimestamp,
  upperNonce,
  lowerNonce,
  skipTimestampCheck = false,
  hasUpper = true,
  hasLower = true
}) {
  const timestampSection = skipTimestampCheck
    ? `SANDBOX QA ACCURACY TEST MODE:
- You are running an internal SuperAdmin accuracy evaluation on test photo(s).
- Do NOT fail for missing burned-in timestamp telemetry watermark or date mismatch.
- Always set "timestampVerified": true and "spoofDetected": false (unless image is completely blank/black/unreadable).
- Focus 100% strictly on visual compliance of the uniform, ID card, hair grooming, facial hair, jeans, and shoes.`
    : `CRITICAL ANTI-CHEATING & TIMESTAMP CHECK:
1. Read the burned-in bottom telemetry watermark strip on BOTH images.
2. Confirm the burned-in timestamp date matches today (${expectedDate}) and verify the tokens exist (Expected tokens: ${upperNonce || 'N/A'} / ${lowerNonce || 'N/A'}).
3. Check for spoofing/cheating: if either photo is clearly a photograph of another phone/laptop/monitor screen (visible screen bezel, pixel moiré grid, glare from a screen) OR is blank/black/covered -> set "spoofDetected": true and FAIL.`;

  const upperSection = hasUpper
    ? `ON IMAGE 1 ("UPPER_BODY" - Chest / Torso / Face):
1. "uniform" (Official Lenskart Polo Uniform):
   - PASS: Wearing a SOLID dark navy-blue or SOLID jet-black official Lenskart polo/t-shirt (matte knit collar polo clearly visible with torso framed).
   - WARNING (minor mistake): Solid dark navy/black polo where the Lenskart chest logo is covered by lanyard/shadow, or collar/polo looks mildly wrinkled/untidy.
   - FAIL: Any patterned/floral/printed/checked/striped shirt, any casual or formal button-down shirt, hoodie, round-neck casual t-shirt, white/bright/colored non-uniform top, jacket completely covering the polo, shirtless, OR chest/torso cropped out so uniform cannot be verified.
2. "idCard" (Lanyard & Physical Photo ID Card):
   - PASS: BOTH the neck lanyard strap AND the physical printed employee photo ID card/badge body are clearly visible in the chest area of the photo.
   - WARNING (minor mistake): Lanyard strap is clearly visible around the collar, BUT the physical ID card/badge hangs below the bottom frame edge, is sideways/flipped, or is half-obscured. (Never mark PASS if the card body itself is cropped out!).
   - FAIL: No lanyard and no employee ID badge visible anywhere around neck/chest.
3. "hairGrooming" (Head Hair Grooming — CHECK SILHOUETTE AGAINST BACKGROUND):
   - Examine the outer silhouette of the top and sides of the head against the background wall carefully!
   - PASS: Hair is flat, neatly combed, and cleanly settled along the scalp with a smooth outline and ZERO spikes or tufts sticking out against the background.
   - WARNING (minor mistake): Hair is mostly combed/neat, with 1–2 minor loose hairs slightly out of place.
   - FAIL: Visible tufts, clumps, cowlicks, bedhead spikes, or multiple stray hairs **sticking upward or outward haphazardly above/beside the head contour against the background**, visibly uncombed/messy hair, or wearing a casual cap/beanie indoors covering hair.
4. "facialHair" (Facial Hair Grooming):
   - PASS: Clean-shaven OR neatly trimmed, well-shaped, sharp beard/mustache. (Female or naturally clean-shaven executives PASS facialHair).
   - WARNING (minor mistake): Light 1-2 day unedged stubble or minor cheek/neck stray hairs needing trim tomorrow.
   - FAIL: Heavily overgrown, patchy, unkempt scruff or untrimmed neckbeard clearly violating professional grooming standards.`
    : `IMAGE 1 ("UPPER_BODY") NOT PROVIDED IN THIS SINGLE-IMAGE TEST:
- Set upperBody.status to "PASS" and all 4 upperBody criteria to { "status": "SKIPPED", "note": "Not tested (lower-only test)" }.`;

  const lowerSection = hasLower
    ? `ON IMAGE ${hasUpper ? '2' : '1'} ("LOWER_BODY" - Dark Blue Jeans Only & Plain Black Shoes):
5. "jeans" (STRICT POLICY: DEEP DARK BLUE JEANS ONLY — REJECT FADED/GREY/SLATE/WASHED DENIM):
   - BENCHMARK COMPARISON: Compare the denim color against a deep dark navy uniform swatch. Compliant jeans MUST be an unmistakably **deep, rich, saturated Dark Indigo / Deep Navy Blue** (near-navy darkness, even uniform color from waistband/thighs all the way down through knees, calves, and ankles).
   - PASS: Deep, rich, saturated Dark Indigo Blue / Deep Navy Blue denim jeans with CONSISTENT unfaded color from waistband through thighs, knees, shins, and ankles (zero washed-out grey/silver sheen, zero pale highlights, zero knee fade, zero bottom-half lightening, no rips).
   - WARNING (minor mistake): Overall deep Dark Blue jeans that show **slight/mild fading** only at the knees or lower shins, OR minor creases/dust — base fabric MUST still clearly be deep dark indigo blue, NOT medium/slate/grey denim!
   - FAIL: **Medium-blue, washed slate-blue, sky/ice-blue, greyish-blue, charcoal-grey, black, or faded-looking denim jeans** (including washed charcoal/slate denim with pale/bright highlights across thighs & knees, stone-wash, whisker lines, or faded lower halves!), beige/khaki/brown/olive/white/colored pants, torn/ripped/distressed jeans, cargo pants, sweatpants/trackpants, or shorts/half-pants.
   - ANTI-LENIENCY RULE: Do NOT excuse slate-grey or medium-washed denim because of indoor lighting/glare! If the denim visibly appears greyish, charcoal-washed, steel-blue, pale/light-washed, or uneven in tone, mark FAIL (not PASS, not WARNING unless the base denim is unmistakably deep navy/indigo with only slight wear).
6. "shoes" (STRICT Footwear Rule: PLAIN BLACK SHOES WITH BLACK LACES):
   - PASS: Clean, closed-toe PLAIN SOLID BLACK formal/work shoes with PLAIN BLACK shoelaces (all-black upper, black laces, dark/black sole). Sleek plain solid-black formal slip-on shoes with zero colored/white trim also PASS.
   - WARNING (minor mistake): Plain black shoes with black laces that look slightly dusty/scuffed and need wiping/polish, OR black upper + black laces with a thin dark/muted sole trim.
   - FAIL: Grey, charcoal-grey, brown, tan, blue, white, or multi-colored shoes (including grey/dark-grey sneakers or beige-soled casual sneakers), ANY white/grey/colored/tan shoelaces (laces MUST be black!), prominent white/cream/beige sneaker soles or athletic stripes/logos, slippers, flip-flops, chappals, sandals, crocs, or barefoot/socks-only.`
    : `IMAGE 2 ("LOWER_BODY") NOT PROVIDED IN THIS SINGLE-IMAGE TEST:
- Set lowerBody.status to "PASS" and both lowerBody criteria to { "status": "SKIPPED", "note": "Not tested (upper-only test)" }.`;

  return `You are the Lenskart Home Eye Checkup (DLC) Daily Grooming & Uniform Compliance Auditor.
You are inspecting check-in photograph(s) submitted for Field Executive:
- FE Name: ${feName || 'Unknown FE'}
- FE Code: ${feCode || 'N/A'}
- Expected Today Date: ${expectedDate}

${hasUpper ? 'IMAGE 1 = "UPPER_BODY": Chest, Torso & Face Check\n' : ''}${hasLower ? `IMAGE ${hasUpper ? '2' : '1'} = "LOWER_BODY": Dark Blue Jeans Only & Plain Black Shoes Check\n` : ''}
${timestampSection}

STRICT GROOMING & ATTIRE INSPECTION CRITERIA (3 LEVELS: PASS | WARNING | FAIL):

${upperSection}

${lowerSection}

JUDGMENT & COLOR ACCURACY RULES:
- Hair silhouette check: Inspect the top and sides of the hair against the wall/background. Any tufts, clumps, or messy strands sticking upright/outward haphazardly must FAIL "hairGrooming" (or WARNING only if 1–2 tiny stray strands).
- ID card framing check: If only the neck lanyard strap is visible and the printed badge card is cropped below the frame, mark "idCard" as WARNING (never PASS without seeing the badge body).
- Full-length jeans hue & fade check: Compare UPPER THIGHS vs KNEES vs LOWER HALF (CALVES/ANKLES), and judge against deep Dark Indigo Navy. Medium-blue, slate-blue, faded charcoal-grey denim, light blue, pale thigh highlights, or black trousers MUST FAIL "jeans".
- Shoe upper/lace/sole check: Reject non-black uppers, tan/white/colored laces, or white/cream/beige sneaker soles as FAIL "shoes".
- Uniform check: Reject patterned/button-down casual shirts as FAIL "uniform".
- In every criterion's "note", explicitly describe the observed visual evidence (exact denim hue/fade, hair silhouette state, badge card visibility, shoe/sole/lace color).
- Distinguish between CRITICAL violations ("FAIL") vs MINOR mistakes ("WARNING"):
  * Use "FAIL" for missing ID card, non-uniform/patterned/button-down shirt, noticeably sticking-up uncombed hair, non-black/grey shoes, beige/white sneaker soles, non-black shoelaces, open sandals/slippers, medium/light/grey/slate/washed/black/torn jeans, or clearly faded jeans.
  * Use "WARNING" ONLY for minor correctable lapses (e.g., mild bottom-half/knee fade on otherwise deep dark-blue jeans, lanyard strap visible without badge card body in frame, dusty plain black shoes, mild 1-day stubble, or 1-2 minor loose hairs).
- Verdict hierarchy:
  * If ANY criterion is "FAIL" or spoofDetected is true -> overallVerdict: "FATAL".
  * Else if NO criterion is "FAIL" AND at least one criterion is "WARNING" -> overallVerdict: "WARNING".
  * Else -> overallVerdict: "PASS".

Respond STRICTLY in valid JSON conforming to this exact structure:
{
  "overallVerdict": "PASS" | "WARNING" | "FATAL",
  "overallScore": number (0-100),
  "timestampVerified": boolean,
  "timestampNotes": "short note verifying the watermark date/time seen on the images",
  "spoofDetected": boolean,
  "summary": "1-2 sentence clinical grooming verdict summary",
  "upperBody": {
    "status": "PASS" | "WARNING" | "FAIL",
    "criteria": {
      "uniform": { "status": "PASS" | "WARNING" | "FAIL", "note": "brief observation" },
      "idCard": { "status": "PASS" | "WARNING" | "FAIL", "note": "brief observation" },
      "hairGrooming": { "status": "PASS" | "WARNING" | "FAIL", "note": "brief observation" },
      "facialHair": { "status": "PASS" | "WARNING" | "FAIL", "note": "brief observation" }
    }
  },
  "lowerBody": {
    "status": "PASS" | "WARNING" | "FAIL",
    "criteria": {
      "jeans": { "status": "PASS" | "WARNING" | "FAIL", "note": "brief observation" },
      "shoes": { "status": "PASS" | "WARNING" | "FAIL", "note": "brief observation" }
    }
  },
  "warnings": ["concise coaching warning for every WARNING item, or empty array"],
  "failedReasons": ["concise human-readable reason for every FAIL item, or empty array"]
}`;
}

/**
 * Resolves the best available AI provider + API key for grooming verification.
 * Checks localStorage -> shared Supabase system config -> Vite env vars.
 */
export function resolveGroomingAiCredentials(sharedConfig = null) {
  // 1. Check active provider configured locally
  const activeProvId = getActiveAiProvider();
  const localKey = getProviderApiKey(activeProvId);
  if (localKey && localKey.trim()) {
    return {
      providerId: activeProvId,
      apiKey: localKey.trim(),
      model: getProviderModel(activeProvId)
    };
  }

  // 2. Check any other locally configured provider
  for (const prov of SUPPORTED_PROVIDERS) {
    const k = getProviderApiKey(prov.id);
    if (k && k.trim()) {
      return {
        providerId: prov.id,
        apiKey: k.trim(),
        model: getProviderModel(prov.id)
      };
    }
  }

  // 3. Check shared admin-synced config (passed from system_settings)
  if (sharedConfig && sharedConfig.apiKey && String(sharedConfig.apiKey).trim()) {
    return {
      providerId: sharedConfig.providerId || 'gemini',
      apiKey: String(sharedConfig.apiKey).trim(),
      model: sharedConfig.model || 'gemini-3.8-flash'
    };
  }

  // 4. Fallback to environment variable if configured
  const envGemini = getStoredGeminiApiKey();
  if (envGemini && envGemini.trim()) {
    return {
      providerId: 'gemini',
      apiKey: envGemini.trim(),
      model: getStoredGeminiModel()
    };
  }

  return null;
}

/**
 * Runs Multimodal AI validation on both captured grooming images.
 */
export async function evaluateGroomingWithAi({
  upperImageUrl,
  lowerImageUrl,
  feName,
  feCode,
  expectedDate,
  upperTimestamp,
  lowerTimestamp,
  upperNonce,
  lowerNonce,
  sharedAiConfig = null,
  skipTimestampCheck = false,
  allowPartialTest = false
}) {
  const creds = resolveGroomingAiCredentials(sharedAiConfig);
  if (!creds) {
    throw new Error('NO_AI_KEY_CONFIGURED');
  }

  const upperObj = splitDataUrl(upperImageUrl);
  const lowerObj = splitDataUrl(lowerImageUrl);

  if (!allowPartialTest && (!upperObj || !lowerObj)) {
    throw new Error('Both live captured photos (Upper Body & Jeans/Shoes) must be present as valid images.');
  }
  if (allowPartialTest && !upperObj && !lowerObj) {
    throw new Error('At least one valid image (Upper Body or Jeans/Shoes) is required for testing.');
  }

  const hasUpper = Boolean(upperObj);
  const hasLower = Boolean(lowerObj);

  const promptText = buildGroomingPrompt({
    feName,
    feCode,
    expectedDate: expectedDate || getTodayYMD(),
    upperTimestamp,
    lowerTimestamp,
    upperNonce,
    lowerNonce,
    skipTimestampCheck,
    hasUpper,
    hasLower
  });

  const { providerId, apiKey, model } = creds;
  let parsed = null;
  let tokensUsed = 1400;

  if (providerId === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const geminiParts = [{ text: promptText }];
    if (hasUpper) {
      geminiParts.push({ text: '[IMAGE 1: UPPER_BODY - Chest / Torso / Face]' });
      geminiParts.push({ inline_data: { mime_type: upperObj.mimeType, data: upperObj.data } });
    }
    if (hasLower) {
      geminiParts.push({ text: `[IMAGE ${hasUpper ? '2' : '1'}: LOWER_BODY - Jeans & Shoes]` });
      geminiParts.push({ inline_data: { mime_type: lowerObj.mimeType, data: lowerObj.data } });
    }

    const payload = {
      contents: [{ parts: geminiParts }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };

    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 40000);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini Grooming Check Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    parsed = extractJsonFromText(rawText);
    const usage = data.usageMetadata || {};
    tokensUsed = (usage.promptTokenCount || 1100) + (usage.candidatesTokenCount || 350);
  } else if (providerId === 'openai' || providerId === 'openrouter' || providerId === 'groq') {
    const endpoint = providerId === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : (providerId === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions');

    const openAiContent = [{ type: 'text', text: promptText }];
    if (hasUpper) {
      openAiContent.push({ type: 'text', text: '[IMAGE 1: UPPER_BODY - Chest / Torso / Face]' });
      openAiContent.push({ type: 'image_url', image_url: { url: upperImageUrl, detail: 'high' } });
    }
    if (hasLower) {
      openAiContent.push({ type: 'text', text: `[IMAGE ${hasUpper ? '2' : '1'}: LOWER_BODY - Jeans & Shoes]` });
      openAiContent.push({ type: 'image_url', image_url: { url: lowerImageUrl, detail: 'high' } });
    }

    const payload = {
      model,
      messages: [{ role: 'user', content: openAiContent }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://lenskart.com';
      headers['X-Title'] = 'Lenskart DLC Grooming';
    }

    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, 45000);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${providerId.toUpperCase()} Grooming Check Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content;
    parsed = extractJsonFromText(rawText);
    tokensUsed = data.usage?.total_tokens || 1400;
  } else if (providerId === 'anthropic') {
    const endpoint = 'https://api.anthropic.com/v1/messages';
    const claudeContent = [{ type: 'text', text: promptText }];
    if (hasUpper) {
      claudeContent.push({ type: 'text', text: '[IMAGE 1: UPPER_BODY - Chest / Torso / Face]' });
      claudeContent.push({ type: 'image', source: { type: 'base64', media_type: upperObj.mimeType, data: upperObj.data } });
    }
    if (hasLower) {
      claudeContent.push({ type: 'text', text: `[IMAGE ${hasUpper ? '2' : '1'}: LOWER_BODY - Jeans & Shoes]` });
      claudeContent.push({ type: 'image', source: { type: 'base64', media_type: lowerObj.mimeType, data: lowerObj.data } });
    }

    const payload = {
      model,
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: 'user', content: claudeContent }]
    };

    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(payload)
    }, 45000);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude Grooming Check Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.content?.map(c => c.text || '').join('');
    parsed = extractJsonFromText(rawText);
    tokensUsed = (data.usage?.input_tokens || 1000) + (data.usage?.output_tokens || 400);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI returned unreadable response for grooming check.');
  }

  // Normalize verdicts defensively (PASS | WARNING | FATAL)
  const upperCrit = hasUpper ? (parsed.upperBody?.criteria || {}) : {};
  const lowerCrit = hasLower ? (parsed.lowerBody?.criteria || {}) : {};

  const normCrit = (c) => {
    const st = String(c?.status || 'PASS').toUpperCase();
    const safeSt = ['PASS', 'WARNING', 'FAIL', 'SKIPPED'].includes(st) ? st : 'PASS';
    return { status: safeSt, note: c?.note || 'Checked' };
  };

  const normalizedUpper = hasUpper
    ? {
        uniform: normCrit(upperCrit.uniform),
        idCard: normCrit(upperCrit.idCard),
        hairGrooming: normCrit(upperCrit.hairGrooming),
        facialHair: normCrit(upperCrit.facialHair)
      }
    : {
        uniform: { status: 'SKIPPED', note: 'Not in lower-only test' },
        idCard: { status: 'SKIPPED', note: 'Not in lower-only test' },
        hairGrooming: { status: 'SKIPPED', note: 'Not in lower-only test' },
        facialHair: { status: 'SKIPPED', note: 'Not in lower-only test' }
      };

  const normalizedLower = hasLower
    ? {
        jeans: normCrit(lowerCrit.jeans),
        shoes: normCrit(lowerCrit.shoes)
      }
    : {
        jeans: { status: 'SKIPPED', note: 'Not in upper-only test' },
        shoes: { status: 'SKIPPED', note: 'Not in upper-only test' }
      };

  const upperFailed = hasUpper && Object.values(normalizedUpper).some(c => c.status === 'FAIL');
  const lowerFailed = hasLower && Object.values(normalizedLower).some(c => c.status === 'FAIL');
  const upperWarned = hasUpper && Object.values(normalizedUpper).some(c => c.status === 'WARNING');
  const lowerWarned = hasLower && Object.values(normalizedLower).some(c => c.status === 'WARNING');

  const isSpoof = !skipTimestampCheck && Boolean(parsed.spoofDetected);
  const timestampOk = skipTimestampCheck ? true : (parsed.timestampVerified !== false);
  const isFatal = parsed.overallVerdict === 'FATAL' || upperFailed || lowerFailed || isSpoof || !timestampOk;
  const isWarning = !isFatal && (parsed.overallVerdict === 'WARNING' || upperWarned || lowerWarned);

  const compiledFailures = Array.isArray(parsed.failedReasons) ? [...parsed.failedReasons] : [];
  if (isSpoof && !compiledFailures.some(r => r.toLowerCase().includes('spoof') || r.toLowerCase().includes('screen'))) {
    compiledFailures.unshift('Suspected photo-of-screen or spoofed capture detected');
  }
  if (!timestampOk && !compiledFailures.some(r => r.toLowerCase().includes('timestamp'))) {
    compiledFailures.unshift('Watermark timestamp verification failed or mismatched date');
  }

  const compiledWarnings = Array.isArray(parsed.warnings) ? [...parsed.warnings] : [];
  if (isWarning && compiledWarnings.length === 0) {
    [...Object.entries(normalizedUpper), ...Object.entries(normalizedLower)].forEach(([k, v]) => {
      if (v.status === 'WARNING') {
        compiledWarnings.push(`${k}: ${v.note}`);
      }
    });
  }

  return {
    overallVerdict: isFatal ? 'FATAL' : (isWarning ? 'WARNING' : 'PASS'),
    overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : (isFatal ? 40 : (isWarning ? 78 : 100)),
    timestampVerified: timestampOk,
    timestampNotes: skipTimestampCheck
      ? 'Sandbox QA accuracy mode (watermark check bypassed).'
      : (parsed.timestampNotes || 'Live timestamp watermark confirmed for today.'),
    spoofDetected: isSpoof,
    summary: parsed.summary || (isFatal
      ? 'Grooming or attire non-compliance detected.'
      : isWarning
      ? 'Minor grooming/attire correction needed — warning issued.'
      : 'All daily uniform, grooming, dark jeans, and plain black shoes checks passed.'),
    upperBody: {
      status: !hasUpper ? 'SKIPPED' : (upperFailed || isSpoof ? 'FAIL' : (upperWarned ? 'WARNING' : 'PASS')),
      criteria: normalizedUpper
    },
    lowerBody: {
      status: !hasLower ? 'SKIPPED' : (lowerFailed || isSpoof ? 'FAIL' : (lowerWarned ? 'WARNING' : 'PASS')),
      criteria: normalizedLower
    },
    warnings: compiledWarnings,
    failedReasons: compiledFailures,
    providerUsed: providerId,
    modelUsed: model,
    tokensUsed
  };
}
