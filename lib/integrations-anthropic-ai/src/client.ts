import Anthropic from "@anthropic-ai/sdk";

// Prefer the user's own API key; fall back to Replit AI Integrations proxy
const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const baseURL = process.env.ANTHROPIC_API_KEY
  ? undefined // use the default Anthropic API URL
  : process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

if (!apiKey) {
  throw new Error(
    "ANTHROPIC_API_KEY must be set to use the AI assistant.",
  );
}

export const anthropic = new Anthropic({ apiKey, baseURL });
