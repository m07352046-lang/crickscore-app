/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Download,
  Eye,
  ArrowLeft,
  Calendar,
  Hash,
  Star,
  Save,
  X,
  Sprout
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

// Firebase core modules and handles
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db, googleProvider, signInWithPopup, signOut, handleFirestoreError, OperationType } from './firebase';

const STORAGE_KEYS = {
  STATS: 'cricket_career_stats',
  DISMISSALS: 'cricket_dismissals',
  MATCH: 'cricket_match_state',
  PLAYERS: 'cricket_players',
  LOGS: 'cricket_manual_logs',
  SESSION_STATS: 'cricket_session_stats'
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'career' | 'history' | 'settings'>('live');

  // Unified persistent initialization checks
  const SAVED_MATCH = localStorage.getItem('active_crickscore_match') || localStorage.getItem(STORAGE_KEYS.MATCH);
  const INITIAL_MATCH_STATE = SAVED_MATCH ? JSON.parse(SAVED_MATCH) : null;

  const [players, setPlayers] = useState<Player[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PLAYERS);
    return saved ? JSON.parse(saved) : INITIAL_PLAYERS;
  });

  const [careerStats, setCareerStats] = useState<Record<number, CareerStats>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STATS);
    if (saved) {
      const stats = JSON.parse(saved);
      Object.keys(stats).forEach(id => {
        const s = stats[id];
        if (s) {
          if (s.inningsBat === undefined) s.inningsBat = 0;
          if (s.inningsBowl === undefined) s.inningsBowl = 0;
          if (s.fifties === undefined) s.fifties = 0;
          if (s.hundreds === undefined) s.hundreds = 0;
          if (s.highestScore === undefined) s.highestScore = 0;
          if (s.hatTricks === undefined) s.hatTricks = 0;
          if (s.wicketStreak === undefined) s.wicketStreak = 0;
          if (s.bestBowling === undefined) s.bestBowling = { wickets: 0, runs: 0 };
          if (s.catches === undefined) s.catches = 0;
          if (s.runOuts === undefined) s.runOuts = 0;
          if (s.throwComplete === undefined) s.throwComplete = 0;
          if (s.stumpings === undefined) s.stumpings = 0;
          if (s.notOuts === undefined) s.notOuts = 0;
          if (s.catchDrop === undefined) s.catchDrop = 0;
          if (s.missField === undefined) s.missField = 0;
          if (s.missedThrows === undefined) s.missedThrows = 0;
        }
      });
      return stats;
    }
    return INITIAL_STATS;
  });

  const [sessionStats, setSessionStats] = useState<Record<number, { 
    batting: { runs: number; balls: number }; 
    bowling: { runs: number; balls: number; wickets: number };
  }>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SESSION_STATS);
    return saved ? JSON.parse(saved) : {};
  });

  const [dismissals, setDismissals] = useState<DismissalRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DISMISSALS);
    return saved ? JSON.parse(saved) : [];
  });

  const [manualEditLogs, setManualEditLogs] = useState<ManualEditLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LOGS);
    return saved ? JSON.parse(saved) : [];
  });

  const [editModal, setEditModal] = useState<{ 
    isOpen: boolean; 
    type: 'batting' | 'bowling' | 'full'; 
    playerId: number;
    mode: 'overwrite' | 'add'
  } | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  
  const [match, setMatch] = useState<MatchState>(() => {
    return INITIAL_MATCH_STATE || {
      strikerId: 1,
      nonStrikerId: 2,
      bowlerId: 3,
      overBalls: 0,
      currentOver: [],
      totalRuns: 0,
      totalWickets: 0,
      extras: 0,
    };
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

  const [isFielderModalOpen, setIsFielderModalOpen] = useState<{ isOpen: boolean; outPlayerId: number | null; type?: 'Stumping' | 'Catch' }>({
    isOpen: false,
    outPlayerId: null,
    type: undefined,
  });

  const [isBowlerModalOpen, setIsBowlerModalOpen] = useState(false);
  const [extraModal, setExtraModal] = useState<{ isOpen: boolean; type: 'wide' | 'noball' | 'lb' | 'by' | null }>({
    isOpen: false,
    type: null,
  });
  const [undoStack, setUndoStack] = useState<StateSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<StateSnapshot[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editProfileName, setEditProfileName] = useState<string>("");
  const [editProfileJersey, setEditProfileJersey] = useState<string>("");
  const [editProfileDob, setEditProfileDob] = useState<string>("");
  const [editCareerStats, setEditCareerStats] = useState<CareerStats | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Authentication & Cloud Synchronization State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoadedFromCloud, setIsLoadedFromCloud] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(() => {
    return localStorage.getItem('crick_guest_mode') === 'true';
  });

  // Reference to avoid overwriting cloud files with outdated/blank values during hydration races
  const lastCloudPayloadRef = useRef<string>('');

  // Keep a ref of current states to avoid any stale closures inside onAuthStateChanged
  const stateRef = useRef({
    match,
    players,
    careerStats,
    sessionStats,
    dismissals,
    manualEditLogs,
    undoStack,
    redoStack
  });

  useEffect(() => {
    stateRef.current = {
      match,
      players,
      careerStats,
      sessionStats,
      dismissals,
      manualEditLogs,
      undoStack,
      redoStack
    };
  }, [match, players, careerStats, sessionStats, dismissals, manualEditLogs, undoStack, redoStack]);

  // Track guest mode state
  useEffect(() => {
    localStorage.setItem('crick_guest_mode', String(isGuestMode));
  }, [isGuestMode]);

  // Auth listener & Cloud DB Hydrator
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      if (currentUser) {
        setIsLoadedFromCloud(false);
        try {
          const matchDocRef = doc(db, 'users', currentUser.uid, 'matches', 'current');
          const docSnap = await getDoc(matchDocRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.players) setPlayers(data.players);
            if (data.careerStats) setCareerStats(sanitizeCareerStats(data.careerStats));
            if (data.sessionStats) setSessionStats(sanitizeSessionStats(data.sessionStats));
            if (data.dismissals) setDismissals(data.dismissals);
            if (data.match) setMatch(sanitizeMatchState(data.match));
            if (data.manualEditLogs) setManualEditLogs(data.manualEditLogs);
            if (data.undoStack) setUndoStack(data.undoStack);
            if (data.redoStack) setRedoStack(data.redoStack);
            
            // Set comparison ref to prevent immediate race condition overwriting
            lastCloudPayloadRef.current = JSON.stringify({
              match: sanitizeMatchState(data.match || {}),
              players: data.players || [],
              careerStats: sanitizeCareerStats(data.careerStats || {}),
              sessionStats: sanitizeSessionStats(data.sessionStats || {}),
              dismissals: data.dismissals || [],
              manualEditLogs: data.manualEditLogs || [],
              undoStack: (data.undoStack || []).slice(-10),
              redoStack: (data.redoStack || []).slice(-10)
            });

            setNotification("Cloud Scores Synchronized");
          } else {
            // Document does not exist. Use the up-to-date statRef to save initial or scored-as-guest state
            const currentObj = stateRef.current;
            const initialPayload = {
              userId: currentUser.uid,
              updatedAt: new Date().toISOString(),
              match: sanitizeMatchState(currentObj.match),
              sessionStats: sanitizeSessionStats(currentObj.sessionStats),
              careerStats: sanitizeCareerStats(currentObj.careerStats),
              players: currentObj.players,
              dismissals: currentObj.dismissals,
              manualEditLogs: currentObj.manualEditLogs,
              undoStack: currentObj.undoStack.slice(-10),
              redoStack: currentObj.redoStack.slice(-10)
            };
            await setDoc(matchDocRef, initialPayload);
            
            lastCloudPayloadRef.current = JSON.stringify({
              match: sanitizeMatchState(currentObj.match),
              players: currentObj.players,
              careerStats: sanitizeCareerStats(currentObj.careerStats),
              sessionStats: sanitizeSessionStats(currentObj.sessionStats),
              dismissals: currentObj.dismissals,
              manualEditLogs: currentObj.manualEditLogs,
              undoStack: currentObj.undoStack.slice(-10),
              redoStack: currentObj.redoStack.slice(-10)
            });

            setNotification("Cloud Snapshot Created");
          }
        } catch (error) {
          console.error("Firestore retrieval error:", error);
          setNotification("Running locally (Cached config)");
        } finally {
          setIsLoadedFromCloud(true);
        }
      } else {
        setIsLoadedFromCloud(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Debounced continuous synchronization to Cloud Firestore
  useEffect(() => {
    if (!user || !isLoadedFromCloud) return;

    const currentPayload = JSON.stringify({
      match: sanitizeMatchState(match),
      players: players,
      careerStats: sanitizeCareerStats(careerStats),
      sessionStats: sanitizeSessionStats(sessionStats),
      dismissals: dismissals,
      manualEditLogs: manualEditLogs,
      undoStack: undoStack.slice(-10), 
      redoStack: redoStack.slice(-10)
    });

    // If the state is identical to the last fetched or saved cloud payload, skip saving!
    if (currentPayload === lastCloudPayloadRef.current) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const matchDocRef = doc(db, 'users', user.uid, 'matches', 'current');
        await setDoc(matchDocRef, {
          userId: user.uid,
          updatedAt: new Date().toISOString(),
          match: sanitizeMatchState(match),
          sessionStats: sanitizeSessionStats(sessionStats),
          careerStats: sanitizeCareerStats(careerStats),
          players: players,
          dismissals: dismissals,
          manualEditLogs: manualEditLogs,
          undoStack: undoStack.slice(-10), 
          redoStack: redoStack.slice(-10)
        });
        lastCloudPayloadRef.current = currentPayload;
        console.log("Match autosaved to cloud");
      } catch (error) {
        console.warn("Firestore queued update offline:", error);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [match, sessionStats, careerStats, players, dismissals, manualEditLogs, user, isLoadedFromCloud]);

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      
      await setDoc(doc(db, 'users', u.uid), {
        uid: u.uid,
        email: u.email || '',
        displayName: u.displayName || '',
        photoURL: u.photoURL || '',
        updatedAt: new Date().toISOString()
      });
      
      setIsGuestMode(false);
      setNotification(`Logged in as ${u.displayName}`);
    } catch (error) {
      console.error("Failed Google Login", error);
      setNotification("Sign in failed");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setIsGuestMode(false);
      setIsLoadedFromCloud(false);
      
      // Clear comparison reference
      lastCloudPayloadRef.current = '';
      
      // Clear local states
      setPlayers(INITIAL_PLAYERS);
      setCareerStats(INITIAL_STATS);
      setSessionStats({});
      setDismissals([]);
      setMatch({
        strikerId: 1,
        nonStrikerId: 2,
        bowlerId: 3,
        overBalls: 0,
        currentOver: [],
        totalRuns: 0,
        totalWickets: 0,
        extras: 0,
      });
      setManualEditLogs([]);
      setUndoStack([]);
      setRedoStack([]);
      
      // Clean local storage
      localStorage.removeItem(STORAGE_KEYS.STATS);
      localStorage.removeItem(STORAGE_KEYS.DISMISSALS);
      localStorage.removeItem(STORAGE_KEYS.MATCH);
      localStorage.removeItem(STORAGE_KEYS.PLAYERS);
      localStorage.removeItem(STORAGE_KEYS.LOGS);
      localStorage.removeItem('crick_guest_mode');
      localStorage.removeItem(STORAGE_KEYS.SESSION_STATS);
      localStorage.removeItem('active_crickscore_match');
      
      setNotification("Session logged out");
    } catch (error) {
      console.error("Logout trigger failed", error);
    }
  };

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
        },
        catches: Math.max(0, s.catches || 0),
        runOuts: Math.max(0, s.runOuts || s.throwComplete || 0),
        throwComplete: Math.max(0, s.throwComplete || s.runOuts || 0),
        stumpings: Math.max(0, s.stumpings || 0),
        notOuts: Math.max(0, s.notOuts || 0),
        innings: Math.max(0, s.innings || 0),
        catchDrop: Math.max(0, s.catchDrop || 0),
        missField: Math.max(0, s.missField || 0),
        missedThrows: Math.max(0, s.missedThrows || 0)
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
    // If a signed-in user is authenticated, skip reloading local storage and let Cloud handle hydration
    if (auth.currentUser) return;

    const savedStats = localStorage.getItem(STORAGE_KEYS.STATS);
    const savedDismissals = localStorage.getItem(STORAGE_KEYS.DISMISSALS);
    const savedMatch = localStorage.getItem('active_crickscore_match') || localStorage.getItem(STORAGE_KEYS.MATCH);
    const savedPlayers = localStorage.getItem(STORAGE_KEYS.PLAYERS);
    const savedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
    const savedSessionStats = localStorage.getItem(STORAGE_KEYS.SESSION_STATS);

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
    if (savedSessionStats) setSessionStats(JSON.parse(savedSessionStats));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(careerStats));
    localStorage.setItem(STORAGE_KEYS.DISMISSALS, JSON.stringify(dismissals));
    localStorage.setItem(STORAGE_KEYS.MATCH, JSON.stringify(match));
    localStorage.setItem('active_crickscore_match', JSON.stringify(match));
    localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(manualEditLogs));
    localStorage.setItem(STORAGE_KEYS.SESSION_STATS, JSON.stringify(sessionStats));
  }, [careerStats, dismissals, match, players, manualEditLogs, sessionStats]);

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

  const submitExtraRuns = (type: 'wide' | 'noball' | 'lb' | 'by', additionalRuns: number) => {
    if ((type === 'lb' || type === 'by') && additionalRuns === 0) {
      handleScore(0);
      setNotification(`${type === 'lb' ? 'Leg Bye' : 'Bye'} recorded as Dot Ball`);
      setExtraModal({ isOpen: false, type: null });
      return;
    }

    pushToHistory();

    const isOverEnd = (type === 'lb' || type === 'by') ? (match.overBalls === 5) : false;

    // label format: e.g. "WD" or "WD+1", "NB" or "NB+4", "LB", "LB+1", "B", "B+1"
    const label = additionalRuns === 0 
      ? (type === 'wide' ? 'WD' : type === 'noball' ? 'NB' : type === 'lb' ? 'LB' : 'B')
      : (type === 'wide' ? `WD+${additionalRuns}` : type === 'noball' ? `NB+${additionalRuns}` : type === 'lb' ? `LB+${additionalRuns}` : `B+${additionalRuns}`);

    const penalty = 1;
    const deliveryTotalConceded = penalty + additionalRuns;

    // Strike Rotation logic:
    let rotate = false;
    if (type === 'wide' || type === 'noball') {
      rotate = (additionalRuns % 2 !== 0);
    } else {
      // lb or by: if physical runs run by batsman is odd
      const physicalRunsRun = (additionalRuns === 4 || additionalRuns === 6) ? 0 : (1 + additionalRuns);
      const ranOdd = (physicalRunsRun % 2 !== 0);
      rotate = ( (ranOdd && !isOverEnd) || (!ranOdd && isOverEnd) );
    }

    setMatch(prev => {
      const nextStrikerId = rotate ? prev.nonStrikerId : prev.strikerId;
      const nextNonStrikerId = rotate ? prev.strikerId : prev.nonStrikerId;
      
      return {
        ...prev,
        overBalls: (type === 'lb' || type === 'by') ? (isOverEnd ? 0 : prev.overBalls + 1) : prev.overBalls,
        totalRuns: prev.totalRuns + deliveryTotalConceded,
        extras: prev.extras + deliveryTotalConceded,
        currentOver: [...prev.currentOver, label],
        ...(rotate ? {
          strikerId: nextStrikerId,
          nonStrikerId: nextNonStrikerId
        } : {})
      };
    });

    setSessionStats(prev => {
      const s = prev[match.strikerId] || { batting: { runs: 0, balls: 0, inningsCounted: false }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      const b = prev[match.bowlerId] || { batting: { runs: 0, balls: 0, inningsCounted: false }, bowling: { runs: 0, balls: 0, wickets: 0 } };

      const newStrikerBatting = { ...s.batting };
      if (type === 'noball' || type === 'lb' || type === 'by') {
        newStrikerBatting.balls = s.batting.balls + 1; // Nb, LB, and Bye counts as ball faced by batsman
        newStrikerBatting.inningsCounted = true;
      }

      const newBowlerBowling = { ...b.bowling };
      if (type === 'lb' || type === 'by') {
        newBowlerBowling.balls = b.bowling.balls + 1; // legal delivery
      } else {
        newBowlerBowling.runs = b.bowling.runs + deliveryTotalConceded;
      }

      return {
        ...prev,
        ...((type === 'noball' || type === 'lb' || type === 'by') ? {
          [match.strikerId]: {
            ...s,
            batting: newStrikerBatting
          }
        } : {}),
        [match.bowlerId]: {
          ...b,
          bowling: newBowlerBowling
        }
      };
    });

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

      const newStrikerStats = { ...striker };
      if (type === 'noball' || type === 'lb' || type === 'by') {
        newStrikerStats.ballsFaced = striker.ballsFaced + 1;
        newStrikerStats.inningsBat = striker.inningsBat + (wasCounted ? 0 : 1);
      }

      const newBowlerStats = { ...bowler };
      if (type === 'lb' || type === 'by') {
        newBowlerStats.ballsBowled = bowler.ballsBowled + 1;
        newBowlerStats.wicketStreak = 0; // Reset consecutive delivery streak on extras
      } else {
        newBowlerStats.runsConceded = bowler.runsConceded + deliveryTotalConceded;
        newBowlerStats.wicketStreak = 0; // Reset consecutive delivery streak on extras
      }

      return {
        ...prev,
        ...((type === 'noball' || type === 'lb' || type === 'by') ? { [match.strikerId]: newStrikerStats } : {}),
        [match.bowlerId]: newBowlerStats
      };
    });

    setExtraModal({ isOpen: false, type: null });

    const extraTypeName = type === 'wide' ? 'Wide' : (type === 'noball' ? 'No-Ball' : (type === 'lb' ? 'Leg Bye' : 'Bye'));
    const additionSuffix = additionalRuns > 0 ? ` (+${additionalRuns} run${additionalRuns > 1 ? 's' : ''} scored)` : '';
    setNotification(`${extraTypeName} recorded: +${deliveryTotalConceded} run${deliveryTotalConceded > 1 ? 's' : ''}${additionSuffix}`);

    if (isOverEnd) {
      setIsBowlerModalOpen(true);
    }
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

  const confirmStumping = async (outPlayerId: number, keeperId: number) => {
    const outPlayer = players.find(p => p.id === outPlayerId);
    const outPlayerName = outPlayer?.name || 'Unknown';

    const currentSession = sessionStats[outPlayerId]?.batting || { runs: 0, balls: 0, inningsCounted: false };
    const finalSession = {
      runs: currentSession.runs,
      balls: currentSession.balls + 1,
      inningsCounted: true
    };

    // 1. Career stats local updates
    setCareerStats(prev => {
      const getStatsFromPrev = (statsRecord: Record<number, CareerStats>, id: number): CareerStats => {
        return statsRecord[id] || {
          runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
          inningsBat: 0, highestScore: 0,
          wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
          bestBowling: { wickets: 0, runs: 0 },
          wicketStreak: 0,
          dots: 0,
          inningsBowl: 0,
          stumpings: 0
        };
      };

      const nextCareerStats = { ...prev };

      // Bowler stats
      const originalBowlerStats = getStatsFromPrev(prev, match.bowlerId);
      const s_newStreak = originalBowlerStats.wicketStreak + 1;
      const s_isHatTrick = s_newStreak === 3;

      nextCareerStats[match.bowlerId] = {
        ...originalBowlerStats,
        wickets: originalBowlerStats.wickets + 1,
        ballsBowled: originalBowlerStats.ballsBowled + 1,
        wicketStreak: s_isHatTrick ? 0 : s_newStreak,
        hatTricks: originalBowlerStats.hatTricks + (s_isHatTrick ? 1 : 0)
      };

      // Out player stats
      const originalOutStats = getStatsFromPrev(prev, outPlayerId);
      const isFifty = finalSession.runs >= 50 && finalSession.runs < 100;
      const isHundred = finalSession.runs >= 100;
      const wasCounted = !!currentSession.inningsCounted;

      nextCareerStats[outPlayerId] = {
        ...originalOutStats,
        ballsFaced: originalOutStats.ballsFaced + 1,
        inningsBat: originalOutStats.inningsBat + (wasCounted ? 0 : 1),
        fifties: originalOutStats.fifties + (isFifty ? 1 : 0),
        hundreds: originalOutStats.hundreds + (isHundred ? 1 : 0),
        highestScore: Math.max(originalOutStats.highestScore, finalSession.runs)
      };

      // Wicketkeeper stats
      const originalKeeperStats = getStatsFromPrev(prev, keeperId);
      nextCareerStats[keeperId] = {
        ...originalKeeperStats,
        stumpings: (originalKeeperStats.stumpings || 0) + 1
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

    // 3. Update Session Scoreboard
    setSessionStats(prev => {
      const b = prev[match.bowlerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      return {
        ...prev,
        [match.bowlerId]: {
          ...b,
          bowling: { 
            ...b.bowling, 
            wickets: b.bowling.wickets + 1, 
            balls: b.bowling.balls + 1 
          }
        },
        [outPlayerId]: {
          ...(prev[outPlayerId] || { bowling: { runs: 0, balls: 0, wickets: 0 } }),
          batting: { runs: 0, balls: 0, inningsCounted: false }
        }
      };
    });

    // 4. Match State updates
    setMatch(prev => ({
      ...prev,
      totalWickets: prev.totalWickets + 1,
      overBalls: prev.overBalls === 5 ? 0 : prev.overBalls + 1,
      currentOver: [...prev.currentOver, 'W'],
      strikerId: 0, // Clear striker slot
    }));

    // 5. Update selected player's Firestore document
    if (user) {
      try {
        const playerRef = doc(db, 'users', user.uid, 'players', String(keeperId));
        await updateDoc(playerRef, {
          'careerStats.stumpings': increment(1)
        });
      } catch (error) {
        console.error("Firestore player document update failed:", error);
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/players/${keeperId}`);
      }
    }

    // 6. Set UI Feedback & open batsman dialog list
    const sessionBatting = sessionStats[outPlayerId]?.batting || { runs: 0, balls: 0 };
    const keeperName = players.find(p => p.id === keeperId)?.name || 'Wicketkeeper';
    setNotification(`Stumped out by ${keeperName}: Innings Saved for ${outPlayerName} (${sessionBatting.runs} runs)`);

    setIsFielderModalOpen({ isOpen: false, outPlayerId: null });
    setIsWicketModalOpen({ isOpen: true, outPlayerId });
  };

  const confirmCatch = async (outPlayerId: number, fielderId: number) => {
    const outPlayer = players.find(p => p.id === outPlayerId);
    const outPlayerName = outPlayer?.name || 'Unknown';

    const currentSession = sessionStats[outPlayerId]?.batting || { runs: 0, balls: 0, inningsCounted: false };
    const finalSession = {
      runs: currentSession.runs,
      balls: currentSession.balls + 1,
      inningsCounted: true
    };

    // 1. Career stats local updates
    setCareerStats(prev => {
      const getStatsFromPrev = (statsRecord: Record<number, CareerStats>, id: number): CareerStats => {
        return statsRecord[id] || {
          runs: 0, ballsFaced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
          inningsBat: 0, highestScore: 0,
          wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0,
          bestBowling: { wickets: 0, runs: 0 },
          wicketStreak: 0,
          dots: 0,
          inningsBowl: 0,
          stumpings: 0,
          catches: 0
        };
      };

      const nextCareerStats = { ...prev };

      // Bowler stats
      const originalBowlerStats = getStatsFromPrev(prev, match.bowlerId);
      const s_newStreak = originalBowlerStats.wicketStreak + 1;
      const s_isHatTrick = s_newStreak === 3;

      nextCareerStats[match.bowlerId] = {
        ...originalBowlerStats,
        wickets: originalBowlerStats.wickets + 1,
        ballsBowled: originalBowlerStats.ballsBowled + 1,
        wicketStreak: s_isHatTrick ? 0 : s_newStreak,
        hatTricks: originalBowlerStats.hatTricks + (s_isHatTrick ? 1 : 0)
      };

      // Out player stats
      const originalOutStats = getStatsFromPrev(prev, outPlayerId);
      const isFifty = finalSession.runs >= 50 && finalSession.runs < 100;
      const isHundred = finalSession.runs >= 100;
      const wasCounted = !!currentSession.inningsCounted;

      nextCareerStats[outPlayerId] = {
        ...originalOutStats,
        ballsFaced: originalOutStats.ballsFaced + 1,
        inningsBat: originalOutStats.inningsBat + (wasCounted ? 0 : 1),
        fifties: originalOutStats.fifties + (isFifty ? 1 : 0),
        hundreds: originalOutStats.hundreds + (isHundred ? 1 : 0),
        highestScore: Math.max(originalOutStats.highestScore, finalSession.runs)
      };

      // Fielder stats
      const originalFielderStats = getStatsFromPrev(prev, fielderId);
      nextCareerStats[fielderId] = {
        ...originalFielderStats,
        catches: (originalFielderStats.catches || 0) + 1
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

    // 3. Update Session Scoreboard
    setSessionStats(prev => {
      const b = prev[match.bowlerId] || { batting: { runs: 0, balls: 0 }, bowling: { runs: 0, balls: 0, wickets: 0 } };
      return {
        ...prev,
        [match.bowlerId]: {
          ...b,
          bowling: { 
            ...b.bowling, 
            wickets: b.bowling.wickets + 1, 
            balls: b.bowling.balls + 1 
          }
        },
        [outPlayerId]: {
          ...(prev[outPlayerId] || { bowling: { runs: 0, balls: 0, wickets: 0 } }),
          batting: { runs: 0, balls: 0, inningsCounted: false }
        }
      };
    });

    // 4. Match State updates
    setMatch(prev => ({
      ...prev,
      totalWickets: prev.totalWickets + 1,
      overBalls: prev.overBalls === 5 ? 0 : prev.overBalls + 1,
      currentOver: [...prev.currentOver, 'W'],
      strikerId: 0, // Clear striker slot
    }));

    // 5. Update selected player's Firestore document
    if (user) {
      try {
        const playerRef = doc(db, 'users', user.uid, 'players', String(fielderId));
        await updateDoc(playerRef, {
          'careerStats.catches': increment(1)
        });
      } catch (error) {
        console.error("Firestore player document update failed:", error);
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/players/${fielderId}`);
      }
    }

    // 6. Set UI Feedback & open batsman dialog list
    const sessionBatting = sessionStats[outPlayerId]?.batting || { runs: 0, balls: 0 };
    const fielderName = players.find(p => p.id === fielderId)?.name || 'Fielder';
    setNotification(`Caught out by ${fielderName}: Innings Saved for ${outPlayerName} (${sessionBatting.runs} runs)`);

    setIsFielderModalOpen({ isOpen: false, outPlayerId: null });
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

  const handleInningsEnd = async () => {
    const strikerId = match.strikerId;
    const nonStrikerId = match.nonStrikerId;

    if (!strikerId || strikerId === 0) {
      setNotification("No active striker selected.");
      return;
    }

    pushToHistory();

    const strikerPlayer = players.find(p => p.id === strikerId);
    const strikerName = strikerPlayer?.name || "Striker";

    // 1. Get current career stats for Striker
    const strikerStats = getPlayerStats(strikerId);

    // 2. Fetch active session stats to compute milestones for Striker
    const strikerSession = sessionStats[strikerId]?.batting || { runs: 0, balls: 0, inningsCounted: false };
    const strikerFifty = strikerSession.runs >= 50 && strikerSession.runs < 100;
    const strikerHundred = strikerSession.runs >= 100;

    const newStrikerStats: CareerStats = {
      ...strikerStats,
      innings: (strikerStats.innings || 0) + 1,
      notOuts: (strikerStats.notOuts || 0) + 1,
      inningsBat: strikerStats.inningsBat + (strikerSession.balls > 0 && !strikerSession.inningsCounted ? 1 : 0),
      fifties: strikerStats.fifties + (strikerFifty ? 1 : 0),
      hundreds: strikerStats.hundreds + (strikerHundred ? 1 : 0),
      highestScore: Math.max(strikerStats.highestScore || 0, strikerSession.runs || 0)
    };

    // 3. Compute stats for Non-Striker if active
    let newNonStrikerStats: CareerStats | null = null;
    const nonStrikerPlayer = nonStrikerId && nonStrikerId !== 0 ? players.find(p => p.id === nonStrikerId) : null;
    const nonStrikerName = nonStrikerPlayer?.name || "Non-Striker";

    if (nonStrikerId && nonStrikerId !== 0) {
      const nonStrikerStats = getPlayerStats(nonStrikerId);
      const nonStrikerSession = sessionStats[nonStrikerId]?.batting || { runs: 0, balls: 0, inningsCounted: false };
      const nonStrikerFifty = nonStrikerSession.runs >= 50 && nonStrikerSession.runs < 100;
      const nonStrikerHundred = nonStrikerSession.runs >= 100;

      newNonStrikerStats = {
        ...nonStrikerStats,
        innings: (nonStrikerStats.innings || 0) + 1,
        notOuts: (nonStrikerStats.notOuts || 0) + 1,
        inningsBat: nonStrikerStats.inningsBat + (nonStrikerSession.balls > 0 && !nonStrikerSession.inningsCounted ? 1 : 0),
        fifties: nonStrikerStats.fifties + (nonStrikerFifty ? 1 : 0),
        hundreds: nonStrikerStats.hundreds + (nonStrikerHundred ? 1 : 0),
        highestScore: Math.max(nonStrikerStats.highestScore || 0, nonStrikerSession.runs || 0)
      };
    }

    // Update local React state for careerStats
    setCareerStats(prev => {
      const nextStats = {
        ...prev,
        [strikerId]: newStrikerStats
      };
      if (nonStrikerId && nonStrikerId !== 0 && newNonStrikerStats) {
        nextStats[nonStrikerId] = newNonStrikerStats;
      }
      return nextStats;
    });

    // Helper to build payload
    const buildPayload = (id: number, name: string, jerseyNo: number | null | undefined, dob: string | null | undefined, uStats: CareerStats) => ({
      id,
      name: name || '',
      jerseyNo: jerseyNo ?? null,
      dob: dob || null,
      careerStats: {
        runs: Math.max(0, Number(uStats.runs) || 0),
        ballsFaced: Math.max(0, Number(uStats.ballsFaced) || 0),
        fours: Math.max(0, Number(uStats.fours) || 0),
        sixes: Math.max(0, Number(uStats.sixes) || 0),
        wickets: Math.max(0, Number(uStats.wickets) || 0),
        runsConceded: Math.max(0, Number(uStats.runsConceded) || 0),
        ballsBowled: Math.max(0, Number(uStats.ballsBowled) || 0),
        dots: Math.max(0, Number(uStats.dots) || 0),
        inningsBat: Math.max(0, Number(uStats.inningsBat) || 0),
        inningsBowl: Math.max(0, Number(uStats.inningsBowl) || 0),
        fifties: Math.max(0, Number(uStats.fifties) || 0),
        hundreds: Math.max(0, Number(uStats.hundreds) || 0),
        highestScore: Math.max(0, Number(uStats.highestScore) || 0),
        hatTricks: Math.max(0, Number(uStats.hatTricks) || 0),
        wicketStreak: Math.max(0, Number(uStats.wicketStreak) || 0),
        bestBowling: {
          wickets: Math.max(0, Number(uStats.bestBowling?.wickets) || 0),
          runs: Math.max(0, Number(uStats.bestBowling?.runs) || 0)
        },
        catches: Math.max(0, Number(uStats.catches) || 0),
        runOuts: Math.max(0, Number(uStats.runOuts) || Number(uStats.throwComplete) || 0),
        throwComplete: Math.max(0, Number(uStats.throwComplete) || Number(uStats.runOuts) || 0),
        stumpings: Math.max(0, Number(uStats.stumpings) || 0),
        notOuts: Math.max(0, Number(uStats.notOuts) || 0),
        innings: Math.max(0, Number(uStats.innings) || 0),
        catchDrop: Math.max(0, Number(uStats.catchDrop) || 0),
        missField: Math.max(0, Number(uStats.missField) || 0),
        missedThrows: Math.max(0, Number(uStats.missedThrows) || 0)
      },
      updatedAt: new Date().toISOString()
    });

    // If logged in, trigger Firestore update for this specific player document
    if (user) {
      try {
        // Update Striker
        const strikerRef = doc(db, 'users', user.uid, 'players', String(strikerId));
        const strikerPayload = buildPayload(strikerId, strikerPlayer?.name || '', strikerPlayer?.jerseyNo, strikerPlayer?.dob, newStrikerStats);
        await setDoc(strikerRef, strikerPayload);

        // Update Non-Striker with safety guard
        if (nonStrikerId && nonStrikerId !== 0 && newNonStrikerStats) {
          const nonStrikerRef = doc(db, 'users', user.uid, 'players', String(nonStrikerId));
          const nonStrikerPayload = buildPayload(nonStrikerId, nonStrikerPlayer?.name || '', nonStrikerPlayer?.jerseyNo, nonStrikerPlayer?.dob, newNonStrikerStats);
          await setDoc(nonStrikerRef, nonStrikerPayload);
          setNotification(`Innings ended! ${strikerName} & ${nonStrikerName} remained Not Out. Cloud updated.`);
        } else {
          setNotification(`Innings ended! ${strikerName} remained Not Out. Cloud updated.`);
        }
      } catch (error) {
        console.error("Firestore player docs update failed", error);
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/players/...`);
      }
    } else {
      if (nonStrikerId && nonStrikerId !== 0) {
        setNotification(`Innings ended! ${strikerName} & ${nonStrikerName} remained Not Out (Guest Mode).`);
      } else {
        setNotification(`Innings ended! ${strikerName} remained Not Out (Guest Mode).`);
      }
    }

    // 3. State Cleanup: Reset the active live match scoring states back to default zeros (00)
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0B1033] to-[#05071A] flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-[#FF1F7E] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 font-mono text-xs uppercase tracking-widest animate-pulse">Initializing Environment...</p>
        </div>
      </div>
    );
  }

  if (!user && !isGuestMode) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0B1033] to-[#05071A] flex items-center justify-center p-6 text-white font-sans selection:bg-[#FF1F7E]/30">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#0D153B] border border-[#FF1F7E]/25 p-8 rounded-3xl shadow-2xl relative overflow-hidden shadow-[#FF1F7E]/10"
        >
          {/* Decorative accents */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#FF1F7E]/15 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-[#FF1F7E]/5 rounded-full blur-3xl"></div>
 
          <div className="flex flex-col items-center text-center space-y-6 relative z-10">
            <div className="w-16 h-16 bg-gradient-to-br from-[#FF1F7E] to-[#DF0A61] rounded-2xl flex items-center justify-center shadow-lg shadow-[#FF1F7E]/25 border border-[#FF1F7E]/40">
              <Trophy size={32} className="text-white" />
            </div>
 
            <div className="space-y-2">
              <h1 className="text-3xl font-extrabold uppercase tracking-tighter text-white font-mono">
                <span className="text-[#FF1F7E]">CRICK</span><span className="text-white">SCORE</span>
              </h1>
              <p className="text-[10px] uppercase font-mono text-[#FFA000] tracking-[0.2em] font-bold">
                Infinite Loop Scorer
              </p>
              <p className="text-xs text-[#CBD5E1] font-mono max-w-xs pt-2 leading-relaxed">
                Cloud-backed session statistics, career profiles, milestones, and offline capability.
              </p>
            </div>
 
            <div className="w-full pt-4 space-y-3">
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-[#121A4B] hover:bg-[#1A266D] border border-[#FF1F7E]/40 hover:border-[#FF1F7E] text-white font-bold font-mono uppercase text-xs tracking-wider rounded-2xl transition-all shadow-lg active:scale-[0.98] cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.564-1.859 4.604-6.887 4.604-4.337 0-7.874-3.59-7.874-8s3.537-8 7.874-8c2.467 0 4.12 1.025 5.064 1.93l3.245-3.13C18.375 1.914 15.545 1 12.24 1A10.974 10.974 0 0 0 1.25 12a10.974 10.974 0 0 0 10.99 11c5.73 0 11.25-4.04 11.25-11.25 0-.765-.082-1.343-.225-1.742H12.24z"/>
                </svg>
                Continue with Google
              </button>
 
              <button
                onClick={() => {
                  setIsGuestMode(true);
                  setNotification("Entered Guest Mode");
                }}
                className="w-full py-4 px-6 bg-transparent hover:bg-white/5 border border-white/20 text-[#CBD5E1] hover:text-white font-mono uppercase text-[10px] tracking-widest rounded-2xl transition-all active:scale-[0.98] cursor-pointer"
              >
                Use Offline Guest Mode
              </button>
            </div>
 
            <div className="pt-4 border-t border-white/5 w-full text-[9px] font-mono text-gray-500 flex justify-between uppercase">
              <span>⚡ PWA Offline Cache</span>
              <span>🔒 Cloud Desync Guard</span>
            </div>
          </div>
        </motion.div>
 
        {/* Global Floating alert notifications block so that offline modes still render hints */}
        {notification && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[200] bg-[#FF1F7E] border border-[#FF5B9F] text-white font-mono text-[10px] px-4 py-2 rounded-full uppercase tracking-wider font-bold shadow-2xl">
            {notification}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#080d32] via-[#05081e] to-[#020410] text-slate-100 font-sans selection:bg-[#FF1F7E]/30">
      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#060921]/95 border-t border-[#FF1F7E]/35 backdrop-blur-md z-50 px-6 py-4 flex justify-around items-center shadow-[0_-8px_30px_rgb(0,0,0,0.5)]">
        <button 
          onClick={() => setActiveTab('live')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'live' ? 'text-[#FF1F7E]' : 'text-[#CBD5E1]/60 hover:text-[#CBD5E1]'}`}
        >
          <Zap size={24} className={activeTab === 'live' ? 'drop-shadow-[0_0_8px_#FF1F7E]' : ''} />
          <span className="text-[10px] uppercase font-mono tracking-widest">Live</span>
        </button>
        <button 
          onClick={() => setActiveTab('career')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'career' ? 'text-[#FF1F7E]' : 'text-[#CBD5E1]/60 hover:text-[#CBD5E1]'}`}
        >
          <Trophy size={24} className={activeTab === 'career' ? 'drop-shadow-[0_0_8px_#FF1F7E]' : ''} />
          <span className="text-[10px] uppercase font-mono tracking-widest">Career</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'history' ? 'text-[#FF1F7E]' : 'text-[#CBD5E1]/60 hover:text-[#CBD5E1]'}`}
        >
          <History size={24} className={activeTab === 'history' ? 'drop-shadow-[0_0_8px_#FF1F7E]' : ''} />
          <span className="text-[10px] uppercase font-mono tracking-widest">Records</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'settings' ? 'text-[#FF1F7E]' : 'text-[#CBD5E1]/60 hover:text-[#CBD5E1]'}`}
        >
          <RotateCw size={24} className={activeTab === 'settings' ? 'drop-shadow-[0_0_8px_#FF1F7E]' : ''} />
          <span className="text-[10px] uppercase font-mono tracking-widest">Settings</span>
        </button>
      </nav>

      <main className="pb-24 pt-8 px-4 max-w-lg mx-auto">
        {/* User bar / Connection status */}
        <div className="flex justify-between items-center bg-[#0D153B] border border-[#FF1F7E]/25 rounded-2xl px-4 py-3 mb-6 font-mono text-xs text-slate-300 shadow-md">
          {user ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full border border-[#FF1F7E]/30 object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#FF1F7E]/20 text-[#FF1F7E] flex items-center justify-center text-[10px] font-bold">
                    {user.displayName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <span className="text-white font-bold max-w-[120px] truncate text-[11px]">{user.displayName}</span>
                <span className="text-[8px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold border border-green-500/25">Synced</span>
              </div>
              <button 
                onClick={handleLogout}
                className="text-[10px] text-red-400 hover:text-red-300 uppercase tracking-widest font-bold underline cursor-pointer"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-500 font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                Local Guest
              </div>
              <button 
                onClick={() => {
                  setIsGuestMode(false);
                  setUser(null);
                }}
                className="text-[10px] text-[#FF1F7E] hover:text-[#FF4294] uppercase tracking-widest font-bold flex items-center gap-1 bg-[#FF1F7E]/10 border border-[#FF1F7E]/35 px-3 py-1 rounded-lg hover:bg-[#FF1F7E]/20 transition-all cursor-pointer"
              >
                Backup on Cloud
              </button>
            </div>
          )}
        </div>
        {/* Header Stat */}
        <div className="flex justify-between items-center mb-8 border-b border-[#FF1F7E]/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF1F7E] rounded-full flex items-center justify-center animate-pulse shadow-md shadow-[#FF1F7E]/30">
              <RotateCw size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-mono tracking-tighter leading-none uppercase text-white">
                Infinite Loop
              </h1>
              <p className="text-[10px] uppercase font-mono text-slate-400 mt-1 tracking-widest">Continuous Session</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-mono text-white">
              {match.totalRuns}/{match.totalWickets}
            </p>
            <p className="text-[10px] uppercase font-mono text-slate-300 tracking-widest">
              Score (Ex: {match.extras || 0})
            </p>
            <p className="text-[9px] uppercase font-mono text-[#FFA000] tracking-widest mt-1 font-bold">
              Active Over: 0.{match.overBalls}
            </p>
          </div>
        </div>

        {activeTab === 'live' && (
          <div className="space-y-6">
            <div className="flex justify-end mb-2">
              <button 
                onClick={handleNewMatch}
                className="px-4 py-2 border border-[#FFA000]/40 bg-[#FFA000]/10 text-[#FFA000] rounded-lg font-mono text-[10px] uppercase tracking-widest hover:bg-[#FFA000]/25 hover:border-[#FFA000] transition-all"
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
                <RotateCw size={14} className={undoStack.length > 0 ? 'text-[#FF1F7E]' : 'text-gray-700'} style={{ transform: 'scaleX(-1)' }} /> 
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
                <RotateCw size={14} className={redoStack.length > 0 ? 'text-[#FF1F7E]' : 'text-gray-700'} />
              </button>
            </div>
 
            {/* Notification Toast */}
            <AnimatePresence>
              {notification && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#FF1F7E] to-[#DF0A61] border border-[#FF5B9F]/30 text-white px-6 py-3 rounded-full font-mono text-xs uppercase tracking-widest shadow-2xl z-[100] flex items-center gap-2"
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
              ].map((bat, idx) => {
                const isStriker = bat.active;
                return (
                  <motion.div 
                    key={idx}
                    layout
                    className={isStriker 
                      ? "relative p-6 rounded-2xl border-0 text-white" 
                      : "relative p-6 rounded-2xl border border-slate-400/30 bg-[#0C1235]/95 shadow-md text-slate-100"
                    }
                    style={isStriker ? { 
                      backgroundColor: '#FF1F7E',
                      boxShadow: '0 2px 25px rgba(254, 1, 154, 0.12), inset 0 0 12px rgba(255, 255, 255, 0.35)' 
                    } : undefined}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-4 flex-1">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/10 flex-shrink-0">
                          {players.find(p => p.id === bat.id)?.avatar ? (
                            <img src={players.find(p => p.id === bat.id)?.avatar} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center rounded-full ${isStriker ? 'bg-white/20 text-white' : 'bg-[#FF1F7E]/10 text-[#FF1F7E]'}`}>
                              <User size={20} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <span className={`text-[10px] uppercase font-mono tracking-widest mb-1 block font-bold ${isStriker ? 'text-white/90' : 'text-[#FFA000]'}`}>
                            {bat.label}
                          </span>
                          <select 
                            value={bat.id}
                            onChange={(e) => setMatch(prev => ({ ...prev, [bat.key]: Number(e.target.value) }))}
                            className={`text-2xl font-mono tracking-tight bg-transparent border-none focus:ring-0 w-full appearance-none p-0 cursor-pointer ${bat.id === 0 ? 'text-white/50 italic' : 'text-white font-bold'}`}
                          >
                            <option value={0} className="bg-[#0C1235]">Select Player</option>
                            {players.map(p => (
                              <option key={p.id} value={p.id} className="bg-[#0C1235]">{p.name}</option>
                            ))}
                          </select>
                          {bat.id !== 0 && (
                            <button 
                              onClick={() => resetPlayerSession(bat.id, 'batting')}
                              className={`text-[9px] uppercase font-mono mt-1 transition-colors flex items-center gap-1 ${isStriker ? 'text-white/75 hover:text-white' : 'text-[#FFA000]/70 hover:text-[#FFA000]'}`}
                            >
                              <RotateCw size={10} /> Reset Session
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xl font-mono font-bold">
                          {bat.id === 0 ? '—' : `${sessionStats[bat.id]?.batting.runs || 0} (${sessionStats[bat.id]?.batting.balls || 0})`}
                        </p>
                        <p className={`text-[8px] uppercase font-mono mt-1 ${isStriker ? 'text-white/80' : 'text-slate-400'}`}>Live Score</p>
                      </div>
                    </div>
 
                    {isStriker && bat.id !== 0 && (
                      <>
                        <div className="grid grid-cols-4 gap-2 mt-4">
                          {[0, 'WICKET', 1, 2, 3, 4, 6].map(r => {
                            if (r === 'WICKET') {
                              return (
                                <button
                                  key="wicket"
                                  onClick={() => handleWicket(bat.id)}
                                  className="py-2 bg-[#E0E0E0] hover:bg-white text-[#FF0000] rounded-lg font-mono text-[10px] font-extrabold transition-all active:scale-95 flex flex-col items-center justify-center gap-1 shadow-md shadow-black/10 border border-[#E0E0E0]"
                                >
                                  <Skull size={15} className="text-[#FF0000]" />
                                  <span className="leading-none uppercase tracking-wider text-[#FF0000]">WICKET</span>
                                </button>
                              );
                            }
                            if (r === 0) {
                              return (
                                <button
                                  key="dot"
                                  onClick={() => handleScore(0)}
                                  className="py-2 bg-[#008000] hover:bg-[#009900] text-white rounded-lg font-mono transition-all active:scale-95 shadow-[inset_0_1px_3px_rgba(255,255,255,0.4)] border border-[#006600]/30 flex flex-col items-center justify-center gap-1"
                                >
                                  <Sprout size={16} className="text-white" />
                                  <span className="text-[10px] tracking-wider uppercase font-extrabold leading-none">Dot</span>
                                </button>
                              );
                            }
                            return (
                              <button
                                key={r}
                                onClick={() => handleScore(Number(r))}
                                className="py-3 bg-[#0B132B] hover:bg-[#142047] text-white border border-white/10 rounded-lg font-mono text-lg font-extrabold transition-all active:scale-95 shadow-[inset_0_1px_3px_rgba(255,255,255,0.15)] flex items-center justify-center"
                              >
                                +{r}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={handleInningsEnd}
                          className="w-full mt-4 py-3 bg-[#080D32] hover:bg-[#12194B] text-white border border-white/10 rounded-xl font-mono text-xs uppercase tracking-widest font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 hover:border-[#FF1F7E]/30"
                        >
                          <Trophy size={14} className="text-[#FF1F7E]" />
                          Innings End (Remain Not Out)
                        </button>
                      </>
                    )}
 
                    {/* Removed absolute OUT button to use grid-based red button */}
                  </motion.div>
                );
              })}
            </div>

            {/* Controls */}
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={rotateStrike}
                className="flex items-center justify-center gap-2 py-4 bg-[#0D153B]/65 hover:bg-[#131E54]/85 rounded-xl border border-[#FF1F7E]/20 hover:border-[#FF1F7E]/45 font-mono text-xs uppercase tracking-widest transition-all text-white shadow-md cursor-pointer"
              >
                <RotateCw size={14} className="text-[#FF1F7E]" /> Rotate Strike
              </button>
              <button 
                onClick={emergencySwap}
                className="flex items-center justify-center gap-2 py-4 bg-[#0D153B]/65 hover:bg-[#131E54]/85 rounded-xl border border-[#FF1F7E]/20 hover:border-[#FF1F7E]/45 font-mono text-xs uppercase tracking-widest transition-all text-white shadow-md cursor-pointer"
              >
                <AlertCircle size={14} className="text-red-400" /> Swap Bowler
              </button>
            </div>
 
            {/* Bowler Section */}
            <div className="p-6 rounded-xl border border-dashed border-[#FF1F7E]/30 bg-[#0C1235]/95 shadow-md">
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 border border-white/10 flex-shrink-0">
                    {players.find(p => p.id === match.bowlerId)?.avatar ? (
                      <img src={players.find(p => p.id === match.bowlerId)?.avatar} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#FF1F7E]/10 text-[#FF1F7E] rounded-full">
                        <User size={20} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-widest mb-1 block">Current Bowler</span>
                    <select 
                      value={match.bowlerId}
                      onChange={(e) => setMatch(prev => ({ ...prev, bowlerId: Number(e.target.value) }))}
                      className="text-xl font-mono bg-transparent border-none focus:ring-0 w-full appearance-none text-white p-0 cursor-pointer font-bold"
                    >
                      {players.map(p => (
                        <option key={p.id} value={p.id} className="bg-[#0C1235]">{p.name}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-3 mt-1">
                      <button 
                        onClick={() => {
                          resetPlayerSession(match.bowlerId, 'bowling');
                          setMatch(prev => ({ ...prev, overBalls: 0, currentOver: [] }));
                        }}
                        className="text-[9px] uppercase font-mono text-[#FFA000]/70 hover:text-[#FFA000] transition-colors flex items-center gap-1"
                      >
                        <RotateCw size={10} /> Reset Session
                      </button>
                    </div>
                    <div className="flex gap-3 mt-2">
                      <span className="text-[10px] font-mono text-[#FF1F7E] uppercase tracking-wider font-bold">
                        Wkts: {sessionStats[match.bowlerId]?.bowling.wickets || 0}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                        Eco: {((sessionStats[match.bowlerId]?.bowling.runs || 0) / (sessionStats[match.bowlerId]?.bowling.balls || 1) * 6).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setExtraModal({ isOpen: true, type: 'wide' })}
                    className="px-4 py-2 bg-[#080D32] hover:bg-[#FF1F7E]/20 hover:text-white border border-white/10 rounded-lg font-mono text-sm uppercase text-slate-100 font-bold transition-all shadow-sm"
                  >
                    WD
                  </button>
                  <button 
                    onClick={() => setExtraModal({ isOpen: true, type: 'noball' })}
                    className="px-4 py-2 bg-[#080D32] hover:bg-[#FF1F7E]/20 hover:text-white border border-white/10 rounded-lg font-mono text-sm uppercase text-slate-100 font-bold transition-all shadow-sm"
                  >
                    NB
                  </button>
                  <button 
                    onClick={() => setExtraModal({ isOpen: true, type: 'lb' })}
                    className="px-4 py-2 bg-[#080D32] hover:bg-[#FF1F7E]/20 hover:text-white border border-white/10 rounded-lg font-mono text-sm uppercase text-slate-100 font-bold transition-all shadow-sm"
                  >
                    LB
                  </button>
                  <button 
                    onClick={() => setExtraModal({ isOpen: true, type: 'by' })}
                    className="px-4 py-2 bg-[#080D32] hover:bg-[#FF1F7E]/20 hover:text-white border border-white/10 rounded-lg font-mono text-sm uppercase text-slate-100 font-bold transition-all shadow-sm"
                  >
                    B
                  </button>
                </div>
              </div>
 
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {match.currentOver.map((ball, i) => {
                  const isDot = ball === 0 || ball === '0';
                  const isWD = typeof ball === 'string' && ball.toLowerCase().includes('wd');
                  const isNB = typeof ball === 'string' && ball.toLowerCase().includes('nb');
                  const isLB = typeof ball === 'string' && ball.toUpperCase().includes('LB');
                  const isBY = typeof ball === 'string' && (ball.toUpperCase().startsWith('B') && !ball.toUpperCase().includes('LB') && !ball.toUpperCase().includes('NB') && !ball.toUpperCase().startsWith('W'));
                  const isWicket = !isWD && !isNB && !isLB && !isBY && (ball === 'W' || (typeof ball === 'string' && ball.toUpperCase().includes('W')));
                  const isBoundary = (ball === 4 || ball === 6 || ball === '4' || ball === '6') && !isWD && !isNB && !isLB && !isBY && !isWicket;

                  if (isDot) {
                    return (
                      <div 
                        key={i} 
                        className="min-w-[40px] h-10 rounded-full flex items-center justify-center bg-[#008000] shadow-md border-0"
                        title="Dot Ball"
                      >
                        <Sprout size={14} className="text-white" />
                      </div>
                    );
                  }

                  if (isWD) {
                    let displayText = String(ball).toUpperCase();
                    if (displayText === '1WD') {
                      displayText = 'WD';
                    }
                    const isMultiChar = displayText.length > 2;
                    return (
                      <div 
                        key={i} 
                        className="min-w-[40px] h-10 rounded-full flex items-center justify-center bg-[#FFFFFF] shadow-md border-0"
                        title="Wide Ball"
                      >
                        <span 
                          className="font-mono text-[#0B132B] uppercase tracking-tight leading-none"
                          style={{ fontWeight: '800', fontSize: isMultiChar ? '9px' : '11px' }}
                        >
                          {displayText}
                        </span>
                      </div>
                    );
                  }

                  if (isNB) {
                    let displayText = String(ball).toUpperCase();
                    if (displayText === '1NB') {
                      displayText = 'NB';
                    }
                    const isMultiChar = displayText.length > 2;
                    return (
                      <div 
                        key={i} 
                        className="min-w-[40px] h-10 rounded-full flex items-center justify-center bg-[#FFFFFF] shadow-md border-0"
                        title="No Ball"
                      >
                        <span 
                          className="font-mono text-[#0B132B] uppercase tracking-tight leading-none"
                          style={{ fontWeight: '800', fontSize: isMultiChar ? '9px' : '11px' }}
                        >
                          {displayText}
                        </span>
                      </div>
                    );
                  }

                  if (isLB || isBY) {
                    const displayText = String(ball).toUpperCase();
                    const isMultiChar = displayText.length > 2;
                    return (
                      <div 
                        key={i} 
                        className="min-w-[40px] h-10 rounded-full flex items-center justify-center bg-[#FFFFFF] shadow-md border-0"
                        title={isLB ? "Leg Bye" : "Bye"}
                      >
                        <span 
                          className="font-mono text-[#0B132B] uppercase tracking-tight leading-none"
                          style={{ 
                            fontWeight: 'bold', 
                            fontSize: isMultiChar ? '10px' : '12px' 
                          }}
                        >
                          {displayText}
                        </span>
                      </div>
                    );
                  }

                  if (isWicket) {
                    return (
                      <div 
                        key={i} 
                        className="min-w-[40px] h-10 rounded-full flex items-center justify-center bg-[#FF0000] shadow-md border-0"
                        title="Wicket"
                      >
                        <span 
                          className="font-mono text-[#0B132B] uppercase tracking-tight leading-none"
                          style={{ fontWeight: '800', fontSize: '14px' }}
                        >
                          W
                        </span>
                      </div>
                    );
                  }

                  if (isBoundary) {
                    return (
                      <div 
                        key={i} 
                        className="min-w-[40px] h-10 rounded-full flex items-center justify-center bg-[#FF8C00] shadow-md border-0"
                        title={`Boundary ${ball}`}
                      >
                        <span 
                          className="font-mono text-[#0B132B] uppercase tracking-tight leading-none"
                          style={{ fontWeight: '800', fontSize: '14px' }}
                        >
                          {ball}
                        </span>
                      </div>
                    );
                  }

                  // Other deliveries (1, 2, 3 runs, etc.)
                  const displayText = String(ball).toUpperCase();
                  const isMultiChar = displayText.length > 1;

                  return (
                    <div 
                      key={i} 
                      className="min-w-[40px] h-10 rounded-full flex items-center justify-center bg-[#FFFFFF] shadow-md border-0"
                      title={`Runs ${ball}`}
                    >
                      <span 
                        className="font-mono text-[#0B132B] uppercase tracking-tight leading-none"
                        style={{ 
                          fontWeight: '800', 
                          fontSize: isMultiChar ? '11px' : '14px' 
                        }}
                      >
                        {displayText}
                      </span>
                    </div>
                  );
                })}
                {(() => {
                  const legalBalls = match.currentOver.filter(b => {
                    if (typeof b === 'number') return true;
                    const bStr = String(b).toUpperCase();
                    return !bStr.includes('WD') && !bStr.includes('NB');
                  }).length;
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

        {activeTab === 'career' && isProfileOpen && selectedPlayerId !== null && (() => {
          const p = players.find(x => x.id === selectedPlayerId);
          if (!p) return null;
          const s = getPlayerStats(p.id);
          const activeStats = (isEditingProfile && editCareerStats) ? editCareerStats : s;
          
          // calculate age:
          const ageText = (() => {
            if (!p.dob) return "N/A";
            const birthDate = new Date(p.dob);
            if (isNaN(birthDate.getTime())) return "N/A";
            const today = new Date();
            let years = today.getFullYear() - birthDate.getFullYear();
            const birthMonth = birthDate.getMonth();
            const todayMonth = today.getMonth();
            if (todayMonth < birthMonth || (todayMonth === birthMonth && today.getDate() < birthDate.getDate())) {
              years--;
            }
            const lastBirthday = new Date(birthDate);
            lastBirthday.setFullYear(today.getFullYear());
            if (lastBirthday > today) {
              lastBirthday.setFullYear(today.getFullYear() - 1);
            }
            const diffTime = Math.abs(today.getTime() - lastBirthday.getTime());
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return `${years} Years, ${diffDays} Days`;
          })();

          // calculate performance rating:
          const ratingText = (() => {
            let battingScore = 5.0;
            let bowlingScore = 5.0;
            let hasBatting = activeStats.inningsBat > 0 || activeStats.ballsFaced > 0 || activeStats.runs > 0;
            let hasBowling = activeStats.ballsBowled > 0;

            if (hasBatting) {
              const avg = activeStats.runs / Math.max(1, activeStats.inningsBat);
              const sr = activeStats.ballsFaced > 0 ? (activeStats.runs / activeStats.ballsFaced) * 100 : 0;
              battingScore += Math.min(3.5, avg * 0.1); 
              if (sr > 0) {
                battingScore += Math.max(-1.5, Math.min(2.0, (sr - 100) / 40));
              }
              battingScore += Math.min(2.0, ((activeStats.fifties || 0) * 0.4) + ((activeStats.hundreds || 0) * 1.0));
              if (activeStats.highestScore >= 100) battingScore += 0.5;
              else if (activeStats.highestScore >= 50) battingScore += 0.25;
            }

            if (hasBowling) {
              const econ = activeStats.ballsBowled > 0 ? (activeStats.runsConceded / activeStats.ballsBowled) * 6 : 0;
              const dotPct = activeStats.ballsBowled > 0 ? ((activeStats.dots || 0) / activeStats.ballsBowled) * 100 : 0;
              if (econ > 0) {
                if (econ < 6.0) bowlingScore += 2.5;
                else if (econ < 8.0) bowlingScore += 1.5;
                else if (econ > 10.0) bowlingScore -= 1.0;
              }
              if (activeStats.wickets > 0) {
                const bowlAvg = activeStats.runsConceded / activeStats.wickets;
                if (bowlAvg < 15) bowlingScore += 2.0;
                else if (bowlAvg < 25) bowlingScore += 1.0;
                
                const bowlSR = activeStats.ballsBowled / activeStats.wickets;
                if (bowlSR < 15) bowlingScore += 1.0;
                else if (bowlSR < 24) bowlingScore += 0.5;
              }
              if (dotPct > 45) bowlingScore += 1.0;
              else if (dotPct > 35) bowlingScore += 0.5;
              if ((activeStats.hatTricks || 0) > 0) bowlingScore += 0.5;
            }

            let finalRating = 5.0;
            if (hasBatting && hasBowling) {
              const best = Math.max(battingScore, bowlingScore);
              const worst = Math.min(battingScore, bowlingScore);
              finalRating = (best * 0.7) + (worst * 0.3);
            } else if (hasBatting) {
              finalRating = battingScore;
            } else if (hasBowling) {
              finalRating = bowlingScore;
            }
            finalRating = Math.max(1.0, Math.min(10.0, finalRating));
            return finalRating.toFixed(1);
          })();

          const handleSaveProfile = async () => {
            if (!editProfileName.trim()) {
              setNotification("Name cannot be empty");
              return;
            }
            
            // 1. Update local states
            setPlayers(prev => prev.map(x => x.id === p.id ? {
              ...x,
              name: editProfileName,
              jerseyNo: editProfileJersey ? Number(editProfileJersey) : undefined,
              dob: editProfileDob || undefined
            } : x));

            if (editCareerStats) {
              setCareerStats(prev => ({
                ...prev,
                [p.id]: {
                  ...editCareerStats
                }
              }));
            }

            // 2. Synced write: Push to Firestore player document if user is logged in
            if (user) {
              try {
                const finalCareerStats = editCareerStats || s;
                const pathStr = `users/${user.uid}/players/${p.id}`;
                const payload = {
                  id: p.id,
                  name: editProfileName,
                  jerseyNo: editProfileJersey ? Number(editProfileJersey) : null,
                  dob: editProfileDob || null,
                  careerStats: {
                    inningsBat: Math.max(0, Number(finalCareerStats.inningsBat) || 0),
                    runs: Math.max(0, Number(finalCareerStats.runs) || 0),
                    ballsFaced: Math.max(0, Number(finalCareerStats.ballsFaced) || 0),
                    highestScore: Math.max(0, Number(finalCareerStats.highestScore) || 0),
                    fifties: Math.max(0, Number(finalCareerStats.fifties) || 0),
                    hundreds: Math.max(0, Number(finalCareerStats.hundreds) || 0),
                    fours: Math.max(0, Number(finalCareerStats.fours) || 0),
                    sixes: Math.max(0, Number(finalCareerStats.sixes) || 0),
                    notOuts: Math.max(0, Number(finalCareerStats.notOuts) || 0),
                    ballsBowled: Math.max(0, Number(finalCareerStats.ballsBowled) || 0),
                    wickets: Math.max(0, Number(finalCareerStats.wickets) || 0),
                    hatTricks: Math.max(0, Number(finalCareerStats.hatTricks) || 0),
                    runsConceded: Math.max(0, Number(finalCareerStats.runsConceded) || 0),
                    dots: Math.max(0, Number(finalCareerStats.dots) || 0),
                    inningsBowl: Math.max(0, Number(finalCareerStats.inningsBowl) || 0),
                    wicketStreak: Math.max(0, Number(finalCareerStats.wicketStreak) || 0),
                    bestBowling: {
                      wickets: Math.max(0, Number(finalCareerStats.bestBowling?.wickets) || 0),
                      runs: Math.max(0, Number(finalCareerStats.bestBowling?.runs) || 0)
                    },
                    catches: Math.max(0, Number(finalCareerStats.catches) || 0),
                    runOuts: Math.max(0, Number(finalCareerStats.runOuts) || Number(finalCareerStats.throwComplete) || 0),
                    throwComplete: Math.max(0, Number(finalCareerStats.throwComplete) || Number(finalCareerStats.runOuts) || 0),
                    stumpings: Math.max(0, Number(finalCareerStats.stumpings) || 0),
                    catchDrop: Math.max(0, Number(finalCareerStats.catchDrop) || 0),
                    missField: Math.max(0, Number(finalCareerStats.missField) || 0),
                    missedThrows: Math.max(0, Number(finalCareerStats.missedThrows) || 0)
                  },
                  updatedAt: new Date().toISOString()
                };

                const playerRef = doc(db, 'users', user.uid, 'players', String(p.id));
                try {
                  await setDoc(playerRef, payload);
                } catch (writeError) {
                  // Fall back through custom error handler to produce a standard diagnostic report
                  handleFirestoreError(writeError, OperationType.WRITE, pathStr);
                }
                
                setNotification("Profile & Firestore Stats saved successfully");
              } catch (error) {
                console.error("Firestore sync failed", error);
                setNotification("Local stats saved, but Firestore sync failed: " + (error instanceof Error ? error.message : String(error)));
              }
            } else {
              setNotification("Profile saved locally");
            }

            setIsEditingProfile(false);
          };

          return (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Header / Top Navigation Bar */}
              <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-4 shadow-lg">
                <button
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2 hover:bg-white/10 rounded-xl px-3 py-2 text-sm text-gray-300 hover:text-white transition-all font-mono"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                
                <h2 className="text-base font-mono uppercase tracking-wider text-white">
                  {isEditingProfile ? "Edit Profile" : "Player Profile"}
                </h2>

                <div className="flex gap-2">
                  {isEditingProfile ? (
                    <>
                      <button
                        onClick={handleSaveProfile}
                        className="flex items-center gap-1 bg-green-500/25 hover:bg-green-500/40 border border-green-500/40 rounded-xl px-3 py-2 text-xs font-mono font-bold text-green-400 transition-all"
                      >
                        <Save size={14} />
                        <span>Save</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingProfile(false);
                          setEditCareerStats(null);
                          setEditProfileName(p.name);
                          setEditProfileJersey(p.jerseyNo ? String(p.jerseyNo) : "");
                          setEditProfileDob(p.dob || "");
                        }}
                        className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-gray-400 hover:text-white transition-all"
                      >
                        <X size={14} />
                        <span>Cancel</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setIsEditingProfile(true);
                        setEditCareerStats({ ...s });
                      }}
                      className="flex items-center gap-1 bg-[#FF1F7E]/15 hover:bg-[#FF1F7E]/30 border border-[#FF1F7E]/45 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#FF1F7E] transition-all animate-in fade-in cursor-pointer animate-duration-200"
                    >
                      <Pencil size={14} />
                      <span>Edit Profile</span>
                    </button>
                  )}
                </div>
              </div>
 
              {/* Profile Info Card Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Profile Details Column */}
                <div className="md:col-span-1 bg-[#0D153B] border border-[#FF1F7E]/20 rounded-2xl p-6 flex flex-col items-center justify-between shadow-lg relative overflow-hidden">
                  {/* Background Glow */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#FF1F7E]/10 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="w-full flex flex-col items-center">
                    {/* Avatar / Jersey Badge */}
                    <div className="relative w-28 h-28 mb-4">
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-[#FF1F7E]/25 to-[#0C1235]/25 border-2 border-[#FF1F7E]/35 overflow-hidden flex items-center justify-center text-4xl font-mono text-white select-none animate-in zoom-in duration-300">
                        {p.avatar ? (
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          p.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      
                      {/* Jersey Badge */}
                      <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-r from-[#FF1F7E] to-[#DF0A61] text-white border border-pink-400/40 shadow-lg shadow-pink-500/20">
                        <span className="text-xs font-mono font-extrabold flex items-center">
                          <Hash size={10} className="mr-[1px]" />
                          {p.jerseyNo !== undefined ? p.jerseyNo : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Profile Info Edit Form vs Read Only view */}
                     {isEditingProfile ? (
                      <div className="w-full space-y-4 font-mono text-xs">
                        <div>
                          <label className="text-gray-400 block mb-1 uppercase tracking-wider text-[10px]">Name</label>
                          <input
                            type="text"
                            value={editProfileName}
                            onChange={(e) => setEditProfileName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FF1F7E]/50 transition-colors"
                            placeholder="Player Name"
                          />
                        </div>
                        <div>
                          <label className="text-gray-400 block mb-1 uppercase tracking-wider text-[10px]">Jersey No</label>
                          <input
                            type="number"
                            value={editProfileJersey}
                            onChange={(e) => setEditProfileJersey(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FF1F7E]/50 transition-colors"
                            placeholder="e.g. 7"
                          />
                        </div>
                        <div>
                          <label className="text-gray-400 block mb-1 uppercase tracking-wider text-[10px]">Date of Birth</label>
                          <input
                            type="date"
                            value={editProfileDob}
                            onChange={(e) => setEditProfileDob(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FF1F7E]/50 transition-colors"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center w-full">
                        <h3 className="text-xl font-mono font-bold text-white tracking-tight">{p.name}</h3>
                        <div className="text-xs font-mono text-gray-400 mt-1 uppercase tracking-widest flex items-center justify-center gap-1.5">
                          <Calendar size={12} className="text-orange-500" />
                          {p.dob ? `DOB: ${p.dob}` : "DOB: Not Set"}
                        </div>
                        
                        {/* Dynamic Age Counter */}
                        <div className="mt-2 text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg inline-block">
                          {p.dob ? ageText : "Age: Unknown"}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full mt-6 border-t border-white/5 pt-4 text-center">
                    <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-gray-400 block mb-1.5">Performance Rating</span>
                    <div className="inline-flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 font-mono font-extrabold text-sm px-4 py-2 rounded-xl">
                      <Star size={14} className="fill-yellow-500 animate-pulse" />
                      Rating: {ratingText}/10
                    </div>
                  </div>
                </div>

                {/* Right Detailed Stats Blocks (2 columns wide on desktop) */}
                <div className="md:col-span-2 space-y-6">
                  {(() => {
                    const battingAverage = (() => {
                      const runs = activeStats.runs || 0;
                      const innings = activeStats.inningsBat || 0;
                      const notOuts = activeStats.notOuts || 0;
                      const divisor = innings - notOuts;
                      if (divisor <= 0) {
                        return innings > 0 ? runs.toFixed(2) : "-";
                      }
                      return (runs / divisor).toFixed(2);
                    })();

                    const fieldingAccuracy = (() => {
                      const catches = activeStats.catches || 0;
                      const runOuts = activeStats.runOuts || 0;
                      const catchDrop = activeStats.catchDrop || 0;
                      const missField = activeStats.missField || 0;
                      const missedThrows = activeStats.missedThrows || 0;
                      const divisor = catches + runOuts + catchDrop + missField + missedThrows;
                      if (divisor === 0) return "-";
                      return (((catches + runOuts) / divisor) * 100).toFixed(1) + "%";
                    })();

                    return (
                      <>
                        {/* Batting Record Block */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-lg space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                            <Sword size={16} className="text-orange-500" />
                            <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-gray-300">Batting Career Stats</h4>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Innings</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.inningsBat || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, inningsBat: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.inningsBat || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Not Outs</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.notOuts || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, notOuts: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-neutral-300 mt-1">{activeStats.notOuts || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Total Runs</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.runs || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, runs: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-orange-400 focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-orange-400 mt-1">{activeStats.runs || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Average</span>
                              <span className="text-lg font-mono font-bold text-orange-500 mt-1">{battingAverage}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Strike Rate</span>
                              <span className="text-lg font-mono font-bold text-white mt-1">
                                {activeStats.ballsFaced > 0 ? ((activeStats.runs / activeStats.ballsFaced) * 100).toFixed(1) : "0.0"}
                              </span>
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Balls Faced</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.ballsFaced || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, ballsFaced: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.ballsFaced || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Best Score</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.highestScore || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, highestScore: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.highestScore || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Fours (4s)</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.fours || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, fours: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.fours || 0}</span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Sixes (6s)</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.sixes || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, sixes: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.sixes || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Fifties (50)</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.fifties || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, fifties: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.fifties || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Hundreds (100)</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.hundreds || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, hundreds: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-yellow-400 focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-yellow-400 mt-1">{activeStats.hundreds || 0}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bowling Record Block */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-lg space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                            <ShieldCheck size={16} className="text-blue-500" />
                            <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-gray-300">Bowling Career Stats</h4>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Overs</span>
                              <span className="text-lg font-mono font-bold text-white mt-1">
                                {(Math.floor((activeStats.ballsBowled || 0) / 6) + ((activeStats.ballsBowled || 0) % 6) / 10).toFixed(1)}
                              </span>
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Balls Bowled</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.ballsBowled || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, ballsBowled: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-blue-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.ballsBowled || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Wickets</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.wickets || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, wickets: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-blue-400 focus:outline-none focus:border-blue-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-blue-400 mt-1">{activeStats.wickets || 0}</span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Hat-Tricks</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.hatTricks || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, hatTricks: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-yellow-500 focus:outline-none focus:border-blue-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-yellow-500 mt-1">{activeStats.hatTricks || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Best Bowl</span>
                              {isEditingProfile ? (
                                <div className="flex items-center gap-1 mt-1">
                                  <input
                                    type="number"
                                    min="0"
                                    value={activeStats.bestBowling?.wickets || 0}
                                    onChange={(e) => {
                                      const val = Math.max(0, Number(e.target.value) || 0);
                                      setEditCareerStats(prev => prev ? {
                                        ...prev,
                                        bestBowling: {
                                          wickets: val,
                                          runs: prev.bestBowling?.runs || 0
                                        }
                                      } : null);
                                    }}
                                    className="w-10 bg-white/5 text-center border border-white/10 rounded px-1 py-0.5 font-mono text-[11px] text-white focus:outline-noneFocus"
                                    placeholder="Wkts"
                                  />
                                  <span className="text-gray-500">/</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={activeStats.bestBowling?.runs || 0}
                                    onChange={(e) => {
                                      const val = Math.max(0, Number(e.target.value) || 0);
                                      setEditCareerStats(prev => prev ? {
                                        ...prev,
                                        bestBowling: {
                                          wickets: prev.bestBowling?.wickets || 0,
                                          runs: val
                                        }
                                      } : null);
                                    }}
                                    className="w-10 bg-white/5 text-center border border-white/10 rounded px-1 py-0.5 font-mono text-[11px] text-white focus:outline-none"
                                    placeholder="Runs"
                                  />
                                </div>
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">
                                  {activeStats.bestBowling?.wickets || 0}/{activeStats.bestBowling?.runs || 0}
                                </span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Runs Conceded</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.runsConceded || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, runsConceded: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-blue-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.runsConceded || 0}</span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-center">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Dots</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.dots || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, dots: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-white focus:outline-none focus:border-blue-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-white mt-1">{activeStats.dots || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Economy</span>
                              <span className="text-lg font-mono font-bold text-white mt-1">
                                {activeStats.ballsBowled > 0 ? ((activeStats.runsConceded / activeStats.ballsBowled) * 6).toFixed(2) : "0.00"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Fielding Record Block */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-lg space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                            <User size={16} className="text-emerald-500" />
                            <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-gray-300">Fielding Career Stats</h4>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 text-center pb-2">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Catches</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.catches || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, catches: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-emerald-400 focus:outline-none focus:border-emerald-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-emerald-400 mt-1">{activeStats.catches || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Throw Complete</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.throwComplete || activeStats.runOuts || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, runOuts: val, throwComplete: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-emerald-400 focus:outline-none focus:border-emerald-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-emerald-400 mt-1">{activeStats.throwComplete || activeStats.runOuts || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Stumpings</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.stumpings || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, stumpings: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-emerald-400 focus:outline-none focus:border-emerald-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-emerald-400 mt-1">{activeStats.stumpings || 0}</span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 text-center pb-2">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Catches Dropped</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.catchDrop || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, catchDrop: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-red-400 focus:outline-none focus:border-emerald-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-red-400 mt-1">{activeStats.catchDrop || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Miss Fields</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.missField || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, missField: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-red-400 focus:outline-none focus:border-emerald-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-red-400 mt-1">{activeStats.missField || 0}</span>
                              )}
                            </div>

                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block">Missed Throw</span>
                              {isEditingProfile ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={activeStats.missedThrows || 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setEditCareerStats(prev => prev ? { ...prev, missedThrows: val } : null);
                                  }}
                                  className="w-full bg-white/5 text-center border border-white/10 rounded-lg px-2 py-1 mt-1 font-mono text-sm text-red-400 focus:outline-none focus:border-emerald-500"
                                />
                              ) : (
                                <span className="text-lg font-mono font-bold text-red-400 mt-1">{activeStats.missedThrows || 0}</span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4 text-center">
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-center uppercase">
                              <span className="text-[10px] font-mono text-gray-400 block text-center leading-3">Field Accuracy</span>
                              <span className="text-lg font-mono font-bold text-emerald-400 mt-1">{fieldingAccuracy}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === 'career' && !isProfileOpen && (
          <div className="space-y-8 animate-in fade-in duration-500 overflow-x-hidden">
            {/* Career Tab Premium Header Section */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-[#0D153B] border border-[#FF1F7E]/20 rounded-2xl p-5 shadow-lg shadow-black/30">
              <div>
                <h1 className="text-xl md:text-2xl font-mono uppercase tracking-tighter text-white flex items-center gap-2">
                  <Trophy className="text-[#FFA000]" size={24} />
                  <span>Player Careers</span>
                </h1>
                <p className="text-xs text-slate-300 mt-1 uppercase tracking-wider font-mono">Cumulative All-Time Lifetime Statistics</p>
              </div>
              <button
                id="export-career-data-btn"
                onClick={handleDownloadCareerHTML}
                className="flex items-center justify-center gap-2 py-2.5 px-5 bg-gradient-to-r from-[#FF1F7E] to-[#DF0A61] hover:from-[#FF0F74] hover:to-[#C2004F] border border-[#FF5B9F]/25 text-white font-bold rounded-xl text-xs transition-all tracking-wider uppercase shadow-lg shadow-pink-500/15 active:scale-95 duration-200 cursor-pointer"
              >
                <Download size={14} />
                <span>Export Career Report</span>
              </button>
            </div>
 
            {/* Board 1: Batting Career */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Sword size={18} className="text-[#FF1F7E]" />
                <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-slate-300">Batting Board</h2>
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
                                  onClick={() => {
                                    setSelectedPlayerId(p.id);
                                    setIsProfileOpen(true);
                                    setIsEditingProfile(false);
                                    setEditProfileName(p.name);
                                    setEditProfileJersey(p.jerseyNo ? String(p.jerseyNo) : "");
                                    setEditProfileDob(p.dob || "");
                                  }}
                                  className="p-1 text-[#FF1F7E] hover:bg-[#FF1F7E]/10 rounded transition-all w-fit"
                                  title="View Player"
                                >
                                  <Eye size={10} />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">{s.inningsBat}</td>
                          <td className="p-3 text-[#FF1F7E] font-bold">{s.runs}</td>
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
                                  onClick={() => {
                                    setSelectedPlayerId(p.id);
                                    setIsProfileOpen(true);
                                    setIsEditingProfile(false);
                                    setEditProfileName(p.name);
                                    setEditProfileJersey(p.jerseyNo ? String(p.jerseyNo) : "");
                                    setEditProfileDob(p.dob || "");
                                  }}
                                  className="p-1 text-blue-400 hover:bg-blue-400/10 rounded transition-all w-fit"
                                  title="View Player"
                                >
                                  <Eye size={10} />
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
                <Sword size={20} className="text-[#FF1F7E]" /> Head-to-Head
              </h2>
              
              {players.map(p => (
                <div key={p.id} className="p-6 bg-[#0D153B] border border-[#FF1F7E]/15 rounded-2xl flex items-start gap-4 shadow-lg">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10 border border-white/10 flex-shrink-0">
                    {p.avatar ? (
                      <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 bg-white/5">
                        <User size={32} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-mono mb-4 border-b border-[#FF1F7E]/15 pb-2 text-white">{p.name}</h3>
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <span className="text-[10px] uppercase font-mono text-red-400 tracking-widest mb-1 block">Nemesis</span>
                        <p className="text-lg font-mono text-white">{getNemesis(p.id)}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase">Most Wickets Lost To</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-mono text-emerald-400 tracking-widest mb-1 block">Bunny</span>
                        <p className="text-lg font-mono text-white">{getBunny(p.id)}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase">Top Wicket Victim</p>
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
                <User size={20} className="text-[#FF1F7E]" /> Player Management
              </h2>
              
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="New Player Name"
                  id="newPlayerName"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono focus:outline-none focus:border-[#FF1F7E]/50 text-white"
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
                  className="px-6 py-3 bg-[#FF1F7E] hover:opacity-90 text-white font-mono font-bold rounded-xl active:scale-95 transition-all shadow-lg shadow-pink-500/15 cursor-pointer"
                >
                  ADD
                </button>
              </div>
 
              <div className="space-y-3">
                {players.map(p => (
                  <div key={p.id} className="p-4 bg-[#0D153B] border border-[#FF1F7E]/10 rounded-xl flex items-center gap-4">
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
        {extraModal.isOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0D153B] border border-[#FF1F7E]/25 p-8 rounded-3xl w-full max-w-sm shadow-2xl shadow-black/80"
            >
              <div className="flex items-center gap-3 mb-4 text-[#FF1F7E]">
                <Zap size={28} />
                <h2 className="text-xl font-mono uppercase tracking-tighter">Any Additional Runs?</h2>
              </div>
              <p className="text-gray-400 font-mono text-xs mb-6 uppercase tracking-widest leading-relaxed">
                Select additional runs scored off this {
                  extraModal.type === 'wide' ? 'Wide (WD)' : 
                  extraModal.type === 'noball' ? 'No-Ball (NB)' : 
                  extraModal.type === 'lb' ? 'Leg Bye (LB)' : 
                  'Bye (B)'
                } delivery:
              </p>
              
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      if (extraModal.type) {
                        submitExtraRuns(extraModal.type, 0);
                      }
                    }}
                    className="py-4 bg-white/5 hover:bg-[#FF1F7E]/20 active:scale-95 border border-white/5 hover:border-[#FF1F7E]/30 rounded-2xl font-mono text-sm font-bold text-white transition-all flex flex-col items-center justify-center leading-none"
                  >
                    <span className="text-xl mb-1">0</span>
                    <span className="text-[10px] uppercase text-zinc-400">Just Extra</span>
                  </button>
                  <button
                    onClick={() => {
                      if (extraModal.type) {
                        submitExtraRuns(extraModal.type, 1);
                      }
                    }}
                    className="py-4 bg-white/5 hover:bg-[#FF1F7E]/20 active:scale-95 border border-white/5 hover:border-[#FF1F7E]/30 rounded-2xl font-mono text-sm font-bold text-white transition-all flex flex-col items-center justify-center leading-none"
                  >
                    <span className="text-xl mb-1">+1</span>
                    <span className="text-[10px] uppercase text-zinc-400">1 Run</span>
                  </button>
                  <button
                    onClick={() => {
                      if (extraModal.type) {
                        submitExtraRuns(extraModal.type, 2);
                      }
                    }}
                    className="py-4 bg-white/5 hover:bg-[#FF1F7E]/20 active:scale-95 border border-white/5 hover:border-[#FF1F7E]/30 rounded-2xl font-mono text-sm font-bold text-white transition-all flex flex-col items-center justify-center leading-none"
                  >
                    <span className="text-xl mb-1">+2</span>
                    <span className="text-[10px] uppercase text-zinc-400">2 Runs</span>
                  </button>
                  <button
                    onClick={() => {
                      if (extraModal.type) {
                        submitExtraRuns(extraModal.type, 3);
                      }
                    }}
                    className="py-4 bg-white/5 hover:bg-[#FF1F7E]/20 active:scale-95 border border-white/5 hover:border-[#FF1F7E]/30 rounded-2xl font-mono text-sm font-bold text-white transition-all flex flex-col items-center justify-center leading-none"
                  >
                    <span className="text-xl mb-1">+3</span>
                    <span className="text-[10px] uppercase text-zinc-400">3 Runs</span>
                  </button>
                  <button
                    onClick={() => {
                      if (extraModal.type) {
                        submitExtraRuns(extraModal.type, 4);
                      }
                    }}
                    className="py-4 bg-white/5 hover:bg-[#FF1F7E]/20 active:scale-95 border border-white/5 hover:border-[#FF1F7E]/30 rounded-2xl font-mono text-sm font-bold text-white transition-all flex flex-col items-center justify-center leading-none"
                  >
                    <span className="text-xl mb-1">+4</span>
                    <span className="text-[10px] uppercase text-zinc-400">Boundary</span>
                  </button>
                  <button
                    onClick={() => {
                      if (extraModal.type) {
                        submitExtraRuns(extraModal.type, 6);
                      }
                    }}
                    className="py-4 bg-white/5 hover:bg-[#FF1F7E]/20 active:scale-95 border border-white/5 hover:border-[#FF1F7E]/30 rounded-2xl font-mono text-sm font-bold text-white transition-all flex flex-col items-center justify-center leading-none"
                  >
                    <span className="text-xl mb-1">+6</span>
                    <span className="text-[10px] uppercase text-zinc-400">6 Runs</span>
                  </button>
                </div>
              </div>
              <button
                onClick={() => setExtraModal({ isOpen: false, type: null })}
                className="w-full mt-6 py-3 border border-white/10 hover:bg-white/5 rounded-xl font-mono text-xs text-gray-400 uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}

        {dismissalModal.isOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0D153B] border border-[#FF1F7E]/25 p-8 rounded-3xl w-full max-w-md shadow-2xl shadow-black/80"
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
                        if (type === 'Catch Out') {
                          const outId = dismissalModal.outPlayerId;
                          setDismissalModal({ isOpen: false, outPlayerId: null });
                          setIsFielderModalOpen({ isOpen: true, outPlayerId: outId, type: 'Catch' });
                        } else {
                          confirmWicket(dismissalModal.outPlayerId, type);
                        }
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
 
                <button
                  onClick={() => {
                    if (dismissalModal.outPlayerId !== null) {
                      const outId = dismissalModal.outPlayerId;
                      setDismissalModal({ isOpen: false, outPlayerId: null });
                      setIsFielderModalOpen({ isOpen: true, outPlayerId: outId, type: 'Stumping' });
                    }
                  }}
                  className="col-span-2 p-5 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 rounded-2xl font-mono text-sm text-center font-bold text-white transition-all flex flex-col items-center justify-center gap-2 hover:border-red-500/30 font-semibold"
                >
                  <span className="text-red-400 text-lg">🧤</span>
                  <span>Stumps</span>
                </button>
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

        {isFielderModalOpen.isOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0D153B] border border-[#FF1F7E]/25 p-8 rounded-3xl w-full max-w-md shadow-2xl shadow-black/80"
            >
              <div className="flex items-center gap-3 mb-4 text-red-500">
                <User size={28} />
                <h2 className="text-2xl font-mono uppercase tracking-tighter">
                  {isFielderModalOpen.type === 'Catch' ? 'Select Fielder' : 'Select Wicketkeeper'}
                </h2>
              </div>
              <p className="text-gray-400 font-mono text-xs mb-6 uppercase tracking-widest leading-relaxed">
                {isFielderModalOpen.type === 'Catch' 
                  ? `Who took the catch to dismiss ${players.find(p => p.id === isFielderModalOpen.outPlayerId)?.name}?`
                  : `Who made the stumping to dismiss ${players.find(p => p.id === isFielderModalOpen.outPlayerId)?.name}?`
                }
              </p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                {players
                  .filter(p => p.id !== match.strikerId && p.id !== match.nonStrikerId && p.id !== isFielderModalOpen.outPlayerId)
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (isFielderModalOpen.outPlayerId !== null) {
                          if (isFielderModalOpen.type === 'Catch') {
                            confirmCatch(isFielderModalOpen.outPlayerId, p.id);
                          } else {
                            confirmStumping(isFielderModalOpen.outPlayerId, p.id);
                          }
                        }
                      }}
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
                          <p className="text-[10px] text-gray-500 uppercase">
                            {isFielderModalOpen.type === 'Catch' 
                              ? `Catches: ${getPlayerStats(p.id).catches || 0}`
                              : `Stumpings: ${getPlayerStats(p.id).stumpings || 0}`
                            }
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-gray-700 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setIsFielderModalOpen({ isOpen: false, outPlayerId: null })}
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
              className="bg-[#0D153B] border border-[#FF1F7E]/25 p-8 rounded-3xl w-full max-w-sm shadow-2xl shadow-black/80"
            >
              <div className="flex items-center gap-3 mb-4 text-[#FF1F7E]">
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
                      className="h-14 bg-white/5 hover:bg-[#FF1F7E]/20 active:scale-95 border border-white/5 hover:border-[#FF1F7E]/30 rounded-xl font-mono text-lg font-bold text-white transition-all flex items-center justify-center"
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
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0D153B] border border-[#FF1F7E]/25 p-8 rounded-3xl w-full max-w-md shadow-2xl shadow-black/80"
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
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0D153B] border border-[#FF1F7E]/25 p-8 rounded-3xl w-full max-w-md shadow-2xl shadow-black/80"
            >
              <h2 className="text-2xl font-mono mb-2 uppercase tracking-tighter text-[#FF1F7E]">Select New Bowler</h2>
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
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-[#0D153B] border border-[#FF1F7E]/25 p-8 rounded-3xl w-full max-w-md shadow-2xl shadow-black/80 overflow-y-auto max-h-[90vh]"
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
                    editModal.mode === 'overwrite' ? 'bg-[#FF1F7E] text-white shadow-lg' : 'text-gray-500 hover:text-white'
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
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-lg focus:outline-none focus:border-[#FF1F7E]/50 transition-colors text-white"
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
                    className={`flex-1 py-4 rounded-2xl font-mono text-xs uppercase tracking-widest font-bold shadow-lg shadow-black/20 cursor-pointer ${
                      editModal.mode === 'overwrite' ? 'bg-[#FF1F7E] text-white hover:opacity-90' : 'bg-green-500 text-black hover:bg-green-400'
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
