import type { ExampleBundle, Language } from "./types";

export function buildSolutionPrompt(
  bundle: ExampleBundle,
  target: Language,
  challengeSlug: string
) {
  console.log("Generating solution...");
  const refs = bundle.examples
    .map((e) => {
      return [
        `### ${e.language.toUpperCase()} Solution`,
        "```",
        e.solutionCode.trim(),
        "```",
        "",
        `Fixed hint titles for ${e.language}:`,
        ...e.hintTitles.map((t) => `- ${t}`),
      ].join("\n");
    })
    .join("\n\n");

  return [
    "You are a careful systems programming assistant.",
    `Task: Generate a minimal, working stage solution for the ${challengeSlug} challenge in the target language.`,
    "Constraints:",
    "- Follow the spirit of the given reference solutions. Keep it minimal and correct.",
    "- Do not add extra features or comments that are not required",
    "- Only produce the code for the target language. No explanations.",
    "",
    "Stage description:",
    "```markdown",
    bundle.stageDescription.trim(),
    "```",
    "",
    "Reference solutions and their fixed hint titles:",
    refs,
    "",
    `Target language: ${target}`,
    "Output: a single code block with the complete solution file content for the target language.",
  ].join("\n");
}

export function buildHintsPrompt(
  bundle: ExampleBundle,
  target: Language,
  fixedTitles: string[],
  challengeSlug: string
) {
  console.log("Generating hints...");
  const refs = bundle.examples
    .map((e) => {
      const hintsBlock =
        Array.isArray(e.hints) && e.hints.length
          ? [
              `### ${e.language.toUpperCase()} Hints (reference)`,
              ...e.hints.map((h, i) =>
                [
                  `- Title: ${h.title_markdown}`,
                  "  Body:",
                  "  ```markdown",
                  h.body_markdown.trim(),
                  "  ```",
                ].join("\n")
              ),
            ].join("\n")
          : `### ${e.language.toUpperCase()} Hints (reference)\n- None found`;

      return [
        `### ${e.language.toUpperCase()} Solution`,
        "```",
        e.solutionCode.trim(),
        "```",
        "",
        `### Fixed hint titles for ${e.language}`,
        ...(e.hintTitles.length
          ? e.hintTitles.map((t) => `- ${t}`)
          : ["- None"]),
        "",
        hintsBlock,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "You are a technical writing assistant.",
    `Task: Generate hint bodies for the ${challengeSlug} challenge Stage 2 for the target language.`,
    "Style and formatting rules:",
    "- Use only the exact fixed list of titles provided. Do not invent or rename titles.",
    "- Generate bodies only. Keep them short, clear, and focused on the single step needed.",
    "- Prefer one short code snippet per hint when it helps.",
    "- Write simple, direct sentences. Avoid filler such as “you can also,” “for example,” unless it is required to clarify one step.",
    "- When adding documentation links, use inline Markdown with the API name in backticks followed by the URL in parentheses on the same line. Examples:",
    "  - Correct: Use the [`accept()`](https://docs.python.org/3/library/socket.html#socket.socket.accept) method to get the client connection.",
    "  - Correct: The `b` prefix converts the string to a [bytes object](https://docs.python.org/3/library/stdtypes.html#bytes).",
    "  - Incorrect: socket.write() is documented at [Socket.write](link).",
    "  - Incorrect: You can also do: `server.on('connection', ...)`.",
    "- Do not add alternatives or extra patterns unless the hint requires them.",
    "- Do not add headings inside the body.",
    "- Keep code blocks minimal and runnable in isolation when possible.",
    "",
    "Minimal code policy:",
    "- Show only the smallest line or lines needed to illustrate the action.",
    "- Do not repeat boilerplate that already exists in the user's starting code.",
    "- Do not add import statements unless the hint is specifically about an import.",
    "- Do not wrap the snippet in extra callbacks or functions if the point is a single method call.",
    "",
    "Examples:",
    "  - Node",
    "    - Correct:",
    "      ```js",
    "      const server = net.createServer((socket) => { ",
    "        // 'socket' is the client's TCP connection",
    "      });",
    "      ```",
    "    - Incorrect:",
    "      ```js",
    "      import net from 'node:net';",
    "      const server = net.createServer((socket) => { ",
    "        // 'socket' is the client's TCP connection",
    "      });",
    "      server.listen(6379, '127.0.0.1');",
    "      ```",
    "",
    "    - Correct:",
    "      ```js",
    "      socket.write('+PONG\\r\\n')",
    "      ```",
    "    - Incorrect:",
    "      ```js",
    "      import net from 'node:net';",
    "      net.createServer((socket) => { socket.write('+PONG\\r\\n') }).listen(6379, '127.0.0.1')",
    "      ```",
    "",
    "  - Python",
    "    - Correct:",
    "      ```python",
    '      connection.sendall(b"+PONG\\r\\n")',
    "      ```",
    "    - Incorrect:",
    "      ```python",
    "      import socket",
    "      s = socket.create_server(('localhost', 6379))",
    "      conn, _ = s.accept()",
    '      conn.sendall(b"+PONG\\r\\n")',
    "      ```",
    "  - Zig",
    "    - Correct: Use `writeAll()` to send the `+PONG\\r\\n` simple string:",
    "      ```zig",
    '      try conn.stream.writer().writeAll("+PONG\\r\\n");',
    "      ```",
    "    - Incorrect: Write the RESP simple string to the connection's stream.",
    "",
    "Stage description:",
    "```markdown",
    bundle.stageDescription.trim(),
    "```",
    "",
    "Reference solutions and reference hints follow. Use them as guidance for style and scope, not as text to copy.",
    refs,
    "",
    `Target language: ${target}`,
    "Fixed titles for this target language:",
    ...fixedTitles.map((t) => `- ${t}`),
    "",
    "Output JSON only in this shape:",
    `{"hints":[{"title_markdown":"<exact title here>","body_markdown":"<body>"}]}`,
  ].join("\n");
}
