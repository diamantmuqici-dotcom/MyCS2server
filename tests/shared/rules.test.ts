import { describe, expect, it } from 'vitest';
import { RULES, RULES_UPDATED_AT, RULES_VERSION } from '@dardania/shared';

describe('community rules', () => {
  it('has a version and a valid review date', () => {
    expect(RULES_VERSION).toMatch(/^\d{4}\.\d+$/);
    expect(Number.isNaN(Date.parse(RULES_UPDATED_AT))).toBe(false);
  });

  it('ships every section in both languages', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(6);
    for (const section of RULES) {
      expect(section.id).toMatch(/^[a-z-]+$/);
      expect(section.title.en.length).toBeGreaterThan(3);
      expect(section.title.sq.length).toBeGreaterThan(3);
      expect(section.items.length).toBeGreaterThan(2);
      for (const item of section.items) {
        expect(item.en.trim().length).toBeGreaterThan(20);
        expect(item.sq.trim().length).toBeGreaterThan(20);
        expect(item.en).not.toEqual(item.sq);
      }
    }
  });

  it('keeps section ids unique so anchors do not collide', () => {
    const ids = RULES.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fits inside Discord embed limits per section', () => {
    for (const section of RULES) {
      expect(section.title.en.length).toBeLessThanOrEqual(256);
      const english = section.items.map((item) => `• ${item.en}`).join('\n');
      const albanian = section.items.map((item) => `• ${item.sq}`).join('\n');
      expect(english.length).toBeLessThanOrEqual(1024);
      expect(albanian.length).toBeLessThanOrEqual(1024);
    }
  });
});
