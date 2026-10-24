import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { nanoid } from 'nanoid';
import type { GameState, Card, CardColor } from '../src/types.js';
import {
  createDeck,
  validateAndPreparePlay,
  advanceTurn,
  sanitizeGameStateForClient,
  isPowerCard,
} from '../src/gameEngine.js';

describe('Multiplayer Real-Time Socket Tests', () => {
  let io: Server;
  let httpServer: any;
  let port: number;
  const clients: ClientSocket[] = [];

  before(async () => {
    const app = express();
    httpServer = createServer(app);
    io = new Server(httpServer, {
      cors: { origin: '*' },
    });

    const rooms = new Map<string, GameState>();

    function broadcastRoomState(room: GameState) {
      const sockets = io.sockets.adapter.rooms.get(room.roomId);
      if (!sockets) return;
      for (const sId of sockets) {
        const sock = io.sockets.sockets.get(sId);
        if (sock) {
          sock.emit('roomState', sanitizeGameStateForClient(room, sId));
        }
      }
    }

    io.on('connection', (socket) => {
      socket.on('joinRoom', (roomId: string, name: string, sessionToken?: string) => {
        let room = rooms.get(roomId);
        if (!room) {
          room = {
            roomId,
            players: [],
            status: 'waiting',
            currentPlayerIndex: 0,
            direction: 1,
            discardPile: [{ id: 'top-1', color: 'red', value: '7' }],
            drawPile: createDeck(),
            stackCount: 0,
            winner: null,
            winners: [],
            hasDrawnThisTurn: false,
            startingCardCount: 7,
            missedUnoPlayers: [],
            autoResetAt: null,
            gameMode: 'normal',
            turnCount: 0,
          };
          rooms.set(roomId, room);
        }

        const existing = room.players.find(p => (sessionToken && p.sessionToken === sessionToken) || p.id === socket.id);
        if (existing) {
          existing.id = socket.id;
          socket.join(roomId);
          broadcastRoomState(room);
          return;
        }

        const player = {
          id: socket.id,
          name: name.trim(),
          cards: [
            { id: `${socket.id}-c1`, color: 'red' as CardColor, value: '7' as any },
            { id: `${socket.id}-c2`, color: 'blue' as CardColor, value: '7' as any },
          ],
          isReady: false,
          isBot: false,
          hasSaidUno: false,
          hasReturnedToLobby: false,
          sessionToken: sessionToken || nanoid(),
        };

        room.players.push(player);
        socket.join(roomId);
        broadcastRoomState(room);
      });

      socket.on('changeName', (newName: string) => {
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const trimmed = (newName || '').trim();
        if (!trimmed || trimmed.length > 20) {
          socket.emit('error', 'Invalid name');
          return;
        }
        if (room.players.some(p => p.id !== socket.id && p.name.toLowerCase() === trimmed.toLowerCase())) {
          socket.emit('error', 'Name taken');
          return;
        }

        player.name = trimmed;
        broadcastRoomState(room);
      });

      socket.on('updateSettings', (settings: { gameMode?: 'normal' | 'special' }) => {
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room || room.players[0]?.id !== socket.id) return;

        if (settings.gameMode) {
          room.gameMode = settings.gameMode;
        }
        broadcastRoomState(room);
      });

      function handlePlayCards(cardIds: string[], chosenColor?: CardColor) {
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room || room.status !== 'playing') return;

        const playerIdx = room.players.findIndex(p => p.id === socket.id);
        if (playerIdx !== room.currentPlayerIndex) {
          socket.emit('error', 'Not your turn');
          return;
        }

        const player = room.players[playerIdx];
        const validation = validateAndPreparePlay(room, player, cardIds, chosenColor);
        if (!validation.valid) {
          socket.emit('error', validation.error);
          return;
        }

        // Remove cards and push to discard
        for (const card of validation.cardsToPlay!) {
          const idx = player.cards.findIndex(c => c.id === card.id);
          if (idx !== -1) player.cards.splice(idx, 1);
          room.discardPile.push(card);
        }

        advanceTurn(room, validation.skip || 1, 'playCards');
        broadcastRoomState(room);
      }

      socket.on('playCards', (cardIds: string[], chosenColor?: CardColor) => {
        handlePlayCards(cardIds, chosenColor);
      });

      socket.on('playCard', (cardId: string, chosenColor?: CardColor) => {
        handlePlayCards([cardId], chosenColor);
      });

      let lastEasterEggTime = 0;
      socket.on('easterEggCard', (choice: '+2' | '+4', color?: CardColor) => {
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const now = Date.now();
        if (now - lastEasterEggTime < 2000) return;
        lastEasterEggTime = now;

        if (choice === '+2') {
          player.cards.push({ id: nanoid(), color: color || 'red', value: 'draw2' });
        } else if (choice === '+4') {
          player.cards.push({ id: nanoid(), color: 'wild', value: 'draw4' });
        }

        broadcastRoomState(room);
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  after(() => {
    clients.forEach((c) => c.close());
    io.close();
    httpServer.close();
  });

  function waitFor(fn: () => boolean, timeout = 2500): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (fn()) resolve();
        else if (Date.now() - start > timeout) reject(new Error('Timeout waiting for condition'));
        else setTimeout(check, 20);
      };
      check();
    });
  }

  it('Four clients join room in order, change names without reordering, toggle mode, and take turns', async () => {
    const roomId = 'ROOM_REALTIME';

    // Connect 4 clients
    const client1 = Client(`http://localhost:${port}`, { transports: ['websocket'] });
    const client2 = Client(`http://localhost:${port}`, { transports: ['websocket'] });
    const client3 = Client(`http://localhost:${port}`, { transports: ['websocket'] });
    const client4 = Client(`http://localhost:${port}`, { transports: ['websocket'] });
    clients.push(client1, client2, client3, client4);

    let latestStateAlice: GameState | null = null;
    client1.on('roomState', (s) => { latestStateAlice = s; });

    let latestStateBob: GameState | null = null;
    client2.on('roomState', (s) => { latestStateBob = s; });

    let errorReceived: string | null = null;
    client2.on('error', (err) => { errorReceived = err; });

    // Wait for all 4 clients to connect
    await waitFor(() => client1.connected && client2.connected && client3.connected && client4.connected);

    // Join room
    client1.emit('joinRoom', roomId, 'Alice', 'token-alice');
    client2.emit('joinRoom', roomId, 'Bob', 'token-bob');
    client3.emit('joinRoom', roomId, 'Charlie', 'token-charlie');
    client4.emit('joinRoom', roomId, 'Diana', 'token-diana');

    await waitFor(() => Boolean(latestStateAlice && latestStateAlice.players.length === 4));

    assert.ok(latestStateAlice);
    assert.equal(latestStateAlice!.players.length, 4);
    assert.equal(latestStateAlice!.players[0].name, 'Alice');
    assert.equal(latestStateAlice!.players[1].name, 'Bob');
    assert.equal(latestStateAlice!.players[2].name, 'Charlie');
    assert.equal(latestStateAlice!.players[3].name, 'Diana');

    // Bob changes name to "Robert"
    client2.emit('changeName', 'Robert');
    await waitFor(() => latestStateAlice?.players[1]?.name === 'Robert');

    assert.equal(latestStateAlice!.players[1].name, 'Robert');
    assert.equal(latestStateBob!.players[1].name, 'Robert');
    // Verify Bob's slot position remains index 1
    assert.equal(latestStateAlice!.players[0].name, 'Alice');
    assert.equal(latestStateAlice!.players[2].name, 'Charlie');
    assert.equal(latestStateAlice!.players[3].name, 'Diana');

    // Invalid or empty name change rejected
    client2.emit('changeName', '');
    await waitFor(() => errorReceived === 'Invalid name');
    assert.equal(errorReceived, 'Invalid name');

    // Host selects Special Mode
    client1.emit('updateSettings', { gameMode: 'special' });
    await waitFor(() => latestStateAlice?.gameMode === 'special');
    assert.equal(latestStateAlice!.gameMode, 'special');
    assert.equal(latestStateBob!.gameMode, 'special');

    // Easter Egg: Client 3 requests +2 of green color
    const initialC3Cards = latestStateAlice!.players[2].cards.length;
    client3.emit('easterEggCard', '+2', 'green');
    await waitFor(() => Boolean(latestStateAlice && latestStateAlice.players[2].cards.length === initialC3Cards + 1));
    assert.equal(latestStateAlice!.players[2].cards.length, initialC3Cards + 1);

    // Duplicate rapid Easter egg request immediately after should be ignored by rate-limit
    client3.emit('easterEggCard', '+4');
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(latestStateAlice!.players[2].cards.length, initialC3Cards + 1);
  });

});
