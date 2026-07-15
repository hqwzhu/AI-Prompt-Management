import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanPdfPromptText,
  createCuratedPromptEntries,
  dedupeCuratedPrompts,
  deriveCuratedTitleFromText,
  extractPromptsFromFeishuRecords,
  isUnsafeCuratedPrompt,
  type CuratedPromptDraft,
  type FeishuRecordDocument,
} from "../src/lib/curated-prompts";
import type { PromptEntry } from "../src/types";

const projectRoot = process.cwd();
const rawRoot = join(projectRoot, "prompt-source", "curated", "feishu-raw");
const curatedRoot = join(projectRoot, "prompt-source", "curated");
const outputPath = join(curatedRoot, "feishu.json");
const reportPath = join(projectRoot, "docs", "feishu-import-report.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function attachSourcePath(
  drafts: CuratedPromptDraft[],
  sourceName: "工作" | "生活",
): CuratedPromptDraft[] {
  return drafts.map((draft) => ({
    ...draft,
    sourcePath: `飞书提示词/${sourceName}/${draft.title}`,
  }));
}

function cleanFolderTitle(value: string) {
  return value
    .replace(/^\d+\s*[-_.、]\s*/u, "")
    .replace(/[【】]/gu, "")
    .replace(/(?:AI\s*)?提示词|指令|教程/giu, "")
    .replace(/&/g, "")
    .trim();
}

type PdfTextIndex = {
  entries: Array<{
    rootTitle: string;
    title: string;
    sourceUrl: string;
    text: string;
    error?: string | null;
  }>;
};

type SelectedLibrary = {
  rootNodes: Array<{
    rootNode: {
      title: string;
    };
    children?: Array<{
      node?: {
        title: string;
        url?: string;
      };
      previewPath?: string;
      error?: string;
    }>;
    pageRecords?: FeishuRecordDocument[];
  }>;
};

const workDocument = readJson<FeishuRecordDocument>(join(rawRoot, "work-records.json"));
const lifeDocument = readJson<FeishuRecordDocument>(join(rawRoot, "life-records.json"));
const pdfIndex = readJson<PdfTextIndex>(join(rawRoot, "pdf-text.json"));
const selectedLibrary = readJson<SelectedLibrary>(join(rawRoot, "selected-library.json"));
const existingEntries = readJson<{ entries: PromptEntry[] }>(
  join(projectRoot, "public", "prompts.json"),
).entries.filter((entry) => entry.sourceType === "legacy");

const workDrafts = attachSourcePath(extractPromptsFromFeishuRecords(workDocument), "工作");
const lifeDrafts = attachSourcePath(extractPromptsFromFeishuRecords(lifeDocument), "生活");
const selectedPageDrafts = selectedLibrary.rootNodes.flatMap((item) =>
  (item.pageRecords ?? []).flatMap((document) =>
    extractPromptsFromFeishuRecords(document).map((draft) => ({
      ...draft,
      sourcePath: `飞书提示词/精选/${draft.title}`,
    })),
  ),
);
const pdfDrafts = pdfIndex.entries
  .filter((entry) => !entry.error && entry.text.trim().length > 20)
  .map((entry) => {
    const prompt = cleanPdfPromptText(entry.text);
    const title = deriveCuratedTitleFromText(entry.title, prompt);
    return {
      title,
      prompt,
      sourceUrl: entry.sourceUrl,
      sourcePath: `飞书提示词/精选/${cleanFolderTitle(entry.rootTitle)}/${title}`,
    };
  })
  .sort((left, right) => right.prompt.length - left.prompt.length);
const selectedAttachments = selectedLibrary.rootNodes.flatMap((item) =>
  (item.children ?? []).map((child) => ({
    rootTitle: item.rootNode.title,
    title: child.node?.title ?? "Unknown attachment",
    sourceUrl: child.node?.url ?? null,
    previewPath: child.previewPath ?? null,
    error: child.error ?? null,
  })),
);

const allDrafts = [...workDrafts, ...lifeDrafts, ...selectedPageDrafts, ...pdfDrafts];
const lowContentDrafts = allDrafts.filter((entry) => entry.prompt.trim().length <= 20);
const unsafeDrafts = allDrafts.filter((entry) =>
  isUnsafeCuratedPrompt(entry.title, entry.prompt),
);
const deduped = dedupeCuratedPrompts(
  allDrafts.filter(
    (entry) =>
      entry.prompt.trim().length > 20 &&
      !isUnsafeCuratedPrompt(entry.title, entry.prompt),
  ),
  existingEntries,
);
const entries = createCuratedPromptEntries(deduped.entries);
const categoryCounts = Object.fromEntries(
  Array.from(new Set(entries.map((entry) => entry.category)))
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
    .map((category) => [category, entries.filter((entry) => entry.category === category).length]),
);

const report = {
  generatedAt: new Date().toISOString(),
  sources: {
    work: workDrafts.length,
    life: lifeDrafts.length,
    selectedRootDirectories: selectedLibrary.rootNodes.length,
    selectedAttachments: selectedAttachments.length,
    selectedPages: selectedPageDrafts.length,
    selectedPdfFiles: pdfDrafts.length,
  },
  candidates: allDrafts.length,
  lowContentSkipped: lowContentDrafts.map((entry) => entry.title),
  unsafeSkipped: unsafeDrafts.map((entry) => entry.title),
  duplicates: deduped.duplicates.length,
  usable: entries.length,
  categoryCounts,
  skippedPdfFiles: pdfIndex.entries
    .filter((entry) => entry.error || entry.text.trim().length <= 20)
    .map((entry) => ({ title: entry.title, error: entry.error || "No extractable text" })),
  unavailableAttachments: selectedAttachments
    .filter((entry) => !entry.previewPath)
    .map((entry) => ({
      rootTitle: entry.rootTitle,
      title: entry.title,
      error: entry.error || "No local preview file",
    })),
  duplicateTitles: deduped.duplicates.map((entry) => entry.title),
};

mkdirSync(curatedRoot, { recursive: true });
writeFileSync(outputPath, JSON.stringify({ report, entries }, null, 2), "utf8");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${entries.length} curated prompts to ${outputPath}`);
