import type { AccessLevel, SessionUserDto } from '@dardania/shared';
import type { SessionRow, UserRow } from '@dardania/db';

export interface RequestAuth {
  level: AccessLevel;
  session: SessionRow;
  user: UserRow;
  sessionUser: SessionUserDto;
  csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: RequestAuth;
  }
}
