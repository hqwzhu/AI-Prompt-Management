import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..", "..");

describe("prompt source import", () => {
  it("builds the product only from the curated Feishu prompt library", () => {
    const importerSource = readFileSync(
      resolve(projectRoot, "scripts", "build-prompt-library.ts"),
      "utf8",
    );

    expect(importerSource).toContain('join(process.cwd(), "prompt-source", "curated", "feishu.json")');
    expect(importerSource).not.toContain("LEGACY_PROMPT_SOURCE");
    expect(existsSync(resolve(projectRoot, "prompt-source", "curated", "feishu.json"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "prompt-source", "聊天文本"))).toBe(false);
    expect(existsSync(resolve(projectRoot, "prompt-source", "translations", "en.json"))).toBe(false);
  });
});
