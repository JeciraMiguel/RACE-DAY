import { useEffect } from 'react';

const SITE = 'RaceDay';
const DEFAULT_DESCRIPTION = 'Discover races, register and follow live results.';

interface PageMeta {
  /** Used for the description and Open Graph description (first ~160 characters). */
  description?: string | null;
  /** Absolute or root-relative image URL for link previews (e.g. the event banner). */
  image?: string | null;
}

/** Finds or creates a <meta> tag and returns a function that puts the previous value back. */
function setMeta(attr: 'name' | 'property', key: string, value: string | null): () => void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !tag;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  const previous = tag.getAttribute('content');

  if (value) tag.setAttribute('content', value);
  else if (created) tag.remove();

  return () => {
    if (created) tag!.remove();
    else if (previous !== null) tag!.setAttribute('content', previous);
  };
}

const clip = (text: string) => (text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text);

/**
 * Sets the document title ("Page · RaceDay") plus the description and Open Graph tags,
 * and restores the previous values on unmount. Crawlers that run JavaScript (and browser
 * tabs / history) see them; link-preview bots that do not would need server rendering.
 */
export function usePageTitle(title?: string, meta: PageMeta = {}) {
  const { description, image } = meta;

  useEffect(() => {
    const full = title ? `${title} · ${SITE}` : SITE;
    const text = description ? clip(description.replace(/\s+/g, ' ').trim()) : DEFAULT_DESCRIPTION;
    document.title = full;

    const restore = [
      setMeta('name', 'description', text),
      setMeta('property', 'og:title', full),
      setMeta('property', 'og:description', text),
      setMeta('property', 'og:type', 'website'),
      setMeta('property', 'og:site_name', SITE),
      setMeta('property', 'og:image', image ?? null),
      setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'),
    ];

    return () => {
      restore.forEach((undo) => undo());
      document.title = SITE;
    };
  }, [title, description, image]);
}
