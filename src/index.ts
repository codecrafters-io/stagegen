import path from "node:path";

import {
  readReferenceSolution,
  readReferenceHintTitles,
  readReferenceHints,
  readPreviousSolution,
  writeTargetHints,
  defaultFileForLanguage,
  readStageDescription,
  writeSolutionOverStarter,
  listChallengeLanguages,
} from "./io";
import { parseCLI } from "./cli";
import {
  DEFAULTS,
  DEFAULT_MODEL,
  DEFAULT_LANG_CONCURRENCY,
  DEFAULT_TASK_CONCURRENCY,
} from "./defaults";
import { generateHints, generateSolutionCode } from "./generate";
import type { ExampleBundle, Hint } from "./types";
import * as log from "./logger";

function deriveChallengeSlug(projectRoot: string, provided?: string): string {
  if (provided && provided.length > 0) return provided;
  const parts = projectRoot.split(path.sep);
  const idx = parts.lastIndexOf("challenges");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return path.basename(projectRoot);
}

const c = {
  green: (s: string) => `\u001b[32m${s}\u001b[39m`,
  dim: (s: string) => `\u001b[2m${s}\u001b[22m`,
};

// Simple promise pool
export async function runPool<T>(
  limit: number,
  tasks: Array<() => Promise<T>>
): Promise<T[]> {
  if (limit < 1) limit = 1;

  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

async function main() {
  const cli = parseCLI(process.argv.slice(2));

  const PROJECT_ROOT = path.resolve(cli.projectRoot || DEFAULTS.projectRoot);
  const CHALLENGE_SLUG = deriveChallengeSlug(PROJECT_ROOT, cli.challengeSlug);
  const STAGE_ID = cli.stageId || DEFAULTS.stageId;
  const STAGE_KIND = cli.stageKind || DEFAULTS.stageKind;

  const REFS = cli.refs && cli.refs.length ? cli.refs : DEFAULTS.refs;
  let TARGETS =
    cli.targets && cli.targets.length ? cli.targets : DEFAULTS.targets;

  if (!TARGETS.length) {
    TARGETS = await listChallengeLanguages(PROJECT_ROOT, CHALLENGE_SLUG);
    TARGETS = TARGETS.filter((t) => !REFS.includes(t));

    if (!TARGETS.length) {
      throw new Error(
        `No target languages provided and none detected under ` +
          `challenges/${CHALLENGE_SLUG}/solutions`
      );
    }
  }

  const MODEL = cli.model || DEFAULT_MODEL;
  const DRY = !!process.env.DRY_RUN;
  const LANG_CONC = cli.langConcurrency ?? DEFAULT_LANG_CONCURRENCY;
  const TASK_CONC = cli.taskConcurrency ?? DEFAULT_TASK_CONCURRENCY;

  const baseId = STAGE_ID;

  const stageDescription = await log.task(
    "setup",
    "Read stage description",
    () => readStageDescription(PROJECT_ROOT, CHALLENGE_SLUG, baseId, STAGE_KIND)
  );

  const examples = await log.task(
    "setup",
    "Read reference examples",
    async () => {
      const out = await Promise.all(
        REFS.map(async (lang) => {
          const sol = await readReferenceSolution(
            PROJECT_ROOT,
            CHALLENGE_SLUG,
            lang,
            STAGE_ID
          );
          const titles = await readReferenceHintTitles(
            PROJECT_ROOT,
            CHALLENGE_SLUG,
            lang,
            STAGE_ID
          );
          const hints = await readReferenceHints(
            PROJECT_ROOT,
            CHALLENGE_SLUG,
            lang,
            STAGE_ID
          );
          return {
            language: lang,
            solutionCode: sol,
            hintTitles: titles,
            hints,
          };
        })
      );
      return out;
    }
  );

  const fixedTitles = examples.find((e) => e.hintTitles.length > 0)
    ?.hintTitles || [
    "How do I access the client's TCP connection?",
    "How do I send a response to the client?",
  ];

  const bundle: ExampleBundle = { stageDescription, examples };

  await log.header("StageGen - Generate Stage Outputs");
  await log.line(`Project root: ${PROJECT_ROOT}`);
  await log.line(`Challenge: ${CHALLENGE_SLUG}`);
  await log.line(`Stage: ${STAGE_ID} (${STAGE_KIND})`);
  await log.line(`Refs: ${REFS.join(", ")}`);
  await log.line(`Targets: ${TARGETS.join(", ")}`);
  await log.line(`Model: ${MODEL}`);
  await log.line(
    `Concurrency: ${LANG_CONC} langs, ${TASK_CONC} tasks per lang\n`
  );

  const langTasks = TARGETS.map((lang) => async () => {
    const ctx = lang;

    const prev = await log.task(ctx, "Read previous solution", () =>
      readPreviousSolution(PROJECT_ROOT, CHALLENGE_SLUG, lang, STAGE_ID)
    );

    type HintsOrSolution = "hints" | "solution";
    // Solution and hints in parallel using a tiny pool
    const results = await runPool(Math.max(1, Math.min(2, TASK_CONC)), [
      async () => ({
        kind: "solution" as HintsOrSolution,
        code: await log.task(ctx, "Generate solution", () =>
          generateSolutionCode({
            bundle,
            target: lang,
            fixedTitles,
            model: MODEL,
            challengeSlug: CHALLENGE_SLUG,
            previous: prev,
          })
        ),
        hints: [],
      }),
      async () => ({
        kind: "hints" as HintsOrSolution,
        hints: await log.task(ctx, "Generate hints", () =>
          generateHints({
            bundle,
            target: lang,
            fixedTitles,
            model: MODEL,
            challengeSlug: CHALLENGE_SLUG,
            previous: prev,
          })
        ),
        code: "",
      }),
    ]);

    const sol: {
      kind: HintsOrSolution;
      code: string;
    } = results.find((r) => r.kind === "solution")!;

    const hin: {
      kind: HintsOrSolution;
      hints: Hint[];
    } = results.find((r) => r.kind === "hints")!;

    const writtenPath = await log.task(
      ctx,
      "Copy starter and write solution",
      () =>
        writeSolutionOverStarter(
          PROJECT_ROOT,
          CHALLENGE_SLUG,
          lang,
          STAGE_ID,
          sol.code,
          DRY
        )
    );

    await log.line(`  [${ctx}] ▶ Wrote solution to ${writtenPath}`);

    await log.task(ctx, "Write hints", () =>
      writeTargetHints(
        PROJECT_ROOT,
        CHALLENGE_SLUG,
        lang,
        STAGE_ID,
        hin.hints,
        DRY
      )
    );

    const builtNote = prev.stageId ? `built on ${prev.stageId}` : "no previous";
    await log.line(
      `  ${c.green("✓")} Done ${lang} ${c.dim("(" + builtNote + ")")}`
    );
  });

  await log.task("runner", `Run ${TARGETS.length} language task(s)`, () =>
    runPool(LANG_CONC, langTasks)
  );

  await log.summaryLine(TARGETS.length, 0);
}

main().catch(async (e) => {
  await log.line("");
  await log.line(String(e?.message || e));
  process.exit(1);
});
