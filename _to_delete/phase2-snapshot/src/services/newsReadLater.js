/**
 * News Read Later Service
 * Manages user's read later queue for news articles
 *
 * NOTE — currently an orphan: no page imports this service yet, although the
 * hamburger menu ships a "Read Later" item pointing at /hub/news?filter=later.
 * Kept (not deleted) so that wiring the feature into pages/hub/news.js only
 * requires mirroring the newsBookmarks pattern. Hardened to the same
 * never-throw contract as newsBookmarks so it can be used fire-and-forget:
 *   - getReadLater        → [] on any failure
 *   - addToReadLater      → inserted/existing row object, or null on failure
 *   - removeFromReadLater → true on success, false on failure
 *   - isInReadLater       → boolean, false on failure
 */

import { supabase } from '../lib/supabase';

/**
 * Get all read later articles for a user
 */
export async function getReadLater(userId) {
    if (!userId) return [];

    try {
        const { data, error } = await supabase
            .from('news_read_later')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Read later fetch failed (non-critical):', error?.message);
            return [];
        }

        return data || [];
    } catch (error) {
        console.warn('Read later not available:', error?.message);
        return [];
    }
}

/**
 * Add an article to read later (idempotent)
 *
 * Upserts on (user_id, article_id) so repeat taps can't create duplicate rows.
 * Falls back to a plain insert when the table has no matching UNIQUE
 * constraint (42P10), and treats a duplicate-key race (23505) as success.
 */
export async function addToReadLater(userId, articleId, articleData = {}) {
    if (!userId || articleId === undefined || articleId === null) return null;

    const row = {
        user_id: userId,
        article_id: articleId,
        article_title: articleData.title || null,
        article_url: articleData.url || null,
        source: articleData.source || null,
        thumbnail_url: articleData.thumbnail || null
    };

    try {
        let { data, error } = await supabase
            .from('news_read_later')
            .upsert(row, { onConflict: 'user_id,article_id' })
            .select()
            .maybeSingle();

        if (error && error.code === '42P10') {
            // No UNIQUE(user_id, article_id) constraint — fall back to insert.
            ({ data, error } = await supabase
                .from('news_read_later')
                .insert(row)
                .select()
                .maybeSingle());
        }

        if (error) {
            if (error.code === '23505') {
                // Already saved by a concurrent request — treat as success.
                const { data: existing } = await supabase
                    .from('news_read_later')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('article_id', articleId)
                    .limit(1);
                return (existing && existing[0]) || row;
            }
            console.warn('Error adding to read later:', error?.message);
            return null;
        }

        return data || row;
    } catch (error) {
        console.warn('Read later add failed:', error?.message);
        return null;
    }
}

/**
 * Remove an article from read later
 */
export async function removeFromReadLater(userId, articleId) {
    if (!userId || articleId === undefined || articleId === null) return false;

    try {
        const { error } = await supabase
            .from('news_read_later')
            .delete()
            .eq('user_id', userId)
            .eq('article_id', articleId);

        if (error) {
            console.warn('Error removing from read later:', error?.message);
            return false;
        }

        return true;
    } catch (error) {
        console.warn('Read later remove failed:', error?.message);
        return false;
    }
}

/**
 * Check if an article is in read later
 */
export async function isInReadLater(userId, articleId) {
    if (!userId || articleId === undefined || articleId === null) return false;

    try {
        // limit(1) instead of maybeSingle(): stays correct even if legacy
        // duplicate rows exist (maybeSingle errors on >1 row).
        const { data, error } = await supabase
            .from('news_read_later')
            .select('id')
            .eq('user_id', userId)
            .eq('article_id', articleId)
            .limit(1);

        if (error) {
            console.warn('Error checking read later:', error?.message);
            return false;
        }

        return Array.isArray(data) && data.length > 0;
    } catch (error) {
        console.warn('Read later check failed:', error?.message);
        return false;
    }
}
