import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { HttpError, zodDetails } from './errors.js';
import type { AppDeps } from './deps.js';
import { createGuards } from './guards.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerInternalRoutes } from './routes/internal.js';
import { registerPublicRoutes } from './routes/public.js';

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(
  deps: AppDeps,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const { env } = deps;
  const app = Fastify({
    logger:
      options.logger === false || env.nodeEnv === 'test'
        ? false
        : {
            level: env.logLevel,
            redact: {
              paths: [
                'req.headers.cookie',
                'req.headers.authorization',
                'req.headers["x-service-token"]',
                'req.headers["x-csrf-token"]',
                'res.headers["set-cookie"]',
              ],
              censor: '[redacted]',
            },
          },
    trustProxy: true,
    bodyLimit: 1_048_576,
    genReqId: () => randomUUID(),
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = new Set(env.webOrigins);
      try {
        allowed.add(new URL(env.apiBaseUrl).origin);
      } catch {
        /* invalid API_BASE_URL is validated at startup */
      }
      return callback(null, allowed.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token'],
    maxAge: 600,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...env.webOrigins],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: env.isProduction ? ["'self'"] : ["'self'", 'https:'],
        ...(env.isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    xFrameOptions: false,
    hsts: env.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    hook: 'onRequest',
    allowList: [],
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'The request did not pass validation.',
        details: zodDetails(error),
      });
    }
    const candidate = error as { statusCode?: number; message?: string };
    const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled request error');
      return reply.code(500).send({
        error: 'internal_error',
        message: 'An unexpected error occurred. The failure has been logged.',
      });
    }
    return reply.code(statusCode).send({
      error: 'request_error',
      message: candidate.message ?? 'Request could not be processed.',
    });
  });

  const guards = createGuards(deps.db, env);

  await app.register(async (scope) => registerPublicRoutes(scope, deps), { prefix: '/api' });
  await app.register(async (scope) => registerAuthRoutes(scope, deps, guards), {
    prefix: '/api/auth',
  });
  await app.register(async (scope) => registerDashboardRoutes(scope, deps, guards), {
    prefix: '/api/dashboard',
  });
  await app.register(async (scope) => registerInternalRoutes(scope, deps), {
    prefix: '/api/internal',
  });

  if (env.serveWeb) {
    const root = resolve(env.webDistDir);
    if (!existsSync(root)) {
      app.log.warn(
        `SERVE_WEB is enabled but the web build was not found at ${root}. Run "npm run build" first.`,
      );
    } else {
      await app.register(fastifyStatic, {
        root,
        wildcard: false,
        cacheControl: true,
        maxAge: '1h',
        immutable: false,
        index: ['index.html'],
      });
    }
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api');
    if (!isApi && env.serveWeb && request.method === 'GET') {
      const acceptsHtml = (request.headers.accept ?? '').includes('text/html');
      const lastSegment = request.url.split('?')[0]?.split('/').pop() ?? '';
      const looksLikeAsset = lastSegment.includes('.');
      if (acceptsHtml && !looksLikeAsset) {
        return reply.type('text/html').sendFile('index.html');
      }
    }
    return reply.code(404).send({
      error: 'not_found',
      message: isApi ? 'API route not found.' : 'Page not found.',
    });
  });

  return app;
}
