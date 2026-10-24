import React from 'react';
import { Player } from '../types';
import { Trophy, Home, Eye, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WinnerModalProps {
  winner: Player | null;
  isGameOver: boolean;
  onDismiss: () => void;
  onHome: () => void;
  winners: Player[];
  countdown: number | null;
}

export const WinnerModal: React.FC<WinnerModalProps> = ({
  winner,
  isGameOver,
  onDismiss,
  onHome,
  winners,
  countdown,
}) => {
  if (!isGameOver) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6 pointer-events-auto cursor-pointer"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.5, opacity: 0, rotate: 10 }}
          onClick={(e) => e.stopPropagation()} // Clicks inside do not dismiss the leaderboard
          className="bg-white rounded-3xl p-8 md:p-10 max-w-md w-full text-center border-8 border-yellow-400 shadow-2xl relative overflow-hidden cursor-default"
        >
          {/* Close / Dismiss button in top corner */}
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 border-2 border-zinc-300 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer z-20"
            title="Hide leaderboard to view table cards"
          >
            <X size={18} />
          </button>

          {/* Confetti-like background elements */}
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            <motion.div
              animate={{ y: [0, 100], x: [0, 20], opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute top-4 left-1/4 w-4 h-4 bg-red-600 rounded-full"
            />
            <motion.div
              animate={{ y: [0, 120], x: [0, -30], opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 2.5, delay: 0.5 }}
              className="absolute top-10 right-1/4 w-3 h-3 bg-blue-600 rounded-full"
            />
            <motion.div
              animate={{ y: [0, 150], x: [0, 10], opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 3, delay: 1 }}
              className="absolute top-20 left-1/2 w-5 h-5 bg-green-600 rounded-full"
            />
          </div>

          <div className="relative z-10">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="inline-block mb-4 text-yellow-500"
            >
              <Trophy size={80} strokeWidth={1.5} />
            </motion.div>

            <h2 className="text-3xl md:text-4xl font-black italic text-zinc-900 mb-1 uppercase tracking-tighter">
              GAME OVER
            </h2>

            <div className="mb-6">
              <p className="text-sm font-bold text-zinc-500 mb-3 uppercase tracking-widest">Final Standings</p>
              <div className="space-y-2 mb-4 max-h-[220px] overflow-y-auto pr-1">
                {winners.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between bg-zinc-100 p-3 rounded-xl border-2 border-zinc-200">
                    <div className="flex items-center gap-3">
                      <span className="font-black text-red-600 w-6">#{i + 1}</span>
                      <span className="font-bold text-zinc-900 text-sm truncate max-w-[180px]">{p.name}</span>
                    </div>
                    {i === 0 && <Trophy size={16} className="text-yellow-500 shrink-0" />}
                  </div>
                ))}
              </div>
              {countdown !== null && (
                <div className="text-zinc-500 font-bold uppercase tracking-widest text-xs animate-pulse">
                  Returning to lobby in <span className="text-red-600 font-black">{countdown}s</span>...
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={onDismiss}
                className="w-full py-3 bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-2xl font-black text-base italic transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border-2 border-amber-600 active:scale-95"
              >
                <Eye size={18} />
                VIEW ALL PLAYERS' CARDS
              </button>

              <button
                onClick={onHome}
                className="w-full py-3 bg-red-600 text-white rounded-2xl font-black text-base italic hover:bg-red-700 hover:scale-[1.02] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Home size={18} />
                RETURN TO LOBBY
              </button>
            </div>

            <p className="text-[11px] text-zinc-400 mt-3 font-semibold">
              Click anywhere outside or "View All Players' Cards" to reveal remaining hands.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
