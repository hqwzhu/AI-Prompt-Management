import type { PromptEntry, PromptLocale, PromptSearchInput } from "../types";

const legacySeparators = ["::=::", "{::}", "{::::}"];

export function normalizeText(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "prompt";
}

export function deriveCategoryFromPath(relativePath: string) {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const knownRootIndex = parts.findIndex((part) => part === "聊天文本");
  const usefulParts = knownRootIndex >= 0 ? parts.slice(knownRootIndex + 1) : parts;
  if (usefulParts.length >= 3) return usefulParts[1];
  if (usefulParts.length >= 2) return usefulParts[0];
  return "通用";
}

export function localizePromptEntry(entry: PromptEntry, locale: PromptLocale) {
  const translation = locale === "en" ? entry.translations?.en : undefined;
  if (!translation) return entry;

  return {
    ...entry,
    ...translation,
  };
}

export function getPromptCategoryLabel(entries: PromptEntry[], category: string, locale: PromptLocale) {
  if (locale === "zh") return category;
  return entries.find((entry) => entry.category === category)?.translations?.en?.category ?? category;
}

export function buildPromptCopyText(entry: PromptEntry, userContext: string, locale: PromptLocale = "zh") {
  const localizedEntry = localizePromptEntry(entry, locale);
  const context = normalizeText(userContext);
  const labels =
    locale === "en"
      ? { category: "Category", purpose: "Purpose", context: "Additional context" }
      : { category: "分类", purpose: "用途", context: "补充需求" };

  return [
    `# ${localizedEntry.title}`,
    `${labels.category}: ${localizedEntry.category}`,
    localizedEntry.summary ? `${labels.purpose}: ${localizedEntry.summary}` : "",
    context ? `${labels.context}: ${context}` : "",
    "",
    localizedEntry.prompt,
  ]
    .filter(Boolean)
    .join("\n");
}

export function searchPromptEntries(
  entries: PromptEntry[],
  input: PromptSearchInput,
  locale: PromptLocale = "zh",
) {
  const query = normalizeText(input.query).toLowerCase();
  const category = input.category;

  return entries.filter((entry) => {
    const categoryMatched = !category || category === "全部" || entry.category === category;
    if (!categoryMatched) return false;
    if (!query) return true;

    const localizedEntry = localizePromptEntry(entry, locale);
    const haystack = [
      localizedEntry.title,
      localizedEntry.category,
      localizedEntry.summary,
      localizedEntry.prompt,
      localizedEntry.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function parseLegacyPromptFile(input: { relativePath: string; content: string }): PromptEntry {
  const normalizedPath = input.relativePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() ?? "提示词";
  const title = fileName.replace(/\.[^.]+$/, "");
  const category = deriveCategoryFromPath(normalizedPath);
  const cleanContent = normalizeText(input.content);
  const rows = cleanContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let row = line;
      for (const separator of legacySeparators) {
        row = row.split(separator).join("\n");
      }
      return normalizeText(
        row
          .split("\n")
          .map((part) => part.replace(/^\d+$/, "").trim())
          .filter(Boolean)
          .join(" ")
      );
    })
    .filter(Boolean);

  const prompt = rows.length ? rows.join("\n") : cleanContent;
  const summary = prompt.split(/[。.!！?？\n]/).find(Boolean)?.slice(0, 72) ?? `${title}提示词模板`;

  return {
    id: slugify(`${category}-${title}`),
    title,
    category,
    sourceType: "legacy",
    sourcePath: normalizedPath,
    summary,
    prompt,
    tags: Array.from(new Set([category, title])),
  };
}
