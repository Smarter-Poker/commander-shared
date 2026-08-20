/**
 * SOURCE BOXES API - Returns exactly 1 article per source box
 *
 * HARDENED: This endpoint guarantees 6 articles (one per source)
 * by querying the database directly for each source's latest article.
 *
 * Box 1: PokerNews
 * Box 2: MSPT
 * Box 3: CardPlayer
 * Box 4: WSOP
 * Box 5: Poker.org
 * Box 6: Pokerfuse
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

// THE 6 SOURCE BOXES - HARDCODED AND IMMUTABLE
// (must stay in sync with VALID_SOURCES in pages/hub/news.js)
const SOURCE_BOXES = [
    { box: 1, source_name: 'PokerNews', fallback_image: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 2, source_name: 'MSPT', fallback_image: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 3, source_name: 'Card Player', fallback_image: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 4, source_name: 'WSOP', fallback_image: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 5, source_name: 'Poker.org', fallback_image: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { box: 6, source_name: 'Pokerfuse', fallback_image: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800' }
];

/**
 * Resolve the latest article for a single source box.
 * Returns the article row (or an explicit empty-box placeholder).
 */
async function resolveBoxArticle(box) {
    // Try by source_box first, then by source_name
    let { data: article } = await getSupabase()
        .from('poker_news')
        .select('*')
        .eq('source_box', box.box)
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    // Fallback: try by source_name if source_box didn't match
    if (!article) {
        const searchNames = box.source_name === 'Card Player' ? ['Card Player', 'CardPlayer'] : [box.source_name];
        const { data: byName } = await getSupabase()
            .from('poker_news')
            .select('*')
            .in('source_name', searchNames)
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        article = byName;
    }

    // MSPT Cross-Source Fallback: Every 2 hours (matching cron cycle),
    // if MSPT's own article is stale, auto-populate Box 2 from any source
    // covering MSPT (e.g., PokerNews, CardPlayer). When MSPT publishes
    // new stories directly, they'll naturally be fresher and take precedence.
    if (box.box === 2 && article) {
        const articleAge = Date.now() - new Date(article.published_at).getTime();
        const twoHoursMs = 2 * 60 * 60 * 1000;
        if (articleAge > twoHoursMs) {
            const { data: crossSource } = await getSupabase()
                .from('poker_news')
                .select('*')
                .ilike('title', '%MSPT%')
                .eq('is_published', true)
                .order('published_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (crossSource && new Date(crossSource.published_at) > new Date(article.published_at)) {
                article = crossSource;
            }
        }
    }

    // If we found an article, return it with box number
    if (article) {
        return {
            ...article,
            _boxNumber: box.box,
            _sourceName: box.source_name
        };
    }

    // NO PLACEHOLDER - just mark as empty for this box
    // The frontend should handle showing old cached content
    return {
        id: `empty-box-${box.box}`,
        _boxNumber: box.box,
        _sourceName: box.source_name,
        _isEmpty: true,
        title: `Awaiting ${box.source_name} News`,
        source_name: box.source_name,
        image_url: box.fallback_image,
        published_at: new Date().toISOString(),
        views: 0
    };
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          // Resolve all boxes concurrently (was up to 13 sequential round-trips)
          const boxArticles = await Promise.all(SOURCE_BOXES.map(resolveBoxArticle));

          // Primary above-the-fold data for the news hub — cache at the edge
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return res.status(200).json({
              success: true,
              data: boxArticles,
              timestamp: new Date().toISOString()
          });

      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('[Source Boxes API] Error:', error);
          return res.status(500).json({
              success: false,
              error: 'Internal server error',
              data: SOURCE_BOXES.map(box => ({
                  id: `error-box-${box.box}`,
                  _boxNumber: box.box,
                  _sourceName: box.source_name,
                  _isError: true,
                  title: `${box.source_name} - Loading...`,
                  source_name: box.source_name,
                  image_url: box.fallback_image,
                  published_at: new Date().toISOString(),
                  views: 0
              }))
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
