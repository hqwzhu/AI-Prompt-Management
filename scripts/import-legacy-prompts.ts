import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { TextDecoder } from "node:util";
import { parseLegacyPromptFile } from "../src/lib/prompt-utils";
import type { PromptEntry } from "../src/types";

const defaultSourceRoot =
  "E:\\AiProject\\【软件】ai提示词秘籍软件优化3.8\\unpacked\\AI提示词\\聊天文本";
const sourceRoot = process.env.LEGACY_PROMPT_SOURCE || defaultSourceRoot;
const supportedExtensions = new Set([".txt", ".csv", ".csw"]);

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

const entries = withUniqueIds(
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

writeGeneratedFiles(entries);

console.log(`Imported ${entries.length} prompts from ${sourceRoot}`);
console.log(`Generated ${join(process.cwd(), "src", "data", "generated-prompts.ts")}`);
console.log(`Generated ${join(process.cwd(), "public", "prompts.json")}`);
