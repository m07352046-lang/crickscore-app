/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  User, 
  History, 
  Zap, 
  RotateCw, 
  AlertCircle, 
  ChevronRight,
  TrendingUp,
  Skull,
  ShieldCheck,
  Sword,
  Pencil,
  Camera,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Player, 
  CareerStats, 
  DismissalRecord, 
  MatchState, 
  INITIAL_PLAYERS, 
  INITIAL_STATS,
  ManualEditLog,
  StateSnapshot,
  ScoringLog
} from './types';

const STORAGE_KEYS = {
  STATS: 'cricket_career_stats',
  DISMISSALS: 'cricket_dismissals',
  MATCH: 'cricket_match_state',
  PLAYERS: 'cricket_players',
  LOGS: 'cricket_manual_logs'
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'career' | 'history' | 'settings'>('live');
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [careerStats, setCareerStats] = useState<Record<number, CareerStats>>(INITIAL_STATS);
  const [sessionStats, setSessionStats] = useState<Record<number, { 
    batting: { runs: number; balls: number }; 
    bowling: { runs: number; balls: number; wickets: number };
  }>>({});
  const [dismissals, setDismissals] = useState<DismissalRecord[]>([]);
  const [manualEditLogs, setManualEditLogs] = useState<ManualEditLog[]>([]);
  const [editModal, setEditModal] = useState<{ 
    isOpen: boolean; 
    type: 'batting' | 'bowling' | 'full'; 
    playerId: number;
    mode: 'overwrite' | 'add'
  } | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [match, setMatch] = useState<MatchState>({
    strikerId: 1,
    nonStrikerId: 2,
    bowlerId: 3,
    overBalls: 0,
    currentOver: [],
    totalRuns: 0,
    totalWickets: 0,
    extras: 0,
  });

  const [isWicketModalOpen, setIsWicketModalOpen] = useState<{ isOpen: boolean; outPlayerId: number | null }>({
    isOpen: false,
    outPlayerId: null,
  });

  const [dismissalModal, setDismissalModal] = useState<{ isOpen: boolean; outPlayerId: number | null }>({
    isOpen: false,
    outPlayerId: null,
  });

  const [runOutModal, setRunOutModal] = useState<{ isOpen: boolean; outPlayerId: number | null }>({
    isOpen: false,
    outPlayerId: null,
  });

  const [isBowlerModalOpen, setIsBowlerModalOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<StateSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<StateSnapshot[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Deep clone utility for strict state immutability
  const deepClone = <T,>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
  };

  // Boundary Sanitization Guardrails: Ensure no counters are ever negative under any condition
  const sanitizeCareerStats = (stats: Record<number, CareerStats>): Record<number, CareerStats> => {
    const sanitized: Record<number, CareerStats> = {};
    for (const id in stats) {
      const s = stats[id];
      sanitized[Number(id)] = {
        ...s,
        runs: Math.max(0, s.runs || 0),
        ballsFaced: Math.max(0, s.ballsFaced || 0),
        fours: Math.max(0, s.fours || 0),
        sixes: Math.max(0, s.sixes || 0),
        wickets: Math.max(0, s.wickets || 0),
        runsConceded: Math.max(0, s.runsConceded || 0),
        ballsBowled: Math.max(0, s.ballsBowled || 0),
        dots: Math.max(0, s.dots || 0),
        inningsBat: Math.max(0, s.inningsBat || 0),
        inningsBowl: Math.max(0, s.inningsBowl || 0),
        fifties: Math.max(0, s.fifties || 0),
        hundreds: Math.max(0, s.hundreds || 0),
        highestScore: Math.max(0, s.highestScore || 0),
        hatTricks: Math.max(0, s.hatTricks || 0),
        wicketStreak: Math.max(0, s.wicketStreak || 0),
        bestBowling: {
          wickets: Math.max(0, s.bestBowling?.wickets || 0),
          runs: Math.max(0, s.bestBowling?.runs || 0)
        }
      };
    }
    return sanitized;
  };

  const sanitizeSessionStats = (session: Record<number, { batting: { runs: number; balls: number; inningsCounted?: boolean }; bowling: { runs: number; balls: number; wickets: number } }>) => {
    const sanitized: Record<number, { batting: { runs: number; balls: number; inningsCounted?: boolean }; bowling: { runs: number; balls: number; wickets: number } }> = {};
    for (const id in session) {
      const s = session[id];
      sanitized[Number(id)] = {
        batting: {
          runs: Math.max(0, s.batting?.runs || 0),
          balls: Math.max(0, s.batting?.balls || 0),
          inningsCounted: !!s.batting?.inningsCounted,
        },
        bowling: {
          runs: Math.max(0, s.bowling?.runs || 0),
          balls: Math.max(0, s.bowling?.balls || 0),
          wickets: Math.max(0, s.bowling?.wickets || 0),
        }
      };
    }
    return sanitized;
  };

  const sanitizeMatchState = (m: MatchState): MatchState => {
    return {
      ...m,
      overBalls: Math.max(0, Math.min(5, m.overBalls || 0)),
      totalRuns: Math.max(0, m.totalRuns || 0),
      totalWickets: Math.max(0, m.totalWickets || 0),
      extras: Math.max(0, m.extras || 0),
    };
  };

  // Capture clean snapshots of the entire application state and push them onto the history stack
  const pushToHistory = () => {
    const snapshot: StateSnapshot = {
      careerStats: sanitizeCareerStats(deepClone(careerStats)),
      sessionStats: sanitizeSessionStats(deepClone(sessionStats)),
      dismissals: deepClone(dismissals),
      match: sanitizeMatchState(deepClone(match)),
      isWicketModalOpen: deepClone(isWicketModalOpen),
      isBowlerModalOpen: deepClone(isBowlerModalOpen),
      dismissalModal: deepClone(dismissalModal),
      runOutModal: deepClone(runOutModal),
    };

    setUndoStack(prev => {
      const next = [...prev, snapshot];
      if (next.length > 12) return next.slice(next.length - 12);
      return next;
    });
    setRedoStack([]);
  };

  const performUndo = () => {
    if (undoStack.length === 0) return;

    // Capture the current state as a redo snapshot
    const currentSnapshot: StateSnapshot = {
      careerStats: sanitizeCareerStats(deepClone(careerStats)),
      sessionStats: sanitizeSessionStats(deepClone(sessionStats)),
      dismissals: deepClone(dismissals),
      match: sanitizeMatchState(deepClone(match)),
      isWicketModalOpen: deepClone(isWicketModalOpen),
      isBowlerModalOpen: deepClone(isBowlerModalOpen),
      dismissalModal: deepClone(dismissalModal),
      runOutModal: deepClone(runOutModal),
    };

    const previousSnapshot = undoStack[undoStack.length - 1];

    // Restore perfect states asynchronously
    setCareerStats(sanitizeCareerStats(previousSnapshot.careerStats));
    setSessionStats(sanitizeSessionStats(previousSnapshot.sessionStats));
    setDismissals(previousSnapshot.dismissals);
    setMatch(sanitizeMatchState(previousSnapshot.match));
    setIsWicketModalOpen(previousSnapshot.isWicketModalOpen);
    setIsBowlerModalOpen(previousSnapshot.isBowlerModalOpen);
    setDismissalModal(previousSnapshot.dismissalModal || { isOpen: false, outPlayerId: null });
    setRunOutModal(previousSnapshot.runOutModal || { isOpen: false, outPlayerId: null });

    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => {
      const next = [currentSnapshot, ...prev];
      if (next.length > 12) return next.slice(0, 12);
      return next;
    });
    setNotification("Last Action Reversed");
  };

  const performRedo = () => {
    if (redoStack.length === 0) return;

    // Capture the current state as an undo snapshot
    const currentSnapshot: StateSnapshot = {
      careerStats: sanitizeCareerStats(deepClone(careerStats)),
      sessionStats: sanitizeSessionStats(deepClone(sessionStats)),
      dismissals: deepClone(dismissals),
      match: sanitizeMatchState(deepClone(match)),
      isWicketModalOpen: deepClone(isWicketModalOpen),
      isBowlerModalOpen: deepClone(isBowlerModalOpen),
      dismissalModal: deepClone(dismissalModal),
      runOutModal: deepClone(runOutModal),
    };

    const nextSnapshot = redoStack[0];

    // Bring forward clean snapshots
    setCareerStats(sanitizeCareerStats(nextSnapshot.careerStats));
    setSessionStats(sanitizeSessionStats(nextSnapshot.sessionStats));
    setDismissals(nextSnapshot.dismissals);
    setMatch(sanitizeMatchState(nextSnapshot.match));
    setIsWicketModalOpen(nextSnapshot.isWicketModalOpen);
    setIsBowlerModalOpen(nextSnapshot.isBowlerModalOpen);
    setDismissalModal(nextSnapshot.dismissalModal || { isOpen: false, outPlayerId: null });
    setRunOutModal(nextSnapshot.runOutModal || { isOpen: false, outPlayerId: null });

    setRedoStack(prev => prev.slice(1));
    setUndoStack(prev => {
      const next = [...prev, currentSnapshot];
      if (next.length > 12) return next.slice(next.length - 12);
      return next;
    });
    setNotification("Action Redone");
  };

  // Persistence
  useEffect(() => {
    const savedStats = localStorage.getItem(STORAGE_KEYS.STATS);
    const savedDismissals = localStorage.getItem(STORAGE_KEYS.DISMISSALS);
    const savedMatch = localStorage.getItem(STORAGE_KEYS.MATCH);
    const savedPlayers = localStorage.getItem(STORAGE_KEYS.PLAYERS);
    const savedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);

    if (savedStats) {
      const stats = JSON.parse(savedStats);
      // Migration: fill in missing fields for legacy data
      Object.keys(stats).forEach(id => {
        const s = stats[id];
        if (s.inningsBat === undefined) s.inningsBat = 0;
        if (s.inningsBowl === undefined) s.inningsBowl = 0;
        if (s.fifties === undefined) s.fifties = 0;
        if (s.hundreds === undefined) s.hundreds = 0;
        if (s.highestScore === undefined) s.highestScore = 0;
        if (s.hatTricks === undefined) s.hatTricks = 0;
        if (s.wicketStreak === undefined) s.wicketStreak = 0;
        if (s.bestBowling === undefined) s.bestBowling = { wickets: 0, runs: 0 };
      });
      setCareerStats(stats);
    }
    if (savedDismissals) setDismissals(JSON.parse(savedDismissals));
    if (savedMatch) setMatch(JSON.parse(savedMatch));
    if (savedPlayers) setPlayers(JSON.parse(savedPlayers));
    if (savedLogs) setManualEditLogs(JSON.parse(savedLogs));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(careerStats));
    localStorage.setItem(STORAGE_KEYS.DISMISSALS, JSON.stringify(dismissals));
    localStorage.setItem(STORAGE_KEYS.MATCH, JSON.stringify(match));
    localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(manualEditLogs));
  }, [careerStats, dismissals, match, players, manualEditLogs]);

  const openEditModal = (type: 'batting' | 'bowling' | 'full', playerId: number) => {
    const stats = getPlayerStats(playerId);
    const player = players.find(p => p.id === playerId);
    const initialForm: Record<string, any> = {};
    
    if (type === 'full') {
      initialForm.name = player?.name || '';
      initialForm.runs = stats.runs;
      initialForm.ballsFaced = stats.ballsFaced;
      initialForm.fours = stats.fours;
      initialForm.sixes = stats.sixes;
      initialForm.fifties = stats.fifties;
      initialForm.hundreds = stats.hundreds;
      initialForm.inningsBat = stats.inningsBat;
      initialForm.highestScore = stats.highestScore;
      initialForm.wickets = stats.wickets;
      initialForm.ballsBowled = stats.ballsBowled;
      initialForm.runsConceded = stats.runsConceded;
      initialForm.hatTricks = stats.hatTricks;
      initialForm.bestWickets = stats.bestBowling.wickets;
      initialForm.bestRuns = stats.bestBowling.runs;
    } else if (type === 'batting') {
      initialForm.runs = stats.runs;
      initialForm.ballsFaced = stats.ballsFaced;
      initialForm.fours = stats.fours;
      initialForm.sixes = stats.sixes;
      initialForm.fifties = stats.fifties;
      initialForm.hundreds = stats.hundreds;
      initialForm.inningsBat = stats.inningsBat;
      initialForm.highestScore = stats.highestScore;
    } else {
      initialForm.wickets = stats.wickets;
      initialForm.ballsBowled = stats.ballsBowled;
      initialForm.runsConceded = stats.runsConceded;
      initialForm.hatTricks = stats.hatTricks;
      initialForm.bestWickets = stats.bestBowling.wickets;
      initialForm.bestRuns = stats.bestBowling.runs;
    }
    
    setEditForm(initialForm);
    setEditModal({ isOpen: true, type, playerId, mode: 'overwrite' });
  };

  const handleManualEdit = () => {
    if (!editModal) return;
    const { playerId, type, mode } = editModal;
    const player = players.find(p => p.id === playerId);
    const playerName = player?.name || 'Unknown';
    const oldStats = { ...careerStats[playerId] };
    
    // Update Name if in full mode
    if (type === 'full' && editForm.name && editForm.name !== player?.name) {
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, name: editForm.name } : p));
    }

    setCareerStats(prev => {
      const next = { ...prev };
      const current = next[playerId];
      const newStats = { ...current };
      
      const logs: ManualEditLog[] = [];
      const timestamp = Date.now();

      Object.entries(editForm).forEach(([field, value]) => {
        if (field === 'name') return; // Handled separately

        const val = Number(value);
        if (isNaN(val) || val < 0) return;

        let oldValue: any;
        let newValue = val;

        if (field === 'bestWickets') {
          oldValue = current.bestBowling.wickets;
          if (mode === 'add') newValue = oldValue + val;
          if (oldValue !== newValue) {
            newStats.bestBowling = { ...newStats.bestBowling, wickets: newValue };
            logs.push({
              id: Math.random().toString(36).substr(2, 9),
              playerId, playerName, type: type === 'full' ? 'batting' : type, field: 'Best Wickets',
              oldValue, newValue, timestamp
            });
          }
          return;
        }

        if (field === 'bestRuns') {
          oldValue = current.bestBowling.runs;
          if (mode === 'add') newValue = oldValue + val;
          if (oldValue !== newValue) {
            newStats.bestBowling = { ...newStats.bestBowling, runs: newValue };
            logs.push({
              id: Math.random().toString(36).substr(2, 9),
              playerId, playerName, type: type === 'full' ? 'batting' : type, field: 'Best Runs',
              oldValue, newValue, timestamp
            });
          }
          return;
        }

        oldValue = (current as any)[field];
        if (oldValue === undefined) return;

        if (mode === 'add') {
          newValue = oldValue + val;
        }

        if (oldValue !== newValue) {
          (newStats as any)[field] = newValue;
          logs.push({
            id: Math.random().toString(36).substr(2, 9),
            playerId,
            playerName,
            type: type === 'full' ? 'batting' : type,
            field,
            oldValue,
            newValue,
            timestamp
          });
        }
      });

      setManualEditLogs(prevLogs => [...prevLogs, ...logs]);
      next[playerId] = newStats;
      return next;
    });

    setNotification("Player Data Updated");
    setEditModal(null);
  };

  // Logic: Strike Rotation
  const rotateStrike = () => {
    setMatch(prev => ({
      ...prev,
      strikerId: prev.nonStrikerId,
      nonStrikerId: prev.strikerId,
    }));
  };

  // Logic: Milestone Updates
  const finalizeInnings = (playerId: number, finalSession?: { runs: number; balls: number; inningsCounted?: boolean }) => {
    const session = finalSession || sessionStats[playerId]?.batting || { runs: 0, balls: 0, inningsCounted: false };
    if (session.balls === 0 && !session.inningsCounted) return { fifty: false, hundred: false, hsUpdated: false, prevHS: 0 };

    let results = { fifty: false, hundred: false, hsUpdated: false, prevHS: 0 };

    setCareerStats(prev => {
      const stats = prev[playerId] || {
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
        inningsBat: 0, highestScore: 0,
        wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
        bestBowling: { wickets: 0, runs: 0 },
        wicketStreak: 0
      };
      const isFifty = session.runs >= 50 && session.runs < 100;
      const isHundred = session.runs >= 100;
      const hsUpdated = session.runs > stats.highestScore;
      
      results = {
        fifty: isFifty,
        hundred: isHundred,
        hsUpdated,
        prevHS: stats.highestScore
      };

      const wasCounted = !!session.inningsCounted;

      return {
        ...prev,
        [playerId]: {
          ...stats,
          inningsBat: stats.inningsBat + (wasCounted ? 0 : 1),
          fifties: stats.fifties + (isFifty ? 1 : 0),
          hundreds: stats.hundreds + (isHundred ? 1 : 0),
          highestScore: Math.max(stats.highestScore, session.runs)
        }
      };
    });

    return results;
  };

  const finalizeBowling = (playerId: number) => {
    const session = sessionStats[playerId]?.bowling || { runs: 0, balls: 0, wickets: 0 };
    if (session.balls === 0) return { bbUpdated: false, prevBB: { wickets: 0, runs: 0 } };

    let results = { bbUpdated: false, prevBB: { wickets: 0, runs: 0 } };

    setCareerStats(prev => {
      const stats = prev[playerId] || {
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
        inningsBat: 0, highestScore: 0,
        wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
        bestBowling: { wickets: 0, runs: 0 },
        wicketStreak: 0
      };
      const isBest = (session.wickets > stats.bestBowling.wickets) || 
                   (session.wickets === stats.bestBowling.wickets && session.runs < stats.bestBowling.runs) ||
                   (stats.bestBowling.wickets === 0 && stats.bestBowling.runs === 0);

      results = {
        bbUpdated: isBest,
        prevBB: stats.bestBowling
      };

      return {
        ...prev,
        [playerId]: {
          ...stats,
          inningsBowl: stats.inningsBowl + 1,
          bestBowling: isBest ? { wickets: session.wickets, runs: session.runs } : stats.bestBowling
        }
      };
    });
    return results;
  };

  // Logic: Scoring
  const handleScore = (runs: number) => {
    const isOverEnd = match.overBalls === 5;
    const nextStrikerId = ( (runs % 2 !== 0 && !isOverEnd) || (runs % 2 === 0 && isOverEnd) ) ? match.nonStrikerId : match.strikerId;
    const nextNonStrikerId = ( (runs % 2 !== 0 && !isOverEnd) || (runs % 2 === 0 && isOverEnd) ) ? match.strikerId : match.nonStrikerId;

    pushToHistory();

    // Update match state
    setMatch(prev => ({
      ...prev,
      overBalls: isOverEnd ? 0 : prev.overBalls + 1,
      currentOver: [...prev.currentOver, runs],
      totalRuns: prev.totalRuns + runs, // This is session runs
      ...((runs % 2 !== 0 && !isOverEnd) || (runs % 2 === 0 && isOverEnd) ? {
        strikerId: prev.nonStrikerId,
        nonStrikerId: prev.strikerId,
      } : (runs % 2 !== 0 && isOverEnd) ? {
        strikerId: prev.strikerId,
        nonStrikerId: prev.nonStrikerId,
      } : {})
    }));

    // Update session stats
    setSessionStats(prev => {
      const s = prev[match.strikerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      const b = prev[match.bowlerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      return {
        ...prev,
        [match.strikerId]: {
          ...s,
          batting: { 
            runs: s.batting.runs + runs, 
            balls: s.batting.balls + 1,
            inningsCounted: true
          }
        },
        [match.bowlerId]: {
          ...b,
          bowling: { ...b.bowling, runs: b.bowling.runs + runs, balls: b.bowling.balls + 1 }
        }
      };
    });

    // Update Career Stats
    setCareerStats(prev => {
      const getStatsFromPrev = (statsRecord: Record<number, CareerStats>, id: number): CareerStats => {
        return statsRecord[id] || {
          runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
          inningsBat: 0, highestScore: 0,
          wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
          bestBowling: { wickets: 0, runs: 0 },
          wicketStreak: 0,
          dots: 0,
          inningsBowl: 0
        };
      };

      const striker = getStatsFromPrev(prev, match.strikerId);
      const bowler = getStatsFromPrev(prev, match.bowlerId);
      const wasCounted = sessionStats[match.strikerId]?.batting?.inningsCounted;
      return {
        ...prev,
        [match.strikerId]: {
          ...striker,
          runs: striker.runs + runs,
          ballsFaced: striker.ballsFaced + 1,
          fours: striker.fours + (runs === 4 ? 1 : 0),
          sixes: striker.sixes + (runs === 6 ? 1 : 0),
          inningsBat: striker.inningsBat + (wasCounted ? 0 : 1),
        },
        [match.bowlerId]: {
          ...bowler,
          runsConceded: bowler.runsConceded + runs,
          ballsBowled: bowler.ballsBowled + 1,
          dots: bowler.dots + (runs === 0 ? 1 : 0),
          wicketStreak: 0, // Reset streak on any run scoring ball
        }
      };
    });

    if (isOverEnd) {
      setIsBowlerModalOpen(true);
    }
  };

  const handleExtra = (type: 'wide' | 'noball') => {
    pushToHistory();

    const label = type === 'wide' ? '1wd' : '1NB';

    setMatch(prev => ({
      ...prev,
      totalRuns: prev.totalRuns + 1,
      extras: (prev.extras || 0) + 1,
      currentOver: [...prev.currentOver, label],
    }));

    setSessionStats(prev => {
      const b = prev[match.bowlerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      return {
        ...prev,
        [match.bowlerId]: {
          ...b,
          bowling: { ...b.bowling, runs: b.bowling.runs + 1 }
        }
      };
    });

    setCareerStats(prev => {
      const stats = getPlayerStats(match.bowlerId);
      return {
        ...prev,
        [match.bowlerId]: {
          ...stats,
          runsConceded: stats.runsConceded + 1,
          wicketStreak: 0, // Extras reset the consecutive delivery streak
        }
      };
    });

    setNotification(`${type === 'wide' ? 'Wide' : 'No-Ball'} recorded (+1 Extra run added)`);
  };

  const handleWicket = (outPlayerId: number) => {
    pushToHistory();
    setDismissalModal({ isOpen: true, outPlayerId });
  };

  const confirmWicket = (outPlayerId: number, dismissalType: 'Bowled' | 'Catch Out' | 'LBW' | 'Run Out') => {
    if (dismissalType === 'Run Out') {
      setDismissalModal({ isOpen: false, outPlayerId: null });
      setRunOutModal({ isOpen: true, outPlayerId });
      return;
    }

    const outPlayer = players.find(p => p.id === outPlayerId);
    const outPlayerName = outPlayer?.name || 'Unknown';

    const isStrikerOut = outPlayerId === match.strikerId;
    const bowler = players.find(p => p.id === match.bowlerId);
    const bowlerName = bowler?.name || 'Unknown';

    const currentSession = sessionStats[outPlayerId]?.batting || { runs: 0, balls: 0, inningsCounted: false };
    const finalSession = {
      runs: currentSession.runs,
      balls: currentSession.balls + 1,
      inningsCounted: true
    };

    const isBowlerWicket = dismissalType === 'Bowled' || dismissalType === 'Catch Out' || dismissalType === 'LBW';

    // 1. Permanent Career Accumulation (Batting) and bowling via a robust atomic handler to prevent race conditions
    setCareerStats(prev => {
      const getStatsFromPrev = (statsRecord: Record<number, CareerStats>, id: number): CareerStats => {
        return statsRecord[id] || {
          runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
          inningsBat: 0, highestScore: 0,
          wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
          bestBowling: { wickets: 0, runs: 0 },
          wicketStreak: 0,
          dots: 0,
          inningsBowl: 0
        };
      };

      const nextCareerStats = { ...prev };

      // Update bowler stats
      const originalBowlerStats = getStatsFromPrev(prev, match.bowlerId);
      const s_newStreak = isBowlerWicket ? originalBowlerStats.wicketStreak + 1 : originalBowlerStats.wicketStreak;
      const s_isHatTrick = isBowlerWicket && s_newStreak === 3;

      nextCareerStats[match.bowlerId] = {
        ...originalBowlerStats,
        wickets: originalBowlerStats.wickets + (isBowlerWicket ? 1 : 0),
        ballsBowled: originalBowlerStats.ballsBowled + 1, 
        wicketStreak: s_isHatTrick ? 0 : s_newStreak,
        hatTricks: originalBowlerStats.hatTricks + (s_isHatTrick ? 1 : 0)
      };

      // Update dismissed batsman stats
      const originalOutStats = getStatsFromPrev(prev, outPlayerId);
      const isFifty = finalSession.runs >= 50 && finalSession.runs < 100;
      const isHundred = finalSession.runs >= 100;
      const wasCounted = !!currentSession.inningsCounted;

      nextCareerStats[outPlayerId] = {
        ...originalOutStats,
        ballsFaced: originalOutStats.ballsFaced + 1, // Facing the wicket delivery
        inningsBat: originalOutStats.inningsBat + (wasCounted ? 0 : 1),
        fifties: originalOutStats.fifties + (isFifty ? 1 : 0),
        hundreds: originalOutStats.hundreds + (isHundred ? 1 : 0),
        highestScore: Math.max(originalOutStats.highestScore, finalSession.runs)
      };

      return nextCareerStats;
    });

    // 2. Save Dismissal Record
    setDismissals(prev => [
      ...prev,
      {
        batsmanId: outPlayerId,
        bowlerId: match.bowlerId,
        timestamp: Date.now(),
      }
    ]);

    // 3. Update Session Scoreboard (Reset Temporary Slots) including inningsCounted: false for next innings
    setSessionStats(prev => {
      const b = prev[match.bowlerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      return {
        ...prev,
        [match.bowlerId]: {
          ...b,
          bowling: { 
            ...b.bowling, 
            wickets: b.bowling.wickets + (isBowlerWicket ? 1 : 0), 
            balls: b.bowling.balls + 1 
          }
        },
        [outPlayerId]: {
          ...(prev[outPlayerId] || { bowling: { runs: 0, balls: 0, wickets: 0 } }),
          batting: { runs: 0, balls: 0, inningsCounted: false } // Reset for next innings
        }
      };
    });

    // 4. Clear Slot in Live Scoreboard
    setMatch(prev => ({
      ...prev,
      totalWickets: prev.totalWickets + 1,
      overBalls: prev.overBalls === 5 ? 0 : prev.overBalls + 1,
      currentOver: [...prev.currentOver, 'W'],
      strikerId: isStrikerOut ? 0 : prev.strikerId,
      nonStrikerId: !isStrikerOut ? 0 : prev.nonStrikerId,
    }));

    // 5. UI Feedback & Open Selection Menu for Next Batsman
    const sessionBatting = sessionStats[outPlayerId]?.batting || { runs: 0, balls: 0 };
    setNotification(`${dismissalType} recorded: Innings Saved for ${outPlayerName} (${sessionBatting.runs} runs)`);
    
    // Close dismissal modal, open next batsman modal
    setDismissalModal({ isOpen: false, outPlayerId: null });
    setIsWicketModalOpen({ isOpen: true, outPlayerId });
  };

  const confirmRunOut = (outPlayerId: number, runsCompleted: number) => {
    const outPlayer = players.find(p => p.id === outPlayerId);
    const outPlayerName = outPlayer?.name || 'Unknown';

    const isStrikerOut = outPlayerId === match.strikerId;
    const bowler = players.find(p => p.id === match.bowlerId);
    const bowlerName = bowler?.name || 'Unknown';

    const strikerId = match.strikerId;

    // Check if striker's innings already counted in session
    const strikerAlreadyCounted = !!sessionStats[strikerId]?.batting?.inningsCounted;
    // Check if dismissed batsman's innings already counted in session
    const outAlreadyCounted = !!sessionStats[outPlayerId]?.batting?.inningsCounted;

    // Calculate finalSession for dismissed player
    const currentOutSession = sessionStats[outPlayerId]?.batting || { runs: 0, balls: 0, inningsCounted: false };
    const finalSession = {
      runs: currentOutSession.runs + (outPlayerId === strikerId ? runsCompleted : 0),
      balls: currentOutSession.balls + (outPlayerId === strikerId ? 1 : 0),
      inningsCounted: true
    };

    // 1. Credit runs, balls faced, and career innings in a single atomic setCareerStats to avoid race conditions!
    setCareerStats(prev => {
      const getStatsFromPrev = (statsRecord: Record<number, CareerStats>, id: number): CareerStats => {
        return statsRecord[id] || {
          runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
          inningsBat: 0, highestScore: 0,
          wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
          bestBowling: { wickets: 0, runs: 0 },
          wicketStreak: 0,
          dots: 0,
          inningsBowl: 0
        };
      };

      const nextCareerStats = { ...prev };

      // Update active striker's career stats
      const originalStrikerStats = getStatsFromPrev(prev, strikerId);
      const updatedStriker = {
        ...originalStrikerStats,
        runs: originalStrikerStats.runs + runsCompleted,
        ballsFaced: originalStrikerStats.ballsFaced + 1,
        inningsBat: originalStrikerStats.inningsBat + (strikerAlreadyCounted ? 0 : 1)
      };
      nextCareerStats[strikerId] = updatedStriker;

      // Update active bowler's career stats
      const originalBowlerStats = getStatsFromPrev(prev, match.bowlerId);
      nextCareerStats[match.bowlerId] = {
        ...originalBowlerStats,
        runsConceded: originalBowlerStats.runsConceded + runsCompleted,
        ballsBowled: originalBowlerStats.ballsBowled + 1,
        dots: originalBowlerStats.dots + (runsCompleted === 0 ? 1 : 0),
        wicketStreak: runsCompleted > 0 ? 0 : originalBowlerStats.wicketStreak,
      };

      // If the dismissed player is the non-striker, increment their career innings if not already counted
      if (outPlayerId !== strikerId) {
        const originalOutStats = getStatsFromPrev(prev, outPlayerId);
        nextCareerStats[outPlayerId] = {
          ...originalOutStats,
          inningsBat: originalOutStats.inningsBat + (outAlreadyCounted ? 0 : 1),
        };
      }

      // Update milestone stats (fifties, hundreds, highestScore) for dismissed player atomically
      const currentStatsForOut = nextCareerStats[outPlayerId];
      const isFifty = finalSession.runs >= 50 && finalSession.runs < 100;
      const isHundred = finalSession.runs >= 100;

      nextCareerStats[outPlayerId] = {
        ...currentStatsForOut,
        fifties: currentStatsForOut.fifties + (isFifty ? 1 : 0),
        hundreds: currentStatsForOut.hundreds + (isHundred ? 1 : 0),
        highestScore: Math.max(currentStatsForOut.highestScore, finalSession.runs)
      };

      return nextCareerStats;
    });

    // 2. Save Dismissal Record
    setDismissals(prev => [
      ...prev,
      {
        batsmanId: outPlayerId,
        bowlerId: match.bowlerId,
        timestamp: Date.now(),
      }
    ]);

    // 3. Update Session Scoreboard (incorporate batsman and bowler runs/balls)
    setSessionStats(prev => {
      const nextSession = { ...prev };

      // Update active striker's session stats
      const strikerSession = nextSession[strikerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      nextSession[strikerId] = {
        ...strikerSession,
        batting: {
          runs: (strikerSession.batting?.runs || 0) + runsCompleted,
          balls: (strikerSession.batting?.balls || 0) + 1,
          inningsCounted: true // Striker faced a ball, so their innings is counted!
        }
      };

      // Update bowler session stats
      const bowlerSession = nextSession[match.bowlerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      nextSession[match.bowlerId] = {
        ...bowlerSession,
        bowling: {
          ...bowlerSession.bowling,
          runs: (bowlerSession.bowling?.runs || 0) + runsCompleted,
          balls: (bowlerSession.bowling?.balls || 0) + 1
        }
      };

      // Reset batting stats for dismissed player for their next innings
      const dismissedSession = nextSession[outPlayerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      nextSession[outPlayerId] = {
        ...dismissedSession,
        batting: { runs: 0, balls: 0, inningsCounted: false }
      };

      return nextSession;
    });

    // 4. Update Live Scoreboard / Match State
    const timelineLabel = runsCompleted === 0 ? 'W' : `${runsCompleted}+W`;

    setMatch(prev => ({
      ...prev,
      totalRuns: prev.totalRuns + runsCompleted,
      totalWickets: prev.totalWickets + 1,
      overBalls: prev.overBalls === 5 ? 0 : prev.overBalls + 1,
      currentOver: [...prev.currentOver, timelineLabel],
      strikerId: isStrikerOut ? 0 : prev.strikerId,
      nonStrikerId: !isStrikerOut ? 0 : prev.nonStrikerId,
    }));

    // 6. UI Feedback
    setNotification(`Run Out (+${runsCompleted} runs) recorded for ${outPlayerName}`);

    // Close runOutModal, open next batsman modal
    setRunOutModal({ isOpen: false, outPlayerId: null });
    setIsWicketModalOpen({ isOpen: true, outPlayerId });
  };

  const selectNewBatsman = (newPlayerId: number) => {
    if (!isWicketModalOpen.outPlayerId) return;

    const outPlayerId = isWicketModalOpen.outPlayerId;
    const isStrikerOut = match.strikerId === 0; // If striker slot was cleared
    
    // 1. Initialize session for new player
    setSessionStats(prev => ({
      ...prev,
      [newPlayerId]: {
        ...(prev[newPlayerId] || { bowling: { runs: 0, balls: 0, wickets: 0 } }),
        batting: { runs: 0, balls: 0 } // Fresh start 0(0)
      }
    }));

    // 2. Fill the empty slot in Match State
    setMatch(prev => ({
      ...prev,
      strikerId: isStrikerOut ? newPlayerId : prev.strikerId,
      nonStrikerId: !isStrikerOut ? newPlayerId : prev.nonStrikerId,
    }));

    setIsWicketModalOpen({ isOpen: false, outPlayerId: null });

    // 3. Handle Role Swap & Over End
    if (newPlayerId === match.bowlerId || match.overBalls === 0) { // match.overBalls === 0 means it was 5 and just reset in handleWicket
      setIsBowlerModalOpen(true);
    }
  };

  const selectNewBowler = (newPlayerId: number) => {
    finalizeBowling(match.bowlerId);
    setMatch(prev => ({ ...prev, bowlerId: newPlayerId, overBalls: 0, currentOver: [] }));
    setIsBowlerModalOpen(false);
  };

  const emergencySwap = () => {
    pushToHistory();
    const outPlayerId = match.strikerId;
    const m = finalizeInnings(outPlayerId);

    setDismissals(prev => [
      ...prev,
      {
        batsmanId: outPlayerId,
        bowlerId: match.bowlerId,
        timestamp: Date.now(),
      }
    ]);

    setCareerStats(prev => {
      const bowlerStats = prev[match.bowlerId] || {
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
        inningsBat: 0, highestScore: 0,
        wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
        bestBowling: { wickets: 0, runs: 0 },
        wicketStreak: 0
      };
      return {
        ...prev,
        [match.bowlerId]: {
          ...bowlerStats,
          wickets: bowlerStats.wickets + 1,
        }
      };
    });
    
    setSessionStats(prev => {
      const b = prev[match.bowlerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      const next = {
        ...prev,
        [match.bowlerId]: {
          ...b,
          bowling: { ...b.bowling, wickets: b.bowling.wickets + 1 }
        }
      };
      if (next[outPlayerId]) {
        next[outPlayerId] = { ...next[outPlayerId], batting: { runs: 0, balls: 0 } };
      }
      return next;
    });
    
    finalizeBowling(match.bowlerId);
    setMatch(prev => ({
      ...prev,
      strikerId: prev.bowlerId,
      totalWickets: prev.totalWickets + 1,
    }));
    
    setIsBowlerModalOpen(true);
  };

  const handleNewMatch = () => {
    pushToHistory();
    // Finalize current players
    finalizeInnings(match.strikerId);
    finalizeInnings(match.nonStrikerId);
    finalizeBowling(match.bowlerId);

    // Default to first 3 players in list
    const p1 = players[0]?.id || 1;
    const p2 = players[1]?.id || 2;
    const p3 = players[2]?.id || 3;

    setMatch({
      strikerId: p1,
      nonStrikerId: p2,
      bowlerId: p3,
      overBalls: 0,
      currentOver: [],
      totalRuns: 0,
      totalWickets: 0,
      extras: 0,
    });
    setSessionStats({});
  };

  const addPlayer = (name: string) => {
    const newId = Math.max(...players.map(p => p.id), 0) + 1;
    const newPlayer = { id: newId, name };
    setPlayers(prev => [...prev, newPlayer]);
    setCareerStats(prev => ({
      ...prev,
      [newId]: {
        runs: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
        wickets: 0,
        runsConceded: 0,
        ballsBowled: 0,
        dots: 0,
        inningsBat: 0,
        inningsBowl: 0,
        fifties: 0,
        hundreds: 0,
        highestScore: 0,
        hatTricks: 0,
        wicketStreak: 0,
        bestBowling: { wickets: 0, runs: 0 },
      }
    }));
  };

  const renamePlayer = (id: number, newName: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const updateAvatar = (id: number, avatar: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, avatar } : p));
  };

  const resetPlayerSession = (playerId: number, type: 'batting' | 'bowling') => {
    pushToHistory();
    setSessionStats(prev => {
      const current = prev[playerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      return {
        ...prev,
        [playerId]: {
          ...current,
          [type]: type === 'batting' ? { runs: 0, balls: 0 } : { runs: 0, balls: 0, wickets: 0 }
        }
      };
    });
  };

  // Stats Helpers
  const getPlayerStats = (id: number) => careerStats[id] || {
    runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
    inningsBat: 0, highestScore: 0,
    wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
    bestBowling: { wickets: 0, runs: 0 },
    wicketStreak: 0
  };

  const getNemesis = (id: number) => {
    const outs = dismissals.filter(d => d.batsmanId === id);
    if (!outs.length) return "None";
    const counts: Record<number, number> = {};
    outs.forEach(o => counts[o.bowlerId] = (counts[o.bowlerId] || 0) + 1);
    const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return players.find(p => p.id === Number(topId))?.name || "Unknown";
  };

  const getBunny = (id: number) => {
    const wickets = dismissals.filter(d => d.bowlerId === id);
    if (!wickets.length) return "None";
    const counts: Record<number, number> = {};
    wickets.forEach(w => counts[w.batsmanId] = (counts[w.batsmanId] || 0) + 1);
    const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return players.find(p => p.id === Number(topId))?.name || "Unknown";
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => getPlayerStats(b.id).runs - getPlayerStats(a.id).runs);
  }, [players, careerStats]);

  const handleDownloadCareerHTML = () => {
    // 1. Get current date/time formatted
    const today = new Date();
    const formattedDateTime = today.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });

    // 2. Map Batting Career Row Markups
    const battingRowsMarkup = sortedPlayers.map(p => {
      const s = getPlayerStats(p.id);
      const sr = s.ballsFaced > 0 ? (s.runs / s.ballsFaced) * 100 : 0;
      const battingAverage = s.inningsBat > 0 ? s.runs / s.inningsBat : 0;
      const initials = p.name.charAt(0).toUpperCase();
      const avatarHtml = p.avatar 
        ? `<img src="${p.avatar}" class="w-8 h-8 rounded-full object-cover border border-white/10" referrerPolicy="no-referrer">`
        : `<div class="w-8 h-8 rounded-full flex items-center justify-center bg-orange-500/10 text-orange-400 font-bold text-xs border border-orange-500/20">${initials}</div>`;

      return `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
          <td class="p-4">
            <div class="flex items-center gap-3">
              ${avatarHtml}
              <span class="font-bold text-white text-sm">${p.name}</span>
            </div>
          </td>
          <td class="p-4 text-center text-gray-300 font-mono">${s.inningsBat}</td>
          <td class="p-4 text-center text-orange-400 font-bold font-mono">${s.runs}</td>
          <td class="p-4 text-center text-gray-300 font-mono">${s.highestScore}</td>
          <td class="p-4 text-center text-gray-300 font-mono">${s.fifties}</td>
          <td class="p-4 text-center text-gray-300 font-mono">${s.hundreds}</td>
          <td class="p-4 text-center text-gray-300 font-mono">${sr.toFixed(1)}</td>
          <td class="p-4 text-center text-gray-300 font-mono">${battingAverage.toFixed(1)}</td>
          <td class="p-4 text-center text-gray-400 font-mono text-[11px]">${s.fours}</td>
          <td class="p-4 text-center text-gray-400 font-mono text-[11px]">${s.sixes}</td>
        </tr>
      `;
    }).join('');

    // 3. Map Bowling Career Row Markups
    const sortedBowlers = [...players].sort((a,b) => getPlayerStats(b.id).wickets - getPlayerStats(a.id).wickets);
    const bowlingRowsMarkup = sortedBowlers.map(p => {
      const s = getPlayerStats(p.id);
      const overs = Math.floor(s.ballsBowled / 6) + (s.ballsBowled % 6) / 10;
      const eco = s.ballsBowled > 0 ? (s.runsConceded / s.ballsBowled) * 6 : 0;
      const initials = p.name.charAt(0).toUpperCase();
      const avatarHtml = p.avatar 
        ? `<img src="${p.avatar}" class="w-8 h-8 rounded-full object-cover border border-white/10" referrerPolicy="no-referrer">`
        : `<div class="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-400 font-bold text-xs border border-blue-500/20">${initials}</div>`;

      return `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
          <td class="p-4">
            <div class="flex items-center gap-3">
              ${avatarHtml}
              <span class="font-bold text-white text-sm">${p.name}</span>
            </div>
          </td>
          <td class="p-4 text-center text-gray-300 font-mono">${overs.toFixed(1)}</td>
          <td class="p-4 text-center text-blue-400 font-bold font-mono">${s.wickets}</td>
          <td class="p-4 text-center text-gray-300 font-mono font-bold">${s.bestBowling.wickets}/${s.bestBowling.runs}</td>
          <td class="p-4 text-center text-yellow-500 font-bold font-mono">${s.hatTricks}</td>
          <td class="p-4 text-center text-gray-300 font-mono">${eco.toFixed(2)}</td>
          <td class="p-4 text-center text-gray-400 font-mono">${s.runsConceded}</td>
        </tr>
      `;
    }).join('');

    // 4. Complete HTML Template
    const htmlReport = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cricket Tournament Scorer - Player Career Statistics</title>
    <!-- Tailwind CSS Play CDN -->
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            background-color: #151619;
            color: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .font-mono {
            font-family: 'JetBrains Mono', monospace;
        }
        @media print {
            .no-print {
                display: none !important;
            }
            body {
                background-color: #ffffff !important;
                color: #000000 !important;
            }
            .print-card {
                background-color: #ffffff !important;
                border: 1px solid #cbd5e0 !important;
                box-shadow: none !important;
                color: #000000 !important;
            }
            .text-white {
                color: #000000 !important;
            }
            .text-gray-300 {
                color: #1a202c !important;
            }
            .text-gray-400 {
                color: #4a5568 !important;
            }
            .text-orange-400, .text-orange-500 {
                color: #dd6b20 !important;
            }
            .text-blue-400, .text-blue-500 {
                color: #2b6cb0 !important;
            }
            .border-white\\/10 {
                border-color: #cbd5e0 !important;
            }
            .border-white\\/5 {
                border-color: #e2e8f0 !important;
            }
            .bg-white\\/5 {
                background-color: #f7fafc !important;
            }
            th {
                background-color: #edf2f7 !important;
                color: #2d3748 !important;
            }
            tr {
                border-bottom: 1px solid #cbd5e0 !important;
            }
        }
    </style>
</head>
<body class="p-6 md:p-12 min-h-screen bg-[#151619]">
    <div class="max-w-4xl mx-auto space-y-8">
        <!-- Actions Row for PDF download / Printing -->
        <div class="no-print flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-xl shadow-lg">
            <span class="text-xs text-gray-400 uppercase font-mono tracking-wider">📄 Offline Career Statistics Report</span>
            <button onclick="window.print()" class="flex items-center gap-2 py-2 px-5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-bold uppercase text-[11px] tracking-wider rounded-lg shadow-lg transition-all active:scale-95 duration-200">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                Print / Save as PDF
            </button>
        </div>

        <!-- Premium Header Section -->
        <div class="print-card bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row justify-between md:items-center gap-6 shadow-xl">
            <div class="space-y-2">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">🏆</span>
                    <h1 class="text-2xl md:text-3xl font-extrabold uppercase tracking-tighter text-white">Cricket Tournament Scorer</h1>
                </div>
                <h2 class="text-sm uppercase tracking-[0.25em] text-orange-500 font-mono font-bold leading-none">Player Career Statistics</h2>
                <p class="text-xs text-gray-400 font-mono">Continuous scores, averages, milestones, and strike-rates</p>
            </div>
            <div class="text-left md:text-right font-mono text-[10px] text-gray-400 space-y-1">
                <p>REPORT GENERATED: <span class="text-white">${formattedDateTime}</span></p>
                <p>TOTAL TOURNAMENT PLAYERS: <span class="text-white">${players.length}</span></p>
            </div>
        </div>

        <!-- Batting Statistics Board -->
        <section class="space-y-4">
            <div class="flex items-center gap-2">
                <span class="text-orange-500 text-lg">🏏</span>
                <h3 class="text-xs font-mono uppercase tracking-[0.2em] text-gray-400 font-bold">Batting Board</h3>
            </div>
            <div class="print-card overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-lg">
                <div class="overflow-x-auto">
                    <table class="w-full text-left font-mono text-xs border-collapse">
                        <thead class="bg-white/5 text-gray-400 uppercase tracking-wider text-[10px] border-b border-white/10">
                            <tr>
                                <th class="p-4 uppercase text-left">Player</th>
                                <th class="p-4 text-center">Innings</th>
                                <th class="p-4 text-center">Total Runs</th>
                                <th class="p-4 text-center">Highest Score</th>
                                <th class="p-4 text-center">50s</th>
                                <th class="p-4 text-center">100s</th>
                                <th class="p-4 text-center">S/R</th>
                                <th class="p-4 text-center">Average</th>
                                <th class="p-4 text-center">4s</th>
                                <th class="p-4 text-center">6s</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${battingRowsMarkup}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <!-- Bowling Statistics Board -->
        <section class="space-y-4">
            <div class="flex items-center gap-2">
                <span class="text-blue-400 text-lg">🥎</span>
                <h3 class="text-xs font-mono uppercase tracking-[0.2em] text-gray-400 font-bold">Bowling Board</h3>
            </div>
            <div class="print-card overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-lg">
                <div class="overflow-x-auto">
                    <table class="w-full text-left font-mono text-xs border-collapse">
                        <thead class="bg-white/5 text-gray-400 uppercase tracking-wider text-[10px] border-b border-white/10">
                            <tr>
                                <th class="p-4 uppercase text-left">Player</th>
                                <th class="p-4 text-center">Overs</th>
                                <th class="p-4 text-center">Wickets</th>
                                <th class="p-4 text-center">Best Bowling</th>
                                <th class="p-4 text-center">HT</th>
                                <th class="p-4 text-center">Economy</th>
                                <th class="p-4 text-center">Runs Conceded</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bowlingRowsMarkup}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <!-- Signature Footer -->
        <footer class="text-center font-mono text-[9px] text-gray-500 py-8 uppercase tracking-widest no-print">
            Generated by Cricket Tournament Scorer &bull; All-Time Career Ledger
        </footer>
    </div>
</body>
</html>`;

    // 5. Generate Blob and Trigger Download
    const blob = new Blob([htmlReport], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'cricket_career_report.html');
    document.body.appendChild(link);
    link.click();
    
    // Cleanup to prevent memory leaks
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setNotification('Career report successfully exported as cricket_career_report.html!');
  };

  return (
    <div className="min-h-screen bg-[#151619] text-white font-sans selection:bg-orange-500/30">
      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1b1e] border-t border-white/10 z-50 px-6 py-4 flex justify-around items-center">
        <button 
          onClick={() => setActiveTab('live')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'live' ? 'text-orange-500' : 'text-gray-500'}`}
        >
          <Zap size={24} />
          <span className="text-[10px] uppercase font-mono tracking-widest">Live</span>
        </button>
        <button 
          onClick={() => setActiveTab('career')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'career' ? 'text-orange-500' : 'text-gray-500'}`}
        >
          <Trophy size={24} />
          <span className="text-[10px] uppercase font-mono tracking-widest">Career</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'history' ? 'text-orange-500' : 'text-gray-500'}`}
        >
          <History size={24} />
          <span className="text-[10px] uppercase font-mono tracking-widest">Records</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'settings' ? 'text-orange-500' : 'text-gray-500'}`}
        >
          <RotateCw size={24} />
          <span className="text-[10px] uppercase font-mono tracking-widest">Settings</span>
        </button>
      </nav>

      <main className="pb-24 pt-8 px-4 max-w-lg mx-auto">
        {/* Header Stat */}
        <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center animate-pulse">
              <RotateCw size={20} className="text-black" />
            </div>
            <div>
              <h1 className="text-xl font-mono tracking-tighter leading-none uppercase">
                Infinite Loop
              </h1>
              <p className="text-[10px] uppercase font-mono text-gray-500 mt-1 tracking-widest">Continuous Session</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-mono text-white">
              {match.totalRuns}/{match.totalWickets}
            </p>
            <p className="text-[10px] uppercase font-mono text-gray-400 tracking-widest">
              Score (Ex: {match.extras || 0})
            </p>
            <p className="text-[9px] uppercase font-mono text-orange-500 tracking-widest mt-1">
              Active Over: 0.{match.overBalls}
            </p>
          </div>
        </div>

        {activeTab === 'live' && (
          <div className="space-y-6">
            <div className="flex justify-end mb-2">
              <button 
                onClick={handleNewMatch}
                className="px-4 py-2 border border-orange-500/30 bg-orange-500/10 text-orange-500 rounded-lg font-mono text-[10px] uppercase tracking-widest hover:bg-orange-500/20 transition-all"
              >
                Reset Session (New Match)
              </button>
            </div>

            {/* Undo/Redo Controls */}
            <div className="flex gap-2 mb-6">
              <button 
                onClick={performUndo}
                disabled={undoStack.length === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-mono text-[10px] uppercase tracking-widest transition-all ${
                  undoStack.length > 0 
                  ? 'border-white/20 bg-white/5 hover:bg-white/10 text-white' 
                  : 'border-white/5 bg-white/2 text-gray-700 cursor-not-allowed'
                }`}
              >
                <RotateCw size={14} className={undoStack.length > 0 ? 'text-blue-400' : 'text-gray-700'} style={{ transform: 'scaleX(-1)' }} /> 
                Undo ({undoStack.length})
              </button>
              <button 
                onClick={performRedo}
                disabled={redoStack.length === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-mono text-[10px] uppercase tracking-widest transition-all ${
                  redoStack.length > 0 
                  ? 'border-white/20 bg-white/5 hover:bg-white/10 text-white' 
                  : 'border-white/5 bg-white/2 text-gray-700 cursor-not-allowed'
                }`}
              >
                Redo ({redoStack.length})
                <RotateCw size={14} className={redoStack.length > 0 ? 'text-green-400' : 'text-gray-700'} />
              </button>
            </div>

            {/* Notification Toast */}
            <AnimatePresence>
              {notification && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-orange-500 text-black px-6 py-3 rounded-full font-mono text-xs uppercase tracking-widest shadow-2xl z-[100] flex items-center gap-2"
                >
                  <AlertCircle size={14} />
                  {notification}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Batting Section */}
            <div className="grid grid-cols-1 gap-4">
              {[
                { id: match.strikerId, label: 'Striker', active: true, key: 'strikerId' },
                { id: match.nonStrikerId, label: 'Non-Striker', active: false, key: 'nonStrikerId' }
              ].map((bat, idx) => (
                <motion.div 
                  key={idx}
                  layout
                  className={`relative p-6 rounded-xl border ${bat.active ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/10 bg-white/5'}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/5 flex-shrink-0">
                        {players.find(p => p.id === bat.id)?.avatar ? (
                          <img src={players.find(p => p.id === bat.id)?.avatar} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-orange-500/10 text-orange-500">
                            <User size={20} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] uppercase font-mono text-orange-500 tracking-widest mb-1 block">
                          {bat.label}
                        </span>
                        <select 
                          value={bat.id}
                          onChange={(e) => setMatch(prev => ({ ...prev, [bat.key]: Number(e.target.value) }))}
                          className={`text-2xl font-mono tracking-tight bg-transparent border-none focus:ring-0 w-full appearance-none p-0 cursor-pointer ${bat.id === 0 ? 'text-gray-500 italic' : 'text-white'}`}
                        >
                          <option value={0} className="bg-[#1a1b1e]">Select Player</option>
                          {players.map(p => (
                            <option key={p.id} value={p.id} className="bg-[#1a1b1e]">{p.name}</option>
                          ))}
                        </select>
                        {bat.id !== 0 && (
                          <button 
                            onClick={() => resetPlayerSession(bat.id, 'batting')}
                            className="text-[9px] uppercase font-mono text-orange-500/60 hover:text-orange-500 mt-1 transition-colors flex items-center gap-1"
                          >
                            <RotateCw size={10} /> Reset Session
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xl font-mono">
                        {bat.id === 0 ? '—' : `${sessionStats[bat.id]?.batting.runs || 0} (${sessionStats[bat.id]?.batting.balls || 0})`}
                      </p>
                      <p className="text-[8px] uppercase font-mono text-gray-500 mt-1">Live Score</p>
                    </div>
                  </div>

                  {bat.active && bat.id !== 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-4">
                      {[0, 'WICKET', 1, 2, 3, 4, 6].map(r => {
                        if (r === 'WICKET') {
                          return (
                            <button
                              key="wicket"
                              onClick={() => handleWicket(bat.id)}
                              className="py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-mono text-[10px] font-bold transition-all active:scale-95 flex flex-col items-center justify-center gap-1 shadow-lg shadow-red-900/20"
                            >
                              <Skull size={14} /> WICKET
                            </button>
                          );
                        }
                        return (
                          <button
                            key={r}
                            onClick={() => handleScore(Number(r))}
                            className="py-3 bg-white/10 hover:bg-white/20 rounded-lg font-mono text-lg transition-all active:scale-95"
                          >
                            {r === 0 ? 'Dot' : `+${r}`}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Removed absolute OUT button to use grid-based red button */}
                </motion.div>
              ))}
            </div>

            {/* Controls */}
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={rotateStrike}
                className="flex items-center justify-center gap-2 py-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 font-mono text-xs uppercase tracking-widest transition-all"
              >
                <RotateCw size={14} className="text-orange-500" /> Rotate Strike
              </button>
              <button 
                onClick={emergencySwap}
                className="flex items-center justify-center gap-2 py-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 font-mono text-xs uppercase tracking-widest transition-all"
              >
                <AlertCircle size={14} className="text-red-500" /> Swap Bowler
              </button>
            </div>

            {/* Bowler Section */}
            <div className="p-6 rounded-xl border border-dashed border-white/20 bg-white/5">
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/5 flex-shrink-0">
                    {players.find(p => p.id === match.bowlerId)?.avatar ? (
                      <img src={players.find(p => p.id === match.bowlerId)?.avatar} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-blue-500/10 text-blue-400">
                        <User size={20} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] uppercase font-mono text-gray-500 tracking-widest mb-1 block">Current Bowler</span>
                    <select 
                      value={match.bowlerId}
                      onChange={(e) => setMatch(prev => ({ ...prev, bowlerId: Number(e.target.value) }))}
                      className="text-xl font-mono bg-transparent border-none focus:ring-0 w-full appearance-none text-white p-0 cursor-pointer"
                    >
                      {players.map(p => (
                        <option key={p.id} value={p.id} className="bg-[#1a1b1e]">{p.name}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-3 mt-1">
                      <button 
                        onClick={() => {
                          resetPlayerSession(match.bowlerId, 'bowling');
                          setMatch(prev => ({ ...prev, overBalls: 0, currentOver: [] }));
                        }}
                        className="text-[9px] uppercase font-mono text-gray-500 hover:text-white transition-colors flex items-center gap-1"
                      >
                        <RotateCw size={10} /> Reset Session
                      </button>
                    </div>
                    <div className="flex gap-3 mt-2">
                      <span className="text-[10px] font-mono text-blue-400 uppercase tracking-wider">
                        Wkts: {sessionStats[match.bowlerId]?.bowling.wickets || 0}
                      </span>
                      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                        Eco: {((sessionStats[match.bowlerId]?.bowling.runs || 0) / (sessionStats[match.bowlerId]?.bowling.balls || 1) * 6).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleExtra('wide')}
                    className="px-4 py-2 bg-white/10 rounded-lg font-mono text-sm uppercase"
                  >
                    WD
                  </button>
                  <button 
                    onClick={() => handleExtra('noball')}
                    className="px-4 py-2 bg-white/10 rounded-lg font-mono text-sm uppercase"
                  >
                    NB
                  </button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {match.currentOver.map((ball, i) => (
                  <div key={i} className={`min-w-[40px] h-10 px-1 flex items-center justify-center rounded-full font-mono text-sm ${
                    (ball === 'W' || (typeof ball === 'string' && ball.includes('W'))) ? 'bg-red-500/20 text-red-400 border border-red-500/30 font-bold' :
                    (typeof ball === 'string' && (ball.includes('wd') || ball.includes('NB'))) ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    'bg-white/10 text-white'
                  }`}>
                    {ball}
                  </div>
                ))}
                {(() => {
                  const legalBalls = match.currentOver.filter(b => typeof b === 'number' || b === 'W' || (typeof b === 'string' && b.includes('+W'))).length;
                  return Array.from({ length: Math.max(0, 6 - legalBalls) }).map((_, i) => (
                    <div key={i} className="min-w-[40px] h-10 flex items-center justify-center border border-dashed border-white/10 rounded-full font-mono text-sm text-white/20">
                      •
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'career' && (
          <div className="space-y-8 animate-in fade-in duration-500 overflow-x-hidden">
            {/* Career Tab Premium Header Section */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-5 shadow-lg">
              <div>
                <h1 className="text-xl md:text-2xl font-mono uppercase tracking-tighter text-white flex items-center gap-2">
                  <Trophy className="text-yellow-500" size={24} />
                  <span>Player Careers</span>
                </h1>
                <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-mono">Cumulative All-Time Lifetime Statistics</p>
              </div>
              <button
                id="export-career-data-btn"
                onClick={handleDownloadCareerHTML}
                className="flex items-center justify-center gap-2 py-2.5 px-5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 border border-orange-400/20 text-black font-semibold rounded-xl text-xs transition-all tracking-wider uppercase shadow-lg shadow-orange-500/10 active:scale-95 duration-200"
              >
                <Download size={14} />
                <span>Export Career Report</span>
              </button>
            </div>

            {/* Board 1: Batting Career */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Sword size={18} className="text-orange-500" />
                <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-gray-400">Batting Board</h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
                <table className="w-full text-left font-mono text-[10px] border-collapse">
                  <thead className="bg-white/5 text-gray-500 uppercase tracking-tighter">
                    <tr>
                      <th className="p-3 border-b border-white/10 uppercase">Player</th>
                      <th className="p-3 border-b border-white/10">Inn</th>
                      <th className="p-3 border-b border-white/10">Runs</th>
                      <th className="p-3 border-b border-white/10">HS</th>
                      <th className="p-3 border-b border-white/10">50s</th>
                      <th className="p-3 border-b border-white/10">100s</th>
                      <th className="p-3 border-b border-white/10">SR</th>
                      <th className="p-3 border-b border-white/10">4s</th>
                      <th className="p-3 border-b border-white/10">6s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayers.map(p => {
                      const s = getPlayerStats(p.id);
                      const sr = s.ballsFaced > 0 ? (s.runs / s.ballsFaced) * 100 : 0;
                      return (
                        <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 group">
                          <td className="p-3 font-medium text-white max-w-[120px]">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 border border-white/5">
                                {p.avatar ? (
                                  <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-orange-500/10 text-orange-500">
                                    {p.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="truncate">{p.name}</span>
                              <button 
                                onClick={() => openEditModal('full', p.id)}
                                className="p-1 text-orange-500 hover:bg-orange-500/10 rounded transition-all w-fit"
                                title="Manage Player"
                              >
                                <Pencil size={10} />
                              </button>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">{s.inningsBat}</td>
                          <td className="p-3 text-orange-500">{s.runs}</td>
                          <td className="p-3 font-bold">{s.highestScore}</td>
                          <td className="p-3">{s.fifties}</td>
                          <td className="p-3">{s.hundreds}</td>
                          <td className="p-3">{sr.toFixed(1)}</td>
                          <td className="p-3">{s.fours}</td>
                          <td className="p-3">{s.sixes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Board 2: Bowling Career */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={18} className="text-blue-500" />
                <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-gray-400">Bowling Board</h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
                <table className="w-full text-left font-mono text-[10px] border-collapse">
                  <thead className="bg-white/5 text-gray-500 uppercase tracking-tighter">
                    <tr>
                      <th className="p-3 border-b border-white/10 uppercase">Player</th>
                      <th className="p-3 border-b border-white/10">Overs</th>
                      <th className="p-3 border-b border-white/10">Wkt</th>
                      <th className="p-3 border-b border-white/10">BB</th>
                      <th className="p-3 border-b border-white/10">HT</th>
                      <th className="p-3 border-b border-white/10">Eco</th>
                      <th className="p-3 border-b border-white/10">Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...players].sort((a,b) => getPlayerStats(b.id).wickets - getPlayerStats(a.id).wickets).map(p => {
                      const s = getPlayerStats(p.id);
                      const overs = Math.floor(s.ballsBowled / 6) + (s.ballsBowled % 6) / 10;
                      const eco = s.ballsBowled > 0 ? (s.runsConceded / s.ballsBowled) * 6 : 0;
                      return (
                        <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 group">
                          <td className="p-3 font-medium text-white max-w-[120px]">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 border border-white/5">
                                {p.avatar ? (
                                  <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-blue-500/10 text-blue-400">
                                    {p.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="truncate">{p.name}</span>
                                <button 
                                  onClick={() => openEditModal('full', p.id)}
                                  className="p-1 text-blue-400 hover:bg-blue-400/10 rounded transition-all w-fit"
                                  title="Manage Player"
                                >
                                  <Pencil size={10} />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">{overs.toFixed(1)}</td>
                          <td className="p-3 text-blue-400">{s.wickets}</td>
                          <td className="p-3 font-bold">{s.bestBowling.wickets}/{s.bestBowling.runs}</td>
                          <td className="p-3 text-yellow-500 font-bold">{s.hatTricks}</td>
                          <td className="p-3">{eco.toFixed(2)}</td>
                          <td className="p-3">{s.runsConceded}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-6">
              <h2 className="text-xl font-mono uppercase tracking-widest flex items-center gap-2">
                <Sword size={20} className="text-orange-500" /> Head-to-Head
              </h2>
              
              {players.map(p => (
                <div key={p.id} className="p-6 bg-white/5 border border-white/10 rounded-2xl flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10 border border-white/5 flex-shrink-0">
                    {p.avatar ? (
                      <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 bg-white/5">
                        <User size={32} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-mono mb-4 border-b border-white/5 pb-2">{p.name}</h3>
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <span className="text-[10px] uppercase font-mono text-red-500 tracking-widest mb-1 block">Nemesis</span>
                        <p className="text-lg font-mono">{getNemesis(p.id)}</p>
                        <p className="text-[10px] text-gray-500 mt-1 uppercase">Most Wickets Lost To</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-mono text-green-500 tracking-widest mb-1 block">Bunny</span>
                        <p className="text-lg font-mono">{getBunny(p.id)}</p>
                        <p className="text-[10px] text-gray-500 mt-1 uppercase">Top Wicket Victim</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <section className="space-y-4">
              <h2 className="text-xl font-mono uppercase tracking-widest flex items-center gap-2">
                <User size={20} className="text-orange-500" /> Player Management
              </h2>
              
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="New Player Name"
                  id="newPlayerName"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono focus:outline-none focus:border-orange-500/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.currentTarget;
                      if (input.value.trim()) {
                        addPlayer(input.value.trim());
                        input.value = '';
                      }
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    const input = document.getElementById('newPlayerName') as HTMLInputElement;
                    if (input.value.trim()) {
                      addPlayer(input.value.trim());
                      input.value = '';
                    }
                  }}
                  className="px-6 py-3 bg-orange-500 text-black font-mono font-bold rounded-xl active:scale-95 transition-all"
                >
                  ADD
                </button>
              </div>

              <div className="space-y-3">
                {players.map(p => (
                  <div key={p.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-4">
                    <div className="relative group cursor-pointer" onClick={() => document.getElementById(`avatar-input-${p.id}`)?.click()}>
                      <div className="w-12 h-12 rounded-full bg-white/10 border border-white/5 flex items-center justify-center overflow-hidden">
                        {p.avatar ? (
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User size={20} className="text-gray-500" />
                        )}
                      </div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-full transition-opacity">
                        <Camera size={14} className="text-white" />
                      </div>
                      <input 
                        type="file"
                        id={`avatar-input-${p.id}`}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              updateAvatar(p.id, reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                    
                    <div className="flex-1 flex justify-between items-center">
                      <span className="text-white font-mono text-lg">{p.name}</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => openEditModal('full', p.id)}
                          className="p-2 bg-white/5 border border-white/10 rounded-lg text-orange-500 hover:bg-orange-500/10 transition-colors"
                          title="Manage Player"
                        >
                          <Pencil size={14} />
                        </button>
                        <span className="text-[10px] font-mono text-gray-600">ID: {p.id}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {manualEditLogs.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-xl font-mono uppercase tracking-widest flex items-center gap-2">
                  <History size={20} className="text-blue-400" /> Career Edit Logs
                </h2>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                  {manualEditLogs.slice().reverse().map(log => (
                    <div key={log.id} className="p-4 bg-white/5 border border-white/10 rounded-xl font-mono text-[10px]">
                      <div className="flex justify-between text-gray-500 mb-1">
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="uppercase text-blue-400">{log.type}</span>
                      </div>
                      <p className="text-white">
                        <span className="text-orange-500 font-bold">{log.playerName}</span>: 
                        {log.field} changed from <span className="text-gray-400">{log.oldValue}</span> to 
                        <span className="text-green-500"> {log.newValue}</span>
                      </p>
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      if(window.confirm("Clear all edit logs? This will not affect career stats.")) {
                        setManualEditLogs([]);
                      }
                    }}
                    className="w-full py-2 text-[10px] uppercase font-mono text-gray-600 hover:text-red-500 transition-colors"
                  >
                    Clear Logs
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {dismissalModal.isOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1b1e] border border-red-500/20 p-8 rounded-3xl w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4 text-red-500">
                <Skull size={28} />
                <h2 className="text-2xl font-mono uppercase tracking-tighter">Select Dismissal Type</h2>
              </div>
              <p className="text-gray-400 font-mono text-xs mb-6 uppercase tracking-widest leading-relaxed">
                How was {players.find(p => p.id === dismissalModal.outPlayerId)?.name} dismissed?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['Bowled', 'Catch Out', 'LBW', 'Run Out'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      if (dismissalModal.outPlayerId !== null) {
                        confirmWicket(dismissalModal.outPlayerId, type);
                      }
                    }}
                    className="p-5 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 rounded-2xl font-mono text-sm text-center font-bold text-white transition-all flex flex-col items-center justify-center gap-2 hover:border-red-500/30"
                  >
                    <span className="text-red-400 text-lg">
                      {type === 'Bowled' && '🎯'}
                      {type === 'Catch Out' && '🙌'}
                      {type === 'LBW' && '🛡️'}
                      {type === 'Run Out' && '🏃‍♂️'}
                    </span>
                    <span>{type}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setDismissalModal({ isOpen: false, outPlayerId: null })}
                className="w-full mt-6 py-3 border border-white/10 hover:bg-white/5 rounded-xl font-mono text-xs text-gray-400 uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}

        {runOutModal.isOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[115] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1b1e] border border-orange-500/20 p-8 rounded-3xl w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4 text-orange-500">
                <Zap size={28} />
                <h2 className="text-xl font-mono uppercase tracking-tighter">Runs Completed</h2>
              </div>
              <p className="text-gray-400 font-mono text-xs mb-6 uppercase tracking-widest leading-relaxed">
                Select runs completed before {players.find(p => p.id === runOutModal.outPlayerId)?.name} was Run Out:
              </p>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-5 gap-2">
                  {([0, 1, 2, 3, 4] as const).map(runs => (
                    <button
                      key={runs}
                      onClick={() => {
                        if (runOutModal.outPlayerId !== null) {
                          confirmRunOut(runOutModal.outPlayerId, runs);
                        }
                      }}
                      className="h-14 bg-white/5 hover:bg-orange-500/20 active:scale-95 border border-white/5 hover:border-orange-500/30 rounded-xl font-mono text-lg font-bold text-white transition-all flex items-center justify-center"
                    >
                      {runs}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setRunOutModal({ isOpen: false, outPlayerId: null })}
                className="w-full mt-6 py-3 border border-white/10 hover:bg-white/5 rounded-xl font-mono text-xs text-gray-400 uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}

        {isWicketModalOpen.isOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1b1e] border border-red-500/20 p-8 rounded-3xl w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4 text-red-500">
                <Skull size={28} />
                <h2 className="text-2xl font-mono uppercase tracking-tighter">Wicket Fallen!</h2>
              </div>
              <p className="text-gray-400 font-mono text-xs mb-6 uppercase tracking-widest leading-relaxed">
                {players.find(p => p.id === isWicketModalOpen.outPlayerId)?.name} is Wicket!. 
                Record has been committed to career stats. Select replacement:
              </p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                {players
                  .filter(p => p.id !== match.strikerId && p.id !== match.nonStrikerId && p.id !== isWicketModalOpen.outPlayerId)
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectNewBatsman(p.id)}
                      className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl font-mono text-left transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/5 overflow-hidden flex-shrink-0 border border-white/5">
                          {p.avatar ? (
                            <img src={p.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                              <User size={20} />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-white text-sm font-bold">{p.name}</p>
                          <p className="text-[10px] text-gray-500 uppercase">Avg: {(getPlayerStats(p.id).runs / Math.max(1, getPlayerStats(p.id).inningsBat)).toFixed(1)}</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-gray-700 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                    </button>
                  ))}
              </div>
            </motion.div>
          </div>
        )}

        {isBowlerModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1b1e] border border-white/10 p-8 rounded-3xl w-full max-w-md"
            >
              <h2 className="text-2xl font-mono mb-2 uppercase tracking-tighter text-orange-500">Select New Bowler</h2>
              <p className="text-gray-500 mb-6 text-sm">Over end or transition</p>
              <div className="grid grid-cols-1 gap-3">
                {players
                  .filter(p => p.id !== match.strikerId && p.id !== match.nonStrikerId)
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectNewBowler(p.id)}
                      className="w-full py-4 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left font-mono text-lg flex justify-between items-center group"
                    >
                      <span>{p.name}</span>
                      <span className="text-[10px] text-gray-500">Career Wkts: {getPlayerStats(p.id).wickets}</span>
                    </button>
                  ))}
              </div>
            </motion.div>
          </div>
        )}

        {editModal?.isOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-[#1a1b1e] border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-mono uppercase tracking-tighter text-white">
                    {editModal.type === 'full' ? 'Manage Player' : `Edit ${editModal.type} Stats`}
                  </h2>
                  <p className="text-gray-500 text-xs mt-1 font-mono uppercase tracking-widest">
                    Player: {players.find(p => p.id === editModal.playerId)?.name}
                  </p>
                </div>
                <button 
                  onClick={() => setEditModal(null)}
                  className="p-2 hover:bg-white/5 rounded-full text-gray-500 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Mode Selection */}
              <div className="flex bg-white/5 p-1 rounded-xl mb-6 border border-white/5">
                <button 
                  onClick={() => setEditModal(prev => prev ? { ...prev, mode: 'overwrite' } : prev)}
                  className={`flex-1 py-2 rounded-lg font-mono text-[10px] uppercase tracking-widest transition-all ${
                    editModal.mode === 'overwrite' ? 'bg-orange-500 text-black shadow-lg' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  Overwrite (Set)
                </button>
                <button 
                  onClick={() => setEditModal(prev => prev ? { ...prev, mode: 'add' } : prev)}
                  className={`flex-1 py-2 rounded-lg font-mono text-[10px] uppercase tracking-widest transition-all ${
                    editModal.mode === 'add' ? 'bg-green-500 text-black shadow-lg' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  Add to Career
                </button>
              </div>

              <div className="space-y-4">
                {Object.entries(editForm).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 tracking-widest flex justify-between">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      <span className="text-gray-700 italic">
                        {editModal.mode === 'add' ? 'Value to add' : 'New value'}
                      </span>
                    </label>
                    <input 
                      type={key === 'name' ? 'text' : 'number'}
                      value={value}
                      onChange={(e) => setEditForm(prev => ({ ...prev, [key]: key === 'name' ? e.target.value : Number(e.target.value) }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-lg focus:outline-none focus:border-orange-500/50 transition-colors"
                      min={key === 'name' ? undefined : "0"}
                    />
                  </div>
                ))}
              </div>

              {/* Preview Section */}
              <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p className="text-[10px] uppercase font-mono text-gray-500 mb-2 tracking-widest">Calculated Preview</p>
                <div className="grid grid-cols-2 gap-4">
                  {editModal.type === 'batting' ? (
                    <>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Avg</p>
                        <p className="text-lg font-mono">
                          {( (editModal.mode === 'add' ? (careerStats[editModal.playerId].runs + (editForm.runs || 0)) : (editForm.runs || 0)) / 
                             Math.max(1, (editModal.mode === 'add' ? (careerStats[editModal.playerId].inningsBat + (editForm.inningsBat || 0)) : (editForm.inningsBat || 1))) ).toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">SR</p>
                        <p className="text-lg font-mono">
                          {( ( (editModal.mode === 'add' ? (careerStats[editModal.playerId].runs + (editForm.runs || 0)) : (editForm.runs || 0)) / 
                             Math.max(1, (editModal.mode === 'add' ? (careerStats[editModal.playerId].ballsFaced + (editForm.ballsFaced || 0)) : (editForm.ballsFaced || 1))) ) * 100).toFixed(1)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Overs</p>
                        <p className="text-lg font-mono">
                          {(() => {
                            const b = (editModal.mode === 'add' ? (careerStats[editModal.playerId].ballsBowled + (editForm.ballsBowled || 0)) : (editForm.ballsBowled || 0));
                            return (Math.floor(b / 6) + (b % 6) / 10).toFixed(1);
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Eco</p>
                        <p className="text-lg font-mono">
                          {( ( (editModal.mode === 'add' ? (careerStats[editModal.playerId].runsConceded + (editForm.runsConceded || 0)) : (editForm.runsConceded || 0)) / 
                             Math.max(1, (editModal.mode === 'add' ? (careerStats[editModal.playerId].ballsBowled + (editForm.ballsBowled || 0)) : (editForm.ballsBowled || 1))) ) * 6).toFixed(1)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={() => setEditModal(null)}
                  className="flex-1 py-4 border border-white/10 rounded-2xl font-mono text-xs uppercase tracking-widest hover:bg-white/5 transition-all text-gray-400"
                >
                  Cancel
                </button>
                  <button 
                    onClick={handleManualEdit}
                    className={`flex-1 py-4 rounded-2xl font-mono text-xs uppercase tracking-widest font-bold shadow-lg shadow-black/20 ${
                      editModal.mode === 'overwrite' ? 'bg-orange-500 text-black hover:bg-orange-400' : 'bg-green-500 text-black hover:bg-green-400'
                    }`}
                  >
                    Save {editModal.mode === 'overwrite' ? 'Changes' : 'Addition'}
                  </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
