/**
 * VIP CACHE — offline-degraded fallback ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY MODEL (read this before using any export here)
 *
 * localStorage is fully writable from devtools. Nothing in this file is, or
 * can be, an authorization decision. Before 2026-08-05 checkFeatureAccess()
 * read localStorage['sp-vip-status'] BEFORE any network call and returned
 * hasAccess:true on a bare string match — so `localStorage.setItem(
 * 'sp-vip-status','true')` granted every premium feature on the platform,
 * permanently, with no server round-trip at all.
 *
 * The rule now is: the server answer always wins when the server is
 * reachable. The cache is consulted ONLY after every server path has already
 * failed, and anything it grants is flagged `degraded: true` so callers can
 * tell a verified entitlement from an unverified one.
 *
 * That preserves the original anti-lockout intent (a paying VIP must never be
 * paywalled because their connection dropped) without letting the cache act
 * as a free VIP switch while the network is up.
 *
 * Entitlements that cost money or mint diamonds MUST be enforced server-side
 * regardless of anything here. See pages/api/bankroll/*, pages/api/poker/
 * player-notes.js and pages/api/store/* for the server-side checks.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Legacy cosmetic key. Read by badges, menus and optimistic renders. */
export const VIP_CACHE_KEY = 'sp-vip-status';

/** Structured, user-bound, expiring cache written only after server verification. */
export const VIP_PROOF_KEY = 'sp-vip-proof';

/** How long a verified VIP answer stays usable as an offline fallback. */
export const VIP_PROOF_TTL_MS = 24 * 60 * 60 * 1000;

function hasStorage() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * Record a SERVER-VERIFIED VIP answer.
 * Call this only with a value that came back from the database or from
 * /api/vip/check-status — never from another cache read.
 *
 * @param {string} userId
 * @param {boolean} isVip
 */
export function writeVipProof(userId, isVip) {
    if (!hasStorage()) return;
    try {
        // Legacy key kept in sync so badges / menus / sign-out purges keep working.
        localStorage.setItem(VIP_CACHE_KEY, String(isVip === true));
        if (isVip === true && userId) {
            localStorage.setItem(VIP_PROOF_KEY, JSON.stringify({
                u: String(userId),
                v: true,
                exp: Date.now() + VIP_PROOF_TTL_MS
            }));
        } else {
            localStorage.removeItem(VIP_PROOF_KEY);
        }
    } catch (e) {
        console.warn('[vipCache] write failed:', e?.message || e);
    }
}

/**
 * Read the fallback proof. Returns true ONLY for a non-expired entry bound to
 * this exact user. Callers must treat a true result as degraded/unverified.
 *
 * @param {string} userId
 * @returns {boolean}
 */
export function readVipProof(userId) {
    if (!hasStorage() || !userId) return false;
    try {
        const raw = localStorage.getItem(VIP_PROOF_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== true) return false;
        if (String(parsed.u) !== String(userId)) return false;
        if (!Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) {
            localStorage.removeItem(VIP_PROOF_KEY);
            return false;
        }
        return true;
    } catch (e) {
        console.warn('[vipCache] read failed:', e?.message || e);
        return false;
    }
}

/** Clear both keys. Called on sign-out and on a server answer of not-VIP. */
export function clearVipProof() {
    if (!hasStorage()) return;
    try {
        localStorage.removeItem(VIP_PROOF_KEY);
        localStorage.removeItem(VIP_CACHE_KEY);
    } catch (e) {
        console.warn('[vipCache] clear failed:', e?.message || e);
    }
}
