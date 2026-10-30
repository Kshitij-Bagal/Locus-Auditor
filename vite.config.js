import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sendEmailHandler } from './api/send-email.js'

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
