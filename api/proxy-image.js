import https from 'https';
import http from 'http';
import { URL } from 'url';

// In local development behind corporate firewalls/proxies (e.g. Lenskart network), permit TLS negotiation
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// In-memory cache for downloaded image buffers to avoid refetching identical images
// Key: normalized targetUrl -> { buffer, contentType, timestamp }
const imageCache = new Map();
const MAX_CACHE_ITEMS = 1200;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normalizes Locus URLs directly to the assets CDN to eliminate unnecessary 302 redirects.
 */
function normalizeLocusUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  let url = rawUrl.trim();
  // Fast path: locus-api.com and api.locus-api.com always 302 redirect to assets.locus-api.com
  url = url.replace(/^http:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  url = url.replace(/^https:\/\/locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  url = url.replace(/^http:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  url = url.replace(/^https:\/\/api\.locus-api\.com\/v1\/client\//, 'https://assets.locus-api.com/v1/client/');
  return url;
}

/**
 * Recursively fetches a remote URL with:
 * 1. Automatic 301/302/307/308 redirect following on the server (avoids browser CORS issues)
 * 2. Automatic 429 (Too Many Requests) / 503 retry with exponential backoff (up to 4 server retries)
 */
async function fetchWithRetryAndRedirects(targetUrl, maxRedirects = 5, retryCount = 0) {
  if (maxRedirects <= 0) {
    throw new Error('Too many redirects while fetching image');
  }

  const effectiveUrl = normalizeLocusUrl(targetUrl);

  let urlObj;
  try {
    urlObj = new URL(effectiveUrl);
  } catch (e) {
    throw new Error('Invalid URL: ' + effectiveUrl);
  }

  const client = urlObj.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(effectiveUrl, {
      timeout: 25000,
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, async (res) => {
      // 1. Follow HTTP 301, 302, 303, 307, 308 redirects INTERNALLY
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          redirectUrl = new URL(redirectUrl, effectiveUrl).toString();
        }
        res.resume(); // Discard redirect stream
        try {
          const result = await fetchWithRetryAndRedirects(redirectUrl, maxRedirects - 1, retryCount);
          resolve(result);
        } catch (err) {
          reject(err);
        }
        return;
      }

      // 2. Handle HTTP 429 Too Many Requests or 503 with Exponential Backoff
      if ((res.statusCode === 429 || res.statusCode === 503) && retryCount < 4) {
        res.resume();
        const retryHeader = parseInt(res.headers['retry-after'], 10);
        // Generous backoff on 429: 2000ms, 4500ms, 9000ms, 18000ms + random jitter
        const backoffMs = !isNaN(retryHeader) && retryHeader > 0
          ? retryHeader * 1000
          : Math.floor(2000 * Math.pow(2.2, retryCount) + Math.random() * 1500);

        console.warn(`[Proxy] Upstream 429 on ${effectiveUrl}. Backing off for ${backoffMs}ms (retry ${retryCount + 1}/4)...`);
        await sleep(backoffMs);
        try {
          const result = await fetchWithRetryAndRedirects(effectiveUrl, maxRedirects, retryCount + 1);
          resolve(result);
        } catch (err) {
          reject(err);
        }
        return;
      }

      // 3. Upstream HTTP errors
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Upstream returned HTTP ${res.statusCode}`));
      }

      // 4. Download and buffer the image
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/jpeg';
        resolve({ buffer, contentType });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Upstream image request timed out'));
    });
  });
}

/**
 * Universal Serverless Image Proxy Handler
 * Compatible with Vercel Serverless Functions (/api/proxy-image)
 * and Vite Dev Server middleware.
 */
export async function proxyImageHandler(req, res) {
  // Always set CORS headers so browser fetch and canvas pixel reading succeed
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url, 'http://localhost:3000');
    const targetUrl = parsedUrl.searchParams.get('url');

    if (!targetUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required query parameter "url"' }));
      return;
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid URL protocol' }));
      return;
    }

    const normalized = normalizeLocusUrl(targetUrl);

    // Check memory cache
    const cached = imageCache.get(normalized) || imageCache.get(targetUrl);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Content-Length', cached.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.end(cached.buffer);
      return;
    }

    const { buffer, contentType } = await fetchWithRetryAndRedirects(normalized, 5, 0);

    // Save in cache (manage cache size limit)
    if (imageCache.size >= MAX_CACHE_ITEMS) {
      const oldestKey = imageCache.keys().next().value;
      imageCache.delete(oldestKey);
    }
    imageCache.set(normalized, { buffer, contentType, timestamp: Date.now() });

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.end(buffer);

  } catch (err) {
    console.warn('proxyImageHandler error for', req.url, ':', err.message);
    if (!res.headersSent) {
      // If rate limited, return 429 cleanly so client can back off gracefully
      const isRateLimited = err.message.includes('429') || err.message.includes('Too Many Requests');
      const status = isRateLimited ? 429 : 502;
      res.statusCode = status;
      if (isRateLimited) {
        res.setHeader('Retry-After', '6');
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: isRateLimited 
          ? 'Locus Rate Limit 429 (Too Many Requests). Upstream CDN requested backoff.'
          : 'Failed to fetch upstream image: ' + err.message 
      }));
    }
  }
}

export default proxyImageHandler;
