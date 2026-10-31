import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// Lists the built files for the service worker. The camera decoder and
// non-Latin font files are left to load only when they are needed.
const assetList = (): Plugin => ({
  name: "asset-list",
  generateBundle(_, bundle) {
    const files = Object.keys(bundle)
      .filter((file) => file.startsWith("assets/"))
      .filter(
        (file) => !/\.woff2?$/.test(file) || /-(latin|devanagari)-/.test(file),
      )
      .filter(
        (file) =>
          !/^assets\/(esm|BarcodeButton)/.test(file) || !file.endsWith(".js"),
      )
      .map((file) => `/${file}`);
    this.emitFile({
      type: "asset",
      fileName: "asset-list.json",
      source: JSON.stringify(files),
    });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), assetList()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/firebase") ||
            id.includes("node_modules/@firebase")
          )
            return "firebase";
          if (id.includes("node_modules/react")) return "react";
        },
      },
    },
  },
});
