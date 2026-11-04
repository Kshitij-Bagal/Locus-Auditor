import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sendEmailHandler } from './api/send-email.js'
import { dailyDigestCronHandler } from './api/cron/daily-digest.js'
import { dailyFeFatalDigestCronHandler } from './api/cron/daily-fe-fatal-digest.js'
import { proxyImageHandler } from './api/proxy-image.js'

// In local development behind corporate firewalls/proxies (e.g. Lenskart network), permit TLS connections
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function emailDevPlugin() {
  return {
    name: 'email-dev-server-plugin',
    configureServer(server) {
      server.middlewares.use('/api/send-email', async (req, res, next) => {
        try {
          await sendEmailHandler(req, res);
        } catch (err) {
          next(err);
        }
      });

      server.middlewares.use('/api/cron/daily-digest', async (req, res, next) => {
        try {
          await dailyDigestCronHandler(req, res);
        } catch (err) {
          next(err);
        }
      });

      server.middlewares.use('/api/cron/daily-fe-fatal-digest', async (req, res, next) => {
        try {
          await dailyFeFatalDigestCronHandler(req, res);
        } catch (err) {
          next(err);
        }
      });

      server.middlewares.use('/api/proxy-image', async (req, res, next) => {
        try {
          await proxyImageHandler(req, res);
        } catch (err) {
          next(err);
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    emailDevPlugin()
  ],
  server: {
    port: 3000,
    open: false
  }
})
