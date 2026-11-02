// Version-pinned Prisma WASM generator; avoids the CLI's unnecessary native-engine prefetch.
// Prisma 7.10.1 has extensionless ESM imports; select its published CommonJS entry.
import { createRequire } from "node:module";
const loadCommonJs = createRequire(import.meta.url);
const { getGenerators } = loadCommonJs("@prisma/internals");
const { PrismaClientJsGenerator } = loadCommonJs("@prisma/client-generator-js");
async function main() {
  const generators = await getGenerators({
    schemaPath: "prisma/schema.prisma",
    registry: {
      "prisma-client-js": {
        type: "in-process",
        generator: new PrismaClientJsGenerator({
          cliCommand: "prisma generate",
        }),
      },
    },
    cliCommand: "prisma generate",
  });
  try {
    for (const generator of generators) await generator.generate();
  } finally {
    for (const generator of generators) generator.stop();
  }
  console.log("Prisma JS client generated via WASM.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
