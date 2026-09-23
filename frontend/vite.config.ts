import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      devOptions: { enabled: false },
      manifest: {
        name: "План закупок",
        short_name: "Закупки",
        lang: "ru",
        description: "Расчёт пополнения склада и подготовка заказов поставщикам",
        theme_color: "#172c35",
        background_color: "#f5f4ef",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        // API responses are deliberately not cached.
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:7575",
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:7575",
      },
    },
  },
});
