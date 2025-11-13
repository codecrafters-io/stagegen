import { client } from "./openai";
import type { ExampleBundle, GenerateInput, Hint, Language } from "./types";

export async function llmJSON<T = any>(
  model: string,
  prompt: string
): Promise<T> {
  const resp = await client.chat.completions.create({
    model,
    temperature: 1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return ONLY valid JSON." },
      { role: "user", content: prompt },
    ],
  });
  return JSON.parse(resp.choices[0].message?.content || "{}");
}

export async function llmCode(model: string, prompt: string): Promise<string> {
  const resp = await client.chat.completions.create({
    model,
    temperature: 1,
    messages: [
      {
        role: "system",
        content: "Return code only inside one code block. No explanations.",
      },
      { role: "user", content: prompt },
    ],
  });
  const raw = resp.choices[0].message?.content || "";
  const m = raw.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
  return m ? m[1].trim() : raw.trim();
}

export async function generateSolutionCode(
  args: GenerateInput
): Promise<string> {
  const { bundle, target, model, challengeSlug, previous } = args;

  const solutionPrompt = [
    `You are generating stage solution code for ${challengeSlug} in ${target}.`,
    "",
    previous?.code
      ? [
          "Start from the previous stage code shown below.",
          "Extend it to implement this stage. Do not rename existing variables or functions.",
          "Preserve structure and imports unless the change is required by the new logic.",
          "",
          "Previous code:",
          "```",
          previous.code.trim(),
          "```",
          "",
        ].join("\n")
      : "There is no previous code for this language. Provide a minimal Stage 2 solution.",
    "",
    "Stage description:",
    "```markdown",
    bundle.stageDescription.trim(),
    "```",
    "",
    "Reference solutions in other languages follow. Keep your version minimal and idiomatic:",
    ...bundle.examples.map((e) =>
      [
        `### ${e.language.toUpperCase()}`,
        "```",
        e.solutionCode.trim(),
        "```",
        "",
      ].join("\n")
    ),
    "",
    "Return only the final code for this language.",
  ].join("\n");

  const resp = await client.chat.completions.create({
    model,
    temperature: 1,
    messages: [
      {
        role: "system",
        content: "You are a strict code generator. Output code only.",
      },
      { role: "user", content: solutionPrompt },
    ],
  });

  return resp.choices[0].message?.content?.trim() || "";
}

function buildHintsPrompt(
  bundle: ExampleBundle,
  target: Language,
  fixedTitles: string[],
  challengeSlug: string,
  previous?: GenerateInput["previous"]
) {
  const refs = bundle.examples
    .map((e) => {
      const hintsBlock =
        Array.isArray(e.hints) && e.hints.length
          ? [
              `### ${e.language.toUpperCase()} Hints (reference)`,
              ...e.hints.map((h, _) =>
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
    `Task: Generate hint bodies for the ${challengeSlug} challenge stage for the target language.`,
    previous?.code
      ? [
          "Use the previous stage code shown below as additional context.",
          "",
          "Previous code:",
          "```",
          previous.code.trim(),
          "```",
          "",
        ].join("\n")
      : "There is no previous code for this language.",
    "",
    "Style and formatting rules:",
    "- Use only the exact fixed list of titles provided. Do not invent or rename titles.",
    "- Generate bodies only. Keep them short, clear, and focused on the step needed.",
    "- Use the pattern loosely: Use `<API>()` to `<goal>`: any additional context should be after the code snippet.",
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
    "Micro style rules:",
    "- Do not use semicolons in prose. Split into two sentences instead of joining with a semicolon.",
    '- For RESP wording use this exact phrasing when relevant: the string "PONG" encoded as a RESP simple string.',
    "- Only use bullet lists when there are two or more items. If there is a single fact, write a plain sentence.",
    "",
    "Stage description:",
    "```markdown",
    bundle.stageDescription.trim(),
    "```",
    "",
    "Reference hints to follow. Use them as guidance for style and scope, not as text to copy.",
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

export async function generateHints(args: GenerateInput): Promise<Hint[]> {
  const { bundle, target, fixedTitles, model, challengeSlug, previous } = args;

  const hintsPrompt = buildHintsPrompt(
    bundle,
    target,
    fixedTitles,
    challengeSlug,
    previous
  );

  const resp = await client.chat.completions.create({
    model,
    temperature: 1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict, deterministic doc writer. Return JSON only.",
      },
      { role: "user", content: hintsPrompt },
    ],
  });

  const parsed = JSON.parse(resp.choices[0].message?.content || `{"hints":[]}`);
  return parsed.hints || [];
}
