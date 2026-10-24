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
  playerName?: string;
  isSpectator?: boolean;
}

export const Hand: React.FC<HandProps> = ({
  cards,
  onPlayCards,
  isMyTurn,
  canPlay,
  gameMode = 'normal',
  topCard,
  playerName,
  isSpectator,
}) => {
  const [selectingColor, setSelectingColor] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear selection if turn ends or cards change
  useEffect(() => {
    if (!isMyTurn) {
      setSelectedCardIds([]);
      setSelectingColor(null);
      setIsSubmitting(false);
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
    if (!isMyTurn || isSubmitting) return;

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
          // Rule 1: First card must be legally playable on the current discard pile
          if (!canPlay(card)) {
            setErrorMessage("This card does not match the current top card!");
            return;
          }

          // Check whether the player holds any other number cards with the same number (exclude currently clicked card)
          const otherMatchingCards = cards.filter(
            c => c.id !== card.id && c.value >= '0' && c.value <= '9' && c.value === card.value
          );

          if (otherMatchingCards.length === 0) {
            // Automatically play the selected card immediately using existing card-play mechanism!
            setIsSubmitting(true);
            onPlayCards([card.id]);
            setTimeout(() => setIsSubmitting(false), 500);
            return;
          }

          // If the player has 1 or more other cards with the same number, keep existing multi-card selection flow
          setSelectedCardIds([card.id]);
          return;
        }

        // We already have card(s) selected
        const firstSelectedCard = cards.find(c => c.id === selectedCardIds[0]);
        const selectedValue = firstSelectedCard?.value;

        // If clicked a card with the same number (any color):
        if (card.value === selectedValue) {
          if (selectedCardIds.includes(card.id)) {
            // Deselect card
            setSelectedCardIds(prev => prev.filter(id => id !== card.id));
          } else {
            // Append card so the last clicked card becomes the top card of discard
            setSelectedCardIds(prev => [...prev, card.id]);
          }
          return;
        }

        // Clicked a card with different number
        if (canPlay(card)) {
          // Switch primary selection to this legally playable card
          // Check if other matching cards exist for this new number:
          const otherMatchingCards = cards.filter(
            c => c.id !== card.id && c.value >= '0' && c.value <= '9' && c.value === card.value
          );

          if (otherMatchingCards.length === 0) {
            // Auto-play this single card!
            setIsSubmitting(true);
            setSelectedCardIds([]);
            onPlayCards([card.id]);
            setTimeout(() => setIsSubmitting(false), 500);
            return;
          }

          setSelectedCardIds([card.id]);
        } else {
          setErrorMessage(`In Special Mode, all cards played together must have the same number (${selectedValue}).`);
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
    if (selectedCardIds.length === 0 || isSubmitting) return;
    if (!hasLegalTopMatch) {
      setErrorMessage("Your selection must include at least one card matching the top card!");
      return;
    }
    setIsSubmitting(true);
    onPlayCards(selectedCardIds);
    setSelectedCardIds([]);
    setTimeout(() => setIsSubmitting(false), 500);
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

  const firstSelectedCard = selectedCardIds.length > 0
    ? cards.find(c => c.id === selectedCardIds[0])
    : null;

  const selectedNumber = firstSelectedCard?.value;

  const hasLegalTopMatch = selectedCardIds.some(id => {
    const c = cards.find(card => card.id === id);
    return c && canPlay(c);
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent pointer-events-none z-30 flex flex-col items-center justify-end pb-2 sm:pb-3">
      {/* Toast Notification (e.g. Power Card Restriction or Special Mode guidance) */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="mb-3 bg-red-600 text-white font-black italic px-6 py-2.5 rounded-2xl border-4 border-white shadow-2xl z-50 flex items-center gap-3 text-xs sm:text-sm md:text-base pointer-events-auto max-w-md text-center"
          >
            <AlertCircle size={20} className="shrink-0" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player's Own Name (Always positioned cleanly above player hand card row) */}
      {playerName && (
        <div
          className={cn(
            "text-white font-black italic text-base sm:text-lg md:text-xl uppercase tracking-widest transition-all duration-300 pointer-events-none select-none mb-1 sm:mb-2",
            isSpectator ? "opacity-20 grayscale scale-95" : "opacity-50"
          )}
        >
          {playerName} {isSpectator && "(SPECTATING)"}
        </div>
      )}

      {/* Special Mode Multi-Card Play Button Bar (Dedicated area ABOVE the Hand Card Row) */}
      <AnimatePresence>
        {gameMode === 'special' && isMyTurn && selectedCardIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="w-full flex justify-center px-4 mb-1 sm:mb-2 pointer-events-auto"
          >
            <div className="bg-zinc-900 border-4 border-amber-400 text-white px-4 py-2 sm:px-6 sm:py-2.5 rounded-2xl sm:rounded-3xl shadow-[0_12px_36px_rgba(0,0,0,0.85)] z-40 flex items-center gap-3 sm:gap-4 max-w-[96vw]">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-amber-400 animate-pulse shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] sm:text-xs font-black uppercase text-amber-400 tracking-wider">
                    Special Mode Multi-Play
                  </span>
                  <span className="text-xs sm:text-sm font-bold flex items-center gap-1">
                    <span>{selectedCardIds.length} {selectedCardIds.length === 1 ? 'card' : 'cards'} selected</span>
                    {lastSelectedCard && (
                      <span className="text-zinc-400 text-xs font-medium hidden sm:inline">
                        (Top: {lastSelectedCard.color} {lastSelectedCard.value})
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedCardIds([])}
                  className="px-3 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={!hasLegalTopMatch || isSubmitting}
                  onClick={handleConfirmMultiPlay}
                  title={!hasLegalTopMatch ? "Your selection must include at least one card matching the top card" : undefined}
                  className={cn(
                    "px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg cursor-pointer",
                    hasLegalTopMatch && !isSubmitting
                      ? "bg-amber-400 hover:bg-amber-500 text-zinc-950 hover:scale-105 active:scale-95"
                      : "bg-zinc-700 text-zinc-400 cursor-not-allowed opacity-60"
                  )}
                >
                  <Play size={16} fill="currentColor" />
                  {selectedCardIds.length > 1 ? `PLAY (${selectedCardIds.length}) CARDS` : 'PLAY CARD'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hand Container (Cards Row, completely below the Play Button container) */}
      <div className="max-w-7xl w-full mx-auto flex justify-center pointer-events-auto overflow-x-auto overflow-y-visible no-scrollbar pt-8 pb-3 sm:pb-4 px-4 sm:px-8">
        <div className="flex items-end">
          <AnimatePresence>
            {cards.map((card, idx) => {
              const isSelected = selectedCardIds.includes(card.id);
              const selectionOrder = selectedCardIds.indexOf(card.id);
              const isLastSelected = isSelected && selectionOrder === selectedCardIds.length - 1;

              // Check if playable
              const cardIsPlayable = isMyTurn && canPlay(card);
              const isRestrictedWinningPowerCard = isMyTurn && cards.length === 1 && isPowerCard(card);
              const isNumberCard = card.value >= '0' && card.value <= '9';
              const isMatchingSelectedNumber = Boolean(
                gameMode === 'special' &&
                selectedNumber &&
                isNumberCard &&
                card.value === selectedNumber
              );

              // Clickability
              let isDisabled = !isMyTurn;
              if (isMyTurn) {
                if (gameMode === 'special') {
                  if (selectedCardIds.length === 0) {
                    isDisabled = !cardIsPlayable || isRestrictedWinningPowerCard;
                  } else {
                    // During multi-card selection:
                    // Enabled if already selected, or has matching number (regardless of color), or can be played on top
                    isDisabled = !isSelected && !isMatchingSelectedNumber && !cardIsPlayable;
                  }
                } else {
                  isDisabled = !cardIsPlayable || isRestrictedWinningPowerCard;
                }
              }

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
                    disabled={isDisabled}
                    className={cn(
                      "origin-bottom transition-all duration-300",
                      scale,
                      isSelected
                        ? 'ring-4 ring-amber-400 ring-offset-2 scale-105 z-20'
                        : isMatchingSelectedNumber && !isDisabled
                        ? 'ring-4 ring-amber-300 ring-offset-2 hover:scale-105 cursor-pointer shadow-[0_0_15px_rgba(251,191,36,0.5)]'
                        : cardIsPlayable && !isRestrictedWinningPowerCard
                        ? 'ring-4 ring-yellow-400 ring-offset-2'
                        : '',
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
