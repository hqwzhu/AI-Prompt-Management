import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("prompt selection interaction", () => {
  it("does not write the selected prompt title into the search field", () => {
    const appSource = readFileSync(resolve(import.meta.dirname, "..", "App.tsx"), "utf8");

    expect(appSource).not.toContain("setQuery(entry.title)");
  });
});
