import dns from 'dns';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.
/**
 * Article Content Extraction API — FULL ARTICLE BODY
 * Two-phase approach:
 * 1. Microlink for metadata (title, image, author, description)
 * 2. Direct fetch + regex parse for full article body HTML
 *
 * HARDENED against SSRF: only public http(s) hosts are fetched — the target
 * hostname is DNS-resolved and rejected if any address is private, loopback,
 * link-local, or otherwise reserved. Redirects are followed manually with the
 * same validation on every hop. Both fetches are time-limited and the page
 * read is size-capped.
 */

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2MB cap on the page body
const MAX_REDIRECTS = 3;

/** True if an IP address (v4 or v6) is private/reserved/non-routable. */
function isPrivateAddress(address, family) {
    if (family === 4 || (typeof address === 'string' && address.includes('.') && !address.includes(':'))) {
        const parts = address.split('.').map(Number);
        if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true;
        const [a, b, c] = parts;
        if (a === 0 || a === 10 || a === 127) return true;          // this-net, private, loopback
        if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT 100.64/10
        if (a === 169 && b === 254) return true;                    // link-local (cloud metadata)
        if (a === 172 && b >= 16 && b <= 31) return true;           // private 172.16/12
        if (a === 192 && b === 168) return true;                    // private 192.168/16
        if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // reserved 192.0.0/24 + 192.0.2.0/24 only (rest of 192.0/16 is public)
        if (a === 198 && (b === 18 || b === 19)) return true;       // benchmarking
        if (a >= 224) return true;                                  // multicast + reserved
        return false;
    }
    // IPv6
    const lower = String(address).toLowerCase();
    if (lower === '::' || lower === '::1') return true;             // unspecified, loopback
    if (lower.startsWith('fe80') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
    if (lower.startsWith('::ffff:')) {
        // IPv4-mapped — validate the embedded IPv4
        return isPrivateAddress(lower.replace('::ffff:', ''), 4);
    }
    return false;
}

/**
 * Validate a URL is a public http(s) target. Returns the parsed URL or null.
 * Resolves DNS and rejects if ANY resolved address is private/reserved.
 */
async function validatePublicUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return null;
    }

    try {
        const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
        if (!addresses.length) return null;
        for (const { address, family } of addresses) {
            if (isPrivateAddress(address, family)) return null;
        }
    } catch {
        return null; // unresolvable host
    }

    return parsed;
}

/** fetch() with an AbortController timeout. */
async function timedFetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Fetch a validated public URL, following redirects manually so every hop is
 * re-validated (prevents redirect-based SSRF), and reading at most
 * MAX_HTML_BYTES of the body.
 */
