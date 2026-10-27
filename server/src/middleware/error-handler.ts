import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

function send(res: Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
}

/** 404 for unknown /api routes. */
export function apiNotFound(_req: Request, res: Response) {
  send(res, 404, 'NOT_FOUND', 'Endpoint not found.');
}

/**
 * Converts errors into consistent JSON responses:
 *   { "error": { "code": "...", "message": "...", "details"?: ... } }
 * Unexpected errors are logged on the server and reported to the client
 * as a generic 500, so stack traces and internals never leak.
 */
export function errorHandler(maxFileSizeBytes: number) {
  // Express recognises error handlers by their 4-argument signature.
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }

    if (err instanceof AppError) {
      return send(res, err.status, err.code, err.message, err.details);
    }

    if (err instanceof ZodError) {
      const fields = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return send(res, 400, 'VALIDATION_ERROR', fields[0]?.message ?? 'Invalid request.', { fields });
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const mb = Math.round(maxFileSizeBytes / (1024 * 1024));
        return send(res, 413, 'PAYLOAD_TOO_LARGE', `Files can be at most ${mb} MB.`);
      }
      return send(res, 400, 'BAD_UPLOAD', 'The upload request was invalid.');
    }

    // Malformed JSON body, or body over the JSON size limit (from express.json()).
    const httpErr = err as { type?: string; status?: number };
    if (httpErr?.type === 'entity.parse.failed') return send(res, 400, 'BAD_REQUEST', 'Malformed JSON body.');
    if (httpErr?.type === 'entity.too.large') return send(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large.');

    console.error('[error] Unhandled error:', err);
    send(res, 500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
  };
}
