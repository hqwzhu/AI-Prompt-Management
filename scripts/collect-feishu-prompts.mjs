import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const proxyOrigin = process.env.WEB_ACCESS_PROXY || "http://localhost:3456";
const outputRoot = join(process.cwd(), "prompt-source", "curated", "feishu-raw");
const fileOutputRoot = join(outputRoot, "files");
const maxPreviewBytes = 10 * 1024 * 1024;

function readSources() {
  const raw = process.env.FEISHU_SOURCE_URLS;
  if (!raw) {
    throw new Error(
      "Missing FEISHU_SOURCE_URLS. Pass a JSON object with work, life, and selected Feishu wiki URLs.",
    );
  }

  let urls;
  try {
    urls = JSON.parse(raw);
  } catch {
    throw new Error("FEISHU_SOURCE_URLS must be valid JSON.");
  }

  return Object.fromEntries(
    ["work", "life", "selected"].map((name) => {
      const value = urls[name];
      if (typeof value !== "string") {
        throw new Error(`FEISHU_SOURCE_URLS.${name} must be a Feishu wiki URL.`);
      }
      const url = new URL(value);
      const match = url.pathname.match(/\/wiki\/([^/?#]+)/u);
      if (!match) {
        throw new Error(`FEISHU_SOURCE_URLS.${name} must contain /wiki/<token>.`);
      }
      return [name, { url: url.toString(), wikiToken: match[1] }];
    }),
  );
}

const sources = readSources();

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(path, options = {}) {
  const response = await fetch(`${proxyOrigin}${path}`, options);
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed with ${response.status}`);
  }
  return response.json();
}

async function listTargets() {
  return request("/targets");
}

async function findOrCreateTarget(url) {
  const targets = await listTargets();
  const existing = targets.find((target) => target.url === url);
  if (existing) return existing.targetId;

  const created = await request("/new", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: url,
  });
  return created.targetId;
}

async function navigate(targetId, url) {
  await request(`/navigate?target=${targetId}`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: url,
  });
}

async function evaluate(targetId, expression) {
  const result = await request(`/eval?target=${targetId}`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: expression,
  });
  return result.value;
}

async function waitFor(targetId, expression, label, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await evaluate(targetId, expression)) return;
    } catch {
      // Navigation can briefly invalidate the execution context.
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function openWiki(targetId, source) {
  await navigate(targetId, source.url);
  await waitFor(
    targetId,
    `window.store?.getState?.()?.appState?.currentWikiEntity?.wiki_token === ${JSON.stringify(source.wikiToken)}`,
    source.wikiToken,
  );
}

async function collectDocxRecords(targetId, source) {
  await openWiki(targetId, source);
  await waitFor(
    targetId,
    `(() => {
      const sdk = window.__docx_sdk__?.instances?.get?.(0);
      const map = sdk?.api?.dataService?.getRecordMap?.();
      return Boolean(map?.size > 10 && window.docxClientvarFetchManager?.getFinishInfo?.()?.isFinish);
    })()`,
    `${source.wikiToken} document records`,
  );

  return evaluate(
    targetId,
    `(() => {
      const sdk = window.__docx_sdk__.instances.get(0);
      const api = sdk.api;
      const records = Array.from(api.dataService.getRecordMap().entries()).map(([id, record]) => ({
        id,
        snapshot: record.snapshot,
      }));
      return {
        sourceUrl: location.href,
        title: document.title.replace(/ - 飞书云文档$/, ""),
        wikiToken: window.store.getState().appState.currentWikiEntity.wiki_token,
        objectToken: window.store.getState().appState.currentWikiEntity.obj_token,
        rootRecordId: api.dataService.rootRecordId,
        records,
      };
    })()`,
  );
}

async function collectFolderChildren(targetId, node) {
  await navigate(targetId, node.url);
  await waitFor(
    targetId,
    `window.store?.getState?.()?.appState?.currentWikiEntity?.wiki_token === ${JSON.stringify(node.wikiToken)}`,
    node.title,
  );
  if (!node.hasChild) return [];

  await waitFor(
    targetId,
    `Array.isArray(window.store?.getState?.()?.wikiV2?.treeChildMap?.[${JSON.stringify(node.wikiToken)}])`,
    `${node.title} children`,
  );

  return evaluate(
    targetId,
    `(() => {
      const state = window.store.getState();
      const wiki = state.wikiV2;
      return (wiki.treeChildMap[${JSON.stringify(node.wikiToken)}] || [])
        .map((id) => wiki.nodeMap[id])
        .filter(Boolean);
    })()`,
  );
}

async function collectPageRecords(targetId, node) {
  await navigate(targetId, node.url);
  await waitFor(
    targetId,
    `window.store?.getState?.()?.appState?.currentWikiEntity?.wiki_token === ${JSON.stringify(node.wikiToken)}`,
    node.title,
  );
  await waitFor(
    targetId,
    `(() => {
      const sdk = window.__docx_sdk__?.instances?.get?.(0);
      return sdk?.api?.dataService?.rootRecordId === ${JSON.stringify(node.objToken)}
        && sdk.api.dataService.getRecordMap().size > 1;
    })()`,
    `${node.title} records`,
  );

  return evaluate(
    targetId,
    `(() => {
      const api = window.__docx_sdk__.instances.get(0).api;
      return {
        title: ${JSON.stringify(node.title)},
        sourceUrl: location.href,
        wikiToken: ${JSON.stringify(node.wikiToken)},
        objectToken: ${JSON.stringify(node.objToken)},
        rootRecordId: api.dataService.rootRecordId,
        records: Array.from(api.dataService.getRecordMap().entries()).map(([id, record]) => ({
          id,
          snapshot: record.snapshot,
        })),
      };
    })()`,
  );
}

async function collectFilePreview(targetId, node) {
  await navigate(targetId, node.url);
  await waitFor(
    targetId,
    `window.store?.getState?.()?.appState?.currentWikiEntity?.wiki_token === ${JSON.stringify(node.wikiToken)}`,
    node.title,
  );
  await waitFor(
    targetId,
    `window.store?.getState?.()?.box_common_base?.currentDriveFileInfo?.name === ${JSON.stringify(node.title)}`,
    `${node.title} file metadata`,
  );

  return evaluate(
    targetId,
    `(async () => {
      const fileInfo = window.store.getState().box_common_base.currentDriveFileInfo;
      const previews = Object.entries(fileInfo.preview_meta?.data || {})
        .filter(([, value]) => value?.preview_url)
        .sort(([left], [right]) => {
          const priority = (type) => type === "9" ? 2 : type === "22" ? 1 : 0;
          return priority(right) - priority(left);
        });

      for (const [previewType, preview] of previews) {
        if ((preview.preview_file_size || fileInfo.size || 0) > ${maxPreviewBytes}) {
          continue;
        }
        const response = await fetch(preview.preview_url, { credentials: "include" });
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type") || "";
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (contentType.includes("pdf") || (bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70)) {
          let binary = "";
          const chunkSize = 0x8000;
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
          }
          return {
            fileInfo,
            previewType,
            contentType,
            base64: btoa(binary),
          };
        }
      }
      const size = Math.max(
        fileInfo.size || 0,
        ...previews.map(([, preview]) => preview.preview_file_size || 0),
      );
      return {
        fileInfo,
        error: size > ${maxPreviewBytes}
          ? "Skipped non-prompt reference file larger than 10 MB."
          : "No downloadable PDF preview was available.",
      };
    })()`,
  );
}

function normalizedFileStem(title) {
  return Array.from(title, (character) =>
    character.charCodeAt(0) < 32 ? "-" : character,
  )
    .join("")
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function safeFileName(index, title) {
  const normalized = normalizedFileStem(title);
  return `${String(index).padStart(3, "0")}-${normalized || "prompt"}`;
}

async function collectSelectedLibrary(targetId) {
  await openWiki(targetId, sources.selected);
  await waitFor(
    targetId,
    `window.store?.getState?.()?.wikiV2?.treeChildMap?.[${JSON.stringify(sources.selected.wikiToken)}]?.length > 0`,
    "selected prompt library children",
  );

  const rootNodes = await evaluate(
    targetId,
    `(() => {
      const wiki = window.store.getState().wikiV2;
      return wiki.treeChildMap[${JSON.stringify(sources.selected.wikiToken)}]
        .map((id) => wiki.nodeMap[id])
        .filter(Boolean);
    })()`,
  );

  const checkpointPath = join(outputRoot, "selected-library.json");
  const resumeFromCheckpoint = process.env.FEISHU_RESUME === "1" && existsSync(checkpointPath);
  const collected = resumeFromCheckpoint
    ? JSON.parse(readFileSync(checkpointPath, "utf8")).rootNodes || []
    : [];
  const completedWikiTokens = new Set(collected.map((item) => item.rootNode?.wikiToken).filter(Boolean));
  const existingFiles = readdirSync(fileOutputRoot)
    .filter((name) => /^\d{3}-.*\.pdf$/iu.test(name))
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  const existingByStem = new Map();
  for (const fileName of existingFiles) {
    const stem = fileName.replace(/^\d{3}-/u, "").replace(/\.pdf$/iu, "");
    const matches = existingByStem.get(stem) || [];
    matches.push(fileName);
    existingByStem.set(stem, matches);
  }
  let fileIndex = existingFiles.reduce((max, name) => {
    const index = Number(name.slice(0, 3));
    return Number.isFinite(index) ? Math.max(max, index) : max;
  }, 0);

  for (const rootNode of rootNodes) {
    if (completedWikiTokens.has(rootNode.wikiToken)) {
      continue;
    }

    const item = { rootNode, children: [], pageRecords: [] };
    if (/^01-/.test(rootNode.title)) {
      item.skipped = "Usage tutorial is not a prompt source.";
      collected.push(item);
      continue;
    }

    const children = await collectFolderChildren(targetId, rootNode);
    for (const child of children) {
      if (child.objType === 12) {
        const existingMatches = existingByStem.get(normalizedFileStem(child.title)) || [];
        const existingFileName = existingMatches.shift();
        if (existingFileName) {
          item.children.push({
            node: child,
            previewPath: `files/${existingFileName}`,
            reused: true,
          });
          continue;
        }

        const preview = await collectFilePreview(targetId, child);
        const childResult = {
          node: child,
          fileInfo: preview.fileInfo,
          previewType: preview.previewType,
          contentType: preview.contentType,
          error: preview.error,
        };
        if (preview.base64) {
          fileIndex += 1;
          const baseName = safeFileName(fileIndex, child.title);
          const relativePath = `files/${baseName}.pdf`;
          writeFileSync(join(outputRoot, relativePath), Buffer.from(preview.base64, "base64"));
          childResult.previewPath = relativePath;
        }
        item.children.push(childResult);
        continue;
      }

      if (child.objType === 22) {
        item.pageRecords.push(await collectPageRecords(targetId, child));
        continue;
      }

      item.children.push({
        node: child,
        error: `Unsupported object type ${child.objType}`,
      });
    }

    collected.push(item);
    writeFileSync(
      checkpointPath,
      JSON.stringify(
        {
          sourceUrl: sources.selected.url,
          wikiToken: sources.selected.wikiToken,
          rootNodes: collected,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`Collected ${rootNode.title}: ${children.length} child item(s)`);
  }

  return {
    sourceUrl: sources.selected.url,
    wikiToken: sources.selected.wikiToken,
    rootNodes: collected,
  };
}

mkdirSync(fileOutputRoot, { recursive: true });

const workTarget = await findOrCreateTarget(sources.work.url);
const lifeTarget = await findOrCreateTarget(sources.life.url);
const selectedTarget = await findOrCreateTarget(sources.selected.url);

console.log("Collecting work prompts...");
const work = await collectDocxRecords(workTarget, sources.work);
writeFileSync(join(outputRoot, "work-records.json"), JSON.stringify(work, null, 2), "utf8");

console.log("Collecting life prompts...");
const life = await collectDocxRecords(lifeTarget, sources.life);
writeFileSync(join(outputRoot, "life-records.json"), JSON.stringify(life, null, 2), "utf8");

console.log("Collecting selected prompt library...");
const selected = await collectSelectedLibrary(selectedTarget);
writeFileSync(join(outputRoot, "selected-library.json"), JSON.stringify(selected, null, 2), "utf8");

console.log(`Feishu source data written to ${outputRoot}`);
