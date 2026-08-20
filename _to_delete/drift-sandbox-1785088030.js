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

import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useSandboxAnalysis, useArchetypes, useRecentSessions, useBookmarks, useStudyDeck, useQuizLeaderboard } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { calculateEquity, simulateRunouts } from '../../../src/lib/sandbox/EquityEngine';
import { getRangeGrid, getRangePercentage } from '../../../src/lib/sandbox/PreflopCharts';
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
  QuizPanel, StudyReplayCard,
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
import { idbSaveSessionLog, idbLoadSessionLog } from '../../../src/utils/indexeddb-pwa';
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
const DEFAULT_VILLAINS = [{ id: 0, position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100, range: '' }];

// Ensure every villain carries a stable id (NodeLockExploits keys/calls with v.id)
const withVillainIds = (arr) => (arr || []).map((v, i) => ({ ...v, id: v.id ?? i }));

// ═══════════════════════════════════════════════════════════════
// ACTION NORMALIZATION — shared by quiz, coach, and analytics so
// correctness checks all agree ('Check-Raise' must NOT match 'Check')
// ═══════════════════════════════════════════════════════════════
function normalizeAction(label) {
  if (!label || typeof label !== 'string') return null;
  const raw = label.toLowerCase().trim();
  // Canonical verb detection — order matters (check-raise before check)
  let verb = null;
  if (/all[\s-]?in|shove|jam/.test(raw)) verb = 'allin';
  else if (/check[\s-]?raise/.test(raw)) verb = 'raise';
  else if (/^raise|(^|\s)raise/.test(raw)) verb = 'raise';
  else if (/(^|\s)(over)?bet/.test(raw)) verb = 'bet'; // 'Bet 66%', 'bet_66', 'Overbet 150%'
  else if (/^call|(^|\s)call/.test(raw)) verb = 'call';
  else if (/^check|(^|\s)check/.test(raw)) verb = 'check';
  else if (/^fold|(^|\s)fold/.test(raw)) verb = 'fold';
  else verb = raw.split(/[\s_]/)[0] || null;
  // Size extraction (e.g. 'Bet 33%', 'bet_66', 'Bet Pot' => 100)
  let size = null;
  const num = raw.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (num) size = parseFloat(num[1]);
  else if (/pot/.test(raw)) size = 100;
  else if (/small/.test(raw)) size = 33;
  else if (/medium/.test(raw)) size = 66;
  else if (/large|big/.test(raw)) size = 100;
  return { verb, size };
}

// Size bucket: small (<50), medium (50-99), large (>=100)
function sizeBucket(size) {
  if (size == null) return null;
  if (size < 50) return 'small';
  if (size < 100) return 'medium';
  return 'large';
}

