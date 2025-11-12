import { client } from "./openai";
import { buildHintsPrompt, buildSolutionPrompt } from "./prompts";
import type { ExampleBundle, GeneratedResult, GenInputs, Hint } from "./types";

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
  bundle: ExampleBundle,
  targetLang: string,
  fixedTitles: string[],
  model: string,
  challengeSlug: string
): Promise<GeneratedResult> {
  const solPrompt = buildSolutionPrompt(bundle, targetLang, challengeSlug);
  const solutionCode = await llmCode(model, solPrompt);

  const hintsPrompt = buildHintsPrompt(
    bundle,
    targetLang,
    fixedTitles,
    challengeSlug
  );
  const hintsJSON = await llmJSON<{ hints: Hint[] }>(model, hintsPrompt);

  return {
    language: targetLang,
    solutionCode,
    hints: (hintsJSON.hints || []).map((h) => ({
      title_markdown: h.title_markdown,
      body_markdown: h.body_markdown,
    })),
  };
}
