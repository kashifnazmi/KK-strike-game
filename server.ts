import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "database.json");

// Define types for state management
interface UserAccount {
  username: string;
  passwordHash: string;
  wins: number;
  losses: number;
  draws: number;
  totalMatches: number;
  registrationDate: string;
  avatar: string;
  isBot?: boolean;
}

interface MatchRecord {
  id: string;
  player1: string;
  player2: string;
  winner: string | "Draw" | "Disconnect" | null;
  date: string;
  movesCount: number;
  mode: "multiplayer" | "ai";
}

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: string;
  id: string;
}

interface RoomPlayer {
  id: string; // ws connection id
  username: string;
  symbol: "X" | "O";
  isReady: boolean;
  connected: boolean;
}

interface GameRoom {
  code: string;
  name: string;
  player1: RoomPlayer | null;
  player2: RoomPlayer | null;
  board: ("X" | "O" | null)[];
  turn: string; // id of whose turn it is
  status: "waiting" | "playing" | "ended";
  movesCount: number;
  winner: string | "Draw" | "Disconnect" | null;
  chat: ChatMessage[];
  isPrivate: boolean;
}

// Global active server states
const rooms: Map<string, GameRoom> = new Map();
const activeConnections: Map<string, WebSocket> = new Map(); // wsId -> WebSocket
const socketUserMap: Map<string, string> = new Map(); // wsId -> username (or 'Guest')

// Database initialization
function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultDb = {
      users: {
        Bot_Easy: { username: "Bot_Easy", passwordHash: "", wins: 15, losses: 50, draws: 10, totalMatches: 75, registrationDate: new Date().toISOString(), avatar: "avatar_bot", isBot: true },
        Bot_Medium: { username: "Bot_Medium", passwordHash: "", wins: 40, losses: 30, draws: 15, totalMatches: 85, registrationDate: new Date().toISOString(), avatar: "avatar_bot", isBot: true },
        Bot_Hard: { username: "Bot_Hard", passwordHash: "", wins: 62, losses: 10, draws: 18, totalMatches: 90, registrationDate: new Date().toISOString(), avatar: "avatar_bot", isBot: true },
      },
      matches: [] as MatchRecord[]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
  }
}

function readDb(): { users: Record<string, UserAccount>; matches: MatchRecord[] } {
  try {
    initDatabase();
    const data = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("DB read error:", err);
    return { users: {}, matches: [] };
  }
}

function writeDb(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("DB write error:", err);
  }
}

// Init database on start
initDatabase();

app.use(express.json());

// API: Get leaderboard and match stats directly via HTTP
app.get("/api/leaderboard", (req, res) => {
  const db = readDb();
  const playerStats = Object.values(db.users).map((user) => {
    const total = user.totalMatches || 0;
    const wins = user.wins || 0;
    const winPercentage = total > 0 ? Math.round((wins / total) * 100) : 0;
    return {
      username: user.username,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      totalMatches: total,
      winPercentage,
      avatar: user.avatar || "avatar_1",
      isBot: user.isBot || false,
    };
  });

  // Sort by Wins desc, then WinPercent desc
  const sorted = playerStats
    .filter(p => !p.username.startsWith("Guest_"))
    .sort((a, b) => b.wins - a.wins || b.winPercentage - a.winPercentage);

  res.json(sorted.slice(0, 10)); // Top 10
});

app.get("/api/matches", (req, res) => {
  const db = readDb();
  res.json(db.matches.slice(-10).reverse()); // Last 10 matches
});

// Setup custom static routing & WebSockets combined
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Room win checkers
function checkWin(board: ("X" | "O" | null)[]): { winner: "X" | "O" | null; pattern: number[] | null } {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], pattern };
    }
  }
  return { winner: null, pattern: null };
}

// Generate Room Code
function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure unique code
  if (rooms.has(result)) {
    return generateRoomCode();
  }
  return result;
}

// Utility to broadcast to players in a room
function broadcastToRoom(roomCode: string, message: any) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const dataStr = JSON.stringify(message);
  if (room.player1 && room.player1.connected) {
    activeConnections.get(room.player1.id)?.send(dataStr);
  }
  if (room.player2 && room.player2.connected) {
    activeConnections.get(room.player2.id)?.send(dataStr);
  }
}

