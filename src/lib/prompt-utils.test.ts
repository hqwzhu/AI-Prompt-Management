import { describe, expect, it } from "vitest";
import {
  buildPromptCopyText,
  deriveCategoryFromPath,
  parseLegacyPromptFile,
  searchPromptEntries,
} from "./prompt-utils";
import type { PromptEntry } from "../types";

const entries: PromptEntry[] = [
  {
    id: "writing-product-copy",
    title: "产品文案框架",
    category: "营销文案",
    sourceType: "legacy",
    sourcePath: "聊天文本/生成/写作/产品文案.csv",
    summary: "把产品特点转换成用户能理解的购买理由。",
    prompt:
      "请根据产品名称、目标用户、使用场景和核心差异，生成标题、简介、卖点和转化型详情页文案。",
    tags: ["产品", "文案", "转化"],
  },
  {
    id: "image-avatar",
    title: "动漫头像",
    category: "图像生成",
    sourceType: "legacy",
    sourcePath: "聊天文本/生成/图片/动漫头像.csv",
    summary: "生成干净、可控的人像头像提示词。",
    prompt: "请生成一段动漫头像提示词，包含主体、光影、构图、风格和反向提示词。",
    tags: ["图片", "头像"],
  },
];

describe("prompt utilities", () => {
  it("filters by query, category, and tag text", () => {
    expect(searchPromptEntries(entries, { query: "购买理由", category: "营销文案" })).toEqual([entries[0]]);
    expect(searchPromptEntries(entries, { query: "头像", category: "全部" })).toEqual([entries[1]]);
    expect(searchPromptEntries(entries, { query: "不存在", category: "全部" })).toEqual([]);
  });

  it("builds a clean copy block with title, context, and prompt", () => {
    expect(buildPromptCopyText(entries[0], "请用于小红书首图文案")).toContain("产品文案框架");
    expect(buildPromptCopyText(entries[0], "请用于小红书首图文案")).toContain("请用于小红书首图文案");
    expect(buildPromptCopyText(entries[0], "")).not.toContain("补充需求");
  });

  it("derives useful categories from legacy paths", () => {
    expect(deriveCategoryFromPath("聊天文本/生成/写作/产品文案.csv")).toBe("写作");
    expect(deriveCategoryFromPath("聊天文本/模版/图片/图片风格.txt")).toBe("图片");
    expect(deriveCategoryFromPath("聊天文本/网站/ai模型网址.ini")).toBe("网站");
  });

  it("parses custom legacy prompt rows into one reusable entry", () => {
    const parsed = parseLegacyPromptFile({
      relativePath: "聊天文本/生成/小说/AI小说生成器.csv",
      content:
        "1::=::请帮我写一篇修仙小说：::=::你是一位精通玄幻小说创作的顶级网文作家。{::}\n1::=::小说名称：::=::幽冥仙途{::}",
    });

    expect(parsed.title).toBe("AI小说生成器");
    expect(parsed.category).toBe("小说");
    expect(parsed.prompt).toContain("请帮我写一篇修仙小说");
    expect(parsed.prompt).toContain("幽冥仙途");
  });
});
