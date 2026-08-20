import React, { useMemo } from 'react';
import { Eye, Bookmark, BookmarkCheck, Share2, CheckCircle, Clock, Trophy, BookOpen, Briefcase, Newspaper, Monitor } from 'lucide-react';

// Fallback images for different categories
const FALLBACK_IMAGES = {
    tournament: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=400',
    strategy: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=400',
    industry: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=400',
    news: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=400',
    online: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=400'
};

function formatViews(num) {
    const n = Number(num);
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.floor(n).toString();
}

function timeAgo(date) {
    if (!date) return '';
    const t = new Date(date).getTime();
    if (Number.isNaN(t)) return '';
    const seconds = Math.floor((Date.now() - t) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
    return `${Math.floor(seconds / 31536000)}y ago`;
}

// Source accent colors (canonical — matches SOURCE_COLORS in pages/hub/news.js)
const SOURCE_COLORS_LOCAL = {
    'PokerNews': '#e53935',
    'MSPT': '#1565c0',
    'CardPlayer': '#43a047',
    'Card Player': '#43a047',
    'WSOP': '#f9a825',
    'Poker.org': '#7b1fa2',
    'Pokerfuse': '#00897b'
};

// Minimal HTML entity decoder for excerpt text (named + numeric entities)
function decodeEntities(text) {
    if (!text) return '';
    return String(text)
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
            const code = parseInt(hex, 16);
            return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
        })
        .replace(/&#(\d+);/g, (match, dec) => {
            const code = parseInt(dec, 10);
            return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
        })
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

// Strip tags, decode entities, and truncate at a word boundary
function buildExcerpt(content, maxLen = 90) {
    if (!content) return '';
    const text = decodeEntities(String(content).replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return '';
    if (text.length <= maxLen) return text;
    const cut = text.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > maxLen / 2 ? cut.slice(0, lastSpace) : cut) + '...';
}

// Category icon components for the no-image placeholder
const CATEGORY_ICONS = {
    tournament: Trophy,
    strategy: BookOpen,
    industry: Briefcase,
    news: Newspaper,
    online: Monitor
};