function actionsMatch(a, b) {
  const na = normalizeAction(a);
  const nb = normalizeAction(b);
  if (!na?.verb || !nb?.verb) return false;
  if (na.verb !== nb.verb) return false;
  // When both carry sizes, require the same size bucket
  if (na.size != null && nb.size != null) return sizeBucket(na.size) === sizeBucket(nb.size);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// VILLAIN ACTION SIMULATION — archetype frequency tables
// (fold/call/raise used when facing a bet; check/bet when checked to)
// ═══════════════════════════════════════════════════════════════
const VILLAIN_ACTION_TABLES = {
  calling_station: { fold: 15, call: 70, raise: 5, check: 55, bet: 35 },
  nit: { fold: 60, call: 30, raise: 10, check: 70, bet: 20 },
  lag: { fold: 15, call: 30, raise: 45, check: 30, bet: 60 },
  tag: { fold: 35, call: 40, raise: 25, check: 45, bet: 45 },
  maniac: { fold: 5, call: 25, raise: 60, check: 20, bet: 70 },
  fish: { fold: 20, call: 60, raise: 10, check: 55, bet: 30 },
  gto_neutral: { fold: 35, call: 40, raise: 25, check: 50, bet: 40 },
};

// Weighted random pick from a { key: weight } table
function pickWeighted(weights) {
  const entries = Object.entries(weights || {}).filter(([, w]) => Number(w) > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) { r -= Number(w); if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

// Simulate the villain's response to the hero's last action.
// Returns an actionHistory entry ({ position, action, label, isVillain, street })
// or null. `street` is required by the analyze API to tell Check from Call —
// without it a preflop raise keeps reading as "facing a bet" on later streets.
function simulateVillainAction(villain, lastAction, texture, potSize, street) {
  if (!villain) return null;
  const table = VILLAIN_ACTION_TABLES[villain.archetype?.id] || VILLAIN_ACTION_TABLES.gto_neutral;
  const lastId = lastAction?.action || '';
  const facingBet = /^(bet_|raise|allin)/.test(lastId);
  let weights;
  if (facingBet) {
    weights = { fold: table.fold, call: table.call, raise: table.raise };
    // Pot odds: bigger bets fold out more of the range
    const pct = lastId.startsWith('bet_') ? parseInt(lastId.split('_')[1], 10) : 100;
    if (!isNaN(pct) && pct >= 75) { weights.fold *= 1.3; weights.call *= 0.85; }
    if (!isNaN(pct) && pct <= 33) { weights.fold *= 0.7; weights.call *= 1.2; }
  } else {
    weights = { check: table.check, bet_66: table.bet };
  }
  // Board texture modulation — wet boards get more aggression, dry boards more passivity
  if (texture?.isWet || texture?.isMonotone || texture?.flushPossible) {
    if (weights.raise != null) weights.raise *= 1.25;
    if (weights.bet_66 != null) weights.bet_66 *= 1.2;
  } else if (texture?.isDry) {
    if (weights.fold != null) weights.fold *= 1.2;
    if (weights.check != null) weights.check *= 1.15;
  }
  const action = pickWeighted(weights);
  if (!action) return null;
  const LABELS = { fold: 'Fold', call: 'Call', raise: 'Raise', check: 'Check', bet_66: 'Bet 66%' };
  return {
    position: villain.position || 'BB',
    action,
    label: LABELS[action] || action,
    isVillain: true,
    archetype: villain.archetype?.id || 'gto_neutral',
    street: street || undefined,
  };
}

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
// RECENT SESSIONS & BOOKMARKS SIDEBAR (Feature #6 + Gap #1)
// ═══════════════════════════════════════════════════════════════
function RecentSessionsSidebar({ isOpen, onClose, onLoad, leaderboardEntries, onLeakStats }) {
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
      {/* Study Analytics entry point */}
      {onLeakStats && (
        <button onClick={() => { onLeakStats(); onClose(); }}
          style={{
            width: '100%', padding: '10px', marginBottom: 8, borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
            color: '#c4b5fd', cursor: 'pointer', touchAction: 'manipulation',
          }}>Study Analytics</button>
      )}
      {/* Leaderboard */}
      <LeaderboardCard entries={leaderboardEntries || []} />
    </motion.div>
  );
}

// Hoisted static styles for the hot left/right control columns — avoids
// allocating a fresh style object per control on every keystroke re-render
const COL_LABEL = { fontSize: 8, color: '#65676B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 };
const COL_SELECT = { width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' };
const COL_INPUT = { width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', textAlign: 'center', boxSizing: 'border-box' };
const COL_INPUT_BOLD = { ...COL_INPUT, fontWeight: 700 };

// Memoized heavy children — avoids re-rendering the felt / action builder on
// unrelated keystrokes (pot + stack inputs re-render the whole page)
const MemoSandboxPokerTable = memo(SandboxPokerTable);
const MemoActionHistoryBuilder = memo(ActionHistoryBuilder);

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function VirtualSandbox() {
  const router = useRouter();
  const { analyze, isAnalyzing, results, error, clearResults } = useSandboxAnalysis();
  useArchetypes(); // warms the archetype cache for other panels
  const { guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
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
  const [potSize, setPotSize] = useState(1.5);
  const skipPotCalcRef = useRef(false); // Bug 14 fix: prevent pot size race on session restore
  const potBaseRef = useRef(1.5); // base pot (manual entry/preset) that actions fold on top of
  const [resultsOverride, setResultsOverride] = useState(null); // God Mode / comparison-restore override
  const primaryResultsRef = useRef(null); // cached primary results while position-comparing

  // UI State
  const [deckTarget, setDeckTarget] = useState(null); // 'hero1','hero2','board'
  const [showDeck, setShowDeck] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [selectedHeatmapAction, setSelectedHeatmapAction] = useState(null);
  const [comparePosition, setComparePosition] = useState(null);
  const [showResults, setShowResults] = useState(false); // fullscreen analysis popup
  const [showMenu, setShowMenu] = useState(false); // mobile overflow menu

  // Phase 1: Multi-Street Story Mode
  const [streetHistory, setStreetHistory] = useState([]);
  const [activeStreet, setActiveStreet] = useState(0);

  // Phase 1: Undo stack — snapshots are read from a live ref so pushUndo works
  // correctly even when called from stale useCallback closures (templates, voice)
  const liveStateRef = useRef(null);
  // Live pointer to streetHistory — runAnalysis may fire from a stale closure
  // (deal-then-analyze defers by 200ms), so reading `streetHistory.length`
  // directly would archive-then-display the PREVIOUS street.
  const streetHistoryRef = useRef([]);
  useEffect(() => {
    liveStateRef.current = { heroHand, heroPosition, heroStack, board, actionHistory, villains };
    streetHistoryRef.current = streetHistory;
  });
  const undoStackRef = useRef([]);
  const pushUndo = () => {
    const s = liveStateRef.current || { heroHand, heroPosition, heroStack, board, actionHistory, villains };
    undoStackRef.current.push({
      heroHand: { ...s.heroHand }, heroPosition: s.heroPosition, heroStack: s.heroStack,
      board: { ...s.board, flop: [...(s.board?.flop || [])] },
      actionHistory: [...(s.actionHistory || [])], villains: (s.villains || []).map(v => ({ ...v })),
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

  // Phase 1: Deal + Analyze for multi-street "story mode".
  // Archives the current street's results/equity into streetHistory, then deals
  // the next card. Returns the NEW board object (or null) so callers can
  // re-analyze against the post-deal board instead of a stale closure.
  const dealAndAnalyze = () => {
    if (results || resultsOverride) {
      // Include hero equity so EquityGraph can plot this street's data point
      const equityValue = equity?.heroEquity ?? null;
      const archived = {
        street: currentStreet,
        board: { ...board, flop: [...board.flop] },
        results: resultsOverride || results,
        equity: equityValue,   // Wave 2: required by EquityGraph
      };
      // State updaters must stay pure — compute the next length up front and
      // keep the live ref in sync immediately so a deferred runAnalysis sees it.
      const nextHistory = [...streetHistoryRef.current, archived];
      streetHistoryRef.current = nextHistory;
      setStreetHistory(nextHistory);
      setActiveStreet(nextHistory.length); // point at the live street
    }
    const newBoard = dealNextStreet();
    // New street — the villain leads/checks based on its archetype so the line
    // continues instead of freezing until the user types the next action.
    if (newBoard && villains[0]) {
      // The lead belongs to the street that was just dealt, not the one we
      // archived — tag it from newBoard.
      const lead = simulateVillainAction(villains[0], null, boardTexture, potSize, streetOfBoard(newBoard));
      if (lead) {
        setActionHistory(prev => [...prev, lead]);
        toast(`${lead.position} ${lead.label}`, { duration: 1800 });
      }
    }
    return newBoard;
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
    const correctLabel = (resultsOverride || results)?.optimalAction?.label || '';
    const isCorrect = correctLabel.length > 0 && actionsMatch(guess, correctLabel);
    setQuizScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
    // Persist quiz result (fire and forget) — server derives userId from the JWT
    try {
      const token = getAccessToken();
      if (token) {
        const hash = `${heroHand.card1}${heroHand.card2}_${heroPosition}_${board.flop.join('')}${board.turn || ''}${board.river || ''}`;
        fetch('/api/assistant/sandbox/sandbox-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ scenarioHash: hash, userAction: guess, correctAction: correctLabel, isCorrect }),
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
    if (s.villains) setVillains(withVillainIds(s.villains));
    if (s.actionHistory) setActionHistory(s.actionHistory);
    if (s.potSize != null) { skipPotCalcRef.current = true; potBaseRef.current = Number(s.potSize) || 1.5; setPotSize(Number(s.potSize) || 1.5); }
    setQuizMode(true); setQuizRevealed(false); setUserGuess(null);
    toast('Weekly spot loaded — press Analyze to start the quiz');
  };

  // Check first visit for onboarding
  // DISABLED: Tutorials should no longer auto-play per new standard.
  useEffect(() => {
    if (typeof window !== 'undefined') {
        // Auto-play disabled
    }
  }, []);

  // "Practice Leak in Sandbox" hand-off from the Leak Finder
  // (leaks.js → handlePracticeSandbox pushes ?leak=&leakType=&drill=).
  const [practiceFocus, setPracticeFocus] = useState(null);

  // Phase 4: Share link hydration — read URL query params on mount
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    // Leak-practice hand-off: turn on coach mode and surface what to work on
    // so the params actually change the page instead of dangling in the URL.
    if (q.leak || q.leakType || q.drill) {
      setPracticeFocus({
        leakId: q.leak || null,
        leakType: q.leakType || null,
        drill: q.drill || null,
      });
      setCoachMode(true);
      try { localStorage.setItem('sandbox-coach-mode', 'true'); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
    if (!q.h && !q.p && !q.b) return; // No share params
    const hand = q.h || '';
    if (hand.length >= 4) {
      setHeroHand({ card1: hand.substring(0, 2), card2: hand.substring(2, 4) });
    }
    if (q.p) setHeroPosition(q.p);
    if (q.s) setHeroStack(Number(q.s) || 100);
    if (q.g) setGameType(q.g);
    if (q.pot) { skipPotCalcRef.current = true; potBaseRef.current = Number(q.pot) || 1.5; setPotSize(Number(q.pot) || 1.5); }
    if (q.b) {
      const cards = q.b.includes(',') ? q.b.split(',').filter(Boolean) : q.b.match(/.{1,2}/g) || [];
      setBoard({ flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null });
    }
    // Clean URL after hydration (remove query params without navigation)
    if (typeof window !== 'undefined' && (q.h || q.b)) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [router.isReady]);

  // BUS LISTENER — broadcast sandbox data changes to other pages.
  // Fires only when a NEW analysis result arrives (not on hand/position edits),
  // reading the latest equity/quiz/scenario values via a ref to avoid stale closures.
  const busSnapshotRef = useRef({});
  useEffect(() => {
    busSnapshotRef.current = { heroPosition, heroHand, equity, quizScore };
  });
  useEffect(() => {
    if (results && typeof window !== 'undefined') {
      const snap = busSnapshotRef.current;
      window.dispatchEvent(new CustomEvent('pa-sandbox-updated', {
        detail: {
          heroPosition: snap.heroPosition,
          heroHand: `${snap.heroHand?.card1 || ''}${snap.heroHand?.card2 || ''}`,
          results: !!results, equity: snap.equity?.heroEquity || null,
          quizAccuracy: snap.quizScore?.total > 0 ? Math.round(snap.quizScore.correct / snap.quizScore.total * 100) : null,
        }
      }));
    }
  }, [results]);

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

  // Pot calculation — folds actionHistory on top of the manual base pot
  // (potBaseRef, set by the pot input / presets) so manual entries persist.
  // Tracks the last bet size so 'call' adds the actual amount called, and
  // 'allin' adds both effective stacks instead of discarding the prior pot.
  const foldPotThroughActions = useCallback((base, actions) => {
    let pot = Number(base) || 1.5;
    let lastBet = 0;
    (actions || []).forEach(a => {
      if (a.action === 'call') { pot += lastBet > 0 ? lastBet : pot * 0.5; lastBet = 0; }
      else if (a.action === 'raise') { const size = pot * 1.5; pot += size; lastBet = size; }
      else if (a.action === 'allin') {
        const effective = Math.min(Number(heroStack) || 100, Number(villains[0]?.stack) || 100);
        pot += 2 * effective; lastBet = 0;
      }
      else if (a.action === 'check' || a.action === 'fold') { lastBet = 0; }
      else if (a.action && a.action.startsWith('bet_')) {
        // Parse any bet_XX format (bet_33, bet_50, bet_66, bet_75, bet_100, bet_150, etc.)
        const pct = parseInt(a.action.split('_')[1], 10);
        if (!isNaN(pct) && pct > 0) { const size = pot * (pct / 100); pot += size; lastBet = size; }
      }
    });
    return Math.round(pot * 10) / 10;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroStack, villains]);

  useEffect(() => {
    // Bug 14 fix: skip recalc when restoring from session
    if (skipPotCalcRef.current) {
      skipPotCalcRef.current = false;
      return;
    }
    setPotSize(foldPotThroughActions(potBaseRef.current, actionHistory));
  }, [actionHistory, heroStack, foldPotThroughActions]);

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
  const [templateName, setTemplateName] = useState('');
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
  // Latest-callback ref pattern: the keydown listener is registered once but
  // always invokes the CURRENT closures (fixes stale first-render heroHand etc).
  const actionsRef = useRef({});
  useEffect(() => {
    const handleKey = (e) => {
      // Never hijack browser/system combos (Ctrl+A, Cmd+R, ...)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't fire shortcuts when typing in an input or textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const acts = actionsRef.current;
      // Ignore action keys while any modal is open (Escape still closes)
      if (acts.modalOpen && e.key !== 'Escape' && e.key !== '?') return;
      switch (e.key.toLowerCase()) {
        case 'a': acts.runAnalysis?.(); break;
        case 'r': acts.confirmReset?.(); break;
        case 'u': acts.popUndo?.(); break;
        case 's': acts.saveBookmark?.(); break;
        case 'c': acts.toggleCoachMode?.(); break;
        case '?': setShowShortcutLegend(prev => !prev); break;
        case 'escape': setShowResults(false); setShowShortcutLegend(false); break;
        default: break;
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', handleKey);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKey); };
  }, []); // registered once — reads live callbacks via actionsRef



  // ─── WAVE 2: Action Replay (Feature 8) ───────────────────────────────────
  const [replayIndex, setReplayIndex] = useState(null);
  // Compute replayed pot when in replay mode (same math as the live pot calc)
  const replayedPotSize = useMemo(() => {
    if (replayIndex == null) return potSize;
    return foldPotThroughActions(potBaseRef.current, actionHistory.slice(0, replayIndex + 1));
  }, [replayIndex, actionHistory, potSize, foldPotThroughActions]);
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

  // ── Wave 6: Shared Scenario Hydration — restores the FULL shared state
  // (board, hand, position, stack, game type, villains, pot, action history)
  useEffect(() => {
    if (typeof window !== 'undefined' && router.query.loadShared === 'true') {
      try {
        const payload = sessionStorage.getItem('shared-sandbox-state');
        if (payload) {
          const state = JSON.parse(payload);
          pushUndo();
          if (state.board) setBoard(state.board);
          if (state.villains) setVillains(withVillainIds(state.villains));
          if (state.heroHand) setHeroHand(state.heroHand);
          if (state.heroPosition) setHeroPosition(state.heroPosition);
          if (state.heroStack != null) setHeroStack(Number(state.heroStack) || 100);
          if (state.gameType) setGameType(state.gameType);
          if (Array.isArray(state.actionHistory)) setActionHistory(state.actionHistory);
          if (state.potSize != null) {
            skipPotCalcRef.current = true;
            potBaseRef.current = Number(state.potSize) || 1.5;
            setPotSize(Number(state.potSize) || 1.5);
          }
          sessionStorage.removeItem('shared-sandbox-state');
        }
      } catch (err) {
        console.warn('Failed to parse shared state payload', err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.loadShared]);

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

  // Save the current scenario as a template. `name` comes from the inline
  // input in the templates modal (prompt() is blocked in some in-app browsers);
  // falls back to an auto-generated label when omitted (menu shortcut path).
  const saveAsTemplate = useCallback(async (name) => {
    const label = (name || '').trim()
      || `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} ${board.flop.length ? `on ${board.flop.join('')}` : 'preflop'}`;
    try {
      const user = getAuthUser();
      if (!user) { toast.error('Sign in to save templates'); return; }
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/assistant/sandbox/sandbox-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name: label,
          scenario: { heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize },
        }),
      });
      toast.success('Template saved');
      loadTemplates();
    } catch (e) { console.warn('[Templates] Save error:', e); }
  }, [heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize, loadTemplates]);

  const loadTemplate = (t) => {
    if (!t?.scenario_json) return;
    const s = t.scenario_json;
    pushUndo();
    if (s.heroHand) setHeroHand(s.heroHand);
    if (s.heroPosition) setHeroPosition(s.heroPosition);
    if (s.heroStack != null) setHeroStack(s.heroStack);
    if (s.gameType) setGameType(s.gameType);
    if (s.board) setBoard(s.board);
    if (s.villains) setVillains(withVillainIds(s.villains));
    if (s.actionHistory) setActionHistory(s.actionHistory);
    if (s.potSize != null) { skipPotCalcRef.current = true; potBaseRef.current = Number(s.potSize) || 1.5; setPotSize(Number(s.potSize) || 1.5); }
    setShowTemplates(false);
  };

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
      if (json.success && Array.isArray(json.sessions)) {
        setSessionLog(json.sessions);
        idbSaveSessionLog(json.sessions); // Background sync W7-4
      }
    } catch (err) {
      console.warn('[Sandbox] session fetch error (falling back to IDB):', err);
      try {
        const offlineData = (await idbLoadSessionLog()) || [];
        if (offlineData.length > 0) setSessionLog(offlineData);
      } catch (idbErr) { console.warn('[Sandbox] IDB fallback error:', idbErr); }
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

  // Log analysis to leak tracker.
  // Receives the FRESH analysis response (and the coach pick, when present)
  // explicitly, so it never logs the previous analysis's stale action.
  const logAnalytics = useCallback(async (freshData, pickedAction, streetOverride) => {
    try {
      const user = getAuthUser();
      if (!user) return;
      const optimalLabel = freshData?.optimalAction?.label || null;
      const { data: { session } } = await supabase.auth.getSession();
      fetch('/api/assistant/sandbox/sandbox-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          position: heroPosition,
          street: streetOverride || currentStreet,
          gameType,
          action: optimalLabel,
          isCorrect: pickedAction && optimalLabel ? actionsMatch(pickedAction, optimalLabel) : null,
          handStrength: getHandStrength(heroHand)?.label || null,
        }),
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  }, [heroPosition, currentStreet, gameType, heroHand]);

  // Deck card selection handler — dual-card hero mode + multi-card flop
  const handleDeckSelect = (card) => {
    try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } // Haptic feedback
    playCardDeal();
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

  // Random board + deal next street (Feature #2).
  // Returns the NEW board object so callers can analyze the post-deal state
  // (React state updates are async — closures would otherwise see the old board).
  const dealNextStreet = () => {
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!allUsedCards.includes(c)) deck.push(c); }));
    if (deck.length === 0) return null; // Guard: no cards left in deck
    const card = deck[Math.floor(Math.random() * deck.length)];
    let newBoard = null;
    if (board.flop.length === 3 && !board.turn) newBoard = { ...board, turn: card };
    else if (board.turn && !board.river) newBoard = { ...board, river: card };
    if (!newBoard) return null;
    setBoard(newBoard);
    playCardDeal();
    return newBoard;
  };

  // Hero cards array — stable identity so the memoized table doesn't re-render
  const heroCardsMemo = useMemo(() => [heroHand.card1, heroHand.card2].filter(Boolean), [heroHand.card1, heroHand.card2]);

  // Full scenario snapshot shared by SaveHandModal / ShareScenarioModal / GodModePanel.
  // This is the exact shape the /sandbox/[id] viewer and the loadShared hydration
  // effect read back (effStack kept as an alias for legacy saved_hands rows).
  const sandboxSnapshot = useMemo(() => ({
    board,
    heroHand,
    heroPosition,
    heroStack: Number(heroStack) || 100,
    effStack: Number(heroStack) || 100,
    gameType,
    villains,
    potSize: Number(potSize) || 1.5,
    actionHistory,
  }), [board, heroHand, heroPosition, heroStack, gameType, villains, potSize, actionHistory]);

  // ── Villain action simulation ────────────────────────────────────────────
  // When the hero adds an action, the villain responds from its archetype
  // frequency table (modulated by board texture and pot odds), so a drill
  // becomes an interactive sequence instead of a hand-typed form.
  const addHeroAction = useCallback((a) => {
    playChipClick();
    const villain = villains[0];
    // Tag the street so the analyze API can tell "facing a bet" from a stale
    // earlier-street aggression (Check vs Call labelling).
    const entry = { ...a, street: a?.street || currentStreet };
    const response = (a?.position === heroPosition && villain)
      ? simulateVillainAction(villain, a, boardTexture, potSize, currentStreet)
      : null;
    setActionHistory(prev => (response ? [...prev, entry, response] : [...prev, entry]));
    if (response) {
      playCardDeal();
      try { navigator.vibrate?.(12); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
      toast(`${response.position} ${response.label}`, { duration: 1800 });
    }
  }, [villains, heroPosition, boardTexture, potSize, currentStreet, playChipClick, playCardDeal]);

  const removeAction = useCallback((i) => {
    setActionHistory(prev => prev.filter((_, j) => j !== i));
  }, []);

  // Save bookmark (Feature #5)
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'saved', 'error'
  const [ttsOverlay, setTtsOverlay] = useState(null); // Train This Spot in-place overlay
  // Persist bookmark payload to the localStorage store that useBookmarks
  // already reads for logged-out users (same payload shape as the DB row)
  const saveBookmarkLocally = (payload) => {
    if (!payload || typeof window === 'undefined') return false;
    try {
      const stored = JSON.parse(localStorage.getItem('sandbox_bookmarks') || '[]');
      localStorage.setItem('sandbox_bookmarks', JSON.stringify([payload, ...(Array.isArray(stored) ? stored : [])].slice(0, 100)));
      return true;
    } catch (e) {
      console.warn('[Sandbox] Local bookmark save error:', e?.message || e);
      return false;
    }
  };

  const saveBookmark = async () => {
    // Hoisted above the try so the catch's offline fallback can reference it
    let payload = null;
    try {
      const user = getAuthUser();
      setSaveStatus('saving');
      payload = {
        user_id: user?.id || null,
        hero_hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
        hero_position: heroPosition, hero_stack: heroStack, game_type: gameType,
        board_flop: board.flop.join(''), board_turn: board.turn, board_river: board.river,
        villains: JSON.stringify(villains), action_history: JSON.stringify(actionHistory),
        pot_size_bb: potSize,
        label: `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} on ${board.flop.join('')}`,
        created_at: new Date().toISOString(),
      };
      if (!user) {
        // Logged out — save to the localStorage store useBookmarks reads
        setSaveStatus(saveBookmarkLocally(payload) ? 'saved' : 'error');
        return;
      }
      const { error } = await supabase.from('sandbox_bookmarks').insert(payload);
      if (error) {
        console.warn('[Sandbox] Bookmark save error (table may not exist yet):', error.message);
        setSaveStatus(saveBookmarkLocally(payload) ? 'saved' : 'error');
      } else {
        setSaveStatus('saved');
        // 📢 Dispatch BUS LISTENER update for bookmark changes (persisted write)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));
        }
      }
    } catch (err) {
      console.warn('[Sandbox] Sync error (caching offline):', err);
      // Offline fallback — bookmarks go to the bookmark store, never the
      // session-log IDB store (their shapes are incompatible)
      setSaveStatus(payload && saveBookmarkLocally(payload) ? 'saved' : 'error');
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  // Shared payload builder — used by runAnalysis AND runPositionComparison so
  // both analyses run under identical villain/exploit/ICM assumptions.
  const buildAnalyzePayload = (positionOverride = null, boardOverride = null, resolvedPick = null) => {
    const effBoard = boardOverride || board;
    // Read the action line from the live ref: deferred callers (deal-then-analyze)
    // would otherwise send the pre-deal line from a stale closure.
    const effActions = liveStateRef.current?.actionHistory || actionHistory;
    const villainArcId = villains[0]?.archetype?.id || 'gto_neutral';
    const villainPos = villains[0]?.position || 'BB';
    const villainRangeStr = villains[0]?.range || getArchetypeRangeString(villainArcId, villainPos);
    const nodeLock = villains[0]?.nodeLock && villains[0].nodeLock !== 'None' ? villains[0].nodeLock : undefined;
    return {
      heroHand,
      heroPosition: positionOverride || heroPosition,
      heroStack: Number(heroStack) || 100,
      gameType, villains,
      board: effBoard,
      potSize: Number(potSize) || 1.5,
      actionHistory: effActions,
      betSizing: 'standard',
      exploitMode,
      villainArchetype: villainArcId,
      bubbleFactor: gameType === 'tournament' ? bubbleFactor : undefined,
      villainRange: villainRangeStr,
      nodeLock, // W7-3: villain node-lock deviation (server may factor into prompt)
      socratic: coachMode && resolvedPick ? { userPick: resolvedPick } : undefined,
    };
  };

  const streetOfBoard = (b) => {
    if (!b || (b.flop || []).length === 0) return 'preflop';
    if (!b.turn) return 'flop';
    if (!b.river) return 'turn';
    return 'river';
  };

  // Run analysis — with optional Socratic coach intercept
  // pickedAction: if provided, the coach mode user action (bypasses state timing issue)
  // boardOverride: freshly dealt board (React state is async — closures are stale post-deal)
  const runAnalysis = async (skipCoach = false, pickedAction = null, boardOverride = null) => {
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
    const effBoard = boardOverride || board;
    const payload = buildAnalyzePayload(null, effBoard, resolvedPick);
    const villainRangeStr = payload.villainRange;
    setResultsOverride(null); // any live analysis supersedes God Mode / restore overrides
    const data = await analyze(payload);
    setShowResults(true);
    setActiveStreet(streetHistoryRef.current.length); // a fresh analysis always shows the live street
    playAnalysisDing();
    // Log analytics with the FRESH response (never the previous results state)
    if (data?.success) logAnalytics(data, resolvedPick, streetOfBoard(effBoard));
    // Auto-append to session log (equity captured pre-analysis as current equity)
    const snapEquity = equity?.heroEquity ?? null;
    const snapHand = `${heroHand.card1}${heroHand.card2}`;
    const snapPos = heroPosition;
    const snapBoard = [...(effBoard.flop || []), effBoard.turn, effBoard.river].filter(Boolean).join(' ');
    const snapStreet = streetOfBoard(effBoard);
    setSessionLog(prev => {
      const next = [...prev, {
        id: Date.now(),
        hand: snapHand,
        position: snapPos,
        street: snapStreet,
        board: snapBoard,
        equity: snapEquity,
        optimalAction: null, // filled by the useEffect below when results arrive
        // Coach verdict fields (SessionReport / HandReplay read these)
        isCorrect: null,
        evDelta: null,
        userPick: resolvedPick || null,
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
    const gtoLabel = results.optimalAction.label;
    // Compute the coach verdict FIRST so the session-log entry can carry it
    const currentPick = coachUserPickRef.current;
    const hasPick = !!currentPick;
    const isCorrect = hasPick ? actionsMatch(currentPick, gtoLabel) : null;
    // Real EV delta when the solver returned a per-action EV for the user's pick;
    // otherwise fall back to a clearly-flagged heuristic estimate.
    const gtoEV = results.ev?.hero || 0;
    const picked = hasPick ? (results.actions || []).find(a => actionsMatch(a.label || a.id, currentPick)) : null;
    const pickedEV = picked && typeof picked.ev === 'number' ? picked.ev : null;
    let delta = null;
    let evDeltaEstimated = false;
    if (hasPick) {
      if (pickedEV != null) {
        delta = parseFloat((pickedEV - gtoEV).toFixed(3));
      } else {
        delta = isCorrect ? 0 : -(Math.abs(gtoEV) * 0.2);
        evDeltaEstimated = true;
      }
    }

    // Fill optimalAction + coach verdict fields in the last session log entry
    // (SessionReport / HandReplay read isCorrect, evDelta and userPick)
    setSessionLog(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && !last.optimalAction) {
        updated[updated.length - 1] = {
          ...last,
          optimalAction: gtoLabel,
          isCorrect: hasPick ? isCorrect : (last.isCorrect ?? null),
          evDelta: hasPick ? delta : (last.evDelta ?? null),
          evDeltaEstimated: hasPick ? evDeltaEstimated : false,
          userPick: hasPick ? currentPick : (last.userPick ?? null),
        };
      }
      return updated;
    });

    if (hasPick && results.ev) {
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
      const snapBoardFull = [...(board.flop || []), board.turn, board.river].filter(Boolean).join(' ');
      setRecentResults(prev => [...prev.slice(-9), { isCorrect, evDelta: delta, evDeltaEstimated, hand: `${heroHand?.card1 || ''}${heroHand?.card2 || ''}`, position: heroPosition, street: currentStreet, userPick: currentPick, optimalAction: gtoLabel, board: snapBoardFull }]);

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
                board: snapBoardFull,
                userPick: currentPick,
                gtoAction: gtoLabel,
                isCorrect,
                evDelta: delta,
                evDeltaEstimated, // heuristic flag — downstream stats can exclude these
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

  // Position comparison (Feature #11) — uses the SAME payload builder as
  // runAnalysis so the compared position is evaluated under identical villain /
  // exploit / ICM assumptions. The primary result is cached so returning to the
  // hero position restores it without a second network round-trip.
  const runPositionComparison = async (pos) => {
    if (!comparePosition) primaryResultsRef.current = resultsOverride || results;
    setComparePosition(pos);
    setResultsOverride(null);
    await analyze(buildAnalyzePayload(pos));
  };

  // Return from a comparison to the hero's own position
  const restorePrimaryResults = async () => {
    setComparePosition(null);
    if (primaryResultsRef.current) {
      setResultsOverride(primaryResultsRef.current);
      primaryResultsRef.current = null;
      return;
    }
    await analyze(buildAnalyzePayload());
  };

  const resetAll = () => {
    setHeroHand({ card1: null, card2: null });
    setBoard({ flop: [], turn: null, river: null });
    setActionHistory([]);
    potBaseRef.current = 1.5;
    skipPotCalcRef.current = true;
    setPotSize(1.5);
    clearResults();
    setResultsOverride(null);
    primaryResultsRef.current = null;
    setShowResults(false);
    setComparePosition(null);
    // Phase 1-4 state reset
    // Reset the live pointer alongside the state so an analysis fired in the
    // same tick as the reset does not read the pre-reset length.
    streetHistoryRef.current = [];
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

  // Reset is destructive — confirm when there is anything worth losing
  const confirmReset = () => {
    const hasWork = !!(results || resultsOverride || actionHistory.length > 0 || heroHand.card1 || board.flop.length);
    if (hasWork && typeof window !== 'undefined' && !window.confirm('Reset the whole scenario? This clears the hand, board and action line.')) return;
    resetAll();
  };

  // Restore a scenario from a session-log entry (shared by SessionLogModal and
  // HandReplay). Entries store the FULL board as a space-separated string.
  const loadSessionEntry = (entry) => {
    if (!entry) return;
    pushUndo();
    if (entry.hand && entry.hand.length >= 4) {
      setHeroHand({ card1: entry.hand.substring(0, 2), card2: entry.hand.substring(2, 4) });
    }
    if (entry.position) setHeroPosition(entry.position);
    const cards = (entry.board || '').split(' ').filter(Boolean);
    setBoard({ flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null });
    // Clear action history so the line starts fresh for this loaded hand
    setActionHistory([]);
    potBaseRef.current = 1.5;
    skipPotCalcRef.current = true;
    setPotSize(1.5);
    try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  // Keyboard shortcuts read their callbacks from here (registered once, always fresh)
  const anyModalOpen = showDeck || showCoachPicker || showSaveHand || showShareScenario || showGodMode
    || showSolverImport || showHHImport || showTemplates || showLeakStats || showSessionLog
    || showRangeExplorer || showQuickDrill || showCustomDrill || showSessionReport
    || showVillainPresets || showHandReplay || showStudyFolders || showShareHand || showRangeGrid || showSessions;
  useEffect(() => {
    actionsRef.current = {
      runAnalysis: () => runAnalysis(),
      confirmReset,
      popUndo,
      saveBookmark,
      toggleCoachMode,
      modalOpen: anyModalOpen,
    };
  });

  // Which results the popup renders: a selected past street > God-Mode/restore
  // override > the live analysis result.
  const historicResults = (activeStreet < streetHistory.length) ? streetHistory[activeStreet]?.results : null;
  const displayResults = historicResults || resultsOverride || results;
  const isHistoricView = !!historicResults;

  // Source badge
  const sourceBadge = displayResults ? (
    displayResults.matchTier <= 2 ? { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#4ade80', label: 'PIO Verified' }
      : displayResults.matchTier === 3 ? { bg: 'rgba(251,191,36,0.15)', border: '#fbbf24', text: '#fde68a', label: 'PIO Approximated' }
        : { bg: 'rgba(139,92,246,0.15)', border: '#8b5cf6', text: '#c4b5fd', label: 'AI Analysis' }
  ) : null;

  return (
    <div className="sandbox-page" style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#18191A', color: '#E4E6EB', fontFamily: "'Inter',-apple-system,sans-serif" }}>
      {UpgradePopup}
      {/* Toast host — this page fires ~8 toasts (template saved, hand imported,
          link copied, villain actions). Page-level, matching leaks.js. */}
      <Toaster position="top-right" />
      {/* Onboarding Tour */}
      <OnboardingTour isVisible={showTour} step={tourStep}
        onClose={dismissTour} onNext={() => setTourStep(s => s + 1)} />

      {/* Share Modal */}
      <ShareAnalysisModal isOpen={showShare} onClose={() => setShowShare(false)}
        results={displayResults} scenario={{ board: communityCards.join(' ') }} />

      {/* ── Wave 2 Modals ── */}
      {/* Wave 3: Keyboard shortcut legend (press ? key to toggle) */}
      <ShortcutLegend isOpen={showShortcutLegend} onClose={() => setShowShortcutLegend(false)} />
      <SessionLogModal
        isOpen={showSessionLog}
        onClose={() => setShowSessionLog(false)}
        sessionLog={sessionLog}
        onClearSession={() => { setSessionLog([]); idbSaveSessionLog([]); }}
        onLoadEntry={(entry) => loadSessionEntry(entry)}
      />
      <CoachActionPicker
        isOpen={showCoachPicker}
        onPick={handleCoachPick}
        onSkip={handleCoachSkip}
      />
      <ShareHandModal
        isOpen={showShareHand}
        onClose={() => setShowShareHand(false)}
        results={displayResults}
        heroHand={heroHand}
        board={board}
        scenario={{ position: heroPosition }}
        cardRef={exportCardRef}
      />

      {/* Sessions Sidebar */}
      <AnimatePresence>{showSessions && (
        <RecentSessionsSidebar isOpen onClose={() => setShowSessions(false)} leaderboardEntries={leaderboardEntries}
          onLeakStats={() => { setShowLeakStats(true); loadLeakStats(); }}
          onLoad={(session) => {
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
            // Ensure all villain stacks are numeric (DB may store as strings) + stable ids
            setVillains(withVillainIds(session.villain_config.map(v => ({ ...v, stack: Number(v.stack) || 100 }))));
          } else {
            // Default villain if missing
            setVillains([{ id: 0, position: session.hero_position === 'BB' ? 'SB' : 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: Number(session.hero_stack) || 100 }]);
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
            potBaseRef.current = Number(session.pot_size_bb) || 1.5;
            setPotSize(Number(session.pot_size_bb) || 1.5);
          }
          clearResults();
          setResultsOverride(null);
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
          hasResults: !!displayResults,
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
          onReset: () => confirmReset(),
          onReplay: () => setShowHandReplay(true),
          onResults: () => setShowResults(true),
          onShare: () => setShowShare(true),
          onSave: () => saveBookmark(),
          onSessions: () => setShowSessions(true),
          onFolders: () => setShowStudyFolders(true),
          onLog: () => setShowSessionLog(true),
          onTemplates: () => { setShowTemplates(true); loadTemplates(); },
          onSaveTemplate: () => saveAsTemplate(),
          onSaveSpot: () => setShowSaveHand(true),
          onShareScenario: () => setShowShareScenario(true),
          onImportHH: () => setShowHHImport(true),
          onLeakStats: () => { setShowLeakStats(true); loadLeakStats(); },
          onAnalytics: () => { setShowLeakStats(true); loadLeakStats(); },
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

      {/* ── LEAK PRACTICE BANNER — from Leak Finder "Practice in Sandbox" ── */}
      {practiceFocus && (
        <div style={{
          margin: '6px 10px 0', padding: '8px 12px', borderRadius: 10,
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#fbbf24', fontWeight: 700 }}>
              Practicing a leak
            </div>
            <div style={{ fontSize: 12, color: '#E4E6EB', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(practiceFocus.leakType || 'Leak drill')}
              {practiceFocus.drill ? ` — ${String(practiceFocus.drill)}` : ''}
            </div>
            <div style={{ fontSize: 10, color: '#B0B3B8', marginTop: 2 }}>
              Coach mode is on — pick your action before each analysis.
            </div>
          </div>
          <button onClick={() => setPracticeFocus(null)}
            style={{ background: 'none', border: 'none', color: '#B0B3B8', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}
            aria-label="Dismiss leak practice banner">x</button>
        </div>
      )}

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
            <div style={COL_LABEL}>Position</div>
            <select value={heroPosition} onChange={e => setHeroPosition(e.target.value)}
              style={COL_SELECT}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Game Type */}
          <div>
            <div style={COL_LABEL}>Game</div>
            <select value={gameType} onChange={e => setGameType(e.target.value)}
              style={COL_SELECT}>
              {GAME_TYPES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>

          {/* Villain Position */}
          <div>
            <div style={COL_LABEL}>Villain</div>
            <select value={villains[0]?.position || 'BB'} onChange={e => {
              const newPos = e.target.value;
              const archetypeId = villains[0]?.archetype?.id || 'gto_neutral';
              // Also re-compute range/VPIP for the new position
              const range = getArchetypeRangeString(archetypeId, newPos);
              const vpip = getArchetypeVPIP(archetypeId, newPos);
              setVillains(prev => prev.map((v, i) => i === 0 ? { ...v, position: newPos, range, vpip } : v));
            }}
              style={COL_SELECT}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {/* Villain stack (BB) — editable so effective-stack math is real */}
            <input type="text" inputMode="numeric" value={villains[0]?.stack ?? 100}
              aria-label="Villain stack in big blinds"
              onChange={e => {
                const raw = e.target.value.replace(/\D/g, '');
                const val = raw === '' ? '' : Math.min(500, parseInt(raw, 10));
                setVillains(prev => prev.map((v, i) => i === 0 ? { ...v, stack: val } : v));
              }}
              onBlur={() => setVillains(prev => prev.map((v, i) => i === 0 ? { ...v, stack: Number(v.stack) || 100 } : v))}
              style={{ width: '100%', marginTop: 2, padding: '3px', borderRadius: 5, fontSize: 10, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', textAlign: 'center', boxSizing: 'border-box' }} />
          </div>


          {/* Villain Style */}
          <div>
            <div style={COL_LABEL}>Style</div>
            <select value={villains[0]?.archetype?.id || 'gto_neutral'}
              onChange={e => handleVillainArchetypeChange(0, e.target.value)}
              style={{ width: '100%', padding: '4px 3px', borderRadius: 5, fontSize: 10, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
              {/* No icon here: `a.icon` is a lucide-react component NAME, and an
                  <option> cannot host a React element — name only. */}
              {Object.values(ARCHETYPE_CONFIG || {}).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
              <div style={COL_LABEL}>Bubble Factor</div>
              <input type="range" min="1" max="3" step="0.1" value={bubbleFactor}
                onChange={e => setBubbleFactor(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#f59e0b', marginBottom: 2 }} />
              <div style={{ fontSize: 9, color: '#fbbf24', textAlign: 'center', fontWeight: 700 }}>{bubbleFactor.toFixed(1)}x</div>
              <div style={{ fontSize: 8, color: '#65676B', textAlign: 'center' }}>{bubbleFactor <= 1.2 ? 'Deep' : bubbleFactor <= 2.0 ? 'Bubble' : 'Final Table'}</div>
            </div>
          )}

          {/* Stack */}
          <div>
            <div style={COL_LABEL}>Stack (BB)</div>
            <input type="text" inputMode="numeric" value={heroStack}
              onChange={e => { const val = Math.min(500, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)); setHeroStack(val === 0 ? '' : val); }}
              onBlur={() => setHeroStack(h => h || 100)}
              style={COL_INPUT} />
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
            <MemoSandboxPokerTable
              heroCards={heroCardsMemo}
              communityCards={communityCards}
              pot={Number(potSize) || 0}
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
              onSwipeLeft={() => { if (board.flop.length === 3 && !board.river) dealAndAnalyze(); }}
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
            <div style={COL_LABEL}>Pot (BB)</div>
            <input type="text" inputMode="decimal" value={potSize}
              onChange={e => {
                const val = parseFloat(e.target.value.replace(/[^\d.]/g, ''));
                skipPotCalcRef.current = true;
                // Manual entry becomes the new base pot so action folding builds on it
                if (!isNaN(val)) potBaseRef.current = val;
                setPotSize(isNaN(val) ? '' : val);
              }}
              onBlur={() => { if (!potSize && potSize !== 0) { potBaseRef.current = 1.5; skipPotCalcRef.current = true; setPotSize(1.5); } }}
              style={COL_INPUT_BOLD} />
            <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
              {[3, 6, 10, 20].map(p => (
                <button key={p} onClick={() => { skipPotCalcRef.current = true; potBaseRef.current = p; setPotSize(p); }}
                  style={{ flex: 1, padding: '2px 0', borderRadius: 3, fontSize: 9, fontWeight: 600, background: potSize === p ? 'rgba(35,116,225,0.2)' : '#3A3B3C', border: `1px solid ${potSize === p ? 'rgba(35,116,225,0.3)' : '#4E4F50'}`, color: potSize === p ? '#4599FF' : '#B0B3B8', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          </div>

          {/* Board */}
          <div>
            <div style={COL_LABEL}>Board</div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              {board.flop.map((c, i) => <CardSlot key={`f${i}`} card={c} onRemove={() => { const f = [...board.flop]; f.splice(i, 1); setBoard({ flop: f, turn: null, river: null }); }} />)}
              {board.flop.length < 3 && <CardSlot label="+" onClick={openBoardPicker} />}
              {board.flop.length === 3 && <CardSlot card={board.turn} label="T" onClick={openBoardPicker} onRemove={() => setBoard(b => ({ ...b, turn: null, river: null }))} />}
              {board.turn && <CardSlot card={board.river} label="R" onClick={openBoardPicker} onRemove={() => setBoard(b => ({ ...b, river: null }))} />}
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
              <button onClick={randomBoard} style={{ flex: 1, padding: '3px 4px', borderRadius: 4, fontSize: 8, background: 'rgba(35,116,225,0.12)', border: 'none', color: '#4599FF', cursor: 'pointer', fontWeight: 600 }}>Random</button>
              {board.flop.length === 3 && !board.river && (
                <button onClick={() => dealAndAnalyze()} style={{ flex: 1, padding: '3px 4px', borderRadius: 4, fontSize: 8, background: 'rgba(34,197,94,0.12)', border: 'none', color: '#86efac', cursor: 'pointer', fontWeight: 600 }}>
                  {!board.turn ? 'Turn' : 'River'}
                </button>
              )}
            </div>
            {/* Hand-history import entry point (W8-1) */}
            <button onClick={() => setShowHHImport(true)}
              style={{ width: '100%', marginTop: 3, padding: '3px 4px', borderRadius: 4, fontSize: 8, background: 'rgba(139,92,246,0.12)', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontWeight: 600 }}>
              Import Hand
            </button>
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
            <MemoActionHistoryBuilder actions={actionHistory}
              onAdd={addHeroAction}
              onRemove={removeAction}
              potSize={Number(replayIndex != null ? replayedPotSize : potSize) || 0} />
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

          {/* Weekly Challenge (API returns a weekly spot) */}
          {weeklySpot && (
            <button onClick={() => loadWeeklySpot(weeklySpot)}
              style={{ width: '100%', padding: '6px 4px', borderRadius: 8, fontSize: 8, fontWeight: 700, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Weekly Challenge
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
      {displayResults && (
        <div style={{ marginTop: '8px', background: '#242526', borderRadius: 10, padding: '10px' }}>
          <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px', fontWeight: 700 }}>Compare Position</h4>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {POSITIONS.map(p => {
              const isCurrentTarget = comparePosition ? comparePosition === p : heroPosition === p;
              return (
                <button key={p}
                  onClick={() => {
                    if (p === heroPosition) restorePrimaryResults();
                    else runPositionComparison(p);
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
          if (!parsed) return;
          pushUndo();
          if (parsed.heroHand) setHeroHand(parsed.heroHand);
          if (parsed.heroPosition && POSITIONS.includes(parsed.heroPosition)) setHeroPosition(parsed.heroPosition);
          if (parsed.heroStack != null) setHeroStack(Number(parsed.heroStack) || 100);
          if (parsed.gameType) setGameType(parsed.gameType);
          if (parsed.board) {
            setBoard(Array.isArray(parsed.board)
              ? { flop: parsed.board.slice(0, 3), turn: parsed.board[3] || null, river: parsed.board[4] || null }
              : parsed.board);
          }
          if (parsed.villains?.length) setVillains(withVillainIds(parsed.villains));
          if (parsed.actionHistory?.length) setActionHistory(parsed.actionHistory);
          if (parsed.potSize != null) { skipPotCalcRef.current = true; potBaseRef.current = Number(parsed.potSize) || 1.5; setPotSize(Number(parsed.potSize) || 1.5); }
          toast.success('Hand imported');

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
            loadSessionEntry(entry);
            setShowHandReplay(false);
          }}
          onClose={() => setShowHandReplay(false)}
        />
      )}

      {/* ═══ WAVE 6 MODALS ═══ */}
      {showStudyFolders && (
        <StudyFolders
          onLoadTarget={(state) => {
            // Rehydrate logic wrapper
            if (!state) return;
            pushUndo();
            if (state.board) setBoard(state.board);
            if (state.villains) setVillains(withVillainIds(state.villains));
            if (state.heroHand) setHeroHand(state.heroHand);
            if (state.heroPosition) setHeroPosition(state.heroPosition);
            if (state.heroStack != null || state.effStack != null) setHeroStack(Number(state.heroStack ?? state.effStack) || 100);
            if (state.gameType) setGameType(state.gameType);
            if (Array.isArray(state.actionHistory)) setActionHistory(state.actionHistory);
            if (state.potSize != null) { skipPotCalcRef.current = true; potBaseRef.current = Number(state.potSize) || 1.5; setPotSize(Number(state.potSize) || 1.5); }
          }}
          onClose={() => setShowStudyFolders(false)} />
      )}

      {showSaveHand && (
        <SaveHandModal
          sandboxState={sandboxSnapshot}
          onSaveComplete={() => setShowSaveHand(false)}
          onClose={() => setShowSaveHand(false)} />
      )}

      {showShareScenario && (
        <ShareScenarioModal
          sandboxState={sandboxSnapshot}
          onClose={() => setShowShareScenario(false)} />
      )}

      {showGodMode && (
        <GodModePanel
          onClose={() => setShowGodMode(false)}
          sandboxState={sandboxSnapshot}
          setResults={(mock) => {
            // GodModePanel passes ONE mock object:
            // { evDelta, optimalAction, frequencies, gtoSizing, isCorrect, forcedMode }
            if (!mock) return;
            const freqs = mock.frequencies || {};
            const ev = Number(mock.evDelta) || 0;
            setResultsOverride({
              optimalAction: { id: String(mock.optimalAction || '').toLowerCase(), label: mock.optimalAction, frequency: 100, color: '#22c55e' },
              actions: Object.entries(freqs).map(([label, f]) => ({
                id: label.toLowerCase(),
                label,
                frequency: Number(f) || 0,
                isOptimal: label === mock.optimalAction,
              })),
              isMixed: false,
              ev: {
                hero: ev,
                heroDisplay: `${ev >= 0 ? '+' : ''}${ev.toFixed(2)} BB`,
                max: ev, min: ev, avg: ev, evLoss: 0,
              },
              matchTier: 4,
              source: 'God Mode Override',
              explanation: `Forced override: ${mock.optimalAction} at 100% (sizing ${mock.gtoSizing || 'N/A'}).`,
            });
            setShowResults(true);
            toast('God Mode result injected');
          }}
        />
      )}

      {showSolverImport && (
        <ExternalSolverImport
          onClose={() => setShowSolverImport(false)}
          onImport={(state) => {
            if (!state) return;
            pushUndo();
            // The parser emits board as an ARRAY of 2-char cards; this page's
            // board state is { flop, turn, river }.
            if (Array.isArray(state.board)) {
              setBoard({ flop: state.board.slice(0, 3), turn: state.board[3] || null, river: state.board[4] || null });
            } else if (state.board) {
              setBoard(state.board);
            }
            if (typeof state.heroPosition === 'string' && POSITIONS.includes(state.heroPosition)) setHeroPosition(state.heroPosition);
            if (Array.isArray(state.villains)) {
              setVillains(withVillainIds(state.villains.map(v => ({
                position: v.position || 'BB',
                archetype: v.archetype || { id: 'gto_neutral', name: 'GTO Neutral' },
                stack: Number(v.stack) || 100,
                range: v.range || '',
                nodeLock: v.nodeLock,
              }))));
            }
            if (state.potSize != null) { skipPotCalcRef.current = true; potBaseRef.current = Number(state.potSize) || 1.5; setPotSize(Number(state.potSize) || 1.5); }
            if (state.effStack != null) setHeroStack(Number(state.effStack) || 100);

            // Flash success check (saveStatus idles at null, not 'idle')
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(null), 2000);
          }}
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
              {/* Save the current scenario (inline input — prompt() is blocked in some in-app browsers) */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input
                  type="text"
                  value={templateName}
                  placeholder="Template name (optional)"
                  onChange={e => setTemplateName(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', textTransform: 'none' }}
                />
                <button onClick={async () => { await saveAsTemplate(templateName); setTemplateName(''); }}
                  style={{ padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Save Current
                </button>
              </div>
              {templates.length === 0 ? (
                <p style={{ fontSize: 11, color: '#65676B', textAlign: 'center', padding: 20 }}>No saved templates yet. Save the current scenario above.</p>
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
        {displayResults && showResults && (
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

              {/* WAVE 7-3 NODE LOCK EXPLOITS — display + analyze-payload deviation */}
              <NodeLockExploits
                isVisible={showNodeLocks}
                villains={villains}
                updateVillainLock={(vid, lockType) => {
                  setVillains(v => v.map((villain, idx) => ((villain.id ?? idx) === vid ? { ...villain, nodeLock: lockType } : villain)));
                }}
              />

              {/* ══ ACTION BUTTONS ══ */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ color: '#E4E6EB', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>
                  Analysis Results {comparePosition ? `(${comparePosition})` : ''}
                  {isHistoricView ? ` — ${streetHistory[activeStreet]?.street || 'Past Street'}` : ''}
                </h3>
                <button onClick={() => setShowResults(false)} style={{
                  background: '#3A3B3C', border: 'none', borderRadius: '50%',
                  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#E4E6EB', fontSize: 20, cursor: 'pointer', touchAction: 'manipulation',
                  flexShrink: 0,
                }}>✕</button>
              </div>

              {/* Equity heatmap (W7-2) — needs an array of community cards and a
                  positioned container (the overlay is absolutely positioned) */}
              {showHeatmap && communityCards.length >= 3 && (
                <div style={{ position: 'relative', height: 220, borderRadius: 12, overflow: 'hidden', marginBottom: 12, background: '#18191A', border: '1px solid #3A3B3C' }}>
                  <EquityHeatmapOverlay
                    isVisible={showHeatmap}
                    board={communityCards}
                    heroPosition={heroPosition}
                    villains={villains}
                    equity={equity}
                  />
                </div>
              )}

              {/* Street Timeline — Phase 1 (selecting a past street shows its stored results) */}
              <StreetTimeline streetHistory={streetHistory} activeStreet={activeStreet} onSelectStreet={setActiveStreet} />
              {isHistoricView && (
                <button onClick={() => setActiveStreet(streetHistory.length)}
                  style={{ width: '100%', padding: '6px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: 'rgba(35,116,225,0.12)', border: '1px solid rgba(35,116,225,0.25)', color: '#4599FF', cursor: 'pointer', marginBottom: 10 }}>
                  Back To Current Street
                </button>
              )}

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
              {quizMode && displayResults && (
                <QuizPanel onGuess={handleQuizGuess} correctAction={displayResults.optimalAction?.label} revealed={quizRevealed} userGuess={userGuess} score={quizScore} />
              )}

              {/* Wave 2: Coach Verdict — shown when coach mode picked an action */}
              {coachMode && coachUserPick && displayResults && (
                <CoachVerdict
                  userPick={coachUserPick}
                  gtoAction={displayResults.optimalAction?.label}
                  evDelta={coachEvDelta}
                />
              )}

              {/* Wave 5: AI Coach Feedback — contextual tip after verdict */}
              {coachMode && coachUserPick && displayResults && (
                <CoachFeedback
                  results={displayResults}
                  heroHand={heroHand}
                  heroPosition={heroPosition}
                  coachUserPick={coachUserPick}
                  isCorrect={actionsMatch(coachUserPick, displayResults.optimalAction?.label)}
                />
              )}

              {/* Wave 5: Tilt Awareness Monitor */}
              {coachMode && recentResults.length >= 3 && (
                <TiltMonitor recentResults={recentResults} />
              )}

              {/* Wave 3: Villain Intel card — shows archetype exploit tips */}
              {displayResults && villains?.[0] && (
                <VillainReadCard villain={villains[0]} />
              )}

              {/* Wave 2: Equity Graph — shown when multi-street history exists */}
              <EquityGraph streetHistory={streetHistory} currentEquity={equity?.heroEquity} />



              {getResultsSummary(displayResults) && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.15)', marginBottom: 12, fontSize: 12, lineHeight: 1.5, color: '#E4E6EB', textTransform: 'none' }}>
                  {getResultsSummary(displayResults)}
                </div>
              )}

              {/* Source Badge */}
              {sourceBadge && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.text }}>{sourceBadge.label}</div>
                  <span style={{ fontSize: 10, color: '#B0B3B8' }}>{displayResults.source}</span>
                </div>
              )}

              {/* Optimal Action */}
              {displayResults.optimalAction && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px', marginBottom: 12, textAlign: 'center' }}>
                  <div style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {displayResults.isMixed ? 'Primary (Mixed)' : 'Optimal (Pure)'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Orbitron',sans-serif", color: displayResults.optimalAction.color || '#22c55e' }}>
                    {displayResults.optimalAction.label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>{displayResults.optimalAction.frequency}%</div>
                </div>
              )}

              {/* EV Display */}
              {displayResults.ev?.heroDisplay && displayResults.ev.heroDisplay !== '—' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: 12 }}>
                  {[
                    { l: 'Hand EV', v: displayResults.ev.heroDisplay, c: displayResults.ev.hero >= 0 ? '#22c55e' : '#ef4444' },
                    { l: 'EV Loss', v: displayResults.ev.evLoss > 0 ? `-${displayResults.ev.evLoss.toFixed(2)}` : '0.00', c: displayResults.ev.evLoss > 0 ? '#ef4444' : '#22c55e' },
                    { l: 'Avg EV', v: `${displayResults.ev.avg >= 0 ? '+' : ''}${displayResults.ev.avg.toFixed(2)}`, c: '#B0B3B8' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: '#3A3B3C', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#B0B3B8', textTransform: 'uppercase' }}>{item.l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Orbitron',monospace", color: item.c, marginTop: 2 }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ICM-Adjusted EV (Tournament mode with bubble factor) */}
              {displayResults.icmAdjusted && displayResults.icmEV && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 12, padding: '6px 10px', borderRadius: '8px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <span style={{ fontSize: '10px', color: '#fde68a', fontWeight: '700', textTransform: 'uppercase' }}>ICM EV ({displayResults.bubbleFactor?.toFixed(1)}x)</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', fontFamily: "'Orbitron',monospace", color: displayResults.icmEV.hero >= 0 ? '#4ade80' : '#fca5a5' }}>{displayResults.icmEV.heroDisplay}</span>
                </div>
              )}

              {/* Frequency Bars */}
              <div style={{ background: '#3A3B3C', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px', fontWeight: 700 }}>GTO Frequencies</h4>
                {displayResults.actions?.map(a => <FrequencyBar key={a.id} action={a} isOptimal={a.isOptimal} />)}
              </div>

              {/* Tree Visualization */}
              <TreeVisualization actions={displayResults.actions} />

              {/* Sizing Sensitivity */}
              <SizingSensitivity results={displayResults} />

              {/* Explanation */}
              {displayResults.explanation && (
                <div style={{ background: 'rgba(35,116,225,0.06)', border: '1px solid rgba(35,116,225,0.15)', borderRadius: 8, padding: '10px', marginBottom: 12 }}>
                  <div style={{ color: '#B0B3B8', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>Analysis</div>
                  <p style={{ color: '#E4E6EB', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{displayResults.explanation}</p>
                </div>
              )}

              {/* Range Matrix — from solver data */}
              {displayResults.rangeHeatmap && (
                <div style={{ background: '#3A3B3C', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: 0, fontWeight: 700 }}>
                      Range Heatmap ({displayResults.rangeHeatmap.totalHands})
                    </h4>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {displayResults.rangeHeatmap.actions?.slice(0, 4).map(a => (
                        <button key={a.id} onClick={() => setSelectedHeatmapAction(a.id)}
                          style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, border: 'none', cursor: 'pointer',
                            background: (selectedHeatmapAction || displayResults.rangeHeatmap.actions[0]?.id) === a.id ? 'rgba(35,116,225,0.3)' : '#242526',
                            color: (selectedHeatmapAction || displayResults.rangeHeatmap.actions[0]?.id) === a.id ? '#4599FF' : '#B0B3B8',
                          }}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                  <RangeMatrix rangeHeatmap={displayResults.rangeHeatmap} selectedAction={selectedHeatmapAction} />
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
                </div>
              )}

              {/* Multi-Street — Feature #2.
                  dealAndAnalyze archives the current street into streetHistory and
                  returns the NEW board, which is passed explicitly to runAnalysis so
                  the analysis matches the card that was just dealt. */}
              {board.flop.length === 3 && !board.river && (
                <button onClick={() => {
                  const newBoard = dealAndAnalyze();
                  if (newBoard) setTimeout(() => runAnalysis(true, null, newBoard), 200);
                }}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none',
                    color: '#fff', cursor: 'pointer', marginBottom: 8,
                  }}>
                  Deal {!board.turn ? 'Turn' : 'River'} & Re-Analyze ▸
                </button>
              )}

              {/* Export to Image -- Phase 4 */}
              <ExportCard results={displayResults} scenario={{ position: heroPosition, hand: `${heroHand.card1 || '?'}${heroHand.card2 || '?'}`, board: communityCards.join(' ') || 'Preflop' }} />

              {/* Collaborative Share Link -- Phase 4 (full query-param fidelity) */}
              <button onClick={() => {
                const params = new URLSearchParams({
                  h: `${heroHand.card1 || ''}${heroHand.card2 || ''}`, p: heroPosition, s: String(Number(heroStack) || 100),
                  g: gameType, b: communityCards.join(','), pot: String(Number(potSize) || 1.5),
                });
                const url = `${window.location.origin}/hub/personal-assistant/sandbox?${params.toString()}`;
                navigator.clipboard?.writeText(url)
                  .then(() => toast.success('Link copied'))
                  .catch(() => toast.error('Copy failed'));
              }} style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', color: '#4ade80', cursor: 'pointer', marginBottom: 8 }}>
                Copy Share Link
              </button>

              {/* Short-link share (W6-2) — persists the FULL scenario (villains,
                  action history, stacks) behind a /sandbox/<id> link */}
              <button onClick={() => setShowShareScenario(true)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.2)', color: '#4599FF', cursor: 'pointer', marginBottom: 8 }}>
                Share Scenario
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

        /* Title-case headings and short labels ONLY — never body copy, AI
           explanations, coach feedback or case-sensitive poker notation. */
        .sandbox-page h1,
        .sandbox-page h3,
        .sandbox-page h4,
        .sandbox-page label,
        .sandbox-page .cap {
          text-transform: capitalize;
        }
        /* Explicitly preserve case for prose and code-like elements */
        .sandbox-page input,
        .sandbox-page select option,
        .sandbox-page code,
        .sandbox-page pre,
        .sandbox-page p,
        .results-panel-inner p {
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

      {/* ── STANDARD BOTTOM NAV (page level — the container reserves 70px) ── */}
      <BottomNavBar />
    </div >
  );
}
