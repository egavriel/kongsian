import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "b01a3f3d1c2b721bd7bc487200439614",
    databaseId: process.env.D1_DATABASE_ID || "477704de-7334-46aa-8b70-4ee8cfbbad3e",
    token: process.env.CLOUDFLARE_API_TOKEN || "",
  },
  verbose: true,
  strict: true,
});
