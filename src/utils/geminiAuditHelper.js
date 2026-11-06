/**
 * Gemini 1.5 Flash Multimodal AI Auditing Engine for Lenskart Home Eye Checkup
 * Evaluates the 5 mandatory clinical SOP photo stations in a single consolidated API request.
 */

import { INITIAL_CENTRAL_RULES } from '../data/centralRules.js';

// Local storage key for Gemini API Key
export const GEMINI_API_KEY_STORAGE_KEY = 'locus_gemini_api_key';

export function getStoredGeminiApiKey() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  return import.meta.env?.VITE_GEMINI_API_KEY || '';
}

export function saveStoredGeminiApiKey(key) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (key && key.trim()) {
      localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    }
  }
}

/**
 * Normalizes Locus URLs directly to the assets CDN to eliminate unnecessary 302 redirects.
 */
export function normalizeLocusUrl(rawUrl, taskId) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let u = rawUrl.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('data:') && !u.startsWith('blob:')) {
    const stripped = u.replace(/^\/+/, '');
    if (stripped.startsWith('v1/client/')) {
      u = `https://assets.locus-api.com/${stripped}`;
    } else {
      u = `https://assets.locus-api.com/v1/client/lenskart-dlc/task/${taskId || 'task'}/file/${stripped}`;
    }
  }
  u = u.replace(/^http:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  u = u.replace(/^https:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  u = u.replace(/^http:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  u = u.replace(/^https:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  return u;
}

/**
 * Downloads a remote image through the server-side image proxy and converts it to base64.
 */
export async function fetchImageAsBase64(rawUrl, taskId) {
  if (!rawUrl) return null;
  const cleanUrl = normalizeLocusUrl(rawUrl, taskId);
  if (!cleanUrl) return null;

  try {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch image via proxy (${response.status}):`, cleanUrl);
      return null;
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const parts = result.split(',');
          const base64Data = parts[1];
          let mimeType = blob.type || 'image/jpeg';
          if (!mimeType || mimeType === 'application/octet-stream') mimeType = 'image/jpeg';
          resolve({ mimeType, data: base64Data });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Error downloading image for Gemini:', err.message);
    return null;
  }
}

/**
 * Builds the comprehensive clinical SOP system instruction for Gemini 1.5 Flash.
 */
function buildAuditPrompt(task, rules = INITIAL_CENTRAL_RULES) {
  return `You are the Chief Clinical QA Auditor for Lenskart Home Eye Checkup (DLC).
Your task is to audit a field executive's (FE) customer home visit by inspecting the 5 mandatory equipment inspection photos submitted for this dispatch.

TASK METADATA:
- Task ID: ${task.taskId || task.id}
- Field Executive: ${task.feName || 'Unknown'} (${task.feCode || 'FE'})
- City / Hub: ${task.facilityCode || task.city || 'Hub'}
- Dispatch Date: ${task.date || task.dispatch_date || 'N/A'}
- Customer: ${task.customerName || 'Customer'}

MANDATORY CLINICAL SOP CRITERIA (ALL 5 ARE REQUIRED TO PASS):
1. [selfie] Selfie with Official Lenskart T-Shirt & Visible ID Card:
   - Must be wearing official Lenskart Navy Blue Polo / T-shirt with logo.
   - Physical Lenskart employee photo ID card badge must be clearly displayed and readable.
   - Face clearly visible and matches profile.
   - FAIL IF: Casual clothes/jackets hiding polo, missing ID badge, face covered, or photo of another photo.

2. [torches] Working Blue & Yellow Diagnostic Torches:
   - Both Cobalt Blue AND Amber Yellow penlights must be visible side-by-side.
   - Both torches must be powered ON with active light beams shining.
   - Optical lenses clean without cracks.
   - FAIL IF: Torches off, missing blue or yellow torch, only 1 torch visible, or clicked inside pouch/pocket.

3. [visionChart] Vision Acuity Chart & Standee Setup:
   - Standardized Snellen / LogMAR visual acuity chart mounted on portable telescoping standee.
   - Erected at eye level for customer testing inside home.
   - FAIL IF: Chart taped to wall/door without standee, crumpled chart, standee missing/broken, or held in hand.

4. [toolkit] Complete Refraction Optical Toolkit:
   - Must show the complete 6-piece clinical refraction kit:
     a) Universal clinical trial frame
     b) Jackson Cross Cylinder (JCC)
     c) Near vision reading book / card
     d) Handheld mirror
     e) Pocket hand sanitizer bottle (mandatory hygiene protocol)
     f) Pupillary distance (PD) measurement tape / ruler
   - FAIL IF: Incomplete kit, missing trial frame, missing hand sanitizer, missing PD ruler, or damaged tools.

