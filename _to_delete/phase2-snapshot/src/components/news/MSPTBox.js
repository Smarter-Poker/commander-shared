import React from 'react';
import { timeAgo } from './NewsBox';

const MSPT_ACCENT = '#dc2626';
const MSPT_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80';

function MSPTBox({ msptNews = [], onOpenMSPT }) {
    const featured = Array.isArray(msptNews) ? msptNews[0] : null;
    const publishedLabel = featured?.published_at ? timeAgo(featured.published_at) : '';

    const openFeatured = () => {
        if (featured && onOpenMSPT) onOpenMSPT(featured);
    };

    return (
        <div
            className="news-box mspt-box"
            style={{ '--src-accent': MSPT_ACCENT }}
            role="button"
            tabIndex={0}
            aria-label={featured?.title ? `Open MSPT article: ${featured.title}` : 'MSPT News & Updates'}
            onClick={openFeatured}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openFeatured();
                }
            }}
        >
            {/* Image */}
            <div className="box-image">
                <img
                    src={featured?.image_url || MSPT_FALLBACK_IMAGE}
                    alt={featured?.title || 'MSPT News'}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                        if (e.target.src !== MSPT_FALLBACK_IMAGE) {
                            e.target.src = MSPT_FALLBACK_IMAGE;
                        }
                    }}
                />
                <div className="box-overlay" />
            </div>

            {/* Content */}
            <div className="box-content">
                {/* Title */}
                <h3 className="box-title">{featured?.title || "MSPT News & Updates"}</h3>

                {/* Description */}
                <p className="box-excerpt">
                    {featured?.prize_pool ? `${featured.prize_pool} - ` : ''}
                    Latest updates from Mid-States Poker Tour events and tournaments.
                </p>

                {/* Meta */}
                <div className="box-meta">
                    <span className="source">MSPT</span>
                    <span className="separator">•</span>
                    <span className="time">{publishedLabel || 'Live'}</span>
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
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                }
                .news-box::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: 16px;
                    border: 5px solid rgba(180, 195, 220, 0.9);
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
                .mspt-box {
                    height: 340px;
                }
                /* MSPT brand accent lives on the chrome frame so it is
                   actually visible (a border on the box itself would be
                   hidden underneath the ::after frame). */
                .mspt-box:hover::after {
                    border-color: rgba(220, 38, 38, 0.7);
                }
                .mspt-box:hover {
                    box-shadow: 0 8px 32px rgba(220, 38, 38, 0.2);
                }
                .box-image {
                    position: relative;
                    width: 100%;
                    height: 240px;
                    overflow: hidden;
                    border-radius: 12px 12px 0 0;
                }
                .box-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .box-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to top, rgba(10, 10, 18, 0.9) 0%, transparent 60%);
                    z-index: 2;
                }
                .box-content {
                    padding: 6px 8px 12px 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    flex-grow: 1;
                }
                .box-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .box-excerpt {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    line-height: 1.5;
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
                }
                .box-meta .source {
                    color: #dc2626;
                    font-weight: 600;
                }
                .box-meta .separator {
                    opacity: 0.3;
                }
            `}</style>
        </div>
    );
}

export default React.memo(MSPTBox);
