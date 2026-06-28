import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import type { Card, CardColor, CardValue, GameState, Player } from "./src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const rooms = new Map<string, GameState>();

  function createDeck(): Card[] {
    const colors: CardColor[] = ['red', 'green', 'blue', 'yellow'];
    const values: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    const deck: Card[] = [];

    for (const color of colors) {
      for (const value of values) {
        // Two of each card except 0
        deck.push({ id: nanoid(), color, value });
        if (value !== '0') {
          deck.push({ id: nanoid(), color, value });
        }
      }
    }

    // Wild cards
    for (let i = 0; i < 4; i++) {
      deck.push({ id: nanoid(), color: 'wild', value: 'wild' });
      deck.push({ id: nanoid(), color: 'wild', value: 'draw4' });
    }

    return shuffle(deck);
  }

  function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function recycleDiscardPile(room: GameState) {
    if (room.discardPile.length <= 1) return;
    const top = room.discardPile.pop()!;
    const recycled = room.discardPile.map(card => {
      if (card.value === 'wild' || card.value === 'draw4') {
        return { ...card, color: 'wild' as CardColor };
      }
      return card;
    });
    room.drawPile = shuffle(recycled);
    room.discardPile = [top];
  }

  function getNextPlayerIndex(state: GameState, skip: number = 1): number {
    const { players, currentPlayerIndex, direction } = state;
    let nextIndex = currentPlayerIndex;
    
    for (let i = 0; i < skip; i++) {
      nextIndex = (nextIndex + direction) % players.length;
      if (nextIndex < 0) nextIndex += players.length;
      
      // Skip players who have already finished (0 cards)
      while (players[nextIndex].cards.length === 0) {
        nextIndex = (nextIndex + direction) % players.length;
        if (nextIndex < 0) nextIndex += players.length;
      }
    }
    
    return nextIndex;
  }

  function handleBotTurn(room: GameState) {
    const player = room.players[room.currentPlayerIndex];
    if (!player.isBot || room.status !== 'playing') return;

    setTimeout(() => {
      const topCard = room.discardPile[room.discardPile.length - 1];
      const playableCard = player.cards.find(card => {
        if (room.stackCount > 0) {
          if (topCard.value === 'draw2' && (card.value === 'draw2' || card.value === 'draw4')) return true;
          if (topCard.value === 'draw4' && card.value === 'draw4') return true;
          return false;
        }
        return card.color === 'wild' || card.value === 'wild' || card.value === 'draw4' || card.color === topCard.color || card.value === topCard.value;
      });

      if (playableCard) {
        // Play it
        const cardIndex = player.cards.indexOf(playableCard);
        player.cards.splice(cardIndex, 1);
        const playedCard = { ...playableCard };
        if (playedCard.color === 'wild' || playedCard.value === 'wild' || playedCard.value === 'draw4') {
          playedCard.color = 'red'; // Default bot color
        }
        room.discardPile.push(playedCard);

        let skip = 1;
        if (playedCard.value === 'skip') skip = 2;
        else if (playedCard.value === 'reverse') {
          if (room.players.length === 2) skip = 2;
          else room.direction *= -1;
        } else if (playedCard.value === 'draw2') room.stackCount += 2;
        else if (playedCard.value === 'draw4') room.stackCount += 4;

        if (player.cards.length === 1) player.hasSaidUno = true;
        
        if (player.cards.length === 0) {
          if (!room.winners.includes(player.id)) {
            room.winners.push(player.id);
          }
          checkGameEnd(room);
        }

        if (room.status === 'playing') {
          room.currentPlayerIndex = getNextPlayerIndex(room, skip);
          room.hasDrawnThisTurn = false;
        }
      } else {
        // Draw
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
        
        // Bot always skips if it can't play after drawing 1 card
        // Or plays if it can. For simplicity, just pass turn.
        room.currentPlayerIndex = getNextPlayerIndex(room);
        room.hasDrawnThisTurn = false;
      }
      io.to(room.roomId).emit("roomState", room);
      if (room.status === 'playing') handleBotTurn(room);
    }, 2000);
  }

  function checkGameEnd(room: GameState) {
    const activePlayers = room.players.filter(p => p.cards.length > 0);
    console.log(`[ROOM ${room.roomId}] Active players left: ${activePlayers.length} / Total: ${room.players.length}`);
    
    if (activePlayers.length <= 1) {
      if (room.status === 'ended') return;
      
      console.log(`[ROOM ${room.roomId}] MATCH ENDED. FINAL WINNERS LIST:`, room.winners);
      room.status = 'ended';
      room.autoResetAt = Date.now() + 10000; // 10 seconds redirect

      if (activePlayers.length === 1) {
        const lastPlayer = activePlayers[0];
        if (!room.winners.includes(lastPlayer.id)) {
          room.winners.push(lastPlayer.id);
        }
      }
      
      io.to(room.roomId).emit("roomState", room);

      setTimeout(() => {
        if (room.status === 'ended') {
          console.log(`[ROOM ${room.roomId}] AUTO-RESETTING TO LOBBY.`);
          room.status = 'waiting';
          room.winners = [];
          room.autoResetAt = null;
          room.players = room.players.filter(p => !p.isBot);
          room.players.forEach(p => {
            p.cards = [];
            p.isReady = false;
            p.hasSaidUno = false;
          });
          io.to(room.roomId).emit("roomState", room);
        }
      }, 10000);
    }
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinRoom", (roomId: string, name: string) => {
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
        };
        rooms.set(roomId, room);
      }

      if (room.status === 'playing') {
        // Allow reconnecting
        const player = room.players.find(p => p.id === socket.id || p.name === name);
        if (player) {
          player.id = socket.id;
          player.isBot = false;
          socket.join(roomId);
          io.to(roomId).emit("roomState", room);
          return;
        }
        socket.emit("error", "Game already in progress");
        return;
      }

      if (room.status === 'ended') {
        // If game ended, reset to waiting if someone joins
        room.status = 'waiting';
        room.winners = [];
        room.players.forEach(p => {
          p.isReady = false;
          p.cards = [];
        });
      }

      if (room.players.length >= 16) {
        socket.emit("error", "Room is full");
        return;
      }

      const trimmedName = (name || `Player ${room.players.length + 1}`).trim();
      if (room.players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase() && p.id !== socket.id)) {
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
      };

      room.players.push(player);
      socket.join(roomId);
      io.to(roomId).emit("roomState", room);
    });

    socket.on("toggleReady", () => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      if (room.status === 'ended') {
        room.status = 'waiting';
        room.winners = [];
        room.players.forEach(p => {
          p.isReady = false;
          p.cards = [];
        });
      }

      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.isReady = !player.isReady;
        io.to(roomId).emit("roomState", room);

        if (room.players.length >= 2 && room.players.every(p => p.isReady)) {
          startGame(room);
        }
      }
    });

    socket.on("updateSettings", (settings: { startingCardCount: number }) => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'waiting') return;

      if (room.players[0].id === socket.id) {
        room.startingCardCount = Math.max(1, Math.min(15, settings.startingCardCount));
        io.to(roomId).emit("roomState", room);
      }
    });

    function startGame(room: GameState) {
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

      for (const player of room.players) {
        player.cards = room.drawPile.splice(0, room.startingCardCount);
        player.hasSaidUno = false;
        player.isReady = true;
      }

      let firstCard = room.drawPile.pop()!;
      while (firstCard.color === 'wild') {
        room.drawPile.unshift(firstCard);
        firstCard = room.drawPile.pop()!;
      }
      room.discardPile.push(firstCard);

      io.to(room.roomId).emit("roomState", room);
      handleBotTurn(room);
    }

    socket.on("playCard", (cardId: string, chosenColor?: CardColor) => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing') return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== room.currentPlayerIndex) return;

      const player = room.players[playerIndex];
      const cardIndex = player.cards.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return;

      const card = player.cards[cardIndex];
      const topCard = room.discardPile[room.discardPile.length - 1];

      let isValid = false;
      if (room.stackCount > 0) {
        if (topCard.value === 'draw2' && (card.value === 'draw2' || card.value === 'draw4')) isValid = true;
        else if (topCard.value === 'draw4' && card.value === 'draw4') isValid = true;
      } else {
        if (card.color === 'wild' || card.value === 'wild' || card.value === 'draw4' || card.color === topCard.color || card.value === topCard.value) isValid = true;
      }

      if (!isValid) return;

      player.cards.splice(cardIndex, 1);
      const playedCard = { ...card };
      if ((playedCard.color === 'wild' || playedCard.value === 'wild' || playedCard.value === 'draw4') && chosenColor) {
        playedCard.color = chosenColor;
      }
      room.discardPile.push(playedCard);

      let skip = 1;
      if (playedCard.value === 'skip') skip = 2;
      else if (playedCard.value === 'reverse') {
        if (room.players.length === 2) skip = 2;
        else room.direction *= -1;
      } else if (playedCard.value === 'draw2') room.stackCount += 2;
      else if (playedCard.value === 'draw4') room.stackCount += 4;

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
              io.to(roomId).emit("roomState", room);
            }
          }
        }, 2000);
      }

      if (room.status === 'playing') {
        room.currentPlayerIndex = getNextPlayerIndex(room, skip);
        room.hasDrawnThisTurn = false;
        console.log(`[ROOM ${room.roomId}] Turn passed to player index ${room.currentPlayerIndex} (${room.players[room.currentPlayerIndex].name})`);
      }
      
      io.to(roomId).emit("roomState", room);
      if (room.status === 'playing') handleBotTurn(room);
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
        room.currentPlayerIndex = getNextPlayerIndex(room);
        room.hasDrawnThisTurn = false;
        console.log(`[ROOM ${room.roomId}] Player drew penalty cards. Turn passed to player index ${room.currentPlayerIndex}`);
      } else {
        room.hasDrawnThisTurn = true;
        console.log(`[ROOM ${room.roomId}] Player ${player.name} drew a card. Now has ${player.cards.length} cards.`);
      }

      io.to(roomId).emit("roomState", room);
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

      room.currentPlayerIndex = getNextPlayerIndex(room);
      room.hasDrawnThisTurn = false;
      console.log(`[ROOM ${room.roomId}] Player skipped/passed. Turn passed to player index ${room.currentPlayerIndex}`);
      io.to(roomId).emit("roomState", room);
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
        io.to(roomId).emit("roomState", room);
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
          io.to(roomId).emit("roomState", room);
        }
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
          if (room.currentPlayerIndex >= room.players.length) {
            room.currentPlayerIndex = 0;
          }
          checkGameEnd(room);
        }

        io.to(roomId).emit("roomState", room);
      }
    });

    socket.on("resetToLobby", () => {
      const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== 'ended') return;

      console.log(`[ROOM ${room.roomId}] Resetting to lobby.`);
      room.status = 'waiting';
      room.winners = [];
      room.autoResetAt = null;
      room.players = room.players.filter(p => !p.isBot);
      room.players.forEach(p => {
        p.cards = [];
        p.isReady = false;
        p.hasSaidUno = false;
      });
      io.to(room.roomId).emit("roomState", room);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          if (room.status === 'waiting') {
            room.players.splice(playerIndex, 1);
            if (room.players.length === 0) {
              rooms.delete(roomId);
            } else {
              io.to(roomId).emit("roomState", room);
            }
          } else {
            // Mark as bot or handle disconnect in-game
            room.players[playerIndex].isBot = true;
            io.to(roomId).emit("roomState", room);
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
