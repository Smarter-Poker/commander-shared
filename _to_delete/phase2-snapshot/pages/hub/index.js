/* ═══════════════════════════════════════════════════════════════════════════
   MASTER HUB NODE — Re-exports WorldHub for /hub route
   Empire Hub Synchronization Protocol | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import dynamic from 'next/dynamic';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAuthUser } from '../../src/lib/authUtils';
import { claimReward } from '../../src/lib/claimReward';
import { warmCache } from '../../src/lib/cacheWarmer';
import { reapStaleCaches } from '../../src/lib/cacheReaper';
import { CardCustomizerPanel } from '../../src/world/components/CardCustomizerPanel';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

// Dynamic import with SSR disabled to prevent hydration mismatches from R3F/WebGL
// Error handling on the dynamic import itself catches module-level init failures
const WorldHub = dynamic(
    () => import('../../src/world/WorldHub').catch(err => {
        console.warn('[HubPage] WorldHub module failed to load:', err);
        // Return a safe fallback module when the import itself throws
        return {
            default: () => (
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', flexDirection: 'column', gap: 16 }}>
                    <div style={{ color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 18 }}>World Hub — Reloading...</div>
                    <button onClick={() => window.location.reload()} style={{ background: '#1877f2', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', cursor: 'pointer', fontFamily: 'inherit' }}>Refresh</button>
                </div>
            )
        };
    }),
    {
        ssr: false,
        loading: () => (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0a0a0f',
                color: '#00d4ff',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 18,
            }}>
                Loading World Hub...
            </div>
        ),
    }
);

export default function HubPage() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [user, setUser] = useState(null);
    const [cardCustomizerOpen, setCardCustomizerOpen] = useState(false);

    // Special unlocked card IDs for this user (for the customizer panel)
    const [unlockedSpecialIds, setUnlockedSpecialIds] = useState([]);

    useEffect(() => {
        // getAuthUser is synchronous, returns user or null
        const authUser = getAuthUser();
        setUser(authUser);

        // Warm cache — prefetch profile/friends/stats (once per session, fire-and-forget)
        warmCache(authUser);

        // Reap stale caches — clean entries older than 30 min (once per session, idle)
        reapStaleCaches();

        // Award daily login diamonds (fire-and-forget, once per session, with toast)
        if (authUser?.id && !sessionStorage.getItem('dailyLoginClaimed')) {
            sessionStorage.setItem('dailyLoginClaimed', 'true');
            claimReward('/api/rewards/daily-login', { userId: authUser.id }, 'Daily Login Reward');
        }

        // Birthday reward — 300💎 if today is user's birthday (fire-and-forget, once per session)
        // API handles all validation: birthday match, 60-day account age, yearly dedup
        if (authUser?.id && !sessionStorage.getItem('birthdayRewardChecked')) {
            sessionStorage.setItem('birthdayRewardChecked', 'true');
            claimReward('/api/rewards/birthday-reward', {}, 'Happy Birthday! 🎂');
        }

        // Detect which special cards are unlocked for this user
        const unlocked = ['toke-tracker']; // Always unlocked for all authenticated users
        try {
            // Commander account detection via localStorage cache (set by WorldHub on load)
            const commStored = localStorage.getItem('commander_staff');
            if (commStored) {
                const parsed = JSON.parse(commStored);
                if (parsed?.id || parsed?.venue_id || parsed?.role) unlocked.push('club-commander');
            }
            // Employee Portal removed — Work Schedule merged into Toke Tracker
        } catch (e) { console.warn('[App] Handled exception:', e); }
        setUnlockedSpecialIds(unlocked);
    }, []);

    const handlers = {
        openCardCustomizer: () => {
            setMenuOpen(false);
            setTimeout(() => setCardCustomizerOpen(true), 150); // slight delay after menu closes
        },
    };

    // 🔴 BUS LISTENER — 'hub-open-customizer' can be dispatched from anywhere
    // (UniversalHeader, Settings page, etc.) to open the customizer panel
    useEffect(() => {
        const handleOpenCustomizer = () => setCardCustomizerOpen(true);
        window.addEventListener('hub-open-customizer', handleOpenCustomizer);
        return () => window.removeEventListener('hub-open-customizer', handleOpenCustomizer);
    }, []);

    const menuConfig = getMenuConfig('hub-home', user, {}, handlers);

    return (
        <>
            <SEOHead
                title="Poker Hub — Your Command Center"
                description="Access All Smarter.Poker Features From One Hub: GTO Training, Poker Near Me, Bankroll Tracking, Trivia, News, Social, And More."
                canonical="/hub"
            />
            <UniversalHeader
                pageDepth={1}
                onMenuClick={() => setMenuOpen(true)}
            />
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="left"
                theme="dark"
                user={user}
                showProfile={true}
                menuItems={menuConfig.menuItems}
                bottomLinks={menuConfig.bottomLinks}
            />
            {/* Card Visibility Customizer Panel — isolated in its own error boundary */}
            <HubErrorBoundary name="Card Customizer" fallback={<></>}>
                <CardCustomizerPanel
                    isOpen={cardCustomizerOpen}
                    onClose={() => setCardCustomizerOpen(false)}
                    unlockedSpecialIds={unlockedSpecialIds}
                />
            </HubErrorBoundary>

            {/* WorldHub 3D carousel — isolated so a bad orb/import NEVER crashes the page */}
            <HubErrorBoundary name="World Hub">
                <WorldHub onOpenCardCustomizer={() => setCardCustomizerOpen(true)} />
                  <BottomNavBar />
    </HubErrorBoundary>
        </>
    );
}
