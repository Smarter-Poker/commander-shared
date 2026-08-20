import React from 'react';
import dynamic from 'next/dynamic';
/**
 * SMARTER.POKER NEWS HUB - REDESIGNED UI
 * Build: 20260205-v3-metallic-icons
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - 6 Source-Specific News Boxes (PokerNews, MSPT, CardPlayer, WSOP, Poker.org, Pokerfuse)
 * - Latest Videos tab with auto-scraped content
 * - Category filtering
 * - Trending sidebar
 * - Auto-refreshes from scraper every 2 hours
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import { useYouTubeErrorManager, YouTubeErrorOverlay } from '../../src/hooks/useYouTubeErrorManager';
import useSWR from 'swr';
import { supabase } from '../../src/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
// confetti loaded lazily on first use
let _confetti = null;
async function fireConfetti(opts) {
    try {
        if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; }
        _confetti(opts);
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}
import { useAvatar } from '../../src/contexts/AvatarContext';
import { Eye, TrendingUp, Trophy, MapPin, ExternalLink, Bookmark, BookmarkCheck, Share2, Twitter, Facebook, LinkIcon, CheckCircle, ChevronUp, Newspaper, Globe, ChevronRight, ChevronLeft, Film, Clock, Mail, Calendar, PlayCircle } from 'lucide-react';

import { useExternalLink } from '../../src/components/ui/ExternalLinkModal';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getNewsPreferences, updateNewsPreferences } from '../../src/services/newsPreferences';
import { getNewsBookmarks, addNewsBookmark, removeNewsBookmark } from '../../src/services/newsBookmarks';

const PageTransition = dynamic(() => import('../../src/components/transitions/PageTransition'), { ssr: false });
const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../src/components/ui/HamburgerMenu'), { ssr: false });
const BottomNavBar = dynamic(() => import('../../src/components/ui/BottomNavBar'), { ssr: false });
const ArticleReaderModal = dynamic(() => import('../../src/components/social/ArticleReaderModal'), { ssr: false });
const NewsBox = dynamic(() => import('../../src/components/news/NewsBox'), { ssr: false });
const ReelCard = dynamic(() => import('../../src/components/news/ReelCard'), { ssr: false });
const VideoCard = dynamic(() => import('../../src/components/news/VideoCard'), { ssr: false });

// Fallback data — shown only when the articles API fails or returns nothing.
// Every item is tagged is_fallback so it never triggers BREAKING badges or view-count POSTs.
const FALLBACK_NEWS = [
    { id: '1', title: "WSOP 2026 Schedule Released", content: "The World Series of Poker announces its biggest schedule yet", image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80", category: "tournament", read_time: 4, views: 5200, published_at: new Date().toISOString(), source_name: "PokerNews" },
    { id: '2', title: "Phil Ivey Returns to Live Poker", content: "Legendary player set for major comeback", image_url: "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=400&q=80", category: "news", read_time: 3, views: 8900, published_at: new Date(Date.now() - 3600000).toISOString(), source_name: "Card Player" },
    { id: '3', title: "GTO Strategy: 3-Betting Ranges Explained", content: "Master the art of 3-betting with optimal frequencies", image_url: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400&q=80", category: "strategy", read_time: 8, views: 12400, published_at: new Date(Date.now() - 7200000).toISOString(), source_name: "Upswing" },
    { id: '4', title: "Online Poker Traffic Hits New Records", content: "Global player pools see unprecedented growth", image_url: "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80", category: "industry", read_time: 5, views: 3100, published_at: new Date(Date.now() - 10800000).toISOString(), source_name: "Poker.org" },
    { id: '5', title: "EPT Barcelona Main Event Preview", content: "All you need to know about Europe's biggest poker festival", image_url: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80", category: "tournament", read_time: 6, views: 4500, published_at: new Date(Date.now() - 14400000).toISOString(), source_name: "PokerNews" },
    { id: '6', title: "Bankroll Management Essentials", content: "Protect your poker career with proper money management", image_url: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&q=80", category: "strategy", read_time: 7, views: 6700, published_at: new Date(Date.now() - 18000000).toISOString(), source_name: "Card Player" },
    { id: '7', title: "New Poker Room Opens in Las Vegas", content: "State-of-the-art facility debuts on the Strip", image_url: "https://images.unsplash.com/photo-1517232115160-ff93364542dd?w=400&q=80", category: "industry", read_time: 4, views: 2300, published_at: new Date(Date.now() - 21600000).toISOString(), source_name: "Poker.org" },
    { id: '8', title: "WPT Championship Final Table Set", content: "Six players remain for the $10M prize pool", image_url: "https://images.unsplash.com/photo-1609743522653-52354461eb27?w=400&q=80", category: "tournament", read_time: 5, views: 7800, published_at: new Date(Date.now() - 25200000).toISOString(), source_name: "PokerNews" }
].map(a => ({ ...a, is_fallback: true }));

const FALLBACK_POY = [
    { player_name: "Alex F.", points: 2850, rank: 1 },
    { player_name: "Thomas B.", points: 2720, rank: 2 },
    { player_name: "Chad E.", points: 2580, rank: 3 },
    { player_name: "Stephen C.", points: 2410, rank: 4 },
    { player_name: "Daniel N.", points: 2290, rank: 5 }
];

const FALLBACK_EVENTS = [
    { id: '1', name: "EPT Barcelona", event_date: "2026-08-17" },
    { id: '2', name: "WSOP Circuit Vegas", event_date: "2026-10-08" },
    { id: '3', name: "WPT Championship", event_date: "2026-12-01" }
];

// MSPT (Mid-States Poker Tour) Fallback Data
const FALLBACK_MSPT = [
    { id: 'mspt1', title: "MSPT Venetian $1,600 Main Event Kicks Off", source_url: "https://msptpoker.com", published_at: new Date().toISOString(), prize_pool: "$2M GTD" },
    { id: 'mspt2', title: "MSPT Canterbury Park Main Event Results", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 86400000).toISOString(), prize_pool: "$350K" },
    { id: 'mspt3', title: "MSPT 2026 Schedule Announced - 20+ Stops", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 172800000).toISOString(), prize_pool: null },
    { id: 'mspt4', title: "MSPT Player of the Year Race Heats Up", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 259200000).toISOString(), prize_pool: null }
].map(a => ({ ...a, is_fallback: true }));

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatEventDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    // Date-only strings parse as UTC midnight — format in UTC so the day never shifts
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Extract a YouTube video id from watch/shorts/short-link URLs (mirrors ReelCard.js)
function getYouTubeVideoId(url) {
    if (!url) return null;
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return shortMatch[1];
    return null;
}

function formatViews(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Fallback images for different categories - using reliable poker images
const FALLBACK_IMAGES = {
    tournament: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=400',
    strategy: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=400',
    industry: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=400',
    news: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=400',
    online: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=400'
};

// NewsBox, VideoCard, ReelCard, MSPTBox, SourcePlaceholderBox — extracted to src/components/news/

// Sources that appear in the "More Stories" feed and the filter chips
const VALID_SOURCES = ['PokerNews', 'MSPT', 'Card Player', 'WSOP', 'Poker.org', 'Pokerfuse'];
// Sections reachable via ?tab= (hamburger menu deep links). 'bookmarks' and 'later'
// are reached via ?filter= instead and are handled separately.
const SECTION_TABS = ['news', 'reels', 'videos', 'events'];

// Source accent colors for color-coded borders
const SOURCE_COLORS = {
    'PokerNews': '#e53935',
    'MSPT': '#1565c0',
    'CardPlayer': '#43a047',
    'Card Player': '#43a047',
    'WSOP': '#f9a825',
    'Poker.org': '#7b1fa2',
    'Pokerfuse': '#00897b'
};

export default function NewsHub() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;



    // Core State
    const [searchQuery, setSearchQuery] = useState('');
    const [sourceFilters, setSourceFilters] = useState({});
    const [visibleStories, setVisibleStories] = useState(10);
    const [lastRefreshed, setLastRefreshed] = useState(null);
    const [scrollProgress, setScrollProgress] = useState(0);
    const [newArticleCount, setNewArticleCount] = useState(0);
    const reelsCarouselRef = useRef(null);

    // Phase 3 State
    // NOTE: initialize to the server-rendered default and hydrate from localStorage in an
    // effect — reading storage in the useState initializer causes React #418 hydration
    // mismatches (see usePersistedFilters.js for the canonical pattern).
    const [viewMode, setViewMode] = useState('grid');
    useEffect(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('news_view_mode') : null;
        if (saved === 'list' || saved === 'grid') setViewMode(saved);
    }, []);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
    const [focusedArticleIdx, setFocusedArticleIdx] = useState(-1);

    // Phase 4: Persist viewMode
    const handleViewModeChange = useCallback((mode) => {
        setViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('news_view_mode', mode);
        }
    }, []);

    // Phase 5: Track last visit for "NEW" badges.
    // Capture the PREVIOUS visit timestamp once, then write "now" exactly once per visit —
    // the badge/new-count logic reads the captured state, never localStorage again.
    const [lastVisitTimestamp, setLastVisitTimestamp] = useState(null);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('news_last_visit');
            if (stored) setLastVisitTimestamp(new Date(stored));
            localStorage.setItem('news_last_visit', new Date().toISOString());
        }
    }, []);
    // Persisted filters for activeTab and activeSection
    const { filters, setFilter } = usePersistedFilters('news', {
        activeTab: 'all',
        activeSection: 'news'
    });

    const activeTab = filters.activeTab;
    const activeSection = filters.activeSection;
    const setActiveTab = (val) => setFilter('activeTab', val);
    const setActiveSection = (val) => setFilter('activeSection', val);

    // The category-tab UI no longer exists, so a stale persisted category would
    // silently filter the feed with no visible control — snap it back to 'all'
    // whenever localStorage hydration resurrects one.
    useEffect(() => {
        if (activeTab !== 'all') setFilter('activeTab', 'all');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // SWR-backed static data — cached 60s, survive navigation
    const jsonFetch = (url) => fetch(url).then(r => r.json());
    const { data: sourceBoxesData } = useSWR('/api/news/source-boxes', jsonFetch);
    const rawSourceBoxes = (sourceBoxesData?.success && sourceBoxesData.data?.length) ? sourceBoxesData.data : [];
    const sourceBoxes = React.useMemo(() => {
        return rawSourceBoxes.map(a => ({
            ...a,
            source_name: a.source_name === 'CardPlayer' ? 'Card Player' : a.source_name
        }));
    }, [rawSourceBoxes]);

    // Videos feed — backs the ?tab=videos section. Real data only; an empty list
    // renders the section's own empty state rather than fabricated placeholders.
    const { data: videosData } = useSWR('/api/news/videos?limit=20', jsonFetch);
    const videos = (videosData?.success && Array.isArray(videosData.data)) ? videosData.data : [];

    const { data: reelsData, error: reelsError, isLoading: reelsLoading, mutate: refreshReels } = useSWR('/api/news/reels?limit=20&sort=recent', jsonFetch);
    const reels = (reelsData?.success && reelsData.data?.length) ? reelsData.data : [];

    const { data: leaderboardData } = useSWR('/api/news/leaderboard?limit=5', jsonFetch);
    const leaderboard = (leaderboardData?.success && leaderboardData.data?.length) ? leaderboardData.data : (typeof FALLBACK_POY !== 'undefined' ? FALLBACK_POY : []);

    const { data: eventsData } = useSWR('/api/news/events?limit=3', jsonFetch);
    const events = (eventsData?.success && eventsData.data?.length) ? eventsData.data : (typeof FALLBACK_EVENTS !== 'undefined' ? FALLBACK_EVENTS : []);

    const { data: msptData } = useSWR('/api/news/articles?search=MSPT&limit=10', jsonFetch);
    const msptNews = (msptData?.success && msptData.data?.length)
        ? msptData.data.map(a => ({ id: a.id, title: a.title, source_url: a.source_url || null, published_at: a.published_at, prize_pool: a.prize_pool || null }))
        : FALLBACK_MSPT;

    // ── Muted sources ─────────────────────────────────────────────────────────
    // /hub/news/sources lets the user mute a source; it writes to
    // news_preferences.mutedSources (signed in) and localStorage 'news_muted_sources'
    // (guests). This page is the only reader — without it the toggle is inert.
    // Names are stored exactly as the source-boxes API reports them ('Card Player'),
    // which matches sourceBoxes AFTER the CardPlayer normalization above.
    const MUTED_SOURCES_KEY = 'news_muted_sources';
    const [mutedSources, setMutedSources] = useState([]);
    useEffect(() => {
        // SSR-safe: read the guest copy only after mount.
        try {
            const raw = window.localStorage.getItem(MUTED_SOURCES_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (Array.isArray(parsed)) setMutedSources(parsed.filter(s => typeof s === 'string'));
        } catch (err) {
            console.warn('Muted sources unreadable:', err?.message);
        }
    }, []);
    const isMuted = useCallback(
        (name) => mutedSources.length > 0 && mutedSources.includes(name),
        [mutedSources]
    );

    // Debounce search input into the SWR key so we don't hit the API on every keystroke
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // News articles — key changes with activeTab so SWR re-fetches and caches per tab
    const newsParams = new URLSearchParams({ limit: '100' });
    if (activeTab !== 'all') newsParams.set('category', activeTab);
    if (debouncedSearch) newsParams.set('search', debouncedSearch);
    const { data: newsData, isLoading: loading, mutate: refreshNews } = useSWR(`/api/news/articles?${newsParams}`, jsonFetch);
    // While the first load is in flight render nothing (skeleton covers it) — never fake data
    const rawNews = (newsData?.success && newsData.data?.length) ? newsData.data : (loading ? [] : FALLBACK_NEWS);
    const news = React.useMemo(() => {
        return rawNews.map(a => ({
            ...a,
            source_name: a.source_name === 'CardPlayer' ? 'Card Player' : a.source_name
        }));
    }, [rawNews]);

    // Track when data was last refreshed
    React.useEffect(() => {
        if (newsData && !loading) setLastRefreshed(new Date());
    }, [newsData, loading]);

    // Tick every 60s while the freshness indicator is visible so "Updated Xm ago" stays honest
    const [, setFreshnessTick] = useState(0);
    useEffect(() => {
        if (!lastRefreshed) return;
        const interval = setInterval(() => setFreshnessTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, [lastRefreshed]);

    // Scroll progress bar
    useEffect(() => {
        const handleScroll = () => {
            const total = document.documentElement.scrollHeight - window.innerHeight;
            if (total > 0) setScrollProgress(Math.min((window.scrollY / total) * 100, 100));
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // New article notification dot — counts against the PREVIOUS visit timestamp captured on
    // mount (the mount effect already advanced localStorage to "now"; re-reading it here made
    // this count permanently 0).
    useEffect(() => {
        if (news.length > 0 && lastVisitTimestamp) {
            const count = news.filter(a => !a.is_fallback && new Date(a.published_at) > lastVisitTimestamp).length;
            setNewArticleCount(count);
        }
    }, [news, lastVisitTimestamp]);

    // Search suggestions
    const searchSuggestions = searchQuery.length >= 2
        ? news.filter(a => a.title?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
        : [];

    // Scroll-to-top visibility (show after scrolling past 600px)
    useEffect(() => {
        const handleScrollFAB = () => setShowScrollTop(window.scrollY > 600);
        window.addEventListener('scroll', handleScrollFAB, { passive: true });
        return () => window.removeEventListener('scroll', handleScrollFAB);
    }, []);

    // Toggle source filter (Phase 4: update URL for deep linking).
    // State updaters must stay pure — compute the next value first, set it, then update the
    // URL (preserving unrelated query params) outside the updater.
    const toggleSource = (src) => {
        const next = { ...sourceFilters, [src]: !sourceFilters[src] };
        setSourceFilters(next);
        const active = Object.keys(next).filter(k => next[k]);
        const { source: _omit, ...restQuery } = router.query;
        const query = active.length === 1 ? { ...restQuery, source: active[0] } : restQuery;
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    };
    const activeSourceFilters = Object.keys(sourceFilters || {}).filter(k => sourceFilters[k]);


    // Article reader state - uses server-side proxy to display articles in-app
    const [articleReader, setArticleReader] = useState({ open: false, url: '', title: '' });

    // Fullscreen reels viewer state
    const [reelViewerOpen, setReelViewerOpen] = useState(false);
    const [reelViewerIndex, setReelViewerIndex] = useState(0);
    const openReelViewer = (index) => { setReelViewerIndex(index); setReelViewerOpen(true); };
    const reelViewerRef = useRef(null);

    // Clamp the viewer index to the live data — SWR revalidation can shrink `reels`
    const safeReelIndex = Math.max(0, Math.min(reelViewerIndex, reels.length - 1));
    useEffect(() => {
        if (reels.length === 0) {
            // The viewer only renders when reels.length > 0 — leaving it "open" with an
            // empty list hides every control while the body scroll lock stays applied.
            if (reelViewerOpen) setReelViewerOpen(false);
            return;
        }
        if (reelViewerIndex > reels.length - 1) {
            setReelViewerIndex(reels.length - 1);
        }
    }, [reels.length, reelViewerIndex, reelViewerOpen]);

    // Centralized YouTube error management for news reels viewer
    const { ytError: newsYtManaged } = useYouTubeErrorManager({
        active: reelViewerOpen,
        videoId: reelViewerOpen && reels[safeReelIndex] ? getYouTubeVideoId(reels[safeReelIndex]?.video_url) : null,
        surface: 'NewsReelsViewer',
        autoActionDelay: 3000,
        onError: () => {
            if (safeReelIndex < reels.length - 1) {
                setReelViewerIndex(safeReelIndex + 1);
            } else {
                setReelViewerOpen(false);
            }
        },
    });


    // Handle query parameters for deep linking (Phase 4: fixed source filter binding)
    // Honors every hamburger-menu deep link: ?tab=news|reels|videos|events and
    // ?filter=bookmarks|later (see src/config/hamburgerMenus.js).
    const [feedFilter, setFeedFilter] = useState(null); // 'bookmarks' | null
    const tabDeepLinkConsumed = useRef(undefined);
    const filterDeepLinkConsumed = useRef(undefined);
    useEffect(() => {
        if (router.query.source) {
            const raw = String(router.query.source);
            const normalize = (s) => s.replace(/[^a-z]/gi, '').toLowerCase();
            const match = VALID_SOURCES.find(s => normalize(s) === normalize(raw));
            setSourceFilters(prev => ({ ...prev, [match || raw]: true }));
        }
        // ?tab / ?filter are each consumed ONCE. toggleSource/clearFeedFilter keep
        // unrelated query params when they router.replace, so re-applying on every
        // query change would snap the user back to the deep-linked section whenever
        // they touch a filter. Unknown values are ignored rather than blanking the page.
        if (router.query.tab !== tabDeepLinkConsumed.current) {
            tabDeepLinkConsumed.current = router.query.tab;
            const tab = String(router.query.tab || '');
            if (SECTION_TABS.includes(tab)) setFilter('activeSection', tab);
        }
        if (router.query.filter !== filterDeepLinkConsumed.current) {
            filterDeepLinkConsumed.current = router.query.filter;
            const f = String(router.query.filter || '');
            if (f === 'bookmarks' || f === 'later') setFilter('activeSection', f);
        }
        setFeedFilter(router.query.filter === 'bookmarks' ? 'bookmarks' : null);
    }, [router.query]);

    const clearFeedFilter = () => {
        const { filter: _omit, ...restQuery } = router.query;
        router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
        setFeedFilter(null);
    };
    const [email, setEmail] = useState('');
    const [subscribed, setSubscribed] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [subscribeError, setSubscribeError] = useState('');
    const [subscribeMessage, setSubscribeMessage] = useState('');

    // UI State
    const [bookmarks, setBookmarks] = useState([]);
    const [readArticles, setReadArticles] = useState([]);
    const [shareArticle, setShareArticle] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);

    // Hamburger menu preferences — keys mirror the service + menu config
    // (src/services/newsPreferences.js and hamburgerMenus.js both use these names)
    const [preferences, setPreferences] = useState({
        pushNotifications: false,
        emailDigest: false
    });

    // Lock body scroll while the reel viewer or share modal is open
    useEffect(() => {
        if (reelViewerOpen || shareArticle) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev; };
        }
    }, [reelViewerOpen, shareArticle]);

    // Document-level keyboard handling: Escape closes the share modal / reel viewer,
    // arrows step through reels (works even after the YouTube iframe steals focus)
    useEffect(() => {
        if (!reelViewerOpen && !shareArticle) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (reelViewerOpen) setReelViewerOpen(false);
                else setShareArticle(null);
                return;
            }
            if (!reelViewerOpen) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setReelViewerIndex(prev => Math.min(prev + 1, Math.max(reels.length - 1, 0)));
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setReelViewerIndex(prev => Math.max(prev - 1, 0));
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [reelViewerOpen, shareArticle, reels.length]);

    // Focus the reel viewer container once when it opens (not on every render)
    useEffect(() => {
        if (reelViewerOpen) reelViewerRef.current?.focus();
    }, [reelViewerOpen]);


    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 REALTIME: News Updates — revalidate SWR directly on INSERT
    // ═══════════════════════════════════════════════════════════════════════════
    const refreshNewsRef = useRef(null);
    refreshNewsRef.current = refreshNews;
    useEffect(() => {
        const newsChannel = supabase
            .channel(`news-live-${Date.now()}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'poker_news'
            }, () => {
                refreshNewsRef.current?.();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(newsChannel);
        };
    }, []);

    // Load preferences and bookmarks from Supabase on mount
    useEffect(() => {
        if (userId) {
            // Merge (never replace) so unknown/extra keys and defaults survive
            getNewsPreferences(userId)
                .then(p => {
                    setPreferences(prev => ({ ...prev, ...(p || {}) }));
                    // /hub/news/sources persists muted sources here; the feed is the
                    // only consumer, so read it back on the same load.
                    if (Array.isArray(p?.mutedSources)) setMutedSources(p.mutedSources);
                })
                .catch(err => console.warn('News preferences not available:', err?.message));

            // Load bookmarks — the account list is authoritative and REPLACES the
            // localStorage copy (merging made removals impossible and leaked a previous
            // user's ids into this account on a shared browser)
            getNewsBookmarks(userId).then(data => {
                setBookmarks((data || []).map(b => b.article_id));
            }).catch(err => console.warn('Error loading bookmarks:', err));
        }
    }, [userId]);

    const updatePreference = useCallback(async (key, value) => {
        setPreferences(prev => ({ ...prev, [key]: value }));

        if (userId) {
            try {
                await updateNewsPreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference:', error);
            }
        }
    }, [userId]);

    const menuConfig = getMenuConfig('news', user, preferences, {
        setPushNotifications: (val) => updatePreference('pushNotifications', val),
        setEmailDigest: (val) => updatePreference('emailDigest', val)
    });

    //  INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload).
    // Initialized false and hydrated in an effect — reading sessionStorage in the
    // useState initializer causes React #418 hydration mismatches.
    const [showIntro, setShowIntro] = useState(false);
    useEffect(() => {
        if (typeof window !== 'undefined' && !sessionStorage.getItem('news-intro-seen')) {
            setShowIntro(true);
        }
    }, []);
    const introVideoRef = useRef(null);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('news-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // Load persisted state. hydratedRef gates the persist effects below so the
    // initial [] state can never overwrite saved bookmarks/read-history.
    const hydratedRef = useRef(false);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const savedBookmarks = localStorage.getItem('news_bookmarks');
                if (savedBookmarks) setBookmarks(prev => [...new Set([...prev, ...JSON.parse(savedBookmarks)])]);
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            try {
                const savedRead = localStorage.getItem('news_read');
                if (savedRead) setReadArticles(JSON.parse(savedRead));
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }
        hydratedRef.current = true;
    }, []);

    // Clear any stale site-wide scroll lock left behind by a previous modal
    useEffect(() => {
        document.body.classList.remove('antigravity-scroll-lock');
    }, []);

    // Persist state. The mount pass is skipped: the hydration effect above only QUEUES
    // setBookmarks/setReadArticles, so on that first flush the state is still [] and
    // writing here would stamp "[]" over the saved values before hydration lands.
    const bookmarksPersistedRef = useRef(false);
    useEffect(() => {
        if (!bookmarksPersistedRef.current) { bookmarksPersistedRef.current = true; return; }
        if (typeof window !== 'undefined' && hydratedRef.current) {
            localStorage.setItem('news_bookmarks', JSON.stringify(bookmarks));
        }
    }, [bookmarks]);

    const readPersistedRef = useRef(false);
    useEffect(() => {
        if (!readPersistedRef.current) { readPersistedRef.current = true; return; }
        if (typeof window !== 'undefined' && hydratedRef.current) {
            localStorage.setItem('news_read', JSON.stringify(readArticles));
        }
    }, [readArticles]);

    // Toggle functions — only mutate local state when the service write succeeds
    // (addNewsBookmark returns null and removeNewsBookmark returns false on failure)
    const [bookmarkNotice, setBookmarkNotice] = useState('');
    const bookmarkNoticeTimer = useRef(null);
    const showBookmarkNotice = useCallback((msg) => {
        setBookmarkNotice(msg);
        clearTimeout(bookmarkNoticeTimer.current);
        bookmarkNoticeTimer.current = setTimeout(() => setBookmarkNotice(''), 2500);
    }, []);
    useEffect(() => () => clearTimeout(bookmarkNoticeTimer.current), []);

    const toggleBookmark = useCallback(async (articleId, article = {}) => {
        if (!userId) {
            showBookmarkNotice('Sign in to save bookmarks');
            return;
        }

        if (bookmarks.includes(articleId)) {
            const ok = await removeNewsBookmark(userId, articleId);
            if (ok !== false) {
                setBookmarks(prev => prev.filter(id => id !== articleId));
            } else {
                showBookmarkNotice('Could not remove bookmark');
            }
        } else {
            const row = await addNewsBookmark(userId, articleId, {
                title: article.title,
                url: article.source_url,
                source: article.source_name,
                thumbnail: article.image_url
            });
            if (row) {
                setBookmarks(prev => (prev.includes(articleId) ? prev : [...prev, articleId]));
            } else {
                showBookmarkNotice('Could not save bookmark');
            }
        }
    }, [userId, bookmarks, showBookmarkNotice]);

    const markAsRead = (articleId) => {
        // Functional guard keeps this safe even when called from stale closures
        setReadArticles(prev => (prev.includes(articleId) ? prev : [...prev, articleId]));
    };

    // Share functions (Phase 4: Web Share API with fallback)
    const handleShare = useCallback(async (article) => {
        const url = `https://smarter.poker/hub/article?id=${article.id}`;
        // Try native Web Share API first (mobile Safari/Chrome)
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({
                    title: article.title,
                    text: `Check out this poker news: ${article.title}`,
                    url
                });
                return; // Native share handled it
            } catch (err) {
                if (err.name === 'AbortError') return; // User cancelled
                // Fall through to modal
            }
        }
        // Fallback: show share modal
        setShareArticle(article);
    }, []);

    const shareToTwitter = (article) => {
        const url = `https://smarter.poker/hub/article?id=${article.id}`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(url)}`, '_blank');
    };

    const shareToFacebook = (article) => {
        const url = `https://smarter.poker/hub/article?id=${article.id}`;
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
    };

    const copyLink = async (article) => {
        const url = `https://smarter.poker/hub/article?id=${article.id}`;
        try {
            await navigator.clipboard.writeText(url);
            fireConfetti({ particleCount: 30, spread: 40, origin: { y: 0.7 } });
        } catch (err) {
            console.warn('Clipboard write failed:', err);
        }
    };

    // Newsletter subscription
    const handleSubscribe = async (e) => {
        e.preventDefault();
        if (!email || !email.includes('@')) {
            setSubscribeError('Please enter a valid email');
            return;
        }

        setSubscribing(true);
        setSubscribeError('');

        try {
            const res = await fetch('/api/news/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            // Parse the body even on non-2xx so the server's specific message surfaces
            let body = {};
            try { body = await res.json(); } catch (_) { /* non-JSON error body */ }

            if (res.ok && body.success) {
                setSubscribed(true);
                if (body.message) setSubscribeMessage(body.message);
            } else {
                setSubscribeError(body.error || body.message || `Subscription failed (${res.status})`);
            }
        } catch (e) {
            setSubscribeError('Network error — please try again');
        } finally {
            setSubscribing(false);
        }
    };

    // Link containment - stay inside smarter.poker
    const { openExternal } = useExternalLink();

    // Article navigation - uses link containment
    const openArticle = async (article) => {
        // Fallback placeholders have fabricated ids — never POST view counts for them
        if (!article.is_fallback) {
            try {
                await fetch('/api/news/articles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: article.id })
                });
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            markAsRead(article.id);
        }

        if (article.source_url && article.source_url !== '#') {
            // Open full page in-app via proxy-based ArticleReaderModal
            setArticleReader({ open: true, url: article.source_url, title: article.title || 'News Article' });
        } else if (!article.is_fallback) {
            router.push(`/hub/article?id=${article.id}`);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // HARDENED: Source boxes come directly from /api/news/source-boxes
    // No client-side filtering - the API guarantees 1 article per source box
    // ═══════════════════════════════════════════════════════════════════════════
    // ?filter=bookmarks must narrow the top grid too — otherwise the "Showing bookmarks
    // only" chip sits above six articles the user never bookmarked.
    const allTopArticles = sourceBoxes.length > 0 ? sourceBoxes : FALLBACK_NEWS.slice(0, 6);
    // Muted sources drop out of the top grid too — the API keys boxes on _sourceName.
    const baseTopArticles = allTopArticles.filter(a => !isMuted(a.source_name || a._sourceName));
    const topArticles = feedFilter === 'bookmarks'
        ? baseTopArticles.filter(a => bookmarks.includes(a.id))
        : baseTopArticles;
    const topArticleIds = topArticles.map(a => a.id);

    // Filter remaining news for "More Stories" section
    const filteredNews = news.filter(article => {
        if (article.source_name === 'Smarter.Poker') return false;
        if (isMuted(article.source_name)) return false;
        if (!VALID_SOURCES.includes(article.source_name) && !article.source_box) return false;
        if (feedFilter === 'bookmarks' && !bookmarks.includes(article.id)) return false;
        if (searchQuery) {
            return article.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                article.content?.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
    });

    // Remaining stories = articles not in the top 6 boxes, with optional source filtering
    const remainingStories = filteredNews.filter(a => {
        if (topArticleIds.includes(a.id)) return false;
        if (activeSourceFilters.length > 0 && !activeSourceFilters.includes(a.source_name)) return false;
        return true;
    });

    // Breaking news = most recent real article from top sources (fallback data never qualifies)
    const breakingNews = news.find(a => !a.is_fallback && a.source_name !== 'Smarter.Poker' && (Date.now() - new Date(a.published_at).getTime()) < 3600000);

    // Trending = sorted by views
    const trendingNews = [...news].filter(a => a.source_name !== 'Smarter.Poker')
        .sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

    // Phase 5: Source article counts for chip badges
    const sourceCounts = {};
    news.forEach(a => { if (a.source_name) sourceCounts[a.source_name] = (sourceCounts[a.source_name] || 0) + 1; });

    // Phase 5: New-since-last-visit helper
    const isNewArticle = (article) => {
        if (!lastVisitTimestamp || !article.published_at) return false;
        return new Date(article.published_at) > lastVisitTimestamp;
    };

    // Phase 5: Reading session stats
    const uniqueSourcesRead = [...new Set(news.filter(a => readArticles.includes(a.id)).map(a => a.source_name))].length;

    // Keyboard navigation (J=next, K=prev, Enter=open)
    // Everything volatile lives in refs so the window listener attaches exactly once
    // instead of tearing down on every render (article arrays get fresh identities).
    const keyNavRef = useRef({ articles: [], focusedIdx: -1, modalOpen: false, openArticle: () => {} });
    keyNavRef.current.articles = [...(topArticles || []), ...(remainingStories || [])];
    keyNavRef.current.focusedIdx = focusedArticleIdx;
    keyNavRef.current.modalOpen = reelViewerOpen || articleReader.open || !!shareArticle || showIntro;
    keyNavRef.current.openArticle = openArticle;
    useEffect(() => {
        const scrollToFocused = () => setTimeout(() => document.querySelector('.keyboard-focused')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        const handleKeyNav = (e) => {
            // Ignore while typing or while any modal/viewer owns the keyboard
            if (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            // Ignore Enter when a button/link/row already has DOM focus — its own
            // handler activates it and this listener must not double-fire
            if (e.key === 'Enter' && (['BUTTON', 'A'].includes(e.target.tagName) || e.target.getAttribute?.('role') === 'button')) return;
            if (keyNavRef.current.modalOpen) return;
            const { articles, focusedIdx } = keyNavRef.current;
            if (e.key === 'j' || e.key === 'J') {
                e.preventDefault();
                setFocusedArticleIdx(prev => Math.min(prev + 1, articles.length - 1));
                scrollToFocused();
            } else if (e.key === 'k' || e.key === 'K') {
                e.preventDefault();
                setFocusedArticleIdx(prev => Math.max(prev - 1, 0));
                scrollToFocused();
            } else if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < articles.length) {
                e.preventDefault();
                keyNavRef.current.openArticle(articles[focusedIdx]);
            }
        };
        window.addEventListener('keydown', handleKeyNav);
        return () => window.removeEventListener('keydown', handleKeyNav);
    }, []);

    // Phase 6: IntersectionObserver for infinite scroll
    const loadMoreRef = useRef(null);
    useEffect(() => {
        if (!loadMoreRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && visibleStories < (remainingStories?.length || 0)) {
                    setVisibleStories(prev => prev + 10);
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [visibleStories, remainingStories?.length]);

    // Phase 6: Time-grouped article helpers
    const getTimeGroup = (publishedAt) => {
        if (!publishedAt) return 'older';
        const now = new Date();
        const pub = new Date(publishedAt);
        const diffH = (now - pub) / 3600000;
        if (diffH < 24) return 'today';
        if (diffH < 48) return 'yesterday';
        if (diffH < 168) return 'this_week';
        return 'older';
    };
    const TIME_GROUP_LABELS = { today: 'Today', yesterday: 'Yesterday', this_week: 'This Week', older: 'Older' };

    return (
        <>
            <PageTransition>
                {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
                {showIntro && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 99999,
                        background: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <video
                            ref={introVideoRef}
                            src="/videos/news-intro.mp4"
                            autoPlay
                            muted
                            playsInline
                            onPlay={handleIntroPlay}
                            onEnded={handleIntroEnd}
                            onError={handleIntroEnd}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain'
                            }}
                        />
                        {/* Skip button */}
                        <button
                            onClick={handleIntroEnd}
                            style={{
                                position: 'absolute',
                                top: 20,
                                right: 20,
                                padding: '8px 20px',
                                background: 'rgba(255,255,255,0.2)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: 20,
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: 'pointer',
                                zIndex: 100000
                            }}
                        >
                            Skip
                        </button>
                    </div>
                )}
                <SEOHead
                    title="Poker News — Latest Headlines & Updates"
                    description="Stay Up To Date With The Latest Poker News, Tournament Results, Industry Updates, And Strategy Articles From Top Sources."
                    canonical="/hub/news"
                />

                <div className="news-hub">
                    {/* Scroll Progress Bar */}
                    <div className="scroll-progress" style={{ width: `${scrollProgress}%` }} />
                    <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

                    {/* Hamburger Menu */}
                    <HamburgerMenu
                        isOpen={menuOpen}
                        onClose={() => setMenuOpen(false)}
                        direction="left"
                        theme="dark"
                        user={null}
                        showProfile={false}
                        menuItems={menuConfig.menuItems}
                        bottomLinks={menuConfig.bottomLinks}
                    />

                    {/* Section Tabs - moved inline above content */}

                    {/* Share Modal */}
                    <AnimatePresence>
                        {shareArticle && (
                            <motion.div
                                className="share-modal-overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShareArticle(null)}
                            >
                                <motion.div
                                    className="share-modal"
                                    role="dialog"
                                    aria-modal="true"
                                    aria-labelledby="share-modal-title"
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <h3 id="share-modal-title">Share Article</h3>
                                    <p>{shareArticle.title}</p>
                                    <div className="share-buttons">
                                        <button autoFocus onClick={() => { shareToTwitter(shareArticle); setShareArticle(null); }}>
                                            <Twitter size={20} /> Twitter
                                        </button>
                                        <button onClick={() => { shareToFacebook(shareArticle); setShareArticle(null); }}>
                                            <Facebook size={20} /> Facebook
                                        </button>
                                        <button onClick={() => { copyLink(shareArticle); setShareArticle(null); }}>
                                            <LinkIcon size={20} /> Copy Link
                                        </button>
                                    </div>
                                    <button className="close-modal" aria-label="Close share dialog" onClick={() => setShareArticle(null)}>×</button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Skeleton Loading State — additive, never exclusive with the layout:
                        the SWR key carries the debounced search term, so `loading` flips back
                        to true on every new search. Unmounting the layout there would destroy
                        the search input (and the filters/sidebar) mid-typing. */}
                    {loading && (
                        <div className="skeleton-grid" aria-hidden="true">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="skeleton-card">
                                    <div className="skeleton-image shimmer" />
                                    <div className="skeleton-content">
                                        <div className="skeleton-line shimmer" style={{ width: '85%' }} />
                                        <div className="skeleton-line shimmer" style={{ width: '60%' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Main Layout */}
                    <div className="layout">
                        {/* Left Column - News Boxes */}
                        <main className="main-content">
                            {/* SMARTER.POKER NEWS Title */}
                            <h1 style={{ textAlign: 'center', margin: '0 0 6px 0', padding: 0, fontSize: '1.6rem', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#5ef5f0', textShadow: '0 0 8px rgba(94,245,240,0.6), 0 0 20px rgba(94,245,240,0.3)', fontFamily: "'Inter', 'Segoe UI', sans-serif", position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '8px' }}>
                                SMARTER.POKER <span style={{ color: '#fff', textShadow: '0 0 8px rgba(255,255,255,0.4)' }}>NEWS</span>
                                {newArticleCount > 0 && (
                                    <span className="new-article-dot">{newArticleCount} new</span>
                                )}
                            </h1>

                            {/* Auto-refresh indicator */}
                            {lastRefreshed && (
                                <div style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    <span>Updated {timeAgo(lastRefreshed)}</span>
                                    <button onClick={() => refreshNews()} style={{ background: 'none', border: 'none', color: '#5ef5f0', cursor: 'pointer', fontSize: '11px', padding: 0, textDecoration: 'underline' }}>Refresh</button>
                                </div>
                            )}

                            {/* Section Tabs — News / Reels (also the way BACK from the reels view) */}
                            <div className="section-tabs" role="tablist" aria-label="News sections">
                                <button
                                    role="tab"
                                    aria-selected={activeSection === 'news'}
                                    className={`section-tab ${activeSection === 'news' ? 'active' : ''}`}
                                    onClick={() => setActiveSection('news')}
                                >
                                    <Newspaper size={14} /> News
                                </button>
                                <button
                                    role="tab"
                                    aria-selected={activeSection === 'reels'}
                                    className={`section-tab ${activeSection === 'reels' ? 'active' : ''}`}
                                    onClick={() => setActiveSection('reels')}
                                >
                                    <Film size={14} /> Reels
                                </button>
                            </div>

                            {/* Breaking News Ticker */}
                            {breakingNews && (
                                <div
                                    className="breaking-ticker"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openArticle(breakingNews)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openArticle(breakingNews); } }}
                                >
                                    <span className="breaking-badge">BREAKING</span>
                                    <span className="breaking-text">{breakingNews.title}</span>
                                </div>
                            )}

                            {/* Bookmarks deep-link filter chip (?filter=bookmarks) */}
                            {feedFilter === 'bookmarks' && (
                                <div className="feed-filter-chip">
                                    <BookmarkCheck size={12} /> Showing bookmarks only
                                    <button onClick={clearFeedFilter}>Clear</button>
                                </div>
                            )}

                            {/* Bookmark feedback toast (sign-in prompt / save errors) */}
                            {bookmarkNotice && (
                                <div className="bookmark-notice" role="status">{bookmarkNotice}</div>
                            )}

                            {/* Source Filter Chips */}
                            <div className="source-filters">
                                {VALID_SOURCES.map(src => (
                                    <button
                                        key={src}
                                        className={`source-chip ${sourceFilters[src] ? 'active' : ''}`}
                                        onClick={() => toggleSource(src)}
                                        style={{ '--source-color': SOURCE_COLORS[src] || '#5ef5f0' }}
                                    >
                                        <span className="chip-dot" />
                                        {src}
                                        {sourceCounts[src] > 0 && <span className="chip-count">{sourceCounts[src]}</span>}
                                    </button>
                                ))}
                                {activeSourceFilters.length > 0 && (
                                    <button className="source-chip clear" onClick={() => setSourceFilters({})}>
                                        Clear
                                    </button>
                                )}
                            </div>

                            {/* Phase 3: Search Bar + View Toggle Row */}
                            <div className="search-view-row">
                                <div className="search-wrapper">
                                    <input
                                        type="text"
                                        className="news-search-input"
                                        placeholder="Search articles..."
                                        value={searchQuery}
                                        role="combobox"
                                        aria-expanded={searchFocused && searchSuggestions.length > 0}
                                        aria-controls="news-search-listbox"
                                        aria-activedescendant={activeSuggestionIdx >= 0 ? `news-suggestion-${activeSuggestionIdx}` : undefined}
                                        aria-autocomplete="list"
                                        onChange={(e) => { setSearchQuery(e.target.value); setActiveSuggestionIdx(-1); }}
                                        onFocus={() => setSearchFocused(true)}
                                        onBlur={() => setTimeout(() => { setSearchFocused(false); setActiveSuggestionIdx(-1); }, 200)}
                                        onKeyDown={(e) => {
                                            if (!searchSuggestions.length) return;
                                            if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setActiveSuggestionIdx(prev => Math.min(prev + 1, searchSuggestions.length - 1));
                                            } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setActiveSuggestionIdx(prev => Math.max(prev - 1, -1));
                                            } else if (e.key === 'Enter' && activeSuggestionIdx >= 0) {
                                                e.preventDefault();
                                                openArticle(searchSuggestions[activeSuggestionIdx]);
                                                setSearchQuery('');
                                                setActiveSuggestionIdx(-1);
                                            } else if (e.key === 'Escape') {
                                                setSearchFocused(false);
                                                setActiveSuggestionIdx(-1);
                                            }
                                        }}
                                    />
                                    {searchFocused && searchSuggestions.length > 0 && (
                                        <div className="search-dropdown" id="news-search-listbox" role="listbox">
                                            {searchSuggestions.map((a, i) => (
                                                <button
                                                    key={a.id}
                                                    id={`news-suggestion-${i}`}
                                                    type="button"
                                                    role="option"
                                                    aria-selected={activeSuggestionIdx === i}
                                                    className={`search-suggestion ${activeSuggestionIdx === i ? 'active' : ''}`}
                                                    onMouseDown={(e) => e.preventDefault() /* keep input focus so blur doesn't race the click */}
                                                    onClick={() => { openArticle(a); setSearchQuery(''); setActiveSuggestionIdx(-1); }}
                                                >
                                                    <span className="suggestion-source" style={{ color: SOURCE_COLORS[a.source_name] || '#5ef5f0' }}>{a.source_name}</span>
                                                    <span className="suggestion-title">{a.title}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="view-toggle">
                                    <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => handleViewModeChange('grid')} title="Grid View">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                                    </button>
                                    <button className={viewMode === 'list' ? 'active' : ''} onClick={() => handleViewModeChange('list')} title="List View">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>
                                    </button>
                                    {bookmarks.length > 0 && (
                                        <span className="bookmark-counter"><BookmarkCheck size={12} /> {bookmarks.length}</span>
                                    )}
                                </div>
                            </div>

                            {/* Phase 5: Reading Stats Bar */}
                            {(readArticles.length > 0 || bookmarks.length > 0) && (
                                <div className="reading-stats-bar">
                                    {readArticles.length > 0 && <span>{readArticles.length} read</span>}
                                    {bookmarks.length > 0 && <span>{bookmarks.length} bookmarked</span>}
                                    {uniqueSourcesRead > 0 && <span>{uniqueSourcesRead} sources explored</span>}
                                </div>
                            )}

                            {activeSection === 'news' && (
                                <>
                                    {/* News Grid - 6 Source-Specific Boxes */}
                                    <section className="news-section">
                                        {feedFilter === 'bookmarks' && topArticles.length === 0 && remainingStories.length === 0 ? (
                                            <div className="no-results">
                                                <BookmarkCheck size={48} />
                                                <p>No bookmarked articles yet</p>
                                                <button onClick={clearFeedFilter}>
                                                    Show all news
                                                </button>
                                            </div>
                                        ) : filteredNews.length === 0 && searchQuery ? (
                                            <div className="no-results">
                                                <Globe size={48} />
                                                <p>No articles found for "{searchQuery}"</p>
                                                <button onClick={() => { setSearchQuery(''); setActiveTab('all'); }}>
                                                    Clear filters
                                                </button>
                                            </div>
                                        ) : (
                                            <div className={viewMode === 'list' ? 'news-grid news-grid-list' : 'news-grid'}>
                                                {topArticles.map((article, index) => (
                                                    <motion.div
                                                        key={article.id}
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: index * 0.06, duration: 0.3 }}
                                                        className={focusedArticleIdx === index ? 'keyboard-focused' : ''}
                                                    >
                                                        <NewsBox
                                                            article={article}
                                                            index={index}
                                                            onOpen={openArticle}
                                                            isBookmarked={bookmarks.includes(article.id)}
                                                            onBookmark={toggleBookmark}
                                                            onShare={handleShare}
                                                            isRead={readArticles.includes(article.id)}
                                                        />
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Infinite Scroll More Stories */}
                                        {remainingStories.length > 0 && (
                                            <div className="more-stories-section">
                                                <h2 className="section-title" style={{ fontSize: '14px', margin: '16px 0 8px' }}>
                                                    <Newspaper size={16} /> {activeSourceFilters.length > 0 ? `Filtered Stories (${remainingStories.length})` : `More Stories (${remainingStories.length})`}
                                                </h2>
                                                <div className="news-list">
                                                {(() => {
                                                    let lastGroup = '';
                                                    return remainingStories.slice(0, visibleStories).map((article, storyIndex) => {
                                                        const group = getTimeGroup(article.published_at);
                                                        const showHeader = group !== lastGroup;
                                                        lastGroup = group;
                                                        const isKeyFocused = focusedArticleIdx === topArticles.length + storyIndex;
                                                        return (
                                                            <React.Fragment key={article.id}>
                                                                {showHeader && (
                                                                    <div className="time-group-header">
                                                                        {TIME_GROUP_LABELS[group]}
                                                                    </div>
                                                                )}
                                                                <motion.div
                                                                    className={`news-list-item ${readArticles.includes(article.id) ? 'read' : ''} ${isKeyFocused ? 'keyboard-focused' : ''}`}
                                                                    whileHover={{ x: 4 }}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onClick={() => openArticle(article)}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openArticle(article); } }}
                                                                >
                                                                    {isNewArticle(article) && (
                                                                        <span className="new-badge">NEW</span>
                                                                    )}
                                                                    {(article.views || 0) > 50 && (
                                                                        <span className="trending-badge" title="Trending"><TrendingUp size={11} /></span>
                                                                    )}
                                                                    <img
                                                                        src={article.image_url ? (article.image_url.includes('cardplayer.com') ? `/api/proxy?url=${encodeURIComponent(article.image_url)}` : article.image_url) : (FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news)}
                                                                        alt=""
                                                                        className="list-thumb"
                                                                        loading="lazy"
                                                                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_IMAGES.news; }}
                                                                    />
                                                                    <div className="list-content">
                                                                        <h4>{article.title}</h4>
                                                                        <div className="list-meta">
                                                                            <span style={{ color: SOURCE_COLORS[article.source_name] || '#888' }}>{article.source_name || 'Source'}</span>
                                                                            <span>•</span>
                                                                            <span>{timeAgo(article.published_at)}</span>
                                                                            {article.category && <span className="category-pill" style={{ background: `rgba(${article.category === 'tournament' ? '251,191,36' : article.category === 'strategy' ? '124,58,237' : article.category === 'industry' ? '34,197,94' : '59,130,246'}, 0.2)`, color: article.category === 'tournament' ? '#fbbf24' : article.category === 'strategy' ? '#a78bfa' : article.category === 'industry' ? '#22c55e' : '#3b82f6' }}>{article.category}</span>}
                                                                            {(article.views || 0) > 0 && <><span>•</span><span><Eye size={10} /> {formatViews(article.views)}</span></>}
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="list-actions"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onKeyDown={(e) => e.stopPropagation() /* row handler would swallow Enter/Space on these buttons */}
                                                                    >
                                                                        <button onClick={(e) => { e.stopPropagation(); toggleBookmark(article.id, article); }} title="Bookmark">
                                                                            {bookmarks.includes(article.id) ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                                                                        </button>
                                                                        <button onClick={(e) => { e.stopPropagation(); handleShare(article); }} title="Share">
                                                                            <Share2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                </motion.div>
                                                            </React.Fragment>
                                                        );
                                                    });
                                                })()}
                                                </div>
                                                {/* Phase 6: IntersectionObserver sentinel replaces Load More */}
                                                {visibleStories < remainingStories.length && (
                                                    <div ref={loadMoreRef} className="load-more-sentinel">
                                                        <div className="loading-spinner" />
                                                        <span>Loading more stories...</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </section>

                                    {/* Reels Preview Section - Shows on News tab */}
                                    <section className="reels-preview-section">
                                        <div className="section-header-row">
                                            <h2 className="section-title">
                                                <Film size={18} /> Poker Reels
                                            </h2>
                                            <button
                                                className="see-all-btn"
                                                onClick={() => setActiveSection('reels')}
                                            >
                                                See All <ChevronRight size={13} style={{ verticalAlign: '-2px' }} />
                                            </button>
                                        </div>
                                        {reels.length > 0 ? (
                                            <div className="reels-carousel-wrapper">
                                                <button className="carousel-arrow carousel-left" aria-label="Scroll reels left" onClick={() => reelsCarouselRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}>
                                                    <ChevronLeft size={20} />
                                                </button>
                                                <div className="reels-carousel" ref={reelsCarouselRef}>
                                                    {reels.slice(0, 10).map((reel, idx) => (
                                                        <ReelCard key={reel.id} reel={reel} onClick={() => openReelViewer(idx)} />
                                                    ))}
                                                </div>
                                                <button className="carousel-arrow carousel-right" aria-label="Scroll reels right" onClick={() => reelsCarouselRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}>
                                                    <ChevronRight size={20} />
                                                </button>
                                            </div>
                                        ) : reelsLoading ? (
                                            <div className="reels-empty-state">
                                                <div className="loading-spinner" />
                                                <span>Loading reels...</span>
                                            </div>
                                        ) : reelsError ? (
                                            <div className="reels-empty-state">
                                                <span>Could not load reels.</span>
                                                <button onClick={() => refreshReels()}>Retry</button>
                                            </div>
                                        ) : (
                                            <div className="reels-empty-state">
                                                <span>No reels yet — check back soon.</span>
                                            </div>
                                        )}
                                    </section>
                                </>
                            )}
                            
                            {activeSection === 'reels' && (
                                /* Reels Section - Full View */
                                <section className="reels-section">
                                    <h2 className="section-title">
                                        <Film size={18} /> Poker Reels
                                    </h2>
                                    <p className="section-desc">
                                        Short-form poker content from top YouTube channels - updated daily
                                    </p>

                                    {reels.length === 0 ? (
                                        <div className="no-results">
                                            <Film size={48} />
                                            <p>No Reels Available Yet. Check Back Soon!</p>
                                        </div>
                                    ) : (
                                        <div className="reels-grid">
                                            {reels.map((reel, idx) => (
                                                <ReelCard
                                                    key={reel.id || reel.youtube_id}
                                                    reel={reel}
                                                    onClick={() => openReelViewer(idx)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )}

                            {activeSection === 'videos' && (
                                <section className="videos-section" style={{ padding: '20px 0' }}>
                                    <h2 className="section-title">
                                        <PlayCircle size={18} /> Poker Videos
                                    </h2>
                                    <p className="section-desc">
                                        The latest video content from top poker channels.
                                    </p>
                                    {videos.length === 0 ? (
                                        <div className="no-results">
                                            <PlayCircle size={48} />
                                            <p>No Videos Available Yet.</p>
                                        </div>
                                    ) : (
                                        <div className="videos-grid">
                                            {videos.map(video => (
                                                <VideoCard key={video.id || video.youtube_id} video={video} />
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )}

                            {activeSection === 'events' && (
                                <section className="events-section" style={{ padding: '20px 0' }}>
                                    <h2 className="section-title">
                                        <Calendar size={18} /> Upcoming Events
                                    </h2>
                                    <div className="events-list-full" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {events.map(event => (
                                            <div key={event.id} className="event-row" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px' }}>
                                                <div className="event-date" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '8px 16px', borderRadius: '8px', textAlign: 'center', minWidth: '80px' }}>
                                                    <div className="month" style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>{new Date(event.event_date || new Date()).toLocaleString('default', { month: 'short' })}</div>
                                                    <div className="day" style={{ fontSize: '24px', fontWeight: 'bold' }}>{new Date(event.event_date || new Date()).getDate()}</div>
                                                </div>
                                                <div className="event-details" style={{ flex: 1 }}>
                                                    <h4 style={{ margin: '0 0 4px', fontSize: '16px' }}>{event.name || 'Event'}</h4>
                                                    <p style={{ margin: 0, color: '#888', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {event.location || 'TBA'}</p>
                                                </div>
                                                {(event.buy_in || event.guarantee) && (
                                                    <div className="event-meta" style={{ textAlign: 'right' }}>
                                                        {event.buy_in && <div className="buy-in" style={{ color: '#22c55e', fontWeight: 'bold' }}>{event.buy_in}</div>}
                                                        {event.guarantee && <div className="guarantee" style={{ color: '#fbbf24', fontSize: '12px' }}>{event.guarantee}</div>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {events.length === 0 && (
                                            <div className="no-results">
                                                <Calendar size={48} />
                                                <p>No Events Available Yet.</p>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {(activeSection === 'bookmarks' || activeSection === 'later') && (
                                <section className="news-section">
                                    <h2 className="section-title" style={{ padding: '0 20px', marginBottom: '20px' }}>
                                        {activeSection === 'bookmarks' ? <BookmarkCheck size={18} /> : <Clock size={18} />}
                                        {activeSection === 'bookmarks' ? ' Bookmarked Articles' : ' Read Later'}
                                    </h2>
                                    <div className={viewMode === 'list' ? 'news-grid news-grid-list' : 'news-grid'}>
                                        {news.filter(a => activeSection === 'bookmarks' ? bookmarks.includes(a.id) : readArticles.includes(a.id)).map((article, index) => (
                                            <NewsBox
                                                key={article.id}
                                                article={article}
                                                index={index}
                                                onOpen={openArticle}
                                                isBookmarked={bookmarks.includes(article.id)}
                                                onBookmark={toggleBookmark}
                                                onShare={handleShare}
                                                isRead={readArticles.includes(article.id)}
                                            />
                                        ))}
                                        {news.filter(a => activeSection === 'bookmarks' ? bookmarks.includes(a.id) : readArticles.includes(a.id)).length === 0 && (
                                            <div className="no-results" style={{ gridColumn: '1 / -1' }}>
                                                <p>No articles found in {activeSection === 'bookmarks' ? 'Bookmarks' : 'Read Later'}.</p>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}
                        </main>

                        {/* Right Sidebar */}
                        <aside className="sidebar">
                            {/* MSPT News & Updates - Dedicated Box */}
                            <div className="widget mspt">
                                <h4><Trophy size={14} /> MSPT News & Updates{msptNews[0]?.is_fallback && <span className="sample-tag">Sample</span>}</h4>
                                <ul className="mspt-list">
                                    {msptNews.map((item) => {
                                        const clickable = !!(item.source_url && item.source_url !== '#');
                                        // Route through openArticle so MSPT items get the same
                                        // reader modal, read-state, and view tracking as the feed
                                        const open = () => clickable && openArticle(item);
                                        return (
                                            <li
                                                key={item.id}
                                                role={clickable ? 'button' : undefined}
                                                tabIndex={clickable ? 0 : undefined}
                                                onClick={open}
                                                onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } }}
                                            >
                                                <div className="mspt-item">
                                                    <span className="mspt-title">{item.title}</span>
                                                    <div className="mspt-meta">
                                                        <span className="mspt-time">{timeAgo(item.published_at)}</span>
                                                        {item.prize_pool && (
                                                            <span className="mspt-prize">{item.prize_pool}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                                <a
                                    href="https://msptpoker.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mspt-link"
                                >
                                    Visit MSPT Official Site <ExternalLink size={12} />
                                </a>
                            </div>

                            {/* Trending */}
                            <div className="widget">
                                <h4><TrendingUp size={14} /> Trending</h4>
                                <ul className="trending-list">
                                    {trendingNews.map((article, i) => (
                                        <li
                                            key={article.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => openArticle(article)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openArticle(article); } }}
                                        >
                                            <span className={`rank ${i < 3 ? `rank-medal medal-${i + 1}` : ''}`}>{i + 1}</span>
                                            <img
                                                src={article.image_url || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news}
                                                alt=""
                                                className="trend-thumb"
                                                loading="lazy"
                                                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_IMAGES.news; }}
                                            />
                                            <span className="title">{article.title}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Player of the Year */}
                            <div className="widget leaderboard">
                                <h4><Trophy size={14} /> Player Of The Year{!(leaderboardData?.success && leaderboardData.data?.length) && <span className="sample-tag">Sample</span>}</h4>
                                <ul>
                                    {leaderboard.map((player, i) => (
                                        <li key={player.id || i}>
                                            <span className={`medal medal-${i + 1}`}>{i + 1}</span>
                                            <span className="name">{player.player_name}</span>
                                            <span className="points">{(player.points || 0).toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Upcoming Events */}
                            <Link href="/hub/poker-near-me/lobby">
                                <div className="widget events">
                                    <h4><MapPin size={14} /> Poker Near Me{!(eventsData?.success && eventsData.data?.length) && <span className="sample-tag">Sample</span>}</h4>
                                    <ul className="events-list">
                                        {events.map(event => (
                                            <li key={event.id}>
                                                <span>{event.name}</span>
                                                <span className="date">{formatEventDate(event.event_date)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="view-all">
                                        View All Events <ExternalLink size={12} />
                                    </div>
                                </div>
                            </Link>

                            {/* Newsletter Signup */}
                            <div className="widget newsletter">
                                <h4><Mail size={14} /> Newsletter</h4>
                                {subscribed ? (
                                    <div className="subscribed">
                                        <CheckCircle size={16} /> {subscribeMessage || 'Subscribed!'}
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubscribe}>
                                        <input
                                            type="email"
                                            placeholder="Your email"
                                            value={email}
                                            aria-label="Email address"
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                        <button type="submit" disabled={subscribing}>
                                            {subscribing ? 'Joining...' : 'Join'}
                                        </button>
                                    </form>
                                )}
                                {subscribeError && <div className="error" role="alert">{subscribeError}</div>}
                            </div>

                            {/* Phase 3: Reading History Widget — most recently read first
                                (readArticles is append-ordered, so reverse = recency order) */}
                            {readArticles.length > 0 && (
                                <div className="widget reading-history">
                                    <h4><Eye size={14} /> Recently Read</h4>
                                    <ul className="history-list">
                                        {[...readArticles].reverse()
                                            .map(id => news.find(a => a.id === id))
                                            .filter(Boolean)
                                            .slice(0, 5)
                                            .map(a => (
                                                <li
                                                    key={a.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => openArticle(a)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openArticle(a); } }}
                                                >
                                                    <CheckCircle size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
                                                    <span>{a.title?.slice(0, 50)}{a.title?.length > 50 ? '...' : ''}</span>
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                        </aside>
                    </div>

                    {/* Phase 3: Scroll-to-Top FAB */}
                    <AnimatePresence>
                        {showScrollTop && (
                            <motion.button
                                className="scroll-to-top-fab"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                title="Back to Top"
                            >
                                <ChevronUp size={22} />
                            </motion.button>
                        )}
                    </AnimatePresence>

                    <style>{`
                    .news-hub {
                        min-height: 100vh; padding-bottom: 70px;
                        background: #18191A;
                        color: #E4E6EB;
                        font-family: 'Inter', -apple-system, sans-serif;
                        max-width: 100%;
                        overflow-x: hidden;
                        box-sizing: border-box;
                        padding-top: env(safe-area-inset-top, 0px); /* Mobile notch */
                        padding-left: env(safe-area-inset-left, 0px);
                        padding-right: env(safe-area-inset-right, 0px);
                    }

                    /* ===============================================================
                       SOCIAL MEDIA FORMULA - Page Container (Mobile-First)
                       Mirrors the scaling used in social-media.js for perfect mobile fit
                       =============================================================== */
                    @media (max-width: 768px) {
                        .news-hub {
                            width: 100% !important;
                            max-width: 100vw !important;
                            padding: 0 !important;
                            margin: 0 !important;
                            overflow-x: hidden !important;
                        }

                        .layout {
                            display: block !important;
                            padding: 0 !important;
                            max-width: 100vw !important;
                            width: 100% !important;
                        }

                        .section-tabs {
                            width: 100% !important;
                            justify-content: center !important;
                            padding: 0 12px !important;
                        }

                        .section-tab {
                            flex: 1 1 0;
                            justify-content: center;
                        }

                        .main-content {
                            padding: 0 !important;
                            width: 100% !important;
                            max-width: 100vw !important;
                        }

                        .news-section {
                            padding: 0 !important;
                            margin: 0 !important;
                            width: 100% !important;
                        }

                        .section-title {
                            padding: 0 16px !important;
                            margin: 0 !important;
                        }

                        .sidebar {
                            display: none !important;
                        }
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* SECTION TABS (News / Reels)                     */
                    /* ═══════════════════════════════════════════════ */
                    .section-tabs {
                        display: flex;
                        gap: 8px;
                        align-items: center;
                        justify-content: center;
                        padding: 0;
                        margin: 0 0 12px;
                    }

                    .section-tab {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 20px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                        color: #B0B3B8;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .section-tab:hover {
                        background: rgba(255, 255, 255, 0.1);
                        color: #E4E6EB;
                    }

                    .section-tab.active {
                        background: rgba(94, 245, 240, 0.12);
                        border-color: rgba(94, 245, 240, 0.5);
                        color: #5ef5f0;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* FEED FILTER CHIP + BOOKMARK TOAST               */
                    /* ═══════════════════════════════════════════════ */
                    .feed-filter-chip {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 6px 12px;
                        margin-bottom: 10px;
                        background: rgba(94, 245, 240, 0.08);
                        border: 1px solid rgba(94, 245, 240, 0.3);
                        border-radius: 10px;
                        color: #5ef5f0;
                        font-size: 12px;
                        font-weight: 600;
                    }

                    .feed-filter-chip button {
                        margin-left: auto;
                        padding: 3px 10px;
                        background: rgba(255, 255, 255, 0.08);
                        border: none;
                        border-radius: 6px;
                        color: #fff;
                        font-size: 11px;
                        cursor: pointer;
                        transition: background 0.15s;
                    }

                    .feed-filter-chip button:hover {
                        background: rgba(255, 255, 255, 0.16);
                    }

                    .bookmark-notice {
                        padding: 8px 12px;
                        margin-bottom: 10px;
                        background: rgba(251, 191, 36, 0.1);
                        border: 1px solid rgba(251, 191, 36, 0.35);
                        border-radius: 10px;
                        color: #fbbf24;
                        font-size: 12px;
                        font-weight: 600;
                        text-align: center;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* SKELETON SHIMMER LOADING */
                    /* ═══════════════════════════════════════════════ */
                    .skeleton-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                        padding: 15px;
                        max-width: 1400px;
                        margin: 0 auto;
                    }
                    .skeleton-card {
                        background: #1a1c1e;
                        border-radius: 16px;
                        overflow: hidden;
                        border: 2px solid rgba(180,195,220,0.2);
                    }
                    .skeleton-image {
                        height: 200px;
                        background: #252729;
                    }
                    .skeleton-content {
                        padding: 14px;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    .skeleton-line {
                        height: 14px;
                        border-radius: 6px;
                        background: #252729;
                    }
                    .shimmer {
                        background: linear-gradient(90deg, #252729 25%, #2d3033 50%, #252729 75%);
                        background-size: 200% 100%;
                        animation: shimmer 1.5s ease-in-out infinite;
                    }
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                    @media (max-width: 768px) {
                        .skeleton-grid { grid-template-columns: 1fr; padding: 8px; }
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* BREAKING NEWS TICKER */
                    /* ═══════════════════════════════════════════════ */
                    .breaking-ticker {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 8px 14px;
                        margin-bottom: 10px;
                        background: rgba(229, 57, 53, 0.1);
                        border: 1px solid rgba(229, 57, 53, 0.4);
                        border-radius: 10px;
                        cursor: pointer;
                        transition: all 0.2s;
                        overflow: hidden;
                    }
                    .breaking-ticker:hover {
                        background: rgba(229, 57, 53, 0.2);
                    }
                    .breaking-badge {
                        flex-shrink: 0;
                        padding: 2px 8px;
                        background: #e53935;
                        color: #fff;
                        font-size: 10px;
                        font-weight: 800;
                        letter-spacing: 1px;
                        border-radius: 4px;
                        animation: pulse-badge 2s ease-in-out infinite;
                    }
                    @keyframes pulse-badge {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.6; }
                    }
                    .breaking-text {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.85);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* SOURCE FILTER CHIPS */
                    /* ═══════════════════════════════════════════════ */
                    .source-filters {
                        display: flex;
                        gap: 6px;
                        flex-wrap: wrap;
                        margin-bottom: 10px;
                        justify-content: center;
                    }
                    .source-chip {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        padding: 4px 10px;
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 16px;
                        color: rgba(255, 255, 255, 0.55);
                        font-size: 11px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .source-chip:hover {
                        background: rgba(255, 255, 255, 0.08);
                        color: #fff;
                    }
                    .source-chip.active {
                        background: color-mix(in srgb, var(--source-color) 20%, transparent);
                        border-color: var(--source-color);
                        color: var(--source-color);
                    }
                    .source-chip.clear {
                        color: #e53935;
                        border-color: rgba(229, 57, 53, 0.3);
                    }
                    .chip-dot {
                        width: 6px;
                        height: 6px;
                        border-radius: 50%;
                        background: var(--source-color);
                        flex-shrink: 0;
                    }
                    .chip-count {
                        background: rgba(255,255,255,0.08);
                        padding: 0 5px;
                        border-radius: 8px;
                        font-size: 10px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.5);
                        margin-left: 2px;
                    }
                    .source-chip.active .chip-count {
                        background: color-mix(in srgb, var(--source-color) 30%, transparent);
                        color: var(--source-color);
                    }
                    .reading-stats-bar {
                        display: flex;
                        gap: 16px;
                        padding: 6px 12px;
                        background: rgba(94,245,240,0.05);
                        border-radius: 8px;
                        margin-bottom: 8px;
                        font-size: 11px;
                        color: rgba(255,255,255,0.45);
                        align-items: center;
                        justify-content: center;
                        border: 1px solid rgba(94,245,240,0.08);
                    }
                    .new-badge {
                        position: absolute;
                        top: 6px;
                        left: 6px;
                        background: linear-gradient(135deg, #00d4ff, #5ef5f0);
                        color: #000;
                        font-size: 8px;
                        font-weight: 800;
                        padding: 2px 6px;
                        border-radius: 4px;
                        letter-spacing: 1px;
                        z-index: 5;
                        text-transform: uppercase;
                    }
                    .category-pill {
                        padding: 1px 6px;
                        border-radius: 6px;
                        font-size: 9px;
                        font-weight: 600;
                        text-transform: capitalize;
                        letter-spacing: 0.3px;
                    }
                    .news-list-item .list-actions {
                        display: flex;
                        gap: 4px;
                        align-items: center;
                        margin-left: auto;
                        flex-shrink: 0;
                        opacity: 0;
                        transition: opacity 0.2s;
                    }
                    .news-list-item:hover .list-actions,
                    .news-list-item:focus-within .list-actions {
                        opacity: 1;
                    }
                    .news-list-item .list-actions button {
                        background: rgba(255,255,255,0.06);
                        border: none;
                        color: rgba(255,255,255,0.5);
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 6px;
                        transition: all 0.15s;
                        display: flex;
                        align-items: center;
                    }
                    .news-list-item .list-actions button:hover {
                        background: rgba(94,245,240,0.15);
                        color: #5ef5f0;
                    }
                    .news-list-item.read {
                        opacity: 0.6;
                    }
                    .news-list-item.read:hover {
                        opacity: 1;
                    }
                    .time-group-header {
                        font-size: 11px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 1.5px;
                        color: rgba(94,245,240,0.6);
                        padding: 10px 0 4px;
                        margin-top: 6px;
                        border-top: 1px solid rgba(94,245,240,0.08);
                    }
                    .time-group-header:first-child {
                        border-top: none;
                        margin-top: 0;
                    }
                    .load-more-sentinel {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 16px;
                        color: rgba(255,255,255,0.55);
                        font-size: 12px;
                    }
                    .loading-spinner {
                        width: 16px;
                        height: 16px;
                        border: 2px solid rgba(94,245,240,0.2);
                        border-top-color: #5ef5f0;
                        border-radius: 50%;
                        animation: spin 0.8s linear infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    /* Focus ring lives on the inner card (.news-box) for grid items and on
                       the row itself for list items — never both, no double ring */
                    .news-list-item.keyboard-focused {
                        outline: 2px solid #5ef5f0;
                        outline-offset: 2px;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* TRENDING BADGE */
                    /* ═══════════════════════════════════════════════ */
                    .trending-badge {
                        position: absolute;
                        top: 4px;
                        left: 4px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        background: rgba(251, 146, 60, 0.18);
                        color: #fb923c;
                        z-index: 2;
                    }
                    .news-list-item {
                        position: relative;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* DARK MODE IMAGE VIGNETTE */
                    /* ═══════════════════════════════════════════════ */
                    .box-overlay {
                        background: linear-gradient(
                            to bottom,
                            transparent 40%,
                            rgba(0, 0, 0, 0.7) 100%
                        ) !important;
                    }
                    .list-thumb {
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 2: SCROLL PROGRESS BAR */
                    /* ═══════════════════════════════════════════════ */
                    .scroll-progress {
                        position: fixed;
                        top: 0;
                        left: 0;
                        height: 3px;
                        background: linear-gradient(90deg, #5ef5f0, #00d4ff);
                        z-index: 9999; /* Below modals (share 10000, viewers 99999) */
                        transition: width 0.1s linear;
                        box-shadow: 0 0 8px rgba(94, 245, 240, 0.5);
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 2: SOURCE ACCENT LEFT STRIPE */
                    /* ═══════════════════════════════════════════════ */
                    .news-box::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 4px;
                        height: 100%;
                        background: var(--src-accent, #5ef5f0);
                        z-index: 101;
                        border-radius: 16px 0 0 16px;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 2: READING TIME BADGE */
                    /* ═══════════════════════════════════════════════ */
                    .read-time-badge {
                        position: absolute;
                        bottom: 12px;
                        right: 12px;
                        display: flex;
                        align-items: center;
                        gap: 3px;
                        padding: 3px 7px;
                        background: rgba(0, 0, 0, 0.75);
                        backdrop-filter: blur(4px);
                        border-radius: 6px;
                        font-size: 10px;
                        font-weight: 500;
                        color: rgba(255, 255, 255, 0.8);
                        z-index: 10;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 2: ARTICLE EXCERPT */
                    /* ═══════════════════════════════════════════════ */
                    .box-excerpt {
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.45);
                        margin: 2px 0 4px;
                        line-height: 1.4;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 2: NEW ARTICLE NOTIFICATION DOT */
                    /* ═══════════════════════════════════════════════ */
                    .new-article-dot {
                        font-size: 10px;
                        font-weight: 700;
                        padding: 2px 8px;
                        background: #e53935;
                        color: #fff;
                        border-radius: 10px;
                        letter-spacing: 0.5px;
                        text-transform: uppercase;
                        text-shadow: none;
                        animation: pulse-badge 2s ease-in-out infinite;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 2: REELS CAROUSEL ARROWS */
                    /* ═══════════════════════════════════════════════ */
                    .reels-carousel-wrapper {
                        position: relative;
                    }
                    .carousel-arrow {
                        position: absolute;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(0, 0, 0, 0.7);
                        backdrop-filter: blur(8px);
                        border: 1px solid rgba(255, 255, 255, 0.15);
                        border-radius: 50%;
                        color: #fff;
                        cursor: pointer;
                        transition: all 0.2s;
                        z-index: 10;
                    }
                    .carousel-arrow:hover {
                        background: rgba(94, 245, 240, 0.3);
                        border-color: #5ef5f0;
                    }
                    .carousel-left { left: -12px; }
                    .carousel-right { right: -12px; }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 2: TRENDING MEDAL STYLING (styled rank badges, no emoji) */
                    /* ═══════════════════════════════════════════════ */
                    .rank.rank-medal {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        font-size: 11px;
                        font-weight: 800;
                        flex-shrink: 0;
                    }
                    .rank.rank-medal.medal-1 {
                        background: linear-gradient(135deg, #fbbf24, #d97706);
                        color: #1a1c1e;
                    }
                    .rank.rank-medal.medal-2 {
                        background: linear-gradient(135deg, #e5e7eb, #9ca3af);
                        color: #1a1c1e;
                    }
                    .rank.rank-medal.medal-3 {
                        background: linear-gradient(135deg, #d97706, #92400e);
                        color: #fff;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 3: SEARCH BAR + VIEW TOGGLE ROW */
                    /* ═══════════════════════════════════════════════ */
                    .search-view-row {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin: 10px 0 12px;
                    }
                    .search-wrapper {
                        flex: 1;
                        position: relative;
                    }
                    .news-search-input {
                        width: 100%;
                        padding: 10px 14px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.12);
                        border-radius: 10px;
                        color: #E4E6EB;
                        font-size: 13px;
                        font-family: inherit;
                        outline: none;
                        transition: border-color 0.2s, box-shadow 0.2s;
                        box-sizing: border-box;
                    }
                    .news-search-input:focus {
                        border-color: #5ef5f0;
                        box-shadow: 0 0 0 2px rgba(94, 245, 240, 0.15);
                    }
                    .news-search-input::placeholder {
                        color: rgba(255, 255, 255, 0.3);
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 3: SEARCH AUTOCOMPLETE DROPDOWN */
                    /* ═══════════════════════════════════════════════ */
                    .search-dropdown {
                        position: absolute;
                        top: calc(100% + 4px);
                        left: 0;
                        right: 0;
                        background: #242526;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                        overflow: hidden;
                        z-index: 100;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                    }
                    .search-suggestion {
                        display: flex;
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 2px;
                        width: 100%;
                        padding: 10px 14px;
                        background: transparent;
                        border: none;
                        font-family: inherit;
                        text-align: left;
                        cursor: pointer;
                        transition: background 0.15s;
                    }
                    .search-suggestion:hover,
                    .search-suggestion.active {
                        background: rgba(94, 245, 240, 0.08);
                    }
                    .suggestion-source {
                        font-size: 10px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .suggestion-title {
                        font-size: 12px;
                        color: #E4E6EB;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 3: VIEW MODE TOGGLE */
                    /* ═══════════════════════════════════════════════ */
                    .view-toggle {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        padding: 2px;
                    }
                    .view-toggle button {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 32px;
                        height: 32px;
                        border: none;
                        border-radius: 6px;
                        background: transparent;
                        color: rgba(255, 255, 255, 0.4);
                        cursor: pointer;
                        transition: all 0.15s;
                    }
                    .view-toggle button.active {
                        background: rgba(94, 245, 240, 0.15);
                        color: #5ef5f0;
                    }
                    .view-toggle button:hover:not(.active) {
                        color: rgba(255, 255, 255, 0.7);
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 3: GRID-LIST VIEW MODE */
                    /* ═══════════════════════════════════════════════ */
                    .news-grid-list {
                        grid-template-columns: 1fr !important;
                    }
                    .news-grid-list .news-box {
                        flex-direction: row;
                        height: auto;
                        min-height: 100px;
                    }
                    .news-grid-list .box-image {
                        width: 140px;
                        height: 100px;
                        flex-shrink: 0;
                    }
                    .news-grid-list .box-content {
                        padding: 10px 14px;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 3: KEYBOARD FOCUS HIGHLIGHT */
                    /* ═══════════════════════════════════════════════ */
                    .keyboard-focused .news-box {
                        outline: 2px solid #5ef5f0;
                        outline-offset: 2px;
                        box-shadow: 0 0 16px rgba(94, 245, 240, 0.3);
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 3: SCROLL-TO-TOP FAB */
                    /* ═══════════════════════════════════════════════ */
                    .scroll-to-top-fab {
                        position: fixed;
                        /* Sits above the fixed BottomNavBar (70px) + breathing room */
                        bottom: calc(84px + env(safe-area-inset-bottom, 0px));
                        right: 24px;
                        width: 48px;
                        height: 48px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(30, 32, 38, 0.95);
                        border: 1px solid rgba(94, 245, 240, 0.4);
                        border-radius: 50%;
                        color: #5ef5f0;
                        cursor: pointer;
                        z-index: 1000;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 12px rgba(94, 245, 240, 0.2);
                        backdrop-filter: blur(8px);
                        transition: all 0.2s;
                    }
                    .scroll-to-top-fab:hover {
                        background: rgba(94, 245, 240, 0.15);
                        transform: translateY(-2px);
                        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5), 0 0 20px rgba(94, 245, 240, 0.4);
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 3: BOOKMARK COUNTER BADGE */
                    /* ═══════════════════════════════════════════════ */
                    .bookmark-counter {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 4px 8px;
                        font-size: 11px;
                        font-weight: 600;
                        color: #5ef5f0;
                        background: rgba(94, 245, 240, 0.08);
                        border-radius: 6px;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* PHASE 3: READING HISTORY WIDGET */
                    /* ═══════════════════════════════════════════════ */
                    .history-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    .history-list li {
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        font-size: 12px;
                        color: rgba(255, 255, 255, 0.6);
                        cursor: pointer;
                        padding: 4px 0;
                        transition: color 0.15s;
                    }
                    .history-list li:hover {
                        color: #5ef5f0;
                    }

                    .layout {
                        display: grid;
                        grid-template-columns: 1fr 320px;
                        gap: 15px;
                        padding: 10px; /* Reduced from 15px */
                        max-width: 1400px;
                        margin: 0 auto;
                    }

                    @media (max-width: 1000px) {
                        .layout {
                            grid-template-columns: 1fr;
                        }
                        .sidebar {
                            display: none;
                        }
                    }

                    /* News Section */
                    .news-section {
                        margin-bottom: 15px;
                    }

                    .section-title {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font-size: 18px;
                        font-weight: 700;
                        margin-bottom: 15px;
                        color: #fff;
                    }




                    .section-title svg {
                        color: #2374E1;
                    }

                    .section-desc {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.5);
                        margin-bottom: 20px;
                    }

                    /* News Grid - 6 uniform boxes in 2x3 format */
                    .news-grid {
                        position: relative;
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                        padding: 15px;
                        border: none;
                        border-radius: 16px;
                        background: #1a1c1e;
                        box-shadow: 
                            inset 0 0 0 3px rgba(180, 195, 220, 0.4),
                            inset 0 0 0 6px rgba(100, 115, 140, 0.2),
                            0 8px 32px rgba(0, 0, 0, 0.6);
                    }

                    .news-grid::before {
                        content: '';
                        position: absolute;
                        inset: -3px;
                        border-radius: 18px;
                        background: linear-gradient(135deg, 
                            rgba(200, 210, 230, 0.5) 0%, 
                            rgba(120, 140, 170, 0.3) 25%,
                            rgba(80, 100, 130, 0.2) 50%,
                            rgba(120, 140, 170, 0.3) 75%,
                            rgba(200, 210, 230, 0.5) 100%);
                        z-index: -1;
                        pointer-events: none;
                    }

                    /* Force all GRID boxes to the same size — list mode keeps natural
                       row heights (:not scope stops the 340px lock from breaking it) */
                    .news-grid:not(.news-grid-list) > * {
                        height: 340px !important;
                        min-height: 340px !important;
                        max-height: 340px !important;
                    }

                    .news-grid:not(.news-grid-list) .news-box {
                        height: 340px !important;
                        min-height: 340px !important;
                        max-height: 340px !important;
                    }

                    @media (max-width: 768px) {
                        /* CRITICAL: Override the 340px grid height lock on mobile.
                           Must repeat the :not(.news-grid-list) scope — media queries add no
                           specificity, so a bare .news-grid selector loses to the lock above.
                           (The card frame/image/typography overrides live in the single
                           global mobile block near the end of the file.) */
                        .news-grid:not(.news-grid-list) > *,
                        .news-grid:not(.news-grid-list) .news-box,
                        .news-grid > *,
                        .news-grid .news-box {
                            height: auto !important;
                            min-height: auto !important;
                            max-height: none !important;
                        }
                    }

                    .no-results {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        padding: 60px;
                        color: rgba(255, 255, 255, 0.55);
                        text-align: center;
                    }

                    .no-results button {
                        padding: 8px 16px;
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        border-radius: 6px;
                        color: #fff;
                        cursor: pointer;
                    }

                    /* More Stories List */
                    .more-stories-section {
                        margin-top: 24px;
                    }

                    .news-list {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }

                    .news-list-item {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.02);
                        border: 1px solid rgba(255, 255, 255, 0.04);
                        border-radius: 10px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .news-list-item:hover {
                        background: rgba(255, 255, 255, 0.04);
                        border-color: rgba(0, 212, 255, 0.2);
                    }

                    .list-thumb {
                        width: 60px;
                        height: 45px;
                        border-radius: 6px;
                        object-fit: cover;
                    }

                    .list-content {
                        flex: 1;
                    }

                    .list-content h4 {
                        font-size: 13px;
                        font-weight: 600;
                        color: #fff;
                        margin-bottom: 4px;
                    }

                    .list-meta {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.55);
                    }

                    /* Reels Preview Section (on News tab) */
                    .reels-preview-section {
                        position: relative;
                        margin-top: 32px;
                        padding: 24px;
                        border: none;
                        border-radius: 16px;
                        background:
                            linear-gradient(135deg, rgba(30, 32, 38, 0.95) 0%, rgba(20, 22, 28, 0.98) 100%);
                        box-shadow:
                            inset 0 0 0 2px rgba(180, 195, 220, 0.35),
                            inset 0 0 0 4px rgba(100, 115, 140, 0.15),
                            0 8px 32px rgba(0, 0, 0, 0.6);
                        overflow: hidden;
                    }

                    .reels-preview-section::before {
                        display: none;
                    }

                    .reels-empty-state {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        padding: 24px;
                        color: rgba(255, 255, 255, 0.55);
                        font-size: 13px;
                    }

                    .reels-empty-state button {
                        padding: 6px 14px;
                        background: rgba(94, 245, 240, 0.1);
                        border: 1px solid rgba(94, 245, 240, 0.35);
                        border-radius: 8px;
                        color: #5ef5f0;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.15s;
                    }

                    .reels-empty-state button:hover {
                        background: rgba(94, 245, 240, 0.2);
                    }

                    .section-header-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 16px;
                    }

                    .section-header-row .section-title {
                        margin-bottom: 0;
                    }

                    .see-all-btn {
                        position: relative;
                        background: 
                            linear-gradient(135deg, rgba(30, 32, 38, 0.95) 0%, rgba(20, 22, 28, 0.98) 100%);
                        border: none;
                        border-radius: 10px;
                        padding: 10px 18px;
                        color: #E4E6EB;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        box-shadow: 
                            inset 0 0 0 2px rgba(180, 195, 220, 0.35),
                            inset 0 0 0 4px rgba(100, 115, 140, 0.15),
                            0 4px 16px rgba(0, 0, 0, 0.4);
                    }

                    .see-all-btn:hover {
                        transform: translateY(-1px);
                        box-shadow: 
                            inset 0 0 0 2px rgba(0, 212, 255, 0.5),
                            inset 0 0 0 4px rgba(0, 212, 255, 0.2),
                            0 6px 24px rgba(0, 212, 255, 0.3);
                        color: #00D4FF;
                    }

                    .reels-carousel {
                        display: flex;
                        gap: 16px;
                        overflow-x: auto;
                        width: 0;
                        min-width: 100%;
                        padding-bottom: 8px;
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255,255,255,0.2) transparent;
                    }

                    .reels-carousel::-webkit-scrollbar {
                        height: 6px;
                    }

                    .reels-carousel::-webkit-scrollbar-track {
                        background: transparent;
                    }

                    .reels-carousel::-webkit-scrollbar-thumb {
                        background: rgba(255,255,255,0.2);
                        border-radius: 3px;
                    }

                    /* NOTE: this is a plain global <style> tag (not styled-jsx), so child
                       component classes are targeted directly — :global() is not valid here */
                    .reels-carousel .reel-card {
                        flex-shrink: 0 !important;
                        width: 220px !important;
                        max-width: 220px !important;
                    }

                    .reels-carousel .reel-thumbnail {
                        width: 100% !important;
                        height: 391px !important;
                        aspect-ratio: auto !important;
                        overflow: hidden !important;
                        position: relative !important;
                    }

                    .reels-carousel .reel-thumbnail img {
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        object-fit: cover !important;
                    }

                    /* Reels Section */
                    .reels-section {
                        padding-bottom: 24px;
                    }

                    .reels-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                        gap: 16px;
                    }

                    /* Videos section (?tab=videos) */
                    .videos-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
                        gap: 16px;
                    }

                    @media (max-width: 768px) {
                        .videos-grid {
                            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                            gap: 12px;
                        }
                    }

                    /* Sidebar */
                    .sidebar {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }

                    .widget {
                        position: relative;
                        background: 
                            linear-gradient(135deg, rgba(30, 32, 38, 0.95) 0%, rgba(20, 22, 28, 0.98) 100%);
                        border: none;
                        border-radius: 12px;
                        padding: 16px;
                        box-shadow: 
                            inset 0 0 0 2px rgba(180, 195, 220, 0.35),
                            inset 0 0 0 4px rgba(100, 115, 140, 0.15),
                            0 6px 24px rgba(0, 0, 0, 0.5);
                    }
                    
                    .widget::before {
                        content: '';
                        position: absolute;
                        inset: -2px;
                        border-radius: 14px;
                        background: linear-gradient(135deg, 
                            rgba(200, 210, 230, 0.4) 0%, 
                            rgba(120, 140, 170, 0.25) 25%,
                            rgba(80, 100, 130, 0.15) 50%,
                            rgba(120, 140, 170, 0.25) 75%,
                            rgba(200, 210, 230, 0.4) 100%);
                        z-index: -1;
                        pointer-events: none;
                    }

                    .widget h4 {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        margin-bottom: 14px;
                        color: #E4E6EB;
                    }

                    .widget h4 svg {
                        color: #2374E1;
                    }

                    /* "Sample" tag shown when a widget is rendering fallback data */
                    .sample-tag {
                        margin-left: auto;
                        padding: 1px 6px;
                        background: rgba(255, 255, 255, 0.12);
                        border-radius: 6px;
                        font-size: 9px;
                        font-weight: 700;
                        letter-spacing: 0.5px;
                        text-transform: uppercase;
                        color: rgba(255, 255, 255, 0.65);
                    }

                    /* Newsletter Widget */
                    .newsletter h4 {
                        background: #2374E1;
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .newsletter h4 svg {
                        color: #fff;
                    }

                    .newsletter form {
                        display: flex;
                        gap: 8px;
                    }

                    .newsletter input {
                        flex: 1;
                        padding: 10px 12px;
                        background: #3A3B3C;
                        border: 1px solid #3E4042;
                        border-radius: 8px;
                        color: #E4E6EB;
                        font-size: 12px;
                    }

                    .newsletter button {
                        padding: 10px 16px;
                        background: #2374E1;
                        border: none;
                        border-radius: 8px;
                        color: #fff;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    .error {
                        color: #ef4444;
                        font-size: 11px;
                        margin-top: 8px;
                    }

                    .subscribed {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 12px;
                        background: rgba(34, 197, 94, 0.1);
                        border-radius: 8px;
                        color: #22c55e;
                        font-weight: 600;
                    }

                    /* Trending List */
                    .trending-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .trending-list li {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                        cursor: pointer;
                    }

                    .trending-list li:hover {
                        background: rgba(255, 255, 255, 0.02);
                    }

                    .trending-list li:last-child {
                        border-bottom: none;
                    }

                    .trending-list .rank {
                        width: 20px;
                        font-size: 13px;
                        font-weight: 700;
                        color: #2374E1;
                    }

                    .trend-thumb {
                        width: 40px;
                        height: 30px;
                        border-radius: 4px;
                        object-fit: cover;
                    }

                    .trending-list .title {
                        flex: 1;
                        font-size: 12px;
                        color: rgba(255, 255, 255, 0.7);
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }

                    /* Leaderboard */
                    .leaderboard h4 {
                        background: #2374E1;
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .leaderboard h4 svg {
                        color: #fff;
                    }

                    .leaderboard ul {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .leaderboard li {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 8px 0;
                        border-bottom: 1px solid #3E4042;
                    }

                    .leaderboard li:last-child {
                        border-bottom: none;
                    }

                    .medal {
                        width: 22px;
                        height: 22px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                        font-size: 10px;
                        font-weight: 700;
                    }

                    .medal-1 {
                        background: #2374E1;
                        color: #fff;
                    }
                    .medal-2 {
                        background: #3A3B3C;
                        color: #E4E6EB;
                    }
                    .medal-3 {
                        background: #3A3B3C;
                        color: #E4E6EB;
                    }
                    .medal-4, .medal-5 {
                        background: #3A3B3C;
                        color: #B0B3B8;
                    }

                    .leaderboard .name {
                        flex: 1;
                        font-size: 12px;
                    }
                    .leaderboard .points {
                        font-size: 12px;
                        font-weight: 600;
                        color: #2374E1;
                    }

                    /* MSPT Widget */
                    .mspt h4 {
                        background: #2374E1; /* SmarterPoker Blue */
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .mspt h4 svg {
                        color: #fff;
                    }

                    .mspt-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .mspt-list li {
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .mspt-list li:hover {
                        background: rgba(255, 255, 255, 0.05); /* Neutral Hover */
                        margin: 0 -16px;
                        padding: 10px 16px;
                    }

                    .mspt-list li:last-child {
                        border-bottom: none;
                    }

                    .mspt-item {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }

                    .mspt-title {
                        font-size: 12px;
                        font-weight: 500;
                        color: rgba(255, 255, 255, 0.9);
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }

                    .mspt-meta {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 10px;
                    }

                    .mspt-time {
                        color: rgba(255, 255, 255, 0.6);
                    }

                    .mspt-prize {
                        background: rgba(35, 116, 225, 0.15); /* Blue tint */
                        color: #4599FF; /* Light Blue */
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-weight: 600;
                    }

                    .mspt-link {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        margin-top: 12px;
                        padding: 10px;
                        background: rgba(35, 116, 225, 0.1);
                        border-radius: 8px;
                        color: #2374E1; /* SmarterPoker Blue */
                        font-size: 12px;
                        font-weight: 600;
                        text-decoration: none;
                        transition: all 0.2s;
                    }

                    .mspt-link:hover {
                         background: rgba(35, 116, 225, 0.2);
                    }

                    /* Events Widget */
                    .events {
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .events:hover {
                        border-color: #2374E1;
                        transform: translateY(-2px);
                    }

                    .events h4 {
                        background: #2374E1;
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .events h4 svg {
                        color: #fff;
                    }

                    .events-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .events-list li {
                        display: flex;
                        justify-content: space-between;
                        padding: 10px 0;
                        border-bottom: 1px solid #3E4042;
                        font-size: 12px;
                    }

                    .events-list li:last-child {
                        border-bottom: none;
                    }

                    .events-list .date {
                         background: rgba(35, 116, 225, 0.1);
                         color: #2374E1;
                         padding: 4px 8px;
                         border-radius: 6px;
                         font-weight: 600;
                         font-size: 11px;
                    }

                    .view-all {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        margin-top: 12px;
                        padding: 10px;
                        background: rgba(35, 116, 225, 0.1);
                        border-radius: 8px;
                        color: #2374E1; /* SmarterPoker Blue */
                        font-size: 12px;
                        font-weight: 600;
                    }

                    /* Share Modal */
                    .share-modal-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.8);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000; /* Above the FAB (1000) and scroll progress (9999) */
                    }

                    .share-modal {
                        position: relative;
                        background: #1a1a2e;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 16px;
                        padding: 24px;
                        width: 90%;
                        max-width: 360px;
                        text-align: center;
                    }

                    .share-modal h3 {
                        font-size: 18px;
                        margin-bottom: 8px;
                    }

                    .share-modal p {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.6);
                        margin-bottom: 20px;
                    }

                    .share-buttons {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }

                    .share-buttons button {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        padding: 12px;
                        border: none;
                        border-radius: 10px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    .share-buttons button:nth-child(1) {
                        background: #1da1f2;
                        color: #fff;
                    }
                    .share-buttons button:nth-child(2) {
                        background: #1877f2;
                        color: #fff;
                    }
                    .share-buttons button:nth-child(3) {
                        background: rgba(255, 255, 255, 0.1);
                        color: #fff;
                    }

                    .close-modal {
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        width: 28px;
                        height: 28px;
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        border-radius: 50%;
                        color: #fff;
                        font-size: 18px;
                        cursor: pointer;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* ACCESSIBILITY: VISIBLE KEYBOARD FOCUS           */
                    /* ═══════════════════════════════════════════════ */
                    .section-tab:focus-visible,
                    .source-chip:focus-visible,
                    .view-toggle button:focus-visible,
                    .see-all-btn:focus-visible,
                    .carousel-arrow:focus-visible,
                    .scroll-to-top-fab:focus-visible,
                    .news-list-item:focus-visible,
                    .breaking-ticker:focus-visible,
                    .search-suggestion:focus-visible,
                    .share-buttons button:focus-visible,
                    .close-modal:focus-visible,
                    .newsletter button:focus-visible,
                    .feed-filter-chip button:focus-visible,
                    .reels-empty-state button:focus-visible,
                    .mspt-list li:focus-visible,
                    .trending-list li:focus-visible,
                    .history-list li:focus-visible {
                        outline: 2px solid #5ef5f0;
                        outline-offset: 2px;
                    }

                    @media (max-width: 768px) {
                        .section-tab {
                            flex: 1;
                            justify-content: center;
                            padding: 10px 8px;
                            font-size: 12px;
                        }
                    }
                `}</style>

                    {/* ================================================================
                    GLOBAL MOBILE OVERRIDE — Bypasses styled-jsx component scoping
                    This is required because NewsBox, VideoCard etc. are separate 
                    components with their own <style> blocks.
                    ================================================================ */}
                    <style>{`
                    @media (max-width: 768px) {
                        /* NOTE: the old body/html "SCROLL UNLOCK" override was removed — its
                           !important beat every modal's inline body scroll lock. A stale
                           antigravity-scroll-lock class is now cleared in JS on mount. */

                        /* === PAGE CONTAINER === */
                        .news-hub {
                            width: 100% !important;
                            max-width: 100vw !important;
                            padding: 0 !important;
                            padding-top: 60px !important; /* Make room for Fixed Header */
                            margin: 0 !important;
                            overflow-x: hidden !important;
                            min-height: 100vh !important;
                        }

                        /* === LAYOUT === */
                        .layout {
                            display: block !important;
                            padding: 0 !important;
                            max-width: 100vw !important;
                            width: 100% !important;
                        }

                        /* === SECTION TABS === */
                        .section-tabs {
                            width: 100% !important;
                            max-width: 100vw !important;
                            justify-content: center !important;
                            padding: 8px 12px 0 !important;
                            margin: 0 0 10px !important;
                        }

                        /* === MAIN CONTENT === */
                        .main-content {
                            padding: 0 !important;
                            width: 100% !important;
                            max-width: 100vw !important;
                        }

                        .news-section {
                            padding: 0 !important;
                            margin: 0 !important;
                            width: 100% !important;
                        }

                        .sidebar {
                            display: none !important;
                        }

                        /* === NEWS GRID === */
                        .news-grid {
                            display: flex !important;
                            flex-direction: column !important;
                            gap: 16px !important;
                            padding: 12px !important; /* Restore padding for frames */
                            background: transparent !important;
                            width: 100% !important;
                            max-width: 100% !important;
                        }

                        .news-grid::before {
                            display: none !important;
                        }

                        /* === NEWS BOX (Reels Style Frame) === */
                        .news-box {
                            position: relative !important;
                            min-height: auto !important;
                            height: auto !important;
                            width: 100% !important;
                            border-radius: 12px !important;
                            background: #1a1c1e !important;
                            box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important;
                            margin-bottom: 0 !important;
                            border: none !important;
                            overflow: hidden !important;
                        }

                        /* CHROME FRAME - border only, no glow */
                        .news-box::after {
                            content: '' !important;
                            display: block !important;
                            position: absolute !important;
                            inset: 0 !important;
                            border-radius: 12px !important;
                            border: 4px solid rgba(180, 195, 220, 0.9) !important;
                            box-shadow: none !important;
                            pointer-events: none !important;
                            z-index: 10 !important;
                        }

                        /* === REELS FIX === */
                        .reels-carousel {
                             display: flex !important;
                             overflow-x: auto !important;
                             gap: 12px !important;
                             padding-bottom: 12px !important;
                             scroll-snap-type: x mandatory !important;
                             -webkit-overflow-scrolling: touch !important;
                        }
                        
                        .reel-card,
                        .reels-carousel .reel-card {
                             min-width: 180px !important;
                             width: 180px !important;
                             max-width: 180px !important;
                             height: auto !important;
                             flex-shrink: 0 !important;
                             scroll-snap-align: start !important;
                             margin-right: 0 !important;
                        }

                        /* Match the desktop carousel selector's specificity so the phone
                           sizing wins (media queries add none of their own) */
                        .reels-carousel .reel-thumbnail {
                             height: auto !important;
                             aspect-ratio: 9 / 16 !important;
                        }

                        /* === IMAGES === */
                        .box-image {
                            height: auto !important;
                            aspect-ratio: 16/9;
                            border-radius: 12px 12px 0 0 !important;
                            width: 100% !important;
                        }

                        .box-image img {
                            position: relative !important;
                            width: 100% !important;
                            height: 100% !important;
                            object-fit: cover !important;
                            border-radius: 12px 12px 0 0 !important;
                        }

                        .box-overlay {
                            display: none !important;
                        }

                        /* === CONTENT === */
                        .box-content {
                            padding: 12px 16px !important;
                        }

                        .box-title {
                            font-size: 15px !important;
                            line-height: 1.4 !important;
                            white-space: normal !important;
                            overflow: visible !important;
                            text-overflow: unset !important;
                        }

                        .box-meta {
                            font-size: 12px !important;
                        }
                    }
                `}</style>
                </div>
                  <BottomNavBar />
    </PageTransition>


            {/* Article Reader Modal - Opens full external pages in-app via server-side proxy */}
            {articleReader.open && (
                <ArticleReaderModal
                    url={articleReader.url}
                    title={articleReader.title}
                    onClose={() => setArticleReader({ open: false, url: '', title: '' })}
                />
            )}

            {/* Fullscreen Reels Viewer - TikTok-style inline playback.
                Keyboard handling lives in a document-level effect (see above) so
                Escape/arrows keep working even after the iframe grabs focus. */}
            {reelViewerOpen && reels.length > 0 && (() => {
                const currentReel = reels[safeReelIndex] || reels[0];
                const videoId = getYouTubeVideoId(currentReel?.video_url);
                const displayTitle = currentReel?.title || currentReel?.caption?.split('\n')[0] || 'Poker Reel';
                const channelName = currentReel?.channel_name || currentReel?.profiles?.full_name || 'Smarter.Poker';

                return (
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Reel viewer"
                        style={{
                            position: 'fixed', inset: 0, background: '#000', zIndex: 99999,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                        }}
                        onClick={(e) => { if (e.target === e.currentTarget) setReelViewerOpen(false); }}
                        tabIndex={-1}
                        ref={reelViewerRef}
                    >
                        {/* Close button - subtle, top-left */}
                        <button
                            onClick={() => setReelViewerOpen(false)}
                            aria-label="Close reel viewer"
                            style={{
                                position: 'absolute', top: 16, left: 16, zIndex: 10,
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                                border: 'none', color: 'white', fontSize: 18, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                        >×</button>

                        {/* Previous arrow */}
                        {safeReelIndex > 0 && (
                            <button
                                onClick={() => setReelViewerIndex(safeReelIndex - 1)}
                                aria-label="Previous reel"
                                style={{
                                    position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                                    width: 48, height: 48, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.1)', border: 'none',
                                    color: 'white', fontSize: 24, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            ><ChevronLeft size={28} /></button>
                        )}

                        {/* Next arrow */}
                        {safeReelIndex < reels.length - 1 && (
                            <button
                                onClick={() => setReelViewerIndex(safeReelIndex + 1)}
                                aria-label="Next reel"
                                style={{
                                    position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                                    width: 48, height: 48, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.1)', border: 'none',
                                    color: 'white', fontSize: 24, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            ><ChevronRight size={28} /></button>
                        )}

                        {/* Video container — sized to the 9:16 reel so the letterbox areas
                            stay part of the backdrop and click-to-close keeps working */}
                        <div style={{ position: 'relative', height: '100%', maxHeight: '100vh', aspectRatio: '9 / 16', maxWidth: '100vw' }}>
                            {videoId ? (
                                <>
                                <iframe
                                    key={currentReel.id}
                                    title={displayTitle}
                                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&controls=1&showinfo=0&iv_load_policy=3&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                                {/* YouTube Error Overlay */}
                                {newsYtManaged && (
                                    <YouTubeErrorOverlay
                                        errorCode={newsYtManaged}
                                        videoId={videoId}
                                        actionLabel="Skipping in 3 seconds..."
                                    />
                                )}
                                </>
                            ) : currentReel?.video_url ? (
                                <video
                                    key={currentReel.id}
                                    src={currentReel.video_url}
                                    autoPlay
                                    controls
                                    playsInline
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                                    onClick={(e) => e.stopPropagation()}
                                    onEnded={() => {
                                        if (safeReelIndex < reels.length - 1) setReelViewerIndex(safeReelIndex + 1);
                                    }}
                                />
                            ) : null}
                        </div>

                        {/* Bottom info bar */}
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 20px',
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                            pointerEvents: 'none'
                        }}>
                            <div>
                                <div style={{ color: 'white', fontSize: 15, fontWeight: 600, marginBottom: 4, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                                    {displayTitle}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                                    {channelName}
                                </div>
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 500 }}>
                                {safeReelIndex + 1} / {reels.length}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}
