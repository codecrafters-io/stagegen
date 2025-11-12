#!/usr/bin/env bun
import path from "node:path";
import {
  readStageDescription,
  readReferenceSolution,
  readReferenceHintTitles,
  writeTargetSolution,
  writeTargetHints,
  defaultFileForLanguage,
  readReferenceHints,
} from "./io";
import { generateForLanguage } from "./generate";
import type { ExampleBundle } from "./types";
import { parseCLI } from "./cli";
import { DEFAULTS, DEFAULT_MODEL } from "./defaults";

function deriveChallengeSlug(projectRoot: string, provided?: string): string {
  if (provided && provided.length > 0) return provided;
  // Try to infer from challenges/<slug>
  const parts = projectRoot.split(path.sep);
  const idx = parts.lastIndexOf("challenges");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  // Fallback to basename
  return path.basename(projectRoot);
}

async function main() {
  const cli = parseCLI(process.argv.slice(2));

  const PROJECT_ROOT = path.resolve(cli.projectRoot || DEFAULTS.projectRoot);
  const CHALLENGE_SLUG = deriveChallengeSlug(PROJECT_ROOT, cli.challengeSlug);
  const STAGE_ID = cli.stageId || DEFAULTS.stageId;
  const STAGE_KIND = cli.stageKind || DEFAULTS.stageKind;

  const REFS = cli.refs && cli.refs.length ? cli.refs : DEFAULTS.refs;
  const TARGETS =
    cli.targets && cli.targets.length ? cli.targets : DEFAULTS.targets;

  const MODEL = cli.model || DEFAULT_MODEL;
  const DRY = !!process.env.DRY_RUN;

  // Read stage description from challenges/<slug>/stage_descriptions/
  const stageDescription = await readStageDescription(
    PROJECT_ROOT,
    CHALLENGE_SLUG,
    STAGE_ID,
    STAGE_KIND
  );

  // Gather fixed titles and minimal reference code from reference languages
  const examples = await Promise.all(
    REFS.map(async (lang) => {
      const solutionCode = await readReferenceSolution(
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
      return { language: lang, solutionCode, hintTitles: titles, hints };
    })
  );

  const fixedTitles = examples.find((e) => e.hintTitles.length > 0)
    ?.hintTitles || [
    "How do I access the client's TCP connection?",
    "How do I send a response to the client?",
  ];

  const bundle: ExampleBundle = { stageDescription, examples };

  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Challenge: ${CHALLENGE_SLUG}`);
  console.log(`Stage: ${STAGE_ID} (${STAGE_KIND})`);
  console.log(`Refs: ${REFS.join(", ")}`);
  console.log(`Targets: ${TARGETS.join(", ")}`);
  console.log(`Model: ${MODEL}\n`);

  for (const lang of TARGETS) {
    console.log(`→ Generating for ${lang}...`);
    const out = await generateForLanguage(
      bundle,
      lang,
      fixedTitles,
      MODEL,
      CHALLENGE_SLUG
    );

    const filename = defaultFileForLanguage(lang);
    await writeTargetSolution(
      PROJECT_ROOT,
      CHALLENGE_SLUG,
      lang,
      STAGE_ID,
      filename,
      out.solutionCode,
      DRY
    );
    await writeTargetHints(
      PROJECT_ROOT,
      CHALLENGE_SLUG,
      lang,
      STAGE_ID,
      out.hints,
      DRY
    );

    console.log(`   Wrote solution and hints for ${lang}`);
  }

  console.log("\nDone. Open PRs manually with the generated files.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
