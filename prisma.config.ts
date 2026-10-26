import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

// Standard mode (macOS / CI): Prisma uses its native schema engine and DATABASE_URL.
// PRISMA_WASM=1: run the schema engine as WebAssembly through the pg driver adapter
// (useful in locked-down environments where native engine downloads are blocked).
const base = {
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
};

export default process.env.PRISMA_WASM === "1"
  ? defineConfig({
      ...base,
      experimental: { adapter: true },
      engine: "js",
      async adapter() {
        return new PrismaPg({ connectionString: process.env.DATABASE_URL! });
      },
    })
  : defineConfig(base);
