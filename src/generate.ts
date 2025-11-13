import { client } from "./openai";
import { buildHintsPrompt } from "./prompts";
import type { GenerateInput, Hint } from "./types";

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

export async function generateForLanguage(
  args: GenerateInput
): Promise<{ solutionCode: string; hints: Hint[] }> {
  const { bundle, target, fixedTitles, model, challengeSlug, previous } = args;

  const solutionPrompt = [
    `You are generating Stage 2 solution code for ${challengeSlug} in ${target}.`,
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

  const solutionResp = await client.chat.completions.create({
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

  const solutionCode = solutionResp.choices[0].message?.content?.trim() || "";

  const hintsPrompt = buildHintsPrompt(
    bundle,
    target,
    fixedTitles,
    challengeSlug
  );
  const hintsResp = await client.chat.completions.create({
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

  const parsed = JSON.parse(
    hintsResp.choices[0].message?.content || `{"hints":[]}`
  );
  return { solutionCode, hints: parsed.hints || [] };
}
