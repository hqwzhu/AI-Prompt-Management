import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config";

describe("Electron production build", () => {
  it("uses relative asset paths so loadFile can render the app", () => {
    expect(viteConfig.base).toBe("./");
  });

  it("avoids root-relative public assets in the Electron renderer", () => {
    const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const htmlSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

    expect(appSource).not.toContain('src="/enhe-logo.png"');
    expect(htmlSource).not.toContain('href="/favicon.svg"');
  });
});
