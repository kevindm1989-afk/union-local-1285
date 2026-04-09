import { type Request, type Response, type NextFunction } from "express";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Wraps an async Express route handler so that any thrown error or rejected
 * promise is forwarded to Express's next() — the global error handler — instead
 * of leaving an unhandled promise rejection that silently drops the request.
 *
 * Usage:
 *   router.get("/", asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
