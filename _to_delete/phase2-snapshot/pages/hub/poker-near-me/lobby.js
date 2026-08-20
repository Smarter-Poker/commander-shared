/**
 * POKER NEAR ME — LOBBY
 *
 * Architecture:
 *   Layer 1 — Background (LobbyCanvas: cinematic background image, radar, sonar pulses)
 *   Layer 2 — UI Overlay (LobbyOverlay: search, dock, panels)
 *   Layer 3 — Feature Modules (existing components loaded into panels)
 *
 * Data layer:
 *   - API endpoints (/api/poker/venues, etc.)
 *   - Supabase services (favorites, preferences, search history)
 *   - Caching, retry, and analytics logic
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../../src/services/pokerNearMeFavorites';
import { haversineMiles } from '../../../src/components/poker-near-me/pnm-utils';
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory } from '../../../src/services/pokerNearMeSearchHistory';
import { getPokerNearMePreferences, updatePokerNearMePreferences } from '../../../src/services/pokerNearMePreferences';
import { supabase } from '../../../src/lib/supabase';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import useVenueRealtime from '../../../src/hooks/useVenueRealtime';
import { eventBus, EventType } from '../../../src/engine/EventBus';
// BottomNavBar removed — Poker Near Me has its own navigation grid

// ─── Extracted Utilities (Bundle Splitting) ───
import { playClickSound, playPanelOpenSound, playPanelCloseSound } from '../../../src/components/poker-near-me/lobby/PnmSoundUtils';
import { cachedFetch, fetchWithRetry, invalidateCache, PAGE_SIZE, SEARCH_DEBOUNCE_MS, API_CACHE_TTL, LIVE_REFRESH_MS } from '../../../src/components/poker-near-me/lobby/PnmApiCache';
import { getCityCoordinatesMap } from '../../../src/data/city-coordinates';

// Dynamic import — 2D lobby background (client-only, no SSR)
const LobbyCanvas = dynamic(
  () => import('../../../src/components/poker-near-me/lobby/LobbyCanvas').catch(err => {
    console.warn('[PokerNearMeLobby] LobbyCanvas module failed to load:', err);
    return { default: () => null };
  }),
  { ssr: false }
);
const LobbyOverlay = dynamic(
  () => import('../../../src/components/poker-near-me/lobby/LobbyOverlay').catch(err => {
    console.warn('[PokerNearMeLobby] LobbyOverlay failed to load:', err);
    return { default: () => null };
  }),
  { ssr: false }
);

// Feature modules — loaded into the panel when a pod is clicked
const ManualLocationModal = dynamic(() => import('../../../src/components/poker-near-me/modals/ManualLocationModal'), { ssr: false });
const LocationEnablePopup = dynamic(() => import('../../../src/components/poker-near-me/modals/LocationEnablePopup'), { ssr: false });
const LoginPromptModal = dynamic(() => import('../../../src/components/poker-near-me/modals/LoginPromptModal'), { ssr: false });
const VenueCard = dynamic(() => import('../../../src/components/poker-near-me/VenueCard'), { ssr: false });
const TourCard = dynamic(() => import('../../../src/components/poker-near-me/TourCard'), { ssr: false });
const SeriesCard = dynamic(() => import('../../../src/components/poker-near-me/NewSeriesVenueCard'), { ssr: false });
const LiveGamesFeed = dynamic(() => import('../../../src/components/poker-near-me/LiveGamesFeed'), { ssr: false });
const NearMeNowFeed = dynamic(() => import('../../../src/components/poker-near-me/NearMeNowFeed'), { ssr: false });
const VenueCompare = dynamic(() => import('../../../src/components/poker-near-me/VenueCompare'), { ssr: false });
const RoadTripPlanner = dynamic(() => import('../../../src/components/poker-near-me/RoadTripPlanner'), { ssr: false });
const SocialLayer = dynamic(() => import('../../../src/components/poker-near-me/SocialLayer'), { ssr: false });
const TournamentAlerts = dynamic(() => import('../../../src/components/poker-near-me/TournamentAlerts'), { ssr: false });
const SeasonalCalendar = dynamic(() => import('../../../src/components/poker-near-me/SeasonalCalendar'), { ssr: false });
const TripCostCalculator = dynamic(() => import('../../../src/components/poker-near-me/TripCostCalculator'), { ssr: false });
const FilterPanel = dynamic(() => import('../../../src/components/poker-near-me/FilterPanel'), { ssr: false });
const VoiceSearch = dynamic(() => import('../../../src/components/poker-near-me/VoiceSearch'), { ssr: false });
const VenueReviews = dynamic(() => import('../../../src/components/poker-near-me/VenueReviews'), { ssr: false });
const VenueMapPanel = dynamic(() => import('../../../src/components/poker-near-me/VenueMapPanel'), { ssr: false });
const ScraperHealthDashboard = dynamic(() => import('../../../src/components/poker-near-me/ScraperHealthDashboard'), { ssr: false });
const PeakActivityHeatmap = dynamic(() => import('../../../src/components/poker-near-me/PeakActivityHeatmap'), { ssr: false });
const GameTrendsDashboard = dynamic(() => import('../../../src/components/poker-near-me/GameTrendsDashboard'), { ssr: false });
const DailyTournamentsPanel = dynamic(() => import('../../../src/components/poker-near-me/DailyTournamentsPanel'), { ssr: false });
const VenueGameAlerts = dynamic(() => import('../../../src/components/poker-near-me/VenueGameAlerts'), { ssr: false });
const GeofenceAlertBanner = dynamic(() => import('../../../src/components/poker-near-me/GeofenceAlertBanner'), { ssr: false });
const GlobalSearchOverlay = dynamic(() => import('../../../src/components/poker-near-me/GlobalSearchOverlay'), { ssr: false });
const PodVenueSearchEngine = dynamic(() => import('../../../src/components/poker-near-me/lobby/PodVenueSearchEngine'), { ssr: false });
const PodHomeGames = dynamic(() => import('../../../src/components/poker-near-me/lobby/PodHomeGames'), { ssr: false });
const PodTours = dynamic(() => import('../../../src/components/poker-near-me/lobby/PodTours'), { ssr: false });
const PodSeries = dynamic(() => import('../../../src/components/poker-near-me/lobby/PodSeries'), { ssr: false });

// ─── Error Boundary for Pod Content ───
class PodErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.warn(`[PNM] Pod "${this.props.podName}" crashed:`, error, info); }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { style: { textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.5)' } },
        React.createElement('div', { style: { fontSize: 36, marginBottom: 12, opacity: 0.3 } }, '\u26A0'),
        React.createElement('p', { style: { fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#f59e0b' } }, `"${this.props.podName}" encountered an error`),
        React.createElement('p', { style: { fontSize: 12, marginBottom: 16, color: 'rgba(200,214,229,0.35)' } }, String(this.state.error?.message || 'Unknown error')),
        React.createElement('button', {
          onClick: () => { this.setState({ hasError: false, error: null }); if (this.props.onReset) this.props.onReset(); },
          style: { padding: '8px 20px', borderRadius: 20, border: '1px solid rgba(212,168,83,0.25)', background: 'rgba(212,168,83,0.08)', color: '#d4a853', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
        }, 'Reset Pod')
      );
    }
    return this.props.children;
  }
}

// ─── Constants (cache/retry/page-size imported from PnmApiCache) ───

// Popular cities for autocomplete
const POPULAR_CITIES = [
  'Las Vegas, NV', 'Los Angeles, CA', 'Phoenix, AZ', 'Houston, TX', 'Miami, FL',
  'New York, NY', 'Chicago, IL', 'Denver, CO', 'Atlanta, GA', 'Seattle, WA',
  'San Francisco, CA', 'Dallas, TX', 'Orlando, FL', 'San Diego, CA', 'Tampa, FL',
  'Portland, OR', 'Nashville, TN', 'Austin, TX', 'New Orleans, LA', 'Philadelphia, PA',
  'Detroit, MI', 'Minneapolis, MN', 'Boston, MA', 'Sacramento, CA', 'Reno, NV',
  'Atlantic City, NJ', 'Biloxi, MS', 'Tunica, MS', 'Cherokee, NC', 'Tulsa, OK',
];

// Sort options
const SORT_OPTIONS = [
  { value: 'trust', label: 'Trust Score' },
  { value: 'distance', label: 'Distance' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'rating', label: 'Rating' },
  { value: 'games', label: 'Active Games' },
  { value: 'newest', label: 'Newest' },
];

// fetchWithRetry imported from PnmApiCache

const POD_FEATURES = {
  search: { title: 'Search Venues', tab: 'venues' },
  nearme: { title: 'Near Me', tab: 'nearnow' },
  homegames: { title: 'Home Games', tab: 'homegames' },
  livegames: { title: 'Live Games', tab: 'live' },
  mapview: { title: 'Map View', tab: 'map' },
  tours: { title: 'Tours', tab: 'tours' },
  calendar: { title: 'Calendar', tab: 'calendar' },
  daily: { title: 'Daily', tab: 'daily' },
  series: { title: 'Series', tab: 'series' },
  roadtrip: { title: 'Trip Planner', tab: 'roadtrip' },
  favorites: { title: 'Saved', tab: 'favorites' },
  social: { title: 'Friends', tab: 'social' },
  alerts: { title: 'Alerts', tab: 'alerts' },
  tripcost: { title: 'Trip Cost Calculator', tab: 'tripcost' },
  compare: { title: 'Compare Venues', tab: 'compare' },
  scraperhealth: { title: 'Scraper Health', tab: 'scraperhealth' },
  peakheatmap: { title: 'Peak Activity', tab: 'peakheatmap' },
  gametrends: { title: 'Game Trends', tab: 'gametrends' },
  gamealerts: { title: 'Game Alerts', tab: 'gamealerts' },
};

// DailyTournamentsPanel — loaded via dynamic import above (Bundle Splitting)

export default function PokerNearMeLobby() {
  const router = useRouter();
  const { user } = useAvatar();
  const userId = user?.id;

  const fetchSequenceRef = useRef(0);
  const fetchDailySeqRef = useRef(0);

  // 🚌 Bus — emit SESSION_START on mount, SESSION_END on unmount
  const bus = useTrainingBus('poker-near-me-lobby');

  // ─── Global EventBus for cross-component communication ───
  // Listen for venue:favorite / venue:unfavorite events on the GLOBAL eventBus
  // NOTE: useTrainingBus returns emit-only helpers — it does NOT support .on() subscriptions.
  //       All listeners MUST use eventBus.on() directly.
  useEffect(() => {
    // --- Semantic Entry Reset ---
    // When hitting the lobby natively, enforce default 50-mile radius
    try {
        if (!sessionStorage.getItem('pnm-radius-set-this-session')) {
            let parsed = {};
            try {
                const savedStr = localStorage.getItem('poker-near-me-search-filters');
                parsed = savedStr ? JSON.parse(savedStr) : {};
            } catch (_parseErr) { console.warn('[App] Handled exception:', _parseErr?.message || _parseErr); }
            parsed.radius = 50;
            localStorage.setItem('poker-near-me-search-filters', JSON.stringify(parsed));
            // Force Lobby's default pod memory to 50mi immediately
            setFilters(prev => ({ ...prev, nmRadius: '50' }));
            sessionStorage.setItem('pnm-radius-set-this-session', 'true');
        }
    } catch (e) {
        console.warn('Failed to reset radius on entry', e);
    }

    const unsubFav = eventBus.on('venue:favorite', (event) => {
      const venueId = event?.payload?.venueId || event?.venueId;
      if (venueId) setFavorites(prev => ({ ...prev, ['venue-' + venueId]: true }));
    });
    
    const unsubFilters = eventBus.on('PNM_FILTERS_UPDATED', (event) => {
      const activeFilters = event?.payload || event;
      if (activeFilters && activeFilters.radius != null) {
        // Cap incoming radius to prevent rogue events from setting huge values
        const raw = activeFilters.radius;
        const capped = raw === 'any' ? 'any' : String(Math.min(parseInt(raw, 10) || 50, 150));
        setFilters(prev => ({ ...prev, nmRadius: capped }));
      }
    });

    const unsubUnfav = eventBus.on('venue:unfavorite', (event) => {
      const venueId = event?.payload?.venueId || event?.venueId;
      if (venueId) {
        setFavorites(prev => {
          const newState = { ...prev };
          delete newState['venue-' + venueId];
          return newState;
        });
      }
    });

    const unsubSeriesFav = eventBus.on('series:favorite', (event) => {
      const seriesId = event?.payload?.seriesId || event?.seriesId;
      if (seriesId) setFavorites(prev => ({ ...prev, ['series-' + seriesId]: true }));
    });

    const unsubSeriesUnfav = eventBus.on('series:unfavorite', (event) => {
      const seriesId = event?.payload?.seriesId || event?.seriesId;
      if (seriesId) {
        setFavorites(prev => {
          const next = { ...prev };
          delete next['series-' + seriesId];
          return next;
        });
      }
    });

    return () => {
      if (typeof unsubFav === 'function') unsubFav();
      if (typeof unsubUnfav === 'function') unsubUnfav();
      if (typeof unsubSeriesFav === 'function') unsubSeriesFav();
      if (typeof unsubSeriesUnfav === 'function') unsubSeriesUnfav();
      if (typeof unsubFilters === 'function') unsubFilters();
    };
  }, []);

  // ─── Listen for VENUE_CHECKIN_CREATED events to update badge counts in real-time ───
  useEffect(() => {
    const unsub = eventBus.on(EventType.VENUE_CHECKIN_CREATED, (event) => {
      // EventBus wraps data in { type, payload, timestamp, source }
      const venueId = event?.payload?.venueId || event?.venueId;
      if (venueId) {
        setCheckinCounts(prev => ({ ...prev, [String(venueId)]: (prev[String(venueId)] || 0) + 1 }));
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // ─── Listen for review submissions to refresh review stats for that venue ───
  useEffect(() => {
    const handleReviewSubmitted = (e) => {
      const venueId = e?.detail?.venueId;
      if (!venueId) return;
      // Re-fetch stats for this specific venue to show updated rating
      fetch('/api/poker/reviews?stats_only=true&venue_ids=' + venueId)
        .then(r => r.json())
        .then(j => {
          if (j.success && j.stats) {
            setReviewStatsMap(prev => ({ ...prev, ...j.stats }));
          }
        })
        .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
    };
    window.addEventListener('pnm:review-submitted', handleReviewSubmitted);
    return () => window.removeEventListener('pnm:review-submitted', handleReviewSubmitted);
  }, []);

  // ─── Core State ───
  const [activePod, setActivePod] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // [LOBBY-BUG-1 FIX] Ref mirrors searchQuery so the RT subscription callback (useEffect [])
  // always reads the CURRENT search query, not the mount-time stale closure value.
  // Without this, a venue INSERT fires fetchVenues('') even if the user typed a search query.
  const searchQueryRef = useRef('');
  const [menuOpen, setMenuOpen] = useState(false);
  // ═══ GLOBAL SEARCH OVERLAY ═══
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [sortBy, setSortBy] = useState('distance');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({});

  const [showVoiceSearch, setShowVoiceSearch] = useState(false);
  const [selectedVenueForReview, setSelectedVenueForReview] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [preferences, setPreferences] = useState({ geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [geofenceAlert, setGeofenceAlert] = useState(null);
  const [geofenceStatus, setGeofenceStatus] = useState(null); // 'active' | 'denied' | 'error'
  const geofenceRef = useRef(null);
  // ─── Location Prompt Dismissal (ONE-TIME-AND-DONE) ───
  // Once the user enables location OR dismisses the prompt, we never auto-show it again.
  // Persisted via localStorage (instant, no-auth) + Supabase prefs (cross-device).
  // Also restored from pnm_location_enabled flag (set on GPS success).
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pnm_location_prompt_dismissed') === '1'
        || localStorage.getItem('pnm_location_enabled') === '1';
    }
    return false;
  });
  const [globalLeaders, setGlobalLeaders] = useState([]);

  // ─── Data State ───
  const [venues, setVenues] = useState([]);
  const [tours, setTours] = useState([]);
  const [toursLoaded, setToursLoaded] = useState(false);
  const [series, setSeries] = useState([]);
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [dailyTournaments, setDailyTournaments] = useState([]);
  const [podSearchVenues, setPodSearchVenues] = useState(null);
  const [podHomeGames, setPodHomeGames] = useState(null);
  // liveGames state removed — LiveGamesFeed manages its own live data via WebSocket
  const [favorites, setFavorites] = useState({});
  const [favoritedVenues, setFavoritedVenues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [checkinCounts, setCheckinCounts] = useState({});
  const [liveGameCount, setLiveGameCount] = useState(0);
  const [totalVenueCount, setTotalVenueCount] = useState(0);
  const [todaysTournamentCount, setTodaysTournamentCount] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);

  // ─── Location State ───
  const [userLocation, setUserLocation] = useState(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [locationToast, setLocationToast] = useState(null); // { city, state } for success toast
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [manualGeocoding, setManualGeocoding] = useState(false);
  // ─── Smart Permission State ───
  const [permissionState, setPermissionState] = useState('prompt'); // 'prompt' | 'denied' | 'granted'
  const [showEnablePopup, setShowEnablePopup] = useState(false);
  const [deviceType, setDeviceType] = useState('desktop'); // 'ios' | 'android' | 'desktop'
  const [manualCity, setManualCity] = useState('');
  const [manualState, setManualState] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationState, setLocationState] = useState('');
  const locationToastTimeoutRef = useRef(null);
  // [LOBBY-BUG-1 FIX] Keep searchQueryRef in sync with state for RT subscription
  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);

  // ─── Menu config ───
  const menuConfig = useMemo(() => getMenuConfig('poker-near-me', null, {}, {
    replayTutorial: () => { setShowTutorial(true); setMenuOpen(false); },
  }), []);

  // ─── Deep Link: hydration guard ───
  // Prevents the write-back effect from clearing URL params before mount reads them
  const hasHydratedRef = useRef(false);

  // ─── Deep Link: read URL params on mount ───
  // Uses URLSearchParams directly instead of router.query (which can be empty on first render)
  // Panel opening is delayed via double-rAF to survive React #418 hydration mismatches
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pod = params.get('pod');
    const q = params.get('q');
    if (q) {
      setSearchQuery(q);
      // Deep-link search: fetch venues matching the URL query
      const deepUrl = `/api/poker/venues?limit=200&offset=0&search=${encodeURIComponent(q)}&sort=trust`;
      cachedFetch(deepUrl).then(data => {
        const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
        setVenues(newVenues);
        setHasMore(newVenues.length >= PAGE_SIZE);
        setPage(0);
      }).catch(err => console.warn('Deep-link venue fetch failed:', err));
    }

    if (pod && POD_FEATURES[pod]) {
      // Read filter params from URL for deep-link restoration
      const state = params.get('state');
      const game = params.get('game');
      const sort = params.get('sort');
      const radius = params.get('radius');
      if (state || game || sort || radius) {
        // Cap URL-supplied radius to 150mi to prevent deep-link abuse
        const safeUrlRadius = radius && radius !== 'any'
          ? String(Math.min(parseInt(radius, 10) || 50, 150))
          : radius;
        setFilters(prev => ({
          ...prev,
          ...(state ? { selectedState: state, nmState: state } : {}),
          ...(game ? { gameType: game, nmGameType: game } : {}),
          ...(safeUrlRadius ? { radius: safeUrlRadius, nmRadius: safeUrlRadius } : {}),
        }));
        if (sort) setSortBy(sort);
      }
      // Double requestAnimationFrame ensures React has fully committed hydration
      // before we trigger a state update that adds new DOM nodes (the panel).
      // Single rAF isn't enough because React may still be reconciling.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActivePod(pod);
          setShowPanel(true);
          hasHydratedRef.current = true;
        });
      });
    } else {
      hasHydratedRef.current = true;
    }
  }, []);

  // ─── Deep Link: write URL params on state change ───
  // IMPORTANT: Use window.history.replaceState — NOT router.replace.
  // router.replace causes a re-render cycle that resets component state,
  // killing the panel and 3D scene. replaceState updates the URL silently.
  useEffect(() => {
    // Skip write-back until mount effect has read the URL params
    if (!hasHydratedRef.current) return;

    const params = new URLSearchParams();
    if (activePod) params.set('pod', activePod);
    if (searchQuery) params.set('q', searchQuery);
    // Persist filter state for shareable URLs
    if (filters.selectedState && filters.selectedState !== 'all') params.set('state', filters.selectedState);
    if (filters.gameType) params.set('game', filters.gameType);
    if (sortBy && sortBy !== 'trust') params.set('sort', sortBy);
    if (filters.radius && filters.radius !== '100') params.set('radius', filters.radius);
    const qs = params.toString();
    const newUrl = qs ? `/hub/poker-near-me/lobby?${qs}` : '/hub/poker-near-me/lobby';
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [activePod, searchQuery, filters.selectedState, filters.gameType, sortBy, filters.radius]);

  // ─── Fetch venues ───
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;

  const fetchVenues = useCallback(async (query = '', pageNum = 0, append = false) => {
    const currentSeq = ++fetchSequenceRef.current;
    setLoading(true);
    setFetchError(null);
    try {
      let url = `/api/poker/venues?limit=${PAGE_SIZE}&offset=${pageNum * PAGE_SIZE}`;
      if (query) url += `&search=${encodeURIComponent(query)}`;
      const activeLoc = userLocationRef.current;
      const activeFilters = filtersRef.current;
      const activeSort = sortByRef.current;
      
      if (activeLoc) {
        // STRICT RADIUS ENFORCEMENT: parse, cap at 150mi, default 50mi.
        // Never trust raw filter string — stale URL params or sessions
        // can carry old large values (100, 200, etc.) and bypass the 50mi default.
        const rawRadius = activeFilters.radius;
        const parsedRadius = rawRadius === 'any' ? null : parseInt(rawRadius, 10);
        const safeRadius = (!parsedRadius || isNaN(parsedRadius))
          ? 50
          : Math.min(parsedRadius, 150);
        if (rawRadius === 'any') {
          url += `&lat=${activeLoc.lat}&lng=${activeLoc.lng}`;
        } else {
          url += `&lat=${activeLoc.lat}&lng=${activeLoc.lng}&radius=${safeRadius}`;
        }
      }
      if (activeSort) url += `&sort=${activeSort}`;
      // Apply filters
      if (activeFilters.gameType) url += `&game_type=${activeFilters.gameType}`;
      if (activeFilters.stakes) url += `&stakes=${activeFilters.stakes}`;
      if (activeFilters.venueType) url += `&venue_type=${activeFilters.venueType}`;
      if (activeFilters.selectedState && activeFilters.selectedState !== 'all') url += `&state=${activeFilters.selectedState}`;

      const data = await fetchWithRetry(url);
      if (fetchSequenceRef.current !== currentSeq) return;
      const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      if (append) {
        setVenues(prev => [...prev, ...newVenues]);
      } else {
        setVenues(newVenues);
      }
      setHasMore(newVenues.length >= PAGE_SIZE);
      setPage(pageNum);
    } catch (err) {
      if (fetchSequenceRef.current !== currentSeq) return;
      console.warn('Failed to fetch venues:', err);
      setFetchError('Unable to load venues. Please try again.');
    } finally {
      if (fetchSequenceRef.current === currentSeq) {
        setLoading(false);
      }
    }
  }, []);

  // ─── Load more ───
  const loadMore = useCallback(() => {
    fetchVenues(searchQuery, page + 1, true);
  }, [fetchVenues, searchQuery, page]);

  // ─── Fetch tours (traveling tours from poker_tours API) ───
  const fetchTours = useCallback(async () => {
    try {
      let url = '/api/poker/tours?include_series=true';
      // We don't apply userLocation radius here because tours are traveling; we filter them locally based on upcoming stops.
      const data = await cachedFetch(url);
      const tourData = data?.data || data?.tours || (Array.isArray(data) ? data : []);
      setTours(tourData);
    } catch (err) {
      console.warn('Failed to fetch tours:', err);
    } finally {
      setToursLoaded(true);
    }
  }, []);

  // ─── City coordinates from shared module (single source of truth) ───
  const CITY_COORDS = useMemo(() => getCityCoordinatesMap(), []);

  const getNearestTourDistance = useCallback((tour, userLoc) => {
      if (!userLoc) return null;
      let minDistance = 99999;
      // 1. If tour inherently has coordinates
      if (tour.latitude && tour.longitude) {
          minDistance = haversineMiles(userLoc.lat, userLoc.lng, tour.latitude, tour.longitude);
      }
      
      // 2. Check all upcoming series locations
      const allStops = [
          ...(tour.upcoming_series || []),
          ...(tour.stops_2026 || []),
          ...(tour.series_2026 || [])
      ];
      
      for (const stop of allStops) {
          const locStr = (stop.location || stop.city || '').toLowerCase();
          const cityParts = locStr.includes(',') ? locStr.split(',') : [locStr];
          const cityKey = locStr.trim();
          
          let coords = CITY_COORDS[cityKey];
          if (!coords && cityParts[0]) {
              const justCity = cityParts[0].trim();
              coords = Object.entries(CITY_COORDS || {}).find(([k]) => k.startsWith(justCity + ','))?.[1];
          }
          
          if (coords) {
              const d = haversineMiles(userLoc.lat, userLoc.lng, coords.lat, coords.lng);
              if (d < minDistance) minDistance = d;
          }
      }
      return minDistance === 99999 ? null : minDistance;
  }, [CITY_COORDS]);

  // ─── Fetch favorites ───
  const fetchFavorites = useCallback(async () => {
    const favMap = {};
    const favVenueList = [];

    // 1. Sync Series/Tours from LocalStorage
    try {
      const followedSeries = JSON.parse(localStorage.getItem('followed-series') || '[]');
      followedSeries.forEach(id => { favMap[`series-${id}`] = true; });
    } catch (e) { console.warn('[App] Handled exception:', e); }

    // 2. Fetch Venues from DB if logged in
    if (userId) {
      try {
        const favs = await getVenueFavorites(userId);
        (favs || []).forEach(f => {
          if (!f || !f.venue_id) return; // skip malformed entries
          favMap['venue-' + f.venue_id] = true;
          favVenueList.push({
            id: f.venue_id,
            name: f.venue_name || 'Unknown Venue',
            address: f.venue_address || '',
            city: f.venue_city || '',
            state: f.venue_state || '',
            _fromFavorites: true,
          });
        });
      } catch (err) {
        console.warn('Failed to fetch venue favorites:', err);
      }
    }
    
    setFavorites(favMap);
    setFavoritedVenues(favVenueList);
  }, [userId]);

  // ─── Fetch series (from actual tournament_series table via /api/poker/series) ───
  const fetchSeries = useCallback(async () => {
    try {
      let url = '/api/poker/series?upcoming=true&limit=200';
      if (userLocation) url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=500`;
      const data = await cachedFetch(url);
      const seriesData = data?.data || data?.series || (Array.isArray(data) ? data : []);
      setSeries(seriesData);
    } catch (err) {
      console.warn('Failed to fetch series:', err);
    } finally {
      setSeriesLoaded(true);
    }
  }, [userLocation]);

  // ─── Fetch daily tournaments — [W1 FIX] removed unused lat/lng/radius (API ignores them) ───
  const fetchDaily = useCallback(async (dayFilter = '') => {
    const currentSeq = ++fetchDailySeqRef.current;
    try {
      let url = '/api/poker/daily-tournaments';
      if (dayFilter) url += `?day=${encodeURIComponent(dayFilter)}`;
      const data = await cachedFetch(url);
      if (fetchDailySeqRef.current !== currentSeq) return;
      if (data?.data) setDailyTournaments(data.data);
      else if (data?.tournaments) setDailyTournaments(data.tournaments);
      else if (Array.isArray(data)) setDailyTournaments(data);
      // Use authoritative count from API (includes venue daily + charity + tour series events)
      if (data?.stats?.total != null) {
        setTodaysTournamentCount(data.stats.total);
      }
    } catch (err) {
      if (fetchDailySeqRef.current !== currentSeq) return;
      console.warn('Failed to fetch daily tournaments:', err);
    }
  }, []); // No userLocation dep — API doesn’t accept lat/lng

  // [HARDENING] Real-time synchronization for global table/venue changes on Lobby Panel.
  // [RT2 FIX] Invalidate cachedFetch for daily-tournaments before fetching so the
  // next manual fetchDaily call also gets fresh data (not stale cached 60s-TTL data).
  // [LB7 FIX] Stale closure: filters.dailyDay was captured at mount in the RT callback.
  // Now use a ref so the callback always reads the CURRENT day filter, not mount-time value.
  const dailyDayFilterRef = useRef(null);
  useEffect(() => {
    dailyDayFilterRef.current = (filters.dailyDay === 'all' || !filters.dailyDay) ? null : filters.dailyDay;
  }, [filters.dailyDay]);


  // [W3 FIX] Re-fetch daily tournaments when userLocation becomes available
  // (mount fires before GPS resolves, so initial fetchDaily gets no location context)
  // Debounced 3s to avoid double-firing on rapid location updates.
  const locationFetchTimerRef = useRef(null);
  useEffect(() => {
    if (!userLocation) return; // Only fire when location actually resolves
    if (locationFetchTimerRef.current) clearTimeout(locationFetchTimerRef.current);
    locationFetchTimerRef.current = setTimeout(() => {
      fetchDaily();
    }, 3000);
    return () => {
      if (locationFetchTimerRef.current) clearTimeout(locationFetchTimerRef.current);
    };
  }, [userLocation, fetchDaily]);

  // ─── Live games are fetched by <LiveGamesFeed> component directly ───

  // ─── Fetch search history ───
  const fetchSearchHistory = useCallback(async () => {
    if (!userId) return;
    try {
      const history = await getSearchHistory(userId, 10);
      setSearchHistory(history || []);
    } catch (err) {
      console.warn('Failed to fetch search history:', err);
    }
  }, [userId]);

  // ─── Fetch user preferences ───
  const fetchPreferences = useCallback(async () => {
    if (!userId) {
      setPrefsLoaded(true); // No user — use defaults, allow auto-prompt
      return;
    }
    try {
      const prefs = await getPokerNearMePreferences(userId);
      setPreferences(prefs);
    } catch (err) {
      console.warn('Failed to fetch preferences:', err);
    } finally {
      setPrefsLoaded(true);
    }
  }, [userId]);

  // ─── Initial data load — mount only ───
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return; // Already loaded
    didMountRef.current = true;
    // Skip default venue fetch if a deep-link search query is present
    // (the deep-link effect already fetched the correct filtered results)
    const deepQ = new URLSearchParams(window.location.search).get('q');
    if (!deepQ) fetchVenues();
    fetchTours();
    fetchSeries();
    fetchDaily();
    fetchFavorites();
    fetchSearchHistory();
    fetchPreferences();
    setLastFetchTime(Date.now());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Real-time Supabase Data Hydration ───
  // [L1 FIX + BILLING FIX] Consolidated 4 independent Realtime WebSockets into ONE multiplexed SWR channel
  // via `useVenueRealtime`. This reduces Concurrent WebSocket usage by 75% per lobby visitor.
  useVenueRealtime((payload) => {
    if (!payload || !payload.table) {
        // [LB9 FIX] Hard reconnect / visibility refresh. Since lobby.js uses static local arrays
        // instead of SWR bindings, we must manually trigger a master re-fetch here if the mobile 
        // OS suspends the background tab and restores the WebSocket pipeline later.
        handleRefreshAll();
        return;
    }

    if (payload.table === 'poker_venues') {
        if (payload.eventType === 'UPDATE') {
          setVenues(prev => prev.map(v => v.id === payload.new.id ? { ...v, ...payload.new } : v));
        } else if (payload.eventType === 'INSERT') {
          fetchVenues(searchQueryRef.current);
        } else if (payload.eventType === 'DELETE') {
          setVenues(prev => prev.filter(v => v.id !== payload.old.id));
        }
    } 
    else if (payload.table === 'tour_source_registry') {
        if (payload.eventType === 'UPDATE') setTours(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t));
        else if (payload.eventType === 'DELETE') setTours(prev => prev.filter(t => t.id !== payload.old.id));
    } 
    else if (payload.table === 'tournament_series' || payload.table === 'poker_series') {
        if (payload.eventType === 'UPDATE') setSeries(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s));
        else if (payload.eventType === 'DELETE') setSeries(prev => prev.filter(s => s.id !== payload.old.id));
    } 
    else if (payload.table === 'venue_daily_tournaments') {
        // Bust the cache for all daily-tournament URLs so next cachedFetch bypasses TTL
        invalidateCache('/api/poker/daily-tournaments');
        // [LB7 FIX] Read current day filter from ref — not stale closure
        const dayFilter = dailyDayFilterRef.current;
        let url = '/api/poker/daily-tournaments';
        const params = [`_rt=${Date.now()}`];
        if (dayFilter) params.push(`day=${encodeURIComponent(dayFilter)}`);
        url += '?' + params.join('&');
        
        fetch(url)
            .then(r => r.json())
            .then(data => {
                if (data?.data) setDailyTournaments(data.data);
                else if (data?.tournaments) setDailyTournaments(data.tournaments);
                else if (Array.isArray(data)) setDailyTournaments(data);
                if (data?.stats?.total != null) setTodaysTournamentCount(data.stats.total);
            })
            .catch(console.warn);
    }
  });

  // ─── Batch fetch check-in counts when venues change ───
  // [LB5 FIX] URL was unbounded (up to 200 IDs * 37 chars = 7,400 chars) — approaching nginx URL length limits.
  // Cap at 100 IDs per request to stay well under the 8,192-char limit.
  const checkinCountsRef = useRef(checkinCounts);
  checkinCountsRef.current = checkinCounts;
  
  useEffect(() => {
    if (venues.length === 0) return;
    // Only fetch counts for IDs we haven't already fetched
    const newIds = venues
      .map(v => v.id)
      .filter(id => id && checkinCountsRef.current[String(id)] === undefined)
      .slice(0, 100);
      
    if (newIds.length === 0) return;
    const ids = newIds.join(',');
    
    fetch('/api/poker/checkins/batch-counts?venue_ids=' + ids)
      .then(r => r.json())
      .then(j => { if (j.success && j.counts) setCheckinCounts(prev => ({ ...prev, ...j.counts })); })
      .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
  }, [venues]);

  // ─── Batch fetch review stats for venue cards (star ratings) ───
  const [reviewStatsMap, setReviewStatsMap] = useState({});
  const reviewStatsMapRef = useRef(reviewStatsMap);
  reviewStatsMapRef.current = reviewStatsMap;
  useEffect(() => {
    if (venues.length === 0) return;
    // Only fetch stats for IDs we haven't already fetched
    const newIds = venues
      .map(v => v.id)
      .filter(id => id && !reviewStatsMapRef.current[String(id)])
      .slice(0, 50);
    if (newIds.length === 0) return;
    const idStr = newIds.join(',');
    fetch('/api/poker/reviews?stats_only=true&venue_ids=' + idStr)
      .then(r => r.json())
      .then(j => { if (j.success && j.stats) setReviewStatsMap(prev => ({ ...prev, ...j.stats })); })
      .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
  }, [venues]);

  // ─── Fetch global check-in leaderboard (cross-venue top users) ───
  useEffect(() => {
    fetch('/api/poker/checkins/global-leaderboard?period=month')
      .then(r => r.json())
      .then(j => { if (j.success && j.leaders) setGlobalLeaders(j.leaders.slice(0, 5)); })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, []);

  // ─── Fetch live game count + build live data map for VenueCards ───
  // FIXED: was one-shot on mount. Now refreshes every 15 minutes to match scraper cadence.
  const [liveDataMap, setLiveDataMap] = useState({});
  const buildLobbyLiveDataMap = useCallback(() => {
    fetch('/api/poker/live-tables')
      .then(r => r.json())
      .then(j => {
        if (j.metadata?.total_tables_running != null) {
          setLiveGameCount(j.metadata.total_tables_running);
        } else if (j.venues) {
          const total = j.venues.reduce((sum, v) => sum + v.games.reduce((s, g) => s + (g.tables_running || 0), 0), 0);
          setLiveGameCount(total);
        }
        // Build name-keyed map for card injection
        if (Array.isArray(j.venues)) {
          const map = {};
          j.venues.forEach(v => {
            const normName = (v.venue_name || '').toLowerCase()
              .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
              .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
            const totalTables = v.games.reduce((s, g) => s + (g.tables_running || 0), 0);
            const totalWaiting = v.games.reduce((s, g) => s + (g.players_waiting || 0), 0);
            const liveEntry = { tables_running: totalTables, players_waiting: totalWaiting, games: v.games || [], last_updated: v.last_updated, bravo_slug: v.bravo_slug };
            if (v.bravo_slug) map[v.bravo_slug] = liveEntry;
            if (normName) map[normName] = liveEntry;
          });
          setLiveDataMap(map);
        }
      })
      .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
  }, []);
  useEffect(() => {
    buildLobbyLiveDataMap(); // Initial fetch on mount
    const refreshTimer = setInterval(buildLobbyLiveDataMap, 15 * 60 * 1000); // 15-min refresh
    return () => clearInterval(refreshTimer);
  }, [buildLobbyLiveDataMap]);

  // Merge live_data into venue objects whenever venues or liveDataMap changes
  // FIXED: was guarded by _liveMerged one-shot flag — venues only merged once and never updated.
  // Now always re-merges on liveDataMap change, using last_updated timestamp to skip unchanged venues.
  useEffect(() => {
    if (venues.length === 0 || Object.keys(liveDataMap || {}).length === 0) return;
    setVenues(prev => {
      let changed = false;
      const next = prev.map(venue => {
        const normName = (venue.name || '').toLowerCase()
          .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
          .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
        const liveEntry = (venue.bravo_slug && liveDataMap[venue.bravo_slug]) || liveDataMap[normName] || null;
        const newLiveData = (liveEntry && liveEntry.tables_running > 0) ? liveEntry : null;
        const curTs = venue.live_data?.last_updated;
        const newTs = newLiveData?.last_updated;
        if (!newLiveData && !venue.live_data) return venue;
        if (curTs && newTs && curTs === newTs) return venue;
        changed = true;
        return newLiveData
          ? { ...venue, live_data: newLiveData }
          : { ...venue, live_data: null };
      });
      return changed ? next : prev;
    });
  }, [liveDataMap]); // Only re-run when live data changes, not on every venue update



  // ─── Fetch total venue count (platform-wide) ───
  // [LB2 FIX] Was fetched with ?v=Date.now() — this busted Vercel edge cache on every visit,
  // forcing expensive origin fetches for a static file. Changed to a stable build-time version string.
  useEffect(() => {
    fetch('/data/all-venues.json?v=1')
      .then(r => r.json())
      .then(json => {
        const v = json.venues || json.data || json || [];
        const filteredVenues = Array.isArray(v) ? v.filter(venue => venue.venue_type !== 'series' && venue.is_active !== false) : [];
        const count = filteredVenues.length;
        if (count > 0) setTotalVenueCount(count);
      })
      .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
  }, []);

  // ─── Refresh all data callback ───
  const handleRefreshAll = useCallback(() => {
    setLastFetchTime(Date.now());
    fetchVenues(searchQuery);
    fetchTours();
    fetchSeries();
    fetchDaily();
    if (userId) {
      fetchFavorites();
      fetchSearchHistory();
    }
    // Re-fetch live game count + rebuild liveDataMap so VenueCards update too
    buildLobbyLiveDataMap();
  }, [fetchVenues, searchQuery, fetchTours, fetchSeries, fetchDaily, fetchFavorites, fetchSearchHistory, userId, buildLobbyLiveDataMap]);

  // ─── Live games refresh handled by <LiveGamesFeed> component ───

  // ─── Search handler ───
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);



  // ─── Voice search result handler ───
  const handleVoiceResult = useCallback((result) => {
    setShowVoiceSearch(false);
    if (result?.searchQuery) {
      setSearchQuery(result.searchQuery);
      fetchVenues(result.searchQuery);
      // Auto-open the Search panel to show voice search results
      setActivePod('search');
      setShowPanel(true);
    }
    if (result?.filters) {
      setFilters(prev => ({ ...prev, ...result.filters }));
    }
  }, [fetchVenues]);

  // ─── Sort change ───
  const handleSortChange = useCallback((newSort) => {
    setSortBy(newSort);
  }, []);

  // ─── Filter change ───
  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    setShowFilters(false);
  }, []);

  // ─── Re-fetch when sort or filters change ───
  const sortFilterMountRef = useRef(true);
  useEffect(() => {
    // Skip the initial mount — the initial data load effect or deep-link effect
    // already handles the first fetch. This should only re-fetch on CHANGES.
    if (sortFilterMountRef.current) {
      sortFilterMountRef.current = false;
      return;
    }
    // Skip re-fetch when GOAT pod filters change — they do their own API calls
    // This prevents double-fetch race conditions where the stale fetchVenues
    // overwrites the properly-filtered results from triggerNmSearch/doVenueSearch
    if (filters.nmSearched || filters.svHasSearched || filters.hgHasSearched) return;
    fetchVenues(searchQuery);
  }, [sortBy]); // Only re-fetch on sortBy changes, not on every filter change // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cross-page favorites sync (Native Storage Event) ───
  useEffect(() => {
    const handleStorageSync = (e) => {
      // Listen to cross-tab updates from localStorage 'sp-favorites' (venues)
      if (e.key === 'sp-favorites' && e.newValue) {
        try {
          const rawFavs = JSON.parse(e.newValue);
          setFavorites(prev => {
            const next = { ...prev };
            let changed = false;
            // Map venue-* back to lobby namespace
            const newFavIds = Object.keys(rawFavs || {})
              .filter(k => k.startsWith('venue-'))
              .map(k => k.split('-')[1]);
            
            // Clean old venues
            Object.keys(next || {}).forEach(k => {
               if (k.startsWith('venue-')) {
                 const id = k.split('-')[1];
                 if (!newFavIds.includes(id)) { delete next[k]; changed = true; }
               }
            });
            
            // Add new venues
            newFavIds.forEach(id => {
              if (!next[`venue-${id}`]) { next[`venue-${id}`] = true; changed = true; }
            });
            return changed ? next : prev;
          });
        } catch (e) { console.warn('[App] Handled exception:', e); }
      }
      
      // Listen to cross-tab updates from localStorage 'followed-series'
      if (e.key === 'followed-series' && e.newValue) {
        try {
          const rawSeriesIds = JSON.parse(e.newValue); // Array of string IDs
          setFavorites(prev => {
            const next = { ...prev };
            let changed = false;
            
            // Clean old series
            Object.keys(next || {}).forEach(k => {
               if (k.startsWith('series-')) {
                 const id = k.split('-')[1];
                 if (!rawSeriesIds.includes(id)) { delete next[k]; changed = true; }
               }
            });
            
            // Add new series
            rawSeriesIds.forEach(id => {
              if (!next[`series-${id}`]) { next[`series-${id}`] = true; changed = true; }
            });
            return changed ? next : prev;
          });
        } catch (e) { console.warn('[App] Handled exception:', e); }
      }
    };

    window.addEventListener('storage', handleStorageSync);

    return () => {
      window.removeEventListener('storage', handleStorageSync);
    };
  }, []);

  // ─── Cleanup timeouts on unmount (prevent setState on unmounted component) ───
  useEffect(() => {
    return () => {
      if (locationToastTimeoutRef.current) clearTimeout(locationToastTimeoutRef.current);
      if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // ─── Smart Permission & Device Detection ───
  useEffect(() => {
    // Detect device type for platform-specific instructions
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        setDeviceType('ios');
      } else if (/android/i.test(ua)) {
        setDeviceType('android');
      } else {
        setDeviceType('desktop');
      }
    }
    // Monitor geolocation permission state (Permissions API)
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        setPermissionState(status.state); // 'granted' | 'denied' | 'prompt'
        // Listen for real-time changes (user toggles permission in browser settings)
        status.onchange = () => {
          setPermissionState(status.state);
          if (status.state === 'granted') {
            // Permission just got enabled — auto-trigger GPS
            setShowEnablePopup(false);
            setShowManualLocation(false);
            handleGpsClick({ fromModal: true });
          }
        };
      }).catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Geofence Proximity Alerts ───
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userLocation || !preferences.geofenceAlerts) return;
    if (!venues || venues.length === 0) return;

    let gfService = null;

    import('../../../src/lib/geofence').then(function (mod) {
      const GeofenceService = mod.default;
      gfService = new GeofenceService();

      import('../../../src/lib/pushAlerts').then(function (pushMod) {
        pushMod.requestPermission().then(function (permission) {
          if (permission === 'denied') setGeofenceStatus('denied');
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

        gfService.start(venues, function (venue) {
          pushMod.showVenueAlert(venue, 'checkin');
          setGeofenceAlert(venue);
        });

        setGeofenceStatus('active');
      }).catch(function () {
        gfService.start(venues, function (venue) {
          setGeofenceAlert(venue);
        });
        setGeofenceStatus('active');
      });

      geofenceRef.current = gfService;
    }).catch(function () {
      setGeofenceStatus('error');
    });

    return function () {
      if (geofenceRef.current) {
        geofenceRef.current.stop();
        geofenceRef.current = null;
      }
    };
  }, [userLocation, venues, preferences.geofenceAlerts]);

  // ─── Reverse Geocode: lat/lng → city, state ───
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data?.address || {};
      // zoom=14 returns neighborhood/suburb-level data so Oak Lawn beats Chicago.
      // Priority: suburb (Oak Lawn) → town → village → city (Chicago) → county
      const city = addr.suburb || addr.town || addr.village || addr.city || addr.county || '';
      const state = addr.state || '';
      return { city, state };
    } catch {
      return null;
    }
  }, []);

  // ─── Show location success toast (auto-dismiss after 2s) ───
  const showLocationSuccessToast = useCallback((cityState) => {
    if (locationToastTimeoutRef.current) clearTimeout(locationToastTimeoutRef.current);
    setLocationToast(cityState);
    if (cityState?.city) setLocationCity(cityState.city);
    if (cityState?.state) setLocationState(cityState.state);
    locationToastTimeoutRef.current = setTimeout(() => setLocationToast(null), 2500);
  }, []);

  // ─── GPS Success handler (shared between auto + manual click) ───
  const onGpsSuccess = useCallback(async (pos, options = {}) => {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setUserLocation(loc);
    setGpsActive(true);
    setSortBy('distance'); // Auto-switch to distance sort when GPS enables
    // ── ONE-AND-DONE: Mark prompt dismissed permanently on GPS success ──
    // User enabled location — never ask again unless they explicitly turn it off.
    setLocationPromptDismissed(true);
    setShowEnablePopup(false);
    try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* private browsing */ }
    try { localStorage.setItem('pnm_location_enabled', '1'); } catch { /* */ }
    try { localStorage.setItem('pnm_last_location', JSON.stringify(loc)); } catch { /* */ }
    const geo = await reverseGeocode(loc.lat, loc.lng);
    if (geo?.city) {
      showLocationSuccessToast(geo);
      try { localStorage.setItem('pnm_last_city', geo.city); } catch { /* */ }
      try { localStorage.setItem('pnm_last_state', geo.state || ''); } catch { /* */ }
    }
    // Persist enabled state + coordinates to Supabase
    if (userId) {
      updatePokerNearMePreferences(userId, {
        locationEnabled: true,
        lastLocation: loc,
        lastLocationCity: geo?.city || '',
        lastLocationState: geo?.state || '',
        locationEnabledAt: new Date().toISOString(),
        locationPromptDismissed: true,
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }
    // Fetch ALL venues with GPS coordinates for distance sorting
    const gpsUrl = `/api/poker/venues?limit=200&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=50&sort=distance`;
    cachedFetch(gpsUrl).then(data => {
      const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      setVenues(newVenues);
      setHasMore(newVenues.length >= PAGE_SIZE);
      setPage(0);
    }).catch(err => console.warn('GPS venue fetch failed:', err));
    // GPS updates location + venues silently — user must click search to see results
  }, [reverseGeocode, showLocationSuccessToast, userId]);

  // ─── GPS Click handler (2-tier: high accuracy → low accuracy fallback) ───
  const gpsErrorTimeoutRef = useRef(null);
  const gpsRequestIdRef = useRef(0); // Generation counter to cancel stale GPS callbacks
  const handleGpsClick = useCallback((options = {}) => {
    const { fromModal = false } = options;
    if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);

    // Prevent concurrent GPS requests (race condition on rapid clicks)
    if (gpsLoading) return;

    if (gpsActive && !fromModal) {
      setGpsActive(false);
      setGpsLoading(false);
      setUserLocation(null);
      userLocationRef.current = null;
      setLocationToast(null);
      setLocationCity('');
      setLocationState('');
      setSortBy('trust'); // Revert to trust sort when GPS disabled
      // Clear persistence — user explicitly turned it off
      try { localStorage.removeItem('pnm_location_enabled'); } catch { /* */ }
      try { localStorage.removeItem('pnm_last_location'); } catch { /* */ }
      try { localStorage.removeItem('pnm_last_city'); } catch { /* */ }
      try { localStorage.removeItem('pnm_last_state'); } catch { /* */ }
      // Keep pnm_location_prompt_dismissed so we don't re-prompt
      if (userId) {
        updatePokerNearMePreferences(userId, { locationEnabled: false }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }
      // Re-fetch venues to clear GPS radius filter
      fetchVenues(searchQuery);
      return;
    }
    if (!navigator.geolocation) {
      setGpsError('GPS not supported on this device');
      setGpsLoading(false);
      gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
      if (!fromModal) setShowManualLocation(true);
      return;
    }

    setGpsLoading(true);
    setGpsError(null);
    const requestId = ++gpsRequestIdRef.current;

    // ── Tier 1: Try high accuracy (GPS/cellular) — 15s timeout ──
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gpsRequestIdRef.current !== requestId) return; // Stale callback
        setGpsLoading(false);
        setShowManualLocation(false);
        onGpsSuccess(pos);
      },
      (highAccErr) => {
        // ── PERMISSION DENIED (code 1) — show smart Enable Location popup ──
        if (highAccErr.code === 1) {
          if (gpsRequestIdRef.current !== requestId) return; // Stale callback
          setGpsActive(false);
          setGpsLoading(false);
          setPermissionState('denied');
          setShowEnablePopup(true);
          setShowManualLocation(false); // Don't show manual — show smart popup instead
          if (userId) {
            updatePokerNearMePreferences(userId, { locationEnabled: false }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          }
          return;
        }

        // ── Tier 2: Fallback to low accuracy (WiFi/IP-based) — works on desktops ──
        // High accuracy failed (POSITION_UNAVAILABLE or TIMEOUT) — try without GPS
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (gpsRequestIdRef.current !== requestId) return; // Stale callback
            setGpsLoading(false);
            setShowManualLocation(false);
            onGpsSuccess(pos);
          },
          (lowAccErr) => {
            if (gpsRequestIdRef.current !== requestId) return; // Stale callback
            setGpsActive(false);
            setGpsLoading(false);
            if (lowAccErr.code === 1) {
              setPermissionState('denied');
              setShowEnablePopup(true);
              setShowManualLocation(false);
            } else {
              setGpsError('Could not determine location — set your location manually below');
              gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 5000);
              setShowManualLocation(true);
            }
            if (userId) {
              updatePokerNearMePreferences(userId, { locationEnabled: false }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
            }
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, [gpsActive, gpsLoading, userId, onGpsSuccess]);

  // ─── Persist dismissal helper (localStorage + Supabase) ───
  const dismissLocationPrompt = useCallback(() => {
    setLocationPromptDismissed(true);
    try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* private browsing */ }
    if (userId) {
      updatePokerNearMePreferences(userId, {
        locationEnabled: false,
        locationPromptDismissed: true,
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }
  }, [userId]);

  // ─── Sync Supabase dismissal flag into state (for cross-device persistence) ───
  useEffect(() => {
    if (prefsLoaded && preferences?.locationPromptDismissed && !locationPromptDismissed) {
      setLocationPromptDismissed(true);
      try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* */ }
    }
  }, [prefsLoaded, preferences?.locationPromptDismissed, locationPromptDismissed]);

  // ─── Auto-prompt GPS on first visit / silently re-enable if previously accepted ───
  const gpsAutoRef = useRef(false);
  useEffect(() => {
    if (!prefsLoaded) return; // Wait for real preferences from Supabase before deciding
    if (gpsAutoRef.current || gpsActive) return;
    gpsAutoRef.current = true;

    // Check persisted preferences from Supabase
    const locationPref = preferences?.locationEnabled;
    const savedLoc = preferences?.lastLocation;

    // ── FAST PATH: Restore from localStorage if Supabase hasn't loaded yet ──
    // This provides instant location on page load without waiting for DB.
    let fastLoc = null;
    let fastCity = '';
    let fastState = '';
    if (!savedLoc?.lat && typeof window !== 'undefined') {
      try {
        const lsLoc = localStorage.getItem('pnm_last_location');
        if (lsLoc) {
          fastLoc = JSON.parse(lsLoc);
          fastCity = localStorage.getItem('pnm_last_city') || '';
          fastState = localStorage.getItem('pnm_last_state') || '';
        }
      } catch { /* */ }
    }

    // CASE 1: User PREVIOUSLY DECLINED → do NOT auto-prompt (respect their choice)
    if (locationPref === false && !fastLoc) return;

    // CASE 2: User PREVIOUSLY ACCEPTED → silently re-enable GPS
    // If we have saved coordinates (Supabase or localStorage), use them immediately
    // (instant, no permission prompt). Then silently refresh in background.
    const restoreLoc = (savedLoc?.lat && savedLoc?.lng) ? savedLoc : (fastLoc?.lat && fastLoc?.lng) ? fastLoc : null;
    const restoreCity = (savedLoc?.lat ? preferences?.lastLocationCity : fastCity) || '';
    const restoreState = (savedLoc?.lat ? preferences?.lastLocationState : fastState) || '';

    if ((locationPref === true || fastLoc) && restoreLoc) {
      setUserLocation(restoreLoc);
      setGpsActive(true);
      setSortBy('distance'); // BUG-05 fix: auto-distance sort for returning users
      // ── ONE-AND-DONE: mark prompt dismissed since user previously enabled location ──
      setLocationPromptDismissed(true);
      try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* */ }
      showLocationSuccessToast({
        city: restoreCity,
        state: restoreState,
      });
      // Fetch venues with saved location immediately
      const gpsUrl = `/api/poker/venues?limit=200&offset=0&lat=${restoreLoc.lat}&lng=${restoreLoc.lng}&radius=50&sort=distance`;
      cachedFetch(gpsUrl).then(data => {
        const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
        setVenues(newVenues);
        setHasMore(newVenues.length >= PAGE_SIZE);
        setPage(0);
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      // Silently refresh GPS in background for accuracy (no error if it fails)
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setUserLocation(loc);
            const movedSignificantly = Math.abs(loc.lat - restoreLoc.lat) > 0.01 || Math.abs(loc.lng - restoreLoc.lng) > 0.01;
            if (movedSignificantly) {
              const freshUrl = `/api/poker/venues?limit=200&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=50&sort=distance`;
              cachedFetch(freshUrl).then(data => {
                const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                setVenues(newVenues);
                setHasMore(newVenues.length >= PAGE_SIZE);
                setPage(0);
              }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
              if (userId) {
                reverseGeocode(loc.lat, loc.lng).then(geo => {
                  if (geo?.city) {
                    showLocationSuccessToast(geo);
                    updatePokerNearMePreferences(userId, {
                      locationEnabled: true,
                      lastLocation: loc,
                      lastLocationCity: geo.city,
                      lastLocationState: geo.state || '',
                    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                  }
                }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
              }
            }
          },
          (highAccErr) => {
            if (highAccErr.code === 1) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLocation(loc);
                const movedSignificantly = Math.abs(loc.lat - restoreLoc.lat) > 0.01 || Math.abs(loc.lng - restoreLoc.lng) > 0.01;
                if (movedSignificantly) {
                  const freshUrl = `/api/poker/venues?limit=200&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=50&sort=distance`;
                  cachedFetch(freshUrl).then(data => {
                    const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                    setVenues(newVenues);
                    setHasMore(newVenues.length >= PAGE_SIZE);
                    setPage(0);
                  }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                  if (userId) {
                    reverseGeocode(loc.lat, loc.lng).then(geo => {
                      if (geo?.city) {
                        showLocationSuccessToast(geo);
                        updatePokerNearMePreferences(userId, {
                          locationEnabled: true,
                          lastLocation: loc,
                          lastLocationCity: geo.city,
                          lastLocationState: geo.state || '',
                        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                      }
                    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                  }
                }
              },
              () => { /* Both tiers failed — saved location is still good */ },
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
      };
      return;
    }

    // CASE 3: FIRST VISIT (no saved preference)
    // ── ONE-TIME-AND-DONE: If user already dismissed the prompt, never show it again ──
    if (locationPromptDismissed) return;

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      if (permissionState === 'granted') {
        // Permission already granted — just acquire GPS silently
        navigator.geolocation.getCurrentPosition(
          (pos) => onGpsSuccess(pos, { silent: false }),
          (firstErr) => {
            if (firstErr.code === 1) {
              setPermissionState('denied');
              setShowEnablePopup(true);
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => onGpsSuccess(pos, { silent: false }),
              () => { /* Silent fail — don't show manual modal automatically */ },
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
      } else {
        // Permission state is 'prompt' or 'denied' — show our branded popup (one time only)
        setShowEnablePopup(true);
      }
    }
  }, [prefsLoaded, preferences?.locationEnabled, locationPromptDismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Manual Location Set ───
  const handleManualLocationSet = useCallback(async () => {
    if (!manualCity.trim()) return;
    if (manualGeocoding || gpsLoading) return; // Prevent concurrent rapid clicks
    setManualGeocoding(true);
    setGpsLoading(false);
    gpsRequestIdRef.current++; // Invalidate any in-flight GPS callbacks
    // Geocode the manual city/state input using Nominatim
    try {
      const query = manualState ? `${manualCity.trim()}, ${manualState}` : manualCity.trim();
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`, {
        headers: { 'Accept-Language': 'en' }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        const loc = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setUserLocation(loc);
        setGpsActive(true);
        setSortBy('distance'); // BUG-02 fix: auto-distance sort on manual set
        setShowManualLocation(false);
        showLocationSuccessToast({ city: manualCity.trim(), state: manualState || '' });
        // ── ONE-AND-DONE: Persist to localStorage so user is never re-prompted ──
        setLocationPromptDismissed(true);
        try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* */ }
        try { localStorage.setItem('pnm_location_enabled', '1'); } catch { /* */ }
        try { localStorage.setItem('pnm_last_location', JSON.stringify(loc)); } catch { /* */ }
        try { localStorage.setItem('pnm_last_city', manualCity.trim()); } catch { /* */ }
        try { localStorage.setItem('pnm_last_state', manualState || ''); } catch { /* */ }
        // Persist to Supabase (cross-device)
        if (userId) {
          updatePokerNearMePreferences(userId, {
            locationEnabled: true,
            lastLocation: loc,
            lastLocationCity: manualCity.trim(),
            lastLocationState: manualState || '',
            locationEnabledAt: new Date().toISOString(),
            manualLocation: true,
            locationPromptDismissed: true,
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
        // Fetch venues near this location
        const gpsUrl = `/api/poker/venues?limit=200&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=50&sort=distance`;
        cachedFetch(gpsUrl).then(result => {
          const newVenues = result?.data || result?.venues || (Array.isArray(result) ? result : []);
          setVenues(newVenues);
          setHasMore(newVenues.length >= PAGE_SIZE);
          setPage(0);
        }).catch(err => console.warn('Manual location venue fetch failed:', err));
        // Manual location set — user must click search to see results
      } else {
        setGpsError('Could not find that location — try a different city');
        if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);
        gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
      }
    } catch (err) {
      console.warn('Manual geocode failed:', err);
      setGpsError('Geocoding failed — check your connection');
      if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);
      gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
    } finally {
      setManualGeocoding(false);
    }
  }, [manualCity, manualState, userId, showLocationSuccessToast, manualGeocoding, gpsLoading]);

  // ─── Pods that require GPS to show meaningful results ───
  const GPS_REQUIRED_PODS = new Set(['nearme', 'mapview', 'livegames']);

  // ─── Pod click → navigate directly to standalone pages ───
  // All 12 lobby grid icons route to their full standalone pages.
  // No more inline panel overlays — every feature gets its own page.
  const POD_ROUTES = {
    nearme:    '/hub/poker-near-me/venues',
    homegames: '/hub/home-games',
    livegames: '/hub/poker-near-me/live-games',
    tours:     '/hub/poker-tours',
    mapview:   '/hub/poker-near-me/map',
    calendar:  '/hub/events-calendar',
    series:    '/hub/poker-near-me/series',
    roadtrip:  '/hub/poker-near-me/roadtrip',
    daily:     '/hub/daily-tournaments',
    favorites: '/hub/poker-near-me/saved',
    social:    '/hub/friends',
    alerts:    '/hub/poker-near-me/alerts',
  };

  const handlePodClick = useCallback((podId) => {
    playClickSound();
    const route = POD_ROUTES[podId];
    if (route) {
      router.push(route);
    }
    // Emit TrainingBus event for pod interaction tracking
    try { bus?.emitHandComplete?.({ action: 'pod_click', pod: podId }); } catch (e) { console.warn('[App] Handled exception:', e); }
  }, [bus, router]);

  // ─── Auto-open panel for GPS-gated pods after GPS is enabled ───
  // When a user clicks a GPS-required pod without GPS, we set activePod but
  // don't open the panel (show Enable popup instead). This effect watches for
  // GPS activation and auto-opens the panel for the pending pod.
  const prevGpsActiveRef = useRef(gpsActive);
  useEffect(() => {
    if (gpsActive && !prevGpsActiveRef.current && activePod && GPS_REQUIRED_PODS.has(activePod) && !showPanel) {
      setShowPanel(true);
      playPanelOpenSound();
    }
    prevGpsActiveRef.current = gpsActive;
  }, [gpsActive, activePod, showPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePanelClose = useCallback(() => {
    playPanelCloseSound();
    setShowPanel(false);
    setActivePod(null);
  }, []);

  // ─── Keyboard: Escape to close panel ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showPanel) {
        handlePanelClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPanel, handlePanelClose]);

  // ─── Series/Tour token helper ───
  // [LB6 FIX] Defined BEFORE handleToggleFavorite to avoid temporal dead zone (TDZ).
  // const declarations are not hoisted; calling getAuthToken() before its declaration
  // would throw ReferenceError at runtime.
  const getAuthToken = useCallback(async () => {
    try {
      const { data } = await getAuthUser();
      return data?.session?.access_token || null;
    } catch {
      return null;
    }
  }, []);

  // ─── Favorite toggle ───
  const handleToggleFavorite = useCallback(async (id, dataObj, type = 'venue') => {
    if (!userId && type === 'venue') return; // Venues currently require userId for PG tables
    // [LB6 FIX] Was window.__supabaseToken — bypassed SDK auth, silent failure if undefined.
    // Now uses getAuthUser() via getAuthToken() helper for reliable JWT retrieval.
    const token = type !== 'venue' ? await getAuthToken() : null;
    if (!token && type !== 'venue') return; // Series/Tours follow API requires JWT
    
    // For venues we use favorites map, for series/tours we will use the same local map for now 
    // to keep UI synchronous, though technically they store in page_followers on backend.
    const favKey = type + '-' + id;
    const wasFavorited = !!favorites[favKey];
    // [GAP 4.1 FIX] Use Date.now() timestamp (not boolean) to match main page convention
    setFavorites(prev => ({ ...prev, [favKey]: wasFavorited ? null : Date.now() }));
    
    const entry = { id, name: dataObj?.name || 'Unknown', address: dataObj?.address || '', city: dataObj?.city || '', state: dataObj?.state || '', _fromFavorites: true, _type: type };
    if (wasFavorited) {
      setFavoritedVenues(prev => prev.filter(f => f.id !== id));
    } else {
      setFavoritedVenues(prev => [...prev, entry]);
    }
    
    try {
      if (type === 'venue') {
        if (wasFavorited) {
          await removeVenueFavorite(userId, id);
        } else {
          await addVenueFavorite(userId, id, dataObj);
        }
      } else {
        // Series & Tours routing via Unified Follow API
        const res = await fetch('/api/poker/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({
            page_type: type,
            page_id: id,
            action: wasFavorited ? 'unfollow' : 'follow',
          })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to sync follow');
      }
      
      // Write to localStorage to trigger cross-tab state syncing via native 'storage' event
      if (typeof window !== 'undefined') {
        if (type === 'venue') {
          const rawFavs = localStorage.getItem('sp-favorites');
          try {
            const spFavs = rawFavs ? JSON.parse(rawFavs) : {};
            if (wasFavorited) delete spFavs[`venue-${id}`];
            else spFavs[`venue-${id}`] = Date.now();
            localStorage.setItem('sp-favorites', JSON.stringify(spFavs));
          } catch (e) { console.warn('[App] Handled exception:', e); }
        } else if (type === 'series') {
          // Sync with the Series Detail Page persistence
          try {
            const followed = JSON.parse(localStorage.getItem('followed-series') || '[]');
            const updated = wasFavorited ? followed.filter(x => x !== String(id)) : (followed.includes(String(id)) ? followed : [...followed, String(id)]);
            localStorage.setItem('followed-series', JSON.stringify(updated));
          } catch (e) { console.warn('[App] Handled exception:', e); }
        }
      }
    } catch (err) {
      console.warn(`Failed to toggle favorite for ${type} ${id}:`, err);
      // Full rollback on error — both state maps
      setFavorites(prev => ({ ...prev, [favKey]: wasFavorited }));
      if (wasFavorited) {
        setFavoritedVenues(prev => [...prev, entry]);
      } else {
        setFavoritedVenues(prev => prev.filter(f => f.id !== id));
      }
    }
  }, [userId, favorites, getAuthToken]);

  // ─── Auth-gated venue navigation ───
  const handleVenueNavigate = useCallback((url, venue) => {
    const needsAuth = url.includes('action=checkin') || url.includes('action=review');
    if (needsAuth && !userId) {
      setShowLoginPrompt(true);
      return;
    }
    if (url.includes('action=review') && venue) {
      setSelectedVenueForReview({ id: venue.id, name: venue.name });
    } else {
      router.push(url);
    }
  }, [userId, router]);

  // ─── Build panel content based on active pod ───
  const panelContent = useMemo(() => {
    if (!activePod) return null;
    const feature = POD_FEATURES[activePod];
    if (!feature) return null;

    let component = null;

    switch (activePod) {
      case 'search': {
        const doVenueSearch = () => {
          setFilters(prev => ({
            ...prev,
            svHasSearched: true,
            selectedState: prev.svState || 'all',
            venueType: prev.svVenueType === 'all' ? undefined : prev.svVenueType,
            gameType: prev.svGameType === 'all' ? undefined : prev.svGameType,
            radius: prev.svRadius === 'any' ? undefined : prev.svRadius,
          }));
          const svState = filters.svState || 'all';
          const svVenueType = filters.svVenueType || 'all';
          const rawSvRadius = filters.svRadius || '100';
          const svRadius = rawSvRadius === 'any' ? 'any' : String(Math.min(parseInt(rawSvRadius) || 100, 150));
          const svSort = filters.svSort || (userLocation ? 'distance' : 'trust');
          
          const apiState = svState !== 'all' ? `&state=${svState}` : '';
          const apiVenueType = svVenueType !== 'all' ? `&venue_type=${svVenueType}` : '';
          const apiRadius = userLocation && svRadius !== 'any' ? `&radius=${svRadius}` : '';
          const apiLoc = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
          const apiSort = svSort ? `&sort=${svSort}` : '';
          const apiUrl = `/api/poker/venues?limit=200&offset=0${apiLoc}${apiRadius}${apiState}${apiVenueType}${apiSort}`;
          
          setLoading(true);
          cachedFetch(apiUrl).then(data => {
            const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
            setPodSearchVenues(newVenues);
          }).catch(err => console.warn('Search fetch failed:', err))
          .finally(() => setLoading(false));
        };

        component = (
          <PodVenueSearchEngine
            prefix="sv"
            title="Search Venues"
            subtitle="Search All Venues"
            subtitleDesc="Set Your Filters Above and Tap Search. Enable GPS for Distance-Based Results."
            showBuyIn={false}
            filters={filters} setFilters={setFilters}
            venues={podSearchVenues || venues}
            dailyTournaments={[]}
            tours={tours} series={series}
            userLocation={userLocation} gpsLoading={gpsLoading} handleGpsClick={handleGpsClick}
            loading={loading} loadMore={loadMore}
            favorites={favorites} handleToggleFavorite={handleToggleFavorite}
            checkinCounts={checkinCounts} reviewStatsMap={reviewStatsMap}
            handleVenueNavigate={handleVenueNavigate} router={router}
            triggerSearch={doVenueSearch}
          />
        );
        break;
      }

      case 'homegames': {
        component = (
          <PodHomeGames
            filters={filters} setFilters={setFilters}
            venues={venues} podHomeGames={podHomeGames} setPodHomeGames={setPodHomeGames}
            userId={userId} userLocation={userLocation}
            loading={loading} setLoading={setLoading}
            favorites={favorites} handleToggleFavorite={handleToggleFavorite}
            checkinCounts={checkinCounts} reviewStatsMap={reviewStatsMap}
            handleVenueNavigate={handleVenueNavigate} router={router}
            onHomeGameCreated={(newVenue) => setVenues(prev => [...prev, newVenue])}
          />
        );
        break;
      }

      case 'nearme': {
        const triggerNmSearch = () => {
          setFilters(prev => ({
            ...prev,
            nmSearched: true,
            selectedState: prev.nmState || 'all',
            venueType: prev.nmVenueType === 'all' ? undefined : prev.nmVenueType,
            gameType: prev.nmGameType === 'all' ? undefined : prev.nmGameType,
            radius: prev.nmRadius === 'any' ? undefined : prev.nmRadius,
          }));
          const nmState = filters.nmState || 'all';
          const nmVenueType = filters.nmVenueType || 'all';
          const rawNmRadius = filters.nmRadius || '50';
          const nmRadius = rawNmRadius === 'any' ? 'any' : String(Math.min(parseInt(rawNmRadius) || 50, 150));
          const nmSort = filters.nmSort || (userLocation ? 'distance' : 'trust');

          const apiState = nmState !== 'all' ? `&state=${nmState}` : '';
          const apiVenueType = nmVenueType !== 'all' ? `&venue_type=${nmVenueType}` : '';
          const apiRadius = userLocation && nmRadius !== 'any' ? `&radius=${nmRadius}` : '';
          const apiLoc = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
          const apiSort = nmSort ? `&sort=${nmSort}` : '';
          const apiUrl = `/api/poker/venues?limit=200&offset=0${apiLoc}${apiRadius}${apiState}${apiVenueType}${apiSort}`;
          
          setLoading(true);
          cachedFetch(apiUrl).then(data => {
            const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
            setVenues(newVenues);
            setHasMore(newVenues.length >= PAGE_SIZE);
            setPage(0);
          }).catch(err => console.warn('Search fetch failed:', err))
          .finally(() => setLoading(false));
        };

        component = (
          <PodVenueSearchEngine
            prefix="nm"
            title="Search Poker Near Me"
            subtitle="Find Poker Anywhere"
            subtitleDesc="Enable GPS to Find Games Near You, or Set Your Search Parameters Above and Tap Search. Filter by Venue Type, Game Type, Distance, and Buy-In Range."
            showBuyIn={true}
            filters={filters} setFilters={setFilters}
            venues={venues}
            dailyTournaments={dailyTournaments}
            tours={tours} series={series}
            userLocation={userLocation} gpsLoading={gpsLoading} handleGpsClick={handleGpsClick}
            loading={loading} loadMore={loadMore}
            favorites={favorites} handleToggleFavorite={handleToggleFavorite}
            checkinCounts={checkinCounts} reviewStatsMap={reviewStatsMap}
            handleVenueNavigate={handleVenueNavigate} router={router}
            triggerSearch={triggerNmSearch}
          />
        );
        break;
      }

      case 'livegames':
        component = <LiveGamesFeed 
          venues={venues} 
          userLocation={userLocation} 
          favorites={favorites} 
          handleToggleFavorite={handleToggleFavorite} 
          checkinCounts={checkinCounts} 
          router={router} 
          setSelectedVenueForReview={setSelectedVenueForReview}
          user={user}
        />;
        break;

      case 'mapview': {
        const mapStateFilter = filters.mapState || 'all';
        // ═══ MERGE TOUR STOPS INTO MAP — Convert tours to venue-like objects ═══
        const tourMapPins = (tours || []).reduce((acc, tour) => {
          // Direct tour coordinates
          if (tour.latitude && tour.longitude) {
            acc.push({
              id: 'tour-' + (tour.id || tour.tour_code),
              name: tour.name || tour.tour_name || tour.tour_code,
              venue_type: 'tour_stop',
              tour_code: tour.tour_code,
              tour_name: tour.name || tour.tour_name,
              logo_url: tour.logo_url,
              latitude: tour.latitude,
              longitude: tour.longitude,
              city: tour.city || '',
              state: tour.state || '',
              is_running: tour.is_running,
            });
          }
          // Upcoming series/stops with city coords
          const allStops = [
            ...(tour.upcoming_series || []),
            ...(tour.stops_2026 || []),
            ...(tour.series_2026 || []),
          ];
          allStops.forEach((stop, idx) => {
            if (stop.latitude && stop.longitude) {
              acc.push({
                id: 'tour-stop-' + (tour.id || tour.tour_code) + '-' + idx,
                name: stop.name || stop.venue || tour.name || tour.tour_code,
                venue_type: 'tour_stop',
                tour_code: tour.tour_code,
                tour_name: tour.name || tour.tour_name,
                logo_url: tour.logo_url,
                latitude: stop.latitude,
                longitude: stop.longitude,
                city: stop.city || '',
                state: stop.state || '',
                stop_name: stop.name || stop.venue,
                dates: stop.dates || '',
                is_running: stop.is_running,
              });
            }
          });
          return acc;
        }, []);
        const allMapItems = [...venues, ...tourMapPins];
        const mapVenues = mapStateFilter !== 'all'
          ? allMapItems.filter(v => v.state === mapStateFilter)
          : allMapItems;
        component = (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={mapStateFilter}
                onChange={(e) => setFilters(prev => ({ ...prev, mapState: e.target.value }))}
                style={{ background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 8, padding: '6px 12px', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 100 }}>
                <option value="all" style={{ background: '#0d1a2a' }}>All States</option>
                {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                  <option key={st} value={st} style={{ background: '#0d1a2a' }}>{st}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)', marginLeft: 'auto' }}>
                <span style={{ color: '#d4a853', fontWeight: 700 }}>{mapVenues.filter(v => v.latitude && v.longitude).length}</span> venues on map
              </span>
            </div>
            <VenueMapPanel venues={mapVenues} userLocation={userLocation} radiusMiles={filters.nmRadius} onVenueSelect={(v) => { setSelectedVenueForReview(null); router.push(`/hub/venues/${v.id}`); }} />
          </div>
        );
        break;
      }

      case 'tours': {
        component = (
          <PodTours
            filters={filters} setFilters={setFilters}
            tours={tours} toursLoaded={toursLoaded}
            favorites={favorites} handleToggleFavorite={handleToggleFavorite}
            router={router}
          />
        );
        break;
      }

      case 'series': {
        component = (
          <PodSeries
            filters={filters} setFilters={setFilters}
            series={series} seriesLoaded={seriesLoaded}
            favorites={favorites} handleToggleFavorite={handleToggleFavorite}
            router={router}
          />
        );
        break;
      }

      case 'daily':
        if (dailyTournaments.length === 0 && !loading) {
          component = (
            <div style={{ display: 'grid', gap: 10 }}>
              {[1,2,3,4,5].map(n => (
                <div key={n} style={{
                  height: 80, borderRadius: 12,
                  background: 'linear-gradient(90deg, rgba(30,40,55,0.5) 25%, rgba(50,60,80,0.5) 50%, rgba(30,40,55,0.5) 75%)',
                  backgroundSize: '200% 100%', animation: 'pnm-shimmer 1.5s ease-in-out infinite',
                  border: '1px solid rgba(148,163,184,0.08)',
                }} />
              ))}
              <div style={{ textAlign: 'center', padding: 12, color: 'rgba(200,214,229,0.4)', fontSize: 13 }}>
                Loading daily tournaments...
              </div>
            </div>
          );
        } else {
          component = <DailyTournamentsPanel tournaments={dailyTournaments} onDayChange={fetchDaily} />;
        }
        break;

      case 'calendar':
        component = <SeasonalCalendar series={series} tours={tours} dailyTournaments={dailyTournaments} />;
        break;

      case 'roadtrip':
        component = (
          <div>
            <RoadTripPlanner venues={venues} userLocation={userLocation} locationCity={locationCity} locationState={locationState} />
            {/* Trip Cost Calculator — accessible from Trip Planner */}
            <div style={{ marginTop: 20, padding: '16px 0', borderTop: '1px solid rgba(212,168,83,0.1)' }}>
              <button
                onClick={() => { setActivePod('tripcost'); playPanelOpenSound(); }}
                style={{
                  width: '100%', padding: '12px 20px', borderRadius: 12,
                  border: '1px solid rgba(212,168,83,0.3)',
                  background: 'linear-gradient(135deg, rgba(212,168,83,0.08), rgba(212,168,83,0.03))',
                  color: '#d4a853', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                </svg>
                Estimate Trip Costs
              </button>
            </div>
          </div>
        );
        break;

      case 'favorites': {
        // Merge: show full venue data if in current search, fallback to favorites data
        const favVenues = Object.keys(favorites || {}).filter(k => favorites[k]).map(venueId => {
          const fromSearch = venues.find(v => String(v.id) === String(venueId));
          if (fromSearch) return fromSearch;
          return favoritedVenues.find(f => String(f.id) === String(venueId));
        }).filter(Boolean);

        component = (
          <div style={{ display: 'grid', gap: 12 }}>
            {favVenues.map(v => (
              <VenueCard
                key={v.id}
                venue={v}
                isFavorited={true}
                onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                onNavigate={(url) => handleVenueNavigate(url, v)}
                userLocation={userLocation}
                checkinCount={checkinCounts[String(v.id)] || 0}
                reviewStats={reviewStatsMap[String(v.id)]}
              />
            ))}
            {favVenues.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Saved Venues Yet</p>
                <p style={{ fontSize: 13 }}>Tap the Heart on Any Venue to Save It Here.</p>
              </div>
            )}
            {favVenues.length >= 2 && (
              <button
                onClick={() => { setActivePod('compare'); }}
                style={{
                  width: '100%', padding: '10px 16px', borderRadius: 10, marginTop: 12,
                  border: '1px solid rgba(212,168,83,0.25)',
                  background: 'linear-gradient(135deg, rgba(212,168,83,0.06), rgba(212,168,83,0.02))',
                  color: '#d4a853', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                Compare Venues
              </button>
            )}
          </div>
        );
        break;
      }

      case 'social':
        component = <SocialLayer userId={userId} venues={venues} userLocation={userLocation} />;
        break;

      case 'alerts':
        component = <TournamentAlerts dailyTournaments={dailyTournaments} userId={userId} userLocation={userLocation} />;
        break;

      case 'tripcost':
        component = (
          <div>
            <TripCostCalculator venues={venues} userLocation={userLocation} />
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                onClick={() => { setActivePod('roadtrip'); }}
                style={{
                  background: 'none', border: '1px solid rgba(148,163,184,0.15)',
                  borderRadius: 8, padding: '8px 20px', color: '#d4a853',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                Back to Trip Planner
              </button>
            </div>
          </div>
        );
        break;

      case 'compare':
        component = <VenueCompare venues={venues} userLocation={userLocation} />;
        break;

      case 'scraperhealth':
        component = <ScraperHealthDashboard />;
        break;

      case 'peakheatmap':
        component = <PeakActivityHeatmap />;
        break;

      case 'gametrends':
        component = <GameTrendsDashboard />;
        break;

      case 'gamealerts':
        component = <VenueGameAlerts userId={userId} venues={venues} />;
        break;

      default:
        component = (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>{feature.title}</p>
            <p style={{ fontSize: 13, marginTop: 8 }}>This module is being wired up.</p>
          </div>
        );
    }

    return { title: feature.title, component };
  }, [activePod, venues, tours, series, dailyTournaments, favorites, loading, userLocation, userId, router, handleToggleFavorite, sortBy, showFilters, filters, hasMore, page, fetchDaily, loadMore, handleSortChange, handleFilterChange, favoritedVenues, fetchError, fetchVenues, searchQuery, toursLoaded, seriesLoaded, checkinCounts]);

  // ─── Live data for the 3D scene (drives visual behavior) ───
  // ─── Contextual badge counts (not raw data totals) ───
  // Badge semantics: show actionable/relevant counts, not misleading "99+" totals
  const liveData = useMemo(() => {
    const today = new Date();
    const todayDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Tours with upcoming dates (next 30 days)
    const upcomingTours = tours.filter(t => {
      if (!t.start_date && !t.next_event_date) return false;
      const d = new Date(t.next_event_date || t.start_date);
      return d >= today && d <= thirtyDaysFromNow;
    });

    // Active/upcoming series
    const activeSeries = series.filter(s => {
      if (!s.end_date && !s.start_date) return true; // no dates = include
      const end = s.end_date ? new Date(s.end_date) : new Date(s.start_date);
      return end >= today;
    });

    // Today's tournaments — match by day_of_week OR by actual event date
    // Use local date (not UTC) — matches todayDay which uses local getDay()
    const todayDateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const todaysTournaments = dailyTournaments.filter(t => {
      // Match by day_of_week name (e.g., "Monday") or "Daily"
      const day = t.day_of_week || t.day;
      if (day && day.toLowerCase() === todayDay.toLowerCase()) return true;
      if (day && day.toLowerCase() === 'daily') return true;
      // Tour/charity events store date strings in day_of_week (e.g., "2026-04-03")
      if (day && day.startsWith(todayDateStr)) return true;
      // Fallback: check dedicated event_date or date field (NOT start_time — that's a time string)
      const eventDate = t.event_date || t.date;
      if (eventDate && String(eventDate).startsWith(todayDateStr)) return true;
      return false;
    });

    // Nearby venues (with GPS) vs total venues (without GPS)
    const nearbyVenues = userLocation
      ? venues.filter(v => v.distance_mi != null && v.distance_mi <= 100)
      : [];

    return {
      // Venue count badge: only show on "Poker Near Me" pod when GPS is active
      // Without GPS, badge is suppressed — no location = no "near me" context
      venueCount: userLocation ? nearbyVenues.length : 0,
      // Total loaded venues (for stats bar — always available regardless of GPS)
      totalVenueCount: venues.length,
      liveGameCount: liveGameCount,
      tourCount: upcomingTours.length > 0 ? upcomingTours.length : (toursLoaded ? 0 : null),
      seriesCount: activeSeries.length,
      // Daily Grind: today's tournaments — authoritative count from API
      // (includes venue daily tournaments + charity events + tour series events)
      dailyCount: todaysTournamentCount || todaysTournaments.length,
      // Calendar: total upcoming events across all days (distinct from dailyCount)
      calendarCount: dailyTournaments.length,
      alertCount: upcomingTours.length, // alerts = upcoming tour events only
      savedCount: Object.keys(favorites || {}).filter(k => favorites[k]).length,
      // Home games live in commander_home_groups, NOT poker_venues. The
      // podHomeGames state is populated from /api/public/home-games/discover
      // when the tab is visited. Until then we report 0 rather than filtering
      // `venues` (which is poker_venues-shaped and will never contain home games
      // — enforced by the ck_poker_venues_not_home_game DB check constraint).
      homeGameCount: Array.isArray(podHomeGames) ? podHomeGames.length : 0,
      // Map badge: only show when GPS is active (contextual: "X venues on your map")
      // Without GPS, map is still usable but badge count is misleading
      mappableCount: userLocation ? nearbyVenues.filter(v => v.latitude && v.longitude).length : 0,
      lastFetchTime: lastFetchTime,
    };
  }, [venues, tours, series, dailyTournaments, favorites, liveGameCount, userLocation, lastFetchTime, toursLoaded, todaysTournamentCount, podHomeGames]);

  return (
    <>
      <SEOHead
        title="Poker Near Me — Find Live Poker Rooms & Casinos"
        description="Discover Live Poker Rooms, Casinos, And Card Rooms Near You. Real-Time Game Info, Tournament Schedules, And Interactive Maps."
        canonical="/hub/poker-near-me/lobby"
      />

      <div className="pnm-lobby-page">
        {/* Universal header — back button is now inside the header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <UniversalHeader
              pageDepth={2}
              hideLeftIcon={false}
              onBackClick={() => {
                if (typeof window !== 'undefined') {
                  const referrer = document.referrer || '';
                  let safeBack = false;
                  try {
                    if (referrer) {
                      const refUrl = new URL(referrer);
                      if (refUrl.hostname === window.location.hostname) safeBack = true;
                    }
                  } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                  
                  if (safeBack) {
                    router.back();
                  } else {
                    router.push('/hub');
                  }
                }
              }}
              onMenuClick={() => setMenuOpen(true)}
            />
          </div>
        </div>

        {/* Hamburger menu */}
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

        {/* Layer 1 — Background */}
        <LobbyCanvas />

        {/* Layer 2 — UI Overlay */}
        <LobbyOverlay
          onPodSelect={handlePodClick}
          searchQuery={searchQuery}
          liveData={liveData}
          showTutorial={showTutorial}
          onTutorialDismiss={() => { setShowTutorial(false); try { localStorage.setItem('pnm_lobby_tutorial_seen', '1'); } catch (e) { console.warn('[App] Handled exception:', e); } }}
          gpsActive={gpsActive}
          gpsLoading={gpsLoading}
          onGpsClick={handleGpsClick}
          onVoiceClick={() => setShowVoiceSearch(true)}
          gpsError={gpsError}
          locationCity={locationCity}
          locationState={locationState}
          onManualLocation={() => setShowManualLocation(true)}
          onShowEnablePopup={() => setShowEnablePopup(true)}
          savedLocation={preferences?.lastLocation}
          savedLocationCity={preferences?.lastLocationCity}
          savedLocationState={preferences?.lastLocationState}
          onUseSavedLocation={() => {
            const saved = preferences?.lastLocation;
            if (saved?.lat && saved?.lng) {
              setUserLocation(saved);
              setGpsActive(true);
              setSortBy('distance');
              showLocationSuccessToast({
                city: preferences?.lastLocationCity || '',
                state: preferences?.lastLocationState || '',
              });
              const usedRadius = filters.radius || 50;
              const gpsUrl = `/api/poker/venues?limit=200&offset=0&lat=${saved.lat}&lng=${saved.lng}&radius=${usedRadius}&sort=distance`;
              cachedFetch(gpsUrl).then(data => {
                const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                setVenues(newVenues);
                setHasMore(newVenues.length >= PAGE_SIZE);
                setPage(0);
              }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
            }
          }}
          venueCount={totalVenueCount}
          onSearchBarClick={() => setShowGlobalSearch(true)}
        />


        {/* Layer 3 — Feature Panel (page level to escape overlay z-index stacking context) */}
        {showPanel && panelContent && (
          <>
            {/* Full-screen panel overlay */}
            <div
              className="lobby-panel-page"
              style={{
                position: 'fixed', inset: 0, zIndex: 51,
                background: 'linear-gradient(160deg, #0c1828, #060a14)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                animation: 'lobby-panelSlideUp 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px 14px',
                borderBottom: '1px solid rgba(110, 231, 239, 0.12)',
                background: 'rgba(6, 15, 28, 0.95)',
                flexShrink: 0,
              }}>
                <button
                  onClick={handlePanelClose}
                  aria-label="Back to grid"
                  style={{
                    background: 'rgba(110, 231, 239, 0.08)', border: '1px solid rgba(110, 231, 239, 0.15)',
                    color: '#d4a853',
                    cursor: 'pointer', padding: '6px 14px', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back
                </button>
                <h2 style={{
                  fontFamily: 'var(--font-premium-display)',
                  fontSize: 20, fontWeight: 700, margin: 0,
                  background: 'linear-gradient(90deg, #e0e8f0, #d4a853)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>{panelContent.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Share deep link button */}
                  <button
                    onClick={() => {
                      const shareUrl = window.location.href;
                      if (navigator.share) {
                        navigator.share({ title: `Smarter.Poker — ${panelContent.title}`, url: shareUrl }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                      } else {
                        navigator.clipboard?.writeText(shareUrl);
                        const btn = document.getElementById('pnm-share-btn');
                        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = ''; }, 1500); }
                      }
                    }}
                    id="pnm-share-btn"
                    aria-label="Share link"
                    title="Copy shareable link"
                    style={{
                      background: 'none', border: 'none',
                      color: 'rgba(200, 214, 229, 0.4)',
                      cursor: 'pointer', padding: 6, borderRadius: 8,
                      transition: 'color 0.2s', fontSize: 10,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                  </button>
                  <button
                    onClick={handlePanelClose}
                    aria-label="Close panel"
                    style={{
                      background: 'none', border: 'none',
                      color: 'rgba(200, 214, 229, 0.5)',
                      cursor: 'pointer', padding: 6, borderRadius: 8,
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Quick Pod Navigation — switch between pods without closing */}
              <div style={{
                display: 'flex', gap: 2, padding: '6px 12px', flexShrink: 0,
                overflowX: 'auto', scrollbarWidth: 'none',
                borderBottom: '1px solid rgba(148,163,184,0.06)',
                background: 'rgba(6,15,28,0.6)',
              }}>
                {[
                  { id: 'nearme', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z', label: 'Near Me' },
                  { id: 'search', icon: 'M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM21 21l-5.2-5.2', label: 'Search' },
                  { id: 'homegames', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', label: 'Home' },
                  { id: 'daily', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Daily' },
                  { id: 'livegames', icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'Live' },
                  { id: 'mapview', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7', label: 'Map' },
                  { id: 'tours', icon: 'M3 21l1.65-3.8a9 9 0 1112.7 0L21 21', label: 'Tours' },
                  { id: 'calendar', icon: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z', label: 'Calendar' },
                  { id: 'series', icon: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z', label: 'Series' },
                  { id: 'favorites', icon: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z', label: 'Saved' },
                  { id: 'alerts', icon: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0', label: 'Alerts' },
                ].map(p => (
                  <button key={p.id} onClick={() => { setActivePod(p.id); playClickSound(); }}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                      border: activePod === p.id ? '1px solid rgba(212,168,83,0.4)' : '1px solid transparent',
                      background: activePod === p.id ? 'rgba(212,168,83,0.1)' : 'transparent',
                      color: activePod === p.id ? '#d4a853' : 'rgba(200,214,229,0.35)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      letterSpacing: '0.02em',
                    }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={p.icon}/></svg>
                    {p.label}
                  </button>
                ))}
              </div>
              {/* GPS Intel Banner — contextual stats when GPS active */}
              {userLocation && (activePod === 'nearme' || activePod === 'search' || activePod === 'livegames' || activePod === 'daily') && (
                <div style={{
                  display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center',
                  padding: '8px 20px', flexShrink: 0,
                  background: 'linear-gradient(90deg, rgba(63,185,80,0.06), rgba(63,185,80,0.02), rgba(63,185,80,0.06))',
                  borderBottom: '1px solid rgba(63,185,80,0.1)',
                  fontSize: 11, color: 'rgba(200,214,229,0.55)', fontWeight: 600,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ color: '#3fb950' }}>{venues.filter(v => v.distance_miles && v.distance_miles <= 50).length || venues.length}</span> venues nearby
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7"/></svg>
                    <span style={{ color: '#d4a853' }}>{dailyTournaments.length.toLocaleString()}</span> tournaments
                  </span>
                  {locationCity && (
                    <span style={{ color: 'rgba(200,214,229,0.35)', fontSize: 10 }}>
                      {locationCity}{locationState ? `, ${locationState}` : ''}
                    </span>
                  )}
                </div>
              )}
              {/* Content — full remaining height with error recovery */}
              <div id="pnm-panel-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 90px', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
                <PodErrorBoundary podName={panelContent?.title || activePod} onReset={() => setActivePod(null)}>
                  {panelContent.component}
                </PodErrorBoundary>
                {/* Scroll-to-Top FAB */}
                <button
                  id="pnm-scroll-top"
                  onClick={() => { document.getElementById('pnm-panel-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  style={{
                    position: 'sticky', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                    width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
                    background: 'linear-gradient(135deg, rgba(148,163,184,0.12), rgba(212,168,83,0.05))',
                    border: '1px solid rgba(212,168,83,0.3)',
                    color: '#d4a853', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s', zIndex: 5,
                  }}
                  aria-label="Scroll to top"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Voice Search Modal */}
        {showVoiceSearch && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(3,4,8,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 'min(500px, 90vw)', maxHeight: '80vh', overflow: 'auto',
              background: 'rgba(18,24,40,0.97)', borderRadius: 20,
              border: '1px solid rgba(148,163,184,0.12)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(212,168,83,0.08)' }}>
                <span style={{ color: '#d4a853', fontSize: 16, fontWeight: 600 }}>Voice Search</span>
                <button onClick={() => setShowVoiceSearch(false)} style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.5)', cursor: 'pointer', fontSize: 20 }}>&times;</button>
              </div>
              <div style={{ padding: 20 }}>
                <VoiceSearch onResult={handleVoiceResult} />
              </div>
            </div>
          </div>
        )}
        {/* Login Prompt Modal — auth gate for Check In / Review */}
                    {showLoginPrompt && (
                <LoginPromptModal
                    showLoginPrompt={showLoginPrompt}
                    setShowLoginPrompt={setShowLoginPrompt}
                />
            )}

        {/* Venue Reviews Modal */}
        {selectedVenueForReview && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(3,4,8,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 'min(600px, 95vw)', maxHeight: '85vh', overflow: 'auto',
              background: 'rgba(18,24,40,0.97)', borderRadius: 20,
              border: '1px solid rgba(148,163,184,0.12)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(212,168,83,0.08)' }}>
                <span style={{ color: '#d4a853', fontSize: 16, fontWeight: 600 }}>Reviews — {selectedVenueForReview.name}</span>
                <button onClick={() => setSelectedVenueForReview(null)} style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.5)', cursor: 'pointer', fontSize: 20 }}>&times;</button>
              </div>
              <div style={{ padding: 20 }}>
                <VenueReviews venueId={selectedVenueForReview.id} userId={userId} />
              </div>
            </div>
          </div>
        )}

      </div>

        {/* ═══ GPS LOCATION SUCCESS TOAST ═══ */}
        {locationToast && (
          <div style={{
            position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
            background: 'linear-gradient(135deg, rgba(16,25,40,0.97), rgba(10,18,32,0.97))',
            border: '1px solid rgba(63,185,80,0.5)', borderRadius: 16,
            padding: '16px 28px', boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(63,185,80,0.15)',
            display: 'flex', alignItems: 'center', gap: 14,
            animation: 'lobby-toastSlideIn 0.3s ease-out',
            backdropFilter: 'blur(16px)',
            minWidth: 260, maxWidth: '90vw',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'rgba(63,185,80,0.15)', border: '2px solid rgba(63,185,80,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#3fb950', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2 }}>Location Found</div>
              <div style={{ fontSize: 17, color: '#e0e8f0', fontWeight: 700 }}>
                {locationToast.city}{locationToast.state ? `, ${locationToast.state}` : ''}
              </div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" style={{ marginLeft: 'auto', opacity: 0.6 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        {/* ═══ SMART ENABLE LOCATION POPUP ═══ */}
                    {showEnablePopup && (
                <LocationEnablePopup
                    showEnablePopup={showEnablePopup}
                    setShowEnablePopup={setShowEnablePopup}
                    handleRefreshLocation={handleRefreshLocation}
                />
            )}

        {/* ═══ MANUAL LOCATION SETTER MODAL ═══ */}
                    {showManualLocation && (
                <ManualLocationModal
                    showManualLocation={showManualLocation}
                    setShowManualLocation={setShowManualLocation}
                    manualAddress={manualAddress}
                    setManualAddress={setManualAddress}
                    handleGeocodeAddress={handleGeocodeAddress}
                    isSearching={isSearching}
                />
            )}

      {/* ═══ GLOBAL SEARCH OVERLAY ═══
           Full-screen Google-style search: city, state, venue, tour, series, tournament.
           Location = null. Fuzzy match across all content types. */}
      <GlobalSearchOverlay
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allTours={tours}
        allSeries={series}
        searchHistory={searchHistory}
        onHistorySelect={(q) => {
          setSearchQuery(q);
          if (typeof addSearchHistoryToDb === 'function' && userId) {
            addSearchHistoryToDb(userId, q).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          }
        }}
        cachedFetch={cachedFetch}
        onVenueClick={(venue) => {
          setShowGlobalSearch(false);
          // Open the venue detail panel/page
          const url = '/hub/venues/' + venue.id;
          router.push(url);
        }}
        onTourClick={(tour) => {
          setShowGlobalSearch(false);
          router.push('/hub/poker-near-me/tours');
        }}
        onSeriesClick={(s) => {
          setShowGlobalSearch(false);
          router.push('/hub/poker-near-me/series');
        }}
      />

      {/* Geofence Alert Banner */}
      {geofenceAlert && (
          <GeofenceAlertBanner
              venue={geofenceAlert}
              onCheckin={() => {
                  const gfUrl = geofenceAlert.is_social_page
                      ? '/club/' + geofenceAlert.social_page_id
                      : '/hub/venues/' + geofenceAlert.id;
                  router.push(gfUrl + '?action=checkin');
                  setGeofenceAlert(null);
              }}
              onReview={() => {
                  const gfUrl = geofenceAlert.is_social_page
                      ? '/club/' + geofenceAlert.social_page_id
                      : '/hub/venues/' + geofenceAlert.id;
                  router.push(gfUrl + '?action=review');
                  setGeofenceAlert(null);
              }}
              onDismiss={() => setGeofenceAlert(null)}
          />
      )}

      {/* Global keyframes + VenueCard CSS (required for VenueCard component styling) */}
      <style>{`
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes lobby-panelSlideUp {
        from { transform: translateY(100%); opacity: 0.5; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes lobby-toastSlideIn {
        from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      @keyframes lobby-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes lobby-gpsPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); }
        50% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
      }
      @keyframes lobby-badgePulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      @keyframes pnm-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      /* ═══ ENTITY CARD BASE — v2.1 ═══ */
      .entity-card {
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.75), rgba(10, 18, 32, 0.9));
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 16px;
        padding: 16px 18px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 2px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04);
        position: relative;
      }
      .entity-card:hover {
        border-color: rgba(212,168,83,0.3);
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(10, 18, 32, 0.96));
        box-shadow: 0 6px 28px rgba(212,168,83,0.1), 0 2px 12px rgba(0,0,0,0.35);
        transform: translateY(-2px);
      }
      .entity-card h4 {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 4px;
        color: #fff;
      }

      /* ═══ PREMIUM VENUE CARD v2.1 ═══ */
      .venue-card {
        position: relative;
        overflow: hidden;
      }

      /* Accent Line — always visible, uses venue type color */
      .venue-accent-line {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        border-radius: 16px 16px 0 0;
        opacity: 0.7;
        transition: opacity 0.3s;
      }
      .venue-card:hover .venue-accent-line {
        opacity: 1;
      }

      /* Distance Pill */
      .venue-distance-pill {
        position: absolute;
        top: 14px; right: 50px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(34,197,94,0.14);
        border: 1px solid rgba(34,197,94,0.3);
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        color: #4ade80;
        z-index: 1;
      }

      /* Favorite Button */
      .fav-btn {
        position: absolute;
        top: 10px; right: 10px;
        background: rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 50%;
        width: 34px; height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2;
        transition: all 0.2s;
      }
      .fav-btn:hover {
        background: rgba(239,68,68,0.35);
        transform: scale(1.12);
        border-color: rgba(239,68,68,0.3);
      }
      .fav-btn.active {
        background: rgba(239,68,68,0.2);
        border-color: rgba(239,68,68,0.4);
      }

      /* Venue Type Badge */
      .venue-type-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-bottom: 8px;
      }

      /* Venue Name — enhanced typography */
      .venue-name {
        font-size: 18px !important;
        font-weight: 800 !important;
        margin: 0 0 6px !important;
        color: #f0f4f8;
        padding-right: 80px;
        line-height: 1.3;
        letter-spacing: -0.2px;
      }

      /* Venue Address — improved contrast */
      .venue-address {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: rgba(255,255,255,0.58);
        margin: 0 0 10px;
        line-height: 1.4;
      }

      /* Venue Host Row */
      .venue-host-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        margin-bottom: 6px;
      }

      /* Venue Stakes */
      .venue-stakes {
        font-size: 13px;
        color: rgba(212,168,83,0.9);
        margin: 0 0 8px;
        font-weight: 600;
      }

      /* Trust Score Row — upgraded bar height + animation */
      .trust-score-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 0 8px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: 4px;
      }
      .trust-score-label {
        font-size: 11.5px;
        font-weight: 700;
        white-space: nowrap;
      }
      .trust-score-bar {
        flex: 1;
        height: 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        overflow: hidden;
      }
      .trust-score-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .trust-score-val {
        font-size: 11.5px;
        font-weight: 800;
        white-space: nowrap;
      }

      /* ═══ UNIFIED ACTION BAR v2.1 ═══ */
      .venue-action-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: 6px;
      }

      /* Secondary icon-only buttons (Web/Call/Map) */
      .venue-secondary-actions {
        display: flex;
        gap: 6px;
      }
      .venue-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px; height: 36px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.6);
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s;
      }
      .venue-icon-btn:hover {
        background: rgba(255,255,255,0.1);
        border-color: rgba(255,255,255,0.25);
        color: #fff;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }

      /* Primary action pills (Check In/Review/Details) */
      .venue-primary-actions {
        display: flex;
        gap: 6px;
        flex: 1;
        justify-content: flex-end;
      }
      .venue-action-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 7px 12px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s;
        font-family: inherit;
        white-space: nowrap;
      }
      .venue-action-pill span {
        font-size: 11.5px;
      }
      .venue-action-pill.checkin {
        background: rgba(34,197,94,0.12);
        color: #4ade80;
        border-color: rgba(34,197,94,0.25);
      }
      .venue-action-pill.checkin:hover {
        background: rgba(34,197,94,0.22);
        box-shadow: 0 0 12px rgba(34,197,94,0.15);
      }
      .venue-action-pill.review {
        background: rgba(59,130,246,0.12);
        color: #60a5fa;
        border-color: rgba(59,130,246,0.25);
      }
      .venue-action-pill.review:hover {
        background: rgba(59,130,246,0.22);
        box-shadow: 0 0 12px rgba(59,130,246,0.15);
      }
      .venue-action-pill.details {
        background: rgba(212,168,83,0.12);
        color: #d4a853;
        border-color: rgba(212,168,83,0.25);
      }
      .venue-action-pill.details:hover {
        background: rgba(212,168,83,0.22);
        box-shadow: 0 0 12px rgba(212,168,83,0.15);
      }

      /* Legacy action classes preserved for compatibility */
      .venue-action-row { display: none; }
      .venue-quick-actions { display: none; }

      /* ═══════════════════════════════════════════════
         VC3 DESIGN SYSTEM — VenueCard v4.0
         Complete CSS for the vc3-* component library
         ═══════════════════════════════════════════════ */

      /* Card Container */
      .vc3-card {
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.75), rgba(10, 18, 32, 0.9));
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 16px;
        padding: 16px 18px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 2px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04);
        position: relative;
        overflow: hidden;
        cursor: pointer;
      }
      .vc3-card:hover {
        filter: brightness(1.08);
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(10, 18, 32, 0.96));
        box-shadow: 0 6px 28px rgba(212,168,83,0.1), 0 2px 12px rgba(0,0,0,0.35);
        transform: translateY(-2px);
      }

      /* Header Zone */
      .vc3-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      /* Status Group (right side) */
      .vc3-status-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Open/Closed Pill */
      .vc3-open-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        background: rgba(34,197,94,0.12);
        border: 1px solid rgba(34,197,94,0.3);
        color: #4ade80;
      }
      .vc3-open-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 6px rgba(74,222,128,0.5);
        animation: vc3-pulse 2s ease-in-out infinite;
      }
      @keyframes vc3-pulse {
        0%, 100% { box-shadow: 0 0 3px rgba(74,222,128,0.3); }
        50% { box-shadow: 0 0 8px rgba(74,222,128,0.6); }
      }

      /* Distance pill */
      .vc3-distance {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        background: rgba(34,197,94,0.1);
        border: 1px solid rgba(34,197,94,0.25);
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        color: #4ade80;
      }

      /* Type Badge */
      .vc3-type-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border: 1px solid;
      }

      /* Favorite Button */
      .vc3-fav {
        position: absolute;
        top: 10px; right: 10px;
        background: rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 50%;
        width: 34px; height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2;
        transition: all 0.2s;
      }
      .vc3-fav:hover { background: rgba(239,68,68,0.35); transform: scale(1.12); border-color: rgba(239,68,68,0.3); }
      .vc3-fav.active { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.4); }

      /* Name */
      .vc3-name {
        font-size: 18px;
        font-weight: 800;
        margin: 0 0 6px;
        color: #f0f4f8;
        padding-right: 80px;
        line-height: 1.3;
        letter-spacing: -0.2px;
      }

      /* Address */
      .vc3-address {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: rgba(255,255,255,0.58);
        margin: 0 0 10px;
        line-height: 1.4;
      }

      /* Host for Home Games */
      .vc3-host {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 4px 0 6px;
      }
      .vc3-host-name { font-size: 13px; color: #d4a853; font-weight: 600; }
      .vc3-host-link { font-size: 11px; color: #d4a853; text-decoration: none; margin-left: auto; padding: 2px 8px; border: 1px solid rgba(212,168,83,0.3); border-radius: 4px; }
      .vc3-host-link:hover { background: rgba(212,168,83,0.15); }
      .vc3-description { font-size: 13px; color: rgba(255,255,255,0.5); margin: 0 0 8px; font-style: italic; }

      /* Badge Row */
      .vc3-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .vc3-badge {
        padding: 3px 9px;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .vc3-badge-featured { background: rgba(212,168,83,0.2); color: #d4a853; border: 1px solid rgba(212,168,83,0.35); }
      .vc3-badge-newcomer { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
      .vc3-badge-promo { background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }
      .vc3-badge-tourney { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
      .vc3-badge-live {
        background: rgba(239,68,68,0.18); color: #ef4444; border: 1px solid rgba(239,68,68,0.4);
        box-shadow: 0 0 8px rgba(239,68,68,0.2); animation: livePulse 2s ease-in-out infinite;
        display: inline-flex; align-items: center; gap: 5px;
      }
      .vc3-live-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #ef4444;
        box-shadow: 0 0 6px rgba(239,68,68,0.5); animation: livePulse 2s ease-in-out infinite;
      }
      .vc3-badge-checkin { background: rgba(230,81,0,0.15); color: #E65100; border: 1px solid rgba(230,81,0,0.3); cursor: pointer; }
      .vc3-badge-checkin:hover { background: rgba(230,81,0,0.25); }

      /* Data Zone */
      .vc3-data-zone { margin-top: 4px; }

      /* Live Info Row */
      .vc3-live-info {
        display: flex;
        gap: 16px;
        margin-bottom: 8px;
        padding: 8px 10px;
        background: rgba(0,0,0,0.15);
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.04);
      }
      .vc3-live-stat { display: flex; align-items: center; gap: 6px; }
      .vc3-live-stat-val { font-size: 16px; font-weight: 800; color: #fff; }
      .vc3-live-stat-label { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.3px; }

      /* Hours */
      .vc3-hours {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12.5px;
        color: rgba(255,255,255,0.55);
        margin: 0 0 6px;
        font-style: italic;
      }

      /* Game Chips */
      .vc3-games {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .vc3-game-chip {
        padding: 4px 10px;
        border-radius: 5px;
        font-size: 11.5px;
        font-weight: 600;
        border: 1px solid;
      }

      /* Stakes */
      .vc3-stakes {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: rgba(212,168,83,0.9);
        margin: 0 0 8px;
        font-weight: 600;
      }

      /* Trust Score */
      .vc3-trust {
        padding: 10px 0 8px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: 4px;
      }
      .vc3-trust-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      .vc3-trust-label { font-size: 11.5px; font-weight: 700; }
      .vc3-trust-val { font-size: 11.5px; font-weight: 800; }
      .vc3-trust-track {
        height: 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        overflow: hidden;
      }
      .vc3-trust-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Action Bar */
      .vc3-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: 6px;
      }
      .vc3-actions-secondary { display: flex; gap: 6px; }
      .vc3-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px; height: 36px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.6);
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s;
      }
      .vc3-icon-btn:hover {
        background: rgba(255,255,255,0.1);
        border-color: rgba(255,255,255,0.25);
        color: #fff;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      .vc3-actions-primary {
        display: flex;
        gap: 6px;
        flex: 1;
        justify-content: flex-end;
      }
      .vc3-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 7px 12px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s;
        font-family: inherit;
        white-space: nowrap;
        background: none;
      }
      .vc3-pill span { font-size: 11.5px; }
      .vc3-pill-checkin { background: rgba(34,197,94,0.12); color: #4ade80; border-color: rgba(34,197,94,0.25); }
      .vc3-pill-checkin:hover { background: rgba(34,197,94,0.22); box-shadow: 0 0 12px rgba(34,197,94,0.15); }
      .vc3-pill-review { background: rgba(59,130,246,0.12); color: #60a5fa; border-color: rgba(59,130,246,0.25); }
      .vc3-pill-review:hover { background: rgba(59,130,246,0.22); box-shadow: 0 0 12px rgba(59,130,246,0.15); }
      .vc3-pill-details { background: rgba(212,168,83,0.12); color: #d4a853; border-color: rgba(212,168,83,0.25); }
      .vc3-pill-details:hover { background: rgba(212,168,83,0.22); box-shadow: 0 0 12px rgba(212,168,83,0.15); }

      /* ═══ VC3 MOBILE RESPONSIVE ═══ */
      @media (max-width: 480px) {
        .vc3-actions { flex-direction: column; gap: 8px; }
        .vc3-actions-secondary { width: 100%; justify-content: flex-start; }
        .vc3-actions-primary { width: 100%; justify-content: stretch; }
        .vc3-pill { flex: 1; justify-content: center; }
        .vc3-name { font-size: 16px; padding-right: 70px; }
        .vc3-header { flex-wrap: wrap; gap: 8px; }
        .vc3-status-group { flex-wrap: wrap; gap: 4px; }
      }

      /* Badge Row — improved sizing */
      .badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .mini-badge {
        padding: 3px 9px;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .featured-badge {
        background: rgba(212,168,83,0.2);
        color: #d4a853;
        border: 1px solid rgba(212,168,83,0.35);
      }
      .newcomer-badge {
        background: rgba(34,197,94,0.15);
        color: #4ade80;
        border: 1px solid rgba(34,197,94,0.3);
      }
      .promo-badge {
        background: rgba(139,92,246,0.15);
        color: #a78bfa;
        border: 1px solid rgba(139,92,246,0.3);
      }
      .tourney-badge {
        background: rgba(239,68,68,0.12);
        color: #f87171;
        border: 1px solid rgba(239,68,68,0.25);
      }
      .live-badge {
        background: rgba(239,68,68,0.18);
        color: #ef4444;
        border: 1px solid rgba(239,68,68,0.4);
        box-shadow: 0 0 8px rgba(239,68,68,0.2);
        animation: livePulse 2s ease-in-out infinite;
      }
      .checkin-badge {
        background: rgba(230,81,0,0.15);
        color: #E65100;
        border: 1px solid rgba(230,81,0,0.3);
        cursor: pointer;
      }
      .checkin-badge:hover {
        background: rgba(230,81,0,0.25);
      }
      @keyframes livePulse {
        0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); }
        50% { box-shadow: 0 0 14px rgba(239,68,68,0.35); }
      }

      /* Card Tags — improved contrast */
      .card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .tag {
        padding: 4px 10px;
        border-radius: 5px;
        font-size: 11.5px;
        font-weight: 500;
        background: rgba(212,168,83,0.08);
        color: rgba(255,255,255,0.75);
        border: 1.5px solid rgba(148,163,184,0.1);
      }
      .tag.game {
        background: rgba(212,168,83,0.08);
        border: 1.5px solid rgba(148,163,184,0.1);
      }
      .tag.distance { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }

      /* Card Hours */
      .card-hours {
        font-size: 12.5px;
        color: rgba(255,255,255,0.55);
        margin: 0 0 6px;
        font-style: italic;
      }

      /* ═══ MOBILE RESPONSIVE ═══ */
      @media (max-width: 480px) {
        .venue-action-bar {
          flex-direction: column;
          gap: 8px;
        }
        .venue-secondary-actions {
          width: 100%;
          justify-content: flex-start;
        }
        .venue-primary-actions {
          width: 100%;
          justify-content: stretch;
        }
        .venue-action-pill {
          flex: 1;
          justify-content: center;
        }
        .venue-name {
          font-size: 16px !important;
          padding-right: 70px;
        }
      }
    `}</style>
    </>
  );
}
/* audit-trigger: 1774471099 */
// GOAT Search Engine rebuild trigger 1774534082
