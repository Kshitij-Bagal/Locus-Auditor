/**
 * Universal Multi-Provider Multimodal AI Engine for Lenskart Home Eye Checkup
 * Supports:
 * 1. Google Gemini (Gemini 3.8 Flash, 3.7 Flash, 3.5 Flash, 3.1 Flash Lite)
 * 2. OpenAI (GPT-4o, GPT-4o-mini)
 * 3. Anthropic Claude (Claude 3.5 Sonnet, Claude 3.5 Haiku)
 * 4. OpenRouter (Universal Aggregator: Pixtral, Llama 3.2 Vision, GPT-4o, Gemini)
 * 5. Groq (Llama 3.2 11B / 90B Vision)
 */

import { INITIAL_CENTRAL_RULES } from '../data/centralRules.js';
import { 
  compressAndResizeBlob, 
  fetchWithTimeout, 
  normalizeLocusUrl, 
  extractJsonFromText,
  getStoredGeminiApiKey,
  saveStoredGeminiApiKey,
  getStoredGeminiModel,
  saveStoredGeminiModel,
  listAvailableGeminiModels
} from './geminiAuditHelper.js';

export const AI_ACTIVE_PROVIDER_KEY = 'locus_ai_active_provider';
export const AI_AUTO_FAILOVER_KEY = 'locus_ai_enable_provider_failover';

export const SUPPORTED_PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    icon: '⚡',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    description: '15 RPM Free Tier • Native Multimodal Vision',
    keyPlaceholder: 'AIzaSy...',
    keyStorageKey: 'locus_gemini_api_key',
    modelStorageKey: 'locus_gemini_active_model',
    defaultModel: 'gemini-3.8-flash',
    defaultModels: [
      { id: 'gemini-3.8-flash', label: '⭐ gemini-3.8-flash (Recommended • 15 RPM • 1M Tokens)' },
      { id: 'gemini-3.7-flash', label: '⚡ gemini-3.7-flash (Fast Flash • 15 RPM)' },
      { id: 'gemini-3.6-flash', label: '⚡ gemini-3.6-flash (Fast Flash • 15 RPM)' },
      { id: 'gemini-3.5-flash', label: '⚡ gemini-3.5-flash (Fast Flash • 15 RPM)' },
      { id: 'gemini-3.1-flash-lite', label: '⚡ gemini-3.1-flash-lite (Ultra Lightweight)' }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    shortName: 'OpenAI',
    icon: '🟢',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'GPT-4o & GPT-4o-mini Vision • High Availability',
    keyPlaceholder: 'sk-proj-...',
    keyStorageKey: 'locus_openai_api_key',
    modelStorageKey: 'locus_openai_active_model',
    defaultModel: 'gpt-4o-mini',
    defaultModels: [
      { id: 'gpt-4o-mini', label: '⭐ gpt-4o-mini (Ultra-fast • Economical • 128k Tokens)' },
      { id: 'gpt-4o', label: '🧠 gpt-4o (Flagship Multimodal Intelligence)' },
      { id: 'gpt-4.5-preview', label: '🔬 gpt-4.5-preview (Advanced Vision Reasoning)' }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    icon: '🟣',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'Claude 3.5 Sonnet / Haiku • Leading Visual Detail',
    keyPlaceholder: 'sk-ant-api03-...',
    keyStorageKey: 'locus_anthropic_api_key',
    modelStorageKey: 'locus_anthropic_active_model',
    defaultModel: 'claude-3-5-haiku-20241022',
    defaultModels: [
      { id: 'claude-3-5-haiku-20241022', label: '⚡ claude-3-5-haiku (Lightning-Fast Vision)' },
      { id: 'claude-3-5-sonnet-20241022', label: '⭐ claude-3-5-sonnet (Highest Clinical Detail)' },
      { id: 'claude-3-opus-20240229', label: '🧠 claude-3-opus (Complex Nuance)' }
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (Universal)',
    shortName: 'OpenRouter',
    icon: '🔶',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: '1 Universal Key for Gemini, Claude, Llama & OpenAI',
    keyPlaceholder: 'sk-or-v1-...',
    keyStorageKey: 'locus_openrouter_api_key',
    modelStorageKey: 'locus_openrouter_active_model',
    defaultModel: 'openai/gpt-4o-mini',
    defaultModels: [
      { id: 'openai/gpt-4o-mini', label: '⭐ openai/gpt-4o-mini (Fast & Cheap via OpenRouter)' },
      { id: 'google/gemini-2.0-flash-001', label: '⚡ google/gemini-2.0-flash-001' },
      { id: 'anthropic/claude-3.5-haiku', label: '⚡ anthropic/claude-3.5-haiku' },
      { id: 'meta-llama/llama-3.2-11b-vision-instruct', label: '🔷 meta-llama/llama-3.2-11b-vision-instruct' },
      { id: 'mistralai/pixtral-12b', label: '🔷 mistralai/pixtral-12b' }
    ]
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    shortName: 'Groq',
    icon: '⚡',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    description: 'LPU Ultra-Fast Vision Inference (~500ms)',
    keyPlaceholder: 'gsk_...',
    keyStorageKey: 'locus_groq_api_key',
    modelStorageKey: 'locus_groq_active_model',
    defaultModel: 'llama-3.2-11b-vision-preview',
    defaultModels: [
      { id: 'llama-3.2-11b-vision-preview', label: '⭐ llama-3.2-11b-vision-preview (Ultra-Fast LPU)' },
      { id: 'llama-3.2-90b-vision-preview', label: '🧠 llama-3.2-90b-vision-preview (Deep LPU Vision)' }
    ]
  }
];

// Helper to get active provider
export function getActiveAiProvider() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const p = localStorage.getItem(AI_ACTIVE_PROVIDER_KEY);
    if (p && SUPPORTED_PROVIDERS.some(prov => prov.id === p)) {
      return p;
    }
  }
  return 'gemini';
}

