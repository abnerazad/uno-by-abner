/// <reference types="vite/client" />
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { nanoid } from 'nanoid';
import { GameState, Card, CardColor, Player, GameMode } from './types';
import { Lobby } from './components/Lobby';
import { Hand } from './components/Hand';
import { Opponents } from './components/Opponents';
import { UnoCard } from './components/UnoCard';
import { WinnerModal } from './components/WinnerModal';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Zap, SkipForward, Home, Trophy, Sparkles, X, Check } from 'lucide-react';
import { cn } from './lib/utils';
import { isPowerCard } from './gameEngine';

const socketUrl = import.meta.env.VITE_WS_URL || window.location.origin;
const socket: Socket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket', 'polling'], // Prioritize websocket for instant responses and stable connections
});

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState(() => new URLSearchParams(window.location.search).get('room') || '');
  const [name, setName] = useState(() => localStorage.getItem('uno_nickname') || '');
  const [roomState, setRoomState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUnoButton, setShowUnoButton] = useState(false);
  const [hasDismissedWinnerModal, setHasDismissedWinnerModal] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isInactive, setIsInactive] = useState(false);
  const lastActivityTime = useRef(Date.now());

  // Tab-isolated session token per room to ensure multiple tabs are distinct players
  const getSessionTokenForRoom = (targetRoomId: string): string => {
    try {
      const storageKey = `uno_session_${targetRoomId}`;
      let token = sessionStorage.getItem(storageKey);
      if (!token) {
        token = nanoid();
        sessionStorage.setItem(storageKey, token);
      }
      return token;
    } catch {
      return nanoid();
    }
  };

  // Easter Egg states
  const clickTimesRef = useRef<number[]>([]);
  const [showEasterEggModal, setShowEasterEggModal] = useState(false);
  const [easterEggChoice, setEasterEggChoice] = useState<'+2' | '+4' | null>(null);
  const [easterEggColor, setEasterEggColor] = useState<CardColor>('red');

  useEffect(() => {
    if (roomState?.autoResetAt) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((roomState.autoResetAt! - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining === 0) clearInterval(interval);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [roomState?.autoResetAt]);

  const currentJoinedRoomRef = useRef<{ roomId: string; name: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rId = params.get('room');
    if (rId) setRoomId(rId);

    socket.connect();

    socket.on('connect', () => {
      if (currentJoinedRoomRef.current) {
        const { roomId: activeRoomId, name: activeName } = currentJoinedRoomRef.current;
        const token = getSessionTokenForRoom(activeRoomId);
        socket.emit('joinRoom', activeRoomId, activeName, token);
      }
    });

    socket.on('roomState', (state: GameState) => {
      // If we are not in the room players list (e.g. we were kicked), reset state
      const isInRoom = state.players.some(p => p.id === socket.id);
      if (!isInRoom) {
        setRoomState(null);
        setRoomId(null);
        currentJoinedRoomRef.current = null;
        window.history.pushState({}, '', window.location.pathname);
        return;
      }
      setRoomState(state);
      setError(null);
      // Reset dismissal if a new game starts or we're back in lobby
      if (state.winners.length === 0) {
        setHasDismissedWinnerModal(false);
      }
    });

    socket.on('error', (msg: string) => {
      setError(msg);
    });

    return () => {
      socket.off('connect');
      socket.off('roomState');
      socket.off('error');
    };
  }, []);

  useEffect(() => {
    const handleActivity = () => {
      lastActivityTime.current = Date.now();
      setIsInactive(false);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const interval = setInterval(() => {
      if (Date.now() - lastActivityTime.current > 20000) {
        setIsInactive(true);
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(interval);
    };
  }, []);

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalRoomId = roomCodeInput.trim() || nanoid(6);
    setRoomId(finalRoomId);
    localStorage.setItem('uno_nickname', name);
    window.history.pushState({}, '', `?room=${finalRoomId}`);
    currentJoinedRoomRef.current = { roomId: finalRoomId, name };
    const token = getSessionTokenForRoom(finalRoomId);
    socket.emit('joinRoom', finalRoomId, name, token);
  };

  const toggleReady = () => socket.emit('toggleReady');
  const updateSettings = (settings: { startingCardCount?: number; gameMode?: GameMode }) => socket.emit('updateSettings', settings);
  const changeName = (newName: string) => {
    setName(newName);
    localStorage.setItem('uno_nickname', newName);
    socket.emit('changeName', newName);
  };
  const playCards = (cardIds: string[], color?: CardColor) => socket.emit('playCards', cardIds, color);
  const drawCard = () => socket.emit('drawCard');
  const skipTurn = () => socket.emit('skipTurn');
  const sayUno = () => {
    socket.emit('sayUno');
    setShowUnoButton(false);
  };
  const catchUno = (targetId: string) => socket.emit('catchUno', targetId);
  const kickPlayer = (targetId: string) => socket.emit('kickPlayer', targetId);

  const myPlayer = roomState?.players.find(p => p.id === socket.id);
  const isMyTurn = roomState?.status === 'playing' && roomState?.players[roomState.currentPlayerIndex]?.id === socket.id;
  const isGameOver = roomState?.status === 'ended';
  const showModal = !!roomState && isGameOver && !myPlayer?.hasReturnedToLobby;
  const isSpectator = myPlayer ? myPlayer.cards.length === 0 : true;

  // Power card winning restriction check (+2 and +4 cannot be played as last card)
  const canPlay = useCallback((card: Card) => {
    if (!roomState || roomState.status !== 'playing') return false;
    const topCard = roomState.discardPile[roomState.discardPile.length - 1];

    // Rule: Cannot finish the game with a +2 or +4 power card
    if (myPlayer?.cards.length === 1 && isPowerCard(card)) {
      return false;
    }

    if (roomState.stackCount > 0) {
      if (topCard.value === 'draw2' && (card.value === 'draw2' || card.value === 'draw4')) return true;
      if (topCard.value === 'draw4' && card.value === 'draw4') return true;
      return false;
    }

    return card.color === 'wild' || card.value === 'wild' || card.value === 'draw4' || card.color === topCard.color || card.value === topCard.value;
  }, [roomState, myPlayer?.cards.length]);

  // Autoplay for inactive users
  useEffect(() => {
    if (!isMyTurn || !isInactive || !roomState || roomState.status !== 'playing') return;

    const timer = setTimeout(() => {
      // Find playable cards that do NOT violate the power-card ending restriction
      const playableCards = (myPlayer?.cards || []).filter(c => canPlay(c));

      if (playableCards.length > 0) {
        const cardToPlay = playableCards[Math.floor(Math.random() * playableCards.length)];
        const isWild = cardToPlay.color === 'wild' || cardToPlay.value === 'wild' || cardToPlay.value === 'draw4';
        const chosenColor = isWild ? (['red', 'green', 'blue', 'yellow'] as CardColor[])[Math.floor(Math.random() * 4)] : undefined;

        if (myPlayer?.cards.length === 2) {
          sayUno();
        }

        playCards([cardToPlay.id], chosenColor);
      } else {
        if (roomState.hasDrawnThisTurn) {
          skipTurn();
        } else {
          drawCard();
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isMyTurn, isInactive, roomState?.currentPlayerIndex, roomState?.hasDrawnThisTurn, canPlay]);

  // UNO button logic
  useEffect(() => {
    if (myPlayer && myPlayer.cards.length === 1 && !myPlayer.hasSaidUno && roomState?.status === 'playing') {
      setShowUnoButton(true);
    } else {
      setShowUnoButton(false);
    }
  }, [myPlayer?.cards.length, myPlayer?.hasSaidUno, roomState?.status]);

  // Reset inactivity timer when it becomes my turn
  useEffect(() => {
    if (isMyTurn) {
      lastActivityTime.current = Date.now();
      setIsInactive(false);
    }
  }, [isMyTurn]);

  // Easter Egg: Rapidly click the warning icon 10 times in 3 seconds
  const handleWarningIconClick = () => {
    const now = Date.now();
    // Keep clicks occurring within the last 3000ms
    const recent = clickTimesRef.current.filter(t => now - t <= 3000);
    recent.push(now);
    clickTimesRef.current = recent;

    if (recent.length >= 10) {
      clickTimesRef.current = [];
      setEasterEggChoice(null);
      setEasterEggColor('red');
      setShowEasterEggModal(true);
    }
  };

  const handleConfirmEasterEgg = () => {
    if (!easterEggChoice) return;
    socket.emit('easterEggCard', easterEggChoice, easterEggChoice === '+2' ? easterEggColor : undefined);
    setShowEasterEggModal(false);
    setEasterEggChoice(null);
  };

  if (!roomState) {
    return (
      <div className="min-h-screen bg-red-600 flex items-center justify-center p-6 select-none">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white p-10 rounded-[2.5rem] shadow-2xl border-8 border-zinc-900 max-w-md w-full"
        >
          <div className="text-center mb-8">
            <h1 className="text-6xl font-black italic text-zinc-900 tracking-tighter mb-2">UNO!</h1>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Real-time Multiplayer</p>
          </div>

          <form onSubmit={joinRoom} className="space-y-6">
            <div>
              <label className="block text-sm font-black text-zinc-900 uppercase mb-2">Your Nickname</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter name..."
                required
                maxLength={20}
                className="w-full px-6 py-4 bg-zinc-100 border-4 border-zinc-200 rounded-2xl font-bold text-lg text-zinc-900 focus:border-red-600 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-black text-zinc-900 uppercase mb-2">Room Code (Optional)</label>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                placeholder="Enter code to join existing room..."
                className="w-full px-6 py-4 bg-zinc-100 border-4 border-zinc-200 rounded-2xl font-bold text-lg text-zinc-900 focus:border-red-600 focus:outline-none transition-all uppercase"
              />
            </div>
            <button
              type="submit"
              className="w-full py-5 bg-red-600 text-white rounded-2xl font-black text-2xl italic shadow-lg hover:bg-red-700 hover:-translate-y-1 active:translate-y-0 transition-all cursor-pointer"
            >
              {roomCodeInput.trim() ? 'JOIN ROOM' : 'CREATE ROOM'}
            </button>
          </form>

          {error && (
            <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm">
              <AlertCircle size={20} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  if (roomState.status === 'waiting' || (roomState.status === 'ended' && myPlayer?.hasReturnedToLobby)) {
    return (
      <div className="min-h-screen bg-red-600 flex items-center justify-center p-6 select-none">
        <Lobby
          roomState={roomState}
          onToggleReady={toggleReady}
          onUpdateSettings={updateSettings}
          playerId={socket.id!}
          onKickPlayer={kickPlayer}
          onChangeName={changeName}
        />
      </div>
    );
  }

  const topCard = roomState.discardPile[roomState.discardPile.length - 1];

  return (
    <div className="min-h-screen game-bg overflow-hidden relative select-none">
      {/* Autoplay Active Banner */}
      <AnimatePresence>
        {isInactive && isMyTurn && roomState?.status === 'playing' && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-black italic px-6 py-3 rounded-2xl border-4 border-white shadow-xl z-50 flex items-center gap-3 animate-pulse pointer-events-auto"
          >
            <Zap size={24} fill="currentColor" className="animate-bounce text-black shrink-0" />
            <span>BOT AUTOPLAYING (MOVE MOUSE TO RESUME)</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <div className="fixed top-4 left-4 right-4 flex justify-between items-start z-50 pointer-events-none">
        <button
          onClick={() => window.location.href = '/'}
          className="bg-red-700 border-2 border-white rounded-md px-4 py-1 flex items-center gap-2 text-white font-bold shadow-lg pointer-events-auto hover:bg-red-800 transition-colors cursor-pointer"
        >
          <Home size={16} />
          QUIT
        </button>

        {/* Easter Egg Warning Icon Trigger Button */}
        <button
          onClick={handleWarningIconClick}
          title="Game Warning System"
          className="bg-zinc-800 border-2 border-white rounded-md p-1.5 text-white shadow-lg pointer-events-auto hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer"
        >
          <AlertCircle size={20} className="text-red-500" />
        </button>
      </div>

      <Opponents
        players={roomState.players}
        currentPlayerIndex={roomState.currentPlayerIndex}
        playerId={socket.id!}
        isGameOver={isGameOver}
      />

      {/* Center Area */}
      <div className="h-screen flex items-center justify-center p-4 relative z-40 pointer-events-none">
        <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-12 pointer-events-auto">
          {/* Draw Pile */}
          <div className="relative group">
            <button
              onClick={drawCard}
              disabled={!isMyTurn || roomState.hasDrawnThisTurn}
              className={`relative z-10 transition-transform ${isMyTurn && !roomState.hasDrawnThisTurn ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
            >
              <UnoCard card={{} as any} isBack size="lg" className={isMyTurn && !roomState.hasDrawnThisTurn ? 'ring-8 ring-yellow-400 animate-pulse' : ''} />
              {roomState.stackCount > 0 && (
                <div className="absolute -top-4 -right-4 bg-red-600 text-white font-black italic px-4 py-2 rounded-full border-4 border-white shadow-xl z-20">
                  +{roomState.stackCount}
                </div>
              )}
            </button>
            <div className="absolute top-1 left-1 w-full h-full bg-zinc-900 border-4 border-white rounded-xl -z-10" />
          </div>

          {/* Discard Pile */}
          <div className="relative">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={topCard.id}
                initial={{ scale: 1.5, opacity: 0, rotate: 45 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12 }}
              >
                <UnoCard card={topCard} size="lg" disabled />
              </motion.div>
            </AnimatePresence>

            {/* Direction Indicator */}
            <div className={`absolute -inset-16 border-4 border-dashed border-white/10 rounded-full animate-[spin_10s_linear_infinite] ${roomState.direction === -1 ? 'direction-reverse' : ''}`} />
          </div>

          {/* UNO Button */}
          <div className="flex flex-col gap-2">
            <motion.button
              whileHover={isSpectator ? {} : { scale: 1.05 }}
              whileTap={isSpectator ? {} : { scale: 0.95 }}
              disabled={isSpectator}
              onClick={() => {
                if (showUnoButton) {
                  sayUno();
                } else if (roomState.missedUnoPlayers?.length > 0) {
                  const targetId = roomState.missedUnoPlayers.find(id => id !== socket.id);
                  if (targetId) catchUno(targetId);
                }
              }}
              className={cn(
                "group relative px-4 py-2 md:px-6 md:py-3 rounded-full border-2 md:border-4 border-white shadow-xl transition-all duration-300",
                isSpectator ? "bg-zinc-800 opacity-30 cursor-not-allowed" :
                showUnoButton ? "bg-yellow-400 animate-pulse cursor-pointer" :
                (roomState.missedUnoPlayers?.some(id => id !== socket.id) ? "bg-red-600 animate-bounce cursor-pointer" : "bg-zinc-800 opacity-50")
              )}
            >
              <div className="text-white font-black italic text-sm md:text-xl tracking-tighter">UNO!</div>
              {!showUnoButton && roomState.missedUnoPlayers?.filter(id => id !== socket.id).length > 0 && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-bold px-2 py-0.5 rounded whitespace-nowrap">
                  CATCH!
                </div>
              )}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="fixed bottom-64 left-1/2 -translate-x-1/2 flex gap-4 z-50 pointer-events-auto">
        {isMyTurn && roomState.hasDrawnThisTurn && (
          <button
            onClick={skipTurn}
            className="bg-red-600 text-white font-black italic px-8 py-4 rounded-2xl border-4 border-white hover:bg-red-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-xl cursor-pointer pointer-events-auto"
          >
            <SkipForward size={20} />
            SKIP TURN
          </button>
        )}
      </div>

      {/* Turn & Status Indicator */}
      <AnimatePresence>
        {isMyTurn && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-4 bg-yellow-400 text-black font-black italic px-6 py-3 rounded-2xl border-4 border-white shadow-xl z-50 flex items-center gap-3"
          >
            <Zap size={24} fill="currentColor" />
            YOUR TURN!
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn(
        "fixed bottom-48 left-1/2 -translate-x-1/2 text-white font-black italic text-xl uppercase tracking-widest transition-all duration-300",
        myPlayer && myPlayer.cards.length === 0 ? "opacity-20 grayscale scale-95" : "opacity-50"
      )}>
        {myPlayer?.name} {myPlayer && myPlayer.cards.length === 0 && "(SPECTATING)"}
      </div>

      <Hand
        cards={myPlayer?.cards || []}
        onPlayCards={playCards}
        isMyTurn={isMyTurn}
        canPlay={canPlay}
        gameMode={roomState.gameMode}
        topCard={topCard}
      />

      {/* Winner Modal (Leaderboard) */}
      {showModal && !hasDismissedWinnerModal && (
        <WinnerModal
          winner={roomState.players.find(p => p.id === roomState.winners[0]) || null}
          isGameOver={isGameOver}
          onDismiss={() => setHasDismissedWinnerModal(true)}
          onHome={() => {
            if (isGameOver) {
              socket.emit('returnToLobby');
            } else {
              window.location.href = '/';
            }
          }}
          winners={roomState.winners.map(id => roomState.players.find(p => p.id === id)!).filter(Boolean)}
          countdown={countdown}
        />
      )}

      {/* Reopen Standings Button when Leaderboard is hidden to view cards */}
      {isGameOver && hasDismissedWinnerModal && (
        <button
          onClick={() => setHasDismissedWinnerModal(false)}
          className="fixed bottom-24 right-6 bg-yellow-400 hover:bg-yellow-500 text-zinc-950 font-black italic px-5 py-3 rounded-2xl border-4 border-white shadow-2xl z-50 flex items-center gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95 pointer-events-auto"
        >
          <Trophy size={20} />
          VIEW LEADERBOARD
        </button>
      )}

      {/* Easter Egg Modal Dialog */}
      <AnimatePresence>
        {showEasterEggModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[110] flex items-center justify-center p-4 pointer-events-auto">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-zinc-900 border-4 border-amber-400 rounded-3xl p-6 md:p-8 max-w-sm w-full text-white shadow-2xl relative"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-amber-400 animate-spin" size={24} />
                  <h3 className="text-xl font-black italic uppercase tracking-wider text-amber-400">
                    Secret Easter Egg!
                  </h3>
                </div>
                <button
                  onClick={() => setShowEasterEggModal(false)}
                  className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-zinc-300 font-medium mb-6">
                You discovered the rapid-click secret! Choose a power card to add directly to your hand:
              </p>

              <div className="space-y-4 mb-6">
                {/* Option A: Give Me a +2 */}
                <div
                  onClick={() => setEasterEggChoice('+2')}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-3",
                    easterEggChoice === '+2'
                      ? "bg-amber-400/20 border-amber-400"
                      : "bg-zinc-800/80 border-zinc-700 hover:bg-zinc-800"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm uppercase tracking-wide">Option A: Give Me a +2</span>
                    {easterEggChoice === '+2' && <Check size={18} className="text-amber-400" />}
                  </div>

                  {/* Color Selector for +2 */}
                  {easterEggChoice === '+2' && (
                    <div className="pt-2 border-t border-zinc-700" onClick={(e) => e.stopPropagation()}>
                      <label className="block text-[11px] font-bold uppercase text-zinc-300 mb-2">
                        Select Color for +2:
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {(['red', 'green', 'blue', 'yellow'] as CardColor[]).map((col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setEasterEggColor(col)}
                            className={cn(
                              "py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center",
                              col === 'red' && "bg-red-600 text-white",
                              col === 'green' && "bg-green-600 text-white",
                              col === 'blue' && "bg-blue-600 text-white",
                              col === 'yellow' && "bg-yellow-400 text-black",
                              easterEggColor === col ? "border-white ring-2 ring-white scale-105" : "border-transparent opacity-70 hover:opacity-100"
                            )}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Option B: Give Me a +4 */}
                <div
                  onClick={() => setEasterEggChoice('+4')}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between",
                    easterEggChoice === '+4'
                      ? "bg-amber-400/20 border-amber-400"
                      : "bg-zinc-800/80 border-zinc-700 hover:bg-zinc-800"
                  )}
                >
                  <span className="font-black text-sm uppercase tracking-wide">Option B: Give Me a Wild +4</span>
                  {easterEggChoice === '+4' && <Check size={18} className="text-amber-400" />}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEasterEggModal(false)}
                  className="w-1/2 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!easterEggChoice}
                  onClick={handleConfirmEasterEgg}
                  className={cn(
                    "w-1/2 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer",
                    easterEggChoice
                      ? "bg-amber-400 hover:bg-amber-500 text-zinc-950 active:scale-95"
                      : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  )}
                >
                  Confirm Card
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
