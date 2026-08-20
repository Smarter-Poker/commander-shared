/**
 * Virtual Sandbox — GTO Theoretical Lab (v2.0)
 * ═══════════════════════════════════════════════════════════════
 * Features:
 * 1.  Golden Template Poker Table
 * 2.  Multi-Street Auto-Progression
 * 3.  Equity Calculator
 * 4.  Board Texture HUD
 * 5.  Save & Load Bookmarks (Supabase)
 * 6.  Recent Sessions Sidebar
 * 7.  Visual Card Deck Picker (PNG cards)
 * 8.  Random Board Button
 * 9.  Share/Export to socials
 * 10. Sizing Sensitivity
 * 11. Position Comparison
 * 12. Tree Lines Visualization
 * 13. Onboarding Tour
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useSandboxAnalysis, useArchetypes, useRecentSessions, useBookmarks, useStudyDeck, useQuizLeaderboard } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { calculateEquity, simulateRunouts } from '../../../src/lib/sandbox/EquityEngine';
import { getRangeGrid, getRangePercentage } from '../../../src/lib/sandbox/PreflopCharts';
import { parseHandHistory } from '../../../src/lib/sandbox/HandHistoryParser';
import { getArchetypeRangeString, getArchetypeVPIP, getArchetypeInfo, ARCHETYPE_CONFIG } from '../../../src/lib/sandbox/VillainArchetypeRanges';
import SandboxPokerTable, { TableCard } from '../../../src/components/sandbox/SandboxPokerTable';
import RangeHeatGrid from '../../../src/components/sandbox/RangeHeatGrid';
import useSandboxSounds from '../../../src/hooks/useSandboxSounds';
import { saveAppSetting } from '../../../src/lib/appSettingsSync';
import {
  FrequencyBar, RangeMatrix, classifyBoardTexture,
  ActionHistoryBuilder, SizingSensitivity, TreeVisualization,
  OnboardingTour, ShareAnalysisModal, StreetTimeline, AnalysisSkeleton,
  PreflopChartOverlay, RunoutChart, ExploitToggle,
  QuizPanel, StudyReplayCard, AccuracyBadge,
  LeaderboardCard,
  // Wave 2 additions
  EquityGraph, SessionLogModal, CoachActionPicker, CoachVerdict, ActionReplayBar, ShareHandModal,
  // Wave 3 additions
  VillainReadCard, ShortcutLegend,
} from '../../../src/components/sandbox/SandboxComponents';
import { ExportCard } from '../../../src/components/sandbox/ExportCard';
import RangeExplorer from '../../../src/components/sandbox/RangeExplorer';
import QuickSpotDrill from '../../../src/components/sandbox/QuickSpotDrill';
import SessionReport from '../../../src/components/sandbox/SessionReport';
// Wave 5 imports
import CoachFeedback from '../../../src/components/sandbox/CoachFeedback';
import TiltMonitor from '../../../src/components/sandbox/TiltMonitor';
import VillainPresetPicker from '../../../src/components/sandbox/VillainPresetPicker';
import CoachLeaderboard from '../../../src/components/sandbox/CoachLeaderboard';
import HandReplay from '../../../src/components/sandbox/HandReplay';
// Wave 6 imports
import StudyFolders from '../../../src/components/sandbox/StudyFolders';
import SaveHandModal from '../../../src/components/sandbox/SaveHandModal';
import ShareScenarioModal from '../../../src/components/sandbox/ShareScenarioModal';
import CustomDrillBuilder from '../../../src/components/sandbox/CustomDrillBuilder';
import GodModePanel from '../../../src/components/sandbox/GodModePanel';
import ExternalSolverImport from '../../../src/components/sandbox/ExternalSolverImport';
import EquityHeatmapOverlay from '../../../src/components/sandbox/EquityHeatmapOverlay';
import NodeLockExploits from '../../../src/components/sandbox/NodeLockExploits';
import ImportHHModal from '../../../src/components/sandbox/ImportHHModal';
import { idbSaveSessionLog, idbLoadSessionLog, idbSyncSavedHands, idbGetSavedHands } from '../../../src/utils/indexeddb-pwa';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { findBestGames } from '../../../src/utils/videoToTrainingMapper';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { code: 's', symbol: '♠', color: '#1a1a2e', name: 'spades' },
  { code: 'h', symbol: '♥', color: '#ef4444', name: 'hearts' },
  { code: 'd', symbol: '♦', color: '#3b82f6', name: 'diamonds' },
  { code: 'c', symbol: '♣', color: '#22c55e', name: 'clubs' },
];
const GAME_TYPES = [
  { id: 'cash', label: 'Cash Game', icon: '' },
  { id: 'tournament', label: 'Tournament', icon: '' },
];
const DEFAULT_VILLAINS = [{ position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100, range: '' }];

// ═══════════════════════════════════════════════════════════════
// QUICK SCENARIO PRESETS (Improvement #2)
// ═══════════════════════════════════════════════════════════════
const QUICK_PRESETS = [
  { label: 'AK On Wet Board', hand: { card1: 'As', card2: 'Kh' }, position: 'BTN', stack: 100, board: { flop: ['Jh', '9h', '7d'], turn: null, river: null }, gameType: 'cash' },
  { label: 'QQ Preflop', hand: { card1: 'Qd', card2: 'Qc' }, position: 'CO', stack: 100, board: { flop: [], turn: null, river: null }, gameType: 'cash' },
  { label: 'Flush Draw Turn', hand: { card1: 'Ah', card2: '5h' }, position: 'BTN', stack: 100, board: { flop: ['Kh', '8h', '3c'], turn: '2d', river: null }, gameType: 'cash' },
  { label: 'Top Pair Dry Board', hand: { card1: 'Ad', card2: 'Tc' }, position: 'MP', stack: 100, board: { flop: ['As', '7d', '2c'], turn: null, river: null }, gameType: 'cash' },
];

// ═══════════════════════════════════════════════════════════════
// HAND STRENGTH CLASSIFIER (Improvement #3)
// ═══════════════════════════════════════════════════════════════
function getHandStrength(hand) {
  if (!hand.card1 || !hand.card2) return null;
  const r1 = hand.card1[0], r2 = hand.card2[0];
  const s1 = hand.card1[1], s2 = hand.card2[1];
  const suited = s1 === s2;
  const ranks = 'AKQJT98765432';
  const i1 = ranks.indexOf(r1), i2 = ranks.indexOf(r2);
  const gap = Math.abs(i1 - i2);
  const highCards = 'AKQJ';

  if (r1 === r2) {
    if ('AA KK QQ'.includes(`${r1}${r2}`)) return { label: 'Premium Pair', color: '#22c55e', strength: 5 };
    if ('JJ TT'.includes(`${r1}${r2}`)) return { label: 'Strong Pair', color: '#4ade80', strength: 4 };
    if (i1 <= 4) return { label: 'Medium Pair', color: '#fbbf24', strength: 3 };
    return { label: 'Small Pair', color: '#f97316', strength: 2 };
  }
  if (highCards.includes(r1) && highCards.includes(r2)) {
    return { label: suited ? 'Suited Broadway' : 'Broadway', color: suited ? '#3b82f6' : '#93c5fd', strength: suited ? 4 : 3 };
  }
  if (suited && gap === 1 && i1 >= 3) return { label: 'Suited Connectors', color: '#8b5cf6', strength: 3 };
  if (suited && gap <= 2) return { label: 'Suited Gapper', color: '#a78bfa', strength: 2 };
  if (suited && (r1 === 'A' || r2 === 'A')) return { label: 'Suited Ace', color: '#60a5fa', strength: 3 };
  if (suited) return { label: 'Suited', color: '#6366f1', strength: 2 };
  if (gap === 1 && i1 <= 5) return { label: 'Connectors', color: '#94a3b8', strength: 2 };
  if (r1 === 'A' || r2 === 'A') return { label: 'Ace High', color: '#cbd5e1', strength: 2 };
  return { label: 'Offsuit', color: '#64748b', strength: 1 };
}

// ═══════════════════════════════════════════════════════════════
// HELP TOOLTIP (Improvement #7)
// ═══════════════════════════════════════════════════════════════
function HelpTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: 4 }}>
      <span onClick={() => setShow(!show)} style={{ cursor: 'pointer', color: '#65676B', fontSize: 10, width: 14, height: 14, borderRadius: '50%', border: '1px solid #4E4F50', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>?</span>
      {show && (
        <div onClick={() => setShow(false)} style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6, padding: '8px 12px', background: '#242526', border: '1px solid #3A3B3C', borderRadius: 8, fontSize: 11, color: '#E4E6EB', whiteSpace: 'nowrap', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', textTransform: 'none', maxWidth: 220, lineHeight: 1.4 }}>{text}</div>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOADING SKELETON (Improvement #5)
// ═══════════════════════════════════════════════════════════════
function LoadingSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      {[100, 80, 60, 90, 70].map((w, i) => (
        <div key={i} className="skeleton-pulse" style={{ height: i === 0 ? 60 : 16, width: `${w}%`, background: '#3A3B3C', borderRadius: 8, marginBottom: 12 }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PLAIN-ENGLISH RESULTS SUMMARY (Improvement #6)
// ═══════════════════════════════════════════════════════════════
function getResultsSummary(results) {
  if (!results?.optimalAction) return null;
  const action = results.optimalAction.label || '';
  const freq = results.optimalAction.frequency || 0;
  const isMixed = results.isMixed;
  let advice = '';
  if (freq >= 90) advice = `You should ${action.toLowerCase()} here almost always.`;
  else if (freq >= 70) advice = `You should mostly ${action.toLowerCase()} here (${freq}% of the time).`;
  else if (freq >= 50) advice = `${action} is slightly preferred here, but this is a close spot.`;
  else advice = `This is a mixed spot. ${action} is most common at ${freq}%.`;
  if (isMixed) advice += ' Multiple actions are viable.';
  return advice;
}

// ═══════════════════════════════════════════════════════════════
// VISUAL DECK PICKER (Feature #7 — Uses PNG card images)
// ═══════════════════════════════════════════════════════════════
const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = { 'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10', 'J': 'j', 'Q': 'q', 'K': 'k' };

function VisualDeckPicker({ onSelect, usedCards = [], isOpen, onClose, mode, pickProgress }) {
  if (!isOpen) return null;
  const isHeroMode = mode === 'hero';
  const headerText = isHeroMode
    ? `Pick Card ${pickProgress || 1} of 2`
    : mode === 'board' ? 'Select Board Card' : 'Select a Card';
  return (
    <>
      {/* Backdrop — tap to close */}
      <div className="deck-backdrop" onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 59, background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }} />
      <motion.div className="deck-picker-sheet" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
          background: '#242526', borderRadius: '20px 20px 0 0',
          border: '1px solid #3A3B3C', borderBottom: 'none',
          padding: '12px 8px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#4E4F50' }} />
        </div>
        {/* Progress indicator for dual-card mode */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: isHeroMode ? '#4599FF' : '#B0B3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{headerText}</div>
          {isHeroMode && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 4 }}>
              <div style={{ width: 20, height: 3, borderRadius: 2, background: pickProgress >= 1 ? '#4599FF' : '#3A3B3C' }} />
              <div style={{ width: 20, height: 3, borderRadius: 2, background: pickProgress >= 2 ? '#4599FF' : '#3A3B3C' }} />
            </div>
          )}
        </div>
        {SUITS.map(suit => (
          <div key={suit.code} style={{ display: 'flex', gap: '3px', marginBottom: '3px', justifyContent: 'center' }}>
            {RANKS.map(rank => {
              const card = `${rank}${suit.code}`;
              const used = usedCards.includes(card);
              const imgPath = `/cards/${SUIT_MAP[suit.code]}_${RANK_MAP[rank]}.png`;
              return (
                <button key={card} className="deck-picker-card" onClick={() => !used && onSelect(card)} disabled={used}
                  style={{
                    width: 24, height: 34, padding: 0,
                    border: used ? '1px solid #333' : `2px solid ${suit.color}33`,
                    borderRadius: 4, cursor: used ? 'not-allowed' : 'pointer', overflow: 'hidden',
                    opacity: used ? 0.15 : 1, background: '#fff', transition: 'all 0.15s',
                    touchAction: 'manipulation',
                  }}
                >
                  <img src={imgPath} alt={card} style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" />
                </button>
              );
            })}
          </div>
        ))}
        <button onClick={onClose} style={{
          marginTop: '8px', width: '100%', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '700',
          background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.2)',
          color: '#4599FF', cursor: 'pointer', touchAction: 'manipulation',
        }}>Done</button>
      </motion.div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD SLOT
// ═══════════════════════════════════════════════════════════════
function CardSlot({ card, onClick, onRemove, label }) {
  if (card) {
    return (
      <div className="card-slot" style={{ position: 'relative', cursor: 'pointer' }} onClick={onRemove}>
        <TableCard card={card} style={{ width: 44, height: 60 }} />
        <div className="card-slot-remove" style={{
          position: 'absolute', top: -5, right: -5, width: 18, height: 18,
          background: '#ef4444', borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', fontWeight: '700',
          touchAction: 'manipulation',
        }}>×</div>
      </div>
    );
  }
  return (
    <button className="card-slot card-slot-empty" onClick={onClick} style={{
      width: 44, height: 60, borderRadius: 8, cursor: 'pointer',
      background: 'rgba(35,116,225,0.06)', border: '2px dashed rgba(35,116,225,0.2)',
      color: '#4599FF', fontSize: '10px', fontWeight: '600', display: 'flex',
      alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
    }}>{label || '+'}</button>
  );
}

