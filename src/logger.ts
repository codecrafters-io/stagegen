import { performance } from "node:perf_hooks";

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
};

let chain = Promise.resolve();
async function write(line: string) {
  chain = chain.then(
    () =>
      new Promise<void>((r) => {
        process.stdout.write(line + "\n");
        r();
      })
  );
  await chain;
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms | 0} ms`;
  const s = ms / 1000;
  return s < 60
    ? `${s.toFixed(2)} s`
    : `${Math.floor(s / 60)}m ${(s % 60).toFixed(1)}s`;
}

function padDots(base: string, width = 70) {
  return base.length >= width ? base : base + ".".repeat(width - base.length);
}

export async function header(title: string) {
  const bar = "─".repeat(70);
  await write(bar);
  await write(c.bold(title));
  await write(bar);
}

export async function line(s = "") {
  await write(s);
}

export async function summaryLine(ok: number, fail: number) {
  await write(
    `  └ Summary: ${c.green(`${ok} done`)}, ${c.red(`${fail} failed`)}  ${
      fail ? "❌" : "✅"
    }`
  );
}

/**
 * Run a task and print a single compact line:
 *   [context] ▶ Label  DONE  (123 ms)
 * On error prints a rationale line below it.
 */
export async function task<T>(
  context: string,
  label: string,
  work: () => Promise<T>,
  opts?: { rationale?: string }
): Promise<T> {
  const start = performance.now();
  try {
    const out = await work();
    const took = fmtMs(performance.now() - start);
    const prefix = `  [${context}] ▶ ${label} `;
    await write(
      `${padDots(prefix)}${c.green("DONE")}  ${c.gray("(" + took + ")")}`
    );
    return out;
  } catch (e: any) {
    const took = fmtMs(performance.now() - start);
    const prefix = `  [${context}] ▶ ${label} `;
    await write(
      `${padDots(prefix)}${c.red("FAIL")}  ${c.gray("(" + took + ")")}`
    );
    const msg = opts?.rationale || String(e?.message || e);
    await write(`${c.dim("      • rationale: ")}${msg}`);
    throw e;
  }
}
