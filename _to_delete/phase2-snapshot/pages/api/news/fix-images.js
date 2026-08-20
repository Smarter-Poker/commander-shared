/**
 * Fix Missing Images - Updates all articles with null images to use category defaults
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

// Default category images - must match scraper
const DEFAULT_CATEGORY_IMAGES = {
    tournament: 'https://images.unsplash.com/photo-1609743522653-52354461eb27?w=600&q=80',
    strategy: 'https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=600&q=80',
    industry: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=600&q=80',
    news: 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80',
    online: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80'
};

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
      try {
          // Get all articles with null or empty image_url
          const { data: articles, error: fetchError } = await getSupabase()
              .from('poker_news')
              .select('id, category, image_url')
              .or('image_url.is.null,image_url.eq.')
                  .limit(100);

          if (fetchError) throw fetchError;

          let updated = 0;
          const errors = [];

          // Update in small concurrent chunks (much faster than serial, but
          // bounded so we do not open 100 simultaneous connections)
          const CHUNK_SIZE = 10;
          const rows = articles || [];
          for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
              const chunk = rows.slice(i, i + CHUNK_SIZE);
              const outcomes = await Promise.allSettled(chunk.map(async (article) => {
                  const imageUrl = DEFAULT_CATEGORY_IMAGES[article.category] || DEFAULT_CATEGORY_IMAGES.news;
                  const { error: updateError } = await getSupabase()
                      .from('poker_news')
                      .update({ image_url: imageUrl })
                      .eq('id', article.id);
                  if (updateError) throw Object.assign(new Error(updateError.message), { articleId: article.id });
              }));

              outcomes.forEach((outcome, idx) => {
                  if (outcome.status === 'fulfilled') {
                      updated++;
                  } else {
                      errors.push({ id: chunk[idx].id, error: outcome.reason?.message || 'Update failed' });
                  }
              });
          }

          return res.status(200).json({
              success: true,
              found: rows.length,
              updated,
              errors: errors.length > 0 ? errors : undefined
          });

      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('Error fixing images:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
