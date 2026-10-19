// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RULES, RULES_VERSION } from '@dardania/shared';
import { Rules } from '../../apps/web/src/pages/Rules.js';
import { buildQuery } from '../../apps/web/src/lib/api.js';
import { formatDate, humanize, relativeTime } from '../../apps/web/src/lib/format.js';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('rules page', () => {
  it('renders every English rule section and the version', () => {
    render(
      <MemoryRouter>
        <Rules />
      </MemoryRouter>,
    );
    expect(screen.getByText(`Rulebook · v${RULES_VERSION}`)).toBeTruthy();
    for (const section of RULES) {
      expect(screen.getAllByText(section.title.en).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('switches to Albanian and remembers the choice', () => {
    render(
      <MemoryRouter>
        <Rules />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Shqip' }));
    expect(screen.getAllByText(RULES[0]!.title.sq).length).toBeGreaterThanOrEqual(1);
    expect(window.localStorage.getItem('de-rules-language')).toBe('sq');
  });
});

describe('formatting helpers', () => {
  it('formats dates in UTC and handles missing values', () => {
    expect(formatDate('2026-10-19T06:00:00.000Z')).toMatch(/2026/);
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(relativeTime(new Date(Date.now() + 60_000).toISOString())).toMatch(/minute/);
    expect(humanize('WARN_CLEAR')).toBe('Warn Clear');
  });

  it('serializes only meaningful query parameters', () => {
    expect(buildQuery({ q: 'test', page: 2, empty: '', missing: undefined })).toBe(
      '?q=test&page=2',
    );
    expect(buildQuery({})).toBe('');
  });
});
