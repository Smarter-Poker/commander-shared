/**
 * Newsletter Subscription API
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

// Practical email shape check (single @, no whitespace, dot in domain)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

// One generic message for every success path so responses cannot be used to
// enumerate who is already on the subscriber list.
const GENERIC_SUCCESS = 'Successfully subscribed!';

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const { email, source } = req.body || {};

          if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email.trim())) {
              return res.status(400).json({ success: false, error: 'Valid email required' });
          }
          const normalizedEmail = email.trim().toLowerCase();

          // Sanitize untrusted source tag: short slug or the default
          const safeSource = (typeof source === 'string' && /^[a-z0-9_-]{1,50}$/i.test(source))
              ? source
              : 'news_hub';

          // Check if already subscribed
          const { data: existing } = await getSupabase()
              .from('newsletter_subscribers')
              .select('id, is_active')
              .eq('email', normalizedEmail)
              .maybeSingle();

          if (existing) {
              if (!existing.is_active) {
                  // Reactivate subscription
                  const { error: reactivateError } = await getSupabase()
                    .from('newsletter_subscribers')
                    .update({ is_active: true, unsubscribed_at: null })
                      .eq('id', existing.id);
                  if (reactivateError) {
                      // BUG FIX: previously logged and still reported success
                      console.warn('[Newsletter] Reactivation failed:', reactivateError.message);
                      return res.status(500).json({ success: false, error: 'Subscription failed' });
                  }
              }
              return res.status(200).json({ success: true, message: GENERIC_SUCCESS });
          }

          // New subscription
          const { error } = await getSupabase()
              .from('newsletter_subscribers')
              .insert({ email: normalizedEmail, source: safeSource });

          if (error) throw error;

          return res.status(200).json({ success: true, message: GENERIC_SUCCESS });
      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('Newsletter subscription error:', error);
          return res.status(500).json({ success: false, error: 'Subscription failed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