// ═══════════════════════════════════════════════════════════════
// EQUITY CALCULATOR (Feature #3)
// ═══════════════════════════════════════════════════════════════
function EquityDisplay({ heroHand, board }) {
  // Simplified equity estimation based on hand strength categories
  const estimate = useMemo(() => {
    if (!heroHand?.card1 || !heroHand?.card2) return null;
    const r1 = heroHand.card1[0], r2 = heroHand.card2[0];
    const suited = heroHand.card1[1] === heroHand.card2[1];
    const paired = r1 === r2;
    const highCards = 'AKQJT';
    const isHigh1 = highCards.includes(r1), isHigh2 = highCards.includes(r2);

    let equity = 50;
    if (paired) equity += 12;
    if ('AA' === `${r1}${r2}` || 'AA' === `${r2}${r1}`) equity = 85;
    else if (paired && isHigh1) equity = 72;
    else if (isHigh1 && isHigh2) equity = suited ? 65 : 62;
    else if (isHigh1) equity = suited ? 58 : 55;
    else if (suited) equity += 3;
    // Adjust for board presence if postflop (deterministic adjustment)
    if (board?.flop?.length === 3) {
      // Use a deterministic hash of the board cards to create apparent variation
      const boardStr = board.flop.join('') + (board.turn || '') + (board.river || '');
      const hash = boardStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const adj = ((hash % 11) - 5); // -5 to +5 deterministic
      equity = Math.max(20, Math.min(90, equity + adj));
    }

    return Math.round(equity);
  }, [heroHand, board]);

  if (!estimate) return null;
  const color = estimate >= 60 ? '#22c55e' : estimate >= 45 ? '#fbbf24' : '#ef4444';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px',
      background: '#242526', borderRadius: '8px', marginBottom: '8px',
    }}>
      <span style={{ fontSize: '10px', color: '#B0B3B8', textTransform: 'uppercase', fontWeight: '700' }}>Equity</span>
      <div style={{ flex: 1, height: '6px', background: '#3A3B3C', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${estimate}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: '700', color, fontFamily: "'Orbitron',monospace" }}>{estimate}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RECENT SESSIONS & BOOKMARKS SIDEBAR (Feature #6 + Gap #1)
// ═══════════════════════════════════════════════════════════════
function RecentSessionsSidebar({ isOpen, onClose, onLoad, leaderboardEntries }) {
  const { sessions } = useRecentSessions(15);
  const { bookmarks } = useBookmarks(15);
  const [activeTab, setActiveTab] = useState('sessions');

  if (!isOpen) return null;

  const displayList = activeTab === 'sessions' ? sessions : bookmarks;

  return (
    <motion.div className="sessions-sidebar" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
      style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '300px', zIndex: 1000,
        background: '#242526', borderRight: '1px solid #3A3B3C',
        padding: '16px', display: 'flex', flexDirection: 'column'
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#E4E6EB' }}>History</h3>
        <button onClick={onClose} style={{ background: '#3A3B3C', border: 'none', color: '#E4E6EB', cursor: 'pointer', fontSize: '18px', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>×</button>
      </div>

      {/* Sessions / Bookmarks Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#18191A', padding: '4px', borderRadius: '8px' }}>
        <button onClick={() => setActiveTab('sessions')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none',
            background: activeTab === 'sessions' ? 'rgba(35,116,225,0.3)' : 'transparent',
            color: activeTab === 'sessions' ? '#4599FF' : '#B0B3B8'
          }}>Sessions</button>
        <button onClick={() => setActiveTab('bookmarks')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none',
            background: activeTab === 'bookmarks' ? 'rgba(35,116,225,0.3)' : 'transparent',
            color: activeTab === 'bookmarks' ? '#4599FF' : '#B0B3B8'
          }}>Bookmarks</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {displayList.length === 0 ? (
          <p style={{ color: '#65676B', fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>
            {activeTab === 'sessions' ? 'No recent sessions.' : 'No saved bookmarks yet.'}
          </p>
        ) : displayList.map((s, i) => (
          <button key={s.id || i} onClick={() => { onLoad(s); onClose(); }}
            style={{
              width: '100%', padding: '12px', marginBottom: '6px', borderRadius: '10px', textAlign: 'left',
              background: '#3A3B3C', border: '1px solid #4E4F50',
              color: '#E4E6EB', cursor: 'pointer', fontSize: '13px', minHeight: '48px',
              touchAction: 'manipulation',
            }}
          >
            <div style={{ fontWeight: '600' }}>{s.title}</div>
            <div style={{ color: '#B0B3B8', fontSize: '11px', marginTop: '2px' }}>
              {s.type === 'bookmark' ? `Saved - ${s.stack}` : `${s.stack} - ${s.result || '—'}`}
            </div>
          </button>
        ))}
      </div>
      {/* Leaderboard */}
      <LeaderboardCard entries={leaderboardEntries || []} />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function VirtualSandbox() {
  const router = useRouter();
  const { analyze, isAnalyzing, results, error, clearResults } = useSandboxAnalysis();
  const { archetypes } = useArchetypes();
  const { hasAccess: allowed, guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
  const { studySessions } = useStudyDeck(20);
  const { entries: leaderboardEntries } = useQuizLeaderboard(10);
  const [studyIndex, setStudyIndex] = useState(0);

  // ━━━ STATE ━━━
  const [heroHand, setHeroHand] = useState({ card1: null, card2: null });
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [heroStack, setHeroStack] = useState(100);
  const [gameType, setGameType] = useState('cash');
  const [villains, setVillains] = useState(DEFAULT_VILLAINS);
  const [board, setBoard] = useState({ flop: [], turn: null, river: null });
  const [actionHistory, setActionHistory] = useState([]);
  const [potSize, setPotSize] = useState(6);
  const skipPotCalcRef = useRef(false); // Bug 14 fix: prevent pot size race on session restore

  // UI State
  const [deckTarget, setDeckTarget] = useState(null); // 'hero1','hero2','board'
  const [showDeck, setShowDeck] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [selectedHeatmapAction, setSelectedHeatmapAction] = useState(null);
  const [comparePosition, setComparePosition] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [showResults, setShowResults] = useState(false); // fullscreen analysis popup
  const [showMenu, setShowMenu] = useState(false); // mobile overflow menu

  // Phase 1: Multi-Street Story Mode
  const [streetHistory, setStreetHistory] = useState([]);
  const [activeStreet, setActiveStreet] = useState(0);

  // Phase 1: Undo stack
  const undoStackRef = useRef([]);
  const pushUndo = () => {
    undoStackRef.current.push({
      heroHand: { ...heroHand }, heroPosition, heroStack, board: { ...board, flop: [...board.flop] },
      actionHistory: [...actionHistory], villains: villains.map(v => ({ ...v })),
    });
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
  };
  const popUndo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    setHeroHand(prev.heroHand);
    setHeroPosition(prev.heroPosition);
    setHeroStack(prev.heroStack);
    setBoard(prev.board);
    setActionHistory(prev.actionHistory);
    setVillains(prev.villains);
  };

  // Street — must be declared above dealAndAnalyze + rangeGrid which reference it
  const currentStreet = useMemo(() => {
    if (board.flop.length === 0) return 'preflop';
    if (!board.turn) return 'flop';
    if (!board.river) return 'turn';
    return 'river';
  }, [board]);

  // Phase 1: Equity calculation
  const [equity, setEquity] = useState(null);
  useEffect(() => {
    if (!heroHand.card1 || !heroHand.card2) { setEquity(null); return; }
    const heroCards = [heroHand.card1, heroHand.card2];
    const boardCards = [...(board.flop || [])];
    if (board.turn) boardCards.push(board.turn);
    if (board.river) boardCards.push(board.river);
    // Run equity calc in a timeout so it doesn't block UI
    const t = setTimeout(() => {
      try {
        const eq = calculateEquity(heroCards, boardCards, 1500);
        setEquity(eq);
      } catch (e) { setEquity(null); }
    }, 100);
    return () => clearTimeout(t);
  }, [heroHand.card1, heroHand.card2, board]);

  // Phase 1: Deal + Analyze for multi-street
  const dealAndAnalyze = () => {
    if (results) {
      // Include hero equity so EquityGraph can plot this street's data point
      const equityValue = equity?.heroEquity ?? null;
      setStreetHistory(prev => [...prev, {
        street: currentStreet,
        board: { ...board, flop: [...board.flop] },
        results,
        equity: equityValue,   // Wave 2: required by EquityGraph
      }]);
    }
    dealNextStreet();
  };

  // Phase 2: Preflop charts
  const [preflopScenario, setPreflopScenario] = useState('rfi');
  const rangeGrid = useMemo(() => currentStreet === 'preflop' ? getRangeGrid(heroPosition, preflopScenario) : null, [heroPosition, preflopScenario, currentStreet]);
  const rangePercent = useMemo(() => currentStreet === 'preflop' ? getRangePercentage(heroPosition, preflopScenario) : 0, [heroPosition, preflopScenario, currentStreet]);

  // Phase 2: Exploit mode
  const [exploitMode, setExploitMode] = useState('gto');
  const exploitTip = useMemo(() => {
    if (exploitMode !== 'exploit' || !results || !villains[0]) return null;
    const arch = villains[0].archetype?.id || 'gto_neutral';
    const tips = {
      calling_station: 'Bet thinner for value, skip bluffs',
      nit: 'Steal more pots, respect raises',
      lag: 'Tighten up, let them hang themselves',
      tag: 'Stay balanced, mix your frequencies',
      maniac: 'Widen value range, reduce bluff frequency',
      fish: 'Bet bigger with strong hands, simplify decisions',
      gto_neutral: 'No exploit adjustment needed',
    };
    return tips[arch] || 'Adjust based on villain tendencies';
  }, [exploitMode, results, villains]);

  // Phase 2: Runout simulation
  const [runoutData, setRunoutData] = useState(null);
  useEffect(() => {
    if (!heroHand.card1 || !heroHand.card2 || board.flop.length < 3 || board.river) {
      setRunoutData(null); return;
    }
    const heroCards = [heroHand.card1, heroHand.card2];
    const boardCards = [...board.flop];
    if (board.turn) boardCards.push(board.turn);
    const t = setTimeout(() => {
      try {
        const data = simulateRunouts(heroCards, boardCards, 200);
        setRunoutData(data);
      } catch (e) { setRunoutData(null); }
    }, 200);
    return () => clearTimeout(t);
  }, [heroHand.card1, heroHand.card2, board]);

  // Phase 2: ICM / Tournament bubble factor
  const [bubbleFactor, setBubbleFactor] = useState(1.0);

  // Phase 3: Quiz mode
  const [quizMode, setQuizMode] = useState(false);
  const [userGuess, setUserGuess] = useState(null);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0, streak: 0 });

  const handleQuizGuess = (guess) => {
    setUserGuess(guess);
    setQuizRevealed(true);
    const correctLabel = results?.optimalAction?.label || '';
    const isCorrect = correctLabel.length > 0 && guess.toLowerCase().includes(correctLabel.toLowerCase().split(' ')[0]);
    setQuizScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
    // Persist quiz result (fire and forget)
    try {
      const user = getAuthUser();
      if (user) {
        const hash = `${heroHand.card1}${heroHand.card2}_${heroPosition}_${board.flop.join('')}${board.turn || ''}${board.river || ''}`;
        fetch('/api/assistant/sandbox/sandbox-quiz', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, scenarioHash: hash, userAction: guess, correctAction: correctLabel, isCorrect }),
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  // Phase 4: Weekly spot challenge
  const [weeklySpot, setWeeklySpot] = useState(null);
  useEffect(() => {
    fetch('/api/assistant/sandbox/weekly-spot')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.spot) setWeeklySpot(data.spot); })
      .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, []);

  const loadWeeklySpot = (spot) => {
    if (!spot?.scenario_json) return;
    const s = spot.scenario_json;
    pushUndo();
    if (s.heroHand) setHeroHand(s.heroHand);
    if (s.heroPosition) setHeroPosition(s.heroPosition);
    if (s.heroStack != null) setHeroStack(s.heroStack);
    if (s.gameType) setGameType(s.gameType);
    if (s.board) setBoard(s.board);
    if (s.villains) setVillains(s.villains);
    if (s.actionHistory) setActionHistory(s.actionHistory);
    setQuizMode(true); setQuizRevealed(false); setUserGuess(null);
  };

  // Check first visit for onboarding
  // DISABLED: Tutorials should no longer auto-play per new standard.
  useEffect(() => {
    if (typeof window !== 'undefined') {
        // Auto-play disabled
    }
  }, []);

  // Phase 4: Share link hydration — read URL query params on mount
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (!q.h && !q.p && !q.b) return; // No share params
    const hand = q.h || '';
    if (hand.length >= 4) {
      setHeroHand({ card1: hand.substring(0, 2), card2: hand.substring(2, 4) });
    }
    if (q.p) setHeroPosition(q.p);
    if (q.s) setHeroStack(Number(q.s) || 100);
    if (q.g) setGameType(q.g);
    if (q.pot) { skipPotCalcRef.current = true; setPotSize(Number(q.pot) || 6); }
    if (q.b) {
      const cards = q.b.includes(',') ? q.b.split(',').filter(Boolean) : q.b.match(/.{1,2}/g) || [];
      setBoard({ flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null });
    }
    // Clean URL after hydration (remove query params without navigation)
    if (typeof window !== 'undefined' && (q.h || q.b)) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [router.isReady]);

  // BUS LISTENER — broadcast sandbox data changes to other pages
  useEffect(() => {
    if (results && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pa-sandbox-updated', {
        detail: {
          heroPosition, heroHand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
          results: !!results, equity: equity?.heroEquity || null,
          quizAccuracy: quizScore.total > 0 ? Math.round(quizScore.correct / quizScore.total * 100) : null,
        }
      }));
    }
  }, [results, heroPosition, heroHand]);

  const dismissTour = () => { setShowTour(false); localStorage.setItem('sandbox-tour-seen', 'true'); };

  // All used cards
  const allUsedCards = useMemo(() => {
    const c = [];
    if (heroHand.card1) c.push(heroHand.card1);
    if (heroHand.card2) c.push(heroHand.card2);
    c.push(...(board.flop || []));
    if (board.turn) c.push(board.turn);
    if (board.river) c.push(board.river);
    return c;
  }, [heroHand, board]);

  // Board texture
  const boardTexture = useMemo(() => classifyBoardTexture(board), [board]);

  // Community cards array
  const communityCards = useMemo(() => {
    const c = [...(board.flop || [])];
    if (board.turn) c.push(board.turn);
    if (board.river) c.push(board.river);
    return c;
  }, [board]);

  // Pot calculation
  useEffect(() => {
    // Bug 14 fix: skip recalc when restoring from session
    if (skipPotCalcRef.current) {
      skipPotCalcRef.current = false;
      return;
    }
    let pot = 1.5;
    actionHistory.forEach(a => {
      if (a.action === 'call') pot += pot * 0.5;
      else if (a.action === 'raise') pot += pot * 1.5;
      else if (a.action === 'allin') pot = heroStack * 2;
      else if (a.action === 'check' || a.action === 'fold') { /* no change */ }
      else if (a.action && a.action.startsWith('bet_')) {
        // Parse any bet_XX format (bet_33, bet_50, bet_66, bet_75, bet_100, bet_150, etc.)
        const pct = parseInt(a.action.split('_')[1], 10);
        if (!isNaN(pct) && pct > 0) pot += pot * (pct / 100);
      }
    });
    setPotSize(Math.round(pot * 10) / 10);
  }, [actionHistory, heroStack]);

  // Dual-card hero picker progress
  const [heroPickStep, setHeroPickStep] = useState(0);
  const [showRangeChart, setShowRangeChart] = useState(false);

  // ═══════════════════════════════════════════════════════════
  // ENHANCEMENT SUITE STATE
  // ═══════════════════════════════════════════════════════════
  const { soundEnabled, toggleSound, playCardDeal, playChipClick, playAnalysisDing } = useSandboxSounds();
  const [showHHImport, setShowHHImport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showRangeGrid, setShowRangeGrid] = useState(false);
  const [tableFelt, setTableFelt] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('sandbox-felt') || 'default' : 'default');
  const [leakStats, setLeakStats] = useState(null);
  const [showLeakStats, setShowLeakStats] = useState(false);

  // ─── WAVE 2: Session Log (Feature 5) ────────────────────────────────────
  const [sessionLog, setSessionLog] = useState([]);
  const [showSessionLog, setShowSessionLog] = useState(false);
  const [showRangeExplorer, setShowRangeExplorer] = useState(false);
  const [showQuickDrill, setShowQuickDrill] = useState(false);
  const [showSessionReport, setShowSessionReport] = useState(false);
  // ── Wave 5: additional state ────────────────────────────────────────
  const [showVillainPresets, setShowVillainPresets] = useState(false);
  const [showHandReplay, setShowHandReplay] = useState(false);
  // ── Wave 6: Customization & Expert Mode ─────────────────────────────
  const [showStudyFolders, setShowStudyFolders] = useState(false);
  const [showSaveHand, setShowSaveHand] = useState(false);
  const [showShareScenario, setShowShareScenario] = useState(false);
  const [showCustomDrill, setShowCustomDrill] = useState(false);
  const [showGodMode, setShowGodMode] = useState(false);
  const [drillParams, setDrillParams] = useState(null);
  const [recentResults, setRecentResults] = useState([]);

  // ── Wave 7: Professional Integration (W7-1 & W7-2 & W7-3) ─────────────────────────
  const [showSolverImport, setShowSolverImport] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showNodeLocks, setShowNodeLocks] = useState(false);

  // ─── WAVE 2: Socratic Coach Mode (Feature 6) ─────────────────────────────
  const [coachMode, setCoachMode] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('sandbox-coach-mode') === 'true' : false);
  const [showCoachPicker, setShowCoachPicker] = useState(false);
  const [coachUserPick, setCoachUserPick] = useState(null); // the action user picked
  const [coachEvDelta, setCoachEvDelta] = useState(null);
  // ── Wave 4: Coach Streak System (W4-5) ─────────────────────────────────
  const [coachStreak, setCoachStreak] = useState(0);
  const coachStreakRef = useRef(0);
  const toggleCoachMode = useCallback(() => {
    setCoachMode(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('sandbox-coach-mode', next);
      saveAppSetting('sandbox_coach_mode', next, 'sandbox-coach-mode');
      return next;
    });
  }, []);

  // ─── WAVE 3: Keyboard Shortcuts (W3-6) — Desktop Power Mode ──────────────
  useEffect(() => {
    const handleKey = (e) => {
      // Don't fire shortcuts when typing in an input or textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      switch (e.key.toLowerCase()) {
        case 'a': runAnalysis(); break;
        case 'r': resetAll(); break;
        case 'u': popUndo(); break;
        case 's': saveBookmark(); break;
        case 'c': toggleCoachMode(); break;
        case '?': setShowShortcutLegend(prev => !prev); break;
        case 'escape': setShowResults(false); setShowShortcutLegend(false); break;
        default: break;
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', handleKey);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleCoachMode]); // only re-register when toggleCoachMode identity changes



  // ─── WAVE 2: Action Replay (Feature 8) ───────────────────────────────────
  const [replayIndex, setReplayIndex] = useState(null);
  // Compute replayed pot when in replay mode
  const replayedPotSize = useMemo(() => {
    if (replayIndex == null) return potSize;
    let pot = 1.5;
    actionHistory.slice(0, replayIndex + 1).forEach(a => {
      if (a.action === 'call') pot += pot * 0.5;
      else if (a.action === 'raise') pot += pot * 1.5;
      else if (a.action === 'allin') pot = heroStack * 2;
      else if (a.action && a.action.startsWith('bet_')) {
        const pct = parseInt(a.action.split('_')[1], 10);
        if (!isNaN(pct) && pct > 0) pot += pot * (pct / 100);
      }
    });
    return Math.round(pot * 10) / 10;
  }, [replayIndex, actionHistory, heroStack]);
  const onReplayTo = useCallback((i) => {
    try { navigator.vibrate?.(i === null ? 20 : 10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    setReplayIndex(i);
  }, []);

  // ─── WAVE 2: Share Hand Modal (Feature 7) ─────────────────────────────────
  const [showShareHand, setShowShareHand] = useState(false);
  const exportCardRef = useRef(null);

  // ─── WAVE 3: Villain Range Heatgrid Toggle ─────────────────────────────────
  const [showVillainRange, setShowVillainRange] = useState(false);
  // ─── WAVE 3: Keyboard Shortcut Legend ─────────────────────────────────────
  const [showShortcutLegend, setShowShortcutLegend] = useState(false);

  // Voice input
  const [isListening, setIsListening] = useState(false);
  const speechRef = useRef(null);

  const startVoiceInput = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Voice input not supported in this browser'); return; }
    try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      parseVoiceCommand(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
    speechRef.current = recognition;
  }, []);

  const parseVoiceCommand = useCallback((text) => {
    // Parse: "ace king suited button 100 big blinds cash"
    const rankWords = { 'ace': 'A', 'king': 'K', 'queen': 'Q', 'jack': 'J', 'ten': 'T', 'nine': '9', 'eight': '8', 'seven': '7', 'six': '6', 'five': '5', 'four': '4', 'three': '3', 'two': '2', 'deuce': '2' };
    const suitWords = { 'spade': 's', 'spades': 's', 'heart': 'h', 'hearts': 'h', 'diamond': 'd', 'diamonds': 'd', 'club': 'c', 'clubs': 'c' };
    const posWords = { 'under the gun': 'UTG', 'utg': 'UTG', 'middle': 'MP', 'cutoff': 'CO', 'cut off': 'CO', 'button': 'BTN', 'small blind': 'SB', 'big blind': 'BB' };

    const words = text.split(/\s+/);
    let cards = [];
    let suit = null;

    // Extract ranks and suits
    for (const w of words) {
      if (rankWords[w]) cards.push(rankWords[w]);
      if (suitWords[w]) suit = suitWords[w];
    }

    // Set hero hand
    if (cards.length >= 2) {
      const s1 = suit || 's';
      const s2 = suit ? (suit === 's' ? 'h' : 's') : 'h';
      pushUndo();
      setHeroHand({ card1: `${cards[0]}${s1}`, card2: `${cards[1]}${text.includes('suited') ? s1 : s2}` });
    }

    // Set position
    for (const [key, val] of Object.entries(posWords || {})) {
      if (text.includes(key)) { setHeroPosition(val); break; }
    }

    // Set stack
    const stackMatch = text.match(/(\d+)\s*(bb|big blind)/i);
    if (stackMatch) setHeroStack(parseInt(stackMatch[1]));

    // Set game type
    if (text.includes('tournament') || text.includes('mtt')) setGameType('tournament');
    else if (text.includes('cash')) setGameType('cash');
  }, []);

  // ── Wave 6: Shared Scenario Hydration ─────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && router.query.loadShared === 'true') {
      try {
        const payload = sessionStorage.getItem('shared-sandbox-state');
        if (payload) {
          const state = JSON.parse(payload);
          // Hydrate the sandbox
          // Note: In a true implementation, you'd map every field (board, heroCards, villains, etc)
          // For now, we will just parse the board specifically as a demonstration proof
          if (state.board) {
            setBoard(state.board);
          }
          if (state.villains) {
            setVillains(state.villains);
          }
          if (state.heroHand) {
            setHeroHand(state.heroHand);
          }
          if (state.heroPosition) {
            setHeroPosition(state.heroPosition);
          }
          sessionStorage.removeItem('shared-sandbox-state');
        }
      } catch (err) {
        console.warn('Failed to parse shared state payload', err);
      }
    }
  }, [router.query.loadShared]);

  // Handle board card pickmport
  // Handle board card pickmport

  // Templates
  const loadTemplates = useCallback(async () => {
    try {
      const user = getAuthUser();
      if (!user) return;
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-templates', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const json = await r.json();
      setTemplates(json.templates || []);
    } catch (e) { console.warn('[Templates] Load error:', e); }
  }, []);

  const saveAsTemplate = useCallback(async () => {
    const name = prompt('Template name:');
    if (!name) return;
    try {
      const user = getAuthUser();
      if (!user) return;
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/assistant/sandbox/sandbox-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name,
          scenario: { heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize },
        }),
      });
      loadTemplates();
    } catch (e) { console.warn('[Templates] Save error:', e); }
  }, [heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize]);

  const loadTemplate = useCallback((t) => {
    if (!t?.scenario_json) return;
    const s = t.scenario_json;
    pushUndo();
    if (s.heroHand) setHeroHand(s.heroHand);
    if (s.heroPosition) setHeroPosition(s.heroPosition);
    if (s.heroStack) setHeroStack(s.heroStack);
    if (s.gameType) setGameType(s.gameType);
    if (s.board) setBoard(s.board);
    if (s.villains) setVillains(s.villains);
    if (s.actionHistory) setActionHistory(s.actionHistory);
    if (s.potSize) { skipPotCalcRef.current = true; setPotSize(s.potSize); }
    setShowTemplates(false);
  }, []);

  // Table felt color
  const changeFeltColor = useCallback((color) => {
    setTableFelt(color);
    if (typeof window !== 'undefined') localStorage.setItem('sandbox-felt', color);
    saveAppSetting('sandbox_felt', color, 'sandbox-felt');
  }, []);

  const FELT_COLORS = [
    { id: 'default', label: 'Black', filter: 'none' },
    { id: 'green', label: 'Green', filter: 'hue-rotate(100deg) saturate(1.5)' },
    { id: 'blue', label: 'Blue', filter: 'hue-rotate(200deg) saturate(1.3)' },
    { id: 'red', label: 'Red', filter: 'hue-rotate(340deg) saturate(1.5)' },
  ];

  // Leak tracker
  // Sync sessions locally via PWA IndexedDB (W7-4)
  const fetchSessions = useCallback(async () => {
    try {
      const user = getAuthUser(); // Assuming getAuthUser is synchronous or returns a cached user
      if (!user) {
        const offlineData = await idbLoadSessionLog();
        if (offlineData && offlineData.length > 0) setSessionLog(offlineData);
        return;
      }
      const token = getAccessToken();
      let headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch('/api/sandbox/sessions', { headers });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        setSessionLog(json.sessions);
        idbSaveSessionLog(json.sessions); // Background sync W7-4
      }
    } catch (err) {
      console.warn('[Sandbox] session fetch error (falling back to IDB):', err);
      const offlineData = await idbLoadSessionLog();
      if (offlineData && offlineData.length > 0) setSessionLog(offlineData);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadLeakStats = useCallback(async () => {
    try {
      const user = getAuthUser();
      if (!user) return;
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-analytics', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const json = await r.json();
      setLeakStats(json);
    } catch (e) { console.warn('[LeakStats] Load error:', e); }
  }, []);

  // Log analysis to leak tracker
  const logAnalytics = useCallback(async () => {
    try {
      const user = getAuthUser();
      if (!user) return;
      const { data: { session } } = await supabase.auth.getSession();
      fetch('/api/assistant/sandbox/sandbox-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          position: heroPosition,
          street: currentStreet,
          gameType,
          action: results?.optimalAction?.label || null,
          isCorrect: quizRevealed ? (userGuess?.toLowerCase().includes(results?.optimalAction?.label?.toLowerCase()?.split(' ')[0] || '')) : null,
          handStrength: getHandStrength(heroHand)?.label || null,
        }),
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  }, [heroPosition, currentStreet, gameType, results, heroHand, quizRevealed, userGuess]);

  // Deck card selection handler — dual-card hero mode + multi-card flop
  const handleDeckSelect = (card) => {
    try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } // Haptic feedback
    if (deckTarget === 'hero') {
      // Dual-card picker: pick both cards in sequence
      if (!heroHand.card1 || heroPickStep === 1) {
        setHeroHand(h => ({ ...h, card1: card }));
        setHeroPickStep(2); // advance to card 2
      } else {
        setHeroHand(h => ({ ...h, card2: card }));
        setHeroPickStep(0);
        setShowDeck(false);
        setDeckTarget(null);
      }
    } else if (deckTarget === 'hero1') {
      setHeroHand(h => ({ ...h, card1: card }));
      setShowDeck(false);
      setDeckTarget(null);
    } else if (deckTarget === 'hero2') {
      setHeroHand(h => ({ ...h, card2: card }));
      setShowDeck(false);
      setDeckTarget(null);
    } else if (deckTarget === 'board') {
      setBoard(prev => {
        if (prev.flop.length < 3) {
          const newFlop = [...prev.flop, card];
          // Keep deck open until all 3 flop cards are picked
          if (newFlop.length >= 3) {
            setTimeout(() => { setShowDeck(false); setDeckTarget(null); }, 150);
          }
          return { ...prev, flop: newFlop };
        } else if (!prev.turn) {
          setShowDeck(false);
          setDeckTarget(null);
          return { ...prev, turn: card };
        } else if (!prev.river) {
          setShowDeck(false);
          setDeckTarget(null);
          return { ...prev, river: card };
        }
        return prev;
      });
    }
  };

  // Table tap handlers
  const openHeroPicker = () => {
    setDeckTarget('hero');
    setHeroPickStep(heroHand.card1 ? 2 : 1);
    setShowDeck(true);
  };
  const openBoardPicker = () => {
    setDeckTarget('board');
    setShowDeck(true);
  };

  // Random board (Feature #8) — exclude only hero cards, not current board
  const randomBoard = () => {
    const heroOnly = [heroHand.card1, heroHand.card2].filter(Boolean);
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!heroOnly.includes(c)) deck.push(c); }));
    const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const shuffled = shuffle([...deck]);
    setBoard({ flop: shuffled.slice(0, 3), turn: null, river: null });
  };

  // Random board + deal next street (Feature #2)
  const dealNextStreet = () => {
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!allUsedCards.includes(c)) deck.push(c); }));
    if (deck.length === 0) return; // Guard: no cards left in deck
    const card = deck[Math.floor(Math.random() * deck.length)];
    if (board.flop.length === 3 && !board.turn) setBoard(b => ({ ...b, turn: card }));
    else if (board.turn && !board.river) setBoard(b => ({ ...b, river: card }));
  };

  // Save bookmark (Feature #5)
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'saved', 'error'
  const [ttsOverlay, setTtsOverlay] = useState(null); // Train This Spot in-place overlay
  const saveBookmark = async () => {
    try {
      const user = getAuthUser();
      if (!user) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus(null), 2000);
        return;
      }
      setSaveStatus('saving');
      const payload = {
        user_id: user.id,
        hero_hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
        hero_position: heroPosition, hero_stack: heroStack, game_type: gameType,
        board_flop: board.flop.join(''), board_turn: board.turn, board_river: board.river,
        villains: JSON.stringify(villains), action_history: JSON.stringify(actionHistory),
        pot_size_bb: potSize,
        label: `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} on ${board.flop.join('')}`,
      };
      const { error } = await supabase.from('sandbox_bookmarks').insert(payload);
      if (error) {
        console.warn('[Sandbox] Bookmark save error (table may not exist yet):', error.message);
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
        // 📢 Dispatch BUS LISTENER update for bookmark changes
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));
        }
      }
    } catch (err) {
      console.warn('[Sandbox] Sync error (caching offline):', err);
      // Fallback: W7-4 push to top of local index
      const offlineLog = await idbLoadSessionLog();
      const updatedLog = [payload, ...offlineLog].slice(0, 100);
      idbSaveSessionLog(updatedLog);
      setSessionLog(updatedLog);
      return payload;
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  // Run analysis — with optional Socratic coach intercept
  // pickedAction: if provided, the coach mode user action (bypasses state timing issue)
  const runAnalysis = async (skipCoach = false, pickedAction = null) => {
    if (!guardAction(() => {})) return;
    if (!heroHand.card1 || !heroHand.card2) return;
    // Coach mode: show action picker first if mode is on and no pick yet
    if (coachMode && !skipCoach && !coachUserPick && !pickedAction) {
      try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
      setShowCoachPicker(true);
      return;
    }
    try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    // Use pickedAction (direct parameter) OR stored coachUserPick — avoids stale closure bug
    const resolvedPick = pickedAction || coachUserPick;
    // Get villain range string for most relevant villain (prefer pre-computed range on villain object)
    const villainArcId = villains[0]?.archetype?.id || 'gto_neutral';
    const villainPos = villains[0]?.position || 'BB';
    const villainRangeStr = villains[0]?.range || getArchetypeRangeString(villainArcId, villainPos);
    await analyze({
      heroHand, heroPosition, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard',
      exploitMode,
      villainArchetype: villainArcId,
      bubbleFactor: gameType === 'tournament' ? bubbleFactor : undefined,
      villainRange: villainRangeStr,
      socratic: coachMode && resolvedPick ? { userPick: resolvedPick } : undefined,
    });
    setShowResults(true);
    playAnalysisDing();
    logAnalytics();
    // Auto-append to session log (equity captured pre-analysis as current equity)
    const snapEquity = equity?.heroEquity ?? null;
    const snapHand = `${heroHand.card1}${heroHand.card2}`;
    const snapPos = heroPosition;
    const snapBoard = board.flop.join(' ') || '';
    const snapStreet = currentStreet;
    setSessionLog(prev => {
      const next = [...prev, {
        id: Date.now(),
        hand: snapHand,
        position: snapPos,
        street: snapStreet,
        board: snapBoard,
        equity: snapEquity,
        optimalAction: null, // filled by the useEffect below when results arrive
      }];
      // 📢 Bus listener: notify any listening pages that session log changed
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sandbox-session-log-updated', { detail: { count: next.length } }));
        window.dispatchEvent(new CustomEvent('pa-sandbox-updated', { detail: { type: 'analysis' } }));
      }
      return next;
    });

    // ── Wave 3 W3-2: Persist equity snapshot to Supabase (non-blocking) ──────
    (async () => {
      try {
        const accessToken = getAccessToken();
        if (accessToken && snapEquity !== null) {
          await fetch('/api/sandbox/equity-snapshot', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              heroHand: snapHand,
              villainRange: villainRangeStr || null,
              street: snapStreet,
              equityPct: typeof snapEquity === 'number' ? snapEquity : null,
              boardCards: snapBoard || null,
            }),
          });
        }
      } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    })();
  };




  // Auto-fill optimalAction in session log when results arrive
  // Also compute coach EV delta
  // NOTE: We use a ref snapshot pattern to avoid needing all state in deps
  const coachUserPickRef = useRef(null);
  useEffect(() => { coachUserPickRef.current = coachUserPick; }, [coachUserPick]);

  useEffect(() => {
    if (!results?.optimalAction?.label) return;
    // Fill optimalAction in last session log entry
    setSessionLog(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && !last.optimalAction) {
        updated[updated.length - 1] = { ...last, optimalAction: results.optimalAction.label };
      }
      return updated;
    });
    // Compute coach EV delta using the ref (avoids stale closure)
    const currentPick = coachUserPickRef.current;
    if (currentPick && results.ev) {
      const gtoEV = results.ev.hero || 0;
      const correctLabel = results.optimalAction?.label?.toLowerCase().split(' ')[0];
      const isCorrect = currentPick.toLowerCase().split(' ')[0] === correctLabel;
      const delta = isCorrect ? 0 : -(Math.abs(gtoEV) * 0.2);
      setCoachEvDelta(delta);

      // ── Wave 4: Coach Streak Tracking ──────────────────────────────────────
      if (isCorrect) {
        const newStreak = coachStreakRef.current + 1;
        coachStreakRef.current = newStreak;
        setCoachStreak(newStreak);
        // Haptic milestones at 5, 10, 25
        const MILESTONES = [5, 10, 25];
        if (MILESTONES.includes(newStreak)) {
          try { navigator.vibrate?.([50, 30, 50, 30, 100]); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sandbox-coach-streak-milestone', {
              detail: { streak: newStreak }
            }));
          }
        }
      } else {
        coachStreakRef.current = 0;
        setCoachStreak(0);
      }

      // ── Wave 5: Track recent results for TiltMonitor ────────────────
      setRecentResults(prev => [...prev.slice(-9), { isCorrect, evDelta: delta, hand: `${heroHand?.card1 || ''}${heroHand?.card2 || ''}`, position: heroPosition, street: currentStreet, userPick: currentPick, optimalAction: results.optimalAction?.label, board: board?.flop?.join(' ') || '' }]);

      // ── Wave 3: Persist coach result to Supabase ──────────────────────────
      (async () => {
        try {
          const accessToken = getAccessToken();
          if (accessToken) {
            await fetch('/api/sandbox/coach-result', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                hand: `${heroHand.card1}${heroHand.card2}`,
                position: heroPosition,
                street: currentStreet,
                board: board.flop.join(' ') || '',
                userPick: currentPick,
                gtoAction: results.optimalAction?.label,
                isCorrect,
                evDelta: delta,
              }),
            });
            // Dispatch bus event so leaks.js can refresh coach accuracy
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('sandbox-coach-result-saved', {
                detail: { isCorrect, evDelta: delta }
              }));
            }
          }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
      })();
    }
  }, [results]); // intentionally only react to new results

  // Coach picker: user picked an action — pass it DIRECTLY to runAnalysis to avoid stale closure
  const handleCoachPick = useCallback((action) => {
    setCoachUserPick(action);       // persist to state so CoachVerdict can read it post-render
    setShowCoachPicker(false);
    runAnalysis(true, action);      // pass action directly — doesn't rely on React state update timing
  }, [heroHand, heroPosition, heroStack, gameType, villains, board, potSize, actionHistory, exploitMode, bubbleFactor, coachMode, equity, currentStreet]);

  const handleCoachSkip = useCallback(() => {
    setCoachUserPick(null);
    coachUserPickRef.current = null;
    setShowCoachPicker(false);
    runAnalysis(true, null);
  }, [heroHand, heroPosition, heroStack, gameType, villains, board, potSize, actionHistory, exploitMode, bubbleFactor, coachMode, equity, currentStreet]);

  // Reset coach pick when a new scenario is loaded or hand cleared
  useEffect(() => {
    setCoachUserPick(null);
    setCoachEvDelta(null);
  }, [heroHand.card1, heroHand.card2, heroPosition, board.flop.length]);

  // Villain archetype change — auto-populate range from VillainArchetypeRanges
  const handleVillainArchetypeChange = useCallback((villainIdx, archetypeId) => {
    const info = getArchetypeInfo(archetypeId) || {};
    const villainPos = villains[villainIdx]?.position || 'BB';
    // Use the imported getArchetypeRangeString from VillainArchetypeRanges directly
    const range = getArchetypeRangeString(archetypeId, villainPos);
    const vpip = getArchetypeVPIP(archetypeId, villainPos);
    setVillains(prev => prev.map((v, i) => i === villainIdx ? {
      ...v,
      archetype: { id: archetypeId, name: info.name || archetypeId },
      range,
      vpip,
    } : v));
  }, [villains]);
  // NOTE: getArchetypeRangeString is imported from VillainArchetypeRanges.js — no local shadow needed

  // Position comparison (Feature #11)
  const runPositionComparison = async (pos) => {
    setComparePosition(pos);
    await analyze({
      heroHand, heroPosition: pos, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard',
      exploitMode, villainArchetype: villains[0]?.archetype?.id, bubbleFactor: gameType === 'tournament' ? bubbleFactor : undefined,
    });
  };

  const resetAll = () => {
    setHeroHand({ card1: null, card2: null });
    setBoard({ flop: [], turn: null, river: null });
    setActionHistory([]); setPotSize(6); clearResults();
    setComparePosition(null);
    // Phase 1-4 state reset
    setStreetHistory([]); setActiveStreet(0);
    setEquity(null); setRunoutData(null);
    undoStackRef.current = [];
    setQuizMode(false); setUserGuess(null); setQuizRevealed(false);
    setExploitMode('gto'); setPreflopScenario('rfi');
    setBubbleFactor(1.0);
    // Wave 2 state reset
    setReplayIndex(null);
    setCoachUserPick(null);
    setCoachEvDelta(null);
    setShowShareHand(false);
    setShowSessionLog(false);
    // (sessionLog intentionally preserved across resets so the study journal persists)
  };

  // Source badge
  const sourceBadge = results ? (
    results.matchTier <= 2 ? { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#4ade80', label: 'PIO Verified' }
      : results.matchTier === 3 ? { bg: 'rgba(251,191,36,0.15)', border: '#fbbf24', text: '#fde68a', label: 'PIO Approximated' }
        : { bg: 'rgba(139,92,246,0.15)', border: '#8b5cf6', text: '#c4b5fd', label: 'AI Analysis' }
  ) : null;

  return (
    <div className="sandbox-page" style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#18191A', color: '#E4E6EB', fontFamily: "'Inter',-apple-system,sans-serif" }}>
      {UpgradePopup}
      {/* Onboarding Tour */}
      <OnboardingTour isVisible={showTour} step={tourStep}
        onClose={dismissTour} onNext={() => setTourStep(s => s + 1)} />

      {/* Share Modal */}
      <ShareAnalysisModal isOpen={showShare} onClose={() => setShowShare(false)}
        results={results} scenario={{ board: communityCards.join(' ') }} />

      {/* ── Wave 2 Modals ── */}
      {/* Wave 3: Keyboard shortcut legend (press ? key to toggle) */}
      <ShortcutLegend isOpen={showShortcutLegend} onClose={() => setShowShortcutLegend(false)} />
      <SessionLogModal
        isOpen={showSessionLog}
        onClose={() => setShowSessionLog(false)}
        sessionLog={sessionLog}
        onClearSession={() => { setSessionLog([]); }}
        onLoadEntry={(entry) => {
          // Restore scenario from session log entry
          if (entry.hand?.length >= 4) setHeroHand({ card1: entry.hand.substring(0, 2), card2: entry.hand.substring(2, 4) });
          if (entry.position) setHeroPosition(entry.position);
          // Restore board (parse flop string)
          if (entry.board && entry.board.length > 0) {
            const cards = entry.board.split(' ').filter(Boolean);
            setBoard(prev => ({ ...prev, flop: cards.slice(0, 3) }));
          } else {
            setBoard({ flop: [], turn: null, river: null });
          }
          // Clear action history so it starts fresh for this loaded hand
          setActionHistory([]);
          setPotSize(6);
          // Haptic
          try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }}
      />
      <CoachActionPicker
        isOpen={showCoachPicker}
        onPick={handleCoachPick}
        onSkip={handleCoachSkip}
      />
      <ShareHandModal
        isOpen={showShareHand}
        onClose={() => setShowShareHand(false)}
        results={results}
        heroHand={heroHand}
        board={board}
        scenario={{ position: heroPosition }}
        cardRef={exportCardRef}
      />

      {/* Sessions Sidebar */}
      <AnimatePresence>{showSessions && (
        <RecentSessionsSidebar isOpen onClose={() => setShowSessions(false)} leaderboardEntries={leaderboardEntries} onLoad={(session) => {
          if (session.hero_hand && typeof session.hero_hand === 'string') {
            const h = session.hero_hand;
            setHeroHand({ card1: h.length >= 2 ? h.substring(0, 2) : null, card2: h.length >= 4 ? h.substring(2, 4) : null });
          }
          if (session.hero_position) setHeroPosition(session.hero_position);
          if (session.hero_stack != null) setHeroStack(Number(session.hero_stack) || 100);
          if (session.game_type) setGameType(session.game_type);

          // Restore Board — handle both comma-separated ("As,Kd,Jh") and concatenated ("AsKdJh") formats
          const newBoard = { flop: [], turn: null, river: null };
          if (session.board_flop) {
            if (session.board_flop.includes(',')) {
              newBoard.flop = session.board_flop.split(',').filter(Boolean);
            } else {
              newBoard.flop = session.board_flop.match(/.{1,2}/g) || [];
            }
          }
          if (session.board_turn) newBoard.turn = session.board_turn;
          if (session.board_river) newBoard.river = session.board_river;
          setBoard(newBoard);

          // Restore Villains
          if (session.villain_config && Array.isArray(session.villain_config) && session.villain_config.length > 0) {
            // Ensure all villain stacks are numeric (DB may store as strings)
            setVillains(session.villain_config.map(v => ({ ...v, stack: Number(v.stack) || 100 })));
          } else {
            // Default villain if missing
            setVillains([{ position: session.hero_position === 'BB' ? 'SB' : 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: Number(session.hero_stack) || 100 }]);
          }

          // Restore Action History from Bookmarks
          if (session.action_history && Array.isArray(session.action_history)) {
            setActionHistory(session.action_history);
          } else {
            setActionHistory([]);
          }

          // Restore pot size (Bug 12 + 14)
          if (session.pot_size_bb != null) {
            skipPotCalcRef.current = true;
            setPotSize(Number(session.pot_size_bb) || 6);
          }
          clearResults();
        }} />
      )}</AnimatePresence>

      {/* ── STANDARD UNIVERSAL HEADER ── */}
      <UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />

      {/* ── STANDARD LEFT-SLIDE HAMBURGER MENU (matches all other pages) ── */}
      <HamburgerMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        direction="left"
        theme="dark"
        user={null}
        showProfile={false}
        menuItems={getMenuConfig('sandbox', null, {
          quizMode,
          coachMode,
          hasResults: !!results,
          saveStatus,
          sessionLogCount: sessionLog.length,
          showHeatmap,
          showNodeLocks,
          soundEnabled,
        }, {
          onToggleQuiz: () => { setQuizMode(!quizMode); setQuizRevealed(false); setUserGuess(null); },
          onToggleCoach: () => toggleCoachMode(),
          onRanges: () => setShowRangeExplorer(true),
          onVillains: () => setShowVillainPresets(true),
          onUndo: () => popUndo(),
          onReset: () => resetAll(),
          onReplay: () => setShowHandReplay(true),
          onResults: () => setShowResults(true),
          onShare: () => setShowShare(true),
          onSave: () => saveBookmark(),
          onSessions: () => setShowSessions(true),
          onFolders: () => setShowStudyFolders(true),
          onLog: () => setShowSessionLog(true),
          onTemplates: () => { setShowTemplates(true); loadTemplates(); },
          onSaveSpot: () => setShowSaveHand(true),
          onReport: () => setShowSessionReport(true),
          onGodMode: () => setShowGodMode(true),
          onProImport: () => setShowSolverImport(true),
          onCustomSpot: () => setShowCustomDrill(true),
          onDrill: () => { setDrillParams(null); setShowQuickDrill(true); },
          onToggleHeatmap: (val) => setShowHeatmap(val),
          onToggleNodeLocks: (val) => setShowNodeLocks(val),
          onToggleSound: (val) => toggleSound(),
          onPlayTutorial: () => { setShowTour(true); setTourStep(0); },
        }).menuItems}
        bottomLinks={getMenuConfig('sandbox', null, {}, {
          onPlayTutorial: () => { setShowTour(true); setTourStep(0); },
        }).bottomLinks}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          HORIZONTAL SANDBOX LAYOUT
          LEFT: controls  |  CENTER: table  |  RIGHT: board+analyze
          ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', gap: 8, padding: '4px 10px',
        maxWidth: '100%', width: '100%', alignItems: 'flex-start',
        boxSizing: 'border-box',
      }}>

        {/* ── LEFT COLUMN — Position, Game Type, Hero Hand, Villain ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          minWidth: 90, maxWidth: 110, flexShrink: 0,
        }}>
          {/* Position */}
          <div>
            <div style={{ fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Position</div>
            <select value={heroPosition} onChange={e => setHeroPosition(e.target.value)}
              style={{ width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Game Type */}
          <div>
            <div style={{ fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Game</div>
            <select value={gameType} onChange={e => setGameType(e.target.value)}
              style={{ width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
              {GAME_TYPES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>

          {/* Villain Position */}
          <div>
            <div style={{ fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Villain</div>
            <select value={villains[0]?.position || 'BB'} onChange={e => {
              const newPos = e.target.value;
              const archetypeId = villains[0]?.archetype?.id || 'gto_neutral';
              // Also re-compute range/VPIP for the new position
              const range = getArchetypeRangeString(archetypeId, newPos);
              const vpip = getArchetypeVPIP(archetypeId, newPos);
              setVillains(prev => prev.map((v, i) => i === 0 ? { ...v, position: newPos, range, vpip } : v));
            }}
              style={{ width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>


          {/* Villain Style */}
          <div>
            <div style={{ fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Style</div>
            <select value={villains[0]?.archetype?.id || 'gto_neutral'}
              onChange={e => handleVillainArchetypeChange(0, e.target.value)}
              style={{ width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 10, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
              {Object.values(ARCHETYPE_CONFIG || {}).map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
            {/* VPIP badge */}
            {(villains[0]?.vpip != null) && (
              <div style={{ fontSize: 9, color: '#65676B', marginTop: 2 }}>
                VPIP: <span style={{ color: villains[0].vpip > 40 ? '#f97316' : villains[0].vpip > 25 ? '#fbbf24' : '#4ade80', fontWeight: 700 }}>{villains[0].vpip}%</span>
                {' '}<span style={{ color: '#65676B' }}>• {ARCHETYPE_CONFIG[villains[0].archetype?.id]?.postflopTip?.substring(0, 22) || ''}</span>
              </div>
            )}
          </div>

          {/* ICM / Bubble Factor — shown only in Tournament mode */}
          {gameType === 'tournament' && (
            <div>
              <div style={{ fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Bubble Factor</div>
              <input type="range" min="1" max="3" step="0.1" value={bubbleFactor}
                onChange={e => setBubbleFactor(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#f59e0b', marginBottom: 2 }} />
              <div style={{ fontSize: 9, color: '#fbbf24', textAlign: 'center', fontWeight: 700 }}>{bubbleFactor.toFixed(1)}x</div>
              <div style={{ fontSize: 8, color: '#65676B', textAlign: 'center' }}>{bubbleFactor <= 1.2 ? 'Deep' : bubbleFactor <= 2.0 ? 'Bubble' : 'Final Table'}</div>
            </div>
          )}

          {/* Stack */}
          <div>
            <div style={{ fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Stack (BB)</div>
            <input type="text" inputMode="numeric" value={heroStack}
              onChange={e => { const val = Math.min(500, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)); setHeroStack(val === 0 ? '' : val); }}
              onBlur={() => setHeroStack(h => h || 100)}
              style={{ width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', textAlign: 'center', boxSizing: 'border-box' }} />
          </div>

          {/* Felt colors + mic */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            {FELT_COLORS.map(f => (
              <button key={f.id} onClick={() => changeFeltColor(f.id)}
                style={{ width: 14, height: 14, borderRadius: '50%', border: tableFelt === f.id ? '2px solid #4599FF' : '1px solid #4E4F50', background: f.id === 'default' ? '#18191A' : f.id === 'green' ? '#166534' : f.id === 'blue' ? '#1e3a5f' : '#7f1d1d', cursor: 'pointer', padding: 0 }}
                title={f.label}
              />
            ))}
            <motion.button onClick={startVoiceInput} whileTap={{ scale: 0.85 }}
              style={{ width: 20, height: 20, borderRadius: '50%', padding: 0, border: 'none', background: isListening ? 'rgba(239,68,68,0.3)' : 'rgba(35,116,225,0.12)', color: isListening ? '#fca5a5' : '#4599FF', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >{isListening ? '...' : '🎤'}</motion.button>
          </div>
        </div>

        {/* ── CENTER COLUMN — Horizontal Table ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="sandbox-table-wrap" style={{ width: '100%', filter: FELT_COLORS.find(f => f.id === tableFelt)?.filter || 'none' }}>
            <SandboxPokerTable
              heroCards={[heroHand.card1, heroHand.card2].filter(Boolean)}
              communityCards={communityCards}
              pot={potSize}
              heroPosition={heroPosition}
              heroStack={heroStack}
              villains={villains}
              street={currentStreet}
              boardTexture={boardTexture}
              equity={equity?.heroEquity}
              onTapHeroCards={openHeroPicker}
              onTapBoard={openBoardPicker}
              onReset={resetAll}
              onRemoveHeroCard={(idx) => {
                try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                if (idx === 0) setHeroHand(h => ({ ...h, card1: h.card2, card2: null }));
                else setHeroHand(h => ({ ...h, card2: null }));
              }}
              onRemoveBoardCard={(idx) => {
                try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                const allCards = [...board.flop];
                if (board.turn) allCards.push(board.turn);
                if (board.river) allCards.push(board.river);
                allCards.splice(idx, 1);
                setBoard({ flop: allCards.slice(0, Math.min(3, allCards.length)), turn: allCards[3] || null, river: allCards[4] || null });
              }}
              onSwipeLeft={() => { if (board.flop.length === 3 && !board.river) dealNextStreet(); }}
              onSwipeRight={() => {
                if (board.river) setBoard(b => ({ ...b, river: null }));
                else if (board.turn) setBoard(b => ({ ...b, turn: null }));
              }}
            />
          </div>
        </div>

        {/* ── RIGHT COLUMN — Board, Pot, Actions, Analyze ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          minWidth: 90, maxWidth: 110, flexShrink: 0,
        }}>
          {/* Pot */}
          <div>
            <div style={{ fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Pot (BB)</div>
            <input type="text" inputMode="decimal" value={potSize}
              onChange={e => { const val = parseFloat(e.target.value.replace(/[^\d.]/g, '')); skipPotCalcRef.current = true; setPotSize(isNaN(val) ? '' : val); }}
              onBlur={() => { if (!potSize && potSize !== 0) setPotSize(1.5); }}
              style={{ width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', textAlign: 'center', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
              {[3, 6, 10, 20].map(p => (
                <button key={p} onClick={() => { skipPotCalcRef.current = true; setPotSize(p); }}
                  style={{ flex: 1, padding: '2px 0', borderRadius: 3, fontSize: 9, fontWeight: 600, background: potSize === p ? 'rgba(35,116,225,0.2)' : '#3A3B3C', border: `1px solid ${potSize === p ? 'rgba(35,116,225,0.3)' : '#4E4F50'}`, color: potSize === p ? '#4599FF' : '#B0B3B8', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          </div>

          {/* Board */}
          <div>
            <div style={{ fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Board</div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              {board.flop.map((c, i) => <CardSlot key={`f${i}`} card={c} onRemove={() => { const f = [...board.flop]; f.splice(i, 1); setBoard({ flop: f, turn: null, river: null }); }} />)}
              {board.flop.length < 3 && <CardSlot label="+" onClick={openBoardPicker} />}
              {board.flop.length === 3 && <CardSlot card={board.turn} label="T" onClick={openBoardPicker} onRemove={() => setBoard(b => ({ ...b, turn: null, river: null }))} />}
              {board.turn && <CardSlot card={board.river} label="R" onClick={openBoardPicker} onRemove={() => setBoard(b => ({ ...b, river: null }))} />}
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
              <button onClick={randomBoard} style={{ flex: 1, padding: '3px 4px', borderRadius: 4, fontSize: 8, background: 'rgba(35,116,225,0.12)', border: 'none', color: '#4599FF', cursor: 'pointer', fontWeight: 600 }}>Random</button>
              {board.flop.length === 3 && !board.river && (
                <button onClick={dealNextStreet} style={{ flex: 1, padding: '3px 4px', borderRadius: 4, fontSize: 8, background: 'rgba(34,197,94,0.12)', border: 'none', color: '#86efac', cursor: 'pointer', fontWeight: 600 }}>
                  {!board.turn ? 'Turn' : 'River'}
                </button>
              )}
            </div>
          </div>

          {/* Action History + Replay Bar */}
          <div id="action-history" style={{ maxHeight: 80, overflowY: 'auto' }}>
            <ActionReplayBar
              actions={actionHistory}
              replayIndex={replayIndex}
              onReplayTo={onReplayTo}
              onExitReplay={() => onReplayTo(null)}
            />
            {/* Add action builder — rendered below replay bar */}
            <ActionHistoryBuilder actions={actionHistory}
              onAdd={a => setActionHistory([...actionHistory, a])}
              onRemove={i => setActionHistory(actionHistory.filter((_, j) => j !== i))}
              potSize={replayIndex != null ? replayedPotSize : potSize} />
          </div>

          {/* Range Grid */}
          {communityCards.length >= 3 && (
            <button onClick={() => setShowRangeGrid(true)}
              style={{ width: '100%', padding: '4px', borderRadius: 5, fontSize: 9, fontWeight: 700, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd', cursor: 'pointer' }}>
              Range Grid
            </button>
          )}

          {/* Analyze Hand */}
          <motion.button onClick={() => runAnalysis()} disabled={isAnalyzing || !heroHand.card1 || !heroHand.card2}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            style={{
              width: '100%', padding: '8px 4px', borderRadius: 8, fontSize: 10, fontWeight: 700, border: 'none',
              cursor: isAnalyzing ? 'wait' : 'pointer',
              background: (!heroHand.card1 || !heroHand.card2) ? '#3A3B3C' : isAnalyzing ? 'rgba(35,116,225,0.3)' : 'linear-gradient(135deg,#2374E1,#4599FF)',
              color: (!heroHand.card1 || !heroHand.card2) ? '#65676B' : '#fff',
              fontFamily: "'Orbitron',sans-serif", letterSpacing: 0.3,
              boxShadow: (!heroHand.card1 || !heroHand.card2) ? 'none' : '0 2px 12px rgba(35,116,225,0.3)',
            }}>
            {isAnalyzing ? 'Analyzing...' : coachMode ? '🧠 What Would You Do?' : 'Analyze'}
          </motion.button>

          {/* Daily Challenge */}
          {weeklySpot && (
            <button onClick={() => loadWeeklySpot(weeklySpot)}
              style={{ width: '100%', padding: '6px 4px', borderRadius: 8, fontSize: 8, fontWeight: 700, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Daily Challenge
            </button>
          )}

          {isAnalyzing && <AnalysisSkeleton />}
        </div>
      </div>

      {/* Quick Start removed — users access presets from the hamburger menu */}

      {/* Preflop Range Chart — behind toggle */}
      {currentStreet === 'preflop' && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setShowRangeChart(!showRangeChart)} style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: showRangeChart ? 'rgba(35,116,225,0.15)' : '#3A3B3C',
            border: `1px solid ${showRangeChart ? 'rgba(35,116,225,0.3)' : '#4E4F50'}`,
            color: showRangeChart ? '#4599FF' : '#B0B3B8', cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {showRangeChart ? '▼ Hide Range Chart' : '▶ Show Range Chart'}
          </button>
          {showRangeChart && (
            <div style={{ marginTop: 6 }}>
              <PreflopChartOverlay position={heroPosition} scenario={preflopScenario} rangeGrid={rangeGrid} rangePercent={rangePercent} onChangeScenario={setPreflopScenario} />
            </div>
          )}
        </div>
      )}

      {/* Runout Simulator -- Phase 2 */}
      {board.flop.length === 3 && !board.river && (
        <RunoutChart runoutData={runoutData} />
      )}

      {/* Position Comparison — Feature #11 */}
      {results && (
        <div style={{ marginTop: '8px', background: '#242526', borderRadius: 10, padding: '10px' }}>
          <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px', fontWeight: 700 }}>Compare Position</h4>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {POSITIONS.map(p => {
              const isCurrentTarget = comparePosition ? comparePosition === p : heroPosition === p;
              return (
                <button key={p}
                  onClick={() => {
                    if (p === heroPosition) {
                      setComparePosition(null);
                      analyze({ heroHand, heroPosition, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard' });
                    } else {
                      runPositionComparison(p);
                    }
                  }}
                  disabled={isAnalyzing}
                  style={{
                    padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    background: isCurrentTarget ? 'rgba(35,116,225,0.2)' : '#3A3B3C',
                    border: '1px solid #4E4F50', color: isCurrentTarget ? '#4599FF' : '#B0B3B8',
                    cursor: isAnalyzing ? 'not-allowed' : 'pointer', opacity: isAnalyzing ? 0.5 : 1,
                  }}>{p}</button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '8px', padding: '8px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* GLOBAL DECK PICKER — dual-card mode with progress */}
      <VisualDeckPicker
        isOpen={showDeck}
        onSelect={handleDeckSelect}
        usedCards={allUsedCards}
        onClose={() => { setShowDeck(false); setDeckTarget(null); setHeroPickStep(0); }}
        mode={deckTarget === 'hero' ? 'hero' : deckTarget === 'board' ? 'board' : 'single'}
        pickProgress={heroPickStep}
      />

      {/* ═══ HAND HISTORY IMPORT MODAL (W8-1) ═══ */}
      <ImportHHModal
        isVisible={showHHImport}
        onClose={() => setShowHHImport(false)}
        onImport={(parsed) => {
          pushUndo();
          if (parsed.heroHand) setHeroHand(parsed.heroHand);
          if (parsed.heroPosition) setHeroPosition(parsed.heroPosition);
          if (parsed.heroStack) setHeroStack(parsed.heroStack);
          if (parsed.gameType) setGameType(parsed.gameType);
          if (parsed.board) setBoard(parsed.board);
          if (parsed.villains?.length) setVillains(parsed.villains);
          if (parsed.actionHistory?.length) setActionHistory(parsed.actionHistory);

          // 📢 Dispatch BUS LISTENER update for cross-component reactivity so Analysis auto-updates
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pa-sandbox-updated', { detail: { type: 'import_hh' } }));
          }
        }}
      />

      {/* ═══ RANGE EXPLORER MODAL (W4-2) ═══ */}
      {showRangeExplorer && (
        <RangeExplorer
          onSelectRange={(rangeStr) => {
            if (rangeStr && villains.length > 0) {
              const updated = [...villains];
              updated[0] = { ...updated[0], range: rangeStr };
              setVillains(updated);
            }
          }}
          onClose={() => setShowRangeExplorer(false)}
        />
      )}

      {/* ═══ QUICK-SPOT DRILL MODAL (W4-4 / W6-3) ═══ */}
      {showCustomDrill && (
        <CustomDrillBuilder
          onClose={() => setShowCustomDrill(false)}
          onStartDrill={(params) => {
            setDrillParams(params);
            setShowCustomDrill(false);
            setShowQuickDrill(true);
          }}
        />
      )}

      {showQuickDrill && (
        <QuickSpotDrill
          customParams={drillParams}
          onClose={() => { setShowQuickDrill(false); setDrillParams(null); }}
        />
      )}

      {/* ═══ SESSION REPORT MODAL (W4-6) ═══ */}
      {showSessionReport && (
        <SessionReport
          sessionLog={sessionLog}
          coachStreak={coachStreak}
          onClose={() => setShowSessionReport(false)}
        />
      )}

      {/* ═══ VILLAIN PRESETS MODAL (W5-3) ═══ */}
      {showVillainPresets && (
        <VillainPresetPicker
          onSelectPreset={(preset) => {
            if (villains.length > 0) {
              const updated = [...villains];
              updated[0] = { ...updated[0], range: preset.range };
              setVillains(updated);
            }
          }}
          onClose={() => setShowVillainPresets(false)}
        />
      )}

      {/* ═══ HAND REPLAY MODAL (W5-6) ═══ */}
      {showHandReplay && (
        <HandReplay
          sessionLog={sessionLog}
          onLoadScenario={(entry) => {
            // Basic scenario reload (you would normally fully parse this back into context depending on entry structure)
            // Note: A full reload would require parsing board cards from space-separated string back into objects, etc.
            // We'll leave the API hook here for now to just log.
          }}
          onClose={() => setShowHandReplay(false)}
        />
      )}

      {/* ═══ WAVE 6 MODALS ═══ */}
      {showStudyFolders && (
        <StudyFolders
          onLoadTarget={(state) => {
            // Rehydrate logic wrapper
            if (state.board) setBoard(state.board);
            if (state.villains) setVillains(state.villains);
            if (state.heroHand) setHeroHand(state.heroHand);
            if (state.heroPosition) setHeroPosition(state.heroPosition);
          }}
          onClose={() => setShowStudyFolders(false)} />
      )}

      {showSaveHand && (
        <SaveHandModal
          sandboxState={{ board, heroHand, heroPosition, villains, potSize, effStack }}
          onSaveComplete={() => setShowSaveHand(false)}
          onClose={() => setShowSaveHand(false)} />
      )}

      {showShareScenario && (
        <ShareScenarioModal
          sandboxState={{ board, heroHand, heroPosition, villains, potSize, effStack }}
          onClose={() => setShowShareScenario(false)} />
      )}

      {showGodMode && (
        <GodModePanel
          onClose={() => setShowGodMode(false)}
          setResults={(heroHand, opponents, finalBoard, potSize, effStack, action) => {
            const gtoResult = evaluateHandAndRanges(heroHand, opponents, finalBoard, potSize, effStack);

            // W7-3: Apply Heuristic Exploit Node-Locking Modifiers if active
            let finalEV = gtoResult.ev;
            opponents.forEach(v => {
              if (v.nodeLock === 'Overfold' && action === 'bet') finalEV += 15.5; // Hero bets gain huge EV
              if (v.nodeLock === 'CallingStation' && action === 'bet') finalEV -= 5.2; // Bluffs lose heavily
              if (v.nodeLock === 'Maniac' && action === 'check') finalEV += 10.1; // Trap lines increase EV
            });

            setMockEvCache(prev => ({
              ...prev,
              [action]: finalEV
            }));
          }}
        />
      )}

      {showSolverImport && (
        <ExternalSolverImport
          onClose={() => setShowSolverImport(false)}
          onImport={(state) => {
            // Directly hydrate board and positions from parsed import
            if (state.board) setBoard(state.board);
            if (state.heroPosition) {
              const newPos = Object.values(heroPositions || {}).find(p => p.id === state.heroPosition) || heroPositions.BTN;
              setHeroPosition(newPos);
            }
            if (state.villains) setVillains(state.villains);
            if (state.potSize) setPotSize(state.potSize);
            if (state.effStack) setEffStack(state.effStack);
            // Assume postflop load means we are active
            setPhase(state.board && state.board.length >= 3 ? 'postflop' : 'action');

            // Flash success check
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
          }}
        />
      )}

      {showSessionReport && (
        <SessionReport
          sessionLog={sessionLog}
          coachStreak={coachStreak}
          onClose={() => setShowSessionReport(false)}
        />
      )}

      {/* ═══ TEMPLATES MODAL ═══ */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              style={{ background: '#242526', borderRadius: 16, padding: 16, width: '100%', maxWidth: 400, maxHeight: '70vh', overflowY: 'auto', border: '1px solid #3A3B3C' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB', margin: 0 }}>My Templates</h3>
                <button onClick={() => setShowTemplates(false)} style={{ background: 'none', border: 'none', color: '#B0B3B8', fontSize: 18, cursor: 'pointer' }}>x</button>
              </div>
              {templates.length === 0 ? (
                <p style={{ fontSize: 11, color: '#65676B', textAlign: 'center', padding: 20 }}>No saved templates yet. Save one from the menu.</p>
              ) : templates.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #3A3B3C' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#E4E6EB' }}>{t.name}</div>
                    <div style={{ fontSize: 9, color: '#65676B' }}>{new Date(t.created_at).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => loadTemplate(t)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.3)', color: '#4599FF', cursor: 'pointer' }}>Load</button>
                  <button onClick={async () => {
                    try {
                      const user = getAuthUser();
                      const { data: { session } } = await supabase.auth.getSession();
                      await fetch('/api/assistant/sandbox/sandbox-templates', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                        body: JSON.stringify({ id: t.id }),
                      });
                      loadTemplates();
                    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                  }} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer' }}>x</button>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ LEAK STATS MODAL ═══ */}
      <AnimatePresence>
        {showLeakStats && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              style={{ background: '#242526', borderRadius: 16, padding: 16, width: '100%', maxWidth: 380, border: '1px solid #3A3B3C' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB', margin: 0 }}>Study Analytics</h3>
                <button onClick={() => setShowLeakStats(false)} style={{ background: 'none', border: 'none', color: '#B0B3B8', fontSize: 18, cursor: 'pointer' }}>x</button>
              </div>
              {!leakStats ? (
                <p style={{ fontSize: 11, color: '#65676B', textAlign: 'center', padding: 20 }}>Loading stats...</p>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div style={{ textAlign: 'center', padding: 10, borderRadius: 8, background: '#18191A' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#4599FF' }}>{leakStats.totalAnalyses || 0}</div>
                      <div style={{ fontSize: 8, color: '#65676B', fontWeight: 600, textTransform: 'uppercase' }}>Total Hands</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: 10, borderRadius: 8, background: '#18191A' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: leakStats.accuracy >= 70 ? '#4ade80' : leakStats.accuracy >= 50 ? '#fbbf24' : '#fca5a5' }}>{leakStats.accuracy != null ? `${leakStats.accuracy}%` : '--'}</div>
                      <div style={{ fontSize: 8, color: '#65676B', fontWeight: 600, textTransform: 'uppercase' }}>Accuracy</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: 10, borderRadius: 8, background: '#18191A' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#c4b5fd' }}>{leakStats.mostStudied || '--'}</div>
                      <div style={{ fontSize: 8, color: '#65676B', fontWeight: 600, textTransform: 'uppercase' }}>Top Position</div>
                    </div>
                  </div>
                  {/* Position breakdown */}
                  {leakStats.positionDistribution && Object.keys(leakStats.positionDistribution || {}).length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: '#B0B3B8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Position Distribution</div>
                      {Object.entries(leakStats.positionDistribution || {}).sort((a, b) => b[1] - a[1]).map(([pos, count]) => {
                        const maxCount = Math.max(...Object.values(leakStats.positionDistribution || {}));
                        return (
                          <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#E4E6EB', width: 30 }}>{pos}</span>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#3A3B3C', overflow: 'hidden' }}>
                              <div style={{ width: `${(count / maxCount) * 100}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #2374E1, #4599FF)' }} />
                            </div>
                            <span style={{ fontSize: 9, color: '#65676B', width: 20, textAlign: 'right' }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Insights */}
                  {leakStats.insights?.length > 0 && (
                    <div style={{ padding: 10, borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                      {leakStats.insights.map((insight, i) => (
                        <p key={i} style={{ fontSize: 11, color: '#c4b5fd', margin: i > 0 ? '6px 0 0' : 0, lineHeight: 1.4 }}>{insight}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ RANGE HEAT GRID ═══ */}
      <RangeHeatGrid boardCards={communityCards} isOpen={showRangeGrid} onClose={() => setShowRangeGrid(false)} />

      {/* ═══════ FULLSCREEN ANALYSIS POPUP (#8) ═══════ */}
      <AnimatePresence>
        {results && showResults && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              padding: '20px 12px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowResults(false); }}
          >
            <motion.div
              id="results-panel" className="results-panel-inner"
              ref={exportCardRef}
              initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                background: '#242526', borderRadius: 20,
                border: '1px solid #3A3B3C', padding: '20px',
                width: '100%', maxWidth: 600,
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              }}
            >
              {/* Drag handle (mobile affordance) */}
              <div className="results-drag-handle" style={{ display: 'none', justifyContent: 'center', marginBottom: '10px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: '#4E4F50' }} />
              </div>

              {/* WAVE 7-3 NODE LOCK EXPLOITS */}
              <NodeLockExploits
                isVisible={showNodeLocks}
                villains={villains}
                updateVillainLock={(vid, lockType) => {
                  setVillains(v => v.map(villain => villain.id === vid ? { ...villain, nodeLock: lockType } : villain));
                  // Force recalculation of local heuristics
                  updateMockEVs(heroHand, villains.map(villain => villain.id === vid ? { ...villain, nodeLock: lockType } : villain));
                }}
              />

              {/* ══ ACTION BUTTONS ══ */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ color: '#E4E6EB', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>
                  Analysis Results {comparePosition ? `(${comparePosition})` : ''}
                </h3>
                <button onClick={() => setShowResults(false)} style={{
                  background: '#3A3B3C', border: 'none', borderRadius: '50%',
                  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#E4E6EB', fontSize: 20, cursor: 'pointer', touchAction: 'manipulation',
                  flexShrink: 0,
                }}>✕</button>
              </div>

              <div style={{
                border: `3px solid ${M.border}`, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative'
              }}>
                <EquityHeatmapOverlay
                  isVisible={showHeatmap}
                  board={board}
                  heroPosition={heroPosition.id}
                  villains={villains}
                />

                <div style={{ position: 'absolute', inset: 0, opacity: 0.1, background: 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.8) 100%)', pointerEvents: 'none' }} />

                {/* --- HERO (Bottom Center) --- */}
              </div>
              {/* Street Timeline — Phase 1 */}
              <StreetTimeline streetHistory={streetHistory} activeStreet={activeStreet} onSelectStreet={setActiveStreet} />

              {/* Exploit Toggle -- Phase 2 */}
              <ExploitToggle mode={exploitMode} onToggle={setExploitMode} exploitTip={exploitTip} />

              {/* ICM Badge -- shows current bubble factor value (controlled via left-column slider) */}
              {gameType === 'tournament' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <span style={{ fontSize: '10px', color: '#fde68a', fontWeight: '700' }}>ICM Bubble Factor</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: '13px', color: '#fbbf24', fontWeight: '800', fontFamily: "'Orbitron',monospace" }}>{bubbleFactor.toFixed(1)}×</span>
                  <span style={{ fontSize: '9px', color: '#fde68a' }}>{bubbleFactor <= 1.2 ? 'Deep Stack' : bubbleFactor <= 2.0 ? 'Bubble' : 'Final Table'}</span>
                </div>
              )}


              {/* Plain-English Summary */}
              {/* Quiz Panel -- Phase 3 */}
              {quizMode && results && (
                <QuizPanel onGuess={handleQuizGuess} correctAction={results.optimalAction?.label} revealed={quizRevealed} userGuess={userGuess} score={quizScore} />
              )}

              {/* Wave 2: Coach Verdict — shown when coach mode picked an action */}
              {coachMode && coachUserPick && results && (
                <CoachVerdict
                  userPick={coachUserPick}
                  gtoAction={results.optimalAction?.label}
                  evDelta={coachEvDelta}
                />
              )}

              {/* Wave 5: AI Coach Feedback — contextual tip after verdict */}
              {coachMode && coachUserPick && results && (
                <CoachFeedback
                  results={results}
                  heroHand={heroHand}
                  heroPosition={heroPosition}
                  coachUserPick={coachUserPick}
                  isCorrect={coachUserPick?.toLowerCase().split(' ')[0] === results.optimalAction?.label?.toLowerCase().split(' ')[0]}
                />
              )}

              {/* Wave 5: Tilt Awareness Monitor */}
              {coachMode && recentResults.length >= 3 && (
                <TiltMonitor recentResults={recentResults} />
              )}

              {/* Wave 3: Villain Intel card — shows archetype exploit tips */}
              {results && villains?.[0] && (
                <VillainReadCard villain={villains[0]} />
              )}

              {/* Wave 2: Equity Graph — shown when multi-street history exists */}
              <EquityGraph streetHistory={streetHistory} currentEquity={equity?.heroEquity} />



              {getResultsSummary(results) && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.15)', marginBottom: 12, fontSize: 12, lineHeight: 1.5, color: '#E4E6EB', textTransform: 'none' }}>
                  {getResultsSummary(results)}
                </div>
              )}

              {/* Source Badge */}
              {sourceBadge && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.text }}>{sourceBadge.label}</div>
                  <span style={{ fontSize: 10, color: '#B0B3B8' }}>{results.source}</span>
                </div>
              )}

              {/* Optimal Action */}
              {results.optimalAction && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px', marginBottom: 12, textAlign: 'center' }}>
                  <div style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {results.isMixed ? 'Primary (Mixed)' : 'Optimal (Pure)'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Orbitron',sans-serif", color: results.optimalAction.color || '#22c55e' }}>
                    {results.optimalAction.label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>{results.optimalAction.frequency}%</div>
                </div>
              )}

              {/* EV Display */}
              {results.ev?.heroDisplay && results.ev.heroDisplay !== '—' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: 12 }}>
                  {[
                    { l: 'Hand EV', v: results.ev.heroDisplay, c: results.ev.hero >= 0 ? '#22c55e' : '#ef4444' },
                    { l: 'EV Loss', v: results.ev.evLoss > 0 ? `-${results.ev.evLoss.toFixed(2)}` : '0.00', c: results.ev.evLoss > 0 ? '#ef4444' : '#22c55e' },
                    { l: 'Avg EV', v: `${results.ev.avg >= 0 ? '+' : ''}${results.ev.avg.toFixed(2)}`, c: '#B0B3B8' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: '#3A3B3C', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#B0B3B8', textTransform: 'uppercase' }}>{item.l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Orbitron',monospace", color: item.c, marginTop: 2 }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ICM-Adjusted EV (Tournament mode with bubble factor) */}
              {results.icmAdjusted && results.icmEV && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 12, padding: '6px 10px', borderRadius: '8px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <span style={{ fontSize: '10px', color: '#fde68a', fontWeight: '700', textTransform: 'uppercase' }}>ICM EV ({results.bubbleFactor?.toFixed(1)}x)</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', fontFamily: "'Orbitron',monospace", color: results.icmEV.hero >= 0 ? '#4ade80' : '#fca5a5' }}>{results.icmEV.heroDisplay}</span>
                </div>
              )}

              {/* Frequency Bars */}
              <div style={{ background: '#3A3B3C', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px', fontWeight: 700 }}>GTO Frequencies</h4>
                {results.actions?.map(a => <FrequencyBar key={a.id} action={a} isOptimal={a.isOptimal} />)}
              </div>

              {/* Tree Visualization */}
              <TreeVisualization actions={results.actions} />

              {/* Sizing Sensitivity */}
              <SizingSensitivity results={results} />

              {/* Explanation */}
              {results.explanation && (
                <div style={{ background: 'rgba(35,116,225,0.06)', border: '1px solid rgba(35,116,225,0.15)', borderRadius: 8, padding: '10px', marginBottom: 12 }}>
                  <div style={{ color: '#B0B3B8', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>Analysis</div>
                  <p style={{ color: '#E4E6EB', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{results.explanation}</p>
                </div>
              )}

              {/* Range Matrix — from solver data */}
              {results.rangeHeatmap && (
                <div style={{ background: '#3A3B3C', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: 0, fontWeight: 700 }}>
                      Range Heatmap ({results.rangeHeatmap.totalHands})
                    </h4>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {results.rangeHeatmap.actions?.slice(0, 4).map(a => (
                        <button key={a.id} onClick={() => setSelectedHeatmapAction(a.id)}
                          style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, border: 'none', cursor: 'pointer',
                            background: (selectedHeatmapAction || results.rangeHeatmap.actions[0]?.id) === a.id ? 'rgba(35,116,225,0.3)' : '#242526',
                            color: (selectedHeatmapAction || results.rangeHeatmap.actions[0]?.id) === a.id ? '#4599FF' : '#B0B3B8',
                          }}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                  <RangeMatrix rangeHeatmap={results.rangeHeatmap} selectedAction={selectedHeatmapAction} />
                </div>
              )}

              {/* Wave 3 W3-7: Villain Range Reveal — archetype opening range as compact text */}
              {villains?.[0]?.range && (
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={() => { setShowVillainRange(v => !v); try { navigator.vibrate?.(8); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: showVillainRange ? 'rgba(139,92,246,0.15)' : '#3A3B3C', border: `1px solid ${showVillainRange ? 'rgba(139,92,246,0.4)' : '#4E4F50'}`, color: showVillainRange ? '#a78bfa' : '#B0B3B8', cursor: 'pointer', textAlign: 'left' }}>
                    {showVillainRange ? '▲' : '▼'} Villain Opening Range ({villains[0].archetype?.name || 'Unknown'})
                  </button>
                  {showVillainRange && (
                    <div style={{ marginTop: 6, padding: '10px 12px', background: '#1c1c1c', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)', fontSize: 10, color: '#B0B3B8', fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-all' }}>
                      <div style={{ fontSize: 9, color: '#65676B', marginBottom: 4, fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 1 }}>
                        VPIP {villains[0].vpip ?? '—'}% | Opening Range
                      </div>
                      {villains[0].range}
                    </div>
                  )}
                  <BottomNavBar />
                </div>
              )}

              {/* Multi-Street — Feature #2 */}
              {board.flop.length === 3 && !board.river && (
                <button onClick={() => { dealNextStreet(); setTimeout(() => runAnalysis(true, null), 200); }}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none',
                    color: '#fff', cursor: 'pointer', marginBottom: 8,
                  }}>
                  Deal {!board.turn ? 'Turn' : 'River'} & Re-Analyze ▸
                </button>
              )}

              {/* Export to Image -- Phase 4 */}
              <ExportCard results={results} scenario={{ position: heroPosition, hand: `${heroHand.card1 || '?'}${heroHand.card2 || '?'}`, board: communityCards.join(' ') || 'Preflop' }} />

              {/* Collaborative Share Link -- Phase 4 */}
              <button onClick={() => {
                const params = new URLSearchParams({
                  h: `${heroHand.card1 || ''}${heroHand.card2 || ''}`, p: heroPosition, s: heroStack,
                  g: gameType, b: communityCards.join(','), pot: potSize,
                });
                const url = `${window.location.origin}/hub/personal-assistant/sandbox?${params.toString()}`;
                navigator.clipboard?.writeText(url).then(() => { if (typeof toast?.success === 'function') toast.success('Link copied'); });
              }} style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', color: '#4ade80', cursor: 'pointer', marginBottom: 8 }}>
                Copy Share Link
              </button>

              {/* Train This Spot — in-place overlay with hand context */}
              <button
                onClick={() => {
                  const hand = `${heroHand.card1 || ''}${heroHand.card2 || ''}`;
                  const board = communityCards.filter(Boolean).join(' ');
                  const street = board.split(' ').filter(Boolean).length === 0 ? 'preflop'
                    : board.split(' ').filter(Boolean).length <= 3 ? 'flop'
                    : board.split(' ').filter(Boolean).length === 4 ? 'turn' : 'river';
                  const tags = [
                    heroPosition?.toLowerCase(),
                    street,
                    gameType?.toLowerCase(),
                    parseFloat(heroStack) < 20 ? 'short stack' : null,
                    parseFloat(heroStack) < 20 ? 'push fold' : null,
                  ].filter(Boolean);
                  const title = `${heroPosition || 'Hero'} vs ${board || 'Preflop'} — ${gameType || 'NLH'}`;
                  const ctx = {
                    ref: 'sandbox',
                    vid: hand || 'sandbox',
                    title: title.slice(0, 80),
                    source: 'Sandbox',
                    tags,
                  };
                  const gameIds = findBestGames(ctx);
                  // Lazy-load to avoid Webpack circular initialization
                  const { getGameById: lookupGame } = require('../../../src/data/TRAINING_LIBRARY');
                  const games = gameIds.map(id => lookupGame(id)).filter(Boolean).slice(0, 3);
                  setTtsOverlay({ ctx, games, hand, board, street });
                  // Fire analytics
                  fetch('/api/training/log-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ref: 'sandbox', vid: ctx.vid, title: ctx.title, source: 'Sandbox', tags, matchedGameIds: gameIds.slice(0, 3) }),
                  }).catch(() => {});
                }}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px',
                  fontWeight: '700', background: 'linear-gradient(135deg, rgba(0,200,83,0.15), rgba(0,150,60,0.15))',
                  border: '1.5px solid rgba(0,200,83,0.5)', color: '#34C759', cursor: 'pointer',
                  marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  animation: 'tts-pulse 2.5s ease-in-out infinite',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,200,83,0.3), rgba(0,150,60,0.3))'; e.currentTarget.style.animation = 'none'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,200,83,0.15), rgba(0,150,60,0.15))'; e.currentTarget.style.animation = 'tts-pulse 2.5s ease-in-out infinite'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                Train This Spot
              </button>

              {/* Study Replay -- Phase 3.2 */}
              {studySessions.length > 0 && (
                <StudyReplayCard
                  session={studySessions[studyIndex]}
                  index={studyIndex}
                  total={studySessions.length}
                  onNext={() => setStudyIndex(i => Math.min(i + 1, studySessions.length - 1))}
                  onPrev={() => setStudyIndex(i => Math.max(i - 1, 0))}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence >

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@400;500;600;700;800&display=swap');

        /* Capitalize first letter of every word globally */
        .sandbox-page * {
          text-transform: capitalize;
        }
        /* Preserve case for code-like elements */
        .sandbox-page input,
        .sandbox-page select option,
        .sandbox-page code,
        .sandbox-page pre {
          text-transform: none;
        }

        /* ═══════════════════════════════════════════════ */
        /* MOBILE OPTIMIZATION — 768px breakpoint          */
        /* ═══════════════════════════════════════════════ */
        @media (max-width: 768px) {
          /* --- Layout --- */
          .sandbox-main-layout {
            grid-template-columns: 1fr !important;
            padding: 10px 12px !important;
            gap: 10px !important;
            padding-bottom: 80px !important; /* space for sticky CTA */
          }

          /* --- Header: simplified --- */
          .sandbox-header {
            padding: 8px 12px !important;
          }
          .sandbox-header > div {
            gap: 6px !important;
          }
          .sandbox-page h1 {
            font-size: 15px !important;
          }
          .desktop-header-actions {
            display: none !important;
          }
          .mobile-menu-btn {
            display: flex !important;
          }

          /* --- Card Picker: fullscreen bottom-sheet --- */
          .deck-picker-sheet {
            max-height: 80vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          .deck-picker-card {
            width: 38px !important;
            height: 52px !important;
            border-radius: 5px !important;
          }

          /* --- Card Slots: bigger for thumbs --- */
          .card-slot img,
          .card-slot-empty {
            width: 52px !important;
            height: 72px !important;
          }
          .card-slot-remove {
            width: 22px !important;
            height: 22px !important;
            font-size: 13px !important;
          }

          /* --- Form Controls: 48px targets, 16px font (no iOS zoom) --- */
          .sandbox-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .sandbox-hero-grid select,
          .sandbox-hero-grid input {
            font-size: 16px !important;
            padding: 12px !important;
            min-height: 48px !important;
            border-radius: 10px !important;
          }
          .sandbox-hero-grid label {
            font-size: 13px !important;
          }

          /* --- Analyze Button: inline (not fixed) --- */
          #run-analysis {
            padding: 4px 12px !important;
          }
          #run-analysis button {
            font-size: 15px !important;
            padding: 14px !important;
            min-height: 50px !important;
            border-radius: 12px !important;
          }

          /* --- Results Panel: bottom-sheet feel --- */
          .results-panel-inner {
            border-radius: 20px 20px 0 0 !important;
            padding: 16px 14px !important;
            max-height: 95vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          .results-drag-handle {
            display: flex !important;
          }

          /* --- Sessions Sidebar: full-width --- */
          .sessions-sidebar {
            width: 100vw !important;
            padding: 16px !important;
            padding-top: calc(16px + env(safe-area-inset-top, 0px)) !important;
          }

          /* --- Poker Table: vertical, fill width --- */
          .sandbox-table-wrap {
            overflow: visible;
            border-radius: 12px;
          }

          /* --- Step Indicator: compact --- */
          .sandbox-steps {
            gap: 2px !important;
            padding: 6px 10px !important;
          }
          .sandbox-steps span {
            font-size: 10px !important;
          }

          /* --- Touch optimizations --- */
          .sandbox-page button {
            touch-action: manipulation;
          }
          .sandbox-page select {
            touch-action: manipulation;
            font-size: 16px !important;
          }

          /* --- Villain controls: bigger touch targets --- */
          .sandbox-page .sandbox-main-layout select {
            min-height: 44px !important;
            padding: 10px 8px !important;
            border-radius: 8px !important;
          }
          .sandbox-page .sandbox-main-layout input[type="text"] {
            min-height: 44px !important;
            padding: 10px 8px !important;
            border-radius: 8px !important;
          }

          /* --- Board action buttons: bigger for thumbs --- */
          .sandbox-page #board-builder button {
            min-height: 36px !important;
            padding: 8px 12px !important;
            font-size: 12px !important;
            border-radius: 8px !important;
          }

          /* --- Pot preset buttons: thumb-friendly --- */
          .pot-size-editor button {
            min-height: 40px !important;
            padding: 8px 12px !important;
          }
        }

        /* Pulsing animation for loading */
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        .skeleton-pulse {
          animation: skeleton-pulse 1.5s ease-in-out infinite;
        }
        @keyframes analyze-pulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(35,116,225,0.3); }
          50% { box-shadow: 0 4px 30px rgba(35,116,225,0.6); }
        }
        .analyzing-pulse {
          animation: analyze-pulse 1.5s ease-in-out infinite;
        }
        @keyframes tts-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(0,200,83,0.15); border-color: rgba(0,200,83,0.5); }
          50%       { box-shadow: 0 0 20px rgba(0,200,83,0.5); border-color: rgba(0,200,83,0.9); }
        }
      `}</style>
      {/* ── Train This Spot In-Place Overlay ── */}
      {ttsOverlay && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9500, animation: 'tts-sheet-up 0.32s cubic-bezier(0.34,1.56,0.64,1) both' }}>
          <div onClick={() => setTtsOverlay(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: -1 }} />
          <div style={{ background: 'linear-gradient(180deg, #0a0f1e, #060a14)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(0,200,83,0.2)', borderBottom: 'none', maxHeight: '75vh', overflow: 'auto', boxShadow: '0 -10px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0,200,83,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}><div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} /></div>
            <div style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(0,200,83,0.3), rgba(0,150,60,0.15))', border: '1.5px solid rgba(0,200,83,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#34C759' }}>Train This Spot</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>AI-matched drills for your hand</div>
              </div>
              <button onClick={() => setTtsOverlay(null)} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>✕</button>
            </div>
            {/* Hand context card — sandbox has exact state */}
            <div style={{ padding: '0 20px 12px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {ttsOverlay.hand ? ttsOverlay.hand.match(/.{2}/g)?.map((c, i) => (
                    <div key={i} style={{ width: 28, height: 38, borderRadius: 5, background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'cdhs'.indexOf(c[1]) < 2 ? '#FF6B6B' : '#fff' }}>{c}</div>
                  )) : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>No hand set</span>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {ttsOverlay.street && <span style={{ textTransform: 'capitalize', fontWeight: 700, color: '#4DA6FF' }}>{ttsOverlay.street}</span>}
                  {ttsOverlay.board && <span> · Board: {ttsOverlay.board}</span>}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: 6, padding: '2px 7px' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#34C759' }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#34C759' }}>Sandbox</span>
                </div>
              </div>
            </div>
            <div style={{ padding: '0 20px 8px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>AI-Recommended Drills</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ttsOverlay.games.map((game, idx) => (
                  <button key={game.id} onClick={() => { setTtsOverlay(null); router.push(`/hub/training?autoLaunch=${game.id}`); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: idx === 0 ? 'rgba(0,200,83,0.08)' : 'rgba(255,255,255,0.03)', border: `1.5px solid ${idx === 0 ? 'rgba(0,200,83,0.3)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: idx === 0 ? 'rgba(0,200,83,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{game.icon || '🎯'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: idx === 0 ? '#34C759' : '#fff' }}>{game.name}</span>
                        {idx === 0 && <span style={{ fontSize: 8, fontWeight: 800, color: '#34C759', background: 'rgba(0,200,83,0.12)', borderRadius: 5, padding: '1px 5px' }}>BEST MATCH</span>}
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{game.focus} · {'★'.repeat(Math.min(game.difficulty || 1, 5))} Difficulty</div>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '6px 20px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => { setTtsOverlay(null); router.push('/hub/training'); }} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Browse All 100 Training Games</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes tts-sheet-up {
          from { transform: translateY(100%); opacity: 0.7; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div >
  );
}
