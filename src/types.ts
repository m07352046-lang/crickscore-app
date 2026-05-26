/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Player {
  id: number;
  name: string;
  avatar?: string;
}

export interface CareerStats {
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number;
  dots: number;
  inningsBat: number;
  inningsBowl: number;
  fifties: number;
  hundreds: number;
  highestScore: number;
  hatTricks: number;
  wicketStreak: number;
  bestBowling: { wickets: number; runs: number };
}

export interface ScoringLog {
  id: string;
  strikerId: number;
  nonStrikerId: number;
  bowlerId: number;
  runs: number;
  isWide: boolean;
  isNoBall: boolean;
  isWicket: boolean;
  outPlayerId?: number;
  isBoundary: boolean;
  boundaryType?: 4 | 6;
  rotationOccurred: boolean;
  strikerIdAfter: number;
  nonStrikerIdAfter: number;
  overBallsBefore: number;
  prevWicketStreak: number;
  milestones: {
    fifty: boolean;
    hundred: boolean;
    hattrick: boolean;
    hsUpdated: boolean;
    prevHS: number;
    bbUpdated: boolean;
    prevBB: { wickets: number; runs: number };
  };
}

export interface ManualEditLog {
  id: string;
  playerId: number;
  playerName: string;
  type: 'batting' | 'bowling';
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
}
export interface DismissalRecord {
  batsmanId: number;
  bowlerId: number;
  timestamp: number;
}

export interface MatchState {
  strikerId: number;
  nonStrikerId: number;
  bowlerId: number;
  overBalls: number;
  currentOver: (number | string)[];
  totalRuns: number;
  totalWickets: number;
  extras: number;
}

export interface StateSnapshot {
  careerStats: Record<number, CareerStats>;
  sessionStats: Record<number, { 
    batting: { runs: number; balls: number }; 
    bowling: { runs: number; balls: number; wickets: number };
  }>;
  dismissals: DismissalRecord[];
  match: MatchState;
  isWicketModalOpen: { isOpen: boolean; outPlayerId: number | null };
  isBowlerModalOpen: boolean;
  dismissalModal: { isOpen: boolean; outPlayerId: number | null };
  runOutModal: { isOpen: boolean; outPlayerId: number | null };
}

export const INITIAL_PLAYERS: Player[] = [
  { id: 1, name: "Player 1" },
  { id: 2, name: "Player 2" },
  { id: 3, name: "Player 3" },
  { id: 4, name: "Player 4" },
  { id: 5, name: "Player 5" },
  { id: 6, name: "Player 6" },
  { id: 7, name: "Player 7" },
];

export const INITIAL_STATS: Record<number, CareerStats> = INITIAL_PLAYERS.reduce((acc, p) => ({
  ...acc,
  [p.id]: {
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
}), {});
