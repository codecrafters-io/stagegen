import { OpenAI } from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set");
  process.exit(2);
}

export const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});
