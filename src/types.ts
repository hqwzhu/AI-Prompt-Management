export type PromptSourceType = "legacy" | "curated";
export type PromptLocale = "zh" | "en";

export type PromptTranslation = {
  title: string;
  category: string;
  sourcePath: string;
  summary: string;
  prompt: string;
  tags: string[];
};

export type PromptEntry = {
  id: string;
  title: string;
  category: string;
  sourceType: PromptSourceType;
  sourcePath: string;
  summary: string;
  prompt: string;
  tags: string[];
  translations?: {
    en?: PromptTranslation;
  };
};

export type PromptSearchInput = {
  query: string;
  category: string;
};
