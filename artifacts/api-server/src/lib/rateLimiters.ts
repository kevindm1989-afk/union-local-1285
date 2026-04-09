import { rateLimit, ipKeyGenerator } from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again in 15 minutes.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const accessRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Too many requests. Please try again in an hour.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const aiChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => String((req as any).session?.userId ?? ipKeyGenerator(req.ip ?? "")),
  message: { error: "AI chat limit reached. Try again in an hour.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const grievanceCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => String((req as any).session?.userId ?? ipKeyGenerator(req.ip ?? "")),
  message: { error: "Too many grievance submissions. Try again in an hour.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});
