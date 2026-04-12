import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    "Missing GEMINI_API_KEY. Set it via: flyctl secrets set GEMINI_API_KEY=... (prod) or Replit Secrets (dev)."
  );
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
