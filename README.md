# ENHE AI提示词管理系统

ENHE AI提示词管理系统是一个免费的 AI 提示词工作台，用于把零散提示词整理成可搜索、可分类、可复制的日常工具。主产品方向是网页版，桌面版作为离线提示词库和企业交付附加版本。

官网：https://www.enhe-tech.com.cn/

创作者：ENHE AI / HU

## 产品价值

- 快速找到适合写作、短视频、产品文案、SEO/GEO、图像生成、AI智能体和效率办公的提示词。
- 支持补充任务背景后复制，让提示词更贴近实际任务。
- 桌面版可离线运行，适合本地资料库、培训交付和企业内部使用。
- 数据模型简单，后续可以继续扩展行业提示词包。

## 功能

- 623 条中英文提示词已整理为结构化数据，其中包含 205 条旧版提示词和 418 条合规飞书精选提示词。
- 搜索提示词标题、摘要、正文和标签。
- 按分类筛选。
- 中英文界面切换。
- 一键复制提示词。
- 收藏常用提示词。
- Electron 桌面版入口。

## 本地开发

```bash
npm install
npm run generate:prompts
npm run dev
```

## 构建网页版

```bash
npm run build
npm run preview
```

## 启动桌面版

```bash
npm run build
npm run desktop:dev
```

## 打包 Windows 便携版

```bash
npm run desktop:pack
```

生成文件位于 `release/`。

## 提示词数据导入

默认导入目录位于当前项目内：

```text
E:\AiProject\AI-Prompt-Management\prompt-source\聊天文本
```

仓库内相对路径为 `prompt-source\聊天文本`，项目不再依赖旧软件目录。也可以通过环境变量指定其他来源：

```bash
set LEGACY_PROMPT_SOURCE=D:\your\prompt\source
npm run generate:prompts
```

导入脚本会读取 `.txt`、`.csv`、`.csw` 文件，生成：

- `src/data/generated-prompts.ts`
- `public/prompts.json`

## 飞书精选提示词

飞书采集、PDF 文本提取、清洗、去重和离线翻译脚本位于 `scripts/`。原始下载文件和翻译缓存保存在 `prompt-source/curated/feishu-raw/`，该目录不会提交到 GitHub；产品只提交清洗后的 `prompt-source/curated/feishu.json` 和不包含内部来源链接的导入报告。

已有采集缓存时，可按以下顺序重建：

```bash
python -m pip install -r requirements-feishu.txt
npm run extract:feishu-pdfs
npm run build:feishu-prompts
npm run translate:feishu
npm run generate:prompts
```

需要重新采集飞书源数据时，先通过环境变量传入三个源地址，避免把内部链接写入公开仓库：

```powershell
$env:FEISHU_SOURCE_URLS='{"work":"https://tenant.feishu.cn/wiki/work-token","life":"https://tenant.feishu.cn/wiki/life-token","selected":"https://tenant.feishu.cn/wiki/selected-token"}'
npm run collect:feishu
```

翻译脚本首次运行时会下载 `Helsinki-NLP/opus-mt-zh-en` 模型。模型已经缓存在本机时，可设置 `FEISHU_TRANSLATION_OFFLINE=1` 强制离线加载。

## 验证

```bash
npm run lint
npm test
npm run build
```

## English

# ENHE AI Prompt Management System

ENHE AI Prompt Management System is a free prompt workspace that turns scattered AI prompts into a searchable, categorized, copy-ready tool. The main product is the web version. The desktop version is an offline prompt library for enterprise delivery and local use.

Website: https://www.enhe-tech.com.cn/

Creator: ENHE AI / HU

## Value

- Find practical prompts for writing, short video scripts, product copy, SEO/GEO, image generation, AI agents, and productivity.
- Add task context before copying so the prompt fits the actual job.
- Run the desktop version offline for local libraries, training, and enterprise handoff.
- Keep the data model simple so new industry prompt packs can be added later.

## Features

- 623 bilingual structured prompts: 205 legacy prompts and 418 safety-reviewed Feishu prompts.
- Search title, summary, body, and tags.
- Filter by category.
- Chinese and English UI.
- One-click prompt copy.
- Favorite prompts.
- Electron desktop entry.

## Prompt Source

The default source is stored inside this repository:

```text
prompt-source/聊天文本
```

Set `LEGACY_PROMPT_SOURCE` only when you intentionally want to import another prompt library.

## Curated Feishu Prompts

Collection, PDF extraction, cleanup, deduplication, and offline translation scripts live in `scripts/`. Raw downloads and translation caches stay under the ignored `prompt-source/curated/feishu-raw/` directory. Only the cleaned prompt dataset and a report without internal source links are committed.

Set `FEISHU_SOURCE_URLS` to a JSON object containing `work`, `life`, and `selected` wiki URLs before running `npm run collect:feishu`. This keeps private source links out of the public repository.

Install the ingestion dependencies with `python -m pip install -r requirements-feishu.txt`. The translation script downloads `Helsinki-NLP/opus-mt-zh-en` on first use; set `FEISHU_TRANSLATION_OFFLINE=1` only when the model is already cached.

## Validation

```bash
npm run lint
npm test
npm run build
```
