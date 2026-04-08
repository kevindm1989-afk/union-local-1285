import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      base: basePath,
      manifest: {
        name: "Union Steward App",
        short_name: "Union Local",
        description: "Union Steward Management Portal",
        theme_color: "#1a3a5c",
        background_color: "#ffffff",
        display: "standalone",
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
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
        ],
        navigateFallback: null,
      },
      devOptions: {
        enabled: false,
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
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
