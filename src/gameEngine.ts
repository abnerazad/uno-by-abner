import { nanoid } from 'nanoid';
import type { Card, CardColor, CardValue, GameState, Player, GameMode } from './types.js';

export function createDeck(): Card[] {
  const colors: CardColor[] = ['red', 'green', 'blue', 'yellow'];
  const values: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
  const deck: Card[] = [];

  for (const color of colors) {
    for (const value of values) {
      // Two of each card except 0
      deck.push({ id: nanoid(), color, value });
      if (value !== '0') {
        deck.push({ id: nanoid(), color, value });
      }
    }
  }

  // Wild cards
  for (let i = 0; i < 4; i++) {
    deck.push({ id: nanoid(), color: 'wild', value: 'wild' });
    deck.push({ id: nanoid(), color: 'wild', value: 'draw4' });
  }

  return shuffle(deck);
}

export function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function recycleDiscardPile(room: GameState): void {
  if (room.discardPile.length <= 1) return;
  const top = room.discardPile.pop()!;
  const recycled = room.discardPile.map((card) => {
    if (card.value === 'wild' || card.value === 'draw4') {
      return { ...card, color: 'wild' as CardColor };
    }
    return card;
  });
  room.drawPile = shuffle(recycled);
  room.discardPile = [top];
}

/**
 * Checks whether a card is a restricted winning power card (+2 or +4).
 */
export function isPowerCard(card: Pick<Card, 'value'>): boolean {
  return card.value === 'draw2' || card.value === 'draw4';
}

/**
 * Rule: A player cannot finish the game by playing +2 or +4 as their final card.
 * If playing the card(s) would leave the player with 0 cards, and any card that empties their hand is +2 or +4,
 * this function returns false.
 */
export function canFinishWithPlay(playerCardsCount: number, cardsToPlay: Card[]): boolean {
  if (playerCardsCount - cardsToPlay.length === 0) {
    const hasPowerCard = cardsToPlay.some((c) => isPowerCard(c));
    if (hasPowerCard) return false;
  }
  return true;
}

/**
 * Checks if a card is legally playable on top of the discard pile given the current stack.
 */
export function canPlayCardOnTop(card: Card, topCard: Card, stackCount: number): boolean {
  if (stackCount > 0) {
    if (topCard.value === 'draw2' && (card.value === 'draw2' || card.value === 'draw4')) return true;
    if (topCard.value === 'draw4' && card.value === 'draw4') return true;
    return false;
  }

  if (card.color === 'wild' || card.value === 'wild' || card.value === 'draw4') {
    return true;
  }

  return card.color === topCard.color || card.value === topCard.value;
}

/**
 * Authoritative turn index calculation.
 * Accurately steps through active players (cards.length > 0) according to direction and skip.
 */
export function getNextPlayerIndex(state: Pick<GameState, 'players' | 'currentPlayerIndex' | 'direction'>, skip: number = 1): number {
  const { players, currentPlayerIndex, direction } = state;
  if (!players || players.length === 0) return 0;

  const activePlayers = players.filter((p) => p.cards.length > 0);
  if (activePlayers.length <= 1) return currentPlayerIndex;

  let nextIndex = currentPlayerIndex;

  for (let i = 0; i < skip; i++) {
    let steps = 0;
    do {
      nextIndex = (nextIndex + direction) % players.length;
      if (nextIndex < 0) nextIndex += players.length;
      steps++;
      if (steps > players.length * 2) break; // Infinite loop safety guard
    } while (players[nextIndex].cards.length === 0);
  }

  return nextIndex;
}

export interface PlayValidationResult {
  valid: boolean;
  error?: string;
  cardsToPlay?: Card[];
  skip?: number;
  newDirection?: 1 | -1;
  addedStackCount?: number;
  lastCardColor?: CardColor;
}

/**
 * Validates a play (single or multi-card in Special Mode).
 */
