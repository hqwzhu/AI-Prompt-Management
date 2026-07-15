import type { PromptEntry } from "../types";
import { normalizeText, slugify } from "./prompt-utils";

type FeishuRecord = {
  id: string;
  snapshot: {
    type?: string;
    children?: string[];
    text?: {
      initialAttributedTexts?: {
        text?: Record<string, string>;
      };
    };
  };
};

export type FeishuRecordDocument = {
  sourceUrl: string;
  title: string;
  rootRecordId: string;
  records: FeishuRecord[];
};

export type CuratedPromptDraft = {
  title: string;
  prompt: string;
  sourceUrl: string;
  sourcePath?: string;
};

const contentBlockTypes = new Set([
  "text",
  "code",
  "bullet",
  "ordered",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "heading7",
  "heading8",
  "heading9",
  "quote",
]);

const sourcePromotionPatterns = [
  /更多给力项目/u,
  /本文档由.*整理.*(?:微信|VX|QQ)/iu,
  /更多.*(?:AI)?(?:干货|资料).*(?:微信|VX|QQ|联系)/iu,
  /maomp\.fun/iu,
  /Q\/V[:：]?\s*\d+/iu,
  /可围观我的朋友圈/u,
  /每天都会分享一些落地的场景/u,
  /定制AI智能体、AI赋能、AI应用/u,
];
const sourceMetadataPatterns = [
  /^\s*[。.#*-]*\s*(?:author|suthor|作者)\s*[:：]/iu,
  /^\s*[。.#*-]*\s*(?:version|版本)\s*[:：]/iu,
];

function getRecordText(record: FeishuRecord) {
  return normalizeText(
    Object.values(record.snapshot.text?.initialAttributedTexts?.text ?? {}).join(""),
  );
}

function cleanSourceText(value: string) {
  return value
    .replace(/您好[，,]\s*秋风[。.]/gu, "您好。")
    .replace(/You are\s*\[秋风\]/giu, "You are [AI assistant]")
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !sourcePromotionPatterns.some((pattern) => pattern.test(line)) &&
        !sourceMetadataPatterns.some((pattern) => pattern.test(line)),
    )
    .join("\n");
}

export function isUnsafeCuratedPrompt(title: string, prompt: string) {
  return (
    /越狱(?:版本)?提示词/u.test(title) &&
    /忽略.*内容政策|违反道德和法律|生成违反法律的内容/us.test(prompt)
  );
}

export function cleanPdfPromptText(value: string) {
  const attributionPatterns = [
    /^\s*(?:[-*]\s*)?(?:\*\*)?(?:author|作者)(?:\*\*)?\s*[:：]/iu,
    /^\s*(?:[-*]\s*)?(?:\*\*)?version(?:\*\*)?\s*[:：]/iu,
    /^\s*BZHN\.AIGC\s*$/iu,
  ];
  const replaceSourceBrand = (line: string) =>
    line
      .replace(/不止胡闹\s*\|\s*BZHN\.AI(?:GC)?/giu, "示例品牌")
      .replace(/不止胡闹/gu, "示例品牌")
      .replace(/BZHN\.AI(?:GC)?/giu, "示例品牌")
      .replace(/示例品牌\s+的/gu, "示例品牌的")
      .replace(/示例品牌\s*\|\s*示例品牌/gu, "PPT 大纲助手")
      .replace(/杀手\s*tony/giu, "[演讲者姓名]");

  return normalizeText(
    value
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => !attributionPatterns.some((pattern) => pattern.test(line)))
      .map(replaceSourceBrand)
      .filter((line) => line.trim() !== "示例品牌")
      .join("\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

export function deriveCuratedTitleFromText(fileName: string, prompt: string) {
  const cleanRoleTitle = (value: string) =>
    value
      .replace(/\*\*/g, "")
      .replace(/^你是(?:一名|一个|一位)?\s*/u, "")
      .trim();
  const lines = prompt.split("\n").map((line) => line.trim());
  const roleLine = lines.find((line) =>
    /^#{0,3}\s*(?:role|角色)\s*[:：]\s*\S+/iu.test(line),
  );
  if (roleLine) {
    return cleanRoleTitle(
      roleLine.replace(/^#{0,3}\s*(?:role|角色)\s*[:：]\s*/iu, ""),
    );
  }
  const roleMarkerIndex = lines.findIndex((line) =>
    /^#{0,3}\s*(?:role|角色)\s*[:：]?\s*$/iu.test(line),
  );
  if (roleMarkerIndex >= 0) {
    const nextRoleLine = lines.slice(roleMarkerIndex + 1).find(Boolean);
    if (nextRoleLine) return cleanRoleTitle(nextRoleLine);
  }

  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/^(\d+[-_.、\s]*)+/u, "")
    .replace(/^【[^】]*(?:指令|提示词)[^】]*】/u, "")
    .replace(/[（(].*?[）)]\s*$/u, "")
    .replace(/\s*\d+(?:\.\d+)+\s*$/u, "")
    .trim();
}

export function extractPromptsFromFeishuRecords(
  document: FeishuRecordDocument,
): CuratedPromptDraft[] {
  const records = new Map(document.records.map((record) => [record.id, record]));
  const orderedRecords: FeishuRecord[] = [];

  function visit(recordId: string) {
    const record = records.get(recordId);
    if (!record) return;
    orderedRecords.push(record);
    for (const childId of record.snapshot.children ?? []) visit(childId);
  }

  const root = records.get(document.rootRecordId);
  for (const childId of root?.snapshot.children ?? []) visit(childId);

  const prompts: CuratedPromptDraft[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  function flush() {
    const prompt = cleanSourceText(currentBody.join("\n"));
    if (currentTitle && prompt) {
      prompts.push({
        title: currentTitle,
        prompt,
        sourceUrl: document.sourceUrl,
      });
    }
    currentTitle = "";
    currentBody = [];
  }

  for (const record of orderedRecords) {
    const text = getRecordText(record);
    if (!text) continue;

    const headingMatch =
      record.snapshot.type === "heading1"
        ? text.replace(/[\u200B-\u200D\uFEFF]/gu, "").match(/^\s*\d+\s*[、.．]\s*(.+?)\s*$/u)
        : null;

    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1].trim();
      continue;
    }

    if (currentTitle && contentBlockTypes.has(record.snapshot.type ?? "")) {
      currentBody.push(text);
    }
  }

  flush();
  return prompts;
}

export function inferCuratedCategory(title: string, prompt: string) {
  const content = `${title}\n${prompt}`.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["红书", /小红书|xiaohongshu/u],
    ["图片", /stable diffusion|midjourney|绘画|图像|图片|生图|sd提示/u],
    ["视频", /视频|短剧|分镜|摄像|剪辑|抖音/u],
    ["编程", /编程|代码|程序|开发|debug|python|javascript|typescript/u],
    ["论文", /论文|学术|文献|研究报告/u],
    ["小说", /小说|网文|故事创作/u],
    ["运营", /营销|电商|亚马逊|市场调研|运营|直播|广告|品牌/u],
    ["职场", /excel|ppt|办公|周报|日报|会议纪要|项目管理|面试|职场|公司研报|会计|银行|授信|财务/u],
    ["生活", /旅行|旅游|健康|饮食|健身|育儿|情感|生活|祝福/u],
    ["角色", /角色生成|人物设定|职业角色/u],
    ["写作", /写作|文案|文章|润色|改写|翻译|书评|摘要|总结|诗歌|歌词/u],
  ];

  return rules.find(([, pattern]) => pattern.test(content))?.[0] ?? "问答";
}

function canonicalPrompt(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{Punctuation}\p{Separator}\p{Symbol}]+/gu, "");
}

