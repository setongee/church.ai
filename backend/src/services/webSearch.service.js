// Ordinary web search (DuckDuckGo's HTML results - no API key) plus page fetching, used to find
// lyrics pages. Nothing here is specific to any one lyrics site.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e.toLowerCase()] ?? m;
  });

// Returns { results: [{ url, title }], blocked } - blocked when the search engine refused us.
export async function webSearch(query) {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    const html = await res.text();
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
      let url = decode(m[1]);
      const wrapped = /[?&]uddg=([^&]+)/.exec(url);
      if (wrapped) url = decodeURIComponent(wrapped[1]);
      if (!/^https?:\/\//.test(url)) continue;
      results.push({ url, title: decode(m[2].replace(/<[^>]+>/g, '')).trim() });
    }
    return { results, blocked: res.status !== 200 || (!results.length && /anomaly|captcha/i.test(html)) };
  } catch (err) {
    console.error('[websearch] failed', err.message);
    return { results: [], blocked: true };
  }
}

// A page's visible text with its line structure kept (<br>, paragraphs -> newlines).
export async function fetchPageText(url, maxChars = 18000) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return '';
    const html = (await res.text()).slice(0, 2_000_000);
    const text = decode(
      html
        .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
    )
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text.slice(0, maxChars);
  } catch {
    return '';
  }
}
