import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { TextDecoder } from "node:util";
import { parseLegacyPromptFile } from "../src/lib/prompt-utils";
import type { PromptEntry, PromptTranslation } from "../src/types";

const defaultSourceRoot = join(process.cwd(), "prompt-source", "聊天文本");
const sourceRoot = process.env.LEGACY_PROMPT_SOURCE || defaultSourceRoot;
const translationPath = join(process.cwd(), "prompt-source", "translations", "en.json");
const curatedPath = join(process.cwd(), "prompt-source", "curated", "feishu.json");
const supportedExtensions = new Set([".txt", ".csv", ".csw"]);
const englishTranslations = JSON.parse(readFileSync(translationPath, "utf8")) as Record<
  string,
  PromptTranslation
>;

function walkFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    return supportedExtensions.has(extname(entry.name).toLowerCase()) ? [fullPath] : [];
  });
}

function decodeFile(fullPath: string) {
  const buffer = readFileSync(fullPath);
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("gb18030").decode(buffer);
}

function withUniqueIds(entries: PromptEntry[]) {
  const counts = new Map<string, number>();
  return entries.map((entry) => {
    const count = counts.get(entry.id) ?? 0;
    counts.set(entry.id, count + 1);
    return count ? { ...entry, id: `${entry.id}-${count + 1}` } : entry;
  });
}

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

const legacyEntries = withUniqueIds(
  walkFiles(sourceRoot)
    .map((fullPath) => {
      const relativePath = relative(sourceRoot, fullPath).replace(/\\/g, "/");
      return parseLegacyPromptFile({
        relativePath: `聊天文本/${relativePath}`,
        content: decodeFile(fullPath),
      });
    })
    .filter((entry) => entry.prompt.length > 8),
);

const localizedLegacyEntries = legacyEntries.map((entry) => ({
  ...entry,
  translations: {
    en: englishTranslations[entry.id],
  },
}));
const curatedEntries = existsSync(curatedPath)
  ? (
      JSON.parse(readFileSync(curatedPath, "utf8")) as {
        entries: PromptEntry[];
      }
    ).entries
  : [];
const entries = [...localizedLegacyEntries, ...curatedEntries];
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

console.log(`Imported ${legacyEntries.length} legacy prompts from ${sourceRoot}`);
console.log(`Imported ${curatedEntries.length} curated prompts from ${curatedPath}`);
console.log(`Generated ${entries.length} prompts in total`);
console.log(`Generated ${join(process.cwd(), "src", "data", "generated-prompts.ts")}`);
console.log(`Generated ${join(process.cwd(), "public", "prompts.json")}`);
