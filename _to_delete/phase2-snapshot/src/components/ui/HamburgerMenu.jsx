/**
 * Universal Hamburger Menu Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Reusable slide-out menu for all World Hub pages
 * Supports navigation links, toggle switches, action buttons, and theming
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import InviteFriendsModal from './InviteFriendsModal';
import GeevesMenuWidget from './GeevesMenuWidget';
import ReportBugWidget from './ReportBugWidget';
import { useActiveIdentity } from '../../contexts/ActiveIdentityContext';
import { useAvatar } from '../../contexts/AvatarContext';
import { getAuthUser } from '../../lib/authUtils';

export default function HamburgerMenu({
  isOpen,
  onClose,
  direction = 'left',
  theme = 'light',
  user = null,
  stats = { diamonds: 0, level: 1 }, // Diamond stats for progress bar
  menuItems = [],
  showProfile = true,
  profileExtras = null,
  bottomLinks = [],
  width = 320,
  shortcuts = null, // External shortcuts array: [{ id, name, avatar_url, href, isArena, page }]
}) {
  const router = useRouter();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [localUser, setLocalUser] = useState(null);
  const { activeIdentity, switchToPersonal, switchToClub, isClubMode, clubPage, ownedPages } =
    useActiveIdentity();
  const { notifications = [] } = useAvatar() || {};

  useEffect(() => {
    setLocalUser(getAuthUser());
  }, []);

  const activeUser = user || localUser;

  const handleLogout = async () => {
    try {
      const { supabase } = await import('../../lib/supabase');
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Signout warning:', e);
    } finally {
      try { localStorage.removeItem('sp-social-user'); } catch (_) {}
      try { localStorage.removeItem('sp-vip-status'); } catch (_) {}
      try { localStorage.removeItem('smarter-poker-auth'); } catch (_) {}
      try { localStorage.removeItem('sp-cached-header-user'); } catch (_) {}
      try { localStorage.removeItem('sp-cached-settings-profile'); } catch (_) {}
      try { localStorage.removeItem('sp-notif-count'); } catch (_) {}
      window.top.location.href = '/';
    }
  };

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Swipe-to-close gesture
  const touchStartRef = React.useRef(null);
  const handleTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStartRef.current === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStartRef.current - touchEnd;
    // Swipe left to close if menu is on left, swipe right if menu is on right
    if (direction === 'left' && diff > 50) onClose();
    if (direction === 'right' && diff < -50) onClose();
    touchStartRef.current = null;
  };

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const colors =
    theme === 'light'
      ? {
          bg: '#FFFFFF',
          text: '#050505',
          textSec: '#65676B',
          border: '#DADDE1',
          blue: '#1877F2',
          blueHover: '#166FE5',
          cardBg: '#F0F2F5',
          hoverBg: '#F2F3F5',
        }
      : {
          bg: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 100%)',
          text: '#FFFFFF',
          textSec: '#94a3b8',
          border: 'rgba(59, 130, 246, 0.2)',
          blue: '#3b82f6',
          blueHover: '#2563eb',
          cardBg: 'rgba(30, 58, 95, 0.5)',
          hoverBg: 'rgba(59, 130, 246, 0.1)',
        };

  const renderMenuItem = (item, index) => {
    switch (item.type) {
      case 'navigation':
        // Club Arena is a full SPA served via getServerSideProps —
        // needs <a> tag for full page load, not Next.js <Link> client nav
        if (item.href === '/hub/club-arena') {
          return (
            <a
              key={index}
              href={item.href}
              onClick={() => {
                if (item.onClick) item.onClick();
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                textDecoration: 'none',
                color: colors.text,
                borderRadius: 8,
                transition: 'background 0.15s',
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{item.label}</span>
            </a>
          );
        }
        return (
          <Link
            key={index}
            href={item.href}
            onClick={() => {
              if (item.onClick) item.onClick();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              textDecoration: 'none',
              color: colors.text,
              borderRadius: 8,
              transition: 'background 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.hoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {item.icon && <div style={{ width: 24, height: 24 }}>{item.icon}</div>}
            <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{item.label}</span>
            {item.badge && (
              <span
                style={{
                  background: colors.blue,
                  color: 'white',
                  borderRadius: '50%',
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {item.badge}
              </span>
            )}
            <span style={{ color: colors.textSec }}>›</span>
          </Link>
        );

      case 'toggle':
        return (
          <div 
            key={index} 
            style={{ padding: '12px 16px', cursor: 'pointer' }}
            onClick={(e) => {
              // Ensure we don't trigger twice if they clicked the exact button element
              if (e.target.closest('button')) return;
              if (item.onChange) item.onChange(!item.checked);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 15, fontWeight: 500, color: colors.text, cursor: 'pointer' }}>
                {item.label}
              </label>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.onChange) item.onChange(!item.checked);
                }}
                style={{
                  width: 52,
                  height: 28,
                  borderRadius: 14,
                  border: 'none',
                  padding: 2,
                  cursor: 'pointer',
                  backgroundColor: item.checked ? '#10b981' : '#64748b',
                  transition: 'background-color 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-checked={item.checked}
                role="switch"
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: 'white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transform: item.checked ? 'translateX(24px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
            </div>
          </div>
        );

      case 'action': {
        const isFlat = item.label === 'Log Out' || item.label === 'Invite Friends' || item.label?.includes('Invite') || item.label?.includes('Logout') || item.label?.includes('Sign Out') || item.noBorder;
        return (
          <button
            key={index}
            onClick={() => {
              if (item.openInviteModal) {
                setShowInviteModal(true);
                return;
              }
              if (item.onClick) item.onClick();
              if (item.closeOnClick !== false) onClose();
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: isFlat ? '12px 0' : '12px 16px',
              background: item.primary ? colors.blue : 'transparent',
              border: item.primary ? 'none' : (isFlat ? 'none' : `1px solid ${colors.border}`),
              borderRadius: isFlat ? 0 : 8,
              color: item.primary ? 'white' : colors.text,
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (item.primary) {
                e.currentTarget.style.background = colors.blueHover;
              } else {
                e.currentTarget.style.background = colors.hoverBg;
              }
            }}
            onMouseLeave={(e) => {
              if (item.primary) {
                e.currentTarget.style.background = colors.blue;
              } else {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            {item.icon && <div style={{ width: 24, height: 24 }}>{item.icon}</div>}
            <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
          </button>
        );
      }

      case 'divider':
        return (
          <div
            key={index}
            style={{
              height: 1,
              background: colors.border,
              margin: '12px 0',
            }}
          />
        );

      case 'section':
        return (
          <div key={index} style={{ padding: '16px 16px 8px', marginTop: index > 0 ? 12 : 0 }}>
            <h4
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: colors.textSec,
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {item.label}
            </h4>
          </div>
        );

      case 'grid':
        return (
          <div
            key={index}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${item.columns || 2}, 1fr)`,
              gap: 8,
              padding: '0 16px',
              marginBottom: 16,
            }}
          >
            {item.items.map((gridItem, gridIndex) => {
              // Support onClick-only grid items (e.g., sandbox actions)
              if (!gridItem.href) {
                return (
                  <button
                    key={gridIndex}
                    onClick={() => {
                      if (gridItem.onClick) gridItem.onClick();
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '14px 12px',
                      background: theme === 'light' ? '#fff' : colors.cardBg,
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {gridItem.icon && (
                      <div style={{ width: 36, height: 36, marginBottom: 8 }}>{gridItem.icon}</div>
                    )}
                    <span>{gridItem.label}</span>
                  </button>
                );
              }
              return (
                <Link
                  key={gridIndex}
                  href={gridItem.href}
                  onClick={() => {
                    if (gridItem.onClick) gridItem.onClick();
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '14px 12px',
                    background: theme === 'light' ? '#fff' : colors.cardBg,
                    borderRadius: 8,
                    textDecoration: 'none',
                    border: `1px solid ${colors.border}`,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {gridItem.icon && (
                    <div style={{ width: 36, height: 36, marginBottom: 8 }}>{gridItem.icon}</div>
                  )}
                  <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>
                    {gridItem.label}
                  </span>
                </Link>
              );
            })}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10099,
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* Drawer */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'fixed',
          top: 0,
          [direction]: 0,
          bottom: 0,
          width: '100%',
          maxWidth: width,
          background: theme === 'light' ? colors.bg : colors.bg,
          boxShadow:
            direction === 'left' ? '2px 0 10px rgba(0,0,0,0.2)' : '-4px 0 20px rgba(0, 0, 0, 0.5)',
          zIndex: 10100,
          transform: isOpen
            ? 'translateX(0)'
            : direction === 'left'
              ? 'translateX(-100%)'
              : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          paddingBottom: 80,
          // CRITICAL: When closed, disable pointer/wheel event interception and
          // remove from hit-testing entirely. Without this, the off-screen fixed
          // drawer can still capture mouse wheel events on desktop browsers.
          pointerEvents: isOpen ? 'auto' : 'none',
          visibility: isOpen ? 'visible' : 'hidden',
        }}
      >
        {/* Close button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
          <button
            onClick={onClose}
            style={{
              background: theme === 'light' ? '#f0f0f0' : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              width: 32,
              height: 32,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 16,
              color: colors.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                theme === 'light' ? '#e0e0e0' : 'rgba(255, 255, 255, 0.15)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background =
                theme === 'light' ? '#f0f0f0' : 'rgba(255, 255, 255, 0.1)')
            }
            aria-label="Close Menu"
          >
            ✕
          </button>
        </div>

        {/* ── YOUR SHORTCUTS — ALWAYS FIRST ── */}
        {(() => {
          // Use external shortcuts prop if provided, otherwise fall back to ownedPages
          const shortcutItems =
            shortcuts && shortcuts.length > 0
              ? shortcuts
              : ownedPages.map((p) => ({
                  id: p.id,
                  name: p.name,
                  avatar_url: p.avatar_url,
                  href:
                    p.page_type === 'home_game'
                      ? `/hub/home-games/${p.slug || p.id}`
                      : p.page_type === 'club'
                        ? `/hub/commander`
                        : `/hub/social-pages/${p.id}`,
                  isArena: p.page_type === 'club',
                  page: p,
                }));
          if (shortcutItems.length === 0) return null;
          return (
            <div style={{ padding: '0 16px 16px' }}>
              <h4
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: colors.textSec,
                  marginBottom: 12,
                  marginTop: 4,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                Your Shortcuts
              </h4>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {shortcutItems.slice(0, 6).map((sc) => {
                  const imgSrc = sc.avatar_url || null;
                  const initial = (sc.name || '?').charAt(0).toUpperCase();
                  const innerContent = (
                    <>
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          margin: '0 auto',
                          borderRadius: 12,
                          background: imgSrc
                            ? `url(${imgSrc}) center/cover no-repeat`
                            : theme === 'light'
                              ? 'linear-gradient(135deg, #1e3a5f 0%, #0e2440 100%)'
                              : 'linear-gradient(135deg, #1e3a5f 0%, #0e2440 100%)',
                          border: `2px solid ${colors.border}`,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 700,
                          fontSize: 20,
                          flexShrink: 0,
                        }}
                      >
                        {!imgSrc && initial}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 6,
                          color: colors.textSec,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 64,
                        }}
                      >
                        {sc.name}
                      </div>
                    </>
                  );
                  if (sc.isArena) {
                    return (
                      <a
                        key={sc.id}
                        href={sc.href}
                        onClick={(e) => {
                          e.preventDefault();
                          if (sc.page) switchToClub(sc.page);
                          onClose();
                          window.location.href = sc.href;
                        }}
                        style={{
                          textAlign: 'center',
                          textDecoration: 'none',
                          color: 'inherit',
                          flexShrink: 0,
                          width: 64,
                        }}
                      >
                        {innerContent}
                      </a>
                    );
                  }
                  return (
                    <Link
                      key={sc.id}
                      href={sc.href}
                      onClick={() => {
                        if (sc.page) switchToClub(sc.page);
                        onClose();
                      }}
                      style={{
                        textAlign: 'center',
                        textDecoration: 'none',
                        color: 'inherit',
                        flexShrink: 0,
                        width: 64,
                      }}
                    >
                      {innerContent}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Active Identity Switcher */}
        {showProfile && activeUser && (
          <div
            style={{
              margin: '0 12px 16px',
              background: theme === 'light' ? colors.bg : colors.cardBg,
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              border: `1px solid ${colors.border}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderBottom: ownedPages.length > 0 ? `1px solid ${colors.border}` : 'none',
              }}
            >
              <img
                src={
                  isClubMode && clubPage
                    ? clubPage.avatar_url || '/default-avatar.png'
                    : activeUser.avatar || '/default-avatar.png'
                }
                alt={isClubMode && clubPage ? clubPage.name : activeUser.name}
                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 17,
                    color: isClubMode ? colors.blue : colors.text,
                  }}
                >
                  {isClubMode && clubPage ? clubPage.name : activeUser.name}
                </div>
                <Link
                  href={
                    isClubMode && clubPage ? `/hub/social-pages/${clubPage.id}` : `/hub/profile`
                  }
                  onClick={onClose}
                  style={{ fontSize: 13, color: colors.textSec, textDecoration: 'none' }}
                >
                  View Profile
                </Link>
              </div>
              {(() => {
                const unread = notifications.filter((n) => !n.read).length;
                if (!unread || isClubMode) return null;
                return (
                  <div
                    style={{
                      background: colors.blue,
                      color: 'white',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {unread > 9 ? '9+' : unread}
                  </div>
                );
              })()}
            </div>

            {/* Switch Options */}
            {ownedPages.length > 0 && (
              <div
                style={{
                  background: theme === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.2)',
                  padding: '8px 0',
                }}
              >
                <div
                  style={{
                    padding: '0 16px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: colors.textSec,
                    textTransform: 'uppercase',
                  }}
                >
                  Switch Account
                </div>

                {isClubMode && (
                  <div
                    onClick={() => {
                      switchToPersonal();
                      onClose();
                    }}
                    style={{
                      padding: '8px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = colors.hoverBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <img
                      src={activeUser.avatar || '/default-avatar.png'}
                      alt={activeUser.name}
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div style={{ fontSize: 14, fontWeight: 500, flex: 1, color: colors.text }}>
                      {activeUser.name} (Personal)
                    </div>
                  </div>
                )}

                {ownedPages.map((page) => {
                  if (isClubMode && clubPage?.id === page.id) return null;
                  return (
                    <div
                      key={page.id}
                      onClick={() => {
                        switchToClub(page);
                        onClose();
                        if (page.page_type === 'home_game') {
                          router.push(`/hub/home-games/${page.slug || page.id}`);
                        } else if (page.page_type === 'club') {
                          window.location.href = `/hub/commander`;
                        } else {
                          router.push(`/hub/social-pages/${page.id}`);
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.hoverBg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <img
                        src={page.avatar_url || '/default-avatar.png'}
                        alt={page.name}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          background: theme === 'light' ? '#eee' : '#333',
                        }}
                      />
                      <div style={{ fontSize: 14, fontWeight: 500, flex: 1, color: colors.text }}>
                        {page.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Profile Extras (e.g., Poker Resume) */}
        {profileExtras}

        {/* Menu Items */}
        <div style={{ flex: 1 }}>
          {menuItems.map((item, index) => renderMenuItem(item, index))}
          {/* Geeves AI Help Widget — Inline in menu */}
          <GeevesMenuWidget />
          <div style={{ padding: '8px 16px' }}>
            <ReportBugWidget />
          </div>
        </div>

        {/* Bottom Links */}
        {(() => {
          const finalLinks = [...bottomLinks];
          const hasSignOut = finalLinks.some(link => 
            link.label && (link.label.toLowerCase().includes('sign out') || link.label.toLowerCase().includes('log out'))
          );
          if (!hasSignOut) {
            finalLinks.push({
              label: 'Log Out',
              action: true,
              onClick: handleLogout,
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              ),
            });
          }
          if (finalLinks.length === 0) return null;
          return (
            <div
              style={{ padding: '0 16px', borderTop: `1px solid ${colors.border}`, paddingTop: 12, paddingBottom: 16 }}
            >
              {finalLinks.map((link, index) => {
                const commonStyle = {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  textDecoration: 'none',
                  color: colors.text,
                  borderTop: index > 0 ? `1px solid ${colors.border}` : 'none',
                  width: '100%',
                  fontSize: 15,
                  fontFamily: 'inherit',
                };

                if (link.action || link.openInviteModal) {
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        if (link.openInviteModal) {
                          setShowInviteModal(true);
                          return;
                        }
                        if (link.onClick) link.onClick();
                        onClose();
                      }}
                      style={{
                        ...commonStyle,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {link.icon && <div style={{ width: 24, height: 24 }}>{link.icon}</div>}
                      <span style={{ flex: 1, fontSize: 15, textAlign: 'left' }}>{link.label}</span>
                      <span style={{ color: colors.textSec }}>›</span>
                    </button>
                  );
                }

                return (
                  <Link key={index} href={link.href} onClick={onClose} style={commonStyle}>
                    {link.icon && <div style={{ width: 24, height: 24 }}>{link.icon}</div>}
                    <span style={{ flex: 1, fontSize: 15 }}>{link.label}</span>
                    <span style={{ color: colors.textSec }}>›</span>
                  </Link>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Invite Friends Modal */}
      <InviteFriendsModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        user={user}
      />

      {/* CSS for animations */}
      <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
    </>
  );
}

const styles = {
  switchContainer: {
    position: 'relative',
    display: 'inline-block',
    width: 60,
    height: 34,
    cursor: 'pointer',
  },
  switchInput: {
    opacity: 0,
    width: 0,
    height: 0,
  },
  switchSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 34,
    transition: 'background-color 0.2s ease',
    '::before': {
      position: 'absolute',
      content: '""',
      height: 26,
      width: 26,
      left: 4,
      bottom: 4,
      backgroundColor: 'white',
      borderRadius: '50%',
      transition: 'transform 0.2s ease',
    },
  },
};
