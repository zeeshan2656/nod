import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Advanced manual code splitting to reduce initial JS load for better PageSpeed performance
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Split out core libs
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('axios')) {
              return 'vendor-axios';
            }
            // Keep other libraries isolated
            return 'vendor-libs';
          }
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  server: {
    port: 3000 // Port mapping for local React server
  }
})
