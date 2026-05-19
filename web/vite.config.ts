import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to 0.0.0.0 so a phone (or another laptop) on the same Wi-Fi
    // can hit this dev server at http://<your-LAN-IP>:5173 and share
    // the same library.json on the host PC. Crucial for the "onboard
    // images from my phone, push to Anki on my PC" flow.
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4400",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
