/**
 * Upcoming Events API (Poker Near Me preview)
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

function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const limit = clampInt(req.query.limit, 5, 1, 50);
          const featured = Array.isArray(req.query.featured) ? req.query.featured[0] : req.query.featured;

          let query = getSupabase()
              .from('poker_events')
              .select('*')
              .gte('event_date', new Date().toISOString().split('T')[0])
              .order('event_date', { ascending: true })
              .limit(limit);

          if (featured === 'true') {
              query = query.eq('is_featured', true);
          }

          const { data, error } = await query;

          if (error || !data?.length) {
              // No invented server-side events: return an empty list and let the
              // frontend render its own clearly-labeled "Sample" fallback.
              if (error) console.warn('[Events API] Query error:', error.message);
              return res.status(200).json({ success: true, data: [], fallback: true });
          }

          res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
          return res.status(200).json({ success: true, data });
      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('[Events API] Exception:', error?.message || error);
          return res.status(200).json({ success: true, data: [], fallback: true });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
