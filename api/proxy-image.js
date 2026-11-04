import https from 'https';
import http from 'http';
import { URL } from 'url';

// In local development behind corporate firewalls/proxies (e.g. Lenskart network), permit TLS negotiation
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

/**
 * Universal Serverless Image Proxy Handler
 * Compatible with Vercel Serverless Functions (/api/proxy-image)
 * and Vite Dev Server middleware.
 * 
 * Fetches remote images (e.g. from locus-api.com) and returns them
 * with proper CORS headers to allow canvas pixel reading and SHA-256 analysis.
 */
export async function proxyImageHandler(req, res) {
  // Set CORS headers
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

    // Validate protocol
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid URL protocol. Only HTTP and HTTPS supported.' }));
      return;
    }

    const client = targetUrl.startsWith('https://') ? https : http;

    const request = client.get(targetUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LocusAuditorForensics/1.0',
        'Accept': 'image/*,*/*'
      }
    }, (upstreamRes) => {
      // Follow redirect if 301/302
      if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
        let redirectUrl = upstreamRes.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const origin = new URL(targetUrl).origin;
          redirectUrl = origin + redirectUrl;
        }
        res.writeHead(302, { Location: `/api/proxy-image?url=${encodeURIComponent(redirectUrl)}` });
        res.end();
        return;
      }

      if (upstreamRes.statusCode !== 200) {
        res.statusCode = upstreamRes.statusCode || 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `Upstream returned status ${upstreamRes.statusCode}` }));
        return;
      }

      const contentType = upstreamRes.headers['content-type'] || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

      upstreamRes.pipe(res);
    });

    request.on('error', (err) => {
      console.warn('Image proxy fetch error:', err.message);
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Failed to fetch upstream image: ' + err.message }));
      }
    });

    request.on('timeout', () => {
      request.destroy();
      if (!res.headersSent) {
        res.statusCode = 504;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Upstream image request timed out' }));
      }
    });

  } catch (err) {
    console.error('proxyImageHandler fatal:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Internal proxy error' }));
    }
  }
}

export default proxyImageHandler;
