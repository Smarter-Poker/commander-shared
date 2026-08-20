/**
 * Hamburger Menu Configurations
 * ═══════════════════════════════════════════════════════════════════════════
 * Centralized menu configurations for all World Hub pages
 * Each world has its own menu items, toggles, and navigation
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

// Helper to copy referral link for the current user
export const copyReferralLink = async (user) => {
    if (!user?.id) {
        alert('Please log in to use referral links.');
        return;
    }
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
        const { data } = await supabase
            .from('profiles')
            .select('player_number')
            .eq('id', user.id)
            .maybeSingle();
        if (data?.player_number) {
            const link = `https://smarter.poker/auth/signup?ref=${data.player_number}`;
            await navigator.clipboard.writeText(link);
            alert(`Referral link copied!\n\n${link}\n\nShare it with friends — you earn 500💎 per signup!`);
        } else {
            alert('Could not find your player number. Please try again.');
        }
    } catch (err) {
        console.warn('Copy referral link error:', err);
        alert('Failed to copy referral link. Please try again.');
    }
};

// Self-contained sign out action — works without requiring handlers
const signOutAction = () => {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { storageKey: 'smarter-poker-auth' } }
    );
    // signOut() must run FIRST so it can read the session token to revoke server-side.
    // localStorage cleanup runs in .finally() AFTER the server request completes.
    supabase.auth.signOut().finally(() => {
        try { localStorage.removeItem('sp-social-user'); } catch (_) {}
        try { localStorage.removeItem('sp-vip-status'); } catch (_) {}
        try { localStorage.removeItem('smarter-poker-auth'); } catch (_) {}
        window.top.location.href = '/';
    });
};

// Round 33 fix: Lazy-built sign-out link to dodge a Next.js SSG TDZ that
// kept reproducing as `ReferenceError: Cannot access 'tW' before initialization`
// in the prerender of /hub/settings (every Vercel build since commit
// 551de7a2). The original code declared this object as a module-scope
// `const` whose `icon` JSX is evaluated during module load. Even though
// `signOutAction` is declared above on line 41, Next.js page-level static
// optimization can re-order or split chunks across the module boundary in
// ways that expose the TDZ window during SSR. Wrapping the definition in
// a function ensures the JSX + closure binding only evaluate at the call
// site (which always runs INSIDE a MENU_CONFIGS callback, after both
// signOutAction and the JSX runtime are resolved).
function getSignOutBottomLink() {
    return {
        label: 'Log Out',
        action: true,
        onClick: signOutAction,
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
        ),
    };
}

// Helper function to create menu items
export const createMenuItem = {
    navigation: (label, href, icon = null, badge = null, onClick = null) => ({
        type: 'navigation',
        label,
        href,
        icon,
        badge,
        onClick
    }),
    toggle: (label, checked, onChange, hint = null) => ({
        type: 'toggle',
        label,
        checked,
        onChange,
        hint
    }),
    action: (label, onClick, icon = null, primary = false, closeOnClick = true) => ({
        type: 'action',
        label,
        onClick,
        icon,
        primary,
        closeOnClick
    }),
    divider: () => ({
        type: 'divider'
    }),
    section: (label) => ({
        type: 'section',
        label
    }),
    grid: (items, columns = 2) => ({
        type: 'grid',
        items,
        columns
    })
};

// Common icons (SVG components)
export const MenuIcons = {
    help: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
        </svg>
    ),
    settings: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
    ),
    home: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    ),
    training: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
    ),
    trophy: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0012 0V2z" />
        </svg>
    ),
    message: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
    ),
    users: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
    ),
    video: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
    ),
    store: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
        </svg>
    )
};

// Menu configurations for each world
export const MENU_CONFIGS = {
    'hub-home': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Quick Navigation'),
            createMenuItem.grid([
                {
                    label: 'Training',
                    href: '/hub/training',
                    icon: MenuIcons.training
                },
                {
                    label: 'Diamond Arena',
                    href: '/hub/diamond-arena',
                    icon: MenuIcons.trophy
                },
                {
                    label: 'Club Arena',
                    href: '/hub/club-arena',
                    icon: (
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="6" width="6" height="14" rx="1" fill="#8b5cf6" />
                            <rect x="9" y="3" width="6" height="17" rx="1" fill="#a78bfa" />
                            <rect x="16" y="6" width="6" height="14" rx="1" fill="#c4b5fd" />
                        </svg>
                    )
                },
                {
                    label: 'Diamond Store',
                    href: '/hub/diamond-store',
                    icon: MenuIcons.store
                },
                {
                    label: 'Friends',
                    href: '/hub/friends',
                    icon: MenuIcons.users
                },
                {
                    label: 'Messenger',
                    href: '/hub/messenger',
                    icon: MenuIcons.message
                }
            ]),
            createMenuItem.divider(),
            createMenuItem.section('Dealer Tools'),
            createMenuItem.navigation('♠️ Toke Tracker', '/hub/toke-tracker'),
            createMenuItem.navigation('📋 Work Schedule & Dealer Downs', '/hub/toke-tracker'),
            createMenuItem.navigation('🎯 Set Monthly Goal', '/hub/toke-tracker/shift'),
            createMenuItem.divider(),
            createMenuItem.navigation('Reels', '/hub/reels', MenuIcons.video),
            createMenuItem.navigation('News', '/hub/news'),
            createMenuItem.navigation('Poker Near Me', '/hub/poker-near-me/lobby'),
            createMenuItem.navigation('Home Games', '/hub/home-games'),
            createMenuItem.navigation('📊 Session History', '/hub/session-history'),
            createMenuItem.navigation('🧮 Odds Calculator', '/hub/poker-tools'),
            createMenuItem.divider(),
            createMenuItem.action('🎴 Customize My Hub', () => handlers?.openCardCustomizer?.()),
            createMenuItem.navigation('📲 Install App', '/hub/install')
        ],
        bottomLinks: [
            { label: 'Help and Support', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings },
            getSignOutBottomLink()
        ]
    }),

    'training': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Training Settings'),
            createMenuItem.toggle(
                'View Mode',
                state.viewMode === 'pro',
                (checked) => handlers.setViewMode(checked ? 'pro' : 'standard'),
                state.viewMode === 'pro' ? 'Advanced terminology' : 'Beginner-friendly'
            ),
            createMenuItem.toggle(
                'Sound Effects',
                state.soundEnabled || false,
                handlers.setSoundEnabled
            ),
            createMenuItem.toggle(
                'Timer',
                state.timerEnabled !== false,
                handlers.setTimerEnabled
            ),
            createMenuItem.toggle(
                'Auto-Advance',
                state.autoAdvance || false,
                handlers.setAutoAdvance,
                'Automatically move to next question'
            ),
            createMenuItem.toggle(
                'Show Hints',
                state.showHints !== false,
                handlers.setShowHints,
                'Display helpful hints during training'
            ),
            createMenuItem.divider(),
            createMenuItem.section('Navigation'),
            createMenuItem.navigation('Training Library', '/hub/training'),
            createMenuItem.navigation('My Progress', '/hub/training/progress'),
            createMenuItem.navigation('Leaderboard', '/hub/training/leaderboard')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    'messenger': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Conversations'),
            createMenuItem.navigation('All Messages', '/hub/messenger?filter=all'),
            createMenuItem.navigation('Unread', '/hub/messenger?filter=unread', null, state.unreadCount || null),
            createMenuItem.navigation('Archived', '/hub/messenger?filter=archived'),
            createMenuItem.navigation('Message Requests', '/hub/messenger/requests', null, state.requestCount || null),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Notifications',
                state.notifications !== false,
                handlers.setNotifications
            ),
            createMenuItem.toggle(
                'Read Receipts',
                state.readReceipts !== false,
                handlers.setReadReceipts
            ),
            createMenuItem.toggle(
                'Active Status',
                state.activeStatus !== false,
                handlers.setActiveStatus
            ),
            createMenuItem.toggle(
                'Message Sounds',
                state.messageSounds !== false,
                handlers.setMessageSounds
            ),
            createMenuItem.divider(),
            createMenuItem.navigation('Privacy Settings', '/hub/settings?section=privacy'),
            createMenuItem.navigation('Blocked Users', '/hub/messenger/blocked')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'reels': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Feed'),
            createMenuItem.navigation('For You', '/hub/reels?feed=foryou'),
            createMenuItem.navigation('Following', '/hub/reels?feed=following'),
            createMenuItem.navigation('Trending', '/hub/reels?feed=trending'),
            createMenuItem.divider(),
            createMenuItem.action('Upload Reel', handlers.onUploadReel, null, true),
            createMenuItem.navigation('My Reels', '/hub/reels/my-reels'),
            createMenuItem.navigation('Saved Reels', '/hub/reels/saved'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Autoplay',
                state.autoplay !== false,
                handlers.setAutoplay
            ),
            createMenuItem.toggle(
                'Sound on Scroll',
                state.soundOnScroll !== false,
                handlers.setSoundOnScroll
            ),
            createMenuItem.toggle(
                'Data Saver',
                state.dataSaver || false,
                handlers.setDataSaver,
                'Reduce video quality to save data'
            ),
            createMenuItem.toggle(
                'Show Captions',
                state.showCaptions !== false,
                handlers.setShowCaptions
            ),
            createMenuItem.divider(),
            createMenuItem.navigation('Content Preferences', '/hub/settings?section=content')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'friends': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.navigation('Friend Requests', '/hub/friends?tab=requests', null, state.requestCount || null),
            createMenuItem.navigation('Suggestions', '/hub/friends?tab=suggestions'),
            createMenuItem.navigation('All Friends', '/hub/friends?tab=all'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Friend Requests',
                state.allowRequests !== false,
                handlers.setAllowRequests,
                'Who can send you friend requests'
            ),
            createMenuItem.toggle(
                'Show Online Status',
                state.showOnlineStatus !== false,
                handlers.setShowOnlineStatus
            ),
            createMenuItem.toggle(
                'Friend Suggestions',
                state.friendSuggestions !== false,
                handlers.setFriendSuggestions
            ),
            createMenuItem.divider(),
            createMenuItem.navigation('Privacy Settings', '/hub/settings?section=privacy'),
            createMenuItem.navigation('Blocked Users', '/hub/settings?section=blocked')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'diamond-store': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Categories'),
            createMenuItem.navigation('All Products', '/hub/diamond-store'),
            createMenuItem.navigation('Diamonds', '/hub/diamond-store?category=diamonds'),
            createMenuItem.navigation('VIP Membership', '/hub/diamond-store?category=vip'),
            createMenuItem.navigation('Merchandise', '/hub/diamond-store?category=merch'),
            createMenuItem.divider(),
            createMenuItem.navigation('Shopping Cart', '/hub/diamond-store/cart', MenuIcons.store, state.cartCount || null),
            createMenuItem.navigation('Order History', '/hub/diamond-store/orders'),
            createMenuItem.navigation('Wishlist', '/hub/diamond-store/wishlist'),
            createMenuItem.navigation('Payment Methods', '/hub/settings?section=payments'),
            createMenuItem.divider(),
            createMenuItem.section('Preferences'),
            createMenuItem.toggle(
                'Email Receipts',
                state.emailReceipts !== false,
                handlers.setEmailReceipts
            ),
            createMenuItem.toggle(
                'Promotional Emails',
                state.promoEmails || false,
                handlers.setPromoEmails
            )
        ],
        bottomLinks: [
            { label: 'Help & Support', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'settings': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Quick Navigation'),
            createMenuItem.navigation('Account Settings', '/hub/settings?section=account'),
            createMenuItem.navigation('Privacy & Security', '/hub/settings?section=privacy'),
            createMenuItem.navigation('Notifications', '/hub/settings?section=notifications'),
            createMenuItem.navigation('Display & Sound', '/hub/settings?section=display'),
            createMenuItem.navigation('Billing & Payments', '/hub/settings?section=billing'),
            createMenuItem.divider(),
            createMenuItem.section('Account Actions'),
            createMenuItem.action('Log Out', handlers.onSignOut, null, false, true),
            createMenuItem.navigation('Delete Account', '/hub/settings?section=delete-account')
        ],
        bottomLinks: [
            { label: 'Help & Support', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'bankroll-manager': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.action('Adjust Bankroll', handlers.onAdjustBankroll),
            createMenuItem.divider(),
            createMenuItem.section('Views'),
            createMenuItem.navigation('Dashboard', '/hub/bankroll-manager?view=dashboard'),
            createMenuItem.navigation('Log Session', '/hub/bankroll-manager?view=log-session'),
            createMenuItem.navigation('Trip Tracker', '/hub/bankroll-manager?view=trips'),
            createMenuItem.navigation('Reports', '/hub/bankroll-manager?view=reports'),
            createMenuItem.navigation('Saved Receipts', '/hub/bankroll-manager?view=receipts'),
            createMenuItem.divider(),
            createMenuItem.section('Game Types'),
            createMenuItem.navigation('Cash Games', '/hub/bankroll-manager?type=cash'),
            createMenuItem.navigation('Tournaments', '/hub/bankroll-manager?type=tournament'),
            createMenuItem.navigation('Table Games', '/hub/bankroll-manager?type=casino'),
            createMenuItem.navigation('Slots', '/hub/bankroll-manager?type=slots'),
            createMenuItem.navigation('Sports Betting', '/hub/bankroll-manager?type=sports'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Display EUR', state.currencyEUR || false, handlers.setCurrencyEUR, 'Show amounts in Euros'),
            createMenuItem.toggle('Auto-Save', state.autoSave !== false, handlers.setAutoSave),
            createMenuItem.toggle('Notifications', state.notifications !== false, handlers.setNotifications),
            createMenuItem.navigation('Bankroll Rules', '/hub/bankroll-manager?view=rules'),
            createMenuItem.navigation('Goals', '/hub/bankroll-manager?view=goals'),
            createMenuItem.navigation('Manage Venues & Settings', '/hub/bankroll-manager?view=settings'),
            createMenuItem.navigation('Export Data', '/hub/bankroll-manager/export')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'poker-near-me': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.action('Search Poker Near Me', () => handlers?.openGlobalSearch?.(), null, true, true),
            createMenuItem.divider(),
            createMenuItem.section('Browse'),
            createMenuItem.navigation('Venues', '/hub/poker-near-me/venues'),
            createMenuItem.navigation('Events', '/hub/poker-near-me/events'),
            createMenuItem.navigation('Live Games', '/hub/poker-near-me/live-games'),
            createMenuItem.navigation('Map View', '/hub/poker-near-me/map'),
            createMenuItem.navigation('Saved', '/hub/poker-near-me/saved'),
            createMenuItem.divider(),
            createMenuItem.section('More Tools'),
            createMenuItem.navigation('Game Trends', '/hub/poker-near-me/more?feature=trends'),
            createMenuItem.navigation('Peak Activity', '/hub/poker-near-me/more?feature=heatmap'),
            createMenuItem.navigation('Compare Venues', '/hub/poker-near-me/more?feature=compare'),
            createMenuItem.navigation('Trip Cost Calculator', '/hub/poker-near-me/roadtrip'),
            createMenuItem.navigation('Game Alerts', '/hub/poker-near-me/alerts'),
            createMenuItem.divider(),
            createMenuItem.section('Help'),
            createMenuItem.action('Replay Tutorial', () => handlers?.replayTutorial?.(), null, false, true),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Geofence Alerts', state.geofenceAlerts !== false, handlers.setGeofenceAlerts, 'Get Notified When Near Poker Venues'),
            createMenuItem.toggle('Location Services', state.locationEnabled !== false, handlers.setLocationEnabled),
            createMenuItem.toggle('Show Newcomer-Friendly', state.showNewcomerFriendly !== false, handlers.setShowNewcomerFriendly)
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'video-library': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Browse'),
            createMenuItem.navigation('All Videos', '/hub/video-library'),
            createMenuItem.navigation('Cash Games', '/hub/video-library?type=cash'),
            createMenuItem.navigation('Tournaments', '/hub/video-library?type=tournament'),
            createMenuItem.divider(),
            createMenuItem.section('Sources'),
            createMenuItem.navigation('Hustler Casino Live', '/hub/video-library?source=HCL'),
            createMenuItem.navigation('The Lodge', '/hub/video-library?source=LODGE'),
            createMenuItem.navigation('Triton Poker', '/hub/video-library?source=TRITON'),
            createMenuItem.navigation('Live at the Bike', '/hub/video-library?source=LATB'),
            createMenuItem.navigation('TCH Live', '/hub/video-library?source=TCH'),
            createMenuItem.navigation('WSOP', '/hub/video-library?source=WSOP'),
            createMenuItem.navigation('WPT', '/hub/video-library?source=WPT'),
            createMenuItem.divider(),
            createMenuItem.section('My Library'),
            createMenuItem.navigation('Favorites', '/hub/video-library?filter=favorites'),
            createMenuItem.navigation('Watch History', '/hub/video-library?filter=history'),
            createMenuItem.navigation('Watch Later', '/hub/video-library?filter=watchlater'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Autoplay', state.autoplay !== false, handlers.setAutoplay),
            createMenuItem.toggle('HD Quality', state.hdQuality !== false, handlers.setHdQuality),
            createMenuItem.toggle('Captions', state.captions || false, handlers.setCaptions)
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'diamond-arena': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Game Modes'),
            createMenuItem.navigation('Cash Games', '/hub/diamond-arena?mode=cash'),
            createMenuItem.navigation('Tournaments', '/hub/diamond-arena?mode=tournament'),
            createMenuItem.navigation('Sit & Go', '/hub/diamond-arena?mode=sng'),
            createMenuItem.divider(),
            createMenuItem.section('My Arena'),
            createMenuItem.navigation('Active Tables', '/hub/diamond-arena?filter=active'),
            createMenuItem.navigation('Tournament Schedule', '/hub/diamond-arena/schedule'),
            createMenuItem.navigation('Leaderboard', '/hub/diamond-arena/leaderboard'),
            createMenuItem.navigation('My Stats', '/hub/diamond-arena/stats'),
            createMenuItem.navigation('Hand History', '/hub/diamond-arena/history'),
            createMenuItem.divider(),
            createMenuItem.section('Diamond Store'),
            createMenuItem.navigation('Buy Diamonds', '/hub/diamond-store?category=diamonds'),
            createMenuItem.navigation('VIP Benefits', '/hub/diamond-store?category=vip'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Sound Effects', state.soundEffects !== false, handlers.setSoundEffects),
            createMenuItem.toggle('Animations', state.animations !== false, handlers.setAnimations),
            createMenuItem.toggle('Auto-Rebuy', state.autoRebuy || false, handlers.setAutoRebuy),
            createMenuItem.navigation('Table Preferences', '/hub/settings?section=table')
        ],
        bottomLinks: [
            { label: 'Help & Rules', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'trivia': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Game Modes'),
            createMenuItem.navigation('Daily Challenge', '/hub/trivia?mode=daily'),
            createMenuItem.navigation('Quick Play', '/hub/trivia?mode=quick'),
            createMenuItem.navigation('Practice Mode', '/hub/trivia?mode=practice'),
            createMenuItem.divider(),
            createMenuItem.section('My Progress'),
            createMenuItem.navigation('Leaderboard', '/hub/trivia/leaderboard'),
            createMenuItem.navigation('My Stats', '/hub/trivia/stats'),
            createMenuItem.navigation('Achievements', '/hub/trivia/achievements'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Sound Effects', state.soundEffects !== false, handlers.setSoundEffects),
            createMenuItem.toggle('Timer', state.timerEnabled !== false, handlers.setTimerEnabled),
            createMenuItem.toggle('Hints', state.hintsEnabled || false, handlers.setHintsEnabled),
            createMenuItem.navigation('Difficulty', '/hub/trivia/settings')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'news': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Browse'),
            createMenuItem.navigation('All News', '/hub/news'),
            createMenuItem.navigation('Videos', '/hub/news?tab=videos'),
            createMenuItem.navigation('Reels', '/hub/news?tab=reels'),
            createMenuItem.navigation('Events', '/hub/news?tab=events'),
            createMenuItem.divider(),
            createMenuItem.section('Sources'),
            createMenuItem.navigation('PokerNews', '/hub/news?source=pokernews'),
            createMenuItem.navigation('CardPlayer', '/hub/news?source=cardplayer'),
            createMenuItem.navigation('WSOP', '/hub/news?source=wsop'),
            createMenuItem.navigation('WPT', '/hub/news?source=wpt'),
            createMenuItem.navigation('MSPT', '/hub/news?source=mspt'),
            createMenuItem.divider(),
            createMenuItem.section('My Feed'),
            createMenuItem.navigation('Bookmarks', '/hub/news?filter=bookmarks'),
            createMenuItem.navigation('Read Later', '/hub/news?filter=later'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Push Notifications', state.pushNotifications || false, handlers.setPushNotifications),
            createMenuItem.toggle('Email Digest', state.emailDigest || false, handlers.setEmailDigest),
            createMenuItem.navigation('Manage Sources', '/hub/news/sources')
        ],
        bottomLinks: [
            { label: 'Hub', href: '/hub', icon: MenuIcons.home },
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),




    'sandbox': (user, state, handlers) => {
        const gridItems1 = [
            { label: `Quiz ${state.quizMode ? 'ON' : 'OFF'}`, onClick: handlers.onToggleQuiz },
            { label: `Coach ${state.coachMode ? 'ON' : 'OFF'}`, onClick: handlers.onToggleCoach },
            { label: 'Ranges 🎯', onClick: handlers.onRanges },
            { label: 'Villains 👤', onClick: handlers.onVillains },
        ];
        
        const gridItems2 = [
            { label: 'Undo', onClick: handlers.onUndo },
            { label: 'Reset', onClick: handlers.onReset },
            { label: 'Replay 🎬', onClick: handlers.onReplay },
        ];
        
        if (state.hasResults) {
            gridItems2.push({ label: 'Results', onClick: handlers.onResults });
            gridItems2.push({ label: 'Share', onClick: handlers.onShare });
        }
        
        return {
            menuItems: [
                createMenuItem.section('Tools'),
                createMenuItem.grid(gridItems1),
                createMenuItem.divider(),
                
                createMenuItem.section('Actions'),
                createMenuItem.grid(gridItems2),
                createMenuItem.divider(),
                
                createMenuItem.section('Saves & Lore'),
                createMenuItem.action(state.saveStatus === 'saving' ? 'Saving...' : state.saveStatus === 'saved' ? 'Saved' : 'Save Session', handlers.onSave, null, false, false),
                createMenuItem.action('Sessions', handlers.onSessions),
                createMenuItem.action('Folders', handlers.onFolders),
                createMenuItem.action(`Log (${state.sessionLogCount || 0})`, handlers.onLog),
                createMenuItem.action('Templates', handlers.onTemplates),
                createMenuItem.action('Save Spot', handlers.onSaveSpot),
                createMenuItem.action('Report', handlers.onReport),
                createMenuItem.divider(),
                
                createMenuItem.section('Pro Features'),
                createMenuItem.action('⚡ God Mode', handlers.onGodMode),
                createMenuItem.action('📥 Pro Import', handlers.onProImport),
                createMenuItem.action('⚙️ Custom Spot', handlers.onCustomSpot),
                createMenuItem.action('⚡ Drill', handlers.onDrill),
                createMenuItem.toggle('🌡️ Heatmap', state.showHeatmap, handlers.onToggleHeatmap),
                createMenuItem.toggle('🔒 Node Locks', state.showNodeLocks, handlers.onToggleNodeLocks),
                createMenuItem.toggle('🔊 Sound', state.soundEnabled, handlers.onToggleSound),
            ],
            bottomLinks: [
                { label: 'Play Tutorial', icon: MenuIcons.help, onClick: handlers.onPlayTutorial, action: true },
                { label: 'Hub', href: '/hub' }
            ]
        };
    },

    'preflop-charts': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Training Modes'),
            createMenuItem.navigation('Speed Drill', '/hub/preflop-charts?mode=speed-drill'),
            createMenuItem.navigation('Pressure Cooker', '/hub/preflop-charts?mode=pressure-cooker'),
            createMenuItem.navigation('Pattern Recognition', '/hub/preflop-charts?mode=pattern'),
            createMenuItem.navigation('Mixed Strategy', '/hub/preflop-charts?mode=mixed'),
            createMenuItem.divider(),
            createMenuItem.section('Progress'),
            createMenuItem.navigation('Leaderboard', '/hub/preflop-charts/leaderboard'),
            createMenuItem.navigation('My Stats', '/hub/preflop-charts/stats'),
            createMenuItem.navigation('Achievements', '/hub/preflop-charts/achievements'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Sound Effects', state.soundEffects !== false, handlers.setSoundEffects),
            createMenuItem.toggle('Keyboard Shortcuts', state.keyboardShortcuts !== false, handlers.setKeyboardShortcuts),
            createMenuItem.toggle('Show Timer', state.showTimer !== false, handlers.setShowTimer),
            createMenuItem.toggle('Visual Hints', state.visualHints || false, handlers.setVisualHints),
            createMenuItem.divider(),
            createMenuItem.navigation('How to Play', '/hub/preflop-charts/tutorial'),
            createMenuItem.navigation('GTO Training', '/hub/training')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'avatars': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Avatar Options'),
            createMenuItem.navigation('My Avatars', '/hub/avatars'),
            createMenuItem.navigation('Create New', '/hub/avatars'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Navigation'),
            createMenuItem.navigation('Profile', '/hub/profile'),
            createMenuItem.navigation('Settings', '/hub/settings')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'profile': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Profile'),
            createMenuItem.navigation('View Profile', '/hub/profile'),
            createMenuItem.navigation('Edit Profile', '/hub/profile-edit'),
            createMenuItem.navigation('My Avatars', '/hub/avatars'),
            createMenuItem.divider(),
            createMenuItem.section('Activity'),
            createMenuItem.navigation('My Posts', '/hub/social-media'),
            createMenuItem.navigation('My Friends', '/hub/friends'),
            createMenuItem.navigation('Notifications', '/hub/notifications'),
            createMenuItem.navigation('🧮 Odds Calculator', '/hub/poker-tools'),
            createMenuItem.divider(),
            createMenuItem.section('Work'),
            createMenuItem.navigation('Work Schedule & Dealer Downs', '/hub/toke-tracker'),
            createMenuItem.navigation('Link to a Venue', '/hub/my-venues'),
            createMenuItem.divider(),
            { type: 'action', label: 'Invite Friends', openInviteModal: true, closeOnClick: false },
            createMenuItem.navigation('📲 Install App', '/hub/install')
        ],
        bottomLinks: [
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    'social': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Social Hub'),
            createMenuItem.navigation('Feed', '/hub/social-media'),
            createMenuItem.navigation('Friends', '/hub/friends'),
            createMenuItem.navigation('Messenger', '/hub/messenger'),
            createMenuItem.navigation('Reels', '/hub/reels'),
            createMenuItem.divider(),
            createMenuItem.section('Content'),
            createMenuItem.navigation('News', '/hub/news'),
            createMenuItem.navigation('Lives', '/hub/lives'),
            createMenuItem.navigation('Video Library', '/hub/video-library'),
            createMenuItem.navigation('🧮 Odds Calculator', '/hub/poker-tools'),
            createMenuItem.divider(),
            createMenuItem.section('Club Pages'),
            createMenuItem.navigation(state.clubPageCreated ? 'My Club Page' : 'Add Club Page', state.clubPageCreated ? '/hub/social-media?view=club-pages' : '/hub/social-media?createPage=true'),
            createMenuItem.navigation('Browse Club Pages', '/hub/social-media?view=club-pages'),
            createMenuItem.divider(),
            { type: 'action', label: 'Invite Friends', openInviteModal: true, closeOnClick: false },
            createMenuItem.navigation('📲 Install App', '/hub/install')
        ],
        bottomLinks: [
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings },
            getSignOutBottomLink()
        ]
    }),

    'notifications': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Notifications'),
            createMenuItem.navigation('All', '/hub/notifications'),
            createMenuItem.navigation('Mentions', '/hub/notifications?filter=mentions'),
            createMenuItem.navigation('Friend Requests', '/hub/notifications?filter=friends'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle('Push Notifications', state.pushEnabled !== false, handlers.setPushEnabled),
            createMenuItem.toggle('Email Notifications', state.emailEnabled || false, handlers.setEmailEnabled)
        ],
        bottomLinks: [
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),

    'tournaments': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Tournaments'),
            createMenuItem.navigation('Daily Tournaments', '/hub/daily-tournaments'),
            createMenuItem.navigation('Events Calendar', '/hub/events-calendar'),
            createMenuItem.navigation('Leaderboards', '/hub/leaderboards'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Poker Near Me', '/hub/poker-near-me/lobby'),
            createMenuItem.navigation('Home Games', '/hub/home-games'),
            createMenuItem.navigation('Promotions', '/hub/promotions')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'leaderboards': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Leaderboards'),
            createMenuItem.navigation('Overall', '/hub/leaderboards'),
            createMenuItem.navigation('Weekly', '/hub/leaderboards?period=weekly'),
            createMenuItem.navigation('Monthly', '/hub/leaderboards?period=monthly'),
            createMenuItem.divider(),
            createMenuItem.section('Categories'),
            createMenuItem.navigation('Training', '/hub/leaderboards?category=training'),
            createMenuItem.navigation('Tournaments', '/hub/leaderboards?category=tournaments'),
            createMenuItem.navigation('Social', '/hub/leaderboards?category=social')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'events': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Events'),
            createMenuItem.navigation('Calendar', '/hub/events-calendar'),
            createMenuItem.navigation('Upcoming', '/hub/events-calendar?view=upcoming'),
            createMenuItem.navigation('Past Events', '/hub/events-calendar?view=past'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Daily Tournaments', '/hub/daily-tournaments'),
            createMenuItem.navigation('Promotions', '/hub/promotions')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'promotions': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Promotions'),
            createMenuItem.navigation('All Promotions', '/hub/promotions'),
            createMenuItem.navigation('VIP Offers', '/hub/diamond-store?tab=vip'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Diamond Store', '/hub/diamond-store'),
            createMenuItem.navigation('Events', '/hub/events-calendar')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'toke-tracker': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Toke Tracker'),
            createMenuItem.navigation('🏠 Dashboard', '/hub/toke-tracker'),
            createMenuItem.navigation('⏱️ Shift Tracker', '/hub/toke-tracker/shift'),
            createMenuItem.navigation('📊 Analytics', '/hub/toke-tracker/analytics'),
            createMenuItem.navigation('🔒 Dealer Vault', '/hub/toke-tracker/vault'),
            createMenuItem.navigation('📄 Tax Summary & Export', '/hub/toke-tracker/vault?tab=tax'),
            createMenuItem.navigation('📍 Venue Intel', '/hub/toke-tracker/venues'),
            createMenuItem.divider(),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Shift Notifications',
                state.shiftNotifications !== false,
                handlers.setShiftNotifications,
                'Get alerts when shifts start/end'
            ),
            createMenuItem.toggle(
                'Auto-Save Shifts',
                state.autoSaveShifts !== false,
                handlers.setAutoSaveShifts,
                'Automatically save shift data'
            ),
            createMenuItem.toggle(
                'Down Timer Alerts',
                state.downTimerAlerts !== false,
                handlers.setDownTimerAlerts,
                '35-min down timer notifications'
            ),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('💰 Bankroll Manager', '/hub/bankroll-manager'),
            createMenuItem.navigation('🎯 Poker Near Me', '/hub/poker-near-me/lobby'),
            createMenuItem.navigation('🏠 World Hub', '/hub')
        ],
        bottomLinks: [
            { label: 'Help & Support', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Settings', href: '/hub/settings', icon: MenuIcons.settings }
        ]
    }),



    'help': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Help Center'),
            createMenuItem.navigation('FAQ', '/hub/help'),
            createMenuItem.navigation('Contact Support', '/hub/help#contact'),
            createMenuItem.navigation('Report Issue', '/hub/help#report'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Settings', '/hub/settings'),
            createMenuItem.navigation('Home', '/hub')
        ],
        bottomLinks: []
    }),

    'article': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Article'),
            createMenuItem.navigation('Back to News', '/hub/news'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Social Hub', '/hub/social-media'),
            createMenuItem.navigation('Home', '/hub')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    }),

    'club-arena': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Club Navigation'),
            createMenuItem.navigation('My Clubs', '/hub/club-arena'),
            createMenuItem.navigation('Find Clubs', '/hub/club-arena#find'),
            createMenuItem.navigation('Create Club', '/hub/club-arena#create'),
            createMenuItem.divider(),
            createMenuItem.section('Game Modes'),
            createMenuItem.navigation('Cash Games', '/hub/club-arena?mode=cash'),
            createMenuItem.navigation('Tournaments', '/hub/club-arena?mode=tournament'),
            createMenuItem.navigation('Sit & Go', '/hub/club-arena?mode=sng'),
            createMenuItem.navigation('Spin-It', '/hub/club-arena?mode=spin'),
            createMenuItem.divider(),
            createMenuItem.section('Club Features'),
            createMenuItem.navigation('Messages', '/hub/club-arena/messages'),
            createMenuItem.navigation('Players', '/hub/club-arena/players'),
            createMenuItem.navigation('Cashier', '/hub/club-arena/cashier'),
            createMenuItem.navigation('Leaderboard', '/hub/club-arena/leaderboard'),
            createMenuItem.navigation('Hand Histories', '/hub/club-arena/hand-histories'),
            createMenuItem.navigation('Player Stats', '/hub/club-arena/player-stats'),
            createMenuItem.divider(),
            // Show Midway Union application option if:
            // - User is a club owner (state.isClubOwner)
            // - Their active club is NOT already in a union (state.clubInUnion === false)
            ...(state.isClubOwner && state.clubInUnion === false ? [
                createMenuItem.section('Midway Union'),
                ...(state.unionApplicationStatus === 'pending' ? [
                    createMenuItem.action(
                        '⏳ Union Application Pending',
                        handlers.onViewApplicationStatus,
                        null, false, true
                    ),
                ] : state.unionApplicationStatus === 'approved' ? [] : [
                    createMenuItem.action(
                        '🏛️ Apply to Midway Union',
                        handlers.onApplyToUnion,
                        null, true, true
                    ),
                ]),
                createMenuItem.divider(),
            ] : []),
            createMenuItem.section('Settings'),
            createMenuItem.toggle(
                'Sound Effects',
                state.soundEffects !== false,
                handlers.setSoundEffects
            ),
            createMenuItem.toggle(
                'Notifications',
                state.notifications !== false,
                handlers.setNotifications
            ),
            createMenuItem.toggle(
                'Auto-Rebuy',
                state.autoRebuy || false,
                handlers.setAutoRebuy
            ),
            createMenuItem.toggle(
                'Show Table Previews',
                state.tablePreview !== false,
                handlers.setTablePreview,
                'See table cards before joining'
            ),
            createMenuItem.toggle(
                'Compact View',
                state.compactView || false,
                handlers.setCompactView
            ),
            createMenuItem.divider(),
            createMenuItem.navigation('Table Preferences', '/hub/settings?section=table'),
            createMenuItem.navigation('Privacy Settings', '/hub/settings?section=privacy')
        ],
        bottomLinks: [
            { label: 'Help & Rules', href: '/hub/help', icon: MenuIcons.help },
            { label: 'Home', href: '/hub', icon: MenuIcons.home },
            getSignOutBottomLink()
        ]
    }),

    'lives': (user, state, handlers) => ({
        menuItems: [
            createMenuItem.section('Live Streams'),
            createMenuItem.navigation('Live Now', '/hub/lives'),
            createMenuItem.navigation('Upcoming', '/hub/lives?filter=upcoming'),
            createMenuItem.navigation('Past Streams', '/hub/lives?filter=past'),
            createMenuItem.divider(),
            createMenuItem.section('Quick Links'),
            createMenuItem.navigation('Reels', '/hub/reels'),
            createMenuItem.navigation('Social Hub', '/hub/social-media')
        ],
        bottomLinks: [
            { label: 'Help', href: '/hub/help', icon: MenuIcons.help }
        ]
    })
};

// Helper to get menu config for a specific world
export function getMenuConfig(worldKey, user, state = {}, handlers = {}) {
    const config = MENU_CONFIGS[worldKey];
    if (!config) {
        console.warn(`No menu config found for world: ${worldKey}`);
        return { menuItems: [], bottomLinks: [] };
    }
    const result = config(user, state, handlers);

    // Inject "Refer a Friend" into bottomLinks for logged-in users
    // Skip if the config already has a referral item in menuItems or bottomLinks
    if (user && result.bottomLinks) {
        const alreadyHasReferral =
            (result.menuItems || []).some(i => i?.label?.includes?.('Refer a Friend') || i?.label?.includes?.('Invite Friends') || i?.openInviteModal) ||
            result.bottomLinks.some(l => l?.label?.includes?.('Refer a Friend') || l?.label?.includes?.('Invite Friends') || l?.openInviteModal);
        if (!alreadyHasReferral) {
            const referralItem = {
                label: 'Invite Friends',
                action: true,
                openInviteModal: true,
            };
            // Add before the last item (usually Settings)
            const settingsIdx = result.bottomLinks.findIndex(l => l.label === 'Settings');
            if (settingsIdx >= 0) {
                result.bottomLinks.splice(settingsIdx, 0, referralItem);
            } else {
                result.bottomLinks.push(referralItem);
            }
        }
    }

    return result;
}
