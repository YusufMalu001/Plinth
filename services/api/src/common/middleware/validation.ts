import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodObject, ZodError } from 'zod';
import { ValidationError } from '../errors/AppError';

/**
 * Request validation middleware helper.
 * Validates request body (or body, query, params if structured) against a Zod schema.
 */
export function validate(schema: ZodTypeAny) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (
        schema instanceof ZodObject &&
        ('body' in schema.shape || 'query' in schema.shape || 'params' in schema.shape)
      ) {
        const validated = await schema.parseAsync({
          body: req.body,
          query: req.query,
          params: req.params
        }) as { body?: unknown; query?: unknown; params?: unknown };

        if (validated.body !== undefined) req.body = validated.body;
        if (validated.query !== undefined) req.query = validated.query as typeof req.query;
        if (validated.params !== undefined) req.params = validated.params as typeof req.params;
      } else {
        const validated = await schema.parseAsync(req.body);
        req.body = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Map Zod validation errors to a clean error array
        const details = error.errors.map((err) => ({
          field: err.path.join('.').replace(/^(body|query|params)\./, ''),
          message: err.message
        }));

        next(new ValidationError('Request validation failed', details));
      } else {
        next(error);
      }
    }
  };
}
