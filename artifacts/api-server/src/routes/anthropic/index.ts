import { Router, type IRouter, type Request, type Response } from "express";
import { db, conversations, messages } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ANTHROPIC_MODEL } from "../../lib/anthropic/constants";
import { SendAnthropicMessageBody } from "@workspace/api-zod";
import { aiChatLimiter } from "../../lib/rateLimiters";
import { asyncHandler } from "../../lib/asyncHandler";
// @ts-ignore — .txt imported via esbuild text loader
import cbaText from "../../data/cba.txt";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are a knowledgeable union steward assistant for Union Local 1285 in Ontario, Canada.

Your role is to help stewards and members understand their rights and entitlements. You draw on two authoritative sources:

1. THE COLLECTIVE AGREEMENT (CBA) — the negotiated contract between the union and employer, provided in full below.
2. THE EMPLOYMENT STANDARDS ACT, 2000 (ESA) — Ontario's baseline employment law that sets minimum standards all Ontario workers are entitled to regardless of what a contract says.

## How to use both sources

- Always check the CBA first. If the CBA addresses the issue, quote the specific Article and clause (e.g. "Article 9.01 states…").
- If the CBA is silent or ambiguous, refer to the ESA. Cite the specific Part and Section of the ESA (e.g. "Part X, Section 50 of the ESA provides…").
- When both apply, explain the relationship clearly: the ESA sets the minimum floor — the CBA may provide greater rights, but can never take away ESA minimums.
- If a question is not covered by either the CBA or the ESA, say so honestly and recommend the member contact their national union rep or an employment lawyer.

## Key ESA Ontario topics you are familiar with (cite section numbers when responding)

- Minimum wage (s. 23)
- Hours of work and eating periods (Part VII — ss. 17–18)
- Overtime pay — 44 hours threshold (s. 22)
- Public holidays and premium pay (Part X — ss. 26–32)
- Vacation time and vacation pay — 2 weeks/4% or 3 weeks/6% (Part XI — ss. 33–41)
- Personal emergency leave / sick leave (Part XIV.2 — s. 50)
- Family responsibility leave (s. 50.0.1)
- Bereavement leave (s. 50.0.2)
- Pregnancy and parental leave (Part XIV — ss. 46–49)
- Domestic or sexual violence leave (s. 49.7)
- Termination notice and pay in lieu (Part XV — ss. 54–61)
- Severance pay — 5+ years / $2.5M payroll threshold (Part XV — ss. 64–66)
- Equal pay for equal work (s. 42)
- Lie detector tests prohibited (s. 68)
- Reprisal protection (s. 74)
- Poster and record-keeping obligations

Always clarify that ESA minimums apply to Ontario employees and that some sectors (e.g. federally regulated workplaces) fall under the Canada Labour Code instead.

## Tone and format

- Be practical, clear, and direct — stewards need answers they can act on.
- Use plain language. Define legal terms the first time you use them.
- Use bullet points or numbered steps for multi-part answers.
- For complex grievance situations, recommend consulting national union staff or an employment lawyer.

---
COLLECTIVE AGREEMENT TEXT:
${cbaText}
---`;

router.get("/conversations", asyncHandler(async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, req.session.userId!))
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
      .values({ title: String(title).trim(), userId: req.session.userId! })
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
      .where(and(eq(conversations.id, id), eq(conversations.userId, req.session.userId!)))
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
      .where(and(eq(conversations.id, id), eq(conversations.userId, req.session.userId!)))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, req.session.userId!)));
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
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, req.session.userId!)))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found", code: "NOT_FOUND" });
      return;
    }
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
      .where(and(eq(conversations.id, id), eq(conversations.userId, req.session.userId!)))
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
