import { createInterface } from "node:readline/promises";
import { handleSigint } from "./io.js";

export const prompt = async (question: string): Promise<string> => {
  const release = handleSigint();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const response = await rl.question(question);
    return response.trim();
  } finally {
    rl.close();
    release();
  }
};

export const confirm = async (question: string): Promise<boolean> => {
  const response = await prompt(question);
  const normalized = response.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
};
