/**
 * Reels API - Get Poker Reels from Social Feed
 * Pulls from social_reels table (same as social media feed)
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
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const limit = clampInt(safeQ(req.query.limit), 20, 1, 100);
          const sort = safeQ(req.query.sort) || 'recent';

          // First fetch reels without join to avoid schema cache issues
          let query = getSupabase()
              .from('social_reels')
              .select('*')
              .eq('is_public', true);

          // Sorting options ('random' fetches recent, then shuffles below)
          if (sort === 'popular') {
              query = query.order('view_count', { ascending: false });
          } else {
              query = query.order('created_at', { ascending: false });
          }

          query = query.limit(limit);

          const { data, error } = await query;

          if (error || !data?.length) {
              // No fake sample reels: return an empty list and let the
              // frontend render its own empty state.
              if (error) console.warn('Reels API error:', error.message);
              return res.status(200).json({ success: true, data: [], fallback: true });
          }

          // Fetch profiles separately to avoid schema cache join errors
          const authorIds = [...new Set(data.map(r => r.author_id).filter(Boolean))];
          let profilesMap = {};

          if (authorIds.length > 0) {
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, username, full_name, avatar_url')
                  .in('id', authorIds)
                      .limit(100);

              if (profiles) {
                  profilesMap = profiles.reduce((acc, p) => {
                      acc[p.id] = p;
                      return acc;
                  }, {});
              }
          }

          // Transform data to include author info and extract title from caption
          // (\u{1F3AC} = clapper-board emoji prefix some captions carry)
          let result = data.map(reel => {
              const profile = profilesMap[reel.author_id];
              return {
                  ...reel,
                  title: reel.caption?.split('\n')[0]?.replace(/^\u{1F3AC}\s*/u, '') || 'Poker Reel',
                  channel_name: profile?.full_name || profile?.username || 'Smarter.Poker',
                  profiles: profile,
                  author: profile
              };
          });

          // Shuffle if random sort requested.
          // Phase 62: Fisher-Yates instead of biased sort(()=>Math.random()-0.5)
          // (some permutations 2x more likely; visible in feed-rank skew over time).
          if (sort === 'random') {
              for (let i = result.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [result[i], result[j]] = [result[j], result[i]];
              }
          }

          res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
          return res.status(200).json({ success: true, data: result });
      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('Reels API exception:', error?.message || error);
          return res.status(200).json({ success: true, data: [], fallback: true });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