export function saveActiveAiProvider(providerId) {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(AI_ACTIVE_PROVIDER_KEY, providerId);
  }
}

// Helper to get / set provider failover
export function getProviderFailoverEnabled() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const val = localStorage.getItem(AI_AUTO_FAILOVER_KEY);
    return val !== 'false'; // Enabled by default
  }
  return true;
}

export function saveProviderFailoverEnabled(enabled) {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(AI_AUTO_FAILOVER_KEY, enabled ? 'true' : 'false');
  }
}

// Helper to get API Key for a provider
export function getProviderApiKey(providerId) {
  const prov = SUPPORTED_PROVIDERS.find(p => p.id === providerId);
  if (!prov) return '';
  if (providerId === 'gemini') return getStoredGeminiApiKey();

  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem(prov.keyStorageKey) || '';
  }
  return '';
}

export function saveProviderApiKey(providerId, key) {
  const prov = SUPPORTED_PROVIDERS.find(p => p.id === providerId);
  if (!prov) return;
  if (providerId === 'gemini') {
    saveStoredGeminiApiKey(key);
    return;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    if (key && key.trim()) {
      localStorage.setItem(prov.keyStorageKey, key.trim());
    } else {
      localStorage.removeItem(prov.keyStorageKey);
    }
  }
}

// Helper to get Model for a provider
export function getProviderModel(providerId) {
  const prov = SUPPORTED_PROVIDERS.find(p => p.id === providerId);
  if (!prov) return 'gemini-3.8-flash';
  if (providerId === 'gemini') return getStoredGeminiModel();

  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem(prov.modelStorageKey);
    if (saved && saved.trim()) return saved.trim();
  }
  return prov.defaultModel;
}

