/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // GitHub Pages project site is served from /<repo>/; override at build time
  // for forks or custom domains via `VITE_BASE` (e.g. VITE_BASE=/ for a root
  // user.github.io site or a CNAME-backed custom domain).
  base: process.env.VITE_BASE ?? '/evaluator/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
