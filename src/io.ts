import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { Hint, HintsFile, Language } from "./types";

function challengeDir(projectRoot: string, slug: string) {
  return path.join(projectRoot, "challenges", slug);
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
  if (lang === "c") return ".c";
  if (lang === "cpp") return ".cpp";
  if (lang === "elixir") return ".ex";
  if (lang === "kotlin") return ".kt";
  return "";
}

async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findMainFileRecursive(
  baseDir: string,
  ext: string
): Promise<string | null> {
  const direct = path.join(baseDir, `main${ext}`);
  if (await pathExists(direct)) return direct;

  const roots = ["src", "lib", "app"];
  for (const r of roots) {
    const rootDir = path.join(baseDir, r);
    if (!(await pathExists(rootDir))) continue;

    // BFS limited to a few levels for safety
    const queue: string[] = [rootDir];
    let depth = 0;
    const maxDepth = 4;

    while (queue.length && depth <= maxDepth) {
      const levelCount = queue.length;
      for (let i = 0; i < levelCount; i++) {
        const cur = queue.shift()!;
        try {
          const entries = await fs.readdir(cur, { withFileTypes: true });
          for (const de of entries) {
            const fp = path.join(cur, de.name);
            if (de.isDirectory()) {
              queue.push(fp);
            } else if (de.isFile() && de.name === `main${ext}`) {
              return fp;
            }
          }
        } catch {
          // ignore directory read errors
        }
      }
      depth++;
    }
  }
  return null;
}

/** Read solution code for a given stage folder id like "02-rg2". */
export async function readSolutionAt(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string
): Promise<string> {
  const codeDir = path.join(
    challengeDir(projectRoot, slug),
    "solutions",
    language,
    stageId,
    "code"
  );
  const ext = langExt(language);
  const found = await findMainFileRecursive(codeDir, ext);
  if (!found) return "";
  try {
    return await fs.readFile(found, "utf8");
  } catch {
    return "";
  }
}

/** Previous stage id for this language by numeric prefix, or null if none. */
export async function findPreviousStageId(
  projectRoot: string,
  slug: string,
  language: Language,
  currentStageId: string
): Promise<string | null> {
  const langDir = path.join(
    challengeDir(projectRoot, slug),
    "solutions",
    language
  );
  if (!(await pathExists(langDir))) return null;
  const m = currentStageId.match(/^(\d+)/);
  if (!m) return null;
  const curNum = Number(m[1]);

  const dirs = (await fs.readdir(langDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // find a dir whose numeric prefix equals curNum - 1
  const candidates = dirs
    .map((name) => {
      const mm = name.match(/^(\d+)/);
      return mm ? { name, num: Number(mm[1]) } : null;
    })
    .filter((x): x is { name: string; num: number } => !!x);

  const prev = candidates.find((c) => c.num === curNum - 1);
  return prev ? prev.name : null;
}

/** Read the previous stage solution for the same language if present. */
export async function readPreviousSolution(
  projectRoot: string,
  slug: string,
  language: Language,
  currentStageId: string
): Promise<{ stageId: string | null; code: string }> {
  const prevId = await findPreviousStageId(
    projectRoot,
    slug,
    language,
    currentStageId
  );
  if (!prevId) return { stageId: null, code: "" };
  const code = await readSolutionAt(projectRoot, slug, language, prevId);
  return { stageId: prevId, code };
}

/** Keep your existing readers below... */
export async function readReferenceSolution(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string
) {
  return readSolutionAt(projectRoot, slug, language, stageId);
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
    return parsed.hints.map((h) => ({
      title_markdown: String(h.title_markdown || ""),
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
  if (lang === "elixir") return "main.ex";
  if (lang === "kotlin") return "Main.kt";
  return "main.txt";
}
