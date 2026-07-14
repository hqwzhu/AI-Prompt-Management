import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..", "..");

describe("prompt source import", () => {
  it("uses the prompt source stored inside this project by default", () => {
    const importerSource = readFileSync(
      resolve(projectRoot, "scripts", "import-legacy-prompts.ts"),
      "utf8",
    );

    expect(importerSource).toContain('join(process.cwd(), "prompt-source", "聊天文本")');
    expect(importerSource).not.toContain("ai提示词秘籍软件优化3.8");
    expect(existsSync(resolve(projectRoot, "prompt-source", "聊天文本"))).toBe(true);
  });
});
