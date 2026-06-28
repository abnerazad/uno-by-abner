import React from 'react';
import { Card, CardColor } from '../types';
import { UnoCard } from './UnoCard';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface HandProps {
  cards: Card[];
  onPlayCard: (cardId: string, color?: CardColor) => void;
  isMyTurn: boolean;
  canPlay: (card: Card) => boolean;
}

export const Hand: React.FC<HandProps> = ({ cards, onPlayCard, isMyTurn, canPlay }) => {
  const [selectingColor, setSelectingColor] = React.useState<string | null>(null);

  const handleCardClick = (card: Card) => {
    if (!isMyTurn || !canPlay(card)) return;

    if (card.color === 'wild' || card.value === 'draw4' || card.value === 'wild') {
      setSelectingColor(card.id);
    } else {
      onPlayCard(card.id);
    }
  };

  const handleColorSelect = (color: CardColor) => {
    if (selectingColor) {
      onPlayCard(selectingColor, color);
      setSelectingColor(null);
    }
  };

  // Dynamically adjust gap and scale based on card count to fit screen without scroll
  const cardCount = cards.length;
  
  // More granular overlap tiers
  const overlap = cardCount > 20 ? `-space-x-16 sm:-space-x-20 md:-space-x-28` :
                 cardCount > 15 ? `-space-x-14 sm:-space-x-18 md:-space-x-24` :
                 cardCount > 10 ? `-space-x-12 sm:-space-x-16 md:-space-x-20` :
                 cardCount > 5  ? `-space-x-8 sm:-space-x-12 md:-space-x-16` :
                 `-space-x-4 sm:-space-x-8 md:-space-x-12`;
  
  // More granular scaling tiers
  const scale = cardCount > 20 ? 'scale-[0.5] sm:scale-[0.6] md:scale-[0.75]' :
                cardCount > 12 ? 'scale-[0.7] sm:scale-[0.8] md:scale-[0.9]' :
                'scale-[0.85] sm:scale-[0.9] md:scale-100';

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-40">
      <div className="max-w-7xl mx-auto flex justify-center pointer-events-auto">
        <div className={cn("flex transition-all duration-300 pb-12 items-end", overlap)}>
          <AnimatePresence>
            {cards.map((card, idx) => (
              <motion.div
                key={card.id}
                layout
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -100, opacity: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="relative group hover:z-50 hover:-translate-y-8 transition-transform"
              >
                <UnoCard
                  card={card}
                  onClick={() => handleCardClick(card)}
                  disabled={!isMyTurn || !canPlay(card)}
                  className={cn(
                    "origin-bottom transition-all duration-300",
                    scale,
                    isMyTurn && canPlay(card) ? 'ring-4 ring-yellow-400 ring-offset-2' : ''
                  )}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Prominent Color Selection Overlay */}
      <AnimatePresence>
        {selectingColor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-[100] flex items-center justify-center pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.5, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900 border-4 border-white p-8 rounded-[3rem] shadow-2xl text-center"
            >
              <h3 className="text-white font-black italic text-3xl mb-8 uppercase tracking-widest">Pick a Color</h3>
              <div className="grid grid-cols-2 gap-6">
                {(['red', 'green', 'blue', 'yellow'] as CardColor[]).map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorSelect(color)}
                    className={cn(
                      "w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-white shadow-2xl hover:scale-110 active:scale-95 transition-transform flex items-center justify-center relative group",
                      color === 'red' ? 'bg-red-600' :
                      color === 'green' ? 'bg-green-600' :
                      color === 'blue' ? 'bg-blue-600' : 'bg-yellow-400'
                    )}
                  >
                     <div className="absolute inset-2 border-2 border-white/20 rounded-2xl group-hover:border-white/40 transition-colors" />
                     <span className="text-white font-black italic text-xs uppercase opacity-40 group-hover:opacity-100 transition-opacity">
                       {color}
                     </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSelectingColor(null)}
                className="mt-8 text-zinc-500 font-bold uppercase tracking-widest text-xs hover:text-white transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
