import { PrismaClient } from "@prisma/client";
import { DemoReadOnlyError, isBlockedDemoWrite, isDemoWriteGuardOn, isWritingSql, rawSqlText } from "@/lib/demo/mode";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  if (!isDemoWriteGuardOn()) return client;
  // 2026-10-29, public view-only demo (see src/lib/demo/mode.ts). The proxy already refuses every saving request;
  // this is the second safety net: in demo mode the database itself refuses any write except sign-in sessions,
  // so nothing a visitor does (or a page that writes while loading) can change the demo data. The demo seed
  // runs with DEMO_SEEDING=1 so it can still build the data.
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (isBlockedDemoWrite(model, operation)) throw new DemoReadOnlyError();
          return query(args);
        },
      },
      async $executeRaw() { throw new DemoReadOnlyError(); },
      async $executeRawUnsafe() { throw new DemoReadOnlyError(); },
      async $queryRaw({ args, query }) {
        if (isWritingSql(rawSqlText(args))) throw new DemoReadOnlyError();
        return query(args);
      },
      async $queryRawUnsafe({ args, query }) {
        if (isWritingSql(rawSqlText(args))) throw new DemoReadOnlyError();
        return query(args);
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
