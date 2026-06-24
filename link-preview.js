// Link detection + lightweight preview rendering.
//
// Note on "best practice": a true Open Graph preview (title/description/image
// scraped from the target page) requires fetching the remote HTML, which the
// browser blocks cross-origin (CORS) unless you route through a server/proxy —
// that would break SpellCast's serverless, decentralized model. So instead we
// render previews using only techniques that work directly in the browser
// without a proxy:
//   • direct image links        → inline <img> (images load cross-origin)
//   • YouTube links             → provider thumbnail (stable img URL, no CORS)
//   • any other link            → a clean "link card" with favicon + domain
// Everything is built with DOM APIs + textContent (never innerHTML), so user
// content can't inject markup.

const URL_REGEX = /(https?:\/\/[^\s<]+)/gi;
const IMAGE_EXT_REGEX = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;

/**
 * Strip punctuation that commonly trails a URL in prose (e.g. "see http://x.com.")
 */
function stripTrailingPunctuation(url) {
  return url.replace(/[.,!?;:)\]}'"]+$/, '');
}

/**
 * Extract clean URLs from a string.
 * @param {string} text
 * @returns {string[]}
 */
export function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX) || [];
  return matches.map(stripTrailingPunctuation);
}

/**
 * Turn plain text into a DocumentFragment where URLs become safe anchor tags.
 * @param {string} text
 * @returns {DocumentFragment}
 */
export function linkify(text) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;

  const regex = new RegExp(URL_REGEX.source, 'gi');
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const clean = stripTrailingPunctuation(match[0]);
    const start = match.index;

    if (start > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    const anchor = document.createElement('a');
    anchor.href = clean;            // safe: regex only matches http(s) URLs
    anchor.textContent = clean;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.className = 'tweet-link';
    frag.appendChild(anchor);

    // Leave any stripped trailing punctuation as plain text
    lastIndex = start + clean.length;
  }

  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return frag;
}

function isImageUrl(parsed) {
  return IMAGE_EXT_REGEX.test(parsed.pathname);
}

function getYouTubeId(parsed) {
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    return parsed.pathname.slice(1).split('/')[0] || null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const m = parsed.pathname.match(/\/(?:shorts|embed)\/([^/?#]+)/);
    if (m) return m[1];
  }
  return null;
}

function buildImageCard(url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'link-preview link-preview-image';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = url;
  img.alt = 'Linked image';
  // If the image can't load, drop the whole preview rather than showing a broken icon
  img.onerror = () => link.remove();

  link.appendChild(img);
  return link;
}

function buildYouTubeCard(videoId, url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'link-preview link-preview-youtube';

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'link-preview-thumb';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  img.alt = 'YouTube video';
  img.onerror = () => link.remove();

  const play = document.createElement('div');
  play.className = 'link-preview-play';
  play.textContent = '▶';

  thumbWrap.appendChild(img);
  thumbWrap.appendChild(play);

  const meta = document.createElement('div');
  meta.className = 'link-preview-meta';
  const site = document.createElement('div');
  site.className = 'link-preview-site';
  site.textContent = 'youtube.com';
  const title = document.createElement('div');
  title.className = 'link-preview-url';
  title.textContent = url;
  meta.appendChild(site);
  meta.appendChild(title);

  link.appendChild(thumbWrap);
  link.appendChild(meta);
  return link;
}

function buildGenericCard(parsed, url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'link-preview link-preview-generic';

  // Favicon served by the target site itself (no third-party proxy/tracker)
  const favicon = document.createElement('img');
  favicon.className = 'link-preview-favicon';
  favicon.loading = 'lazy';
  favicon.src = `${parsed.origin}/favicon.ico`;
  favicon.alt = '';
  favicon.onerror = () => favicon.remove();

  const meta = document.createElement('div');
  meta.className = 'link-preview-meta';

  const site = document.createElement('div');
  site.className = 'link-preview-site';
  site.textContent = parsed.hostname.replace(/^www\./, '');

  const urlLine = document.createElement('div');
  urlLine.className = 'link-preview-url';
  urlLine.textContent = url;

  meta.appendChild(site);
  meta.appendChild(urlLine);

  link.appendChild(favicon);
  link.appendChild(meta);
  return link;
}

/**
 * Build a preview element for a single URL, or null if it can't be previewed.
 * @param {string} url
 * @returns {HTMLElement|null}
 */
export function buildLinkPreview(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const ytId = getYouTubeId(parsed);
  if (ytId) return buildYouTubeCard(ytId, url);

  if (isImageUrl(parsed)) return buildImageCard(url);

  return buildGenericCard(parsed, url);
}
