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
import Image from 'next/image';
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
import { Eye, TrendingUp, Trophy, Play, MapPin, ExternalLink, Loader, Bookmark, BookmarkCheck, Share2, Twitter, LinkIcon, CheckCircle, ChevronDown, ChevronUp, Newspaper, Globe, ChevronRight, ChevronLeft, Film, Clock, Calendar, PlayCircle } from 'lucide-react';

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
const VideoCard = dynamic(() => import('../../src/components/news/VideoCard'), { ssr: false });
const ReelCard = dynamic(() => import('../../src/components/news/ReelCard'), { ssr: false });
const MSPTBox = dynamic(() => import('../../src/components/news/MSPTBox'), { ssr: false });
const SourcePlaceholderBox = dynamic(() => import('../../src/components/news/SourcePlaceholderBox'), { ssr: false });

// Fallback data
const FALLBACK_NEWS = [
    { id: '1', title: "WSOP 2025 Schedule Released", content: "The World Series of Poker announces its biggest schedule yet", image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80", category: "tournament", read_time: 4, views: 5200, published_at: new Date().toISOString(), source_name: "PokerNews" },
    { id: '2', title: "Phil Ivey Returns to Live Poker", content: "Legendary player set for major comeback", image_url: "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=400&q=80", category: "news", read_time: 3, views: 8900, published_at: new Date(Date.now() - 3600000).toISOString(), source_name: "Card Player" },
    { id: '3', title: "GTO Strategy: 3-Betting Ranges Explained", content: "Master the art of 3-betting with optimal frequencies", image_url: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400&q=80", category: "strategy", read_time: 8, views: 12400, published_at: new Date(Date.now() - 7200000).toISOString(), source_name: "Upswing" },
    { id: '4', title: "Online Poker Traffic Hits New Records", content: "Global player pools see unprecedented growth", image_url: "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80", category: "industry", read_time: 5, views: 3100, published_at: new Date(Date.now() - 10800000).toISOString(), source_name: "Poker.org" },
    { id: '5', title: "EPT Barcelona Main Event Preview", content: "All you need to know about Europe's biggest poker festival", image_url: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80", category: "tournament", read_time: 6, views: 4500, published_at: new Date(Date.now() - 14400000).toISOString(), source_name: "PokerNews" },
    { id: '6', title: "Bankroll Management Essentials", content: "Protect your poker career with proper money management", image_url: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&q=80", category: "strategy", read_time: 7, views: 6700, published_at: new Date(Date.now() - 18000000).toISOString(), source_name: "Card Player" },
    { id: '7', title: "New Poker Room Opens in Las Vegas", content: "State-of-the-art facility debuts on the Strip", image_url: "https://images.unsplash.com/photo-1517232115160-ff93364542dd?w=400&q=80", category: "industry", read_time: 4, views: 2300, published_at: new Date(Date.now() - 21600000).toISOString(), source_name: "Poker.org" },
    { id: '8', title: "WPT Championship Final Table Set", content: "Six players remain for the $10M prize pool", image_url: "https://images.unsplash.com/photo-1609743522653-52354461eb27?w=400&q=80", category: "tournament", read_time: 5, views: 7800, published_at: new Date(Date.now() - 25200000).toISOString(), source_name: "PokerNews" }
];

const FALLBACK_VIDEOS = [
    { id: '1', title: "WSOP Main Event Day 1 Highlights", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=300&q=80", duration: "15:42", views: 125000, channel: "PokerGO" },
    { id: '2', title: "How to Beat Small Stakes Poker", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=300&q=80", duration: "28:15", views: 89000, channel: "Jonathan Little" },
    { id: '3', title: "Phil Hellmuth Epic Blowup Compilation", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=300&q=80", duration: "12:34", views: 450000, channel: "Poker Clips" },
    { id: '4', title: "GTO vs Exploitative Play Breakdown", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=300&q=80", duration: "45:20", views: 67000, channel: "Upswing Poker" }
];

const FALLBACK_POY = [
    { player_name: "Alex F.", points: 2850, rank: 1 },
    { player_name: "Thomas B.", points: 2720, rank: 2 },
    { player_name: "Chad E.", points: 2580, rank: 3 },
    { player_name: "Stephen C.", points: 2410, rank: 4 },
    { player_name: "Daniel N.", points: 2290, rank: 5 }
];

const FALLBACK_EVENTS = [
    { id: '1', name: "WSOP Main Event", event_date: "2025-06-28" },
    { id: '2', name: "EPT Barcelona", event_date: "2025-08-15" },
    { id: '3', name: "WPT Championship", event_date: "2025-12-01" }
];

// MSPT (Mid-States Poker Tour) Fallback Data
const FALLBACK_MSPT = [
    { id: 'mspt1', title: "MSPT Venetian $1,600 Main Event Kicks Off", source_url: "https://msptpoker.com", published_at: new Date().toISOString(), prize_pool: "$2M GTD" },
    { id: 'mspt2', title: "MSPT Canterbury Park Results - John Smith Wins", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 86400000).toISOString(), prize_pool: "$350K" },
    { id: 'mspt3', title: "MSPT 2025 Schedule Announced - 20+ Stops", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 172800000).toISOString(), prize_pool: null },
    { id: 'mspt4', title: "MSPT Player of the Year Race Heats Up", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 259200000).toISOString(), prize_pool: null }
];

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatEventDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

export default function NewsHub() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;

    useEffect(() => {
        // Ensure page always starts at top on load, even after hard refresh
        if (typeof window !== 'undefined') {
            if ('scrollRestoration' in history) {
                history.scrollRestoration = 'manual';
            }
            // Aggressively force scroll to top for the first 500ms to defeat browser scroll restoration cache
            let scrollAttempts = 0;
            const scrollInterval = setInterval(() => {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                scrollAttempts++;
                if (scrollAttempts >= 5) clearInterval(scrollInterval);
            }, 100);
            return () => clearInterval(scrollInterval);
        }
    }, []);

    // Core State
    const [searchQuery, setSearchQuery] = useState('');
    const [sourceFilters, setSourceFilters] = useState({});
    const [visibleStories, setVisibleStories] = useState(10);
    const [lastRefreshed, setLastRefreshed] = useState(null);
    const [scrollProgress, setScrollProgress] = useState(0);
    const [newArticleCount, setNewArticleCount] = useState(0);
    const reelsCarouselRef = useRef(null);

    // Phase 3 State
    const [viewMode, setViewMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('news_view_mode') || 'grid';
        }
        return 'grid';
    });
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const [focusedArticleIdx, setFocusedArticleIdx] = useState(-1);

    // Phase 4: Persist viewMode
    const handleViewModeChange = useCallback((mode) => {
        setViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('news_view_mode', mode);
        }
    }, []);

    // Phase 5: Track last visit for "NEW" badges
    const [lastVisitTimestamp, setLastVisitTimestamp] = useState(null);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('news_last_visit');
            if (stored) setLastVisitTimestamp(new Date(stored));
            // Update last visit to now
            localStorage.setItem('news_last_visit', new Date().toISOString());
        }
    }, []);
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

    // Persisted filters for activeTab and activeSection
    const { filters, setFilter } = usePersistedFilters('news', {
        activeTab: 'all',
        activeSection: 'news'
    });

    const activeTab = filters.activeTab;
    const activeSection = filters.activeSection;
    const setActiveTab = (val) => setFilter('activeTab', val);
    const setActiveSection = (val) => setFilter('activeSection', val);

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

    const { data: videosData } = useSWR('/api/news/videos?limit=20', jsonFetch);
    const videos = (videosData?.success && videosData.data?.length) ? videosData.data : (typeof FALLBACK_VIDEOS !== 'undefined' ? FALLBACK_VIDEOS : []);

    const { data: reelsData } = useSWR('/api/news/reels?limit=20&sort=recent', jsonFetch);
    const reels = (reelsData?.success && reelsData.data?.length) ? reelsData.data : [];

    const { data: leaderboardData } = useSWR('/api/news/leaderboard?limit=5', jsonFetch);
    const leaderboard = (leaderboardData?.success && leaderboardData.data?.length) ? leaderboardData.data : (typeof FALLBACK_POY !== 'undefined' ? FALLBACK_POY : []);

    const { data: eventsData } = useSWR('/api/news/events?limit=3', jsonFetch);
    const events = (eventsData?.success && eventsData.data?.length) ? eventsData.data : (typeof FALLBACK_EVENTS !== 'undefined' ? FALLBACK_EVENTS : []);

    const { data: msptData } = useSWR('/api/news/articles?search=MSPT&limit=10', jsonFetch);
    const msptNews = (msptData?.success && msptData.data?.length)
        ? msptData.data.map(a => ({ id: a.id, title: a.title, source_url: a.source_url || '#', published_at: a.published_at, prize_pool: null }))
        : (typeof FALLBACK_MSPT !== 'undefined' ? FALLBACK_MSPT : []);

    // News articles — key changes with activeTab so SWR re-fetches and caches per tab
    const newsParams = new URLSearchParams({ limit: '100' });
    if (activeTab !== 'all') newsParams.set('category', activeTab);
    if (searchQuery) newsParams.set('search', searchQuery);
    const { data: newsData, isLoading: loading, mutate: refreshNews } = useSWR(`/api/news/articles?${newsParams}`, jsonFetch);
    const rawNews = (newsData?.success && newsData.data?.length) ? newsData.data : (typeof FALLBACK_NEWS !== 'undefined' ? FALLBACK_NEWS : []);
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

    // Scroll progress bar
    useEffect(() => {
        const handleScroll = () => {
            const total = document.documentElement.scrollHeight - window.innerHeight;
            if (total > 0) setScrollProgress(Math.min((window.scrollY / total) * 100, 100));
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // New article notification dot
    useEffect(() => {
        if (news.length > 0) {
            const lastVisit = localStorage.getItem('news_last_visit');
            if (lastVisit) {
                const count = news.filter(a => new Date(a.published_at) > new Date(lastVisit)).length;
                setNewArticleCount(count);
            }
            localStorage.setItem('news_last_visit', new Date().toISOString());
        }
    }, [news]);

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

    // Toggle source filter (Phase 4: update URL for deep linking)
    const toggleSource = (src) => {
        setSourceFilters(prev => {
            const next = { ...prev, [src]: !prev[src] };
            // Update URL with active source filters for deep linking
            const active = Object.keys(next || {}).filter(k => next[k]);
            if (active.length === 1) {
                router.replace({ pathname: router.pathname, query: { source: active[0] } }, undefined, { shallow: true });
            } else {
                router.replace({ pathname: router.pathname }, undefined, { shallow: true });
            }
            return next;
        });
    };
    const activeSourceFilters = Object.keys(sourceFilters || {}).filter(k => sourceFilters[k]);


    // Article reader state - uses server-side proxy to display articles in-app
    const [articleReader, setArticleReader] = useState({ open: false, url: '', title: '' });

    // Fullscreen reels viewer state
    const [reelViewerOpen, setReelViewerOpen] = useState(false);
    const [reelViewerIndex, setReelViewerIndex] = useState(0);
    const openReelViewer = (index) => { setReelViewerIndex(index); setReelViewerOpen(true); };

    // Centralized YouTube error management for news reels viewer
    const { ytError: newsYtManaged } = useYouTubeErrorManager({
        active: reelViewerOpen,
        videoId: reelViewerOpen && reels[reelViewerIndex] ? getYouTubeVideoId(reels[reelViewerIndex]?.video_url) : null,
        surface: 'NewsReelsViewer',
        autoActionDelay: 3000,
        onError: () => {
            if (reelViewerIndex < reels.length - 1) {
                setReelViewerIndex(prev => prev + 1);
            } else {
                setReelViewerOpen(false);
            }
        },
    });


    // Handle query parameters for deep linking (Phase 4: fixed source filter binding)
    useEffect(() => {
        if (router.query.source) {
            const src = router.query.source;
            setSourceFilters(prev => ({ ...prev, [src]: true }));
            setActiveSection('news');
            setActiveTab('news');
        } else if (router.query.tab) {
            setActiveSection(router.query.tab);
            setActiveTab(router.query.tab);
        } else if (router.query.filter) {
            setActiveSection(router.query.filter);
            setActiveTab('all');
        }
    }, [router.query]);
    const [email, setEmail] = useState('');
    const [subscribed, setSubscribed] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [subscribeError, setSubscribeError] = useState('');

    // UI State
    const [darkMode, setDarkMode] = useState(true);
    const [bookmarks, setBookmarks] = useState([]);
    const [readArticles, setReadArticles] = useState([]);
    const [shareArticle, setShareArticle] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showAllStories, setShowAllStories] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        pushNotifications: true,
        emailDigest: false
    });


    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 REALTIME: News Updates
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const newsChannel = supabase
            .channel(`news-live-${Date.now()}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'poker_news'
            }, () => {
                // Dispatch refresh event to trigger SWR revalidation
                window.dispatchEvent(new CustomEvent('news-refresh'));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(newsChannel);
        };
    }, []);

    // Load preferences and bookmarks from Supabase on mount
    useEffect(() => {
        if (userId) {
            getNewsPreferences(userId).then(setPreferences).catch(err => console.warn('News preferences not available:', err?.message));

            // Load bookmarks
            getNewsBookmarks(userId).then(data => {
                setBookmarks((data || []).map(b => b.article_id));
            }).catch(err => console.warn('Error loading bookmarks:', err));
        }
    }, [userId]);

    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updateNewsPreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference:', error);
            }
        }
    }, [preferences, userId]);

    const menuConfig = getMenuConfig('news', user, preferences, {
        setPushNotifications: (val) => updatePreference('pushNotifications', val),
        setEmailDigest: (val) => updatePreference('emailDigest', val)
    });

    //  INTRO VIDEO STATE
    const [showIntro, setShowIntro] = useState(false);
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

    // Load persisted state
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedDarkMode = localStorage.getItem('news_dark_mode');
            if (savedDarkMode !== null) setDarkMode(savedDarkMode === 'true');
            try {
                const savedBookmarks = localStorage.getItem('news_bookmarks');
                if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            try {
                const savedRead = localStorage.getItem('news_read');
                if (savedRead) setReadArticles(JSON.parse(savedRead));
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }
    }, []);

    // Persist state
    useEffect(() => {
        if (typeof window !== 'undefined' && bookmarks.length >= 0) {
            localStorage.setItem('news_bookmarks', JSON.stringify(bookmarks));
        }
    }, [bookmarks]);

    useEffect(() => {
        if (typeof window !== 'undefined' && readArticles.length >= 0) {
            localStorage.setItem('news_read', JSON.stringify(readArticles));
        }
    }, [readArticles]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('news_dark_mode', String(darkMode));
        }
    }, [darkMode]);

    // Toggle functions
    const toggleBookmark = useCallback(async (articleId, article = {}) => {
        if (!userId) return;

        if (bookmarks.includes(articleId)) {
            await removeNewsBookmark(userId, articleId);
            setBookmarks(prev => prev.filter(id => id !== articleId));
        } else {
            await addNewsBookmark(userId, articleId, {
                title: article.title,
                url: article.source_url,
                source: article.source_name,
                thumbnail: article.image_url
            });
            setBookmarks(prev => [...prev, articleId]);
        }
    }, [userId, bookmarks]);

    const markAsRead = (articleId) => {
        if (!readArticles.includes(articleId)) {
            setReadArticles(prev => [...prev, articleId]);
        }
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

    const shareToSmarterPoker = (article) => {
        const url = `https://smarter.poker/hub/article?id=${article.id}`;
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
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

    // Refresh button handler (triggers SWR revalidation)
    const { mutate: mutateNews } = useSWR(`/api/news/articles?${newsParams}`, null, { revalidateOnMount: false });
    const refreshData = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        setIsRefreshing(true);
        await mutateNews();
        setLastUpdate(new Date());
        setIsRefreshing(false);
    };


    // Search handler
    const handleSearch = useCallback((value) => {
        setSearchQuery(value);
        const timer = setTimeout(() => fetchNews(), 300);
        return () => clearTimeout(timer);
    }, [activeTab]);

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

            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const { success, error } = await res.json();

            if (success) {
                setSubscribed(true);
            } else {
                setSubscribeError(error || 'Subscription failed');
            }
        } catch (e) {
            setSubscribeError('Network error');
        } finally {
            setSubscribing(false);
        }
    };

    // Link containment - stay inside smarter.poker
    const { openExternal } = useExternalLink();

    // Article navigation - uses link containment
    const openArticle = async (article) => {
        try {
            await fetch('/api/news/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: article.id })
            });
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        markAsRead(article.id);

        if (article.source_url) {
            // Open full page in-app via proxy-based ArticleReaderModal
            setArticleReader({ open: true, url: article.source_url, title: article.title || 'News Article' });
        } else {
            router.push(`/hub/article?id=${article.id}`);
        }
    };

    // Video navigation - uses link containment for YouTube and direct URLs
    const openVideo = (video) => {
        if (video.youtube_id) {
            openExternal(`https://www.youtube.com/watch?v=${video.youtube_id}`, video.title || 'Poker Video');
        } else if (video.url) {
            openExternal(video.url, video.title || 'Poker Video');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // HARDENED: Source boxes come directly from /api/news/source-boxes
    // No client-side filtering - the API guarantees 1 article per source box
    // ═══════════════════════════════════════════════════════════════════════════
    const topArticles = sourceBoxes.length > 0 ? sourceBoxes : FALLBACK_NEWS.slice(0, 6);
    const topArticleIds = topArticles.map(a => a.id);

    // Filter remaining news for "More Stories" section
    const VALID_SOURCES = ['PokerNews', 'MSPT', 'Card Player', 'WSOP', 'Poker.org', 'Pokerfuse'];
    const filteredNews = news.filter(article => {
        if (article.source_name === 'Smarter.Poker') return false;
        if (!VALID_SOURCES.includes(article.source_name) && !article.source_box) return false;
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

    // Breaking news = most recent article from top sources
    const breakingNews = news.find(a => a.source_name !== 'Smarter.Poker' && (Date.now() - new Date(a.published_at).getTime()) < 3600000);

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
    // NOTE: Must be placed AFTER topArticles/remainingStories const declarations to avoid TDZ
    useEffect(() => {
        const handleKeyNav = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const allArticles = [...(topArticles || []), ...(remainingStories || [])];
            if (e.key === 'j' || e.key === 'J') {
                e.preventDefault();
                setFocusedArticleIdx(prev => {
                    const next = Math.min(prev + 1, allArticles.length - 1);
                    // Phase 6: Smooth scroll to focused article
                    setTimeout(() => document.querySelector('.keyboard-focused')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    return next;
                });
            } else if (e.key === 'k' || e.key === 'K') {
                e.preventDefault();
                setFocusedArticleIdx(prev => {
                    const next = Math.max(prev - 1, 0);
                    setTimeout(() => document.querySelector('.keyboard-focused')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    return next;
                });
            } else if (e.key === 'Enter' && focusedArticleIdx >= 0 && focusedArticleIdx < allArticles.length) {
                e.preventDefault();
                openArticle(allArticles[focusedArticleIdx]);
            }
        };
        window.addEventListener('keydown', handleKeyNav);
        return () => window.removeEventListener('keydown', handleKeyNav);
    }, [focusedArticleIdx, topArticles, remainingStories]);

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

                <div className={`news-hub ${darkMode ? '' : 'light'}`}>
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
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <h3>Share Article</h3>
                                    <p>{shareArticle.title}</p>
                                    <div className="share-buttons">
                                        <button onClick={() => { shareToTwitter(shareArticle); setShareArticle(null); }}>
                                            <Twitter size={20} /> Twitter
                                        </button>
                                        <button onClick={() => { shareToSmarterPoker(shareArticle); setShareArticle(null); }}>
                                            <TrendingUp size={20} /> SmarterPoker
                                        </button>
                                        <button onClick={() => { copyLink(shareArticle); setShareArticle(null); }}>
                                            <LinkIcon size={20} /> Copy Link
                                        </button>
                                    </div>
                                    <button className="close-modal" onClick={() => setShareArticle(null)}>×</button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Skeleton Loading State */}
                    {loading && (
                        <div className="skeleton-grid">
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
                                <div style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    <span>Updated {timeAgo(lastRefreshed)}</span>
                                    <button onClick={() => refreshNews()} style={{ background: 'none', border: 'none', color: '#5ef5f0', cursor: 'pointer', fontSize: '11px', padding: 0, textDecoration: 'underline' }}>Refresh</button>
                                </div>
                            )}

                            {/* Breaking News Ticker */}
                            {breakingNews && (
                                <div className="breaking-ticker" onClick={() => openArticle(breakingNews)}>
                                    <span className="breaking-badge">BREAKING</span>
                                    <span className="breaking-text">{breakingNews.title}</span>
                                </div>
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
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onFocus={() => setSearchFocused(true)}
                                        onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                                    />
                                    {searchFocused && searchSuggestions.length > 0 && (
                                        <div className="search-dropdown">
                                            {searchSuggestions.map(a => (
                                                <div key={a.id} className="search-suggestion" onClick={() => { openArticle(a); setSearchQuery(''); }}>
                                                    <span className="suggestion-source" style={{ color: SOURCE_COLORS[a.source_name] || '#5ef5f0' }}>{a.source_name}</span>
                                                    <span className="suggestion-title">{a.title}</span>
                                                </div>
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
                                        {filteredNews.length === 0 && searchQuery ? (
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
                                                    return remainingStories.slice(0, visibleStories).map((article) => {
                                                        const group = getTimeGroup(article.published_at);
                                                        const showHeader = group !== lastGroup;
                                                        lastGroup = group;
                                                        return (
                                                            <React.Fragment key={article.id}>
                                                                {showHeader && (
                                                                    <div className="time-group-header">
                                                                        {TIME_GROUP_LABELS[group]}
                                                                    </div>
                                                                )}
                                                                <motion.div
                                                                    className={`news-list-item ${readArticles.includes(article.id) ? 'read' : ''}`}
                                                                    whileHover={{ x: 4 }}
                                                                    onClick={() => openArticle(article)}
                                                                >
                                                                    {isNewArticle(article) && (
                                                                        <span className="new-badge">NEW</span>
                                                                    )}
                                                                    {(article.views || 0) > 50 && (
                                                                        <span className="trending-badge">🔥</span>
                                                                    )}
                                                                    <img
                                                                        src={article.image_url ? (article.image_url.includes('cardplayer.com') ? `/api/proxy?url=${encodeURIComponent(article.image_url)}` : article.image_url) : (FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news)}
                                                                        alt=""
                                                                        className="list-thumb"
                                                                        onError={(e) => { e.target.src = FALLBACK_IMAGES.news; }}
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
                                                                    <div className="list-actions" onClick={(e) => e.stopPropagation()}>
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
                                                See All →
                                            </button>
                                        </div>
                                        {reels.length > 0 ? (
                                            <div className="reels-carousel-wrapper">
                                                <button className="carousel-arrow carousel-left" onClick={() => reelsCarouselRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}>
                                                    <ChevronLeft size={20} />
                                                </button>
                                                <div className="reels-carousel" ref={reelsCarouselRef}>
                                                    {reels.slice(0, 10).map((reel, idx) => (
                                                        <ReelCard key={reel.id} reel={reel} onClick={() => openReelViewer(idx)} />
                                                    ))}
                                                </div>
                                                <button className="carousel-arrow carousel-right" onClick={() => reelsCarouselRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}>
                                                    <ChevronRight size={20} />
                                                </button>
                                            </div>
                                        ) : (
                                            <p style={{ color: '#888', padding: '20px', textAlign: 'center' }}>Loading Reels...</p>
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
                                <h4><Trophy size={14} /> MSPT News & Updates</h4>
                                <ul className="mspt-list">
                                    {msptNews.map((item) => (
                                        <li
                                            key={item.id}
                                            onClick={() => item.source_url && window.open(item.source_url, '_blank')}
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
                                    ))}
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
                                        <li key={article.id} onClick={() => openArticle(article)}>
                                            <span className={`rank ${i < 3 ? `medal-${i + 1}` : ''}`}>{i < 3 ? ['🥇','🥈','🥉'][i] : (i + 1)}</span>
                                            <img
                                                src={article.image_url || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news}
                                                alt=""
                                                className="trend-thumb"
                                                loading="lazy"
                                                onError={(e) => { e.target.src = FALLBACK_IMAGES.news; }}
                                            />
                                            <span className="title">{article.title}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Player of the Year */}
                            <div className="widget leaderboard">
                                <h4><Trophy size={14} /> Player Of The Year</h4>
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
                                    <h4><MapPin size={14} /> Poker Near Me</h4>
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

                            {/* Phase 3: Reading History Widget */}
                            {readArticles.length > 0 && (
                                <div className="widget reading-history">
                                    <h4><Eye size={14} /> Recently Read</h4>
                                    <ul className="history-list">
                                        {news.filter(a => readArticles.includes(a.id)).slice(0, 5).map(a => (
                                            <li key={a.id} onClick={() => openArticle(a)}>
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

                        header.header {
                            width: 100% !important;
                            max-width: 100vw !important;
                            padding: 0 !important;
                            margin-top: 3px !important;
                            margin-bottom: 3px !important;
                            overflow-x: hidden !important;
                            overflow-y: hidden !important;
                            -webkit-overflow-scrolling: touch;
                            height: auto !important;
                        }

                        header.header > .header-left {
                            width: 100% !important;
                            max-width: 100vw !important;
                            overflow-x: hidden !important;
                            justify-content: center !important;
                            height: auto !important;
                        }

                        .section-tabs {
                            overflow-x: hidden !important;
                            width: 100% !important;
                            max-width: 100vw !important;
                            flex-direction: row !important;
                            flex-wrap: nowrap !important;
                            justify-content: center !important;
                            gap: 3px !important;
                            padding: 0 3px !important;
                            margin: 0 !important;
                            -webkit-overflow-scrolling: touch;
                        }

                        .section-tab-img,
                        .refresh-btn-img {
                            flex: 1 1 0 !important;
                            height: auto !important;
                            min-width: 0 !important;
                        }

                        .section-tab-img img,
                        .refresh-btn-img img {
                            width: 100% !important;
                            height: auto !important;
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

                    /* Header Structure */
                    .header {
                        position: sticky;
                        top: 0; /* Sticks below universal header */
                        z-index: 100;
                        display: flex;
                        align-items: center;
                        justify-content: center; /* Center icons */
                        padding: 8px 4px; /* More padding */
                        background: #18191A;
                        border-bottom: 1px solid #3E4042;
                        gap: 0;
                        height: 94px; /* Match 85px icons + padding */
                        overflow: visible;
                    }

                    .header-left {
                        display: flex;
                        align-items: center;
                        gap: 0; /* Zero gap */
                        justify-content: center;
                        height: 85px;
                        overflow: visible;
                    }

                    .logo {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .logo :global(.logo-icon) {
                        color: #2374E1;
                    }

                    .logo span {
                        font-size: 18px;
                        font-weight: 700;
                        color: #E4E6EB;
                    }

                    .section-tabs {
                        display: flex;
                        gap: 0; /* Zero gap - packed tight */
                        align-items: center;
                        justify-content: center;
                        overflow: visible;
                        padding: 0;
                    }

                    .section-tab {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 16px;
                        background: #3A3B3C;
                        border: none;
                        border-radius: 8px;
                        color: #B0B3B8;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .section-tab:hover {
                        background: #4E4F50;
                        color: #E4E6EB;
                    }

                    .section-tab.active {
                        background: #2374E1;
                        color: #fff;
                    }

                    /* Custom Image Tab Buttons - Bigger & Packed */
                    .section-tab-img, .refresh-btn-img {
                        flex: 0 0 auto;
                        height: 85px; /* Mobile-fit icons */
                        width: auto;
                        min-width: 0;
                        padding: 0;
                        margin: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                    }

                    .section-tab-img img, .refresh-btn-img img {
                        height: 85px; /* Mobile-fit 4 icons */
                        width: auto;
                        object-fit: contain;
                        display: block;
                    }

                    /* Specific styling for Latest Videos removed to ensure uniform size */
                    .section-title-img {
                        height: 240px;
                        width: auto;
                        display: block;
                    }


                    .section-tab-img:hover img {
                        filter: brightness(1.15);
                        /* Removing scale to ensure uniform size */
                    }

                    .section-tab-img.active img {
                        filter: brightness(1.2) drop-shadow(0 0 6px rgba(0, 212, 255, 0.5));
                        /* Removing scale to ensure uniform size */
                    }

                    /* Custom Image Refresh Button */
                    .refresh-btn-img {
                         background: transparent;
                         border: none;
                         cursor: pointer;
                    }

                    .refresh-btn-img:hover img {
                        filter: brightness(1.2);
                    }

                    .refresh-btn-img:disabled { opacity: 0.5; }
                    .refresh-btn-img img.spinning { animation: spin 1s linear infinite; }
                    
                    /* Search Box - Mobile Optimized */
                    .search-box {
                        display: flex;
                        align-items: center;
                        background: #3A3B3C;
                        border-radius: 16px;
                        padding: 4px 10px;
                        width: 100px; /* Mobile-optimized */
                        transition: background-color 0.2s;
                        flex-shrink: 0;
                        height: 32px;
                    }

                    .search-box input {
                        background: transparent;
                        border: none;
                        color: #E4E6EB;
                        font-size: 16px;
                        width: 100%;
                        outline: none;
                    }
                    
                    .search-icon {
                        color: #B0B3B8;
                        margin-right: 8px;
                    }

                    .clear-search {
                        position: absolute;
                        right: 8px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 18px;
                        height: 18px;
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        border-radius: 50%;
                        color: #fff;
                        font-size: 12px;
                        cursor: pointer;
                    }

                    .refresh-btn, .theme-toggle {
                        padding: 8px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        color: rgba(255, 255, 255, 0.7);
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .refresh-btn:hover, .theme-toggle:hover {
                        background: rgba(255, 255, 255, 0.1);
                        color: #fff;
                    }

                    .refresh-btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    .refresh-btn :global(.spinning) {
                        animation: spin 1s linear infinite;
                    }

                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }

                    /* Category Bar */
                    .category-bar {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 24px;
                        background: rgba(10, 10, 18, 0.8);
                        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                        overflow-x: auto;
                    }

                    .category-tab {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 14px;
                        background: transparent;
                        border: none;
                        border-radius: 20px;
                        color: rgba(255, 255, 255, 0.6);
                        font-size: 12px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                        white-space: nowrap;
                    }

                    .category-tab:hover {
                        background: rgba(255, 255, 255, 0.05);
                        color: #fff;
                    }

                    .category-tab.active {
                        background: rgba(0, 212, 255, 0.15);
                        color: #2374E1;
                    }

                    .last-update {
                        margin-left: auto;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.4);
                    }

                    /* Loading */
                    .loading {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        padding: 60px;
                        color: rgba(255, 255, 255, 0.5);
                    }

                    .loading :global(.spinner) {
                        animation: spin 1s linear infinite;
                    }

                    /* REMOVED DUPLICATE HEADER-LEFT RULE - See lines ~1769-1777 for authoritative CSS */

                    /* REMOVED DUPLICATE SECTION-TABS RULES - See lines ~1782-1791 for authoritative CSS */

                    /* REMOVED DUPLICATE ICON RULES - See lines ~1819-1840 for authoritative icon CSS */

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
                    .news-list-item:hover .list-actions {
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
                        color: rgba(255,255,255,0.3);
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
                    .keyboard-focused {
                        outline: 2px solid rgba(94,245,240,0.4);
                        outline-offset: 2px;
                        border-radius: 8px;
                    }

                    /* ═══════════════════════════════════════════════ */
                    /* TRENDING BADGE & LOAD MORE */
                    /* ═══════════════════════════════════════════════ */
                    .trending-badge {
                        position: absolute;
                        top: 4px;
                        left: 4px;
                        font-size: 12px;
                        z-index: 2;
                    }
                    .news-list-item {
                        position: relative;
                    }
                    .load-more-btn {
                        display: block;
                        width: 100%;
                        padding: 12px;
                        margin-top: 8px;
                        background: rgba(94, 245, 240, 0.08);
                        border: 1px solid rgba(94, 245, 240, 0.25);
                        border-radius: 10px;
                        color: #5ef5f0;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .load-more-btn:hover {
                        background: rgba(94, 245, 240, 0.15);
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
                        z-index: 99999;
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
                    /* PHASE 2: TRENDING MEDAL STYLING */
                    /* ═══════════════════════════════════════════════ */
                    .rank.medal-1, .rank.medal-2, .rank.medal-3 {
                        font-size: 18px;
                        line-height: 1;
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
                        gap: 2px;
                        padding: 10px 14px;
                        cursor: pointer;
                        transition: background 0.15s;
                    }
                    .search-suggestion:hover {
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
                        bottom: 24px;
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




                    .section-title :global(svg) {
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

                    /* Force ALL boxes to same size */
                    .news-grid > * {
                        height: 340px !important;
                        min-height: 340px !important;
                        max-height: 340px !important;
                    }

                    .news-grid .news-box,
                    .news-grid .mspt-box {
                        height: 340px !important;
                        min-height: 340px !important;
                        max-height: 340px !important;
                    }

                    @media (max-width: 768px) {
                        /* CRITICAL: Override global 340px height rules */
                        .news-grid > *,
                        .news-grid .news-box,
                        .news-grid .mspt-box {
                            height: auto !important;
                            min-height: auto !important;
                            max-height: none !important;
                        }

                        .news-grid {
                            grid-template-columns: 1fr !important;
                            gap: 0 !important;
                            padding: 0 !important;
                            border-radius: 0 !important;
                            background: transparent !important;
                            box-shadow: none !important;
                            border: none !important;
                            width: 100% !important;
                            max-width: 100vw !important;
                        }

                        /* Remove metallic border overlay */
                        .news-grid::before {
                            display: none !important;
                        }

                        /* ---------------------------------------------------------
                           RESTORED METALLIC FRAME (Mobile Override)
                           --------------------------------------------------------- */
                        
                        /* Restore framed card style */
                        .news-box {
                            height: auto !important;
                            min-height: auto !important;
                            max-height: none !important;
                            aspect-ratio: auto;
                            border-radius: 12px !important;
                            box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important;
                            border: none !important;
                            margin-bottom: 0 !important;
                            background: #1a1c1e;
                            overflow: hidden !important;
                        }

                        /* Chrome frame - border only, no glow */
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

                        /* Full width image 16:9 */
                        .box-image {
                            height: auto !important; 
                            aspect-ratio: 16/9;
                            border-radius: 0 !important;
                        }

                        .box-image img {
                            width: 100% !important;
                            height: 100% !important;
                            object-fit: cover !important;
                            border-radius: 0 !important;
                        }

                        /* Adjust content padding */
                        .box-content {
                            padding: 12px 16px !important;
                        }

                        .box-title {
                            font-size: 16px !important; /* Readability */
                            line-height: 1.4 !important;
                        }
                    }

                    .no-results {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        padding: 60px;
                        color: rgba(255, 255, 255, 0.4);
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

                    .more-stories {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        width: 100%;
                        margin-top: 20px;
                        padding: 14px 20px;
                        background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(139, 92, 246, 0.1));
                        border: 1px solid rgba(0, 212, 255, 0.3);
                        border-radius: 10px;
                        font-size: 14px;
                        font-weight: 500;
                        color: rgba(255, 255, 255, 0.8);
                        cursor: pointer;
                        transition: all 0.3s ease;
                    }

                    .more-stories:hover {
                        background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(139, 92, 246, 0.2));
                        border-color: rgba(0, 212, 255, 0.5);
                        color: #fff;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 15px rgba(0, 212, 255, 0.2);
                    }

                    .collapse-btn {
                        margin-left: auto;
                        padding: 4px 12px;
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        border-radius: 6px;
                        font-size: 12px;
                        color: rgba(255, 255, 255, 0.6);
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .collapse-btn:hover {
                        background: rgba(255, 255, 255, 0.2);
                        color: #fff;
                    }

                    /* More Stories List */
                    .more-section {
                        margin-top: 32px;
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
                        gap: 6px;
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.4);
                    }

                    .list-arrow {
                        color: rgba(255, 255, 255, 0.3);
                    }

                    /* Reels & Videos Preview Sections (on News tab) */
                    .reels-preview-section,
                    .videos-preview-section {
                        position: relative;
                        margin-top: 32px;
                        padding: 24px;
                        border: none;
                        border-radius: 16px;
                        background: 
                            linear-gradient(135deg, rgba(30, 32, 38, 0.95) 0%, rgba(20, 22, 28, 0.98) 100%);
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                        border-image: url('/images/news-icons/section-frame.png') 30 round;
                        overflow: hidden;
                    }
                    
                    .reels-preview-section::before,
                    .videos-preview-section::before {
                        display: none;
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

                    .reels-carousel :global(.reel-card) {
                        flex-shrink: 0 !important;
                        width: 220px !important;
                        max-width: 220px !important;
                    }

                    .reels-carousel :global(.reel-thumbnail) {
                        width: 100% !important;
                        height: 391px !important;
                        aspect-ratio: auto !important;
                        overflow: hidden !important;
                        position: relative !important;
                    }

                    .reels-carousel :global(.reel-thumbnail img) {
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        object-fit: cover !important;
                    }

                    .videos-carousel {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                    }

                    @media (max-width: 768px) {
                        .videos-carousel {
                            grid-template-columns: 1fr;
                        }
                    }

                    /* Videos Section */
                    .videos-section {
                        padding-bottom: 24px;
                    }

                    .videos-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
                        gap: 16px;
                        padding: 20px;
                        background: #1a1c1e;
                        border: 12px solid transparent;
                        border-image: url('/images/news-icons/section-frame.png') 40 40 40 40 stretch;
                        border-radius: 0;
                    }

                    .see-all-videos {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        margin-top: 24px;
                        padding: 14px;
                        background: linear-gradient(135deg, rgba(255, 0, 0, 0.15), rgba(255, 0, 0, 0.05));
                        border: 1px solid rgba(255, 0, 0, 0.3);
                        border-radius: 10px;
                        color: #ff4444;
                        font-size: 14px;
                        font-weight: 600;
                        text-decoration: none;
                        transition: all 0.2s;
                    }

                    .see-all-videos:hover {
                        background: rgba(255, 0, 0, 0.2);
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

                    .widget h4 :global(svg) {
                        color: #2374E1;
                    }

                    /* Newsletter Widget */
                    .newsletter h4 {
                        background: #2374E1;
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .newsletter h4 :global(svg) {
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

                    .leaderboard h4 :global(svg) {
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

                    .mspt h4 :global(svg) {
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
                        color: rgba(255, 255, 255, 0.4);
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

                    .events h4 :global(svg) {
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
                        z-index: 1000;
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

                    /* Light Mode */
                    .news-hub.light {
                        background: #f5f5f7;
                        color: #1a1a2e;
                    }

                    .news-hub.light .header {
                        background: rgba(255, 255, 255, 0.95);
                        border-bottom-color: rgba(0, 0, 0, 0.06);
                    }

                    .news-hub.light .category-bar {
                        background: rgba(255, 255, 255, 0.8);
                    }

                    .news-hub.light .widget {
                        background: #fff;
                        border-color: rgba(0, 0, 0, 0.06);
                    }

                    @media (max-width: 768px) {
                        .header {
                            flex-wrap: wrap;
                            gap: 12px;
                        }

                        .header-left {
                            width: 100%;
                            justify-content: space-between;
                        }

                        .header-right {
                            width: 100%;
                        }

                        .search-box {
                            flex: 1;
                        }

                        .section-tabs {
                            display: flex;
                            width: 100%;
                            justify-content: center;
                            order: 10;
                            margin-top: 0;
                        }

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
                        /* === SCROLL UNLOCK === */
                        body, html, body.antigravity-scroll-lock {
                            overflow-y: auto !important;
                            height: auto !important;
                            position: static !important;
                        }

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

                        /* === HEADER / TABS === */
                        /* SCOPED: Use header.header (tag+class) to target ONLY the news section tabs header,
                           NOT the UniversalHeader component which also has .header-left */
                        header.header {
                            width: 100% !important;
                            max-width: 100vw !important;
                            padding: 0 !important;
                            margin-top: 3px !important;
                            margin-bottom: 3px !important;
                            overflow-x: hidden !important;
                            overflow-y: hidden !important;
                            -webkit-overflow-scrolling: touch;
                            height: auto !important;
                            top: 60px !important; /* Stick BELOW the Universal Header */
                            background: rgba(24, 25, 26, 0.95) !important; /* Ensure opacity */
                            backdrop-filter: blur(10px);
                            z-index: 90 !important;
                        }

                        header.header > .header-left {
                            width: 100% !important;
                            max-width: 100vw !important;
                            overflow-x: hidden !important;
                            justify-content: center !important;
                            height: auto !important;
                        }

                        .section-tabs {
                            overflow-x: hidden !important;
                            width: 100% !important;
                            max-width: 100vw !important;
                            flex-direction: row !important;
                            flex-wrap: nowrap !important;
                            justify-content: center !important;
                            gap: 3px !important;
                            padding: 0 3px !important;
                            margin: 0 !important;
                            -webkit-overflow-scrolling: touch;
                        }

                        .section-tab-img,
                        .refresh-btn-img {
                            flex: 1 1 0 !important;
                            height: auto !important;
                            min-width: 0 !important;
                        }

                        .section-tab-img img,
                        .refresh-btn-img img {
                            width: 100% !important;
                            height: auto !important;
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
                        
                        .reel-card {
                             min-width: 180px !important;
                             width: 180px !important;
                             height: auto !important;
                             flex-shrink: 0 !important;
                             scroll-snap-align: start !important;
                             margin-right: 0 !important;
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

                        /* === MSPT BOX === */
                        .mspt-box {
                            height: auto !important;
                            min-height: auto !important;
                            max-height: none !important;
                            width: 100% !important;
                            border-radius: 0 !important;
                            box-shadow: none !important;
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

            {/* Fullscreen Reels Viewer - TikTok-style inline playback */}
            {reelViewerOpen && reels.length > 0 && (() => {
                const currentReel = reels[reelViewerIndex] || reels[0];
                const videoId = getYouTubeVideoId(currentReel?.video_url);
                const displayTitle = currentReel?.title || currentReel?.caption?.split('\n')[0] || 'Poker Reel';
                const channelName = currentReel?.channel_name || currentReel?.profiles?.full_name || 'Smarter.Poker';

                return (
                    <div
                        style={{
                            position: 'fixed', inset: 0, background: '#000', zIndex: 99999,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                        }}
                        onClick={(e) => { if (e.target === e.currentTarget) setReelViewerOpen(false); }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                                if (reelViewerIndex < reels.length - 1) setReelViewerIndex(prev => prev + 1);
                            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                                if (reelViewerIndex > 0) setReelViewerIndex(prev => prev - 1);
                            } else if (e.key === 'Escape') {
                                setReelViewerOpen(false);
                            }
                        }}
                        tabIndex={0}
                        ref={(el) => el && el.focus()}
                    >
                        {/* Close button - subtle, top-left */}
                        <button
                            onClick={() => setReelViewerOpen(false)}
                            style={{
                                position: 'absolute', top: 16, left: 16, zIndex: 10,
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                                border: 'none', color: 'white', fontSize: 18, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
                            onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}
                        >✕</button>

                        {/* Previous arrow */}
                        {reelViewerIndex > 0 && (
                            <button
                                onClick={() => setReelViewerIndex(prev => prev - 1)}
                                style={{
                                    position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                                    width: 48, height: 48, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.1)', border: 'none',
                                    color: 'white', fontSize: 24, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.25)'}
                                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                            ><ChevronLeft size={28} /></button>
                        )}

                        {/* Next arrow */}
                        {reelViewerIndex < reels.length - 1 && (
                            <button
                                onClick={() => setReelViewerIndex(prev => prev + 1)}
                                style={{
                                    position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                                    width: 48, height: 48, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.1)', border: 'none',
                                    color: 'white', fontSize: 24, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.25)'}
                                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                            ><ChevronRight size={28} /></button>
                        )}

                        {/* Video container */}
                        <div style={{ width: '100%', height: '100%', maxWidth: '100vw', maxHeight: '100vh' }}>
                            {videoId ? (
                                <>
                                <iframe
                                    key={currentReel.id}
                                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&controls=1&showinfo=0&iv_load_policy=3&fs=0&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
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
                                    onEnded={() => {
                                        if (reelViewerIndex < reels.length - 1) setReelViewerIndex(prev => prev + 1);
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
                                {reelViewerIndex + 1} / {reels.length}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}
