import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const demoModeEnabled = env.VITE_DEMO_MODE === "true";
  const supabaseConfigured = Boolean(
    env.VITE_SUPABASE_URL?.trim() &&
    (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY)?.trim()
  );
  const memberPlatformAvailable =
    demoModeEnabled ||
    (env.VITE_MEMBER_PLATFORM_ENABLED === "true" && supabaseConfigured);

  return {
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          maplibre: ["maplibre-gl"],
          qrcode: ["qrcode"],
          scanner: ["@zxing/browser"]
        }
      }
    }
  },
  plugins: [
    react(),
    {
      name: "prerender-public-pages",
      apply: "build",
      closeBundle: {
        sequential: true,
        order: "pre",
        async handler(error) {
          if (error) return;
          const result = await run(process.execPath, ["scripts/prerender-pages.mjs", mode], {
            cwd: process.cwd(),
            env: process.env,
            maxBuffer: 10 * 1024 * 1024
          });
          if (result.stdout) console.log(result.stdout.trim());
          if (result.stderr) console.warn(result.stderr.trim());
        }
      }
    },
    VitePWA({
      integration: { closeBundleOrder: "post" },
      registerType: "prompt",
      manifest: {
        name: "Armature AI Labs - The Physical AI and Robotics Lab",
        short_name: "Armature AI Labs",
        description:
          "Explore robotics, fabrication, compute, and lab projects at Armature AI Labs in HSR Layout, Bengaluru.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#111110",
        theme_color: "#111110",
        categories: ["productivity", "education", "business"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ],
        shortcuts: [
          ...(memberPlatformAvailable ? [{
            name: "Book",
            short_name: "Book",
            url: "/book",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }]
          },
          {
            name: "My bookings",
            short_name: "Bookings",
            url: "/bookings",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }]
          },
          {
            name: "Check in",
            short_name: "Check in",
            url: "/check-in",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }]
          }] : []),
          {
            name: "Maker desk",
            short_name: "Maker desk",
            url: "/maker-desk",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }]
          }
        ]
      },
      workbox: {
        navigateFallback: "/app-shell.html",
        skipWaiting: false,
        clientsClaim: true,
        globPatterns: [
          "index.html",
          "app-shell.html",
          "apple-touch-icon.png",
          "assets/*.{js,css}"
        ],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.(co|in)\/.*/i,
            handler: "NetworkOnly",
            method: "GET"
          },
          {
            urlPattern:
              /\/(?:api|functions|rest|rpc|auth|availability|booking|bookings|check-in|checkin|calendar|components\/request|component-requests?|inventory|checkout|cabinet|lockers|consumables|toolkits|maker-services|dashboard|profile|admin|kiosk)(?:\/|$)/i,
            handler: "NetworkOnly",
            method: "GET"
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "armature-fonts",
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      devOptions: { enabled: true }
    })
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/frontend/setup.ts"],
    css: true,
    globals: true,
    exclude: ["tests/frontend/e2e/**", "node_modules/**", "dist/**"]
  }
  };
});
