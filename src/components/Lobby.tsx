import React, { useState } from 'react';
import { Player, GameState } from '../types';
import { Users, CheckCircle, Circle, Play, Settings, Copy, Check } from 'lucide-react';
import { motion } from 'motion/react';

interface LobbyProps {
  roomState: GameState;
  onToggleReady: () => void;
  onUpdateSettings: (settings: { startingCardCount: number }) => void;
  playerId: string;
  onKickPlayer: (targetId: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomState,
  onToggleReady,
  onUpdateSettings,
  playerId,
  onKickPlayer,
}) => {
  const [copied, setCopied] = useState(false);
  const isAdmin = roomState.players[0]?.id === playerId;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-3xl shadow-2xl border-4 border-zinc-900">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-black italic text-zinc-900">UNO LOBBY</h2>
        <div className="flex items-center gap-2 bg-zinc-100 px-3 py-1 rounded-full text-sm font-black text-black">
          <Users size={16} />
          {roomState.players.length}/16
        </div>
      </div>

      <div className="space-y-4 mb-8 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
        {roomState.players.map((player, idx) => (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            key={player.id}
            className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border-2 border-zinc-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-bold">
                {player.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-zinc-900">
                  {player.name} {player.id === playerId && "(You)"}
                </p>
                {idx === 0 && <p className="text-xs text-red-600 font-bold uppercase tracking-wider">Admin</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && player.id !== playerId && (
                <button
                  onClick={() => onKickPlayer(player.id)}
                  className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors cursor-pointer border border-red-200"
                >
                  KICK
                </button>
              )}
              {player.isReady ? (
                <CheckCircle className="text-green-500 shrink-0" />
              ) : (
                <Circle className="text-zinc-300 shrink-0" />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {isAdmin && (
        <div className="mb-8 p-4 bg-zinc-100 rounded-2xl border-2 border-zinc-200">
          <div className="flex items-center gap-2 mb-4 text-zinc-900 font-bold">
            <Settings size={18} />
            GAME SETTINGS
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-zinc-600">Starting Cards:</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onUpdateSettings({ startingCardCount: roomState.startingCardCount - 1 })}
                className="w-8 h-8 bg-white border-2 border-zinc-900 text-black rounded-lg flex items-center justify-center font-black hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                -
              </button>
              <span className="font-black text-xl w-8 text-center text-zinc-900">{roomState.startingCardCount}</span>
              <button
                onClick={() => onUpdateSettings({ startingCardCount: roomState.startingCardCount + 1 })}
                className="w-8 h-8 bg-white border-2 border-zinc-900 text-black rounded-lg flex items-center justify-center font-black hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={onToggleReady}
          className={`w-full py-4 rounded-2xl font-black text-xl italic transition-all flex items-center justify-center gap-2 ${
            roomState.players.find(p => p.id === playerId)?.isReady
              ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02] shadow-lg active:scale-95'
          }`}
        >
          <Play size={20} fill="currentColor" />
          {roomState.players.find(p => p.id === playerId)?.isReady ? 'READY!' : 'READY UP'}
        </button>

        <button
          onClick={copyLink}
          className="w-full py-3 bg-white border-2 border-zinc-900 rounded-2xl font-bold text-zinc-900 hover:bg-zinc-50 flex items-center justify-center gap-2 transition-all"
        >
          {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          {copied ? 'COPIED!' : 'INVITE FRIENDS'}
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-400 font-bold uppercase tracking-widest">
        Wait for all players to be ready
      </p>
    </div>
  );
};
