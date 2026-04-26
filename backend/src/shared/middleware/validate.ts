import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type Target = 'body' | 'query' | 'params';

/**
 * Returns an Express middleware that validates req[target] against the given
 * Zod schema. On failure it responds 422 with a structured errors array.
 * On success the parsed (coerced + stripped) value is written back to req[target].
 */
export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      res.status(422).json({ errors: formatErrors(result.error) });
      return;
    }
    // Replace with the parsed value so controllers get typed, coerced data
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}

function formatErrors(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