5. [frameDisplay] Frame Showcase Tray at Customer Living Room:
   - Multi-compartment frame display tray arranged neatly on customer's living room table.
   - Clean sample frames neatly seated in display slots.
   - Domestic home living environment confirmed.
   - FAIL IF: Frames kept inside backpack/carry bag, empty tray, clicked in vehicle/elevator/hallway.

FRAUD & PHOTO INTEGRITY CHECK:
- Check for fraudulent photo uploads: covered camera lens, solid black image, blank white screenshot, blurred unidentifiable object, or duplicate pictures.
- If ANY photo is intentionally blank/black/obscured, mark as FRAUDULENT and FATAL immediately.

DETERMINISTIC ERROR MARGIN & CONFIDENCE:
- Calculate your Confidence Score (0% to 100%) based on photo lighting, sharpness, resolution, and angle.
- Calculate your Deterministic Error Margin as (100 - ConfidenceScore). For example, if confidence is 94%, errorMargin is 6 (representing ±6%).

VERDICT RULES:
- If ALL 5 criteria pass and no photo fraud is detected -> verdict: "PASS"
- If ANY criterion fails or photo fraud is detected -> verdict: "FATAL"
- Overall score: 0 to 100 based on weighted adherence.

OUTPUT FORMAT:
You MUST respond strictly with valid JSON conforming to this exact structure:
{
  "verdict": "PASS" | "FATAL",
  "overallScore": number (0-100),
  "confidenceScore": number (0-100),
  "errorMargin": number (e.g. 5 for ±5%),
  "summary": "1-2 sentence executive summary of the audit findings",
  "isFraudulentOrBlankDetected": boolean,
  "criteriaEvaluation": [
    {
      "id": "selfie",
      "label": "1. Selfie: T-Shirt & ID Card",
      "status": "PASS" | "FAIL",
      "score": number (0-100),
      "observations": "Clear detailed observation of what is seen in the photo",
      "failureReasons": ["reason 1", "reason 2"]
    },
    {
      "id": "torches",
      "label": "2. Working Blue & Yellow Torches",
      "status": "PASS" | "FAIL",
      "score": number (0-100),
      "observations": "Observation details",
      "failureReasons": []
    },
    {
      "id": "visionChart",
      "label": "3. Vision Chart & Standee",
      "status": "PASS" | "FAIL",
      "score": number (0-100),
      "observations": "Observation details",
      "failureReasons": []
    },
    {
      "id": "toolkit",
      "label": "4. Complete Refraction Toolkit",
      "status": "PASS" | "FAIL",
      "score": number (0-100),
      "observations": "Observation details",
      "failureReasons": []
    },
    {
      "id": "frameDisplay",
      "label": "5. Frame Display at Customer House",
      "status": "PASS" | "FAIL",
      "score": number (0-100),
      "observations": "Observation details",
      "failureReasons": []
    }
  ],
  "equipmentReplacementsNeeded": [
    { "item": "Name of tool", "reason": "Reason why replacement is required" }
  ]
}`;
}

/**
 * Tests connection to Google Gemini 1.5 Flash API with a lightweight ping.
 */
export async function testGeminiApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Please enter a valid Google Gemini API Key.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
  
  const payload = {
    contents: [
      {
        parts: [
          { text: 'Ping. Respond with valid JSON: {"status": "ok", "model": "gemini-1.5-flash"}' }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let msg = `API Error ${response.status}: ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) msg = parsed.error.message;
    } catch (e) {}
    throw new Error(msg);
  }

  const data = await response.json();
  return { success: true, model: 'gemini-1.5-flash', response: data };
}

/**
 * Audits a single task by packaging all 5 images into a single Gemini 1.5 Flash API call.
 */
