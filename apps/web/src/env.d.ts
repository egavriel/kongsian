/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly kongsian_db: D1Database;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
