import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, 
  Users, 
  Plus, 
  Key, 
  Send, 
  Sparkles, 
  User, 
  Lock, 
  LogOut, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  ArrowRight, 
  CheckCircle, 
  Shield, 
  Laptop, 
  Info,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { sfx } from './components/AudioEffects';
import { UserStats, MatchHistory, ChatMsg, LobbyRoom, ActiveRoomState } from './types';

const getAvatarEmoji = (av: string) => {
  if (av === 'avatar_1') return '👨‍🚀';
  if (av === 'avatar_2') return '👾';
  if (av === 'avatar_3') return '⚡';
  if (av === 'avatar_4') return '🦾';
  if (av === 'avatar_bot') return '🤖';
  return '👤';
};

export default function App() {
  // Navigation Screens: 'auth' | 'lobby' | 'board'
  const [currentScreen, setCurrentScreen] = useState<'auth' | 'lobby' | 'board'>('auth');
  const [activeTab, setActiveTab] = useState<'arena' | 'leaderboard'>('arena');

  // WebSocket connection state
  const [wsReady, setWsReady] = useState(false);
  const [wsId, setWsId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // Authenticated Profile State
  const [playerUser, setPlayerUser] = useState<string | null>(null);
  const [playerAvatar, setPlayerAvatar] = useState<string>('avatar_1');
  const [playerWins, setPlayerWins] = useState<number>(0);
  const [playerLosses, setPlayerLosses] = useState<number>(0);
  const [playerDraws, setPlayerDraws] = useState<number>(0);
  const [playerTotal, setPlayerTotal] = useState<number>(0);
  const [isGuest, setIsGuest] = useState<boolean>(true);

  // Auth Forms State
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [authName, setAuthName] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authAvatar, setAuthAvatar] = useState('avatar_1');
  const [authError, setAuthError] = useState<string | null>(null);

  // Lobby lists
  const [activeRooms, setActiveRooms] = useState<LobbyRoom[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserStats[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joiningError, setJoiningError] = useState<string | null>(null);

  // Active game room details
  const [roomState, setRoomState] = useState<ActiveRoomState | null>(null);
  const [mySymbol, setMySymbol] = useState<'X' | 'O'>('X');
  const [chatMessage, setChatMessage] = useState('');

  // Audio mute controls
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Local Offline AI Game States
  const [isOfflineAI, setIsOfflineAI] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [aiBoard, setAiBoard] = useState<('X' | 'O' | null)[]>(Array(9).fill(null));
  const [aiIsMyTurn, setAiIsMyTurn] = useState(true);
  const [aiWinnerInfo, setAiWinnerInfo] = useState<{ winner: 'X' | 'O' | 'Draw' | null; pattern: number[] | null }>({ winner: null, pattern: null });
  const [aiChat, setAiChat] = useState<ChatMsg[]>([]);

  // Avatar presets
  const avatars = ['avatar_1', 'avatar_2', 'avatar_3', 'avatar_4', 'avatar_bot'];

  // Establish WebSockets linking
  useEffect(() => {
    connectWebsocket();
    fetchHttpData();
    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  const connectWebsocket = () => {
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}`;
      console.log('Connecting websocket to:', wsUrl);

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connection established!');
        setWsReady(true);
      };

      ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          console.log('Received socket packet:', type, payload);

          switch (type) {
            case 'connected':
              setWsId(payload.wsId);
              break;

            case 'auth_success':
              setPlayerUser(payload.username);
              setPlayerWins(payload.wins || 0);
              setPlayerLosses(payload.losses || 0);
              setPlayerDraws(payload.draws || 0);
              setPlayerTotal(payload.totalMatches || 0);
              setPlayerAvatar(payload.avatar || 'avatar_1');
              setIsGuest(!!payload.isGuest);
              setAuthError(null);
              setCurrentScreen('lobby');
              sfx.playClick();
              // Trigger active room fetching
              sendPacket('get_rooms_list');
              fetchHttpData();
              break;

            case 'auth_error':
              setAuthError(payload.message || 'Operation failed!');
              break;

            case 'rooms_list':
              setActiveRooms(payload.rooms || []);
              break;

            case 'room_joined':
              setMySymbol(payload.playerSymbol);
              setRoomState(payload.room);
              setIsOfflineAI(false);
              setCurrentScreen('board');
              setJoiningError(null);
              if (soundEnabled) sfx.playClick();
              break;

            case 'joining_error':
              setJoiningError(payload.message || 'Room is unavailable.');
              break;

            case 'room_updated':
              setRoomState(payload.room);
              // Trigger move sound cues
              if (soundEnabled) {
                const moves = payload.room.board.filter((b: any) => b !== null).length;
                if (moves > 0) {
                  const lastValue = payload.room.board.find((b: any, index: number) => b !== null && payload.room.board[index] !== roomState?.board[index]);
                  if (lastValue === 'X') sfx.playMoveX();
                  if (lastValue === 'O') sfx.playMoveO();
                }
              }
              break;

            case 'opponent_left':
              setRoomState(payload.room);
              break;

            case 'opponent_disconnected':
              setRoomState(payload.room);
              break;

            case 'chat_received':
              if (roomState) {
                setRoomState({ ...roomState, chat: payload.chat });
              }
              break;

            case 'match_ended':
              setRoomState(payload.room);
              const winnerStr = payload.winnerUsername;
              if (soundEnabled) {
                if (winnerStr === 'Draw') sfx.playDraw();
                else sfx.playWin();
              }
              fetchHttpData(); // Refresh HTTP stats
              break;

            case 'left_success':
              setRoomState(null);
              setCurrentScreen('lobby');
              sendPacket('get_rooms_list');
              break;

            default:
              break;
          }
        } catch (err) {
          console.error('Error handling ws packet payload:', err);
        }
      };

      ws.onclose = () => {
        console.warn('WebSocket closed. Retrying link connection...');
        setWsReady(false);
        setTimeout(connectWebsocket, 3000);
      };

      ws.onerror = (e) => {
        console.error('WS Connection error:', e);
      };
    } catch (e) {
      console.error('WS bootstrapping failed:', e);
    }
  };

  const fetchHttpData = async () => {
    try {
      const lbRes = await fetch('/api/leaderboard');
      if (lbRes.ok) {
        const lbData = await lbRes.json();
        setLeaderboard(lbData);
      }

      const mRes = await fetch('/api/matches');
      if (mRes.ok) {
        const mData = await mRes.json();
        setMatchHistory(mData);
      }
    } catch (err) {
      console.error('Error pre-fetching stats:', err);
    }
  };

  const sendPacket = (type: string, payload: any = {}) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('WS socket unavailable for transmission:', type);
    }
  };

  // Sound handler wrapper
  const handleUiClick = () => {
    if (soundEnabled) sfx.playClick();
  };

  // --- SIGN IN / REGISTRY SUBMITS ---
  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleUiClick();
    handleGuestSubmit();
  };

  const handleGuestSubmit = () => {
    handleUiClick();
    const guestName = authName.trim() || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    sendPacket('set_guest_profile', { username: guestName, avatar: authAvatar });
  };

  // ----- MULTIPLAYER LOBBY ACTIONS -----
  const handleCreateRoom = () => {
    handleUiClick();
    sendPacket('create_room', { name: roomNameInput.trim() || `${playerUser}'s Arena`, isPrivate: false });
    setRoomNameInput('');
  };

  const handleJoinRoom = (code: string) => {
    handleUiClick();
    if (!code.trim()) return;
    sendPacket('join_room', { code: code.trim().toUpperCase() });
    setRoomCodeInput('');
  };

  const handleLeaveRoom = () => {
    handleUiClick();
    if (isOfflineAI) {
      setIsOfflineAI(false);
      setCurrentScreen('lobby');
      return;
    }
    if (roomState) {
      sendPacket('leave_room', { code: roomState.code });
    }
  };

  const handleToggleReady = () => {
    handleUiClick();
    if (roomState) {
      sendPacket('game_ready', { code: roomState.code });
    }
  };

  const handleCellClick = (index: number) => {
    if (isOfflineAI) {
      handleOfflineCellClick(index);
      return;
    }
    if (!roomState || roomState.status !== 'playing') return;
    // Turn checklist
    const isP1 = roomState.player1?.id === wsId;
    const currentTurnId = roomState.turn;
    const isMyTurn = isP1 ? (roomState.player1?.id === currentTurnId) : (roomState.player2?.id === currentTurnId);
    
    if (!isMyTurn) return;
    if (roomState.board[index] !== null) return;

    sendPacket('make_move', { code: roomState.code, cellIndex: index });
  };

  const handleRequestRematch = () => {
    handleUiClick();
    if (isOfflineAI) {
      startOfflineGame(aiDifficulty);
      return;
    }
    if (roomState) {
      sendPacket('restart_match_request', { code: roomState.code });
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    if (isOfflineAI) {
      // Offline local chat append
      const localMsg: ChatMsg = {
        id: `msg_offline_${Date.now()}`,
        sender: playerUser || 'Guest',
        text: chatMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setAiChat(prev => [...prev, localMsg]);
      setChatMessage('');
      return;
    }

    if (roomState) {
      sendPacket('send_chat', { code: roomState.code, text: chatMessage });
      setChatMessage('');
    }
  };

  // ----- OFFLINE LOCAL PRACTICE AI ENGINE -----
  const startOfflineGame = (difficulty: 'Easy' | 'Medium' | 'Hard') => {
    handleUiClick();
    setIsOfflineAI(true);
    setAiDifficulty(difficulty);
    setAiBoard(Array(9).fill(null));
    setAiIsMyTurn(true);
    setAiWinnerInfo({ winner: null, pattern: null });
    setAiChat([
      {
        id: 'sys_init',
        sender: 'System',
        text: `Logged into local practice vs Computer (${difficulty}). Computer symbol is O.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setCurrentScreen('board');
  };

  const checkLocalWin = (grid: ('X' | 'O' | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const combo of lines) {
      const [a, b, c] = combo;
      if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) {
        return { winner: grid[a], pattern: combo };
      }
    }
    if (grid.every(cell => cell !== null)) {
      return { winner: 'Draw' as const, pattern: null };
    }
    return null;
  };

  const handleOfflineCellClick = (index: number) => {
    if (!aiIsMyTurn || aiWinnerInfo.winner || aiBoard[index] !== null) return;

    // Apply human move 'X'
    if (soundEnabled) sfx.playMoveX();
    const newBoard = [...aiBoard];
    newBoard[index] = 'X';
    setAiBoard(newBoard);

    const checkP = checkLocalWin(newBoard);
    if (checkP) {
      setAiWinnerInfo({ winner: checkP.winner, pattern: checkP.pattern });
      if (checkP.winner === 'X') {
        if (soundEnabled) sfx.playWin();
      } else if (soundEnabled) sfx.playDraw();
      return;
    }

    // Trigger AI's Move with slight delay
    setAiIsMyTurn(false);
    setTimeout(() => {
      processAiTurn(newBoard);
    }, 450);
  };

  const processAiTurn = (currentGrid: ('X' | 'O' | null)[]) => {
    const available = currentGrid.map((c, idx) => c === null ? idx : null).filter(c => c !== null) as number[];
    if (available.length === 0) return;

    let move: number = available[0];

    if (aiDifficulty === 'Easy') {
      move = available[Math.floor(Math.random() * available.length)];
    } else if (aiDifficulty === 'Medium') {
      // 50% wise decision, 50% random
      if (Math.random() < 0.6) {
        move = findBestMinimaxMove(currentGrid);
      } else {
        move = available[Math.floor(Math.random() * available.length)];
      }
    } else {
      // Hard (Minimax)
      move = findBestMinimaxMove(currentGrid);
    }

    if (soundEnabled) sfx.playMoveO();
    const finalGrid = [...currentGrid];
    finalGrid[move] = 'O';
    setAiBoard(finalGrid);
    setAiIsMyTurn(true);

    const checkO = checkLocalWin(finalGrid);
    if (checkO) {
      setAiWinnerInfo({ winner: checkO.winner, pattern: checkO.pattern });
      if (checkO.winner === 'O' && soundEnabled) sfx.playDraw(); // computer won
    }
  };

  // Backtracking Minimax for TicTacToe
  const findBestMinimaxMove = (grid: ('X' | 'O' | null)[]): number => {
    let bestScore = -Infinity;
    let bestPos = 0;

    for (let i = 0; i < 9; i++) {
      if (grid[i] === null) {
        grid[i] = 'O'; // Bot symbol
        const score = runMinimax(grid, 0, false);
        grid[i] = null; // Backtrack

        if (score > bestScore) {
          bestScore = score;
          bestPos = i;
        }
      }
    }
    return bestPos;
  };

  const runMinimax = (grid: ('X' | 'O' | null)[], depth: number, isMax: boolean): number => {
    const r = checkLocalWin(grid);
    if (r) {
      if (r.winner === 'O') return 10 - depth;
      if (r.winner === 'X') return depth - 10;
      return 0; // Draw
    }

    if (isMax) {
      let score = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (grid[i] === null) {
          grid[i] = 'O';
          score = Math.max(score, runMinimax(grid, depth + 1, false));
          grid[i] = null;
        }
      }
      return score;
    } else {
      let score = Infinity;
      for (let i = 0; i < 9; i++) {
        if (grid[i] === null) {
          grid[i] = 'X';
          score = Math.min(score, runMinimax(grid, depth + 1, true));
          grid[i] = null;
        }
      }
      return score;
    }
  };

  // ----- COMPONENT HEADERS STATUS RENDERER -----
  const getTopHeadline = () => {
    if (isOfflineAI) {
      if (aiWinnerInfo.winner) {
        return aiWinnerInfo.winner === 'Draw' ? 'Match Draw!' : `${aiWinnerInfo.winner === 'X' ? 'Guest Player' : `Bot (${aiDifficulty})`} Wins!`;
      }
      return aiIsMyTurn ? 'YOUR TURN' : 'BOT IS REASONING...';
    }

    if (!roomState) return 'Syncing...';
    if (roomState.status === 'waiting') return 'Waiting for Contenders...';
    if (roomState.status === 'ended') {
      if (roomState.winner === 'Draw') return 'Draw Match!';
      if (roomState.winner === 'Disconnect') return 'Contender Disconnected!';
      return `${roomState.winner} Declared Winner!`;
    }

    // Is active playing turn
    const isP1 = roomState.player1?.id === wsId;
    const currentTurnId = roomState.turn;
    const isMyTurn = isP1 ? (roomState.player1?.id === currentTurnId) : (roomState.player2?.id === currentTurnId);
    return isMyTurn ? 'YOUR TURN' : 'OPPONENT THINKING...';
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-slate-200 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200 overflow-x-hidden">
      {/* Universal navigation layout */}
      <header className="bg-[#12121a] border-b border-white/10 shadow-2xl px-6 py-4 flex flex-wrap justify-between items-center sticky top-0 z-50 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2.5 rounded-xl shadow-lg border-2 border-white/20">
            <span className="font-mono font-black text-white italic tracking-tighter text-lg">XO</span>
          </div>
          <div>
            <h1 className="font-black italic tracking-tighter text-white text-lg">KK strike</h1>
            <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-semibold">Online Real-time Arcade</p>
          </div>
        </div>

        {/* Global Connection state badge & Audio toggles */}
        <div className="flex items-center gap-4">
          <div className="flex bg-[#08080a] p-1.5 border border-white/10 rounded-xl text-[10px] font-mono items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${wsReady ? 'bg-cyan-500 shadow-[0_0_8px_#06b6d4] animate-pulse' : 'bg-red-500 animate-ping'}`} />
            <span className="text-slate-400 tracking-wider font-bold">{wsReady ? 'STATION CONNECTED' : 'OFFLINE SYNCING'}</span>
          </div>

          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              sfx.playClick();
            }}
            className="p-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-350 rounded-xl transition-all cursor-pointer"
            title={soundEnabled ? 'Mute Retro Synths' : 'Enable sound synthesizers'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {playerUser && (
            <div className="flex items-center gap-2.5 pl-3 border-l border-white/10">
              <span className="text-xs font-bold text-cyan-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                🏆 {playerUser}
              </span>
              <button
                onClick={() => {
                  handleUiClick();
                  setPlayerUser(null);
                  setCurrentScreen('auth');
                }}
                className="text-slate-500 hover:text-red-400 transition-colors p-1.5"
                title="Log Out Session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container viewports router */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        <AnimatePresence mode="wait">
          {currentScreen === 'auth' && (
            <motion.div
              key="auth_key"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-center py-10"
            >
              <div className="bg-[#12121a] border border-white/10 shadow-2xl rounded-2xl p-8 max-w-md w-full flex flex-col gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 blur-3xl rounded-full" />
                
                <div className="text-center">
                  <div className="inline-block bg-cyan-950/40 p-4 border border-cyan-500/30 rounded-2xl mb-4">
                    <Sparkles className="text-cyan-400 w-6 h-6 animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-black italic tracking-tight text-white uppercase">KK strike</h2>
                  <p className="text-[11px] text-slate-400 mt-1">Choose your battle tag & emblem to join the lobby</p>
                </div>

                {authError && (
                  <div className="bg-red-955/20 border border-red-500/30 text-rose-300 px-4 py-3 rounded-xl text-xs font-medium">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-[0.1em]">Battle Tag / Username</span>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 text-slate-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Player Name (Leave blank for Guest)"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        className="w-full bg-[#08080a] border border-white/10 hover:border-white/25 focus:border-cyan-500/50 focus:outline-none rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-slate-600 transition font-mono"
                      />
                    </div>
                  </div>

                  {/* Avatar selection - always visible */}
                  <div className="bg-[#08080a] p-3 border border-white/10 rounded-xl flex flex-col gap-2">
                    <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-[0.1em]">Select Battle Emblem</span>
                    <div className="flex gap-2">
                      {avatars.map((av) => (
                        <button
                          key={av}
                          type="button"
                          onClick={() => { handleUiClick(); setAuthAvatar(av); }}
                          className={`flex-1 aspect-square rounded-lg capitalize text-2xl border transition flex items-center justify-center ${authAvatar === av ? 'bg-cyan-500/10 border-cyan-500 scale-105 shadow-[0_0_10px_rgba(6,182,212,0.25)]' : 'bg-[#12121a] border-white/5 hover:bg-white/5'}`}
                          title={av.replace('_', ' ')}
                        >
                          {getAvatarEmoji(av)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex flex-col gap-2.5 mt-2">
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-white font-black py-3 px-4 rounded-xl text-xs uppercase tracking-[0.2em] transition shadow-lg shadow-cyan-500/10 cursor-pointer"
                    >
                      Enter Game Arena
                    </button>
                  </div>
                </form>

                <div className="border-t border-white/10 pt-4 flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  <span>SQLite Ledger Enabled</span>
                  <span>Port Checked 3000</span>
                </div>
              </div>
            </motion.div>
          )}

          {currentScreen === 'lobby' && (
            <motion.div
              key="lobby_key"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-6"
            >
              {/* Header Profile Summary banner & Tabs */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Stats widget panel */}
                <div className="lg:col-span-1 bg-[#12121a] border border-white/10 rounded-2xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 blur-3xl rounded-full" />
                  
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">Active Pilot Profile</span>
                    <div className="flex items-center gap-4 mt-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 border-2 border-white/20 flex items-center justify-center text-2xl shadow-lg shadow-cyan-500/20">
                        {getAvatarEmoji(playerAvatar)}
                      </div>
                      <div>
                        <h3 className="font-bold text-white leading-tight flex items-center gap-2">
                          <span>{playerUser}</span>
                        </h3>
                        {isGuest ? (
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Guest Combatant</span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">SQLite Record</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detailed Win Loss Draw Layout */}
                  <div className="grid grid-cols-2 gap-2 text-center my-6">
                    <div className="bg-white/5 border border-white/5 rounded-xl py-3">
                      <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Wins</p>
                      <p className="text-xl font-extrabold text-cyan-400 mt-1">{playerWins}</p>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-xl py-3">
                      <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Losses</p>
                      <p className="text-xl font-extrabold text-red-400 mt-1">{playerLosses}</p>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-xl py-3">
                      <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Draws</p>
                      <p className="text-xl font-extrabold text-slate-350 mt-1">{playerDraws}</p>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-xl py-3">
                      <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Win rate</p>
                      <p className="text-xl font-extrabold text-fuchsia-400 mt-1">
                        {playerTotal > 0 ? Math.round((playerWins / playerTotal) * 100) : 0}%
                      </p>
                    </div>
                  </div>

                  <div className="font-mono text-[11px] text-slate-400 space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex justify-between">
                      <span>Total Battles:</span>
                      <span className="text-white font-bold">{playerTotal}</span>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-slate-500 bg-[#08080a] px-3 py-2 rounded-lg border border-white/5 mt-4 text-center">
                    Ledger: SQLite Database
                  </div>
                </div>

                {/* Main Lobbies lists & Tabs */}
                <div className="lg:col-span-3 bg-[#12121a] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-6">
                  {/* Tab Selectors */}
                  <div className="grid grid-cols-2 bg-[#08080a] p-1 border border-white/10 rounded-xl gap-1.5 text-xs text-slate-400">
                    <button
                      onClick={() => { handleUiClick(); setActiveTab('arena'); }}
                      className={`py-2.5 rounded-lg font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${activeTab === 'arena' ? 'bg-white/5 text-white border border-white/10' : 'hover:text-slate-200'}`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Arena Lobbies</span>
                    </button>
                    <button
                      onClick={() => { handleUiClick(); setActiveTab('leaderboard'); }}
                      className={`py-2.5 rounded-lg font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${activeTab === 'leaderboard' ? 'bg-white/5 text-white border border-white/10' : 'hover:text-slate-200'}`}
                    >
                      <Trophy className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Global Leaderboard</span>
                    </button>
                  </div>

                  {activeTab === 'arena' && (
                    <div className="flex flex-col gap-6">
                      {/* Create/Join inputs */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Create widget */}
                        <div className="bg-[#08080a] p-4 border border-white/10 rounded-xl flex flex-col gap-3">
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-300">⚔ Initialize Match Room</h4>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={roomNameInput}
                              onChange={(e) => setRoomNameInput(e.target.value)}
                              placeholder="e.g. Neon Arena"
                              className="flex-1 bg-[#12121a] border border-white/10 focus:border-cyan-500/50 focus:outline-none rounded-lg font-mono text-xs text-white placeholder:text-slate-600 px-3 py-2 transition"
                            />
                            <button
                              onClick={handleCreateRoom}
                              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shrink-0 cursor-pointer"
                            >
                              + SPAWN
                            </button>
                          </div>
                        </div>

                        {/* Join with code widget */}
                        <div className="bg-[#08080a] p-4 border border-white/10 rounded-xl flex flex-col gap-3">
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-300">🔑 Match Enter Code</h4>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={roomCodeInput}
                              onChange={(e) => setRoomCodeInput(e.target.value)}
                              placeholder="ENTER 5-DIGIT CODE"
                              maxLength={5}
                              className="flex-1 bg-[#12121a] border border-white/10 focus:border-cyan-500/50 focus:outline-none rounded-lg font-mono text-xs text-white placeholder:text-slate-600 px-3 py-1.5 transition uppercase"
                            />
                            <button
                              onClick={() => handleJoinRoom(roomCodeInput)}
                              className="bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 text-xs font-bold px-4 py-2 rounded-lg transition shrink-0 cursor-pointer"
                            >
                              JOIN
                            </button>
                          </div>
                          {joiningError && (
                            <span className="text-[10px] text-red-400 font-mono">{joiningError}</span>
                          )}
                        </div>
                      </div>

                      {/* AI offline triggers header block */}
                      <div className="bg-gradient-to-r from-cyan-500/10 via-blue-950/5 to-transparent border border-cyan-500/20 p-5 rounded-2xl flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
                            <Sparkles className="text-cyan-400 w-5 h-5 animate-pulse" />
                          </div>
                          <div>
                            <h5 className="font-black text-xs text-cyan-400 uppercase tracking-widest">Single player local train?</h5>
                            <p className="text-[11px] text-slate-400 leading-relaxed max-w-sm mt-0.5">Test tactical algorithms offline against our minimax computer engine in Easy, Medium, or Hard difficulty settings.</p>
                          </div>
                        </div>

                        <div className="flex gap-2 items-center">
                          <select
                            value={aiDifficulty}
                            onChange={(e: any) => setAiDifficulty(e.target.value)}
                            className="bg-[#08080a] border border-white/10 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none focus:border-cyan-500"
                          >
                            <option value="Easy">Easy Level</option>
                            <option value="Medium">Medium Level</option>
                            <option value="Hard">Hard (Minimax)</option>
                          </select>
                          <button
                            onClick={() => startOfflineGame(aiDifficulty)}
                            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black tracking-widest uppercase px-5 py-2.5 rounded-lg transition cursor-pointer"
                          >
                            Fight AI
                          </button>
                        </div>
                      </div>

                      {/* Join wait list available rooms */}
                      <div className="bg-[#08080a] rounded-2xl overflow-hidden border border-white/10">
                        <div className="bg-[#08080a] px-5 py-3 border-b border-white/10 flex justify-between items-center">
                          <span className="font-black text-xs text-white uppercase tracking-[0.2em]">Lobbies directory</span>
                          <button
                            onClick={() => { handleUiClick(); sendPacket('get_rooms_list'); }}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-1.5 cursor-pointer"
                            title="Refresh Waiting Rooms"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {activeRooms.length === 0 ? (
                          <div className="py-12 text-center flex flex-col gap-2 items-center justify-center">
                            <Users className="text-slate-700 w-8 h-8" />
                            <p className="text-xs text-slate-500 italic leading-relaxed">No live online sessions. Create one or start Offline AI game above!</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-white/5 max-h-[220px] overflow-y-auto">
                            {activeRooms.map((room) => (
                              <div key={room.code} className="px-5 py-3.5 flex justify-between items-center gap-4 hover:bg-white/5 transition">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-white">{room.name}</span>
                                    <span className="bg-cyan-500/10 text-cyan-400 text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-500/30 uppercase font-black">{room.code}</span>
                                  </div>
                                  <div className="flex gap-2.5 text-[11px] text-slate-400 mt-1 font-mono">
                                    <span>P1: {room.player1 || 'Empty'}</span>
                                    <span>P2: {room.player2 || 'Empty'}</span>
                                  </div>
                                </div>

                                <button
                                  onClick={() => handleJoinRoom(room.code)}
                                  disabled={room.status !== 'waiting'}
                                  className={`text-xs font-black uppercase tracking-wider px-4 py-1.5 rounded-lg transition cursor-pointer ${
                                    room.status === 'waiting'
                                      ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30'
                                      : 'bg-white/5 text-slate-500 cursor-not-allowed border border-transparent'
                                  }`}
                                >
                                  {room.status === 'waiting' ? 'Join Combat' : 'Match active'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'leaderboard' && (
                    <div className="flex flex-col gap-6">
                      {/* Top rankings list */}
                      <div className="bg-[#08080a] rounded-2xl overflow-hidden border border-white/10">
                        <div className="bg-[#08080a] px-5 py-3.5 border-b border-white/10 font-black text-xs text-white uppercase tracking-[0.2em]">
                          🏆 SQLite Global Ranking Ledger
                        </div>

                        {leaderboard.length === 0 ? (
                          <div className="py-12 text-center text-xs text-slate-500">
                            No persistent accounts ledger detected yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-white/5 font-mono text-xs">
                            {leaderboard.map((user, idx) => (
                              <div key={user.username} className="px-5 py-3 flex items-center justify-between hover:bg-white/5 transition">
                                <div className="flex items-center gap-3">
                                  <span className={`w-6 text-center font-bold text-sm ${idx === 0 ? 'text-yellow-500 italic' : idx === 1 ? 'text-slate-350' : idx === 2 ? 'text-amber-700' : 'text-slate-500'}`}>
                                    {idx + 1}
                                  </span>
                                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg">
                                    {getAvatarEmoji(user.avatar || 'avatar_1')}
                                  </div>
                                  <div>
                                    <span className="font-bold text-slate-200">{user.username}</span>
                                    {user.isBot && <span className="bg-amber-955/20 text-amber-500 text-[9px] px-1.5 py-0.5 rounded-full ml-2 uppercase font-bold border border-amber-500/30">ENGINE</span>}
                                  </div>
                                </div>

                                <div className="flex gap-6 text-[11px]">
                                  <span className="text-cyan-400 font-bold">{user.wins} Wins</span>
                                  <span className="text-slate-500">{user.totalMatches} matches</span>
                                  <span className="text-fuchsia-400">{user.winPercentage}% Win-Pct</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Recent match history log entries */}
                      <div className="bg-[#08080a] rounded-2xl overflow-hidden border border-white/10">
                        <div className="bg-[#08080a] px-5 py-3.5 border-b border-white/10 font-black text-xs text-white uppercase tracking-[0.2em]">
                          ⚔ Visual Battle History Log
                        </div>

                        {matchHistory.length === 0 ? (
                          <div className="py-12 text-center text-xs text-slate-500 font-mono">
                            Recent matches ledger empty. Complete an online combat game to populate logs!
                          </div>
                        ) : (
                          <div className="divide-y divide-white/5 font-mono text-xs">
                            {matchHistory.map((m) => {
                              const IsDraw = m.winner === 'Draw';
                              return (
                                <div key={m.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/5 transition">
                                  <div className="flex items-center gap-3">
                                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                    <div>
                                      <p className="font-bold text-slate-300">{m.player1} <span className="text-slate-500 italic">vs</span> {m.player2}</p>
                                      <span className="text-[10px] text-fuchsia-400 uppercase tracking-wider bg-white/5 px-2 py-0.5 border border-white/5 rounded-md">{m.mode} battle</span>
                                    </div>
                                  </div>

                                  <div className="text-right">
                                    {IsDraw ? (
                                      <span className="text-slate-400 font-bold bg-[#08080a] px-3 py-1 rounded-full border border-white/10">Result: DRAW</span>
                                    ) : (
                                      <span className="text-cyan-400 font-bold bg-[#08080a] px-3 py-1 rounded-full border border-cyan-500/20">Winner: {m.winner}</span>
                                    )}
                                    <p className="text-[10px] text-slate-500 mt-1">{m.movesCount} moves completed</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab Contents */}
                </div>
              </div>
            </motion.div>
          )}

          {currentScreen === 'board' && (
            <motion.div
              key="board_key"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 3x3 play matrix board */}
                <div className="lg:col-span-2 bg-[#12121a] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-between gap-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-cyan-500/5 blur-[100px] pointer-events-none"></div>
                  
                  {/* Headline state status banner pulsing */}
                  <div className="text-center w-full my-2">
                    <h1 className="text-4xl font-black italic tracking-tighter text-white uppercase">KK strike</h1>
                    <div className="flex items-center justify-center gap-4 text-xs font-bold uppercase tracking-[0.2em] mt-1.5">
                      <span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
                        {isOfflineAI ? `OFFLINE PRACTICE (${aiDifficulty})` : 'Online Match'}
                      </span>
                      <span className="text-slate-700">|</span>
                      <span className="text-slate-400">
                        {isOfflineAI ? 'Practice Room' : `Room #${roomState?.code}`}
                      </span>
                    </div>
                  </div>

                  {/* 3x3 Grid Buttons overlay */}
                  <div className="grid grid-cols-3 gap-4 max-w-sm w-full aspect-square my-4 relative z-10">
                    {Array(9).fill(null).map((_, index) => {
                      const value = isOfflineAI ? aiBoard[index] : (roomState?.board[index] || null);
                      const isWinningCell = isOfflineAI 
                        ? (aiWinnerInfo.pattern?.includes(index) || false)
                        : (roomState?.status === 'ended' && roomState.board[index] !== null && roomState.winner !== 'Draw' && roomState.winner !== 'Disconnect'); // highlight final win row nicely

                      return (
                        <button
                          key={index}
                          onClick={() => handleCellClick(index)}
                          className={`aspect-square rounded-2xl flex items-center justify-center text-6xl font-black transition-all border duration-200 cursor-pointer ${
                            value === null 
                              ? 'bg-[#12121a] border-2 border-white/5 hover:bg-white/5 hover:border-cyan-500/30' 
                              : value === 'X'
                                ? `bg-[#12121a] border-2 border-cyan-500 text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)] ${isWinningCell ? 'bg-[#181822] shadow-cyan-500/30 scale-102' : ''}`
                                : `bg-[#12121a] border-2 border-fuchsia-500 text-fuchsia-500 drop-shadow-[0_0_15px_rgba(217,70,239,0.6)] ${isWinningCell ? 'bg-[#181822] shadow-fuchsia-500/30 scale-102' : ''}`
                          }`}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions / Turn displays */}
                  <div className="flex flex-col items-center gap-6 w-full">
                    <div className="bg-black/40 border border-white/10 px-8 py-3 rounded-full flex items-center gap-6 shadow-xl relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4] animate-pulse"></div>
                        <span className="text-sm font-black uppercase tracking-widest text-cyan-400">
                          {getTopHeadline()}
                        </span>
                      </div>
                      <div className="w-[1px] h-4 bg-white/20"></div>
                      <div className="text-xs font-mono text-slate-400 uppercase tracking-wide">
                        {isOfflineAI ? 'O IS COMPUTER' : `YOUR SYMBOL: ${mySymbol}`}
                      </div>
                    </div>

                    <div className="flex gap-4 w-full justify-between items-center border-t border-white/10 pt-4 relative z-10">
                      <button
                        onClick={handleLeaveRoom}
                        className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-xs font-bold uppercase tracking-[0.2em] text-red-400 cursor-pointer transition-all"
                      >
                        Surrender / Exit
                      </button>

                      <div className="flex gap-2">
                        {((!isOfflineAI && roomState?.status === 'ended') || (isOfflineAI && aiWinnerInfo.winner !== null)) && (
                          <button
                            onClick={handleRequestRematch}
                            className="px-8 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-[0.2em] transition-all cursor-pointer"
                          >
                            Play Again
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right sub card containing chat, profiles, and ready indicators */}
                <div className="flex flex-col gap-6">
                  {/* Opponent Info card */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Opponent info</h3>
                    
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-fuchsia-600/30 border border-fuchsia-500 flex items-center justify-center font-black text-fuchsia-100">
                          {isOfflineAI ? 'AI' : (roomState?.player2 ? roomState.player2.username.slice(0, 2).toUpperCase() : '??')}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-4 border-[#12121a] rounded-full"></div>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold text-white truncate">
                          {isOfflineAI ? `Computer Bot` : (roomState?.player2?.username || 'Waiting for slot...')}
                        </p>
                        <p className="text-[10px] text-fuchsia-400">
                          {isOfflineAI ? `Minimax algorithm • ${aiDifficulty}` : 'Multiplayer Contender'}
                        </p>
                      </div>
                    </div>

                    {!isOfflineAI && roomState?.status === 'waiting' && (
                      <button
                        onClick={handleToggleReady}
                        className={`w-full text-xs font-black uppercase tracking-widest py-2.5 rounded-xl transition text-slate-950 mt-1 cursor-pointer ${
                          (roomState.player1?.id === wsId ? roomState.player1?.isReady : roomState.player2?.isReady)
                            ? 'bg-red-400 hover:bg-red-350'
                            : 'bg-cyan-400 hover:bg-cyan-350 shadow-lg shadow-cyan-500/10'
                        }`}
                      >
                        {(roomState.player1?.id === wsId ? roomState.player1?.isReady : roomState.player2?.isReady)
                          ? 'Cancel Ready'
                          : 'Declare READY FOR FIGHT'}
                      </button>
                    )}
                  </div>

                  {/* Battle Chat stream system */}
                  <div className="flex-1 bg-[#12121a] border border-white/10 rounded-2xl flex flex-col overflow-hidden h-[330px]">
                    <div className="p-4 border-b border-white/5">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Match Chat</h3>
                    </div>
                    
                    {/* Message bubbles list */}
                    <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide">
                      {(isOfflineAI ? aiChat : (roomState?.chat || [])).map((m) => {
                        const IsSystem = m.sender === 'System';
                        const IsSelf = m.sender === playerUser;
                        return (
                          <div key={m.id} className="space-y-1">
                            {IsSystem ? (
                              <div className="bg-white/5 border border-white/5 p-2 rounded-lg text-center font-mono text-[10px] text-slate-400">
                                {m.text}
                              </div>
                            ) : IsSelf ? (
                              <div className="flex flex-col items-end">
                                <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest">{m.sender}</p>
                                <div className="bg-cyan-500/20 px-3 py-2 rounded-xl rounded-tr-none border border-cyan-500/20 text-slate-200 text-xs leading-relaxed max-w-[90%] mt-1">
                                  {m.text}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="text-[10px] font-bold text-fuchsia-500 uppercase tracking-widest">{m.sender}</p>
                                <div className="bg-white/5 px-3 py-2 rounded-xl rounded-tl-none border border-white/10 text-slate-200 text-xs leading-relaxed max-w-[90%] mt-1">
                                  {m.text}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Send chat entry form */}
                    <form onSubmit={handleSendChat} className="p-4 bg-white/5 border-t border-white/10">
                      <div className="relative">
                        <input
                          type="text"
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          placeholder="Type message..."
                          className="w-full bg-[#08080a] border border-white/10 rounded-lg py-2 pl-3 pr-10 text-xs focus:outline-none focus:border-cyan-500/50"
                        />
                        <button type="submit" className="absolute right-3 top-2 text-slate-505 hover:text-cyan-400">
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Luxury dynamic visual background card footer credit lines */}
      <footer className="bg-[#12121a]/40 border-t border-white/5 px-6 py-6 font-mono text-[10px] text-slate-500 flex flex-wrap justify-between items-center gap-4 uppercase tracking-wider">
        <span>SQLite PERSISTENT ACCOUNT ENGINE</span>
        <span className="text-[9px] text-slate-600">Google AI Studio • Unified React Portfolio Suite</span>
      </footer>
    </div>
  );
}
