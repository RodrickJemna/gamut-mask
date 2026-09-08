import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the build works when opened straight from disk over
  // file:// rather than only from a server. See scripts/bundle.mjs.
  base: './',
  plugins: [react()],
})
