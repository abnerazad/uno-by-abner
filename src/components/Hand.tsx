import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardColor, GameMode } from '../types';
import { UnoCard } from './UnoCard';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { AlertCircle, Play, X, Layers } from 'lucide-react';
import { isPowerCard } from '../gameEngine';

interface HandProps {
  cards: Card[];
  onPlayCards: (cardIds: string[], color?: CardColor) => void;
  isMyTurn: boolean;
  canPlay: (card: Card) => boolean;
  gameMode?: GameMode;
  topCard?: Card;
}

export const Hand: React.FC<HandProps> = ({
  cards,
  onPlayCards,
  isMyTurn,
  canPlay,
  gameMode = 'normal',
  topCard,
}) => {
  const [selectingColor, setSelectingColor] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Clear selection if turn ends or cards change
  useEffect(() => {
    if (!isMyTurn) {
      setSelectedCardIds([]);
      setSelectingColor(null);
    }
  }, [isMyTurn]);

  // Auto-clear error message after 3 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const handleCardClick = (card: Card) => {
    if (!isMyTurn) return;

    // Rule: Cannot finish with power card (+2 or +4)
    if (cards.length === 1 && isPowerCard(card)) {
      setErrorMessage("You cannot win the game by playing a +2 or +4 power card as your final card!");
      return;
    }

    // In Special Mode: multi-card mechanic for number cards
    if (gameMode === 'special') {
      const isNumberCard = card.value >= '0' && card.value <= '9';

      if (isNumberCard) {
        if (selectedCardIds.length === 0) {
          // First card must be legally playable
          if (!canPlay(card)) {
            setErrorMessage("This card does not match the current top card!");
            return;
          }
          setSelectedCardIds([card.id]);
          return;
        }

        // We already have card(s) selected
        const firstSelectedCard = cards.find(c => c.id === selectedCardIds[0]);
        if (firstSelectedCard && card.value === firstSelectedCard.value) {
          // Toggle card selection
          if (selectedCardIds.includes(card.id)) {
            setSelectedCardIds(prev => prev.filter(id => id !== card.id));
          } else {
            // Append so the last clicked card is placed last (and becomes top card of discard)
            setSelectedCardIds(prev => [...prev, card.id]);
          }
          return;
        }

        // Clicked a card with different number
        if (canPlay(card)) {
          // Switch primary selection to this legal card
          setSelectedCardIds([card.id]);
        } else {
          setErrorMessage(`In Special Mode, all cards played together must have the same number (${firstSelectedCard?.value}).`);
        }
        return;
      }

      // If clicked an action card (+2, +4, skip, reverse, wild) in Special Mode:
      // Multi-card does NOT apply to action cards. Clear number selection and handle action card.
      setSelectedCardIds([]);
      if (!canPlay(card)) return;

      if (card.color === 'wild' || card.value === 'draw4' || card.value === 'wild') {
        setSelectingColor(card.id);
      } else {
        onPlayCards([card.id]);
      }
      return;
    }

    // Normal Mode: single-card play
    if (!canPlay(card)) return;

    if (card.color === 'wild' || card.value === 'draw4' || card.value === 'wild') {
      setSelectingColor(card.id);
    } else {
      onPlayCards([card.id]);
    }
  };

  const handleColorSelect = (color: CardColor) => {
    if (selectingColor) {
      onPlayCards([selectingColor], color);
      setSelectingColor(null);
    }
  };

  const handleConfirmMultiPlay = () => {
    if (selectedCardIds.length === 0) return;
    onPlayCards(selectedCardIds);
    setSelectedCardIds([]);
  };

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const cardCount = cards.length;
  const isSm = windowWidth >= 640;
  const isMd = windowWidth >= 768;
  const W_lay = isMd ? 112 : isSm ? 80 : 64;

  let sf = 1.0;
  if (cardCount > 20) {
    sf = isMd ? 0.75 : isSm ? 0.6 : 0.5;
  } else if (cardCount > 12) {
    sf = isMd ? 0.9 : isSm ? 0.8 : 0.7;
  } else {
    sf = isMd ? 1.0 : isSm ? 0.9 : 0.85;
  }

  const W_vis = W_lay * sf;
  const containerWidth = Math.min(windowWidth - 48, 1200);
  const totalWidthWithoutOverlap = cardCount * W_vis;

  const getMarginLeft = (idx: number) => {
    if (idx === 0) return '0px';
    const baselineOverlap = 16;
    if (totalWidthWithoutOverlap <= containerWidth) {
      const S = W_vis - baselineOverlap;
      return `${S - W_lay}px`;
    }
    const S = Math.max(24, (containerWidth - W_vis) / (cardCount - 1));
    return `${S - W_lay}px`;
  };

  const scale = cardCount > 20 ? 'scale-[0.5] sm:scale-[0.6] md:scale-[0.75]' :
                cardCount > 12 ? 'scale-[0.7] sm:scale-[0.8] md:scale-[0.9]' :
                'scale-[0.85] sm:scale-[0.9] md:scale-100';

  // Last card selected in multi-play determines top discard
  const lastSelectedCard = selectedCardIds.length > 0
    ? cards.find(c => c.id === selectedCardIds[selectedCardIds.length - 1])
    : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-30">
      {/* Toast Notification (e.g. Power Card Restriction) */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-40 left-1/2 -translate-x-1/2 bg-red-600 text-white font-black italic px-6 py-3 rounded-2xl border-4 border-white shadow-2xl z-50 flex items-center gap-3 text-sm md:text-base pointer-events-auto max-w-md text-center"
          >
            <AlertCircle size={22} className="shrink-0" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Special Mode Multi-Card Action Bar */}
      <AnimatePresence>
        {gameMode === 'special' && isMyTurn && selectedCardIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-36 left-1/2 -translate-x-1/2 bg-zinc-900 border-4 border-amber-400 text-white px-6 py-3 rounded-3xl shadow-2xl z-50 flex items-center gap-4 pointer-events-auto"
          >
            <div className="flex items-center gap-2">
              <Layers size={20} className="text-amber-400 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                  Special Mode Multi-Play
                </span>
                <span className="text-sm font-bold">
                  {selectedCardIds.length} {selectedCardIds.length === 1 ? 'card' : 'cards'} selected
                  {lastSelectedCard && (
                    <span className="text-zinc-400 text-xs ml-1 font-medium">
                      (Top: {lastSelectedCard.color} {lastSelectedCard.value})
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedCardIds([])}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={handleConfirmMultiPlay}
                className="px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Play size={16} fill="currentColor" />
                PLAY {selectedCardIds.length > 1 ? `(${selectedCardIds.length})` : ''}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hand Container */}
      <div className="max-w-7xl mx-auto flex justify-center pointer-events-auto overflow-x-auto overflow-y-hidden no-scrollbar pt-12 pb-14 px-8">
        <div className="flex items-end">
          <AnimatePresence>
            {cards.map((card, idx) => {
              const isSelected = selectedCardIds.includes(card.id);
              const selectionOrder = selectedCardIds.indexOf(card.id);
              const isLastSelected = isSelected && selectionOrder === selectedCardIds.length - 1;

              // Check if playable
              const cardIsPlayable = isMyTurn && canPlay(card);
              const isRestrictedWinningPowerCard = isMyTurn && cards.length === 1 && isPowerCard(card);

              return (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ y: 100, opacity: 0 }}
                  animate={{
                    y: isSelected ? -24 : 0,
                    opacity: 1,
                  }}
                  exit={{ y: -100, opacity: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  style={{ marginLeft: getMarginLeft(idx) }}
                  className="relative group hover:z-50 hover:-translate-y-6 transition-transform"
                >
                  {/* Selection Badge in Special Mode */}
                  {isSelected && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-amber-400 text-zinc-950 font-black text-[10px] px-2 py-0.5 rounded-full border-2 border-zinc-900 shadow-lg z-30 uppercase whitespace-nowrap">
                      {isLastSelected && selectedCardIds.length > 1 ? '★ Top Discard' : `#${selectionOrder + 1}`}
                    </div>
                  )}

                  <UnoCard
                    card={card}
                    onClick={() => handleCardClick(card)}
                    disabled={!isMyTurn || (!cardIsPlayable && !isSelected)}
                    className={cn(
                      "origin-bottom transition-all duration-300",
                      scale,
                      isSelected ? 'ring-4 ring-amber-400 ring-offset-2 scale-105 z-20' :
                      cardIsPlayable && !isRestrictedWinningPowerCard ? 'ring-4 ring-yellow-400 ring-offset-2' : '',
                      isRestrictedWinningPowerCard && 'ring-2 ring-red-500 opacity-80'
                    )}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Prominent Color Selection Overlay */}
      {createPortal(
        <AnimatePresence>
          {selectingColor && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
                onClick={() => setSelectingColor(null)}
              />
              <motion.div
                initial={{ scale: 0.5, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.5, y: 20 }}
                className="bg-zinc-900 border-4 border-white p-8 rounded-[3rem] shadow-2xl text-center relative z-10"
              >
                <h3 className="text-white font-black italic text-3xl mb-8 uppercase tracking-widest">Pick a Color</h3>
                <div className="grid grid-cols-2 gap-6">
                  {(['red', 'green', 'blue', 'yellow'] as CardColor[]).map((color) => (
                    <button
                      key={color}
                      onClick={() => handleColorSelect(color)}
                      className={cn(
                        "w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-white shadow-2xl hover:scale-110 active:scale-95 transition-transform flex items-center justify-center relative group cursor-pointer",
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
                  className="mt-8 text-zinc-500 font-bold uppercase tracking-widest text-xs hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
