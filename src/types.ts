export type Language = string;

export type GenInputs = {
  challengeRoot: string; // e.g. /abs/path/build-your-own-redis
  stageId: string; // e.g. 02-rg2 or base-02
  stageFolderKind: "base" | "localized"; // stage_descriptions/base-<id> or stage_descriptions/<id>
  referenceLangs: Language[]; // e.g. ["python", "go", "rust"]
  targetLangs: Language[]; // e.g. ["javascript", "typescript", "zig", ...]
  model: string; // e.g. gpt-5 or o3
  challengeSlug: string; // e.g. build-your-own-redis or build-your-own-shell
};

export type Hint = {
  title_markdown: string;
  body_markdown: string;
};

export type HintsFile = {
  hints: Hint[];
};

export type GeneratedResult = {
  language: Language;
  solutionCode: string;
  hints: Hint[];
};

export type ExampleBundle = {
  stageDescription: string;
  examples: Array<{
    language: Language;
    solutionCode: string;
    hintTitles: string[]; // fixed titles from reference lang config.yml
    hints?: Hint[];
  }>;
};

export type GenerateInput = {
  bundle: ExampleBundle;
  target: Language;
  fixedTitles: string[];
  model: string;
  challengeSlug: string;
  previous?: { stageId: string | null; code: string }; // new
};

export type CLIOpts = {
  projectRoot?: string;
  challengeSlug?: string;
  stageId?: string;
  stageKind?: "base" | "localized";
  refs?: string[];
  targets?: string[];
  model?: string;
};
