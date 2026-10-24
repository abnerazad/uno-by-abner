import React, { useState } from 'react';
import { Player, GameState, GameMode } from '../types';
import { Users, CheckCircle, Circle, Play, Settings, Copy, Check, Edit3, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LobbyProps {
  roomState: GameState;
  onToggleReady: () => void;
  onUpdateSettings: (settings: { startingCardCount?: number; gameMode?: GameMode }) => void;
  playerId: string;
  onKickPlayer: (targetId: string) => void;
  onChangeName: (newName: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomState,
  onToggleReady,
  onUpdateSettings,
  playerId,
  onKickPlayer,
  onChangeName,
}) => {
  const [copied, setCopied] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const myPlayer = roomState.players.find(p => p.id === playerId);
  const [newNameInput, setNewNameInput] = useState(myPlayer?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);

  const isAdmin = roomState.players[0]?.id === playerId;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenNameModal = () => {
    setNewNameInput(myPlayer?.name || '');
    setNameError(null);
    setShowNameModal(true);
  };

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newNameInput.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty');
      return;
    }
    if (trimmed.length > 20) {
      setNameError('Name must be 20 characters or less');
      return;
    }
    const isTaken = roomState.players.some(
      p => p.id !== playerId && p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isTaken) {
      setNameError('This name is already used by another player');
      return;
    }

    onChangeName(trimmed);
    setShowNameModal(false);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-3xl shadow-2xl border-4 border-zinc-900 relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-black italic text-zinc-900 tracking-tight">UNO LOBBY</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-800">
              {roomState.gameMode === 'special' ? '⚡ Special Mode' : '🃏 Normal Mode'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-zinc-100 px-3 py-1.5 rounded-full text-sm font-black text-black border border-zinc-200">
          <Users size={16} />
          {roomState.players.length}/16
        </div>
      </div>

      {/* Change Name Quick Action */}
      <div className="mb-6 p-3 bg-red-50 border-2 border-red-200 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          <div className="w-8 h-8 rounded-full bg-red-600 text-white font-black flex items-center justify-center shrink-0 text-sm">
            {myPlayer?.name?.[0]?.toUpperCase() || 'P'}
          </div>
          <div className="truncate">
            <span className="text-xs text-red-500 font-bold uppercase tracking-wider block">Playing as</span>
            <span className="font-black text-zinc-900 text-sm truncate block">{myPlayer?.name || 'You'}</span>
          </div>
        </div>
        <button
          onClick={handleOpenNameModal}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95 cursor-pointer shrink-0"
        >
          <Edit3 size={13} />
          Change Name
        </button>
      </div>

      {/* Players List */}
      <div className="space-y-3 mb-6 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin">
        {roomState.players.map((player, idx) => (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            key={player.id}
            className="flex items-center justify-between p-3.5 bg-zinc-50 rounded-2xl border-2 border-zinc-200"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-red-600 rounded-full flex items-center justify-center text-white font-bold shrink-0 text-sm">
                {player.name[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-zinc-900 text-sm truncate">
                  {player.name} {player.id === playerId && <span className="text-red-600 font-black">(You)</span>}
                </p>
                {idx === 0 && <p className="text-[10px] text-red-600 font-black uppercase tracking-wider">Host</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && player.id !== playerId && (
                <button
                  onClick={() => onKickPlayer(player.id)}
                  className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors cursor-pointer border border-red-200"
                >
                  KICK
                </button>
              )}
              {roomState.status === 'ended' ? (
                player.hasReturnedToLobby ? (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-black uppercase tracking-wider">
                    Lobby
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-zinc-100 text-zinc-500 rounded-lg text-xs font-black uppercase tracking-wider animate-pulse">
                    Standings
                  </span>
                )
              ) : player.isReady ? (
                <CheckCircle className="text-green-500 shrink-0" size={20} />
              ) : (
                <Circle className="text-zinc-300 shrink-0" size={20} />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Game Mode & Host Settings */}
      <div className="mb-6 p-4 bg-zinc-100 rounded-2xl border-2 border-zinc-200 space-y-4">
        <div className="flex items-center gap-2 text-zinc-900 font-bold text-sm">
          <Settings size={16} />
          GAME CONFIGURATION
        </div>

        {/* Game Mode Selector */}
        <div>
          <label className="block text-xs font-black text-zinc-600 uppercase mb-2">Game Mode</label>
          {isAdmin ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ gameMode: 'normal' })}
                className={`py-2 px-3 rounded-xl font-black text-xs uppercase tracking-wider border-2 transition-all cursor-pointer ${
                  roomState.gameMode === 'normal'
                    ? 'bg-zinc-900 text-white border-zinc-900 shadow-md'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                Normal Mode
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ gameMode: 'special' })}
                className={`py-2 px-3 rounded-xl font-black text-xs uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  roomState.gameMode === 'special'
                    ? 'bg-amber-500 text-black border-amber-600 shadow-md'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                <Sparkles size={13} />
                Special Mode
              </button>
            </div>
          ) : (
            <div className="p-3 bg-white border-2 border-zinc-200 rounded-xl">
              <div className="font-black text-zinc-900 text-sm">
                {roomState.gameMode === 'special' ? '⚡ Special Mode' : '🃏 Normal Mode'}
              </div>
            </div>
          )}
          <p className="text-[11px] text-zinc-500 mt-1.5 leading-tight font-medium">
            {roomState.gameMode === 'special'
              ? 'Multi-Card Play: Play multiple matching number cards in a single turn.'
              : 'Classic UNO: Traditional turn-by-turn card rules.'}
          </p>
        </div>

        {/* Starting Card Count */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
          <label className="text-xs font-black text-zinc-600 uppercase">Starting Cards:</label>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdateSettings({ startingCardCount: roomState.startingCardCount - 1 })}
                className="w-7 h-7 bg-white border-2 border-zinc-900 text-black rounded-lg flex items-center justify-center font-black hover:bg-zinc-100 transition-colors cursor-pointer text-sm"
              >
                -
              </button>
              <span className="font-black text-lg w-6 text-center text-zinc-900">{roomState.startingCardCount}</span>
              <button
                onClick={() => onUpdateSettings({ startingCardCount: roomState.startingCardCount + 1 })}
                className="w-7 h-7 bg-white border-2 border-zinc-900 text-black rounded-lg flex items-center justify-center font-black hover:bg-zinc-100 transition-colors cursor-pointer text-sm"
              >
                +
              </button>
            </div>
          ) : (
            <span className="font-black text-base text-zinc-900">{roomState.startingCardCount} cards</span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={onToggleReady}
          disabled={roomState.status === 'ended' || (roomState.players.find(p => p.id === playerId)?.isReady && roomState.status === 'waiting')}
          className={`w-full py-4 rounded-2xl font-black text-xl italic transition-all flex items-center justify-center gap-2 cursor-pointer ${
            roomState.status === 'ended'
              ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed'
              : roomState.players.find(p => p.id === playerId)?.isReady
              ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02] shadow-lg active:scale-95'
          }`}
        >
          <Play size={20} fill="currentColor" />
          {roomState.status === 'ended'
            ? 'WAITING FOR PLAYERS...'
            : roomState.players.find(p => p.id === playerId)?.isReady
            ? 'READY!'
            : 'READY UP'}
        </button>

        <button
          onClick={copyLink}
          className="w-full py-3 bg-white border-2 border-zinc-900 rounded-2xl font-bold text-zinc-900 hover:bg-zinc-50 flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          {copied ? 'COPIED!' : 'INVITE FRIENDS'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-zinc-400 font-bold uppercase tracking-widest">
        Wait for all players to be ready
      </p>

      {/* Change Name Modal Dialog */}
      <AnimatePresence>
        {showNameModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl border-4 border-zinc-900 p-6 max-w-sm w-full shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-2xl font-black italic text-zinc-900 uppercase tracking-tight mb-2">
                Change Nickname
              </h3>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-4">
                Update your name visible to other players
              </p>

              <form onSubmit={handleSaveName} className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={newNameInput}
                    onChange={e => {
                      setNewNameInput(e.target.value);
                      setNameError(null);
                    }}
                    maxLength={20}
                    placeholder="Enter new nickname..."
                    autoFocus
                    className="w-full px-4 py-3 bg-zinc-100 border-2 border-zinc-300 rounded-xl font-bold text-base text-zinc-900 focus:border-red-600 focus:outline-none transition-all"
                  />
                  {nameError && (
                    <p className="text-xs text-red-600 font-bold mt-1.5">{nameError}</p>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNameModal(false)}
                    className="w-1/2 py-2.5 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded-xl font-bold text-sm uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-2.5 bg-red-600 text-white hover:bg-red-700 rounded-xl font-black text-sm uppercase tracking-wider transition-all shadow-md cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
