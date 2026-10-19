import { satisfies, type AccessLevel } from '@dardania/shared';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Db } from '@dardania/db';
import type { ApiEnv } from '@dardania/shared';
import { HttpError } from './errors.js';
import { authenticateRequest, clearSessionCookies } from './auth/session.js';

export interface Guards {
  authenticate: preHandlerHookHandler;
  requireLevel: (level: AccessLevel) => preHandlerHookHandler;
  owner: preHandlerHookHandler[];
  history: preHandlerHookHandler[];
  staff: preHandlerHookHandler[];
}

/**
 * Every dashboard endpoint passes through `authenticate` and an explicit level
 * check. Discord roles are never consulted here.
 */
export function createGuards(db: Db, env: ApiEnv): Guards {
  const authenticate: preHandlerHookHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      await authenticateRequest(db, env, request);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.statusCode === 401) clearSessionCookies(reply, env);
        return reply.code(error.statusCode).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  };

  const requireLevel = (level: AccessLevel): preHandlerHookHandler => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        return reply
          .code(401)
          .send({ error: 'unauthenticated', message: 'Sign in with Discord to continue.' });
      }
      if (!satisfies(request.auth.level, level)) {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'Your dashboard access level does not permit this action.',
        });
      }
    };
  };

  return {
    authenticate,
    requireLevel,
    owner: [authenticate, requireLevel('OWNER')],
    history: [authenticate, requireLevel('CO_OWNER')],
    staff: [authenticate, requireLevel('PC_CHECKER')],
  };
}