export function saveProviderModel(providerId, model) {
  const prov = SUPPORTED_PROVIDERS.find(p => p.id === providerId);
  if (!prov) return;
  if (providerId === 'gemini') {
    saveStoredGeminiModel(model);
    return;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    if (model && model.trim()) {
      localStorage.setItem(prov.modelStorageKey, model.trim());
    } else {
      localStorage.removeItem(prov.modelStorageKey);
    }
  }
}

/**
 * Standardized SOP Clinical Audit Prompt (Shared across ALL providers)
 */
export function buildStandardAuditPrompt(task, rules = INITIAL_CENTRAL_RULES) {
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

2. [torches] Dual Working Torches (Blue & Yellow):
   - BOTH torches must be illuminated and working:
     * Blue Torch (Cobalt blue filter for fluorescein corneal staining)
     * Yellow Torch (White/yellow illumination for anterior segment & pupillary reflex)
   - Visible light beam must be emitted.

3. [visionChart] 6-Meter Vision Distance Chart & Standee:
   - Vision testing chart properly mounted on wall or standee at required clinical distance.
   - Letters/Snellen optotypes sharp, legible, and properly lit.

4. [toolkit] Mandatory Refraction Diagnostic Toolkit:
   - Must show organized clinical toolkit containing:
     * Cross cylinder lens
     * Occluder
     * PD Ruler (Pupillary Distance)
     * Trial frame in clean, calibrated condition.

5. [frameDisplay] Frame Display & Trial Lens Kit:
   - Official Lenskart display tray with complete sample frame collection intact.
   - Full trial lens case present with sorted spherical/cylindrical lenses.

FRAUD & PHOTO INTEGRITY CHECK:
- Check for fraudulent photo uploads: covered camera lens, solid black image, blank white screenshot, blurred unidentifiable object, or duplicate pictures.
- If ANY photo is intentionally blank/black/obscured, mark as FRAUDULENT and FATAL immediately.

DETERMINISTIC ERROR MARGIN & CONFIDENCE:
- Calculate your Confidence Score (0% to 100%) based on photo lighting, sharpness, resolution, and angle.
- Calculate your Deterministic Error Margin as (100 - ConfidenceScore).

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
      "failureReasons": []
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
      "label": "3. Vision Distance Chart & Standee",
      "status": "PASS" | "FAIL",
      "score": number (0-100),
      "observations": "Observation details",
      "failureReasons": []
    },
    {
      "id": "toolkit",
      "label": "4. Refraction Diagnostic Toolkit",
      "status": "PASS" | "FAIL",
      "score": number (0-100),
      "observations": "Observation details",
      "failureReasons": []
    },
    {
      "id": "frameDisplay",
      "label": "5. Frame Display & Trial Lens Kit",
      "status": "PASS" | "FAIL",
      "score": number (0-100),
      "observations": "Observation details",
      "failureReasons": []
    }
  ],
  "equipmentReplacementsNeeded": []
}`;
}

/**
 * Downloads and prepares photos into raw base64 buffers
 */
export async function downloadAllPhotos(task) {
  const taskId = task.id || task.taskId;
  const imageMap = task.images || {};
  const imageKeys = ['selfie', 'torches', 'visionChart', 'toolkit', 'frameDisplay'];

  const promises = imageKeys.map(async (key) => {
    const rawUrl = imageMap[key];
    if (!rawUrl) {
      return { key, exists: false, base64Obj: null };
    }
    const cleanUrl = normalizeLocusUrl(rawUrl, taskId);
    try {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
      const res = await fetchWithTimeout(proxyUrl, {}, 12000);
      if (!res.ok) return { key, exists: false, base64Obj: null };
      const blob = await res.blob();
      const base64Obj = await compressAndResizeBlob(blob, 1024, 0.82);
      return { key, exists: Boolean(base64Obj), base64Obj };
    } catch (_) {
      return { key, exists: false, base64Obj: null };
    }
  });

  return await Promise.all(promises);
}

/**
 * Universal Test Connection function for any AI provider
 */
export async function testAnyProviderApiKey(providerId, apiKey, targetModel = null) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error(`Please enter a valid API key for ${providerId}.`);
  }

  const cleanKey = apiKey.trim();
  const prov = SUPPORTED_PROVIDERS.find(p => p.id === providerId) || SUPPORTED_PROVIDERS[0];
  const modelToUse = targetModel || getProviderModel(providerId) || prov.defaultModel;

  if (providerId === 'gemini') {
    const available = await listAvailableGeminiModels(cleanKey);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${cleanKey}`;
    const payload = {
      contents: [{ parts: [{ text: 'Respond with valid JSON: {"status":"OK"}' }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 15000);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Gemini Error ${res.status}: ${err}`);
    }
    return { success: true, provider: 'gemini', activeModel: modelToUse, availableModels: available };
  }

  if (providerId === 'openai') {
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const payload = {
      model: modelToUse,
      messages: [{ role: 'user', content: 'Respond with valid JSON: {"status":"OK"}' }],
      response_format: { type: 'json_object' },
      max_tokens: 30
    };
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`
      },
      body: JSON.stringify(payload)
    }, 15000);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Error ${res.status}: ${err}`);
    }
    return { success: true, provider: 'openai', activeModel: modelToUse };
  }

  if (providerId === 'anthropic') {
    const endpoint = 'https://api.anthropic.com/v1/messages';
    const payload = {
      model: modelToUse,
      max_tokens: 30,
      messages: [{ role: 'user', content: 'Respond with valid JSON: {"status":"OK"}' }]
    };
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cleanKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(payload)
    }, 15000);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic Claude Error ${res.status}: ${err}`);
    }
    return { success: true, provider: 'anthropic', activeModel: modelToUse };
  }

  if (providerId === 'openrouter') {
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    const payload = {
      model: modelToUse,
      messages: [{ role: 'user', content: 'Respond with valid JSON: {"status":"OK"}' }],
      response_format: { type: 'json_object' }
    };
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`,
        'HTTP-Referer': 'https://lenskart.com',
        'X-Title': 'Lenskart Auditor'
      },
      body: JSON.stringify(payload)
    }, 15000);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter Error ${res.status}: ${err}`);
    }
    return { success: true, provider: 'openrouter', activeModel: modelToUse };
  }

  if (providerId === 'groq') {
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const payload = {
      model: modelToUse,
      messages: [{ role: 'user', content: 'Respond with valid JSON: {"status":"OK"}' }],
      response_format: { type: 'json_object' }
    };
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`
      },
      body: JSON.stringify(payload)
    }, 15000);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq Error ${res.status}: ${err}`);
    }
    return { success: true, provider: 'groq', activeModel: modelToUse };
  }

  throw new Error(`Unknown provider: ${providerId}`);
}

