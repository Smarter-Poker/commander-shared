/**
 * Re-fetch Images - Fetches og:image from article source URLs
 * This updates existing articles with real thumbnail images
 *
 * Processes a bounded batch per invocation (default 10, ?batch=1-20) with
 * limited concurrency so the function finishes well inside serverless time
 * limits. Successfully updated rows drop out of DEFAULT_IMAGE_PATTERNS on the
 * next run; rows whose extraction permanently fails do not, so use ?offset=
 * (echoed back as `nextOffset`) to walk past them instead of re-processing the
 * same sticky head of the queue every time.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Admin/maintenance guard: CRON_SECRET bearer (cron jobs) or x-admin-key
// (operators). Credentials are required in EVERY environment — no NODE_ENV
// escape hatch, which would leave preview/staging deploys wide open.
function isAuthorized(req) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) return true;
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && req.headers['x-admin-key'] === adminKey) return true;
    return false;
}

// Default/bad images to detect (we want to replace these with real images)
const DEFAULT_IMAGE_PATTERNS = [
    'unsplash.com',
    'pexels.com',
    'placeholder',
    'lh3.googleusercontent.com',  // Google's generic thumbnails
    'gstatic.com',
    'google.com/images'
];

/**
 * Extract the REAL destination URL from a Google News redirect page
 */
async function extractRealUrlFromGoogleNews(googleUrl) {
    if (!googleUrl || !googleUrl.includes('news.google.com')) {
        return googleUrl;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(googleUrl, {
            signal: controller.signal,
            redirect: 'manual',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html'
            }
        });

        clearTimeout(timeout);

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (location && !location.includes('google.com')) {
                return location;
            }
        }

        const html = await response.text();

        // Meta refresh
        let match = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>\s]+)/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return decodeURIComponent(match[1]);
        }

        // JavaScript redirect
        match = html.match(/window\.location\s*=\s*["']([^"']+)["']/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return match[1];
        }

        // data-url attribute
        match = html.match(/data-url=["']([^"']+)["']/i);
        if (match && match[1] && !match[1].includes('google.com')) {
            return decodeURIComponent(match[1]);
        }

        // href in article link
        match = html.match(/<a[^>]+href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["'][^>]*>/i);
        if (match && match[1]) {
            return match[1];
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Fetch og:image from the ACTUAL article page
 */
async function fetchOgImage(url) {
    if (!url) return null;

    try {
        // If it's a Google News URL, first get the REAL article URL
        let actualUrl = url;
        if (url.includes('news.google.com')) {
            const realUrl = await extractRealUrlFromGoogleNews(url);
            if (realUrl) {
                actualUrl = realUrl;
            } else {
                return null;
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(actualUrl, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        clearTimeout(timeout);

        if (!response.ok) return null;

        const html = await response.text();

        // Extract og:image
        let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (!match) {
            match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        }

        // Try twitter:image
        if (!match) {
            match = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
            if (!match) {
                match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
            }
        }

        if (match && match[1]) {
            let imageUrl = match[1].replace(/&amp;/g, '&');

            // Skip Google images
            if (imageUrl.includes('googleusercontent.com') ||
                imageUrl.includes('gstatic.com') ||
                imageUrl.includes('google.com')) {
                return null;
            }

            // Skip logos/icons
            if (imageUrl.includes('logo') || imageUrl.includes('icon') || imageUrl.includes('favicon')) {
                return null;
            }

            if (imageUrl.startsWith('http')) {
                return imageUrl;
            }
        }

        return null;
    } catch (error) {
        return null;
    }
}

export default async function handler(req, res) {
  // GET is kept because scheduled cron invocations issue GET with the
  // CRON_SECRET bearer header; auth below is what gates the mutation.
  if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
      const batchSize = Math.min(Math.max(parseInt(req.query.batch, 10) || 10, 1), 20);
      // ?offset= lets the caller walk past rows whose og:image extraction
      // permanently fails (no source_url, paywalled, logo-only og:image).
      // Without it those rows keep occupying the head of the queue and the
      // articles behind them are never reached.
      const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), 50);

      try {
          // Get articles that have default/placeholder images
          const { data: articles, error: fetchError } = await getSupabase()
              .from('poker_news')
              .select('id, title, source_url, image_url, category')
              .order('published_at', { ascending: false })
              .limit(50); // Consider most recent 50

          if (fetchError) throw fetchError;

          // Filter to articles with default images
          const articlesToUpdate = (articles || []).filter(a => {
              if (!a.image_url) return true;
              return DEFAULT_IMAGE_PATTERNS.some(pattern => a.image_url.includes(pattern));
          });

          // Process only a bounded batch this invocation, starting at ?offset=
          const batch = articlesToUpdate.slice(offset, offset + batchSize);

          let updated = 0;
          let failed = 0;
          const results = [];

          // Bounded concurrency (5 at a time) instead of a serial loop with sleeps
          const CONCURRENCY = 5;
          for (let i = 0; i < batch.length; i += CONCURRENCY) {
              const chunk = batch.slice(i, i + CONCURRENCY);
              const outcomes = await Promise.allSettled(chunk.map(async (article) => {
                  const newImageUrl = await fetchOgImage(article.source_url);
                  if (!newImageUrl) return { ok: false };

                  const { error: updateError } = await getSupabase()
                      .from('poker_news')
                      .update({ image_url: newImageUrl })
                      .eq('id', article.id);

                  if (updateError) return { ok: false };
                  return {
                      ok: true,
                      result: {
                          id: article.id,
                          title: article.title?.substring(0, 40) || '',
                          newImage: newImageUrl.substring(0, 60)
                      }
                  };
              }));

              for (const outcome of outcomes) {
                  if (outcome.status === 'fulfilled' && outcome.value.ok) {
                      updated++;
                      results.push(outcome.value.result);
                  } else {
                      failed++;
                  }
              }
          }

          return res.status(200).json({
              success: true,
              total: articlesToUpdate.length,
              offset,
              processed: batch.length,
              // Rows after this batch — feed back as ?offset= to keep walking.
              remaining: Math.max(articlesToUpdate.length - (offset + batch.length), 0),
              nextOffset: offset + batch.length < articlesToUpdate.length ? offset + batch.length : null,
              updated,
              failed,
              results
          });

      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('Error refetching images:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
