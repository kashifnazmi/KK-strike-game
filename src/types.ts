/**
 * Shared Type Definitions for Web Multiplayer Tic Tac Toe
 */

export interface UserStats {
  username: string;
  wins: number;
  losses: number;
  draws: number;
  totalMatches: number;
  winPercentage: number;
  avatar: string;
  isBot?: boolean;
}

export interface MatchHistory {
  id: string;
  player1: string;
  player2: string;
  winner: string | 'Draw' | 'Disconnect' | null;
  date: string;
  movesCount: number;
  mode: 'multiplayer' | 'ai';
}

export interface ChatMsg {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

export interface LobbyRoom {
  code: string;
  name: string;
  player1: string | null;
  player2: string | null;
  status: 'waiting' | 'playing' | 'ended';
  isPrivate: boolean;
}

export interface ActiveRoomState {
  code: string;
  name: string;
  player1: {
    id: string;
    username: string;
    symbol: 'X' | 'O';
    isReady: boolean;
    connected: boolean;
  } | null;
  player2: {
    id: string;
    username: string;
    symbol: 'X' | 'O';
    isReady: boolean;
    connected: boolean;
  } | null;
  board: ('X' | 'O' | null)[];
  turn: string; // ws connection id or username
  status: 'waiting' | 'playing' | 'ended';
  movesCount: number;
  winner: string | 'Draw' | 'Disconnect' | null;
  chat: ChatMsg[];
  isPrivate: boolean;
}
