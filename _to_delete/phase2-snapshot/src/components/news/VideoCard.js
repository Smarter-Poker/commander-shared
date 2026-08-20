import React from 'react';
import { Play } from 'lucide-react';
import SPImage from '../common/SPImage';
import { formatViews, FALLBACK_IMAGES } from './NewsBox';

function VideoCard({ video, onClick }) {
    if (!video) return null;

    const openVideo = () => {
        if (onClick) onClick(video);
    };

    return (
        <div
            className="video-card"
            role="button"
            tabIndex={0}
            aria-label={video.title ? `Play video: ${video.title}` : 'Play video'}
            onClick={openVideo}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openVideo();
                }
            }}
        >
            <div className="video-thumbnail" style={{ position: 'relative' }}>
                <SPImage
                    src={video.thumbnail_url || FALLBACK_IMAGES.news}
                    alt={video.title || 'Poker video'}
                    fill
                    style={{ objectFit: 'cover' }}
                    onError={(e) => {
                        if (e?.target && e.target.src !== FALLBACK_IMAGES.news) {
                            e.target.src = FALLBACK_IMAGES.news;
                        }
                    }}
                />
                {video.duration && <div className="video-duration">{video.duration}</div>}
                <div className="play-button" aria-hidden="true">
                    <Play size={24} fill="#fff" />
                </div>
            </div>
            <div className="video-info">
                <h4>{video.title}</h4>
                <div className="video-meta">
                    <span className="channel">{video.channel || 'Smarter.Poker'}</span>
                    <span>{formatViews(video.views || 0)} views</span>
                </div>
            </div>

            <style jsx>{`
                .video-card {
                    position: relative;
                    background: #1a1c1e;
                    border-radius: 16px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.3s;
                    height: 280px;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                }

                /* Chrome frame overlay for video cards - border only, no glow */
                .video-card::after {
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

                .video-card:hover {
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }

                .video-card:focus-visible {
                    outline: 2px solid #5ef5f0;
                    outline-offset: 2px;
                }

                .video-thumbnail {
                    position: relative;
                    width: 100%;
                    height: 180px;
                    overflow: hidden;
                    border-radius: 12px 12px 0 0;
                }

                .video-thumbnail :global(img) {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.3s;
                }

                .video-card:hover .video-thumbnail :global(img) {
                    transform: scale(1.05);
                }

                .video-duration {
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    padding: 3px 6px;
                    background: rgba(0, 0, 0, 0.85);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #fff;
                }

                .play-button {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 50px;
                    height: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 0, 0, 0.9);
                    border-radius: 50%;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .video-card:hover .play-button,
                .video-card:focus-visible .play-button {
                    opacity: 1;
                }

                .video-info {
                    padding: 12px;
                }

                .video-info h4 {
                    font-size: 13px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 6px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .video-meta {
                    display: flex;
                    justify-content: space-between;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .video-meta .channel {
                    color: rgba(255, 255, 255, 0.7);
                }
            `}</style>
        </div>
    );
}

export default React.memo(VideoCard);