function isHighlySimilar(left: string, right: string) {
  const shorterLength = Math.min(left.length, right.length);
  const longerLength = Math.max(left.length, right.length);
  if (shorterLength < 40 || shorterLength / longerLength < 0.75) return false;

  const shingles = (value: string) => {
    const result = new Set<string>();
    for (let index = 0; index <= value.length - 4; index += 1) {
      result.add(value.slice(index, index + 4));
    }
    return result;
  };
  const leftShingles = shingles(left);
  const rightShingles = shingles(right);
  let intersection = 0;
  for (const shingle of leftShingles) {
    if (rightShingles.has(shingle)) intersection += 1;
  }
  return intersection / Math.min(leftShingles.size, rightShingles.size) >= 0.85;
}

export function dedupeCuratedPrompts(
  candidates: CuratedPromptDraft[],
  existing: PromptEntry[],
) {
  const seen = new Set(existing.map((entry) => canonicalPrompt(entry.prompt)));
  const seenByTitle = new Map<string, string[]>();
  for (const entry of existing) {
    const titleKey = canonicalPrompt(entry.title);
    const prompts = seenByTitle.get(titleKey) ?? [];
    prompts.push(canonicalPrompt(entry.prompt));
    seenByTitle.set(titleKey, prompts);
  }
  const entries: CuratedPromptDraft[] = [];
  const duplicates: CuratedPromptDraft[] = [];

  for (const candidate of candidates) {
    const fingerprint = canonicalPrompt(candidate.prompt);
    const titleKey = canonicalPrompt(candidate.title);
    const sameTitlePrompts = seenByTitle.get(titleKey) ?? [];
    if (
      !fingerprint ||
      seen.has(fingerprint) ||
      sameTitlePrompts.some((prompt) => isHighlySimilar(prompt, fingerprint))
    ) {
      duplicates.push(candidate);
      continue;
    }
    seen.add(fingerprint);
    sameTitlePrompts.push(fingerprint);
    seenByTitle.set(titleKey, sameTitlePrompts);
    entries.push(candidate);
  }

  return { entries, duplicates };
}

function createSummary(title: string, prompt: string) {
  const summary = prompt
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/u, "")
        .replace(/^[-*]\s*/u, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .find(
      (line) =>
        line &&
        !/^(?:role|角色|profile|简介|goals?|目标|skills?|技能|constraints?|限制|workflow|工作流程)\s*[:：]?$/iu.test(
          line,
        ) &&
        !/^(?:role|角色)\s*[:：]/iu.test(line),
    );
  return (summary || `${title}提示词模板`).slice(0, 72);
}

export function createCuratedPromptEntries(drafts: CuratedPromptDraft[]): PromptEntry[] {
  const idCounts = new Map<string, number>();

  return drafts.map((draft) => {
    const category = inferCuratedCategory(draft.title, draft.prompt);
    const baseId = `curated-${slugify(`${category}-${draft.title}`)}`;
    const count = (idCounts.get(baseId) ?? 0) + 1;
    idCounts.set(baseId, count);

    return {
      id: count === 1 ? baseId : `${baseId}-${count}`,
      title: draft.title,
      category,
      sourceType: "curated",
      sourcePath: draft.sourcePath || `飞书提示词/${draft.title}`,
      summary: createSummary(draft.title, draft.prompt),
      prompt: normalizeText(draft.prompt),
      tags: [category, draft.title],
    };
  });
}
