import { GoogleGenAI } from "@google/genai";

const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "Missing Gemini API key. " +
    "In production set GEMINI_API_KEY (flyctl secrets set GEMINI_API_KEY=...). " +
    "In development provision the Replit Gemini integration."
  );
}

const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

export const ai = new GoogleGenAI({
  apiKey,
  ...(baseUrl
    ? { httpOptions: { apiVersion: "", baseUrl } }
    : {}),
});
