import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePageTitle } from './usePageTitle';

const meta = (selector: string) => document.head.querySelector(selector)?.getAttribute('content') ?? null;

afterEach(() => {
  document.title = '';
  document.head.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[name="twitter:card"]').forEach((m) => m.remove());
});

describe('usePageTitle', () => {
  it('sets the title, description and Open Graph tags, then restores them', () => {
    document.head.innerHTML += '<meta name="description" content="Default description">';

    const { unmount } = renderHook(() => usePageTitle('City 10K', { description: 'A fast route.', image: 'https://cdn.test/banner.png' }));

    expect(document.title).toBe('City 10K · RaceDay');
    expect(meta('meta[name="description"]')).toBe('A fast route.');
    expect(meta('meta[property="og:title"]')).toBe('City 10K · RaceDay');
    expect(meta('meta[property="og:image"]')).toBe('https://cdn.test/banner.png');
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');

    unmount();
    expect(document.title).toBe('RaceDay');
    expect(meta('meta[name="description"]')).toBe('Default description');
    expect(meta('meta[property="og:image"]')).toBeNull();
  });

  it('falls back to the default description and a small card without an image', () => {
    renderHook(() => usePageTitle());
    expect(document.title).toBe('RaceDay');
    expect(meta('meta[name="description"]')).toMatch(/Discover races/);
    expect(meta('meta[name="twitter:card"]')).toBe('summary');
    expect(meta('meta[property="og:image"]')).toBeNull();
  });

  it('collapses whitespace and clips long descriptions', () => {
    renderHook(() => usePageTitle('Long', { description: `Line one\n\n${'word '.repeat(80)}` }));
    const text = meta('meta[name="description"]')!;
    expect(text).not.toMatch(/\n/);
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.endsWith('…')).toBe(true);
  });
});
