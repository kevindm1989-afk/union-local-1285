import { Router, type IRouter, type Request, type Response } from "express";
import { db, conversations, messages } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ANTHROPIC_MODEL } from "../../lib/anthropic/constants";
import { SendAnthropicMessageBody } from "@workspace/api-zod";
import { aiChatLimiter } from "../../lib/rateLimiters";
import { asyncHandler } from "../../lib/asyncHandler";
// @ts-ignore — .txt imported via esbuild text loader
import cbaText from "../../data/cba.txt";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are a knowledgeable union steward assistant for your union local.

Your role is to help stewards and members understand their rights and entitlements under the Collective Agreement. When answering questions:
- Quote the specific Article and clause number whenever possible (e.g. "Article 9.01 states...")
- Be accurate and grounded in the contract text — do not make up provisions
- If a question isn't covered by the CBA, say so clearly
- Keep answers practical and easy to understand
- You may advise consulting with national union staff or legal counsel for complex grievance situations

Here is the full Collective Agreement text:

---
${cbaText}
---`;

router.get("/conversations", asyncHandler(async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(conversations)
      .orderBy(asc(conversations.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Internal server error" });
  }
}));

router.post("/conversations", asyncHandler(async (req: Request, res: Response) => {
  const { title } = req.body ?? {};
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  try {
    const [row] = await db
      .insert(conversations)
      .values({ title: String(title).trim() })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Internal server error" });
  }
}));

router.get("/conversations/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json({ ...conv, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Internal server error" });
  }
}));

router.delete("/conversations/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Internal server error" });
  }
}));

router.get("/conversations/:id/messages", asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json(msgs);
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Internal server error" });
  }
}));

router.post("/conversations/:id/messages", aiChatLimiter, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = SendAnthropicMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const { content } = parsed.data;

  try {
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Save user message
    await db.insert(messages).values({ conversationId: id, role: "user", content });

    // Load conversation history for Claude
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    const chatMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Stream response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const stream = anthropic.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    // Save assistant reply
    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
}));

export default router;
