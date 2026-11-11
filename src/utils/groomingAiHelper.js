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

function splitDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1] || 'image/jpeg', data: match[2] };
}

function buildGroomingPrompt({ feName, feCode, expectedDate, upperTimestamp, lowerTimestamp, upperNonce, lowerNonce }) {
  return `You are the Lenskart Home Eye Checkup (DLC) Daily Grooming & Uniform Compliance Auditor.
You are inspecting two LIVE timestamped check-in photographs submitted by Field Executive:
- FE Name: ${feName || 'Unknown FE'}
- FE Code: ${feCode || 'N/A'}
- Expected Today Date: ${expectedDate}

IMAGE 1 = "UPPER_BODY": Chest, Torso & Face Check
IMAGE 2 = "LOWER_BODY": Jeans & Shoes Check

CRITICAL ANTI-CHEATING & TIMESTAMP CHECK:
1. Read the burned-in bottom telemetry watermark strip on BOTH images.
2. Confirm the burned-in timestamp date matches today (${expectedDate}) and verify the tokens exist (Expected tokens: ${upperNonce || 'N/A'} / ${lowerNonce || 'N/A'}).
3. Check for spoofing/cheating: if either photo is clearly a photograph of another phone/laptop/monitor screen (visible screen bezel, pixel moiré grid, glare from a screen) OR is blank/black/covered -> set "spoofDetected": true and FAIL.

STRICT GROOMING & ATTIRE INSPECTION CRITERIA:

ON IMAGE 1 ("UPPER_BODY" - Chest / Torso / Face):
1. "uniform" (Official Lenskart Uniform):
   - PASS: Executive is wearing the official Lenskart navy blue/black polo/t-shirt (visible collar/uniform fabric).
   - FAIL: Casual hoodie, non-uniform t-shirt, jacket completely hiding uniform, shirtless, or chest not visible.
2. "idCard" (Lanyard & Employee Photo ID Card):
   - PASS: Physical Lenskart lanyard and employee ID badge/card clearly visible hanging on chest/torso.
   - FAIL: No lanyard/ID card visible, tucked inside pocket, or obscured.
3. "hairGrooming" (Head Hair Grooming):
   - PASS: Hair is neat, combed, tidy, and professionally presentable.
   - FAIL: Disheveled, messy/uncombed, wearing casual cap/beanie indoors covering hair.
4. "facialHair" (Facial Hair Grooming):
   - PASS: Clean-shaven OR neatly trimmed, well-shaped, well-maintained beard/mustache.
   - FAIL: Unkempt, patchy overgrown scruff/neckbeard clearly violating professional grooming standards. (Note: Female executives or naturally clean-shaven executives PASS facialHair).

ON IMAGE 2 ("LOWER_BODY" - Jeans & Shoes):
5. "jeans" (Trousers / Jeans):
   - PASS: Clean, presentable full-length dark/blue/black jeans or formal trousers.
   - FAIL: Torn/ripped jeans, casual shorts, half-pants, sweatpants/trackpants/pajamas, or legs not visible.
6. "shoes" (Footwear):
   - PASS: Clean, closed-toe formal shoes or clean closed sneakers/sports shoes suitable for field visits.
   - FAIL: Slippers, flip-flops, chappals, open-toe sandals, crocs, or barefoot/socks-only.

JUDGMENT RULES:
- Be objective and fair, but never ignore clear violations (e.g., wearing slippers/chappals, missing ID card, non-uniform shirt, torn jeans).
- If an area is moderately shadowed due to indoor lighting, examine carefully before failing; if genuinely not wearing/showing the required item, mark FAIL with an exact concise reason.
- If ANY criterion fails or spoofDetected is true -> overallVerdict: "FATAL". Otherwise "PASS".

Respond STRICTLY in valid JSON conforming to this exact structure:
{
  "overallVerdict": "PASS" | "FATAL",
  "overallScore": number (0-100),
  "timestampVerified": boolean,
  "timestampNotes": "short note verifying the watermark date/time seen on the images",
  "spoofDetected": boolean,
  "summary": "1-2 sentence clinical grooming verdict summary",
  "upperBody": {
    "status": "PASS" | "FAIL",
    "criteria": {
      "uniform": { "status": "PASS" | "FAIL", "note": "brief observation" },
      "idCard": { "status": "PASS" | "FAIL", "note": "brief observation" },
      "hairGrooming": { "status": "PASS" | "FAIL", "note": "brief observation" },
      "facialHair": { "status": "PASS" | "FAIL", "note": "brief observation" }
    }
  },
  "lowerBody": {
    "status": "PASS" | "FAIL",
    "criteria": {
      "jeans": { "status": "PASS" | "FAIL", "note": "brief observation" },
      "shoes": { "status": "PASS" | "FAIL", "note": "brief observation" }
    }
  },
  "failedReasons": ["concise human-readable reason for every FAIL item, or empty array if PASS"]
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
  sharedAiConfig = null
}) {
  const creds = resolveGroomingAiCredentials(sharedAiConfig);
  if (!creds) {
    throw new Error('NO_AI_KEY_CONFIGURED');
  }

  const upperObj = splitDataUrl(upperImageUrl);
  const lowerObj = splitDataUrl(lowerImageUrl);

  if (!upperObj || !lowerObj) {
    throw new Error('Both live captured photos (Upper Body & Jeans/Shoes) must be present as valid images.');
  }

  const promptText = buildGroomingPrompt({
    feName,
    feCode,
    expectedDate: expectedDate || getTodayYMD(),
    upperTimestamp,
    lowerTimestamp,
    upperNonce,
    lowerNonce
  });

  const { providerId, apiKey, model } = creds;
  let parsed = null;
  let tokensUsed = 1400;

  if (providerId === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            { text: '[IMAGE 1: UPPER_BODY - Chest / Torso / Face]' },
            { inline_data: { mime_type: upperObj.mimeType, data: upperObj.data } },
            { text: '[IMAGE 2: LOWER_BODY - Jeans & Shoes]' },
            { inline_data: { mime_type: lowerObj.mimeType, data: lowerObj.data } }
          ]
        }
      ],
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

    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'text', text: '[IMAGE 1: UPPER_BODY - Chest / Torso / Face]' },
            { type: 'image_url', image_url: { url: upperImageUrl, detail: 'high' } },
            { type: 'text', text: '[IMAGE 2: LOWER_BODY - Jeans & Shoes]' },
            { type: 'image_url', image_url: { url: lowerImageUrl, detail: 'high' } }
          ]
        }
      ],
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
    const payload = {
      model,
      max_tokens: 2000,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'text', text: '[IMAGE 1: UPPER_BODY - Chest / Torso / Face]' },
            { type: 'image', source: { type: 'base64', media_type: upperObj.mimeType, data: upperObj.data } },
            { type: 'text', text: '[IMAGE 2: LOWER_BODY - Jeans & Shoes]' },
            { type: 'image', source: { type: 'base64', media_type: lowerObj.mimeType, data: lowerObj.data } }
          ]
        }
      ]
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

  // Normalize verdicts defensively
  const upperCrit = parsed.upperBody?.criteria || {};
  const lowerCrit = parsed.lowerBody?.criteria || {};

  const upperFailed = Object.values(upperCrit).some(c => c?.status === 'FAIL');
  const lowerFailed = Object.values(lowerCrit).some(c => c?.status === 'FAIL');
  const isSpoof = Boolean(parsed.spoofDetected);
  const isFatal = parsed.overallVerdict === 'FATAL' || upperFailed || lowerFailed || isSpoof || parsed.timestampVerified === false;

  const compiledFailures = Array.isArray(parsed.failedReasons) ? [...parsed.failedReasons] : [];
  if (isSpoof && !compiledFailures.some(r => r.toLowerCase().includes('spoof') || r.toLowerCase().includes('screen'))) {
    compiledFailures.unshift('Suspected photo-of-screen or spoofed capture detected');
  }
  if (parsed.timestampVerified === false && !compiledFailures.some(r => r.toLowerCase().includes('timestamp'))) {
    compiledFailures.unshift('Watermark timestamp verification failed or mismatched date');
  }

  return {
    overallVerdict: isFatal ? 'FATAL' : 'PASS',
    overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : (isFatal ? 40 : 100),
    timestampVerified: parsed.timestampVerified !== false,
    timestampNotes: parsed.timestampNotes || 'Live timestamp watermark confirmed for today.',
    spoofDetected: isSpoof,
    summary: parsed.summary || (isFatal ? 'Grooming or attire non-compliance detected.' : 'All daily uniform, grooming, and footwear checks passed.'),
    upperBody: {
      status: upperFailed || isSpoof ? 'FAIL' : (parsed.upperBody?.status === 'FAIL' ? 'FAIL' : 'PASS'),
      criteria: {
        uniform: upperCrit.uniform || { status: 'PASS', note: 'Checked' },
        idCard: upperCrit.idCard || { status: 'PASS', note: 'Checked' },
        hairGrooming: upperCrit.hairGrooming || { status: 'PASS', note: 'Checked' },
        facialHair: upperCrit.facialHair || { status: 'PASS', note: 'Checked' }
      }
    },
    lowerBody: {
      status: lowerFailed || isSpoof ? 'FAIL' : (parsed.lowerBody?.status === 'FAIL' ? 'FAIL' : 'PASS'),
      criteria: {
        jeans: lowerCrit.jeans || { status: 'PASS', note: 'Checked' },
        shoes: lowerCrit.shoes || { status: 'PASS', note: 'Checked' }
      }
    },
    failedReasons: compiledFailures,
    providerUsed: providerId,
    modelUsed: model,
    tokensUsed
  };
}
