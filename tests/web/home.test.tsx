// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from '../../apps/web/src/lib/config.js';
import { Home } from '../../apps/web/src/pages/Home.js';
import { RULES_VERSION } from '@dardania/shared';

const config = {
  brandName: 'Dardania | Elite',
  discordInviteUrl: 'https://discord.gg/MsT96sPS3e',
  supportUrl: null,
  contactEmail: null,
  steamGroupUrl: null,
  servers: [],
  team: [],
  announcements: [
    {
      id: 'a1',
      slug: 'demo-announcement',
      title: 'Launch night',
      body: 'Demo body',
      category: 'EVENT',
      imageUrl: null,
      publishedAt: '2026-10-18T18:00:00.000Z',
      authorName: 'Owner',
    },
  ],
  rulesVersion: RULES_VERSION,
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/config')) return json(config);
      if (url.endsWith('/api/servers')) return json({ servers: [] });
      return json({ error: 'not_found', message: 'unexpected request' });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('public home page', () => {
  it('renders the brand and the community promise without inventing server data', async () => {
    render(
      <MemoryRouter>
        <ConfigProvider>
          <Home />
        </ConfigProvider>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText(/Dardania/)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/No servers are published yet/i)).toBeTruthy();
    expect(screen.getByText('Launch night')).toBeTruthy();
    expect(screen.queryByText(/players online/i)).toBeNull();
  });

  it('shows the configured Discord invite instead of a placeholder link', async () => {
    render(
      <MemoryRouter>
        <ConfigProvider>
          <Home />
        </ConfigProvider>
      </MemoryRouter>,
    );
    const join = await screen.findAllByRole('link', { name: /discord/i });
    const hrefs = join.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('https://discord.gg/MsT96sPS3e');
    expect(hrefs.some((href) => href === '#' || href === '')).toBe(false);
  });
});
