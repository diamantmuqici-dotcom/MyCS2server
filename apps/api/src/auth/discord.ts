import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string(),
});

const identitySchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  bot: z.boolean().optional(),
});

export interface DiscordIdentity {
  id: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
  bot: boolean;
}

export class DiscordOAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = 'DiscordOAuthError';
  }
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export interface DiscordOAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class DiscordOAuthClient {
  constructor(
    private readonly options: DiscordOAuthOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.options.clientId && this.options.clientSecret && this.options.redirectUri);
  }

  buildAuthorizeUrl(input: { state: string; codeChallenge: string }): string {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', this.options.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.options.redirectUri,
      code_verifier: codeVerifier,
    });
    const response = await this.fetchImpl('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new DiscordOAuthError(`Discord rejected the OAuth code exchange (HTTP ${response.status}).`);
    }
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new DiscordOAuthError('Unexpected token response from Discord.');
    return parsed.data.access_token;
  }

  async fetchIdentity(accessToken: string): Promise<DiscordIdentity> {
    const response = await this.fetchImpl('https://discord.com/api/users/@me', {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new DiscordOAuthError(`Discord rejected the identity request (HTTP ${response.status}).`);
    }
    const parsed = identitySchema.safeParse(await response.json());
    if (!parsed.success) throw new DiscordOAuthError('Unexpected identity response from Discord.');
    return {
      id: parsed.data.id,
      username: parsed.data.username,
      globalName: parsed.data.global_name ?? null,
      avatarHash: parsed.data.avatar ?? null,
      bot: parsed.data.bot ?? false,
    };
  }
}
