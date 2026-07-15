import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PromptEntry } from "../src/types";

const curatedPath = join(process.cwd(), "prompt-source", "curated", "feishu.json");

function writeGeneratedFiles(entries: PromptEntry[]) {
  const categories = Array.from(new Set(entries.map((entry) => entry.category))).sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN"),
  );
  const stats = {
    total: entries.length,
    categories: categories.length,
    generatedAt: new Date().toISOString(),
  };
  const dataDir = join(process.cwd(), "src", "data");
  const publicDir = join(process.cwd(), "public");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  const tsOutput = `import type { PromptEntry } from "../types";\n\nexport const promptEntries = ${JSON.stringify(
    entries,
    null,
    2,
  )} satisfies PromptEntry[];\n\nexport const promptCategories = ${JSON.stringify(
    categories,
    null,
    2,
  )} as const;\n\nexport const promptLibraryStats = ${JSON.stringify(stats, null, 2)} as const;\n`;

  writeFileSync(join(dataDir, "generated-prompts.ts"), tsOutput, "utf8");
  writeFileSync(join(publicDir, "prompts.json"), JSON.stringify({ stats, categories, entries }, null, 2), "utf8");
}

const entries = (
  JSON.parse(readFileSync(curatedPath, "utf8")) as {
    entries: PromptEntry[];
  }
).entries;
const missingTranslations = entries.filter((entry) => !entry.translations?.en);
if (missingTranslations.length) {
  throw new Error(
    `Missing English translations for: ${missingTranslations.map((entry) => entry.id).join(", ")}`,
  );
}

const ids = new Set<string>();
const duplicateIds = entries.filter((entry) => {
  if (ids.has(entry.id)) return true;
  ids.add(entry.id);
  return false;
});
if (duplicateIds.length) {
  throw new Error(`Duplicate prompt ids: ${duplicateIds.map((entry) => entry.id).join(", ")}`);
}

writeGeneratedFiles(entries);

console.log(`Imported ${entries.length} curated prompts from ${curatedPath}`);
console.log(`Generated ${join(process.cwd(), "src", "data", "generated-prompts.ts")}`);
console.log(`Generated ${join(process.cwd(), "public", "prompts.json")}`);
