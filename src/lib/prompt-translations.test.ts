import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Translation = {
  title?: string;
  category?: string;
  summary?: string;
  prompt?: string;
  sourcePath?: string;
  tags?: string[];
};

type StoredEntry = {
  id: string;
  sourceType: "legacy" | "curated";
  translations?: {
    en?: Translation;
  };
};

const hanPattern = /\p{Script=Han}/u;

describe("English prompt library", () => {
  it("provides complete English content for every prompt", () => {
    const data = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "..", "public", "prompts.json"), "utf8"),
    ) as { entries: StoredEntry[] };

    expect(data.entries).toHaveLength(418);
    expect(data.entries.filter((entry) => entry.sourceType === "legacy")).toHaveLength(0);
    expect(data.entries.filter((entry) => entry.sourceType === "curated")).toHaveLength(418);

    for (const entry of data.entries) {
      const english = entry.translations?.en;
      expect(english, `Missing English translation for ${entry.id}`).toBeDefined();

      for (const value of [
        english?.title,
        english?.category,
        english?.summary,
        english?.prompt,
        english?.sourcePath,
        ...(english?.tags ?? []),
      ]) {
        expect(value?.trim(), `Empty English field for ${entry.id}`).toBeTruthy();
        expect(hanPattern.test(value ?? ""), `Chinese text remains in English entry ${entry.id}`).toBe(false);
      }
    }
  });
});
