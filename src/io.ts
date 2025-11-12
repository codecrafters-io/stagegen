import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { Hint, HintsFile, Language } from "./types";

function challengeDir(projectRoot: string, slug: string) {
  return path.join(projectRoot, "challenges", slug);
}

async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function readStageDescription(
  projectRoot: string,
  slug: string,
  stageBaseId: string, // e.g. "02"
  kind: "base" | "localized"
) {
  const root = challengeDir(projectRoot, slug);
  const dir = path.join(root, "stage_descriptions");

  if (kind === "base") {
    // Try folder first: stage_descriptions/base-02/<some>.md
    const folderPath = path.join(dir, `base-${stageBaseId}`);
    if (await pathExists(folderPath)) {
      const files = await fs.readdir(folderPath);
      const md = files.find((f) => f.endsWith(".md"));
      if (!md) throw new Error(`No markdown found in ${folderPath}`);
      return fs.readFile(path.join(folderPath, md), "utf8");
    }

    // Fallback to single file: stage_descriptions/base-02.md
    const filePath = path.join(dir, `base-${stageBaseId}.md`);
    if (await pathExists(filePath)) {
      return fs.readFile(filePath, "utf8");
    }

    throw new Error(
      `Stage description not found. Tried:\n  ${folderPath}\n  ${filePath}`
    );
  } else {
    // localized: stage_descriptions/<id>/... or stage_descriptions/<id>.md
    const folderPath = path.join(dir, stageBaseId);
    if (await pathExists(folderPath)) {
      const files = await fs.readdir(folderPath);
      const md = files.find((f) => f.endsWith(".md"));
      if (!md) throw new Error(`No markdown found in ${folderPath}`);
      return fs.readFile(path.join(folderPath, md), "utf8");
    }

    const filePath = path.join(dir, `${stageBaseId}.md`);
    if (await pathExists(filePath)) {
      return fs.readFile(filePath, "utf8");
    }

    throw new Error(
      `Stage description not found. Tried:\n  ${folderPath}\n  ${filePath}`
    );
  }
}

function langExt(lang: Language): string {
  if (lang === "python") return ".py";
  if (lang === "go") return ".go";
  if (lang === "rust") return ".rs";
  if (lang === "typescript") return ".ts";
  if (lang === "javascript") return ".js";
  if (lang === "zig") return ".zig";
  if (lang === "ruby") return ".rb";
  if (lang === "java") return ".java";
  if (lang === "crystal") return ".cr";
  return "";
}

async function tryRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function readReferenceSolution(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string
) {
  const base = path.join(
    challengeDir(projectRoot, slug),
    "solutions",
    language,
    stageId,
    "code"
  );

  const ext = langExt(language);
  const candidates = [
    path.join(base, "src", `main${ext}`),
    path.join(base, "app", `main${ext}`),
  ];

  for (const fp of candidates) {
    const content = await tryRead(fp);
    if (content !== null) return content;
  }

  return "";
}

export async function readReferenceHintTitles(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string
): Promise<string[]> {
  const cfgPath = path.join(
    challengeDir(projectRoot, slug),
    "solutions",
    language,
    stageId,
    "config.yml"
  );
  try {
    const raw = await fs.readFile(cfgPath, "utf8");
    const parsed = YAML.parse(raw) as HintsFile;
    const titles = Array.isArray(parsed?.hints)
      ? parsed.hints
          .map((h: any) => h?.title_markdown)
          .filter(
            (t: any): t is string => typeof t === "string" && t.length > 0
          )
      : [];
    return titles;
  } catch {
    return [];
  }
}

export async function readReferenceHints(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string
): Promise<Hint[]> {
  const cfgPath = path.join(
    challengeDir(projectRoot, slug),
    "solutions",
    language,
    stageId,
    "config.yml"
  );
  try {
    const raw = await fs.readFile(cfgPath, "utf8");
    const parsed = YAML.parse(raw) as HintsFile;
    if (!parsed || !Array.isArray(parsed.hints)) return [];
    return parsed.hints
      .filter((h) => h && typeof h.title_markdown === "string")
      .map((h) => ({
        title_markdown: String(h.title_markdown),
        body_markdown: String(h.body_markdown || ""),
      }));
  } catch {
    return [];
  }
}

export async function writeTargetSolution(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string,
  filename: string,
  code: string,
  dry = false
) {
  const dir = path.join(
    challengeDir(projectRoot, slug),
    "solutions",
    language,
    stageId,
    "code"
  );
  if (dry) {
    console.log(`[DRY] write file: ${path.join(dir, filename)}`);
    return;
  }
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), code, "utf8");
}

export async function writeTargetHints(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string,
  hints: Hint[],
  dry = false
) {
  const cfgPath = path.join(
    challengeDir(projectRoot, slug),
    "solutions",
    language,
    stageId,
    "config.yml"
  );
  const txt =
    "hints:\n" +
    hints
      .map((h) => {
        const body = (h.body_markdown || "")
          .split("\n")
          .map((l) => "      " + l)
          .join("\n");
        return [
          `  - title_markdown: ${JSON.stringify(h.title_markdown || "")}`,
          "    body_markdown: |-",
          body,
        ].join("\n");
      })
      .join("\n") +
    "\n";

  if (dry) {
    console.log(`[DRY] write hints: ${cfgPath}`);
    return;
  }
  await fs.mkdir(path.dirname(cfgPath), { recursive: true });
  await fs.writeFile(cfgPath, txt, "utf8");
}

export function defaultFileForLanguage(lang: Language): string {
  if (lang === "python") return "main.py";
  if (lang === "go") return "main.go";
  if (lang === "rust") return "main.rs";
  if (lang === "javascript") return "main.js";
  if (lang === "typescript") return "main.ts";
  if (lang === "zig") return "main.zig";
  if (lang === "ruby") return "main.rb";
  if (lang === "java") return "Main.java";
  if (lang === "c") return "main.c";
  if (lang === "cpp") return "main.cpp";
  if (lang === "crystal") return "main.cr";
  return "main.txt";
}
