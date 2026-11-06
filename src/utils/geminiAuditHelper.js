/**
 * Gemini 1.5 Flash Multimodal AI Auditing Engine for Lenskart Home Eye Checkup
 * Evaluates the 5 mandatory clinical SOP photo stations in a single consolidated API request.
 */

import { INITIAL_CENTRAL_RULES } from '../data/centralRules.js';

// Local storage key for Gemini API Key & Selected Model
export const GEMINI_API_KEY_STORAGE_KEY = 'locus_gemini_api_key';
export const GEMINI_MODEL_STORAGE_KEY = 'locus_gemini_active_model';

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

export function getStoredGeminiModel() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem(GEMINI_MODEL_STORAGE_KEY);
    if (saved && saved.trim() && !saved.includes('1.5') && !saved.includes('2.5')) return saved.trim();
  }
  return 'gemini-3.8-flash';
}

export function saveStoredGeminiModel(model) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (model && model.trim()) {
      localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, model.trim());
    } else {
      localStorage.removeItem(GEMINI_MODEL_STORAGE_KEY);
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
 * Model Priority Ranking:
 * Prefers latest, ultra-fast multimodal Flash models with vision support.
 */
export const GEMINI_MODEL_PRIORITY = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-pro-latest'
];

/**
 * Robust JSON parser that handles markdown code blocks or conversational wrappers.
 */
export function extractJsonFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty or invalid response from AI model.');
  }

  let text = rawText.trim();

  // 1. Remove markdown fences like ```json ... ``` or ``` ... ```
  if (text.includes('```')) {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      text = codeBlockMatch[1].trim();
    }
  }

  // 2. Direct JSON Parse attempt
  try {
    return JSON.parse(text);
  } catch (e1) {
    // 3. Fallback: locate outermost curly braces
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extracted = text.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extracted);
      } catch (e2) {
        throw new Error('AI output could not be parsed as valid JSON: ' + e2.message);
      }
    }
    throw new Error('AI output could not be parsed as valid JSON: ' + e1.message);
  }
}

/**
 * Dynamically queries Google Generative AI ModelService.ListModels
 * to find the exact models available for this specific API key.
 */
export async function listAvailableGeminiModels(apiKey) {
  if (!apiKey || !apiKey.trim()) return [];
  const cleanKey = apiKey.trim();
  const versions = ['v1beta', 'v1'];

  for (const v of versions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${v}/models?key=${cleanKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        const supported = data.models
          .filter(m => {
            const methods = m.supportedGenerationMethods || [];
            return methods.includes('generateContent');
          })
          .map(m => {
            const id = m.name.replace(/^models\//, '');
            const isFlash = id.toLowerCase().includes('flash');
            const isPro = id.toLowerCase().includes('pro');
            const isLatestFlash = id === 'gemini-3.8-flash' || id === 'gemini-3.7-flash' || id === 'gemini-3.5-flash' || id === 'gemini-flash-latest' || id === 'gemini-2.5-flash' || id === 'gemini-1.5-flash-latest';

            // Token Limits
            const inputLimit = m.inputTokenLimit || (isPro ? 2097152 : 1048576);
            const outputLimit = m.outputTokenLimit || 8192;
            const inputTokensFormatted = inputLimit >= 1000000 ? `${(inputLimit / 1000000).toFixed(0)}M` : `${Math.round(inputLimit / 1000)}k`;
            
            // Rate Limit Tier (Free tier standards)
            const rpm = isFlash ? 15 : (isPro ? 2 : 5);
            const rpd = isFlash ? 1500 : (isPro ? 50 : 200);

            let label = id;
            if (isLatestFlash) {
              label = `⭐ ${id} (Recommended • ${inputTokensFormatted} Tokens • ${rpm} RPM)`;
            } else if (isFlash) {
              label = `⚡ ${id} (Fast Flash • ${inputTokensFormatted} Tokens • ${rpm} RPM)`;
            } else if (isPro) {
              label = `🧠 ${id} (Deep Pro • ${inputTokensFormatted} Tokens • ${rpm} RPM Slow)`;
            } else {
              label = `🔷 ${id} (${inputTokensFormatted} Tokens)`;
            }

            return {
              id,
              name: m.name,
              displayName: m.displayName || id,
              label,
              inputTokenLimit: inputLimit,
              outputTokenLimit: outputLimit,
              inputTokensFormatted,
              rpm,
              rpd,
              isFlash,
              isPro,
              isRecommended: isLatestFlash,
              description: m.description || '',
              apiVersion: v
            };
          });

        if (supported.length > 0) {
          // Sort according to preferred model priority
          supported.sort((a, b) => {
            let idxA = GEMINI_MODEL_PRIORITY.indexOf(a.id);
            let idxB = GEMINI_MODEL_PRIORITY.indexOf(b.id);
            if (idxA === -1) idxA = 999;
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
          });
          return supported;
        }
      }
    } catch (err) {
      console.warn(`Gemini ModelService.ListModels (${v}) check warning:`, err.message);
    }
  }

  return [];
}

