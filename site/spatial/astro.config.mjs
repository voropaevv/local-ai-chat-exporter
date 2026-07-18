import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [react()],
  output: "static",
  build: {
    assets: "_assets"
  },
  vite: {
    build: {
      sourcemap: false
    },
    server: {
      host: "127.0.0.1"
    }
  }
});