function NewsBox({ article, index, onOpen, isBookmarked, onBookmark, onShare, isRead }) {
    // Read time: trust any positive stored value; otherwise estimate from real
    // content at ~200 wpm. When there is nothing to estimate, show no badge
    // rather than a fabricated number.
    const readTime = useMemo(() => {
        if (!article) return null;
        const dbTime = Number(article.read_time);
        if (Number.isFinite(dbTime) && dbTime > 0) return Math.round(dbTime);
        const textToEstimate = article.content || article.summary || article.excerpt || '';
        const wordCount = textToEstimate.trim().split(/\s+/).filter(Boolean).length;
        return wordCount > 50 ? Math.min(12, Math.max(2, Math.ceil(wordCount / 200))) : null;
    }, [article]);

    const excerpt = useMemo(() => buildExcerpt(article?.content), [article]);

    if (!article) return null;

    const CategoryIcon = CATEGORY_ICONS[article.category] || CATEGORY_ICONS.news;

    // Get image with fallback — proxy cardplayer.com images through our server (they block direct browser access)
    const rawImageUrl = article.image_url;
    const isCardPlayerImage = rawImageUrl && (
        rawImageUrl.includes('cardplayer.com')
    );
    const imageUrl = isCardPlayerImage
        ? `/api/proxy?url=${encodeURIComponent(rawImageUrl)}`
        : (rawImageUrl || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news);
    const fallbackUrl = FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news;

    const srcColor = SOURCE_COLORS_LOCAL[article.source_name] || '#5ef5f0';

    const openArticle = () => {
        if (onOpen) onOpen(article);
    };

    return (
        <div
            className={`news-box ${isRead ? 'read' : ''}`}
            data-source={article.source_name}
            style={{ '--src-accent': srcColor }}
            role="button"
            tabIndex={0}
            aria-label={article.title || 'Open article'}
            onClick={openArticle}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openArticle();
                }
            }}
        >
            {/* Quick Actions — keydown must not reach the card handler above, or
                its preventDefault() would cancel these buttons' native activation */}
            <div className="box-actions" onKeyDown={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (onBookmark) onBookmark(article.id, article); }}
                    title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                    aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark article'}
                    aria-pressed={!!isBookmarked}
                >
                    {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </button>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (onShare) onShare(article); }}
                    title="Share"
                    aria-label="Share article"
                >
                    <Share2 size={14} />
                </button>
            </div>

            {/* Read Indicator */}
            {isRead && (
                <div className="read-indicator">
                    <CheckCircle size={10} /> Read
                </div>
            )}

            {/* Reading Time Badge */}
            {readTime > 0 && (
                <div className="read-time-badge">
                    <Clock size={9} /> {readTime} min
                </div>
            )}

            {/* Image with fallback */}
            <div className="box-image">
                <img
                    src={imageUrl}
                    alt={article.title || 'Poker news article'}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                        // Try category fallback before giving up
                        if (e.target.src !== fallbackUrl) {
                            e.target.src = fallbackUrl;
                        } else {
                            e.target.style.display = 'none';
                            e.target.parentElement.classList.add('no-image');
                        }
                    }}
                />
                <div className="image-placeholder" aria-hidden="true">
                    <span className="placeholder-icon"><CategoryIcon size={48} /></span>
                    <span className="placeholder-text">{article.category?.toUpperCase() || 'POKER'}</span>
                </div>
                <div className="box-overlay" />
            </div>

            {/* Content - compact: title + excerpt + meta */}
            <div className="box-content">
                <h3 className="box-title">{article.title}</h3>
                {excerpt && (
                    <p className="box-excerpt">{excerpt}</p>
                )}
                <div className="box-meta">
                    <span className="source" style={{ color: srcColor }}>{article.source_name || 'Smarter.Poker'}</span>
                    <span className="separator">•</span>
                    <span className="time">{timeAgo(article.published_at)}</span>
                    <span className="separator">•</span>
                    <span className="views"><Eye size={10} /> {formatViews(article.views || 0)}</span>
                </div>
            </div>

            <style jsx>{`
                .news-box {
                    position: relative;
                    background: #1a1c1e;
                    border-radius: 16px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    height: 340px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                }

                /* Chrome frame overlay - border only, no glow */
                .news-box::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border-radius: 16px;
                    border: 5px solid rgba(180, 195, 220, 0.9);
                    box-shadow: none;
                    pointer-events: none;
                    z-index: 100;
                }

                .news-box:hover {
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }

                .news-box:focus-visible {
                    outline: 2px solid #5ef5f0;
                    outline-offset: 2px;
                }

                .news-box.read {
                    opacity: 0.7;
                }

                .news-box.read:hover {
                    opacity: 1;
                }

                .box-actions {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    display: flex;
                    gap: 6px;
                    z-index: 10;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .news-box:hover .box-actions,
                .news-box:focus-within .box-actions {
                    opacity: 1;
                }

                .box-actions button {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .box-actions button:hover,
                .box-actions button:focus-visible {
                    background: rgba(0, 212, 255, 0.4);
                }

                .read-indicator {
                    position: absolute;
                    top: 12px;
                    left: 12px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: rgba(34, 197, 94, 0.9);
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 600;
                    color: #fff;
                    z-index: 10;
                }

                .box-image {
                    position: relative;
                    width: 100%;
                    height: 240px;
                    overflow: hidden;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 12px 12px 0 0;
                }

                .box-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    object-position: center top;
                    transition: transform 0.4s;
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: 1;
                }

                .news-box:hover .box-image img {
                    transform: scale(1.08);
                }

                .box-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to top, rgba(10, 10, 18, 0.9) 0%, transparent 60%);
                    z-index: 2;
                }

                .image-placeholder {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 50%, #16213e 100%);
                    z-index: 0;
                }

                .box-image.no-image .image-placeholder {
                    z-index: 1;
                }

                .placeholder-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255, 255, 255, 0.6);
                    opacity: 0.8;
                }

                .placeholder-text {
                    font-size: 12px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    color: rgba(255, 255, 255, 0.4);
                    margin-top: 8px;
                }

                .box-content {
                    padding: 6px 8px 12px 8px;
                    margin: 6px 0 0 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 2px;
                    height: auto;
                    min-height: 60px;
                    flex-grow: 1;
                    flex-shrink: 0;
                    background: #1a1c1e;
                    overflow: hidden;
                    border-radius: 6px 6px 0 0;
                }

                .box-title {
                    font-size: 13px;
                    font-weight: 600;
                    line-height: 1.3;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin: 0;
                }

                /* Values mirror the page-level .box-excerpt rule in
                   pages/hub/news.js ("PHASE 2: ARTICLE EXCERPT"). Scoping this
                   block raised its specificity to (0,2,0), so that plain (0,1,0)
                   page rule no longer wins; declare the intended values here so
                   the rendered result is unchanged. */
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

                .box-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                    white-space: nowrap;
                    overflow: hidden;
                }

                .box-meta .source {
                    color: #2374E1;
                    font-weight: 600;
                }

                .box-meta .separator {
                    opacity: 0.3;
                }

                .box-meta .views {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }

                /* =============================================================
                   SOCIAL MEDIA FORMULA - Mobile Override (scoped to NewsBox).
                   Intentionally NOT !important: the page-level global mobile
                   override in pages/hub/news.js uses !important and must keep
                   winning where the two disagree.
                   ============================================================= */
                @media (max-width: 768px) {
                    .news-box {
                        height: auto;
                        min-height: auto;
                        max-height: none;
                        border-radius: 12px;
                        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                        border: none;
                        margin-bottom: 0;
                        overflow: hidden;
                    }

                    .news-box::after {
                        content: '';
                        display: block;
                        position: absolute;
                        inset: 0;
                        border-radius: 12px;
                        border: 4px solid rgba(180, 195, 220, 0.9);
                        box-shadow: none;
                        pointer-events: none;
                        z-index: 10;
                    }

                    .box-image {
                        height: auto;
                        aspect-ratio: 16/9;
                        border-radius: 0;
                    }

                    .box-image img {
                        position: relative;
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        border-radius: 0;
                    }

                    .box-content {
                        padding: 12px 16px;
                    }

                    .box-title {
                        font-size: 15px;
                        line-height: 1.4;
                        white-space: normal;
                        overflow: visible;
                        text-overflow: unset;
                    }

                    .box-overlay {
                        display: none;
                    }

                    .box-meta {
                        font-size: 12px;
                    }
                }
            `}</style>
        </div>
    );
}

export default React.memo(NewsBox);

// Re-export helpers for sibling components
export { FALLBACK_IMAGES, formatViews, timeAgo, SOURCE_COLORS_LOCAL };
