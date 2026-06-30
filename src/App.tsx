/// <reference types="vite/client" />
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { nanoid } from 'nanoid';
import { GameState, Card, CardColor, Player } from './types';
import { Lobby } from './components/Lobby';
import { Hand } from './components/Hand';
import { Opponents } from './components/Opponents';
import { UnoCard } from './components/UnoCard';
import { WinnerModal } from './components/WinnerModal';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ArrowRight, ArrowLeft, Zap, PlusCircle, SkipForward, Home, Trophy } from 'lucide-react';
import { cn } from './lib/utils';

const socketUrl = import.meta.env.VITE_WS_URL || window.location.origin;
const socket: Socket = io(socketUrl, {
  autoConnect: false,
});

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState(() => new URLSearchParams(window.location.search).get('room') || '');
  const [name, setName] = useState(() => localStorage.getItem('uno_nickname') || '');
  const [roomState, setRoomState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unoTimer, setUnoTimer] = useState<number | null>(null);
  const [showUnoButton, setShowUnoButton] = useState(false);
  const [hasDismissedWinnerModal, setHasDismissedWinnerModal] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isInactive, setIsInactive] = useState(false);
  const lastActivityTime = useRef(Date.now());

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rId = params.get('room');
    if (rId) setRoomId(rId);

    socket.connect();

    socket.on('roomState', (state: GameState) => {
      // If we are not in the room players list (e.g. we were kicked), reset state
      const isInRoom = state.players.some(p => p.id === socket.id);
      if (!isInRoom) {
        setRoomState(null);
        setRoomId(null);
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
    socket.emit('joinRoom', finalRoomId, name);
  };

  const toggleReady = () => socket.emit('toggleReady');
  const updateSettings = (settings: { startingCardCount: number }) => socket.emit('updateSettings', settings);
  const playCard = (cardId: string, color?: CardColor) => socket.emit('playCard', cardId, color);
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
  const isWinner = myPlayer ? !!roomState?.winners.includes(myPlayer.id) : false;
  const myRank = myPlayer ? roomState?.winners.indexOf(myPlayer.id) + 1 : 0;
  const isGameOver = roomState?.status === 'ended';
  const showModal = !!roomState && isGameOver && !myPlayer?.hasReturnedToLobby;
  const isSpectator = myPlayer ? myPlayer.cards.length === 0 : true;

  const canPlay = useCallback((card: Card) => {
    if (!roomState || roomState.status !== 'playing') return false;
    const topCard = roomState.discardPile[roomState.discardPile.length - 1];
    
    if (roomState.stackCount > 0) {
      if (topCard.value === 'draw2' && (card.value === 'draw2' || card.value === 'draw4')) return true;
      if (topCard.value === 'draw4' && card.value === 'draw4') return true;
      return false;
    }

    return card.color === 'wild' || card.value === 'wild' || card.value === 'draw4' || card.color === topCard.color || card.value === topCard.value;
  }, [roomState]);

  useEffect(() => {
    if (!isMyTurn || !isInactive || !roomState || roomState.status !== 'playing') return;

    const timer = setTimeout(() => {
      const playableCards = myPlayer?.cards.filter(c => canPlay(c)) || [];
      
      if (playableCards.length > 0) {
        const cardToPlay = playableCards[Math.floor(Math.random() * playableCards.length)];
        const isWild = cardToPlay.color === 'wild' || cardToPlay.value === 'wild' || cardToPlay.value === 'draw4';
        const chosenColor = isWild ? (['red', 'green', 'blue', 'yellow'] as CardColor[])[Math.floor(Math.random() * 4)] : undefined;
        
        if (myPlayer?.cards.length === 2) {
          sayUno();
        }
        
        playCard(cardToPlay.id, chosenColor);
      } else {
        if (roomState.hasDrawnThisTurn) {
          skipTurn();
        } else {
          drawCard();
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isMyTurn, isInactive, roomState?.currentPlayerIndex, roomState?.hasDrawnThisTurn]);

  // UNO button logic
  useEffect(() => {
    if (myPlayer && myPlayer.cards.length === 1 && !myPlayer.hasSaidUno && roomState?.status === 'playing') {
      setShowUnoButton(true);
    } else {
      setShowUnoButton(false);
    }
  }, [myPlayer?.cards.length, myPlayer?.hasSaidUno, roomState?.status]);

  if (!roomState) {
    return (
      <div className="min-h-screen bg-red-600 flex items-center justify-center p-6">
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
            <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl flex items-center gap-3 text-red-600 font-bold">
              <AlertCircle size={20} />
              {error}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  if (roomState.status === 'waiting' || (roomState.status === 'ended' && myPlayer?.hasReturnedToLobby)) {
    return (
      <div className="min-h-screen bg-red-600 flex items-center justify-center p-6">
        <Lobby
          roomState={roomState}
          onToggleReady={toggleReady}
          onUpdateSettings={updateSettings}
          playerId={socket.id!}
          onKickPlayer={kickPlayer}
        />
      </div>
    );
  }

  const topCard = roomState.discardPile[roomState.discardPile.length - 1];

  return (
    <div className="min-h-screen game-bg overflow-hidden relative select-none">
      {/* Autoplay Active Banner */}
      <AnimatePresence>
        {isInactive && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-black italic px-6 py-3 rounded-2xl border-4 border-white shadow-xl z-50 flex items-center gap-3 animate-pulse pointer-events-auto"
          >
            <Zap size={24} fill="currentColor" className="animate-bounce text-black shrink-0" />
            <span>
              {isMyTurn 
                ? "BOT AUTOPLAYING (MOVE MOUSE TO RESUME)" 
                : "INACTIVE - BOT WILL PLAY FOR YOU ON YOUR TURN (MOVE MOUSE TO RESUME)"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <div className="fixed top-4 left-4 right-4 flex justify-between items-start z-50 pointer-events-none">
        <button
          onClick={() => window.location.href = '/'}
          className="bg-red-700 border-2 border-white rounded-md px-4 py-1 flex items-center gap-2 text-white font-bold shadow-lg pointer-events-auto hover:bg-red-800 transition-colors"
        >
          <Home size={16} />
          QUIT
        </button>
        <button className="bg-zinc-800 border-2 border-white rounded-md p-1 text-white shadow-lg pointer-events-auto">
          <AlertCircle size={20} className="text-red-500" />
        </button>
      </div>

      <Opponents
        players={roomState.players}
        currentPlayerIndex={roomState.currentPlayerIndex}
        playerId={socket.id!}
      />

      {/* Center Area */}
      <div className="h-screen flex items-center justify-center p-4">
        <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-12">
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
            {/* Pile depth effect */}
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

          {/* UNO Button - Always Visible near deck */}
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
                showUnoButton ? "bg-yellow-400 animate-pulse" : 
                (roomState.missedUnoPlayers?.some(id => id !== socket.id) ? "bg-red-600 animate-bounce" : "bg-zinc-800 opacity-50")
              )}
            >
              <div className="text-white font-black italic text-sm md:text-xl tracking-tighter">UNO!</div>
              
              {/* Tooltip-like indicator for catching */}
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

      {/* Turn & Spectator Indicator Overlay */}
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
        {myPlayer && myPlayer.cards.length === 0 && !isGameOver && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-4 bg-zinc-900 text-white font-black italic px-6 py-3 rounded-2xl border-4 border-white shadow-xl z-50 flex items-center gap-3"
          >
            <Trophy size={24} className="text-yellow-400 animate-bounce" />
            {myRank > 0 ? `YOU FINISHED #${myRank}! SPECTATING...` : 'SPECTATING...'}
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
        onPlayCard={playCard}
        isMyTurn={isMyTurn}
        canPlay={canPlay}
      />

      {showModal && (
        <WinnerModal
          winner={roomState.players.find(p => p.id === roomState.winners[0]) || null}
          isGameOver={isGameOver}
          onWatch={() => setHasDismissedWinnerModal(true)}
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
    </div>
  );
}
