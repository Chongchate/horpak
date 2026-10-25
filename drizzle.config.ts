import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Same env files as Next.js; .env.local wins.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  entities: { roles: { provider: "supabase" } },
});