export function validateAndPreparePlay(
  room: GameState,
  player: Player,
  cardIds: string[],
  chosenColor?: CardColor
): PlayValidationResult {
  if (room.status !== 'playing') {
    return { valid: false, error: 'Game is not in playing state' };
  }

  if (!cardIds || cardIds.length === 0) {
    return { valid: false, error: 'No cards selected to play' };
  }

  // Ensure all cardIds exist in player's hand and are unique
  const uniqueCardIds = Array.from(new Set(cardIds));
  if (uniqueCardIds.length !== cardIds.length) {
    return { valid: false, error: 'Duplicate cards in play selection' };
  }

  const cardsToPlay: Card[] = [];
  for (const id of cardIds) {
    const found = player.cards.find((c) => c.id === id);
    if (!found) {
      return { valid: false, error: `Card ${id} not found in player hand` };
    }
    cardsToPlay.push(found);
  }

  const topCard = room.discardPile[room.discardPile.length - 1];

  // Check multi-card restrictions
  if (cardsToPlay.length > 1) {
    if (room.gameMode !== 'special') {
      return { valid: false, error: 'Multi-card play is only permitted in Special Mode' };
    }

    // Must be number cards (0-9)
    const allNumberCards = cardsToPlay.every((c) => c.value >= '0' && c.value <= '9');
    if (!allNumberCards) {
      return { valid: false, error: 'Multi-card play only permits number cards (0-9)' };
    }

    // All must have the exact same number value
    const firstValue = cardsToPlay[0].value;
    const allSameNumber = cardsToPlay.every((c) => c.value === firstValue);
    if (!allSameNumber) {
      return { valid: false, error: 'All cards played together must have the same number' };
    }

    // The play must be legal on the current top card:
    // At least one card in the multi-card play must legally match the current top card (by color or number)
    const hasLegalMatchingCard = cardsToPlay.some((c) => canPlayCardOnTop(c, topCard, room.stackCount));
    if (!hasLegalMatchingCard) {
      return {
        valid: false,
        error: `None of the selected cards (${firstValue}) match the current top card (${topCard.color} ${topCard.value}) by color or number.`,
      };
    }
  } else {
    // Single card play
    const singleCard = cardsToPlay[0];
    if (!canPlayCardOnTop(singleCard, topCard, room.stackCount)) {
      return { valid: false, error: `Card ${singleCard.color} ${singleCard.value} cannot be played on top card` };
    }
  }

  // Authoritative rule: Players cannot finish with a power card (+2 or +4)
  if (!canFinishWithPlay(player.cards.length, cardsToPlay)) {
    return {
      valid: false,
      error: 'You cannot win the game by playing a +2 or +4 power card as your final card.',
    };
  }

  // Calculate skip, direction, stack
  let skip = 1;
  let newDirection = room.direction;
  let addedStackCount = 0;

  if (cardsToPlay.length === 1) {
    const card = cardsToPlay[0];
    if (card.value === 'skip') {
      skip = 2;
    } else if (card.value === 'reverse') {
      const activePlayersCount = room.players.filter((p) => p.cards.length > 0).length;
      if (activePlayersCount === 2) {
        skip = 2; // In 2-player UNO, reverse acts like a skip
      } else {
        newDirection = (room.direction * -1) as 1 | -1;
        skip = 1;
      }
    } else if (card.value === 'draw2') {
      addedStackCount = 2;
    } else if (card.value === 'draw4') {
      addedStackCount = 4;
    }
  } else {
    // Multi-card play in Special Mode is always number cards, so skip=1, no direction change, no stack
    skip = 1;
  }

  // Last selected card determines final top card appearance
  const lastCard = cardsToPlay[cardsToPlay.length - 1];
  let lastCardColor = lastCard.color;
  if ((lastCard.color === 'wild' || lastCard.value === 'wild' || lastCard.value === 'draw4') && chosenColor) {
    lastCardColor = chosenColor;
  }

  return {
    valid: true,
    cardsToPlay,
    skip,
    newDirection,
    addedStackCount,
    lastCardColor,
  };
}

/**
 * Advances the turn authoritatively with detailed transition logging.
 */
export function advanceTurn(
  room: GameState,
  skip: number,
  actionName: string,
  extraDetails: string = ''
): { prevIndex: number; nextIndex: number; transitionId: string } {
  const transitionId = nanoid(8);
  const prevIndex = room.currentPlayerIndex;
  const nextIndex = getNextPlayerIndex(room, skip);

  const prevPlayer = room.players[prevIndex];
  const nextPlayer = room.players[nextIndex];

  console.log(
    `[ROOM ${room.roomId}] [TRANSITION ${transitionId}] Action: "${actionName}" ` +
    `by "${prevPlayer?.name || 'Unknown'}" (pos: ${prevIndex}, id: ${prevPlayer?.id}) -> ` +
    `Next: "${nextPlayer?.name || 'Unknown'}" (pos: ${nextIndex}, id: ${nextPlayer?.id}) ` +
    `[Direction: ${room.direction}, Skip: ${skip}${extraDetails ? `, ${extraDetails}` : ''}]`
  );

  room.currentPlayerIndex = nextIndex;
  room.hasDrawnThisTurn = false;
  room.turnCount = (room.turnCount || 0) + 1;

  return { prevIndex, nextIndex, transitionId };
}

/**
 * Sanitizes room state for a specific client socket to prevent card exposure.
 * During active game (status === 'playing'), opponents' cards are masked.
 * When status === 'ended', all players' hands are revealed.
 */
export function sanitizeGameStateForClient(room: GameState, clientSocketId: string): GameState {
  if (room.status !== 'playing') {
    // When waiting or ended, everyone sees their state or final reveal
    return room;
  }

  return {
    ...room,
    players: room.players.map((p) => {
      if (p.id === clientSocketId) {
        return p; // Current client receives their own real cards
      }
      // Mask other players' cards, preserving the card count
      return {
        ...p,
        cards: p.cards.map((c) => ({
          id: c.id,
          color: 'wild' as CardColor,
          value: '0' as CardValue, // Masked dummy
        })),
      };
    }),
  };
}
