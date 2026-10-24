import React from 'react';
import { Player } from '../types';
import { UnoCard } from './UnoCard';
import { motion } from 'motion/react';
import { Trophy } from 'lucide-react';
import { cn } from '../lib/utils';

interface OpponentsProps {
  players: Player[];
  currentPlayerIndex: number;
  playerId: string;
  isGameOver?: boolean;
}

export const Opponents: React.FC<OpponentsProps> = ({
  players,
  currentPlayerIndex,
  playerId,
  isGameOver = false,
}) => {
  const otherPlayers = players.filter(p => p.id !== playerId);

  return (
    <div className="fixed top-8 left-0 right-0 p-4 flex justify-center gap-4 md:gap-8 pointer-events-none z-30 max-w-full overflow-x-auto no-scrollbar">
      {otherPlayers.map((player, idx) => {
        const isTurn = !isGameOver && players[currentPlayerIndex]?.id === player.id;

        return (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: !isGameOver && player.cards.length === 0 ? 0.4 : 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={cn(
              "flex flex-col items-center gap-1.5 shrink-0 pointer-events-auto",
              !isGameOver && player.cards.length === 0 && "grayscale"
            )}
          >
            {/* Cards display */}
            {isGameOver ? (
              // End-of-game final hands reveal: Show complete remaining cards face up
              <div className="flex flex-col items-center">
                {player.cards.length > 0 ? (
                  <div className="flex -space-x-5 sm:-space-x-4 max-w-[280px] sm:max-w-[360px] overflow-x-auto p-1.5 no-scrollbar bg-black/40 rounded-2xl border-2 border-white/20 backdrop-blur-sm shadow-xl">
                    {player.cards.map((card, cIdx) => (
                      <div
                        key={card.id || cIdx}
                        className="transition-transform hover:-translate-y-2 hover:z-20 hover:scale-110"
                        title={`${card.color} ${card.value}`}
                      >
                        <UnoCard
                          card={card}
                          size="sm"
                          disabled
                          className="shadow-lg border border-white/40"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center border-4 border-white shadow-xl rotate-12">
                    <Trophy size={28} className="text-zinc-900" />
                  </div>
                )}
              </div>
            ) : (
              // Active match: Show card backs with count to prevent exposing private cards
              <div className="flex -space-x-8 mb-1">
                {player.cards.length > 0 ? (
                  Array.from({ length: Math.min(player.cards.length, 6) }).map((_, i) => (
                    <UnoCard
                      key={i}
                      card={{} as any}
                      isBack
                      size="sm"
                      className={cn(
                        "w-10 h-16 border-2 shadow-md transition-all",
                        isTurn && "ring-4 ring-yellow-400 scale-105"
                      )}
                    />
                  ))
                ) : (
                  <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center border-4 border-white shadow-xl rotate-12">
                    <Trophy size={28} className="text-zinc-900" />
                  </div>
                )}
              </div>
            )}

            {/* Player details */}
            <div className="flex flex-col items-center gap-0.5 text-white font-bold text-xs bg-black/50 px-3 py-1 rounded-full border border-white/10 shadow">
              <span className="uppercase tracking-wider max-w-[120px] truncate">{player.name}</span>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-300">
                {player.cards.length > 0 ? (
                  <>
                    <span className="font-black text-amber-300">{player.cards.length} {player.cards.length === 1 ? 'card' : 'cards'}</span>
                    {isTurn && <span className="text-yellow-400 font-black animate-pulse">• TURN</span>}
                  </>
                ) : (
                  <span className="text-yellow-400 font-black">FINISHED</span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
