/**
 * News Hub API - Get News Articles
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Clamp an arbitrary query value to an integer within [min, max]
function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

// Shape check only (8-4-4-4-12 hex). Deliberately NOT version/variant-strict:
// the goal is to keep placeholder ids ('empty-box-1', '1'..'8', 'mspt1') and
// injection attempts out of the RPC, not to assert a particular UUID version —
// a non-v4 id in poker_news would otherwise freeze view counting silently.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method === 'GET') {
          try {
              const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
              const category = safeQ(req.query.category);
              const search = safeQ(req.query.search);
              // BUG FIX: limit/offset were used as raw strings — `offset + limit - 1`
              // string-concatenated (e.g. "20" + 20 - 1 = 2019) producing 2000-row
              // pages, and `?limit=abc` produced range(0, NaN) → 500. Clamp both.
              const limit = clampInt(safeQ(req.query.limit), 20, 1, 100);
              const offset = clampInt(safeQ(req.query.offset), 0, 0, 10000);
              const featured = safeQ(req.query.featured);

              let query = getSupabase()
                  .from('poker_news')
                  .select('*')
                  .eq('is_published', true)
                  .order('published_at', { ascending: false });

              if (category && category !== 'all') {
                  query = query.eq('category', category);
              }

              if (search) {
                  // BUG #270 FIX: Sanitize search input to prevent PostgREST filter injection.
                  // Characters like commas, parentheses, and dots could break/modify the filter.
                  const sanitized = search.slice(0, 100).replace(/[,().]/g, ' ').trim();
                  if (sanitized) {
                      query = query.or(`title.ilike.%${sanitized}%,content.ilike.%${sanitized}%`);
                  }
              }

              if (featured === 'true') {
                  query = query.eq('is_featured', true);
              }

              query = query.range(offset, offset + limit - 1);

              const { data, error } = await query;

              if (error) throw error;

              res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ success: true, data });
          } catch (error) {
              try { reportApiError(error, req); } catch (_e) { /* noop */ }
              console.warn('[News Articles API] GET error:', error?.message || error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }
      }

      // POST - Increment view count
      if (req.method === 'POST') {
          try {
              const { id } = req.body || {};
              if (!id) return res.status(400).json({ success: false, error: 'Missing article ID' });

              // Validate UUID so placeholder ids (e.g. 'empty-box-1') and junk
              // input never reach the RPC / inflate trending counts.
              if (typeof id !== 'string' || !UUID_RE.test(id)) {
                  // The client fire-and-forgets this response, so log it —
                  // otherwise an id-format drift would freeze views silently.
                  console.warn('[News Articles API] Rejected view POST for non-UUID id:', String(id).slice(0, 64));
                  return res.status(400).json({ success: false, error: 'Invalid article ID' });
              }

              const { error } = await getSupabase().rpc('increment_news_views', { news_id: id });

              if (error) throw error;

              return res.status(200).json({ success: true });
          } catch (error) {
              try { reportApiError(error, req); } catch (_e) { /* noop */ }
              console.warn('[News Articles API] POST error:', error?.message || error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
