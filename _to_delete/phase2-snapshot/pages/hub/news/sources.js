/**
 * News - Sources
 *
 * Lists the canonical aggregated news sources (served by /api/news/source-boxes)
 * and lets the user enable/disable each one. Preferences persist to the
 * `mutedSources` key of news_preferences for signed-in users and to
 * localStorage ('news_muted_sources') for guests.
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useCallback, useEffect, useState } from 'react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getAuthUser } from '../../../src/lib/authUtils';
import { getNewsPreferences, updateNewsPreferences } from '../../../src/services/newsPreferences';

const MUTED_SOURCES_KEY = 'news_muted_sources';

function readLocalMuted() {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(MUTED_SOURCES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        console.warn('[sources.js] Failed to read muted sources:', e?.message || e);
        return [];
    }
}

function writeLocalMuted(arr) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(MUTED_SOURCES_KEY, JSON.stringify(arr));
    } catch (e) {
        console.warn('[sources.js] Failed to persist muted sources:', e?.message || e);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NewsSources() {
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [muted, setMuted] = useState(() => new Set());
    const [userId, setUserId] = useState(null);

    // Resolve signed-in user (SSR-safe: runs client-side only)
    useEffect(() => {
        try {
            const user = getAuthUser();
            if (user?.id) setUserId(user.id);
        } catch (e) {
            console.warn('[sources.js]', e?.message || e);
        }
    }, []);

    // Fetch the real aggregated sources
    const fetchSources = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/news/source-boxes');
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            const boxes = Array.isArray(json?.data) ? json.data : [];
            setSources(
                boxes.map((box) => ({
                    id: box._boxNumber ?? box.id,
                    name: box._sourceName || box.source_name || 'Unknown Source',
                    latestTitle: box._isEmpty || box._isError ? null : box.title || null,
                    latestAt: box._isEmpty || box._isError ? null : box.published_at || null,
                }))
            );
        } catch (e) {
            setError(e?.message || 'Failed to load sources');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    // Load persisted muted-source preferences (account first, local fallback)
    useEffect(() => {
        let cancelled = false;
        const loadLocal = () => {
            if (!cancelled) setMuted(new Set(readLocalMuted()));
        };
        if (userId) {
            getNewsPreferences(userId)
                .then((prefs) => {
                    if (cancelled) return;
                    if (Array.isArray(prefs?.mutedSources)) {
                        setMuted(new Set(prefs.mutedSources));
                    } else {
                        loadLocal();
                    }
                })
                .catch(loadLocal);
        } else {
            loadLocal();
        }
        return () => {
            cancelled = true;
        };
    }, [userId]);

    const toggleSource = (name) => {
        const next = new Set(muted);
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        setMuted(next);
        const arr = [...next];
        writeLocalMuted(arr);
        if (userId) {
            updateNewsPreferences(userId, { mutedSources: arr }).catch((e) =>
                console.warn('[sources.js] Failed to save source preference:', e?.message || e)
            );
        }
    };

    return (
        <>
            <SEOHead
                title="News Sources — Poker Media Outlets"
                description="Browse Poker News Sources And Media Outlets Aggregated On Smarter.Poker."
                canonical="/hub/news/sources"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '12px' }}>
                            News Sources
                        </h1>
                        <p style={{ color: '#9ca3af', marginBottom: '40px' }}>
                            Manage which news sources appear in your feed
                        </p>

                        {loading && (
                            <div style={{ display: 'grid', gap: '16px' }} aria-hidden="true">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="src-skel"
                                        style={{
                                            height: '84px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            animationDelay: `${i * 0.08}s`
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {!loading && error && (
                            <div
                                role="alert"
                                style={{
                                    background: 'rgba(239,68,68,0.06)',
                                    border: '1px solid rgba(239,68,68,0.25)',
                                    borderRadius: '12px',
                                    padding: '24px',
                                    textAlign: 'center'
                                }}
                            >
                                <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}>
                                    Could not load news sources
                                </div>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '16px' }}>{error}</div>
                                <button
                                    type="button"
                                    onClick={fetchSources}
                                    style={{
                                        background: 'rgba(0,212,255,0.12)',
                                        border: '1px solid rgba(0,212,255,0.4)',
                                        color: '#00d4ff',
                                        borderRadius: '8px',
                                        padding: '10px 24px',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Try Again
                                </button>
                            </div>
                        )}

                        {!loading && !error && sources.length === 0 && (
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    padding: '32px',
                                    textAlign: 'center',
                                    color: '#9ca3af'
                                }}
                            >
                                No news sources available right now. Check back soon.
                            </div>
                        )}

                        {!loading && !error && sources.length > 0 && (
                            <div style={{ display: 'grid', gap: '16px' }}>
                                {sources.map((source) => {
                                    const enabled = !muted.has(source.name);
                                    const latestDate = formatDate(source.latestAt);
                                    return (
                                        <div
                                            key={source.id}
                                            style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '12px',
                                                padding: '20px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '16px',
                                                opacity: enabled ? 1 : 0.6,
                                                transition: 'opacity 0.2s'
                                            }}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                                    {source.name}
                                                </div>
                                                {source.latestTitle ? (
                                                    <div
                                                        style={{
                                                            color: '#9ca3af',
                                                            fontSize: '14px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Latest: {source.latestTitle}
                                                        {latestDate ? ` — ${latestDate}` : ''}
                                                    </div>
                                                ) : (
                                                    <div style={{ color: '#6b7280', fontSize: '14px' }}>
                                                        Awaiting new articles
                                                    </div>
                                                )}
                                            </div>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flexShrink: 0 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    onChange={() => toggleSource(source.name)}
                                                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${source.name} in your feed`}
                                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                                />
                                                <span style={{ color: enabled ? '#10b981' : '#9ca3af', minWidth: '64px' }}>
                                                    {enabled ? 'Enabled' : 'Disabled'}
                                                </span>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!loading && !error && sources.length > 0 && (
                            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '24px' }}>
                                {userId
                                    ? 'Your source preferences are saved to your account.'
                                    : 'Sign in to sync source preferences across devices. For now they are saved on this device.'}
                            </p>
                        )}
                    </div>

                    <style jsx>{`
                        @keyframes src-shimmer {
                            0% {
                                background-position: -800px 0;
                            }
                            100% {
                                background-position: 800px 0;
                            }
                        }
                        .src-skel {
                            background-image: linear-gradient(
                                90deg,
                                rgba(255, 255, 255, 0.04) 0%,
                                rgba(255, 255, 255, 0.1) 50%,
                                rgba(255, 255, 255, 0.04) 100%
                            );
                            background-size: 800px 100%;
                            animation: src-shimmer 1.4s ease-in-out infinite;
                        }
                    `}</style>
                </div>
                <BottomNavBar />
            </PageTransition>
        </>
    );
}
