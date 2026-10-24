import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import type { Card, CardColor, CardValue, GameState, Player, GameMode } from "./src/types.js";
import {
  createDeck,
  recycleDiscardPile,
  validateAndPreparePlay,
  advanceTurn,
  sanitizeGameStateForClient,
  isPowerCard,
} from "./src/gameEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface ServerGameState extends GameState {
  botTimeout?: NodeJS.Timeout | null;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const rooms = new Map<string, ServerGameState>();

  function broadcastRoomState(room: ServerGameState) {
    const socketsInRoom = io.sockets.adapter.rooms.get(room.roomId);
    if (!socketsInRoom) {
      // Room might have no active sockets, emit anyway as fallback
      io.to(room.roomId).emit("roomState", room);
      return;
    }

    for (const socketId of socketsInRoom) {
      const clientSocket = io.sockets.sockets.get(socketId);
      if (clientSocket) {
        clientSocket.emit("roomState", sanitizeGameStateForClient(room, socketId));
      }
    }
  }

  function handleBotTurn(room: ServerGameState) {
    if (room.botTimeout) {
      clearTimeout(room.botTimeout);
      room.botTimeout = null;
    }

    const currentIndex = room.currentPlayerIndex;
    const player = room.players[currentIndex];
    if (!player || !player.isBot || room.status !== 'playing') return;

    room.botTimeout = setTimeout(() => {
      room.botTimeout = null;

      // State verification after delay
      if (room.status !== 'playing') return;
      if (room.currentPlayerIndex !== currentIndex) return;
      const currentBotPlayer = room.players[currentIndex];
      if (!currentBotPlayer || !currentBotPlayer.isBot) return;

      const topCard = room.discardPile[room.discardPile.length - 1];

      // Find playable card respecting power-card ending restriction
      const playableCard = currentBotPlayer.cards.find(card => {
        // Enforce rule: cannot finish with power card (+2 or +4)
        if (currentBotPlayer.cards.length === 1 && isPowerCard(card)) {
          return false;
        }

        if (room.stackCount > 0) {
          if (topCard.value === 'draw2' && (card.value === 'draw2' || card.value === 'draw4')) return true;
          if (topCard.value === 'draw4' && card.value === 'draw4') return true;
          return false;
        }
        return (
          card.color === 'wild' ||
          card.value === 'wild' ||
          card.value === 'draw4' ||
          card.color === topCard.color ||
          card.value === topCard.value
        );
      });

      if (playableCard) {
        // In Special Mode, bot checks if it has additional number cards of the same value
        const cardsToPlay = [playableCard];
        if (room.gameMode === 'special' && playableCard.value >= '0' && playableCard.value <= '9') {
          const matchingCards = currentBotPlayer.cards.filter(
            c => c.id !== playableCard.id && c.value === playableCard.value
          );
          cardsToPlay.push(...matchingCards);
        }

        // Remove cards from bot's hand
        for (const c of cardsToPlay) {
          const idx = currentBotPlayer.cards.findIndex(card => card.id === c.id);
          if (idx !== -1) currentBotPlayer.cards.splice(idx, 1);
        }

        // Add played cards to discard pile (last one on top)
        for (let i = 0; i < cardsToPlay.length; i++) {
          const playedCard = { ...cardsToPlay[i] };
          if (playedCard.color === 'wild' || playedCard.value === 'wild' || playedCard.value === 'draw4') {
            playedCard.color = 'red'; // Default bot color choice
          }
          room.discardPile.push(playedCard);
        }

        const primaryCard = cardsToPlay[cardsToPlay.length - 1];
        let skip = 1;
        if (cardsToPlay.length === 1) {
          if (primaryCard.value === 'skip') skip = 2;
          else if (primaryCard.value === 'reverse') {
            const activePlayersCount = room.players.filter(p => p.cards.length > 0).length;
            if (activePlayersCount === 2) skip = 2;
            else room.direction = (room.direction * -1) as 1 | -1;
          } else if (primaryCard.value === 'draw2') room.stackCount += 2;
          else if (primaryCard.value === 'draw4') room.stackCount += 4;
        }

        if (currentBotPlayer.cards.length === 1) currentBotPlayer.hasSaidUno = true;

        if (currentBotPlayer.cards.length === 0) {
          if (!room.winners.includes(currentBotPlayer.id)) {
            room.winners.push(currentBotPlayer.id);
          }
          checkGameEnd(room);
        }

        if (room.status === 'playing') {
          advanceTurn(
            room,
            skip,
            cardsToPlay.length > 1 ? `botPlayCards (${cardsToPlay.length})` : `botPlayCard (${primaryCard.value})`
          );
        }
      } else {
        // Bot must draw
        const drawCount = room.stackCount > 0 ? room.stackCount : 1;
        room.stackCount = 0;
        for (let i = 0; i < drawCount; i++) {
          if (room.drawPile.length === 0) {
            recycleDiscardPile(room);
          }
          if (room.drawPile.length > 0) {
            currentBotPlayer.cards.push(room.drawPile.pop()!);
          }
        }

        // Pass bot turn
        advanceTurn(room, 1, 'botDrawPass');
      }

      broadcastRoomState(room);
      if (room.status === 'playing') handleBotTurn(room);
    }, 2000);
  }

  function checkGameEnd(room: ServerGameState) {
    const activePlayers = room.players.filter(p => p.cards.length > 0);
    console.log(`[ROOM ${room.roomId}] Active players left: ${activePlayers.length} / Total: ${room.players.length}`);

    if (activePlayers.length <= 1) {
      if (room.status === 'ended') return;

      console.log(`[ROOM ${room.roomId}] MATCH ENDED. FINAL WINNERS LIST:`, room.winners);
      room.status = 'ended';
      room.autoResetAt = Date.now() + 10000; // 10 seconds redirect

      if (room.botTimeout) {
        clearTimeout(room.botTimeout);
        room.botTimeout = null;
      }

      if (activePlayers.length === 1) {
        const lastPlayer = activePlayers[0];
        if (!room.winners.includes(lastPlayer.id)) {
          room.winners.push(lastPlayer.id);
        }
      }

      broadcastRoomState(room);

      setTimeout(() => {
        if (room.status === 'ended') {
          console.log(`[ROOM ${room.roomId}] AUTO-RESETTING TO LOBBY (TIMEOUT).`);
          resetRoomToLobby(room);
        }
      }, 10000);
    }
  }

  function resetRoomToLobby(room: ServerGameState) {
    if (room.botTimeout) {
      clearTimeout(room.botTimeout);
      room.botTimeout = null;
    }
    room.status = 'waiting';
    room.winners = [];
    room.autoResetAt = null;
    room.players = room.players.filter(p => !p.isBot);
    room.players.forEach(p => {
      p.cards = [];
      p.isReady = false;
      p.hasSaidUno = false;
      p.hasReturnedToLobby = false;
    });
    broadcastRoomState(room);
  }

  function startGame(room: ServerGameState) {
    room.status = 'playing';
    room.drawPile = createDeck();
    room.discardPile = [];
    room.currentPlayerIndex = 0;
    room.direction = 1;
    room.stackCount = 0;
    room.winner = null;
    room.winners = [];
    room.hasDrawnThisTurn = false;
    room.missedUnoPlayers = [];
    room.autoResetAt = null;
    room.turnCount = 0;

    for (const player of room.players) {
      player.cards = room.drawPile.splice(0, room.startingCardCount);
      player.hasSaidUno = false;
      player.isReady = true;
      player.hasReturnedToLobby = false;
    }

    let firstCard = room.drawPile.pop()!;
    while (firstCard.color === 'wild') {
      room.drawPile.unshift(firstCard);
      firstCard = room.drawPile.pop()!;
    }
    room.discardPile.push(firstCard);

    console.log(`[ROOM ${room.roomId}] Game started in Mode: "${room.gameMode}". First top card: ${firstCard.color} ${firstCard.value}`);
    broadcastRoomState(room);
    handleBotTurn(room);
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinRoom", (roomId: string, name: string, sessionToken?: string) => {
      let room = rooms.get(roomId);
      if (!room) {
        room = {
          roomId,
          players: [],
          status: 'waiting',
          currentPlayerIndex: 0,
          direction: 1,
          discardPile: [],
          drawPile: [],
          stackCount: 0,
          winner: null,
          winners: [],
          hasDrawnThisTurn: false,
          startingCardCount: 7,
          missedUnoPlayers: [],
          autoResetAt: null,
          gameMode: 'normal',
          turnCount: 0,
          botTimeout: null,
        };
        rooms.set(roomId, room);
      }

      const trimmedName = (name || `Player ${room.players.length + 1}`).trim();

      // Check for existing player (by persistent sessionToken, socket.id, or name for disconnected bots)
      const existingPlayer = room.players.find(
        p => (sessionToken && p.sessionToken === sessionToken) ||
             p.id === socket.id ||
             (p.name.toLowerCase() === trimmedName.toLowerCase() && p.isBot)
      );

      if (existingPlayer) {
        const oldId = existingPlayer.id;
        existingPlayer.id = socket.id;
        if (sessionToken) existingPlayer.sessionToken = sessionToken;
        existingPlayer.isBot = false;

        // Cancel bot timeout if scheduled for this player
        if (room.botTimeout && room.players[room.currentPlayerIndex]?.id === socket.id) {
          clearTimeout(room.botTimeout);
          room.botTimeout = null;
        }

        socket.join(roomId);
        console.log(`[ROOM ${roomId}] Player "${existingPlayer.name}" reconnected (socket: ${socket.id}, was ${oldId}). Player index: ${room.players.indexOf(existingPlayer)}.`);
        broadcastRoomState(room);
        return;
      }

      // If game is already active, reject new players from interrupting turn order
      if (room.status !== 'waiting') {
        socket.emit("error", "Game is already in progress in this room");
        return;
      }

      if (room.players.length >= 16) {
        socket.emit("error", "Room is full");
        return;
      }

      if (room.players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        socket.emit("error", "A player with this name is already in the lobby");
        return;
      }

      const player: Player = {
        id: socket.id,
        name: trimmedName,
        cards: [],
        isReady: false,
        isBot: false,
        hasSaidUno: false,
        hasReturnedToLobby: false,
        sessionToken: sessionToken || nanoid(),
      };

      room.players.push(player);
      socket.join(roomId);
      console.log(`[ROOM ${roomId}] Player "${trimmedName}" joined at position ${room.players.length - 1} (socket: ${socket.id}).`);
      broadcastRoomState(room);
    });

    socket.on("changeName", (newName: string) => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      const trimmed = (newName || '').trim();
      if (!trimmed || trimmed.length === 0) {
        socket.emit("error", "Player name cannot be empty");
        return;
      }
      if (trimmed.length > 20) {
        socket.emit("error", "Player name cannot exceed 20 characters");
        return;
      }

      const isTaken = room.players.some(
        p => p.id !== socket.id && p.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (isTaken) {
        socket.emit("error", "A player with this name is already in the room");
        return;
      }

      const oldName = player.name;
      player.name = trimmed;
      console.log(`[ROOM ${room.roomId}] Player "${oldName}" changed name to "${trimmed}" (id: ${socket.id}, position: ${room.players.indexOf(player)}). Turn order preserved.`);
      broadcastRoomState(room);
    });

    socket.on("toggleReady", () => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'waiting') return;

      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.isReady = !player.isReady;
        broadcastRoomState(room);

        if (room.players.length >= 2 && room.players.every(p => p.isReady)) {
          startGame(room);
        }
      }
    });

    socket.on("updateSettings", (settings: { startingCardCount?: number; gameMode?: GameMode }) => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'waiting') return;

      if (room.players[0]?.id === socket.id) {
        if (typeof settings.startingCardCount === 'number') {
          room.startingCardCount = Math.max(1, Math.min(15, settings.startingCardCount));
        }
        if (settings.gameMode === 'normal' || settings.gameMode === 'special') {
          room.gameMode = settings.gameMode;
          console.log(`[ROOM ${room.roomId}] Host set game mode to "${room.gameMode}".`);
        }
        broadcastRoomState(room);
      }
    });

    socket.on("setGameMode", (gameMode: GameMode) => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'waiting') return;

      if (room.players[0]?.id === socket.id) {
        if (gameMode === 'normal' || gameMode === 'special') {
          room.gameMode = gameMode;
          console.log(`[ROOM ${room.roomId}] Host updated game mode to "${room.gameMode}".`);
          broadcastRoomState(room);
        }
      }
    });

    // Core play handler supporting both multi-card and single-card plays
    function handlePlayCards(cardIds: string[], chosenColor?: CardColor) {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing') return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== room.currentPlayerIndex) {
        socket.emit("error", "It is not your turn");
        return;
      }

      const player = room.players[playerIndex];
      const validation = validateAndPreparePlay(room, player, cardIds, chosenColor);

      if (!validation.valid) {
        socket.emit("error", validation.error || "Invalid play");
        return;
      }

      const { cardsToPlay, skip, newDirection, addedStackCount, lastCardColor } = validation;

      // Remove cards from player's hand
      for (const card of cardsToPlay!) {
        const idx = player.cards.findIndex(c => c.id === card.id);
        if (idx !== -1) player.cards.splice(idx, 1);
      }

      // Add cards to discard pile in selected order, so last selected card is on top
      for (let i = 0; i < cardsToPlay!.length; i++) {
        const card = { ...cardsToPlay![i] };
        if (i === cardsToPlay!.length - 1 && lastCardColor) {
          card.color = lastCardColor;
        }
        room.discardPile.push(card);
      }

      if (newDirection) room.direction = newDirection;
      if (addedStackCount) room.stackCount += addedStackCount;

      if (player.cards.length === 0) {
        if (!room.winners.includes(player.id)) {
          room.winners.push(player.id);
        }
        checkGameEnd(room);
      } else if (player.cards.length === 1) {
        player.hasSaidUno = false;
        setTimeout(() => {
          if (room.status === 'playing' && player.cards.length === 1 && !player.hasSaidUno) {
            if (!room.missedUnoPlayers.includes(player.id)) {
              room.missedUnoPlayers.push(player.id);
              broadcastRoomState(room);
            }
          }
        }, 2000);
      }

      if (room.status === 'playing') {
        advanceTurn(
          room,
          skip || 1,
          cardsToPlay!.length > 1 ? `playCards (${cardsToPlay!.length})` : `playCard (${cardsToPlay![0].value})`
        );
      }

      broadcastRoomState(room);
      if (room.status === 'playing') handleBotTurn(room);
    }

    socket.on("playCards", (cardIds: string[], chosenColor?: CardColor) => {
      handlePlayCards(cardIds, chosenColor);
    });

    socket.on("playCard", (cardId: string, chosenColor?: CardColor) => {
      handlePlayCards([cardId], chosenColor);
    });

    socket.on("drawCard", () => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing') return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== room.currentPlayerIndex) return;

      const player = room.players[playerIndex];
      const drawCount = room.stackCount > 0 ? room.stackCount : 1;
      room.stackCount = 0;

      for (let i = 0; i < drawCount; i++) {
        if (room.drawPile.length === 0) {
          recycleDiscardPile(room);
        }
        if (room.drawPile.length > 0) {
          player.cards.push(room.drawPile.pop()!);
        }
      }

      player.hasSaidUno = false;
      room.missedUnoPlayers = room.missedUnoPlayers.filter(id => id !== player.id);

      if (drawCount > 1) {
        advanceTurn(room, 1, `drawPenalty (${drawCount})`);
      } else {
        room.hasDrawnThisTurn = true;
        console.log(`[ROOM ${room.roomId}] Player ${player.name} drew 1 card (now holds ${player.cards.length} cards).`);
      }

      broadcastRoomState(room);
      if (room.status === 'playing') handleBotTurn(room);
    });

    socket.on("skipTurn", () => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing') return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== room.currentPlayerIndex) return;

      if (!room.hasDrawnThisTurn) return;

      advanceTurn(room, 1, 'skipTurn');
      broadcastRoomState(room);
      handleBotTurn(room);
    });

    socket.on("sayUno", () => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (player && player.cards.length <= 2) {
        player.hasSaidUno = true;
        room.missedUnoPlayers = room.missedUnoPlayers.filter(id => id !== player.id);
        broadcastRoomState(room);
      }
    });

    socket.on("catchUno", (targetId: string) => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing') return;

      if (room.missedUnoPlayers.includes(targetId)) {
        const targetPlayer = room.players.find(p => p.id === targetId);
        if (targetPlayer) {
          for (let i = 0; i < 2; i++) {
            if (room.drawPile.length === 0) {
              recycleDiscardPile(room);
            }
            if (room.drawPile.length > 0) {
              targetPlayer.cards.push(room.drawPile.pop()!);
            }
          }
          room.missedUnoPlayers = room.missedUnoPlayers.filter(id => id !== targetId);
          broadcastRoomState(room);
        }
      }
    });

    let lastEasterEggTime = 0;

    // Easter Egg: Rapidly click warning icon 10 times to grant a +2 or +4 card
    socket.on("easterEggCard", (choice: '+2' | '+4', color?: CardColor) => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing') return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // Prevent duplicated or spam requests from granting extra cards
      const now = Date.now();
      if (now - lastEasterEggTime < 2000) return;
      lastEasterEggTime = now;

      let newCard: Card | null = null;
      if (choice === '+2') {
        const validColors: CardColor[] = ['red', 'green', 'blue', 'yellow'];
        const chosenColor = color && validColors.includes(color) ? color : 'red';
        newCard = { id: nanoid(), color: chosenColor, value: 'draw2' };
      } else if (choice === '+4') {
        newCard = { id: nanoid(), color: 'wild', value: 'draw4' };
      }

      if (newCard) {
        player.cards.push(newCard);
        player.hasSaidUno = false;
        console.log(`[ROOM ${room.roomId}] EASTER EGG: Player "${player.name}" granted ${newCard.color} ${newCard.value}. Hand count now: ${player.cards.length}`);
        broadcastRoomState(room);
      }
    });

    socket.on("kickPlayer", (targetId: string) => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const isAdmin = room.players[0]?.id === socket.id;
      if (!isAdmin) return;

      const targetPlayerIndex = room.players.findIndex(p => p.id === targetId);
      if (targetPlayerIndex !== -1) {
        const kickedPlayer = room.players[targetPlayerIndex];
        console.log(`[ROOM ${room.roomId}] Player ${kickedPlayer.name} was kicked by Admin.`);

        const kickedSocket = io.sockets.sockets.get(targetId);
        if (kickedSocket) {
          kickedSocket.emit("error", "You have been kicked from the lobby");
          kickedSocket.leave(roomId);
        }

        room.players.splice(targetPlayerIndex, 1);

        if (room.status === 'playing') {
          if (targetPlayerIndex < room.currentPlayerIndex) {
            room.currentPlayerIndex = Math.max(0, room.currentPlayerIndex - 1);
          } else if (room.currentPlayerIndex >= room.players.length) {
            room.currentPlayerIndex = 0;
          }
          checkGameEnd(room);
        }

        broadcastRoomState(room);
      }
    });

    socket.on("resetToLobby", () => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'ended') return;

      console.log(`[ROOM ${room.roomId}] Resetting to lobby (force reset).`);
      resetRoomToLobby(room);
    });

    socket.on("returnToLobby", () => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'ended') return;

      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.hasReturnedToLobby = true;
        console.log(`[ROOM ${room.roomId}] Player ${player.name} returned to lobby.`);

        const nonBotPlayers = room.players.filter(p => !p.isBot);
        const allReturned = nonBotPlayers.every(p => p.hasReturnedToLobby);

        if (allReturned) {
          console.log(`[ROOM ${room.roomId}] All players returned. Resetting to lobby.`);
          resetRoomToLobby(room);
        } else {
          broadcastRoomState(room);
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          if (room.status === 'waiting') {
            room.players.splice(playerIndex, 1);
            if (room.players.length === 0) {
              if (room.botTimeout) clearTimeout(room.botTimeout);
              rooms.delete(roomId);
            } else {
              broadcastRoomState(room);
            }
          } else {
            // Mark as bot in-game
            room.players[playerIndex].isBot = true;
            broadcastRoomState(room);
            handleBotTurn(room);
          }
        }
      });
    });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
