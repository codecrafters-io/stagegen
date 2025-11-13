import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { Hint, HintsFile, Language } from "./types";

function challengeDir(projectRoot: string, slug: string) {
  return path.join(projectRoot, "challenges", slug);
}

// List every direct child directory under challenges/<slug>/solutions
export async function listChallengeLanguages(
  projectRoot: string,
  slug: string
): Promise<Language[]> {
  const solDir = path.join(challengeDir(projectRoot, slug), "solutions");
  try {
    const entries = await fs.readdir(solDir, { withFileTypes: true });
    const langs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => !name.startsWith(".")); // ignore hidden like .DS_Store
    return langs as Language[];
  } catch {
    return [];
  }
}

function langExt(lang: Language): string {
  if (lang === "clojure") return ".clj";
  if (lang === "crystal") return ".cr";
  if (lang === "elixir") return ".ex";
  if (lang === "haskell") return ".hs";
  if (lang === "javascript") return ".js";
  if (lang === "kotlin") return ".kt";
  if (lang === "ocaml") return ".ml";
  if (lang === "python") return ".py";
  if (lang === "ruby") return ".rb";
  if (lang === "rust") return ".rs";
  if (lang === "typescript") return ".ts";
  if (lang === "csharp") return ".cs";
  return `.${lang}`;
}

async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function rmrf(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

export async function copyDir(src: string, dst: string) {
  // Node 18+: fs.cp is available
  // Fallback to manual copy if needed
  const hasCp = typeof (fs as any).cp === "function";
  if (hasCp) {
    await (fs as any).cp(src, dst, { recursive: true, force: true });
    return;
  }
  await ensureDir(dst);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const de of entries) {
    const s = path.join(src, de.name);
    const d = path.join(dst, de.name);
    if (de.isDirectory()) {
      await copyDir(s, d);
    } else if (de.isFile()) {
      await ensureDir(path.dirname(d));
      await fs.copyFile(s, d);
    }
  }
}

const ROOTS = ["src", "lib", "app", "Sources"];
const PREFERRED_NAMES = [
  "main",
  "Main",
  "index",
  "Index",
  "app",
  "App",
  "server",
  "Server",
  "core",
  "Core",
  "program",
  "Program",
  "Sources",
];

function prefRank(basename: string) {
  const i = PREFERRED_NAMES.indexOf(basename);
  return i >= 0 ? i : Number.POSITIVE_INFINITY;
}

/**
 * Phase 1: search only under ROOTS in order, pick by:
 *   a) preferred basename rank
 *   b) shallower depth
 *   c) lexicographic path
 * If nothing found under ROOTS:
 * Phase 2: search the entire baseDir, pick the deepest file, then:
 *   a) preferred basename rank
 *   b) lexicographic path
 */
export async function findMainFileRecursive(
  baseDir: string,
  ext: string
): Promise<string | null> {
  // Phase 1
  const phase1Hits: { fp: string; depth: number; rank: number }[] = [];

  for (const root of ROOTS) {
    const rootDir = path.join(baseDir, root);
    if (!(await pathExists(rootDir))) continue;

    const queue: Array<{ dir: string; depth: number }> = [
      { dir: rootDir, depth: 0 },
    ];
    const maxDepth = 12;

    while (queue.length) {
      const { dir, depth } = queue.shift()!;
      if (depth > maxDepth) continue;

      const entries = await safeReadDir(dir);
      for (const de of entries) {
        const fp = path.join(dir, de.name);
        if (de.isDirectory()) {
          queue.push({ dir: fp, depth: depth + 1 });
        } else if (de.isFile() && de.name.endsWith(ext)) {
          const base = path.basename(de.name, ext);
          phase1Hits.push({ fp, depth, rank: prefRank(base) });
        }
      }
    }
    if (phase1Hits.length) break; // first root yielding hits wins
  }

  if (phase1Hits.length) {
    phase1Hits.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank; // better name first
      if (a.depth !== b.depth) return a.depth - b.depth; // shallower first
      return a.fp.localeCompare(b.fp); // stable
    });
    return phase1Hits[0].fp;
  }

  // Phase 2
  const phase2Hits: { fp: string; depth: number; rank: number }[] = [];
  const q2: Array<{ dir: string; depth: number }> = [
    { dir: baseDir, depth: 0 },
  ];
  const maxDepth2 = 20;

  while (q2.length) {
    const { dir, depth } = q2.shift()!;
    if (depth > maxDepth2) continue;

    const entries = await safeReadDir(dir);
    for (const de of entries) {
      const fp = path.join(dir, de.name);
      if (de.isDirectory()) {
        q2.push({ dir: fp, depth: depth + 1 });
      } else if (de.isFile() && de.name.endsWith(ext)) {
        const base = path.basename(de.name, ext);
        phase2Hits.push({ fp, depth, rank: prefRank(base) });
      }
    }
  }

  if (!phase2Hits.length) return null;

  // deepest first, then preferred name, then lexicographic
  phase2Hits.sort((a, b) => {
    if (a.depth !== b.depth) return b.depth - a.depth; // deeper first
    if (a.rank !== b.rank) return a.rank - b.rank; // better name
    return a.fp.localeCompare(b.fp);
  });

  return phase2Hits[0].fp;
}

async function safeReadDir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Prepare destination code dir by copying compiled_starters/<lang> into
 * solutions/<lang>/<stageId>/code, wiping any previous contents.
 * Returns absolute path to the prepared code dir.
 */
export async function prepareSolutionCodeDir(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string
): Promise<string> {
  const srcDir = path.join(
    challengeDir(projectRoot, slug),
    "compiled_starters",
    language
  );
  const dstDir = path.join(
    challengeDir(projectRoot, slug),
    "solutions",
    language,
    stageId,
    "code"
  );

  // Ensure source exists
  if (!(await pathExists(srcDir))) {
    throw new Error(`compiled_starters/${language} not found at ${srcDir}`);
  }

  // Reset destination before copy to avoid stale files
  await rmrf(dstDir);
  await ensureDir(path.dirname(dstDir));
  await copyDir(srcDir, dstDir);

  return dstDir;
}

/**
 * Copy compiled starter into the code dir, then find main.<ext> and overwrite it
 * with the provided solution. If main.<ext> does not exist after copy, create
 * code/src/main.<ext>.
 * Returns the absolute path that was written.
 */
export async function writeSolutionOverStarter(
  projectRoot: string,
  slug: string,
  language: Language,
  stageId: string,
  solutionCode: string,
  dryRun = false
): Promise<string> {
  const codeDir = await prepareSolutionCodeDir(
    projectRoot,
    slug,
    language,
    stageId
  );

  const ext = langExt(language);
  let mainPath = await findMainFileRecursive(codeDir, ext);

  if (!mainPath) {
    // Create a sensible default location
    const fallback = path.join(codeDir, "src", `main${ext}`);
    await ensureDir(path.dirname(fallback));
    mainPath = fallback;
  }

  if (!dryRun) {
    await fs.writeFile(mainPath, solutionCode, "utf8");
  }

  return mainPath;
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
  const candidates = dirs
    .map((name) => {
      const mm = name.match(/^(\d+)/);
      return mm ? { name, num: Number(mm[1]) } : null;
    })
    .filter((x): x is { name: string; num: number } => !!x);
  const prev = candidates.find((c) => c.num === curNum - 1);
  return prev ? prev.name : null;
}

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

export function defaultFileForLanguage(lang: Language) {
  if (lang === "java") return "Main.java";
  return `main${langExt(lang)}`;
}
