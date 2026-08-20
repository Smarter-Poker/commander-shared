/**
 * Videos API - Get Poker Videos
 * Reads from social_reels table (populated by pokernews-videos cron)
 * Transforms reels data into video-card-compatible format
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

// Extract YouTube video ID from various URL formats
function extractYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
        /youtu\.be\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const limit = clampInt(safeQ(req.query.limit), 20, 1, 100);
          const channel = safeQ(req.query.channel);

          // When filtering by channel, over-fetch so post-filter pages still fill
          const fetchLimit = channel ? 100 : limit;

          // Read from social_reels — the table pokernews-videos cron populates
          const { data, error } = await getSupabase()
              .from('social_reels')
              .select('*')
              .eq('is_public', true)
              .order('created_at', { ascending: false })
              .limit(fetchLimit);

          if (error || !data?.length) {
              // No fake sample videos: return an empty list and let the
              // frontend render its own empty state.
              if (error) console.warn('Videos API error:', error.message);
              return res.status(200).json({ success: true, data: [], fallback: true });
          }

          // Fetch author profiles so `channel` reflects the real channel
          // (was hardcoded 'PokerNews', which made ?channel= filtering dead)
          const authorIds = [...new Set(data.map(r => r.author_id).filter(Boolean))];
          let profilesMap = {};
          if (authorIds.length > 0) {
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, username, full_name')
                  .in('id', authorIds)
                      .limit(100);
              if (profiles) {
                  profilesMap = profiles.reduce((acc, p) => {
                      acc[p.id] = p;
                      return acc;
                  }, {});
              }
          }

          // Transform social_reels rows into video-card-compatible format
          // (\u{1F3AC} = clapper-board emoji prefix some captions carry)
          const videos = data.map(reel => {
              const youtubeId = extractYouTubeId(reel.video_url);
              const thumbnailUrl = reel.thumbnail_url ||
                  (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null);
              const profile = profilesMap[reel.author_id];

              return {
                  id: reel.id,
                  title: reel.caption?.split('\n')[0]?.replace(/^\u{1F3AC}\s*/u, '') || 'Poker Video',
                  youtube_id: youtubeId,
                  video_url: reel.video_url,
                  thumbnail_url: thumbnailUrl,
                  duration: reel.duration || '',
                  views: reel.view_count || 0,
                  channel: profile?.full_name || profile?.username || 'PokerNews',
                  published_at: reel.created_at,
                  scraped_at: reel.created_at
              };
          });

          // Filter by channel if specified, then trim to the requested page size
          const filtered = (channel
              ? videos.filter(v => v.channel?.toLowerCase().includes(channel.toLowerCase()))
              : videos
          ).slice(0, limit);

          res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
          return res.status(200).json({ success: true, data: filtered });
      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('Videos API exception:', error?.message || error);
          return res.status(200).json({ success: true, data: [], fallback: true });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
