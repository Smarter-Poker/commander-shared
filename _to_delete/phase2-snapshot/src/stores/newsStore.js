/**
 * News Store - Zustand State Management
 * God Mode Stack - Global news state
 *
 * NOTE — currently an orphan: pages/hub/news.js fetches via SWR + local state
 * and does not consume this store. Kept (not deleted) as the candidate single
 * source of truth if the page is ever migrated. Beware of drift until then:
 * this store filters on article.category / title-only search, while the live
 * page filters on source_name and also searches server-side.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

/**
 * Strip heavy fields before persisting. /api/news/articles selects '*',
 * including full article content — persisting that for every row is a
 * localStorage-quota (~5MB) and JSON-serialization risk. Rehydrated articles
 * are cache-warmers only; fetchAllData restores the full objects.
 */
function slimArticle(article) {
    if (!article || typeof article !== 'object') return article;
    const { content, full_content, html_content, raw_html, ...rest } = article;
    return rest;
}

/** SSR-safe no-op storage used when no real storage is available. */
const noopStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};

/**
 * Resolve the persistence backend defensively:
 * - prefer the app-wide getStorage() helper,
 * - fall back to guarded localStorage in the browser,
 * - fall back to a no-op storage on the server (persist then simply skips).
 */
function resolveStorage() {
    try {
        if (typeof getStorage === 'function') {
            const storage = getStorage();
            if (storage) return storage;
        }
    } catch (error) {
        console.warn('news-storage: getStorage() failed, using fallback:', error?.message);
    }

    return createJSONStorage(() => {
        if (typeof window === 'undefined') return noopStorage;
        let store;
        try {
            // Touching window.localStorage can itself throw in privacy mode or
            // when cookies/site data are blocked, so probe it up front.
            store = window.localStorage;
            if (!store) return noopStorage;
        } catch (error) {
            console.warn('news-storage: localStorage unavailable, using no-op:', error?.message);
            return noopStorage;
        }

        // Quota-safe wrapper: a full or locked-down localStorage must never
        // crash the app. Every accessor is individually guarded because reads
        // and removals can throw too, not just writes.
        return {
            getItem: (key) => {
                try {
                    return store.getItem(key);
                } catch (error) {
                    console.warn('news-storage: read failed:', error?.message);
                    return null;
                }
            },
            setItem: (key, value) => {
                try {
                    store.setItem(key, value);
                } catch (error) {
                    console.warn('news-storage: persist skipped (quota?):', error?.message);
                }
            },
            removeItem: (key) => {
                try {
                    store.removeItem(key);
                } catch (error) {
                    console.warn('news-storage: remove failed:', error?.message);
                }
            }
        };
    });
}

/** Fetch JSON defensively; returns null on any network/parse/HTTP failure. */
async function fetchJson(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`News fetch failed (${res.status}):`, url);
            return null;
        }
        return await res.json();
    } catch (error) {
        console.warn('News fetch failed:', url, error?.message);
        return null;
    }
}

export const useNewsStore = create(
    persist(
        (set, get) => ({
            // State
            articles: [],
            videos: [],
            trending: [],
            events: [],
            activeCategory: 'all',
            searchQuery: '',
            isLoading: false,
            lastFetched: null,

            // Actions
            setArticles: (articles) => set({ articles: articles || [], lastFetched: Date.now() }),
            setVideos: (videos) => set({ videos: videos || [] }),
            setTrending: (trending) => set({ trending: trending || [] }),
            setEvents: (events) => set({ events: events || [] }),
            setActiveCategory: (category) => set({ activeCategory: category || 'all' }),
            setSearchQuery: (query) => set({ searchQuery: query || '' }),
            setLoading: (loading) => set({ isLoading: !!loading }),

            // Computed
            getFilteredArticles: () => {
                const { articles, activeCategory, searchQuery } = get();
                if (!Array.isArray(articles)) return [];
                const q = (searchQuery || '').toLowerCase();
                return articles.filter(article => {
                    if (!article) return false;
                    const matchesCategory = activeCategory === 'all' ||
                        article.category?.toLowerCase() === activeCategory.toLowerCase();
                    const matchesSearch = !q ||
                        article.title?.toLowerCase().includes(q);
                    return matchesCategory && matchesSearch;
                });
            },

            // Fetch all data (partial failures degrade gracefully — each feed
            // that succeeds is applied; failed feeds keep their previous state)
            fetchAllData: async () => {
                set({ isLoading: true });
                try {
                    const [articlesData, videosData, eventsData] = await Promise.all([
                        fetchJson('/api/news/articles?limit=20'),
                        fetchJson('/api/news/videos?limit=4'),
                        fetchJson('/api/news/events?limit=5')
                    ]);

                    // Batch into one set() to avoid redundant renders/persists
                    const next = { lastFetched: Date.now() };

                    if (articlesData?.success && Array.isArray(articlesData.data)) {
                        next.articles = articlesData.data;
                        next.trending = [...articlesData.data]
                            .sort((a, b) => (b?.views || 0) - (a?.views || 0))
                            .slice(0, 5);
                    }
                    if (videosData?.success && Array.isArray(videosData.data)) {
                        next.videos = videosData.data;
                    }
                    if (eventsData?.success && Array.isArray(eventsData.data)) {
                        next.events = eventsData.data;
                    }

                    set(next);
                } catch (error) {
                    console.warn('Failed to fetch news data:', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            // Clear cache
            clearCache: () => set({
                articles: [],
                videos: [],
                trending: [],
                events: [],
                lastFetched: null
            })
        }),
        {
            name: 'news-storage',
            storage: resolveStorage(),
            partialize: (state) => ({
                // Persist slimmed rows only — full article content blows the
                // web-storage quota (see slimArticle above)
                articles: (state.articles || []).slice(0, 20).map(slimArticle),
                videos: (state.videos || []).slice(0, 12),
                trending: (state.trending || []).slice(0, 5).map(slimArticle),
                events: (state.events || []).slice(0, 10),
                lastFetched: state.lastFetched
            })
        }
    )
);
