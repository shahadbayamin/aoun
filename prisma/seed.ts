import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedDemo, DEMO, DEMO_PASSWORD } from "../src/lib/demo/seed";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

seedDemo(prisma, (m) => console.log("  ✓", m))
  .then(() => {
    console.log("\nTaree demo data seeded (FICTIONAL). Password for every demo account:", DEMO_PASSWORD);
    console.log("  Patients (login with national ID):", Object.values(DEMO.patients).filter((p) => p.account).map((p) => p.nationalId).join(", "));
    console.log("  Staff:", Object.values(DEMO.staff).map((s) => s.email).join(", "));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
