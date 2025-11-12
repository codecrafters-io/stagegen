import { CLIOpts } from "./types";

function take(argv: string[], i: number): string | undefined {
  const v = argv[i + 1];
  return typeof v === "string" && !v.startsWith("--") ? v : undefined;
}

export function parseCLI(argv: string[]): CLIOpts {
  const opts: CLIOpts = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    switch (a) {
      case "--project-root": {
        const v = take(argv, i);
        if (v) opts.projectRoot = v;
        i++;
        break;
      }
      case "--challenge-slug": {
        const v = take(argv, i);
        if (v) opts.challengeSlug = v;
        i++;
        break;
      }
      case "--stage-id": {
        const v = take(argv, i);
        if (v) opts.stageId = v;
        i++;
        break;
      }
      case "--stage-kind": {
        const v = take(argv, i);
        if (v === "base" || v === "localized") {
          opts.stageKind = v;
        }
        i++;
        break;
      }
      case "--refs": {
        const v = take(argv, i);
        if (v)
          opts.refs = v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        i++;
        break;
      }
      case "--targets": {
        const v = take(argv, i);
        if (v)
          opts.targets = v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        i++;
        break;
      }
      case "--model": {
        const v = take(argv, i);
        if (v) opts.model = v;
        i++;
        break;
      }
      default: {
        // ignore unknown flags for now
        break;
      }
    }
  }

  return opts;
}