/**
 * Universal Multi-Provider Multimodal Vision Evaluator
 */
export async function auditTaskMultiProvider({
  task,
  providerId = 'gemini',
  apiKey = null,
  modelId = null,
  rules = INITIAL_CENTRAL_RULES,
  onProgress,
  enableProviderFailover = true
}) {
  const activeProvId = providerId || getActiveAiProvider();
  const prov = SUPPORTED_PROVIDERS.find(p => p.id === activeProvId) || SUPPORTED_PROVIDERS[0];
  const activeKey = apiKey || getProviderApiKey(activeProvId);
  const activeModel = modelId || getProviderModel(activeProvId) || prov.defaultModel;

  if (!activeKey || !activeKey.trim()) {
    throw new Error(`API Key for ${prov.name} is missing. Please configure it in AI Audits settings.`);
  }

  const taskId = task.id || task.taskId;
  const imageMap = task.images || {};
  const imageKeys = ['selfie', 'torches', 'visionChart', 'toolkit', 'frameDisplay'];
  const availableKeys = imageKeys.filter(k => Boolean(imageMap[k]));

  // Zero-image deterministic FATAL
  if (availableKeys.length === 0) {
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
      providerUsed: activeProvId,
      modelUsed: activeModel,
      totalTokens: 0,
      rawAiResponse: null
    };
  }

  // 1. Download and optimize 5 photos in true parallel
  if (onProgress) onProgress({ step: 'DOWNLOADING_IMAGES', message: `Downloading & optimizing ${availableKeys.length} clinical photos concurrently...` });
  const downloadedPhotos = await downloadAllPhotos(task);

  // 2. Build standard clinical audit instruction
  const promptText = buildStandardAuditPrompt(task, rules);

  // Helper to execute single provider query
  const executeProviderQuery = async (targetProv, targetKey, targetModel) => {
    if (onProgress) onProgress({ 
      step: 'QUERYING_AI', 
      message: `Auditing with ${targetProv.name} (${targetModel})...` 
    });

    if (targetProv.id === 'gemini') {
      const imageParts = downloadedPhotos.flatMap(p => {
        if (!p.exists || !p.base64Obj) {
          return [{ text: `[STATION PHOTO: ${p.key}] (NO PHOTO UPLOADED OR DOWNLOAD FAILED)` }];
        }
        return [
          { text: `[STATION PHOTO: ${p.key}]` },
          { inline_data: { mime_type: p.base64Obj.mimeType, data: p.base64Obj.data } }
        ];
      });

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${targetKey.trim()}`;
      const payload = {
        contents: [{ parts: [{ text: promptText }, ...imageParts] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      };

      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 40000);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Google Gemini Error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = extractJsonFromText(rawText);
      const usage = data.usageMetadata || {};
      const tokens = (usage.promptTokenCount || 1500) + (usage.candidatesTokenCount || 400);

      return { parsed, tokens, provider: targetProv.id, model: targetModel, raw: data };
    }

    if (targetProv.id === 'openai' || targetProv.id === 'openrouter' || targetProv.id === 'groq') {
      const endpoint = targetProv.id === 'openai' 
        ? 'https://api.openai.com/v1/chat/completions'
        : (targetProv.id === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions');

      const userContent = [{ type: 'text', text: promptText }];
      downloadPhotosForOpenAI(downloadedPhotos, userContent);

      const payload = {
        model: targetModel,
        messages: [{ role: 'user', content: userContent }],
        response_format: { type: 'json_object' },
        temperature: 0.1
      };

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${targetKey.trim()}`
      };
      if (targetProv.id === 'openrouter') {
        headers['HTTP-Referer'] = 'https://lenskart.com';
        headers['X-Title'] = 'Lenskart Auditor';
      }

      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      }, 45000);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`${targetProv.name} Error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const rawText = data.choices?.[0]?.message?.content;
      const parsed = extractJsonFromText(rawText);
      const usage = data.usage || {};
      const tokens = usage.total_tokens || 1800;

      return { parsed, tokens, provider: targetProv.id, model: targetModel, raw: data };
    }

    if (targetProv.id === 'anthropic') {
      const endpoint = 'https://api.anthropic.com/v1/messages';
      const userContent = [{ type: 'text', text: promptText }];

      downloadedPhotos.forEach(p => {
        if (p.exists && p.base64Obj) {
          userContent.push({
            type: 'text',
            text: `[STATION PHOTO: ${p.key}]`
          });
          userContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: p.base64Obj.mimeType || 'image/jpeg',
              data: p.base64Obj.data
            }
          });
        }
      });

      const payload = {
        model: targetModel,
        max_tokens: 3000,
        temperature: 0.1,
        messages: [{ role: 'user', content: userContent }]
      };

      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': targetKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(payload)
      }, 45000);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Anthropic Claude Error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const rawText = data.content?.map(c => c.text || '').join('');
      const parsed = extractJsonFromText(rawText);
      const usage = data.usage || {};
      const tokens = (usage.input_tokens || 1400) + (usage.output_tokens || 400);

      return { parsed, tokens, provider: targetProv.id, model: targetModel, raw: data };
    }

    throw new Error(`Unsupported provider: ${targetProv.id}`);
  };

  // Execute primary provider with automatic failover if credits or quota are exhausted
  try {
    const outcome = await executeProviderQuery(prov, activeKey, activeModel);
    return finalizeOutcome(outcome, downloadedPhotos);
  } catch (primaryErr) {
    const errMsg = primaryErr.message.toLowerCase();
    const isCreditOrQuotaError = 
      errMsg.includes('quota') || 
      errMsg.includes('credit') || 
      errMsg.includes('resource_exhausted') || 
      errMsg.includes('insufficient_quota') || 
      errMsg.includes('rate limit') || 
      errMsg.includes('429') ||
      errMsg.includes('unavailable') ||
      errMsg.includes('503');

    // If failover is permitted and credit/rate limit was hit: check other configured providers
    if (enableProviderFailover && isCreditOrQuotaError) {
      const otherProviders = SUPPORTED_PROVIDERS.filter(p => p.id !== activeProvId);
      for (const backupProv of otherProviders) {
        const backupKey = getProviderApiKey(backupProv.id);
        if (backupKey && backupKey.trim()) {
          const backupModel = getProviderModel(backupProv.id) || backupProv.defaultModel;
          if (onProgress) onProgress({
            step: 'PROVIDER_FAILOVER',
            message: `${prov.name} credits/quota issue detected. Auto-failing over to ${backupProv.name} (${backupModel})...`
          });

          try {
            const outcome = await executeProviderQuery(backupProv, backupKey, backupModel);
            return finalizeOutcome(outcome, downloadedPhotos);
          } catch (backupErr) {
            console.warn(`Failover provider ${backupProv.name} also failed:`, backupErr.message);
          }
        }
      }
    }

    throw primaryErr;
  }
}

function downloadPhotosForOpenAI(downloadedPhotos, userContent) {
  downloadedPhotos.forEach(p => {
    if (p.exists && p.base64Obj) {
      userContent.push({
        type: 'text',
        text: `[STATION PHOTO: ${p.key}]`
      });
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${p.base64Obj.mimeType || 'image/jpeg'};base64,${p.base64Obj.data}`,
          detail: 'high'
        }
      });
    } else {
      userContent.push({
        type: 'text',
        text: `[STATION PHOTO: ${p.key}] (NO PHOTO UPLOADED FOR THIS CRITERION)`
      });
    }
  });
}

