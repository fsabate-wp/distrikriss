import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,webp,png,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        name: 'DistriKriss',
        short_name: 'DistriKriss',
        description: 'Pide online en DistriKriss con entrega programada',
        theme_color: '#ff0000',
        background_color: '#ff0000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'es',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'classic',
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
