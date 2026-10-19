import type { ZodError } from 'zod';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Sign in to continue.'): HttpError =>
  new HttpError(401, 'unauthenticated', message);

export const forbidden = (message = 'You do not have access to this resource.'): HttpError =>
  new HttpError(403, 'forbidden', message);

export const notFound = (message = 'Not found.'): HttpError =>
  new HttpError(404, 'not_found', message);

export const badRequest = (message = 'Invalid request.', details?: unknown): HttpError =>
  new HttpError(400, 'invalid_request', message, details);

export const serviceUnavailable = (message = 'Service unavailable.'): HttpError =>
  new HttpError(503, 'service_unavailable', message);

export function zodDetails(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
