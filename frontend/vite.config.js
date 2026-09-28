import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  legacy: {
    inconsistentCjsInterop: true,
  },

  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    css: true,
  },
});