import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// `base` matches the GitHub Pages path (https://fooping-tech.github.io/MandalaFab/).
export default defineConfig({
  base: "/MandalaFab/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { target: "esnext" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
