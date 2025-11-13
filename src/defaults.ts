import path from "node:path";

export const DEFAULT_MODEL = (process.env.LLM_STAGE_MODEL as string) || "gpt-5";

export const DEFAULT_PROJECT_ROOT =
  process.env.STAGEGEN_PROJECT_ROOT || process.cwd();

export const DEFAULT_LANG_CONCURRENCY = Number(
  process.env.STAGEGEN_LANG_CONCURRENCY || 30
);

export const DEFAULT_TASK_CONCURRENCY = Number(
  process.env.STAGEGEN_TASK_CONCURRENCY || 2
);

/**
 * Defaults here are minimal. Challenge slug is usually passed in,
 * but if omitted you can derive it in index.ts from project root.
 */
export const DEFAULTS = {
  projectRoot: path.resolve(DEFAULT_PROJECT_ROOT),
  challengeSlug: "", // let index.ts decide fallback
  stageId: "02-rg2",
  stageKind: "base" as "base" | "localized",
  refs: ["python", "go", "rust"],
  targets: [],
};