export async function auditTaskWithGemini({ task, apiKey, rules = INITIAL_CENTRAL_RULES, onProgress }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Google Gemini API Key is missing. Please configure it in the AI Audits console.');
  }

  const taskId = task.id || task.taskId;
  const imageMap = task.images || {};

  // Check if zero images are available
  const imageKeys = ['selfie', 'torches', 'visionChart', 'toolkit', 'frameDisplay'];
  const availableKeys = imageKeys.filter(k => Boolean(imageMap[k]));

  if (availableKeys.length === 0) {
    // Deterministic FATAL for zero images uploaded
    return {
      verdict: 'FATAL',
      overallScore: 0,
      confidenceScore: 100,
      errorMargin: 0,
      summary: 'Automated Fatal Strike: Zero mandatory photo evidence uploaded for this dispatch.',
      isFraudulentOrBlankDetected: true,
      criteriaEvaluation: imageKeys.map(k => ({
        id: k,
        label: k,
        status: 'FAIL',
        score: 0,
        observations: 'No photo uploaded by Field Executive.',
        failureReasons: ['Missing photo upload']
      })),
      equipmentReplacementsNeeded: [],
      rawAiResponse: null
    };
  }

  if (onProgress) onProgress({ step: 'DOWNLOADING_IMAGES', message: `Downloading ${availableKeys.length} clinical photos via proxy...` });

  // 1. Download all photos in parallel
  const imageParts = [];
  for (const key of imageKeys) {
    const rawUrl = imageMap[key];
    if (rawUrl) {
      if (onProgress) onProgress({ step: 'DOWNLOADING_IMAGES', message: `Downloading ${key} image...` });
      const base64Obj = await fetchImageAsBase64(rawUrl, taskId);
      if (base64Obj) {
        imageParts.push({ text: `[STATION PHOTO: ${key}]` });
        imageParts.push({
          inline_data: {
            mime_type: base64Obj.mimeType,
            data: base64Obj.data
          }
        });
      } else {
        imageParts.push({ text: `[STATION PHOTO: ${key}] (Download failed or corrupt URL: ${rawUrl})` });
      }
    } else {
      imageParts.push({ text: `[STATION PHOTO: ${key}] (NO PHOTO UPLOADED FOR THIS CRITERION)` });
    }
  }

  if (onProgress) onProgress({ step: 'QUERYING_AI', message: 'Sending consolidated 5-photo inspection request to Gemini 1.5 Flash...' });

  // 2. Build multi-modal request
  const promptText = buildAuditPrompt(task, rules);
  const parts = [
    { text: promptText },
    ...imageParts
  ];

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
  
  const payload = {
    contents: [
      { parts }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let msg = `Gemini API Error ${response.status}: ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) msg = parsed.error.message;
    } catch (e) {}
    throw new Error(msg);
  }

  if (onProgress) onProgress({ step: 'PROCESSING_RESULTS', message: 'Synthesizing scores, error margin & clinical checklist...' });

  const apiResult = await response.json();
  const candidate = apiResult.candidates?.[0];
  const responseText = candidate?.content?.parts?.[0]?.text;

  if (!responseText) {
    throw new Error('Gemini API returned an empty response.');
  }

  // Parse structured JSON
  let structuredResult;
  try {
    structuredResult = JSON.parse(responseText);
  } catch (err) {
    console.error('Failed to parse Gemini JSON output:', responseText);
    throw new Error('Gemini output could not be parsed as valid JSON: ' + err.message);
  }

  // Ensure robust formatting
  const verdict = structuredResult.verdict === 'PASS' ? 'PASS' : 'FATAL';
  const overallScore = Math.max(0, Math.min(100, Number(structuredResult.overallScore) || (verdict === 'PASS' ? 85 : 30)));
  const confidenceScore = Math.max(50, Math.min(100, Number(structuredResult.confidenceScore) || 90));
  const errorMargin = Math.max(1, Math.min(50, Number(structuredResult.errorMargin) || (100 - confidenceScore)));

  return {
    ...structuredResult,
    verdict,
    overallScore,
    confidenceScore,
    errorMargin,
    rawAiResponse: structuredResult
  };
}
