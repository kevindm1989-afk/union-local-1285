import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      base: basePath,
      manifest: {
        name: "Unionize",
        short_name: "Unionize",
        description: "Unionize — Member & Steward Portal",
        theme_color: "#1a3a5c",
        background_color: "#1a3a5c",
        display: "standalone",
        start_url: basePath,
        scope: basePath,
        orientation: "portrait",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /\/api\/announcements(\?.*)?$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-bulletins",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\/members(\?.*)?$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-members",
              expiration: { maxEntries: 200, maxAgeSeconds: 5 * 60 },
            },
          },
          {
            urlPattern: /\/api\/grievances(\?.*)?$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-grievances",
              expiration: { maxEntries: 200, maxAgeSeconds: 5 * 60 },
            },
          },
          {
            urlPattern: /\/api\/meetings(\?.*)?$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-meetings",
              expiration: { maxEntries: 100, maxAgeSeconds: 15 * 60 },
            },
          },
          {
            urlPattern: /\/api\/documents(\?.*)?$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-documents",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 60 },
            },
          },
          {
            urlPattern: /\/api\/(grievances|members)(\/.*)?$/,
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "offline-writes",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: /\/api\/(grievances|members)(\/.*)?$/,
            handler: "NetworkOnly",
            method: "PATCH",
            options: {
              backgroundSync: {
                name: "offline-writes",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: /\/api\/(grievances|members)(\/.*)?$/,
            handler: "NetworkOnly",
            method: "DELETE",
            options: {
              backgroundSync: {
                name: "offline-writes",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
        ],
        navigateFallback: "index.html",
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/react-is/") || id.includes("/scheduler/")) {
              return "vendor-react";
            }
            if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query")) {
              return "vendor-query";
            }
            if (id.includes("@radix-ui/")) {
              return "vendor-ui";
            }
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