/**
 * Selects the optimal model from the available models list based on priority.
 */
export function pickOptimalModel(availableModels) {
  if (!availableModels || availableModels.length === 0) return null;

  for (const prio of GEMINI_MODEL_PRIORITY) {
    const match = availableModels.find(m => m.id.toLowerCase() === prio.toLowerCase());
    if (match) return match;
  }

  const anyFlash = availableModels.find(m => m.id.toLowerCase().includes('flash'));
  if (anyFlash) return anyFlash;

  const anyGemini = availableModels.find(m => m.id.toLowerCase().includes('gemini'));
  if (anyGemini) return anyGemini;

  return availableModels[0];
}

/**
 * Tests connection to Google Gemini API with dynamic model resolution.
 * Auto-detects supported model variants for the user's API key.
 */
export async function testGeminiApiKey(apiKey, targetModelId = null) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Please enter a valid Google Gemini API Key.');
  }

  const cleanKey = apiKey.trim();

  // 1. Discover models via ModelService.ListModels
  const availableModels = await listAvailableGeminiModels(cleanKey);

  // 2. Assemble candidate models to test
  const candidates = [];

  // If target model specified, put it first
  if (targetModelId) {
    const match = availableModels.find(m => m.id === targetModelId);
    if (match) {
      candidates.push(match);
    } else {
      candidates.push({ id: targetModelId, apiVersion: 'v1beta', displayName: targetModelId });
    }
  }

  // Next, pick optimal from discovered list
  if (availableModels.length > 0) {
    const optimal = pickOptimalModel(availableModels);
    if (optimal && !candidates.some(c => c.id === optimal.id)) {
      candidates.push(optimal);
    }
    availableModels.forEach(m => {
      if (!candidates.some(c => c.id === m.id)) {
        candidates.push(m);
      }
    });
  } else {
    // If ListModels failed or returned 0, try common default models
    const fallbackList = [
      { id: 'gemini-1.5-flash-latest', apiVersion: 'v1beta', displayName: 'Gemini 1.5 Flash Latest' },
      { id: 'gemini-1.5-flash', apiVersion: 'v1beta', displayName: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-flash-002', apiVersion: 'v1beta', displayName: 'Gemini 1.5 Flash 002' },
      { id: 'gemini-2.0-flash', apiVersion: 'v1beta', displayName: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-exp', apiVersion: 'v1beta', displayName: 'Gemini 2.0 Flash Exp' },
      { id: 'gemini-1.5-flash-8b', apiVersion: 'v1beta', displayName: 'Gemini 1.5 Flash 8B' },
      { id: 'gemini-1.5-pro-latest', apiVersion: 'v1beta', displayName: 'Gemini 1.5 Pro Latest' },
      { id: 'gemini-1.5-flash', apiVersion: 'v1', displayName: 'Gemini 1.5 Flash (v1)' }
    ];
    candidates.push(...fallbackList);
  }

  let lastError = null;

  // 3. Test ping on candidate models until one succeeds
  for (const candidate of candidates) {
    const v = candidate.apiVersion || 'v1beta';
    const endpoint = `https://generativelanguage.googleapis.com/${v}/models/${candidate.id}:generateContent?key=${cleanKey}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: 'Respond with valid JSON: {"status": "ok"}' }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        saveStoredGeminiModel(candidate.id);
        return {
          success: true,
          activeModel: candidate.id,
          activeApiVersion: v,
          displayName: candidate.displayName || candidate.id,
          availableModels: availableModels.length > 0 ? availableModels : candidates,
          response: data
        };
      } else {
        const errorBody = await response.text();
        let msg = `API Error ${response.status}: ${response.statusText}`;
        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.error?.message) msg = parsed.error.message;
        } catch (_) {}
        lastError = new Error(`${candidate.id} (${v}): ${msg}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to connect to Google Gemini API. Please check your API key.');
}

/**
 * Audits a single task by packaging all 5 images into a single Gemini API call.
 */
export async function auditTaskWithGemini({ 
  task, 
  apiKey, 
  modelId = null, 
  apiVersion = null, 
  rules = INITIAL_CENTRAL_RULES, 
  onProgress 
}) {
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

  // 2. Resolve active model and endpoint
  let activeModel = modelId || getStoredGeminiModel() || 'gemini-1.5-flash-latest';
  let activeVersion = apiVersion || 'v1beta';

  if (onProgress) onProgress({ step: 'QUERYING_AI', message: `Sending consolidated 5-photo inspection request to ${activeModel}...` });

  const promptText = buildAuditPrompt(task, rules);
  const parts = [
    { text: promptText },
    ...imageParts
  ];

  const payload = {
    contents: [
      { parts }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  let endpoint = `https://generativelanguage.googleapis.com/${activeVersion}/models/${activeModel}:generateContent?key=${apiKey.trim()}`;

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Helper for pause
  const waitMs = (ms) => new Promise(res => setTimeout(res, ms));

  // If response failed, handle auto-fallbacks (e.g. responseMimeType not supported, model not found, or temporary high demand)
  if (!response.ok) {
    let errorBody = await response.text();
    let isMimeTypeError = errorBody.includes('response_mime_type') || errorBody.includes('responseMimeType');
    let isModelNotFoundError = response.status === 404 || errorBody.includes('not found') || errorBody.includes('no longer available') || errorBody.includes('ListModels');
    let isHighDemand = response.status === 503 || errorBody.includes('high demand') || errorBody.includes('overloaded');

    if (isMimeTypeError) {
      delete payload.generationConfig.responseMimeType;
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else if (isHighDemand) {
      // 1. Retry with exponential backoff on current model (spikes are temporary)
      if (onProgress) onProgress({ step: 'RETRYING', message: `Google reports high demand spike. Retrying ${activeModel} in 1.5s...` });
      await waitMs(1500);

      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // 2. If still high demand, failover to sister 3.x model (gemini-3.7-flash or gemini-3.5-flash)
      if (!response.ok) {
        const retryErr = await response.text();
        if (response.status === 503 || retryErr.includes('high demand')) {
          const sisterModel = activeModel === 'gemini-3.8-flash' ? 'gemini-3.7-flash' : 'gemini-3.8-flash';
          if (onProgress) onProgress({ step: 'FAILOVER', message: `${activeModel} still busy. Re-routing to ${sisterModel}...` });
          
          activeModel = sisterModel;
          saveStoredGeminiModel(sisterModel);
          endpoint = `https://generativelanguage.googleapis.com/${activeVersion}/models/${sisterModel}:generateContent?key=${apiKey.trim()}`;
          
          await waitMs(1000);
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      }
    } else if (isModelNotFoundError) {
      // Model not available or retired: pick optimal supported 3.x model
      const discovered = await listAvailableGeminiModels(apiKey);
      const fallback = pickOptimalModel(discovered);
      if (fallback && fallback.id !== activeModel) {
        activeModel = fallback.id;
        activeVersion = fallback.apiVersion || 'v1beta';
        saveStoredGeminiModel(activeModel);

        endpoint = `https://generativelanguage.googleapis.com/${activeVersion}/models/${activeModel}:generateContent?key=${apiKey.trim()}`;
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    }

    if (!response.ok) {
      const finalErr = await response.text();
      let msg = `Gemini API Error ${response.status}: ${response.statusText}`;
      try {
        const parsed = JSON.parse(finalErr);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch (_) {}
      throw new Error(msg);
    }
  }

  if (onProgress) onProgress({ step: 'PROCESSING_RESULTS', message: 'Synthesizing scores, error margin & clinical checklist...' });

  const apiResult = await response.json();
  const candidate = apiResult.candidates?.[0];
  const responseText = candidate?.content?.parts?.[0]?.text;

  if (!responseText) {
    throw new Error('Gemini API returned an empty response.');
  }

  // Parse structured JSON safely
  const structuredResult = extractJsonFromText(responseText);

  // Extract usage metadata (exact tokens from Google Gemini)
  const usage = apiResult.usageMetadata || {};
  const promptTokens = usage.promptTokenCount || 1650;
  const responseTokens = usage.candidatesTokenCount || 350;
  const totalTokens = usage.totalTokenCount || (promptTokens + responseTokens);

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
    activeModelUsed: activeModel,
    usageMetadata: {
      promptTokens,
      responseTokens,
      totalTokens
    },
    rawAiResponse: structuredResult
  };
}
