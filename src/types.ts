export type PromptSourceType = "legacy" | "curated";

export type PromptEntry = {
  id: string;
  title: string;
  category: string;
  sourceType: PromptSourceType;
  sourcePath: string;
  summary: string;
  prompt: string;
  tags: string[];
};

export type PromptSearchInput = {
  query: string;
  category: string;
};