async function safeFetchHtml(startUrl) {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const validated = await validatePublicUrl(current);
        if (!validated) return null;

        const response = await timedFetch(validated.href, {
            redirect: 'manual',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SmartPokerBot/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) return null;
            current = new URL(location, validated.href).href;
            continue;
        }

        if (!response.ok) return null;

        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength > MAX_HTML_BYTES) return null;

        // Stream the body with a hard size cap
        if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            const chunks = [];
            let received = 0;
            while (received < MAX_HTML_BYTES) {
                const { done, value } = await reader.read();
                if (done) break;
                received += value.byteLength;
                chunks.push(value);
            }
            try { await reader.cancel(); } catch { /* noop */ }
            return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
        }
        const text = await response.text();
        return text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
    }
    return null; // too many redirects
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    // This endpoint performs outbound fetches on behalf of the caller — rate limit it.
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const url = safeQ(req.query.url);

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL parameter required' });
    }

    try {
        const rawTarget = url.startsWith('http') ? url : decodeURIComponent(url);

        // SSRF guard: only public http(s) URLs are ever fetched
        const validatedUrl = await validatePublicUrl(rawTarget);
        if (!validatedUrl) {
            return res.status(400).json({ success: false, error: 'Invalid or disallowed URL' });
        }
        const targetUrl = validatedUrl.href;

        // Phase 1: Get metadata from microlink (simple call, no selectors)
        let metadata = {};
        try {
            const metaRes = await timedFetch('https://api.microlink.io/?url=' + encodeURIComponent(targetUrl));
            if (!metaRes.ok) throw new Error(`Request failed (${metaRes.status})`);
            const metaResult = await metaRes.json();
            if (metaResult.status === 'success' && metaResult.data) {
                metadata = {
                    title: metaResult.data.title || '',
                    description: metaResult.data.description || '',
                    image: metaResult.data.image?.url || '',
                    author: metaResult.data.author || '',
                    publisher: metaResult.data.publisher || '',
                    date: metaResult.data.date || '',
                    logo: metaResult.data.logo?.url || '',
                    url: metaResult.data.url || targetUrl,
                };
            }
        } catch (e) {
            console.warn('[Article Extract] Microlink metadata failed:', e.message);
        }

        // Phase 2: Fetch page directly (validated, size-capped) and extract article content
        let paragraphs = [];
        try {
            const html = await safeFetchHtml(targetUrl);
            if (html) {
                paragraphs = extractArticleContent(html);
            }
        } catch (e) {
            console.warn('[Article Extract] Direct fetch failed:', e.message);
        }

        // Fallback to description if no paragraphs found
        if (paragraphs.length === 0 && metadata.description) {
            paragraphs = [{ type: 'paragraph', text: metadata.description }];
        }

        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({
            success: true,
            data: {
                ...metadata,
                title: metadata.title || '',
                paragraphs,
            }
        });

    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Article Extract] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}

/**
 * Extract article content from raw HTML using regex-based parsing.
 * Targets common article container elements and extracts clean paragraphs.
 */
function extractArticleContent(html) {
    // Try to find article body container
    const containerPatterns = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*story-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*content-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i,
    ];

    let articleHtml = '';
    for (const pattern of containerPatterns) {
        const match = html.match(pattern);
        if (match && match[1] && match[1].length > 200) {
            articleHtml = match[1];
            break;
        }
    }

    // If no container found, use the full HTML (limited to body)
    if (!articleHtml) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        articleHtml = bodyMatch ? bodyMatch[1] : html;
    }

    // Strip unwanted elements
    articleHtml = articleHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<figure[\s\S]*?<\/figure>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/<form[\s\S]*?<\/form>/gi, '');

    const boilerplate = [
        'table of contents', 'related players', 'tags', 'share this',
        'follow us', 'newsletter', 'sign up', 'subscribe',
        'feature image courtesy', 'related articles', 'advertisement',
        'you may also like', 'read more', 'more stories'
    ];

    let paragraphs = [];

    // Extract headings
    const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
    let match;
    while ((match = headingRegex.exec(articleHtml)) !== null) {
        const text = stripHtml(match[1]).trim();
        if (text.length > 5 && !isBoilerplate(text, boilerplate)) {
            paragraphs.push({ type: 'heading', text, pos: match.index });
        }
    }

    // Extract blockquotes
    const quoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    while ((match = quoteRegex.exec(articleHtml)) !== null) {
        const text = stripHtml(match[1]).trim();
        if (text.length > 10) {
            paragraphs.push({ type: 'quote', text, pos: match.index });
        }
    }

    // Extract paragraphs
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = pRegex.exec(articleHtml)) !== null) {
        const text = stripHtml(match[1]).trim();
        if (text.length > 15 && !isBoilerplate(text, boilerplate)) {
            paragraphs.push({ type: 'paragraph', text, pos: match.index });
        }
    }

    // Sort by document position
    paragraphs.sort((a, b) => a.pos - b.pos);

    // Deduplicate
    const seen = new Set();
    paragraphs = paragraphs.filter(p => {
        delete p.pos;
        const key = p.text.substring(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return paragraphs;
}

function isBoilerplate(text, patterns) {
    const lower = text.toLowerCase();
    return patterns.some(b => lower.startsWith(b) || lower === b);
}

function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ');
}
