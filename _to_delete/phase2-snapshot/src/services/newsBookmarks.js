/**
 * News Bookmarks Service
 * Manages user's bookmarked news articles
 *
 * Contract (relied on by pages/hub/news.js and pages/hub/article.js — do not change):
 *   - getNewsBookmarks   → [] on any failure (never throws)
 *   - addNewsBookmark    → inserted/existing row object, or null on failure
 *   - removeNewsBookmark → true on success, false on failure
 *   - isArticleBookmarked→ boolean, false on failure
 *
 * Schema note: rows are returned as stored — `article_id`'s column type must
 * match `poker_news.id` (callers compare with strict equality). If the types
 * ever drift (text vs int), normalize with String(...) at the call site.
 */

import { supabase } from '../lib/supabase';

/**
 * Get all bookmarked articles for a user
 */
export async function getNewsBookmarks(userId) {
    if (!userId) return [];

    try {
        const { data, error } = await supabase
            .from('news_bookmarks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('News bookmarks fetch failed (non-critical):', error?.message);
            return [];
        }

        return data || [];
    } catch (error) {
        console.warn('News bookmarks not available:', error?.message);
        return [];
    }
}

/**
 * Add an article to bookmarks (idempotent)
 *
 * Uses an upsert on (user_id, article_id) so double-clicks or client/DB state
 * drift can never accumulate duplicate rows. Falls back to a plain insert when
 * the table has no matching UNIQUE constraint (Postgres error 42P10), and
 * treats a duplicate-key race (23505) as success.
 */
export async function addNewsBookmark(userId, articleId, articleData = {}) {
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
            .from('news_bookmarks')
            .upsert(row, { onConflict: 'user_id,article_id' })
            .select()
            .maybeSingle();

        if (error && error.code === '42P10') {
            // No UNIQUE(user_id, article_id) constraint on the table — fall back
            // to the previous plain-insert behaviour rather than failing the save.
            ({ data, error } = await supabase
                .from('news_bookmarks')
                .insert(row)
                .select()
                .maybeSingle());
        }

        if (error) {
            if (error.code === '23505') {
                // Raced with a concurrent insert — the bookmark already exists.
                const { data: existing } = await supabase
                    .from('news_bookmarks')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('article_id', articleId)
                    .limit(1);
                return (existing && existing[0]) || row;
            }
            console.warn('Error adding news bookmark:', error?.message);
            return null;
        }

        // A restrictive RLS SELECT policy can hide the written row; the write
        // itself succeeded, so return the local row rather than a false failure.
        return data || row;
    } catch (error) {
        console.warn('News bookmark add failed:', error?.message);
        return null;
    }
}

/**
 * Remove an article from bookmarks
 */
export async function removeNewsBookmark(userId, articleId) {
    if (!userId || articleId === undefined || articleId === null) return false;

    try {
        const { error } = await supabase
            .from('news_bookmarks')
            .delete()
            .eq('user_id', userId)
            .eq('article_id', articleId);

        if (error) {
            console.warn('Error removing news bookmark:', error?.message);
            return false;
        }

        return true;
    } catch (error) {
        console.warn('News bookmark remove failed:', error?.message);
        return false;
    }
}

/**
 * Check if an article is bookmarked
 */
export async function isArticleBookmarked(userId, articleId) {
    if (!userId || articleId === undefined || articleId === null) return false;

    try {
        // limit(1) instead of maybeSingle(): stays correct even if legacy
        // duplicate rows exist (maybeSingle errors on >1 row).
        const { data, error } = await supabase
            .from('news_bookmarks')
            .select('id')
            .eq('user_id', userId)
            .eq('article_id', articleId)
            .limit(1);

        if (error) {
            console.warn('Error checking news bookmark:', error?.message);
            return false;
        }

        return Array.isArray(data) && data.length > 0;
    } catch (error) {
        console.warn('News bookmark check failed:', error?.message);
        return false;
    }
}
