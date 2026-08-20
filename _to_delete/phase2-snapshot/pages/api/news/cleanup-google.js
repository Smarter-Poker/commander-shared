/**
 * Cleanup Google-sourced news articles.
 *
 * Default: deletes only rows whose source_url points at news.google.com
 * (the junk this route was named for). Pass ?all=true to wipe the entire
 * poker_news table (the old behavior) — explicit opt-in only.
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
// (operators). Credentials are required in EVERY environment — this fronts a
// destructive delete, so there is deliberately no NODE_ENV escape hatch.
function isAuthorized(req) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) return true;
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && req.headers['x-admin-key'] === adminKey) return true;
    return false;
}

export default async function handler(req, res) {
  // GET is kept because scheduled cron invocations issue GET with the
  // CRON_SECRET bearer header; auth below is what actually gates the delete.
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
      const deleteAll = String(req.query.all) === 'true';

      let query = getSupabase().from('poker_news').delete();

      if (deleteAll) {
          // Explicit full wipe (old behavior, now opt-in via ?all=true)
          query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      } else {
          // Default: only Google News redirect junk
          query = query.ilike('source_url', '%news.google.com%');
      }

      const { data, error } = await query.select('id');

      if (error) {
          console.warn('[Cleanup Google] Delete failed:', error.message);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

      return res.status(200).json({
          success: true,
          mode: deleteAll ? 'all' : 'google-only',
          deleted: data?.length || 0,
          message: deleteAll
              ? 'Deleted ALL articles. Run /api/cron/news-scraper to repopulate.'
              : 'Deleted Google-sourced articles. Pass ?all=true to wipe the entire table.'
      });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
