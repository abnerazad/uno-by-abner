import React from 'react';
import { Player } from '../types';
import { UnoCard } from './UnoCard';
import { motion } from 'motion/react';
import { User, Bot, AlertTriangle, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';

interface OpponentsProps {
  players: Player[];
  currentPlayerIndex: number;
  playerId: string;
}

export const Opponents: React.FC<OpponentsProps> = ({ players, currentPlayerIndex, playerId }) => {
  const otherPlayers = players.filter(p => p.id !== playerId);

  return (
    <div className="fixed top-8 left-0 right-0 p-4 flex justify-center gap-4 md:gap-12 pointer-events-none">
      {otherPlayers.map((player, idx) => {
        const isTurn = players[currentPlayerIndex].id === player.id;
        
        return (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: player.cards.length === 0 ? 0.4 : 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={cn("flex flex-col items-center gap-2", player.cards.length === 0 && "grayscale")}
          >
            <div className="flex -space-x-8 mb-2">
              {player.cards.length > 0 ? (
                Array.from({ length: Math.min(player.cards.length, 6) }).map((_, i) => (
                  <UnoCard key={i} card={{} as any} isBack size="sm" className={cn("w-10 h-16 border-2 shadow-md", isTurn && "ring-4 ring-yellow-400")} />
                ))
              ) : (
                <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center border-4 border-white shadow-xl rotate-12">
                  <Trophy size={32} className="text-zinc-900" />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-white font-bold text-sm">
              <div className="flex items-center gap-1">
                {player.cards.length > 0 ? (
                  <>
                    <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rotate-45" />
                    </div>
                    <span>{player.cards.length}</span>
                  </>
                ) : (
                  <span className="text-yellow-400 font-black italic">SPECTATING</span>
                )}
              </div>
              <span className="uppercase tracking-widest opacity-80">{player.name}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