function finalizeOutcome(outcome, downloadedPhotos) {
  const { parsed, tokens, provider, model, raw } = outcome;
  const isFatal = parsed.verdict === 'FATAL' || (parsed.criteriaEvaluation || []).some(c => c.status === 'FAIL');

  return {
    verdict: isFatal ? 'FATAL' : 'PASS',
    overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : (isFatal ? 45 : 100),
    confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 95,
    errorMargin: typeof parsed.errorMargin === 'number' ? parsed.errorMargin : 5,
    summary: parsed.summary || (isFatal ? 'Clinical SOP non-compliance detected by multimodal inspection.' : 'All clinical SOP criteria verified and compliant.'),
    isFraudulentOrBlankDetected: Boolean(parsed.isFraudulentOrBlankDetected),
    criteriaEvaluation: (parsed.criteriaEvaluation || []).map(c => ({
      id: c.id,
      label: c.label || c.id,
      status: c.status === 'PASS' ? 'PASS' : 'FAIL',
      score: typeof c.score === 'number' ? c.score : (c.status === 'PASS' ? 100 : 0),
      observations: c.observations || '',
      failureReasons: Array.isArray(c.failureReasons) ? c.failureReasons : []
    })),
    equipmentReplacementsNeeded: parsed.equipmentReplacementsNeeded || [],
    providerUsed: provider,
    modelUsed: model,
    auditorName: `${model} (${provider.toUpperCase()})`,
    totalTokens: tokens || 1800,
    rawAiResponse: raw
  };
}
