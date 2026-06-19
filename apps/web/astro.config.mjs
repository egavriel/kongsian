// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  site: "https://oatlet.com",
  server: {
    port: 4321,
    host: true,
  },
  vite: {
    ssr: {
      external: ["@kongsian/db", "drizzle-orm"],
    },
  },
});
