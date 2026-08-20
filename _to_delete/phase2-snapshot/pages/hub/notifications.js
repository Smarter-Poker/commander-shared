/**
 * NOTIFICATIONS PAGE
 * Full-page view of all user notifications
 */

import SEOHead from '../../src/components/seo/SEOHead';
import { ThumbsUp, Heart, MessageCircle, AtSign, UserPlus, UserCheck, Eye, Radio, Spade, Bell, Share2, Star, Trophy, Banknote, ShieldCheck, Users, Megaphone, Gift, TrendingUp, Zap, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/router';
import toast from '../../src/stores/toastStore';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { broadcastSync, listenBroadcast, BROADCAST_TAB_ID } from '../../src/lib/broadcastSync';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAccessToken } from '../../src/lib/authUtils';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A', red: '#E4405F',
};

const timeAgo = (date) => {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};

function NotificationsPage() {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const notificationsRef = useRef([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const hasCacheRef = useRef(false);
    const [swipedId, setSwipedId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [deletingIds, setDeletingIds] = useState(new Set());
    const processingReadIds = useRef(new Set());
    const touchStartRef = useRef({ x: 0, y: 0, id: null });
    // 🔲 Detect when rendered inside FullScreenPageOverlay iframe — hide chrome
    const [isInIframe, setIsInIframe] = useState(false);
    useEffect(() => {
        try { setIsInIframe(window.self !== window.top); } catch (_) { setIsInIframe(true); }
    }, []);

    // ── Fetch Notifications (Authoritative Sync) ──
    const fetchNotifications = useCallback(async (signal) => {
        const au = getAuthUser();
        if (!au) {
            if (mounted.current) setLoading(false);
            return;
        }
        setUser(au);

        try {
            const token = await getAccessToken();

            // ── Single unified API call: social + poker + actor profiles server-side ──
            const res = await fetch('/api/notifications/feed?limit=50', {
                headers: { Authorization: 'Bearer ' + token },
                signal,
            });

            if (!res.ok) {
                console.warn('[Notifications] feed API returned', res.status);
                if (mounted.current) setLoading(false);
                return;
            }

            const feedData = await res.json();
            if (!feedData.success) {
                if (mounted.current) setLoading(false);
                return;
            }

            const enriched = feedData.notifications || [];
            const totalUnread = feedData.totalUnread ?? enriched.filter(n => !n.read).length;

            if (mounted.current) {
                setNotifications(enriched);
                setLoading(false);

                // ── Cache with timestamp for 5-min TTL on next load ──
                try {
                    const now = Date.now();
                    localStorage.setItem('sp-notif-cache', JSON.stringify(
                        enriched.slice(0, 30).map((n, i) => i === 0 ? { ...n, _cache_ts: now } : n)
                    ));
                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            }

            if (totalUnread === 0 && enriched.length === 0 && mounted.current) {
                setLoading(false);
            }

        } catch (err) {
            if (err?.name !== 'AbortError') {
                console.warn('[Notifications] fetch failed:', err);
                if (mounted.current) setLoading(false);
            }
        }
    }, []);

    // ── Delete notification ──────────────────────────────────────
    const handleDelete = useCallback(async (notifId, e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        // [Audit#5] Skip synthetic poker-prefixed IDs — they have no DB row
        const isPokerNotif = typeof notifId === 'string' && notifId.startsWith('poker-');
        setConfirmDeleteId(null);
        setSwipedId(null);
        // [AUDIT-PASS1] FIX: Read wasUnread from the setState updater to get the CURRENT
        // snapshot, not from the closure (which is stale due to useCallback([])).
        let wasUnread = false;
        let snapshot;
        setNotifications(prev => {
            snapshot = prev;
            wasUnread = prev.some(n => n.id === notifId && !n.read);
            return prev;
        });
        // Defer badge + broadcast work to after React flushes the setState above
        // so wasUnread has the correct value from the updater.
        // Using queueMicrotask ensures the setState updater has executed.
        await new Promise(resolve => queueMicrotask(resolve));

        // If deleting an unread notification, decrement header badge immediately
        if (wasUnread) {
            eventBus.emit(EventType.NOTIFICATIONS_READ, { count: 1 }, 'NotificationsPage');
            let newCount = 0;
            try { 
                newCount = Math.max(0, parseInt(localStorage.getItem('sp-notif-count') || '0', 10) - 1);
                localStorage.setItem('sp-notif-count', String(newCount)); 
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            try { if (window.self !== window.top) window.parent.postMessage({ type: 'SP_NOTIF_CLEARED', count: newCount }, '*'); } catch (_) {}
        }

        // Optimistic removal with fade
        setDeletingIds(prev => new Set([...prev, notifId]));
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== notifId));
            setDeletingIds(prev => { const s = new Set(prev); s.delete(notifId); return s; });
            // [Audit#4] Sync localStorage cache on delete so deleted items don't reappear
            try {
                const cached = localStorage.getItem('sp-notif-cache');
                if (cached) {
                    const parsed = JSON.parse(cached).filter(n => n.id !== notifId);
                    localStorage.setItem('sp-notif-cache', JSON.stringify(parsed));
                }
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }, 300);
        // [Audit#11] Broadcast delete to other tabs so they remove it too
        broadcastSync('smarter_poker_notif_sync', { action: 'delete', id: notifId, tabId: BROADCAST_TAB_ID });
        if (isPokerNotif) return; // [Audit#5] Don't hit API for synthetic IDs
        try {
            // [Audit#1] getAccessToken() is async — was missing await
            const token = await getAccessToken();
            const resp = await fetch('/api/notifications/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ id: notifId })
            });
            // [Audit#2] Re-fetch on API failure instead of manual rollback
            if (!resp.ok && mounted.current) {
                console.warn('[Delete Notif] API error, syncing state from server');
                fetchNotifications();
                setDeletingIds(prev => { const s = new Set(prev); s.delete(notifId); return s; });
                // [Pass4-Fix] Trigger header re-fetch to restore badge count we decremented
                if (wasUnread) {
                    broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications', tabId: BROADCAST_TAB_ID });
                }
            }
        } catch (err) { console.warn('[App] Handled exception:', err?.message || err);
            // [Pass4-Fix] Trigger header re-fetch to restore badge count we decremented
            if (wasUnread) {
                broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications', tabId: BROADCAST_TAB_ID });
            }
            fetchNotifications();
        }
    }, [fetchNotifications]);

    // 🛡️ INSTANT UI: Hydrate from localStorage AFTER mount (prevents SSR mismatch)
    // [Audit#20] Added 5-minute TTL — discard stale cache to prevent old data flashing
    useEffect(() => {
        try {
            const cached = localStorage.getItem('sp-notif-cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                // Discard if older than 5 minutes (300_000 ms)
                const ts = parsed?.[0]?._cache_ts || 0;
                const age = Date.now() - ts;
                if (parsed && parsed.length > 0 && age < 300_000) {
                    setNotifications(parsed);
                    setLoading(false); // Skip shimmer — show cached data immediately
                    hasCacheRef.current = true;
                }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }, []);

    // Sync ref to state
    useEffect(() => {
        notificationsRef.current = notifications;
    }, [notifications]);


    const mounted = useRef(true);
    useEffect(() => {
        return () => { mounted.current = false; };
    }, []);

    // ── Clear badge count on mount ──
    useEffect(() => {
        const token = getAccessToken();
        fetch('/api/notifications/mark-seen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({})
        }).catch(() => {});
    }, []);

    useTrainingBus('notifications');

    const menuConfig = getMenuConfig('notifications', user, {}, {});

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        fetchNotifications(signal);
        return () => controller.abort();
    }, [fetchNotifications]);

    // Realtime subscription — live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`notifs:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
                // Prepend new notification to the list in real-time
                if (payload.new) {
                    const n = payload.new;
                    if (mounted.current) {
                        setNotifications(prev => [{
                            ...n,
                            _source: 'social',
                            actor_name: n.title || 'New Notification',
                            actor_avatar_url: null,
                        }, ...prev]);
                    }
                }
            })
            // [Audit#3] Subscribe to DELETE events so other-device deletes sync to this tab
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
                if (payload.old?.id && mounted.current) {
                    setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
                    try {
                        const cached = localStorage.getItem('sp-notif-cache');
                        if (cached) {
                            const parsed = JSON.parse(cached).filter(n => n.id !== payload.old.id);
                            localStorage.setItem('sp-notif-cache', JSON.stringify(parsed));
                        }
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                }
            })
            .subscribe();

        const cleanupNotifBc = listenBroadcast('smarter_poker_notif_sync', (msg) => {
            if (msg?.tabId === BROADCAST_TAB_ID) return;
            // [Audit#3] Another tab deleted a notif — sync it here too
            if (msg?.action === 'delete' && msg?.id && mounted.current) {
                setNotifications(prev => prev.filter(n => n.id !== msg.id));
            } else if (msg?.action === 'mark_read' && msg?.id && mounted.current) {
                // [Audit] Another tab marked ONE notif as read — sync it
                setNotifications(prev => prev.map(n => n.id === msg.id ? { ...n, read: true } : n));
            } else if ((msg === 'refresh_notifications' || msg?.action === 'refresh_notifications') && mounted.current) {
                // Generic refresh - ignore local feed state, handled natively by Supabase Realtime
            } else if (mounted.current && msg?.action === 'mark_all_read') {
                // Explicit mark all as read command
                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            }
        });

        return () => {
            supabase.removeChannel(_ch);
            cleanupNotifBc();
        };
    }, [user?.id]);

    const markAsRead = (id) => {
        // Prevent double-execution in the exact same tick (e.g. click + observer)
        if (processingReadIds.current.has(id)) return;
        processingReadIds.current.add(id);

        // [Audit#19] FIX: Check read status from current state snapshot SYNCHRONOUSLY
        // before calling setState. We use notificationsRef to avoid stale closures inside
        // the IntersectionObserver (which only depends on notifications.length).
        const alreadyRead = notificationsRef.current.some(n => n.id === id && n.read);
        if (alreadyRead) return; // already read — no badge decrement needed

        // EAGER STATE SYNCHRONIZATION: Update React state before DB
        if (mounted.current) {
            setNotifications(prev => {
                const next = prev.map(n => n.id === id ? { ...n, read: true } : n);
                try {
                    const sliced = next.slice(0, 30);
                    // Preserve _cache_ts so the 5-min TTL check on next load doesn't discard this cache
                    if (sliced.length > 0 && !sliced[0]._cache_ts) sliced[0] = { ...sliced[0], _cache_ts: Date.now() };
                    localStorage.setItem('sp-notif-cache', JSON.stringify(sliced));
                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                return next;
            });
        }

        // Sync badge localStorage and broadcast to header eagerly.
        // AUDIT-FIX: avoid stale-read race when IntersectionObserver fires for N rows
        // simultaneously. Each call was reading the SAME stale sp-notif-count and all
        // subtracted 1 — final stored count was original-1 instead of original-N.
        // Solution: read, decrement, and write atomically in one synchronous operation.
        // The useUnreadCount Realtime subscription is the authoritative source anyway and
        // self-corrects on the next UPDATE event, but this prevents transient badge flash.
        let newCount = 0;
        try {
            const current = parseInt(localStorage.getItem('sp-notif-count') || '0', 10);
            newCount = Math.max(0, current - 1);
            localStorage.setItem('sp-notif-count', String(newCount));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        broadcastSync('smarter_poker_notif_sync', { action: 'mark_read', id: id, tabId: BROADCAST_TAB_ID });
        eventBus.emit(EventType.NOTIFICATIONS_READ, { count: 1 }, 'NotificationsPage');
        busEmit.dataMutated('notifications');
        try { if (window.self !== window.top) window.parent.postMessage({ type: 'SP_NOTIF_CLEARED', count: newCount }, '*'); } catch (_) {}

        // Fire-and-forget DB update with fetch-on-failure
        const isPoker = typeof id === 'string' && id.startsWith('poker-');
        if (!isPoker && user?.id) {
            // Route through server API to invalidate feed + unread-count caches
            const token = getAccessToken();
            fetch('/api/notifications/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ notificationId: id }),
            }).then(res => {
                if (!res.ok) throw new Error('API failed');
            }).catch(e => {
                console.warn('[mark-read] single failed:', e);
                fetchNotifications();
                broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications', tabId: BROADCAST_TAB_ID });
            });
        } else if (isPoker && user?.id) {
            const realId = id.replace('poker-', '');
            const token = getAccessToken();
            fetch('/api/poker/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ notification_id: realId })
            }).then(res => {
                if (!res.ok) throw new Error('API failed');
            }).catch(e => {
                console.warn('[mark-read] single failed:', e);
                fetchNotifications();
                broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications', tabId: BROADCAST_TAB_ID });
            });
        }
    };

    // Auto mark as read when visually seen
    const observerRef = useRef(null);
    useEffect(() => {
        if (loading || notifications.length === 0) return;

        observerRef.current = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('data-notif-id');
                    if (id) {
                        markAsRead(id);
                        observerRef.current.unobserve(entry.target);
                    }
                }
            });
        }, { threshold: 0.5 });

        const elements = document.querySelectorAll('.unread-notification-row');
        elements.forEach(el => observerRef.current.observe(el));

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [notifications.length, loading]);

    // ═══════════════════════════════════════════════════════════════════════════
    // FRIEND REQUEST HANDLERS (SmarterPoker-style: Decline = Auto-Follow)
    // ═══════════════════════════════════════════════════════════════════════════

    const handleAcceptFriendRequest = async (notification, e) => {
        e.stopPropagation(); // Prevent navigation

        // Get sender_id from notification data (stored by the trigger)
        const requesterId = notification.data?.sender_id || notification.data?.actor_id || notification.actor_id;
        const friendshipId = notification.data?.friendship_id;


        if (!requesterId || !user) {
            console.warn('Missing requesterId or user');
            return;
        }

        try {
            // Use friendship_id directly if available, otherwise find it
            let requestId = friendshipId;

            if (!requestId) {
                const { data: request } = await supabase
                    .from('friendships')
                    .select('id')
                    .eq('user_id', requesterId)
                    .eq('friend_id', user.id)
                    .eq('status', 'pending')
                    .maybeSingle();
                requestId = request?.id;
            }

            if (requestId) {
                // EAGER STATE SYNCHRONIZATION
                if (mounted.current) {
                    setNotifications(prev => {
                        const next = prev.map(n =>
                            n.id === notification.id
                                ? { ...n, message: 'Is Now Your Friend!', type: 'friend_accepted', handled: true, read: true }
                                : n
                        );
                        try { localStorage.setItem('sp-notif-cache', JSON.stringify(next.slice(0, 30))); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                        return next;
                    });
                    toast.success('Friend request accepted!');
                }

                // Fire-and-forget DB updates with fetch-on-failure
                Promise.all([
                    supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId),
                    supabase.from('friendships').upsert({ user_id: user.id, friend_id: requesterId, status: 'accepted' }, { onConflict: 'user_id,friend_id' }),
                    supabase.from('notifications').update({ read: true, is_read: true }).eq('id', notification.id)
                ]).catch(e => {
                    console.warn('Exception:', e);
                    fetchNotifications();
                });

                // Sync friends page cross-tab + EventBus
                busEmit.dataMutated('friends');
                broadcastSync('smarter_poker_friends_sync', 'refresh');
            } else {
                console.warn('Could not find friendship to accept');
                toast.error('Could not find friend request.');
            }
        } catch (err) {
            console.warn('Error accepting friend request:', err);
            toast.error('Failed to accept friend request. Try again.');
        }
    };

    const handleDeclineFriendRequest = async (notification, e) => {
        e.stopPropagation(); // Prevent navigation

        // Get sender_id from notification data (stored by the trigger)
        const requesterId = notification.data?.sender_id || notification.data?.actor_id || notification.actor_id;
        const friendshipId = notification.data?.friendship_id;


        if (!requesterId || !user) {
            console.warn('Missing requesterId or user');
            return;
        }

        try {
            // EAGER STATE SYNCHRONIZATION
            if (mounted.current) {
                setNotifications(prev => {
                    const next = prev.map(n =>
                        n.id === notification.id
                            ? { ...n, message: 'Is Now Following You', type: 'new_follow', handled: true, read: true }
                            : n
                    );
                    try { localStorage.setItem('sp-notif-cache', JSON.stringify(next.slice(0, 30))); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                    return next;
                });
                toast.success('Request declined — they now follow you.');
            }

            // Fire-and-forget DB updates with fetch-on-failure
            const p1 = friendshipId
                ? supabase.from('friendships').delete().eq('id', friendshipId)
                : supabase.from('friendships').delete().eq('user_id', requesterId).eq('friend_id', user.id).eq('status', 'pending');
            
            Promise.all([
                p1,
                supabase.from('social_follows').upsert({ follower_id: requesterId, following_id: user.id }, { onConflict: 'follower_id,following_id' }),
                supabase.from('notifications').update({ read: true, is_read: true }).eq('id', notification.id)
            ]).catch(e => {
                console.warn('Exception:', e);
                fetchNotifications();
            });

            // Sync friends page cross-tab + EventBus
            busEmit.dataMutated('friends');
            broadcastSync('smarter_poker_friends_sync', 'refresh');
        } catch (err) {
            console.warn('Error declining friend request:', err);
            toast.error('Failed to decline request. Try again.');
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    if (loading) {
        return (
            <PageTransition>
                <SEOHead title="Notifications" description="Loading notifications..." canonical="/hub/notifications" noindex={true} />
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                    {!isInIframe && <UniversalHeader pageDepth={2} onMenuClick={() => {}} />}
                    <div style={{ maxWidth: 680, margin: '0 auto', padding: 16 }}>
                        {[1,2,3,4,5].map(i => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: 16, background: C.card, borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E4E6EB', animation: 'shimmer 1.5s infinite' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ width: '70%', height: 14, borderRadius: 7, background: '#E4E6EB', marginBottom: 8, animation: 'shimmer 1.5s infinite' }} />
                                    <div style={{ width: '40%', height: 10, borderRadius: 5, background: '#E4E6EB', animation: 'shimmer 1.5s infinite' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <style>{`
                        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                    `}</style>
                </div>
            </PageTransition>
        );
    }

    return (
        <PageTransition>
            <SEOHead
                title="Notifications"
                description="Stay Updated With Your Latest Activity, Friend Requests, Game Invitations, And Community Updates."
                canonical="/hub/notifications"
                noindex={true}
            />
            <style>{`
                .notifications-page {
                    padding-bottom: 70px;
                    width: 100%;
                    max-width: 100vw;
                    overflow-x: hidden;
                    box-sizing: border-box;
                }
                @media (max-width: 768px) {
                    .notifications-list {
                        max-width: 100% !important;
                        width: 100% !important;
                    }
                    .notif-header-bar {
                        padding: 10px 12px !important;
                    }
                }
            `}</style>
            <div className="notifications-page" style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header - Universal Header (hidden when inside overlay iframe) */}
                {!isInIframe && <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />}
                {!isInIframe && <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="right"
                    theme="light"
                    user={user}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />}
                <header className="notif-header-bar" style={{ background: C.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>Notifications</h1>
                        {unreadCount > 0 && (
                            <span style={{
                                background: C.red, color: 'white', borderRadius: 12,
                                padding: '2px 8px', fontSize: 12, fontWeight: 600
                            }}>{unreadCount}</span>
                        )}
                    </div>
                </header>

                {/* Notifications List — [Audit#17] tap anywhere to dismiss open swipes */}
                <div
                    className="notifications-list"
                    style={{ maxWidth: 680, margin: '0 auto' }}
                    onClick={() => { if (swipedId) setSwipedId(null); }}
                >
                    {notifications.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <div style={{ fontSize: 48, display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                                <Bell size={48} color={C.textSec} />
                            </div>
                            <h3 style={{ color: C.text, marginTop: 8 }}>No Notifications Yet</h3>
                            <p style={{ color: C.textSec }}>When Someone Likes, Comments, Or Tags You, You'll See It Here.</p>
                        </div>
                    ) : (
                        notifications.map(n => {
                            // Comprehensive notification icon map — category-based + message parsing
                            const getNotifIcon = () => {
                                const s = 14; const clr = '#fff';
                                const t = n.type || '';
                                const msg = (n.message || '').toLowerCase();

                                // ── Settlement / Financial ──────────────────
                                if (t === 'settlement' || t === 'weekly_settlement' || t === 'settlement_hold')
                                    return { icon: <Banknote size={s} color={clr} />, bg: '#22C55E' };
                                if (t === 'payout' || t === 'rakeback' || t === 'refund' || t === 'bonus' || t === 'rakeback_sent' || t === 'rakeback_available')
                                    return { icon: <Banknote size={s} color={clr} />, bg: '#22C55E' };

                                // ── Home Games ──────────────────────────────
                                if (t === 'home_game_new' || t === 'home_game' || t === 'home_game_invite')
                                    return { icon: <Spade size={s} color={clr} />, bg: '#00d4ff' };
                                if (t === 'home_game_rsvp' || t === 'home_game_seat_request')
                                    return { icon: <UserCheck size={s} color={clr} />, bg: '#0096ff' };
                                if (t === 'home_game_rsvp_confirmed' || t === 'home_game_rsvp_approved')
                                    return { icon: <UserCheck size={s} color={clr} />, bg: '#22C55E' };
                                if (t === 'home_game_cancelled')
                                    return { icon: <Bell size={s} color={clr} />, bg: '#FA383E' };
                                if (t === 'home_game_host_broadcast' || t === 'home_game_reminder')
                                    return { icon: <Megaphone size={s} color={clr} />, bg: '#ffd60a' };

                                // ── Group / Club ────────────────────────────
                                if (t === 'home_group_announcement' || t === 'home_group_announcement_followed' || t === 'club_announcement' || t === 'venue_announcement') {
                                    if (msg.includes('seat')) return { icon: <UserCheck size={s} color={clr} />, bg: '#1877F2' };
                                    if (msg.includes('roster')) return { icon: <Users size={s} color={clr} />, bg: '#00d4ff' };
                                    return { icon: <Megaphone size={s} color={clr} />, bg: '#ffd60a' };
                                }
                                if (t === 'home_group_friend_joined' || t === 'member_joined') {
                                    if (msg.includes('seat')) return { icon: <UserCheck size={s} color={clr} />, bg: '#1877F2' };
                                    if (msg.includes('roster')) return { icon: <Users size={s} color={clr} />, bg: '#00d4ff' };
                                    if (msg.includes('rsvp') || msg.includes('late')) return { icon: <Bell size={s} color={clr} />, bg: '#ffd60a' };
                                    if (msg.includes('dm_')) return { icon: <MessageCircle size={s} color={clr} />, bg: '#1877F2' };
                                    return { icon: <UserPlus size={s} color={clr} />, bg: '#42B72A' };
                                }
                                if (t === 'home_group_approved' || t === 'home_group_pending_request')
                                    return { icon: <UserCheck size={s} color={clr} />, bg: '#42B72A' };
                                if (t === 'home_group_banned' || t === 'home_group_hidden')
                                    return { icon: <ShieldCheck size={s} color={clr} />, bg: '#FA383E' };

                                // ── Friends & Follows ───────────────────────
                                if (t === 'friend_request')
                                    return { icon: <UserPlus size={s} color={clr} />, bg: '#1877F2' };
                                if (t === 'friend_accepted' || t === 'friend_accept')
                                    return { icon: <UserCheck size={s} color={clr} />, bg: '#42B72A' };
                                if (t === 'new_follow' || t === 'follow' || t === 'follow_request' || t === 'page_new_follower')
                                    return { icon: <Eye size={s} color={clr} />, bg: '#0096ff' };

                                // ── Likes & Reactions ────────────────────────
                                if (t === 'like' || t === 'home_post_like' || t === 'page_like' || t === 'post_liked')
                                    return { icon: <ThumbsUp size={s} color={clr} />, bg: '#1877F2' };
                                if (t === 'love')
                                    return { icon: <Heart size={s} color={clr} />, bg: '#FA383E' };

                                // ── Comments & Messages ──────────────────────
                                if (t === 'comment' || t === 'home_post_comment' || t === 'page_comment' || t === 'post_commented' || t === 'strategy_comment')
                                    return { icon: <MessageCircle size={s} color={clr} />, bg: '#22C55E' };
                                if (t === 'mention' || t === 'page_mention')
                                    return { icon: <AtSign size={s} color={clr} />, bg: '#00d4ff' };
                                if (t === 'message' || t === 'messenger_message' || t === 'missed_call')
                                    return { icon: <MessageCircle size={s} color={clr} />, bg: '#1877F2' };
                                if (t === 'share')
                                    return { icon: <Share2 size={s} color={clr} />, bg: '#1877F2' };

                                // ── Tournaments ─────────────────────────────
                                if (t.startsWith('tournament'))
                                    return { icon: <Trophy size={s} color={clr} />, bg: '#ffd60a' };

                                // ── Achievements & Badges ───────────────────
                                if (t === 'achievement' || t === 'home_badges_earned' || t === 'level_up' || t === 'streak' || t === 'streak_reward')
                                    return { icon: <Star size={s} color={clr} />, bg: '#ffd60a' };

                                // ── Live / Venue ────────────────────────────
                                if (t === 'live' || t === 'live_game' || t === 'called_for_seat' || t === 'seat_ready' || t === 'waitlist_update')
                                    return { icon: <Radio size={s} color={clr} />, bg: '#FA383E' };
                                if (t === 'venue' || t === 'venue_claim_approved' || t === 'venue_review')
                                    return { icon: <Spade size={s} color={clr} />, bg: '#00d4ff' };

                                // ── System / Admin ──────────────────────────
                                if (t === 'system' || t === 'moderation_alert' || t === 'geofence_alert' || t === 'fraud_alert')
                                    return { icon: <Zap size={s} color={clr} />, bg: '#00d4ff' };

                                // ── Smart message-content fallback ──────────
                                if (msg.includes('settlement') || msg.includes('rake')) return { icon: <Banknote size={s} color={clr} />, bg: '#22C55E' };
                                if (msg.includes('friend')) return { icon: <UserPlus size={s} color={clr} />, bg: '#42B72A' };
                                if (msg.includes('tournament') || msg.includes('trophy')) return { icon: <Trophy size={s} color={clr} />, bg: '#ffd60a' };

                                // ── Default ─────────────────────────────────
                                return { icon: <Bell size={s} color={clr} />, bg: '#1877F2' };
                            };
                            const { icon: ActionIcon, bg: iconBg } = getNotifIcon();

                            // Navigate to page detail or user profile
                            const handleClick = () => {
                                // [Audit#18] Mark as read on click-through
                                if (!n.read) markAsRead(n.id);
                                // [Audit#17] Dismiss any open swipe
                                setSwipedId(null);

                                const navigate = (path) => {
                                    if (!path) return;
                                    
                                    // Handle absolute URLs correctly instead of passing them to router.push
                                    let localPath = path;
                                    if (path.startsWith('http://') || path.startsWith('https://')) {
                                        try {
                                            const urlObj = new URL(path);
                                            // Only use pathname+search if it's our domain, else redirect fully
                                            if (urlObj.hostname === window.location.hostname || urlObj.hostname === 'smarter.poker') {
                                                localPath = urlObj.pathname + urlObj.search;
                                            } else {
                                                window.open(path, '_blank');
                                                return;
                                            }
                                        } catch(e) {
                                            console.warn('Invalid URL:', path);
                                        }
                                    }

                                    try {
                                        if (window.self !== window.top) {
                                            window.top.location.href = localPath;
                                        } else {
                                            router.push(localPath);
                                        }
                                    } catch (_) {
                                        window.location.href = localPath;
                                    }
                                };

                                const t = n.type || '';
                                const d = n.data || {};

                                // ── BUG-14 FIX: Use DB-precomputed link/action_url FIRST ────
                                // home_game_new, home_group_announcement, new_follow etc all have
                                // a 'link' column set by the backend trigger. Use it directly.
                                if (n.link) { navigate(n.link); return; }
                                if (n.action_url) { navigate(n.action_url); return; }

                                // ── STREAM-BUG-8: live-stream notifications deep-link to viewer ─────
                                // pages/api/notifications/live-notify.js emits type='live' with
                                // data.stream_id. Without an explicit branch we fall through to
                                // /hub/social-media (no ?stream= query) and tapping the alert
                                // lands on the feed root instead of the actual broadcast.
                                // /hub/social-media?stream=<id> is the same route GoLiveModal's
                                // share link uses — the existing viewer mount path picks it up.
                                if (t === 'live' || t === 'live_started' || t === 'live_now') {
                                    const sid = d.stream_id || d.streamId;
                                    if (sid) { navigate(`/hub/social-media?stream=${sid}`); return; }
                                    navigate('/hub/lives'); return;
                                }
                                if (t === 'live_scheduled') {
                                    navigate('/hub/lives'); return;
                                }

                                // ── Home Games / Groups ──────────────────────────────
                                if (t.startsWith('home_group') || t.startsWith('home_game') || t === 'member_joined') {
                                    if (d.group_id) navigate(`/hub/home-games/${d.group_id}`);
                                    else navigate('/hub/home-games');

                                // ── Friends ──────────────────────────────────────────
                                // BUG-17 FIX: friend_request has sender_id (not actor_id) in data
                                } else if (t === 'friend_request' || t === 'friend_accepted' || t === 'friend_accept' || t === 'new_follow' || t === 'follow') {
                                    if (n.actor_username) navigate(`/hub/user/${n.actor_username}`);
                                    else if (d.sender_id && n.actor_username) navigate(`/hub/user/${n.actor_username}`);
                                    else navigate('/hub/friends');

                                // ── Poker Pages / Clubs ──────────────────────────────
                                } else if (d.page_type && d.page_id) {
                                    const pt = d.page_type;
                                    const pid = d.page_id;
                                    if (pt === 'venue') navigate(`/hub/venues/${pid}`);
                                    else if (pt === 'tour') navigate(`/hub/tours/${pid}`);
                                    else if (pt === 'series') navigate(`/hub/series/${pid}`);
                                    else navigate(`/club/${pid}`);

                                // ── Social Pages (Commander clubs) ───────────────────
                                } else if (d.club_id) {
                                    navigate(`/club/${d.club_id}`);
                                } else if (d.page_id) {
                                    navigate(`/hub/social-pages/${d.page_id}`);

                                // ── Posts ────────────────────────────────────────────
                                } else if (d.post_id) {
                                    if (d.is_reel || d.post_type === 'reel') {
                                        navigate(`/hub/reels?id=${d.post_id}`);
                                    } else {
                                        navigate('/hub/social-media');
                                    }

                                // ── Tournaments ──────────────────────────────────────
                                } else if (d.tournament_id) {
                                    navigate('/hub/tournaments');

                                // ── User Profile ─────────────────────────────────────
                                } else if (n.actor_username) {
                                    navigate(`/hub/user/${n.actor_username}`);

                                // ── Generic friend types ─────────────────────────────
                                } else if (t.includes('friend') || t.includes('follow')) {
                                    navigate('/hub/friends');

                                // ── Social fallback ──────────────────────────────────
                                } else if (n._source === 'social') {
                                    navigate('/hub/social-media');
                                }
                            };


                            
                            // BUG-16 fix: include home_game/home_group types in isClickable
                            // BUG-14 fix: n.link / n.action_url makes any notification clickable
                            const isClickable = !!(
                                n.link ||
                                n.action_url ||
                                n.data?.page_id || 
                                n.data?.club_id || 
                                n.data?.group_id || 
                                n.data?.post_id || 
                                n.data?.tournament_id || 
                                n.actor_username || 
                                (n.type && (n.type.includes('friend') || n.type.includes('follow') || n.type.startsWith('home_'))) || 
                                n._source === 'social'
                            );

                            const isSwiped = swipedId === n.id;
                            const isDeleting = deletingIds.has(n.id);
                            const isConfirming = confirmDeleteId === n.id;

                            return (
                                <div
                                    key={n.id}
                                    className={!n.read ? "unread-notification-row" : ""}
                                    data-notif-id={n.id}
                                    style={{
                                        position: 'relative', overflow: 'hidden',
                                        borderBottom: `1px solid ${C.border}`,
                                        opacity: isDeleting ? 0 : 1,
                                        // [Audit#10] 800px to fit friend_request rows with Accept+Decline buttons
                                        maxHeight: isDeleting ? 0 : 800,
                                        transition: 'opacity 0.3s ease, max-height 0.3s ease',
                                    }}
                                >
                                    {/* Main notification row */}
                                    <div
                                        onClick={handleClick}
                                        style={{
                                            padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
                                            background: n.read ? C.card : 'rgba(24, 119, 242, 0.08)',
                                            cursor: isClickable ? 'pointer' : 'default',
                                            position: 'relative', zIndex: 2,
                                            transition: 'background 0.2s ease',
                                        }}
                                    >
                                        {/* Avatar with Lucide action badge */}
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <img
                                                src={n.actor_avatar_url || '/default-avatar.png'}
                                                alt={n.actor_name || 'User'}
                                                style={{
                                                    width: 56, height: 56, borderRadius: '50%',
                                                    objectFit: 'cover', border: '2px solid #ddd'
                                                }}
                                                loading="lazy" />
                                            <div style={{
                                                position: 'absolute', bottom: -2, right: -2,
                                                width: 24, height: 24, borderRadius: '50%',
                                                background: iconBg, border: '2px solid white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>{ActionIcon}</div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 15, color: C.text, lineHeight: 1.4 }}>
                                                <span style={{ fontWeight: 700 }}>{n.actor_name || n.title}</span>
                                                {' '}{n.message}
                                            </div>
                                            <div style={{ fontSize: 12, color: n.read ? C.textSec : C.blue, marginTop: 4, fontWeight: n.read ? 400 : 600 }}>
                                                {timeAgo(n.created_at)}
                                            </div>

                                            {/* Accept/Decline buttons for friend requests */}
                                            {n.type === 'friend_request' && !n.handled && (
                                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                                    <button
                                                        onClick={(e) => handleAcceptFriendRequest(n, e)}
                                                        style={{
                                                            padding: '8px 20px',
                                                            borderRadius: 20,
                                                            border: 'none',
                                                            background: C.blue,
                                                            color: 'white',
                                                            fontWeight: 600,
                                                            fontSize: 14,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s',
                                                            minWidth: 90,
                                                            boxSizing: 'border-box'
                                                        }}
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeclineFriendRequest(n, e)}
                                                        style={{
                                                            padding: '8px 20px',
                                                            borderRadius: 20,
                                                            border: 'none',
                                                            background: '#E4E6EB',
                                                            color: C.text,
                                                            fontWeight: 600,
                                                            fontSize: 14,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s',
                                                            minWidth: 90,
                                                            boxSizing: 'border-box'
                                                        }}
                                                        title="They'll Become Your Follower"
                                                    >
                                                        Decline
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {/* Unread dot + delete button */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 4 }}>
                                            {!n.read && (
                                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.blue }} />
                                            )}
                                            <button
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    handleDelete(n.id, e); 
                                                }}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    padding: 4, borderRadius: '50%', display: 'flex',
                                                    opacity: 0.4, transition: 'opacity 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.4'}
                                                title="Delete notification"
                                            >
                                                <X size={16} color={C.textSec} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Bottom padding for mobile nav — CSS .notifications-page handles 70px clearance for non-iframe */}
                <div style={{ height: isInIframe ? 20 : 0 }} />
            </div>
              {!isInIframe && <BottomNavBar />}
    </PageTransition>
    );
}

export default function NotificationsPageWithBoundary() {
    return (
        <HubErrorBoundary name="Notifications">
            <NotificationsPage />
        </HubErrorBoundary>
    );
}
