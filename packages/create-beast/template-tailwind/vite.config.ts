import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { beastOctane } from "beast-tsrx/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [tailwindcss(), beastOctane()],
});