// Utility to send message to a single connection
function sendToClient(ws: WebSocket, message: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Update stats in the DB
function updatePlayerStats(username: string, outcome: "win" | "loss" | "draw") {
  if (username.startsWith("Guest_")) return; // Guests stats are transient
  const db = readDb();
  if (!db.users[username]) return;

  db.users[username].totalMatches = (db.users[username].totalMatches || 0) + 1;
  if (outcome === "win") {
    db.users[username].wins = (db.users[username].wins || 0) + 1;
  } else if (outcome === "loss") {
    db.users[username].losses = (db.users[username].losses || 0) + 1;
  } else if (outcome === "draw") {
    db.users[username].draws = (db.users[username].draws || 0) + 1;
  }
  writeDb(db);
}

// Record match history card
function recordMatch(p1: string, p2: string, winner: string | "Draw" | "Disconnect" | null, movesCount: number, mode: "multiplayer" | "ai") {
  const db = readDb();
  const match: MatchRecord = {
    id: "match_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    player1: p1,
    player2: p2,
    winner,
    date: new Date().toISOString(),
    movesCount,
    mode
  };
  db.matches.push(match);
  writeDb(db);
}

// WebSocket Message router
wss.on("connection", (ws: WebSocket) => {
  const wsId = "connection_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  activeConnections.set(wsId, ws);
  socketUserMap.set(wsId, `Guest_${Math.floor(1000 + Math.random() * 9000)}`);

  console.log(`ws: user connected, id: ${wsId}`);

  // Send baseline connection success event
  sendToClient(ws, {
    type: "connected",
    payload: {
      wsId,
      username: socketUserMap.get(wsId)
    }
  });

  ws.on("message", (messageStr: string) => {
    try {
      const { type, payload } = JSON.parse(messageStr);
      console.log(`ws action received: ${type}`, payload);

      switch (type) {
        // --- AUTH SECTION ---
        case "register": {
          const { username, password, avatar } = payload;
          const db = readDb();
          if (!username || username.trim().length === 0) {
            sendToClient(ws, { type: "auth_error", payload: { message: "Username cannot be empty!" } });
            break;
          }
          if (db.users[username]) {
            sendToClient(ws, { type: "auth_error", payload: { message: "Username already exists!" } });
            break;
          }
          db.users[username] = {
            username,
            passwordHash: password, // Simple plain text or basic password check for preview ease
            wins: 0,
            losses: 0,
            draws: 0,
            totalMatches: 0,
            registrationDate: new Date().toISOString(),
            avatar: avatar || "avatar_1"
          };
          writeDb(db);
          socketUserMap.set(wsId, username);
          sendToClient(ws, {
            type: "auth_success",
            payload: { username, wins: 0, losses: 0, draws: 0, totalMatches: 0, avatar: avatar || "avatar_1" }
          });
          break;
        }

        case "login": {
          const { username, password } = payload;
          const db = readDb();
          const user = db.users[username];
          if (!user || user.passwordHash !== password) {
            sendToClient(ws, { type: "auth_error", payload: { message: "Invalid username or password!" } });
            break;
          }
          socketUserMap.set(wsId, username);
          sendToClient(ws, {
            type: "auth_success",
            payload: {
              username,
              wins: user.wins || 0,
              losses: user.losses || 0,
              draws: user.draws || 0,
              totalMatches: user.totalMatches || 0,
              avatar: user.avatar || "avatar_1"
            }
          });
          break;
        }

        case "set_guest_profile": {
          const { username, avatar } = payload;
          const cleanName = username && username.trim().length > 0 ? username.trim() : `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
          socketUserMap.set(wsId, cleanName);
          
          const db = readDb();
          let user = db.users[cleanName];
          const isRealGuest = cleanName.startsWith("Guest_");
          
          if (!user && !isRealGuest) {
            user = {
              username: cleanName,
              passwordHash: "",
              wins: 0,
              losses: 0,
              draws: 0,
              totalMatches: 0,
              registrationDate: new Date().toISOString(),
              avatar: avatar || "avatar_1"
            };
            db.users[cleanName] = user;
            writeDb(db);
          }

          sendToClient(ws, {
            type: "auth_success",
            payload: {
              username: cleanName,
              wins: user ? (user.wins || 0) : 0,
              losses: user ? (user.losses || 0) : 0,
              draws: user ? (user.draws || 0) : 0,
              totalMatches: user ? (user.totalMatches || 0) : 0,
              avatar: avatar || (user ? user.avatar : "avatar_1"),
              isGuest: isRealGuest
            }
          });
          break;
        }

        // --- ROOM/LOBBY SECTION ---
        case "get_rooms_list": {
          const roomsList = Array.from(rooms.values()).map(r => ({
            code: r.code,
            name: r.name,
            player1: r.player1 ? r.player1.username : null,
            player2: r.player2 ? r.player2.username : null,
            status: r.status,
            isPrivate: r.isPrivate
          }));
          sendToClient(ws, { type: "rooms_list", payload: { rooms: roomsList } });
          break;
        }

        case "create_room": {
          const { name, isPrivate } = payload;
          const roomCode = generateRoomCode();
          const username = socketUserMap.get(wsId) || "Guest";

          const newRoom: GameRoom = {
            code: roomCode,
            name: name || `${username}'s Arena`,
            player1: {
              id: wsId,
              username,
              symbol: "X",
              isReady: false,
              connected: true
            },
            player2: null,
            board: Array(9).fill(null),
            turn: wsId, // Player 1 starts
            status: "waiting",
            movesCount: 0,
            winner: null,
            chat: [],
            isPrivate: !!isPrivate
          };

          rooms.set(roomCode, newRoom);
          sendToClient(ws, { type: "room_joined", payload: { room: newRoom, playerSymbol: "X" } });
          break;
        }

        case "join_room": {
          const { code } = payload;
          const room = rooms.get(code?.toUpperCase());
          const username = socketUserMap.get(wsId) || "Guest";

          if (!room) {
            sendToClient(ws, { type: "joining_error", payload: { message: "Room not found!" } });
            break;
          }

          if (room.player1 && room.player1.id === wsId) {
            sendToClient(ws, { type: "room_joined", payload: { room, playerSymbol: "X" } });
            break;
          }

          if (room.player2 && room.player2.id === wsId) {
            sendToClient(ws, { type: "room_joined", payload: { room, playerSymbol: "O" } });
            break;
          }

          if (room.player1 && room.player2) {
            sendToClient(ws, { type: "joining_error", payload: { message: "Room is already full!" } });
            break;
          }

          // Join as Player 2
          const playerSymbol = room.player1 ? "O" : "X";
          const newPlayer: RoomPlayer = {
            id: wsId,
            username,
            symbol: playerSymbol,
            isReady: false,
            connected: true
          };

          if (!room.player1) {
            room.player1 = newPlayer;
            room.turn = wsId;
          } else {
            room.player2 = newPlayer;
          }

          // If room has both players naturally change public status to active
          sendToClient(ws, { type: "room_joined", payload: { room, playerSymbol } });
          broadcastToRoom(room.code, { type: "room_updated", payload: { room } });
          break;
        }

        case "leave_room": {
          const { code } = payload;
          const room = rooms.get(code);
          if (!room) break;

          const isPlayer1 = room.player1?.id === wsId;
          const isPlayer2 = room.player2?.id === wsId;

          if (isPlayer1) {
            room.player1 = null;
          } else if (isPlayer2) {
            room.player2 = null;
          }

          // Check if room empty
          if (!room.player1 && !room.player2) {
            rooms.delete(code);
          } else {
            // Notify the remaining player about cancellation
            room.status = "waiting";
            room.board = Array(9).fill(null);
            room.movesCount = 0;
            room.winner = null;
            if (room.player1) {
              room.player1.isReady = false;
              room.turn = room.player1.id;
            }
            if (room.player2) {
              room.player2.isReady = false;
            }
            broadcastToRoom(room.code, { type: "opponent_left", payload: { room } });
          }
          sendToClient(ws, { type: "left_success" });
          break;
        }

        // --- GAME ACTIONS SECTION ---
        case "game_ready": {
          const { code } = payload;
          const room = rooms.get(code);
          if (!room) break;

          if (room.player1?.id === wsId) {
            room.player1.isReady = !room.player1.isReady;
          } else if (room.player2?.id === wsId) {
            room.player2.isReady = !room.player2.isReady;
          }

          // Start game if both are ready
          if (room.player1 && room.player2 && room.player1.isReady && room.player2.isReady) {
            room.status = "playing";
            room.board = Array(9).fill(null);
            room.movesCount = 0;
            room.winner = null;
            room.turn = Math.random() > 0.5 ? room.player1.id : room.player2.id; // Random first turn
            
            // Send system chat notification
            room.chat.push({
              id: "sys_" + Date.now(),
              sender: "System",
              text: "Match Started! Turn assigned randomly.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            });
          }

          broadcastToRoom(room.code, { type: "room_updated", payload: { room } });
          break;
        }

        case "make_move": {
          const { code, cellIndex } = payload;
          const room = rooms.get(code);
          if (!room || room.status !== "playing") break;
          if (room.turn !== wsId) break; // Not their turn
          if (room.board[cellIndex] !== null) break; // Cell is occupied

          const activePlayer = room.player1?.id === wsId ? room.player1 : room.player2;
          if (!activePlayer) break;

          room.board[cellIndex] = activePlayer.symbol;
          room.movesCount += 1;

          // Check win condition
          const { winner, pattern } = checkWin(room.board);
          if (winner) {
            room.status = "ended";
            const winningPlayer = room.player1?.symbol === winner ? room.player1 : room.player2;
            const losingPlayer = room.player1?.symbol === winner ? room.player2 : room.player1;

            room.winner = winningPlayer ? winningPlayer.username : winner;

            // Save records & database stats
            if (winningPlayer && losingPlayer) {
              updatePlayerStats(winningPlayer.username, "win");
              updatePlayerStats(losingPlayer.username, "loss");
              recordMatch(winningPlayer.username, losingPlayer.username, winningPlayer.username, room.movesCount, "multiplayer");
            }

            broadcastToRoom(room.code, {
              type: "match_ended",
              payload: { room, winnerPattern: pattern, winnerUsername: room.winner }
            });
          } else if (room.movesCount === 9) {
            // Draw
            room.status = "ended";
            room.winner = "Draw";

            if (room.player1 && room.player2) {
              updatePlayerStats(room.player1.username, "draw");
              updatePlayerStats(room.player2.username, "draw");
              recordMatch(room.player1.username, room.player2.username, "Draw", room.movesCount, "multiplayer");
            }

            broadcastToRoom(room.code, {
              type: "match_ended",
              payload: { room, winnerPattern: null, winnerUsername: "Draw" }
            });
          } else {
            // Flip Turn
            room.turn = room.player1?.id === wsId ? (room.player2?.id || "") : (room.player1?.id || "");
            broadcastToRoom(room.code, { type: "room_updated", payload: { room } });
          }
          break;
        }

        case "restart_match_request": {
          const { code } = payload;
          const room = rooms.get(code);
          if (!room) break;

          // Restart match directly clears state
          room.board = Array(9).fill(null);
          room.movesCount = 0;
          room.winner = null;
          room.status = 'playing';
          room.turn = Math.random() > 0.5 ? (room.player1?.id || "") : (room.player2?.id || "");
          
          if (room.player1) room.player1.isReady = true;
          if (room.player2) room.player2.isReady = true;

          room.chat.push({
            id: "sys_" + Date.now(),
            sender: "System",
            text: "Game restarted by common agreement!",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          });

          broadcastToRoom(room.code, { type: "room_updated", payload: { room } });
          break;
        }

        // --- CHAT SECTION ---
        case "send_chat": {
          const { code, text } = payload;
          const room = rooms.get(code);
          if (!room) break;

          const username = socketUserMap.get(wsId) || "Guest";
          const newMsg: ChatMessage = {
            id: "msg_" + Date.now() + "_" + Math.floor(Math.random() * 100),
            sender: username,
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          };

          room.chat.push(newMsg);
          // Bound chat history array
          if (room.chat.length > 50) {
            room.chat.shift();
          }

          broadcastToRoom(room.code, { type: "chat_received", payload: { chat: room.chat } });
          break;
        }

        default:
          console.warn("Unknown socket message type:", type);
      }
    } catch (e) {
      console.error("WS logic packet decode failed:", e);
    }
  });

  ws.on("close", () => {
    activeConnections.delete(wsId);
    console.log(`ws: user disconnected, id: ${wsId}`);

    // Clean up active rooms
    for (const [code, room] of rooms.entries()) {
      const isPlayer1 = room.player1?.id === wsId;
      const isPlayer2 = room.player2?.id === wsId;

      if (isPlayer1 || isPlayer2) {
        if (isPlayer1) {
          room.player1 = null;
        } else {
          room.player2 = null;
        }

        if (!room.player1 && !room.player2) {
          // Both active players gone, remove room
          rooms.delete(code);
        } else {
          // One player remaining, notify them or adjust status
          room.status = "waiting";
          room.board = Array(9).fill(null);
          room.winner = "Disconnect";
          if (room.player1) {
            room.player1.isReady = false;
            room.turn = room.player1.id;
          }
          if (room.player2) {
            room.player2.isReady = false;
          }
          broadcastToRoom(code, { type: "opponent_disconnected", payload: { room } });
        }
      }
    }

    socketUserMap.delete(wsId);
  });
});

// Vite server connection (Vite handles SPA client in dev)
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // Production serving static dist files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server executing successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer();
