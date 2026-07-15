import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { promptCategories, promptEntries, promptLibraryStats } from "./data/generated-prompts";
import {
  buildPromptCopyText,
  getPromptCategoryLabel,
  localizePromptEntry,
  searchPromptEntries,
} from "./lib/prompt-utils";
import type { PromptEntry, PromptLocale } from "./types";

const copy = {
  zh: {
    product: "AI提示词管理系统",
    tagline: "把散乱提示词变成随手可用的工作台",
    search: "搜索提示词、用途、场景",
    all: "全部",
    favorites: "收藏",
    copy: "复制提示词",
    copied: "已复制",
    context: "补充你的任务背景",
    contextPlaceholder: "例如：用于小红书产品介绍，语气自然，突出省时间。",
    openWebsite: "访问 ENHE AI 官网",
    statsPrompts: "提示词",
    statsCategories: "分类",
    offline: "离线可用",
    source: "来源",
    empty: "没有匹配内容，换一个关键词或分类。",
    favoriteHint: "收藏",
    creator: "创作者：ENHE AI / HU",
  },
  en: {
    product: "AI Prompt Management System",
    tagline: "Turn scattered prompts into a practical daily workspace",
    search: "Search prompts, use cases, or scenarios",
    all: "All",
    favorites: "Favorites",
    copy: "Copy prompt",
    copied: "Copied",
    context: "Add your task context",
    contextPlaceholder: "Example: for a product post, natural tone, focus on saving time.",
    openWebsite: "Visit ENHE AI",
    statsPrompts: "Prompts",
    statsCategories: "Categories",
    offline: "Offline ready",
    source: "Source",
    empty: "No matching prompts. Try another keyword or category.",
    favoriteHint: "Save",
    creator: "Creator: ENHE AI / HU",
  },
} as const;

function readFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem("enhe-prompt-favorites") || "[]") as string[]);
  } catch {
    return new Set<string>();
  }
}

function App() {
  const [locale, setLocale] = useState<PromptLocale>("zh");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [selectedId, setSelectedId] = useState("");
  const [context, setContext] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());
  const [copiedId, setCopiedId] = useState("");
  const t = copy[locale];

  const filtered = useMemo(
    () => searchPromptEntries(promptEntries, { query, category }, locale),
    [category, locale, query],
  );
  const selectedEntry = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? promptEntries[0];
  const selected = localizePromptEntry(selectedEntry, locale);
  const favoriteEntries = promptEntries
    .filter((entry) => favorites.has(entry.id))
    .slice(0, 6)
    .map((entry) => localizePromptEntry(entry, locale));

  useEffect(() => {
    document.title = t.product;
  }, [t.product]);

  function toggleFavorite(entry: PromptEntry) {
    const next = new Set(favorites);
    if (next.has(entry.id)) {
      next.delete(entry.id);
    } else {
      next.add(entry.id);
    }
    setFavorites(next);
    localStorage.setItem("enhe-prompt-favorites", JSON.stringify(Array.from(next)));
  }

  async function copyPrompt(entry: PromptEntry) {
    const text = buildPromptCopyText(entry, context, locale);
    await navigator.clipboard.writeText(text);
    setCopiedId(entry.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  return (
    <main className="app-shell">
      <aside className="side-panel">
        <div className="brand-lockup">
          <img src={`${import.meta.env.BASE_URL}enhe-logo.png`} alt="ENHE AI" />
          <div>
            <p>ENHE AI</p>
            <h1>{t.product}</h1>
          </div>
        </div>

        <p className="tagline">{t.tagline}</p>

        <div className="stats-grid" aria-label="Prompt library stats">
          <Stat value={promptLibraryStats.total} label={t.statsPrompts} />
          <Stat value={promptLibraryStats.categories} label={t.statsCategories} />
          <Stat value="100%" label={t.offline} />
        </div>

        <div className="field">
          <label htmlFor="prompt-search">{t.search}</label>
          <input
            id="prompt-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
          />
        </div>

        <nav className="category-list" aria-label="Prompt categories">
          {[
            { value: "全部", label: t.all },
            ...promptCategories.map((item) => ({
              value: item,
              label: getPromptCategoryLabel(promptEntries, item, locale),
            })),
          ].map((item) => {
            const active = category === item.value;
            return (
              <button
                key={item.value}
                type="button"
                className={active ? "category-button active" : "category-button"}
                onClick={() => {
                  setCategory(item.value);
                  setSelectedId("");
                }}
              >
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="side-footer">
          <a href="https://www.enhe-tech.com.cn/" target="_blank" rel="noreferrer">
            {t.openWebsite}
          </a>
          <span>{t.creator}</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="section-kicker">Prompt Workspace</p>
            <h2>{selected.title}</h2>
          </div>
          <div className="locale-switch" aria-label="Language">
            <button type="button" className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>
              {locale === "en" ? "ZH" : "中文"}
            </button>
            <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>
              EN
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="prompt-list" aria-label="Prompt results">
            {filtered.length ? (
              filtered.map((entry) => (
                <PromptRow
                  key={entry.id}
                  entry={entry}
                  locale={locale}
                  selected={entry.id === selectedEntry.id}
                  onSelect={() => setSelectedId(entry.id)}
                />
              ))
            ) : (
              <p className="empty-state">{t.empty}</p>
            )}
          </section>

          <section className="prompt-detail">
            <div className="detail-head">
              <div>
                <span>{selected.category}</span>
                <h3>{selected.title}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => toggleFavorite(selectedEntry)}>
                {favorites.has(selected.id) ? t.favorites : t.favoriteHint}
              </button>
            </div>

            <p className="summary">{selected.summary}</p>

            <label className="context-box">
              <span>{t.context}</span>
              <textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder={t.contextPlaceholder}
              />
            </label>

            <pre className="prompt-preview">{selected.prompt}</pre>

            <div className="detail-actions">
              <button type="button" className="primary-button" onClick={() => copyPrompt(selectedEntry)}>
                {copiedId === selected.id ? t.copied : t.copy}
              </button>
              <span>
                {t.source}: {selected.sourcePath}
              </span>
            </div>
          </section>
        </div>

        <section className="favorites-strip" aria-label="Favorite prompts">
          <div>
            <p className="section-kicker">{t.favorites}</p>
            <h3>{favoriteEntries.length ? favoriteEntries.length : 0}</h3>
          </div>
          <div className="favorite-items">
            {favoriteEntries.length ? (
              favoriteEntries.map((entry) => <span key={entry.id}>{entry.title}</span>)
            ) : (
              <span>{locale === "zh" ? "常用提示词会显示在这里" : "Saved prompts will appear here"}</span>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PromptRow({
  entry,
  locale,
  selected,
  onSelect,
}: {
  entry: PromptEntry;
  locale: PromptLocale;
  selected: boolean;
  onSelect: () => void;
}) {
  const localizedEntry = localizePromptEntry(entry, locale);

  return (
    <button type="button" className={selected ? "prompt-row active" : "prompt-row"} onClick={onSelect}>
      <span>{localizedEntry.category}</span>
      <strong>{localizedEntry.title}</strong>
      <small>{localizedEntry.summary}</small>
    </button>
  );
}

export default App;
