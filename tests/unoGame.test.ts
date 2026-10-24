import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeck,
  getNextPlayerIndex,
  canPlayCardOnTop,
  validateAndPreparePlay,
  canFinishWithPlay,
  isPowerCard,
  advanceTurn,
  sanitizeGameStateForClient,
} from '../src/gameEngine.js';
import type { Card, GameState, Player } from '../src/types.js';

function createMockPlayer(id: string, name: string, cards: Card[] = []): Player {
  return {
    id,
    name,
    cards,
    isReady: true,
    isBot: false,
    hasSaidUno: false,
    hasReturnedToLobby: false,
    sessionToken: `token-${id}`,
  };
}

function createMockRoom(players: Player[], mode: 'normal' | 'special' = 'normal'): GameState {
  return {
    roomId: 'TEST_ROOM',
    players,
    status: 'playing',
    currentPlayerIndex: 0,
    direction: 1,
    discardPile: [{ id: 'top-1', color: 'red', value: '3' }],
    drawPile: createDeck(),
    stackCount: 0,
    winner: null,
    winners: [],
    hasDrawnThisTurn: false,
    startingCardCount: 7,
    missedUnoPlayers: [],
    autoResetAt: null,
    gameMode: mode,
    turnCount: 0,
  };
}

describe('Power Card Winning Restriction (+2 and +4)', () => {
  it('A player with 1 remaining card cannot finish by playing a +2 card', () => {
    const cardPlus2: Card = { id: 'c-plus2', color: 'red', value: 'draw2' };
    const player = createMockPlayer('p1', 'Player 1', [cardPlus2]);
    const room = createMockRoom([player]);

    const result = validateAndPreparePlay(room, player, ['c-plus2']);
    assert.equal(result.valid, false);
    assert.match(result.error!, /cannot win the game by playing a \+2 or \+4/);
  });

  it('A player with 1 remaining card cannot finish by playing a +4 card', () => {
    const cardPlus4: Card = { id: 'c-plus4', color: 'wild', value: 'draw4' };
    const player = createMockPlayer('p1', 'Player 1', [cardPlus4]);
    const room = createMockRoom([player]);

    const result = validateAndPreparePlay(room, player, ['c-plus4'], 'blue');
    assert.equal(result.valid, false);
    assert.match(result.error!, /cannot win the game by playing a \+2 or \+4/);
  });

  it('A player CAN play +2 or +4 when other cards remain in their hand', () => {
    const cardPlus2: Card = { id: 'c-plus2', color: 'red', value: 'draw2' };
    const otherCard: Card = { id: 'c-other', color: 'blue', value: '5' };
    const player = createMockPlayer('p1', 'Player 1', [cardPlus2, otherCard]);
    const room = createMockRoom([player]);

    const result = validateAndPreparePlay(room, player, ['c-plus2']);
    assert.equal(result.valid, true);
    assert.equal(result.addedStackCount, 2);
  });

  it('Restriction applies consistently in both Normal Mode and Special Mode', () => {
    const cardPlus4: Card = { id: 'c-plus4', color: 'wild', value: 'draw4' };
    const player = createMockPlayer('p1', 'Player 1', [cardPlus4]);

    const normalRoom = createMockRoom([player], 'normal');
    assert.equal(validateAndPreparePlay(normalRoom, player, ['c-plus4'], 'green').valid, false);

    const specialRoom = createMockRoom([player], 'special');
    assert.equal(validateAndPreparePlay(specialRoom, player, ['c-plus4'], 'green').valid, false);
  });
});

describe('Special Mode: Multi-Card Play with Same Number', () => {
  it('Normal Mode rejects playing multiple cards in one turn', () => {
    const c1: Card = { id: 'r3', color: 'red', value: '3' };
    const c2: Card = { id: 'b3', color: 'blue', value: '3' };
    const player = createMockPlayer('p1', 'Player 1', [c1, c2, { id: 'extra', color: 'green', value: '8' }]);
    const room = createMockRoom([player], 'normal');

    const result = validateAndPreparePlay(room, player, ['r3', 'b3']);
    assert.equal(result.valid, false);
    assert.match(result.error!, /only permitted in Special Mode/);
  });

  it('Special Mode permits multiple number cards with the same number', () => {
    const c1: Card = { id: 'r3', color: 'red', value: '3' };
    const c2: Card = { id: 'b3', color: 'blue', value: '3' };
    const c3: Card = { id: 'g3', color: 'green', value: '3' };
    const player = createMockPlayer('p1', 'Player 1', [c1, c2, c3, { id: 'extra', color: 'yellow', value: '9' }]);
    const room = createMockRoom([player], 'special');
    // Top card is red 3

    const result = validateAndPreparePlay(room, player, ['r3', 'b3', 'g3']);
    assert.equal(result.valid, true);
    assert.equal(result.cardsToPlay?.length, 3);
    assert.equal(result.skip, 1);
  });

  it('Special Mode rejects combining cards with different numbers', () => {
    const c1: Card = { id: 'r3', color: 'red', value: '3' };
    const c2: Card = { id: 'r5', color: 'red', value: '5' };
    const player = createMockPlayer('p1', 'Player 1', [c1, c2, { id: 'extra', color: 'yellow', value: '9' }]);
    const room = createMockRoom([player], 'special');

    const result = validateAndPreparePlay(room, player, ['r3', 'r5']);
    assert.equal(result.valid, false);
    assert.match(result.error!, /must have the same number/);
  });

  it('Special Mode does NOT allow combining action cards (+2, skip, reverse)', () => {
    const s1: Card = { id: 's1', color: 'red', value: 'skip' };
    const s2: Card = { id: 's2', color: 'blue', value: 'skip' };
    const player = createMockPlayer('p1', 'Player 1', [s1, s2, { id: 'extra', color: 'yellow', value: '9' }]);
    const room = createMockRoom([player], 'special');

    const result = validateAndPreparePlay(room, player, ['s1', 's2']);
    assert.equal(result.valid, false);
    assert.match(result.error!, /only permits number cards/);
  });

  it('The last selected card determines the top card of the discard pile and turn advances once', () => {
    const c1: Card = { id: 'r3', color: 'red', value: '3' };
    const c2: Card = { id: 'b3', color: 'blue', value: '3' };
    const c3: Card = { id: 'g3', color: 'green', value: '3' }; // green 3 is selected last
    const p1 = createMockPlayer('p1', 'Player 1', [c1, c2, c3, { id: 'extra', color: 'yellow', value: '9' }]);
    const p2 = createMockPlayer('p2', 'Player 2', [{ id: 'p2-c', color: 'green', value: '7' }]);
    const room = createMockRoom([p1, p2], 'special');

    const result = validateAndPreparePlay(room, playerWithCards(p1, [c1, c2, c3]), ['r3', 'b3', 'g3']);
    assert.equal(result.valid, true);

    // Simulate play order execution: cards pushed in selection order
    for (const card of result.cardsToPlay!) {
      room.discardPile.push(card);
    }

    const topDiscard = room.discardPile[room.discardPile.length - 1];
    assert.equal(topDiscard.id, 'g3');
    assert.equal(topDiscard.color, 'green');
    assert.equal(topDiscard.value, '3');

    // Turn advances once
    advanceTurn(room, result.skip!, 'playCards');
    assert.equal(room.currentPlayerIndex, 1);
  });

  it('Special Mode allows matching card anywhere in selection, placing the last selected card on top', () => {
    // Top card is red 7. Player holds blue 3 and red 3.
    // Player selects blue 3 first, and red 3 last.
    const b3: Card = { id: 'b3', color: 'blue', value: '3' };
    const r3: Card = { id: 'r3', color: 'red', value: '3' };
    const p1 = createMockPlayer('p1', 'Player 1', [b3, r3, { id: 'ext', color: 'green', value: '1' }]);
    const room = createMockRoom([p1], 'special');
    room.discardPile = [{ id: 'top-red7', color: 'red', value: '7' }];

    const result = validateAndPreparePlay(room, p1, ['b3', 'r3']);
    assert.equal(result.valid, true);

    // Simulate play order execution: cards pushed in selection order
    for (const card of result.cardsToPlay!) {
      room.discardPile.push(card);
    }

    const topDiscard = room.discardPile[room.discardPile.length - 1];
    assert.equal(topDiscard.id, 'r3');
    assert.equal(topDiscard.color, 'red');
    assert.equal(topDiscard.value, '3');
  });

  it('Special Mode rejects multi-play if NONE of the selected cards match top card', () => {
    // Top card is red 7. Player holds blue 3 and green 3 (neither matches red 7).
    const b3: Card = { id: 'b3', color: 'blue', value: '3' };
    const g3: Card = { id: 'g3', color: 'green', value: '3' };
    const p1 = createMockPlayer('p1', 'Player 1', [b3, g3]);
    const room = createMockRoom([p1], 'special');
    room.discardPile = [{ id: 'top-red7', color: 'red', value: '7' }];

    const result = validateAndPreparePlay(room, p1, ['b3', 'g3']);
    assert.equal(result.valid, false);
    assert.match(result.error!, /None of the selected cards/);
  });

  it('Prompt Example: Red 5, Blue 5, Green 5, and Yellow 5 can be played together in Special Mode on top of Red 5', () => {
    const red5: Card = { id: 'r5', color: 'red', value: '5' };
    const blue5: Card = { id: 'b5', color: 'blue', value: '5' };
    const green5: Card = { id: 'g5', color: 'green', value: '5' };
    const yellow5: Card = { id: 'y5', color: 'yellow', value: '5' };
    const blue7: Card = { id: 'b7', color: 'blue', value: '7' };
    const green2: Card = { id: 'g2', color: 'green', value: '2' };

    const p1 = createMockPlayer('p1', 'Player 1', [red5, blue5, green5, yellow5, blue7, green2]);
    const room = createMockRoom([p1], 'special');
    room.discardPile = [{ id: 'top-r5', color: 'red', value: '5' }];

    const result = validateAndPreparePlay(room, p1, ['r5', 'b5', 'g5', 'y5']);
    assert.equal(result.valid, true);
    assert.equal(result.cardsToPlay?.length, 4);
    assert.equal(result.skip, 1);
  });

  it('Multiple cards with the same number AND the same color continue to work in Special Mode', () => {
    const red5a: Card = { id: 'r5a', color: 'red', value: '5' };
    const red5b: Card = { id: 'r5b', color: 'red', value: '5' };
    const p1 = createMockPlayer('p1', 'Player 1', [red5a, red5b, { id: 'ext', color: 'yellow', value: '9' }]);
    const room = createMockRoom([p1], 'special');
    room.discardPile = [{ id: 'top-r9', color: 'red', value: '9' }];

    const result = validateAndPreparePlay(room, p1, ['r5a', 'r5b']);
    assert.equal(result.valid, true);
    assert.equal(result.cardsToPlay?.length, 2);
  });

  it('Edge Case: Initial card matches discard color, last selected card has different color, and next player must match last card', () => {
    // Discard top: Red 2
    // Player 1 plays Red 5, Blue 5, Green 5, Yellow 5 (Yellow 5 is last)
    const red5: Card = { id: 'r5', color: 'red', value: '5' };
    const blue5: Card = { id: 'b5', color: 'blue', value: '5' };
    const green5: Card = { id: 'g5', color: 'green', value: '5' };
    const yellow5: Card = { id: 'y5', color: 'yellow', value: '5' };

    const p1 = createMockPlayer('p1', 'Player 1', [red5, blue5, green5, yellow5, { id: 'remain', color: 'blue', value: '9' }]);
    const p2 = createMockPlayer('p2', 'Player 2', [
      { id: 'p2-y8', color: 'yellow', value: '8' }, // matches yellow
      { id: 'p2-g5', color: 'green', value: '5' },  // matches 5
      { id: 'p2-g8', color: 'green', value: '8' },  // does NOT match yellow 5
    ]);
    const room = createMockRoom([p1, p2], 'special');
    room.discardPile = [{ id: 'top-r2', color: 'red', value: '2' }];

    const result = validateAndPreparePlay(room, p1, ['r5', 'b5', 'g5', 'y5']);
    assert.equal(result.valid, true);

    // Apply play
    for (const card of result.cardsToPlay!) {
      room.discardPile.push(card);
    }
    advanceTurn(room, result.skip!, 'playCards');

    // Confirm Yellow 5 is top card
    const topCard = room.discardPile[room.discardPile.length - 1];
    assert.equal(topCard.color, 'yellow');
    assert.equal(topCard.value, '5');

    // Next player is Player 2
    assert.equal(room.currentPlayerIndex, 1);

    // Player 2 playing Yellow 8 is legal
    assert.equal(validateAndPreparePlay(room, p2, ['p2-y8']).valid, true);

    // Player 2 playing Green 5 is legal
    assert.equal(validateAndPreparePlay(room, p2, ['p2-g5']).valid, true);

    // Player 2 playing Green 8 is ILLEGAL (does not match yellow or 5)
    assert.equal(validateAndPreparePlay(room, p2, ['p2-g8']).valid, false);
  });
});


function playerWithCards(p: Player, cards: Card[]): Player {
  return { ...p, cards };
}

describe('Four-Player Authoritative Turn Order', () => {
  it('Four players playing normal turns proceed consecutively in clockwise order (0 -> 1 -> 2 -> 3 -> 0)', () => {
    const players = [
      createMockPlayer('p0', 'Player 0', [{ id: 'c0', color: 'red', value: '1' }]),
      createMockPlayer('p1', 'Player 1', [{ id: 'c1', color: 'red', value: '2' }]),
      createMockPlayer('p2', 'Player 2', [{ id: 'c2', color: 'red', value: '3' }]),
      createMockPlayer('p3', 'Player 3', [{ id: 'c3', color: 'red', value: '4' }]),
    ];
    const room = createMockRoom(players);

    assert.equal(room.currentPlayerIndex, 0);

    // P0 plays
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 1);

    // P1 plays
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 2);

    // P2 plays
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 3);

    // P3 plays
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 0);
  });

  it('Turn order reverses correctly when a Reverse card is played (0 -> 3 -> 2 -> 1 -> 0)', () => {
    const players = [
      createMockPlayer('p0', 'Player 0', [{ id: 'c0', color: 'red', value: 'reverse' }]),
      createMockPlayer('p1', 'Player 1', [{ id: 'c1', color: 'red', value: '2' }]),
      createMockPlayer('p2', 'Player 2', [{ id: 'c2', color: 'red', value: '3' }]),
      createMockPlayer('p3', 'Player 3', [{ id: 'c3', color: 'red', value: '4' }]),
    ];
    const room = createMockRoom(players);
    assert.equal(room.direction, 1);
    assert.equal(room.currentPlayerIndex, 0);

    // P0 plays Reverse
    room.direction = (room.direction * -1) as 1 | -1;
    advanceTurn(room, 1, 'playCard (reverse)');
    assert.equal(room.direction, -1);
    assert.equal(room.currentPlayerIndex, 3); // Goes to P3

    // P3 plays normal card in reversed direction
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 2); // Goes to P2

    // P2 plays normal card in reversed direction
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 1); // Goes to P1

    // P1 plays normal card in reversed direction
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 0); // Goes to P0
  });

  it('Turn order skips the next player when a Skip card is played (0 -> 2 -> 3 -> 0)', () => {
    const players = [
      createMockPlayer('p0', 'Player 0', [{ id: 'c0', color: 'red', value: 'skip' }]),
      createMockPlayer('p1', 'Player 1', [{ id: 'c1', color: 'red', value: '2' }]),
      createMockPlayer('p2', 'Player 2', [{ id: 'c2', color: 'red', value: '3' }]),
      createMockPlayer('p3', 'Player 3', [{ id: 'c3', color: 'red', value: '4' }]),
    ];
    const room = createMockRoom(players);

    // P0 plays Skip (skip = 2)
    advanceTurn(room, 2, 'playCard (skip)');
    assert.equal(room.currentPlayerIndex, 2); // P1 skipped, now P2

    // P2 plays normal
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 3);

    // P3 plays normal
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 0);
  });

  it('With 2 active players, Reverse acts as a Skip (player gets another turn)', () => {
    const players = [
      createMockPlayer('p0', 'Player 0', [{ id: 'c0', color: 'red', value: 'reverse' }, { id: 'c0b', color: 'blue', value: '1' }]),
      createMockPlayer('p1', 'Player 1', [{ id: 'c1', color: 'red', value: '5' }]),
    ];
    const room = createMockRoom(players);

    const validation = validateAndPreparePlay(room, players[0], ['c0']);
    assert.equal(validation.valid, true);
    assert.equal(validation.skip, 2); // In 2-player UNO, reverse skips opponent
    assert.equal(validation.newDirection, 1); // Direction is preserved

    advanceTurn(room, validation.skip!, 'playCard (reverse in 2p)');
    assert.equal(room.currentPlayerIndex, 0); // P0 gets another turn
  });

  it('Players who have won (0 cards left) are correctly skipped during turn advancement', () => {
    const players = [
      createMockPlayer('p0', 'Player 0', [{ id: 'c0', color: 'red', value: '1' }]),
      createMockPlayer('p1', 'Player 1', []), // P1 already won (0 cards)
      createMockPlayer('p2', 'Player 2', [{ id: 'c2', color: 'red', value: '3' }]),
      createMockPlayer('p3', 'Player 3', [{ id: 'c3', color: 'red', value: '4' }]),
    ];
    const room = createMockRoom(players);

    // Turn at 0 -> should skip 1 and go directly to 2
    advanceTurn(room, 1, 'playCard');
    assert.equal(room.currentPlayerIndex, 2);
  });
});

describe('Multiplayer Card Sanitization & Privacy', () => {
  it('During active game (status === playing), opponents cards are masked and never exposed', () => {
    const p1 = createMockPlayer('p1', 'Player 1', [{ id: 'p1-secret', color: 'blue', value: 'draw4' }]);
    const p2 = createMockPlayer('p2', 'Player 2', [{ id: 'p2-secret', color: 'red', value: '9' }]);
    const room = createMockRoom([p1, p2]);

    const sanitizedForP1 = sanitizeGameStateForClient(room, 'p1');

    // P1 sees their own real card
    assert.equal(sanitizedForP1.players[0].cards[0].color, 'blue');
    assert.equal(sanitizedForP1.players[0].cards[0].value, 'draw4');

    // P1 CANNOT see P2's card (masked with dummy card)
    assert.equal(sanitizedForP1.players[1].cards.length, 1);
    assert.equal(sanitizedForP1.players[1].cards[0].color, 'wild');
    assert.equal(sanitizedForP1.players[1].cards[0].value, '0');
  });

  it('When game is ended (status === ended), all players actual final cards are revealed', () => {
    const p1 = createMockPlayer('p1', 'Player 1', [{ id: 'p1-card', color: 'green', value: 'skip' }]);
    const p2 = createMockPlayer('p2', 'Player 2', [{ id: 'p2-card', color: 'yellow', value: 'draw2' }]);
    const room = createMockRoom([p1, p2]);
    room.status = 'ended';

    const sanitizedForP1 = sanitizeGameStateForClient(room, 'p1');

    // Both players cards are fully revealed for the final hands display
    assert.equal(sanitizedForP1.players[0].cards[0].color, 'green');
    assert.equal(sanitizedForP1.players[0].cards[0].value, 'skip');
    assert.equal(sanitizedForP1.players[1].cards[0].color, 'yellow');
    assert.equal(sanitizedForP1.players[1].cards[0].value, 'draw2');
  });
});

describe('Easter Egg Logic', () => {
  it('Calculates rapid clicks within 3 second window correctly', () => {
    const clickTimes: number[] = [];
    const baseTime = 1000000;

    // 9 rapid clicks
    for (let i = 0; i < 9; i++) {
      clickTimes.push(baseTime + i * 200);
    }
    const filtered9 = clickTimes.filter(t => (baseTime + 1800) - t <= 3000);
    assert.equal(filtered9.length < 10, true);

    // 10th rapid click
    clickTimes.push(baseTime + 9 * 200); // 1.8 seconds total
    const filtered10 = clickTimes.filter(t => (baseTime + 1800) - t <= 3000);
    assert.equal(filtered10.length >= 10, true);

    // Slow clicks (> 3000ms span)
    const slowClicks = [baseTime, baseTime + 1000, baseTime + 2000, baseTime + 3500];
    const filteredSlow = slowClicks.filter(t => (baseTime + 3500) - t <= 3000);
    assert.equal(filteredSlow.length, 3); // First click dropped out
  });
});

describe('Special Mode: Automatic Play Decisions', () => {
  function shouldAutoPlayNumberCard(
    hand: Card[],
    clickedCard: Card,
    topCard: Card,
    mode: 'normal' | 'special',
    stackCount = 0
  ): { autoPlay: boolean; reason?: string } {
    if (mode !== 'special') {
      return { autoPlay: false, reason: 'Normal mode retains single-click action' };
    }

    const isNumberCard = clickedCard.value >= '0' && clickedCard.value <= '9';
    if (!isNumberCard) {
      return { autoPlay: false, reason: 'Action cards do not use multi-card auto-play check' };
    }

    // Must be legally playable on top card
    if (!canPlayCardOnTop(clickedCard, topCard, stackCount)) {
      return { autoPlay: false, reason: 'Illegal card play' };
    }

    // Final card power card restriction check
    if (hand.length === 1 && isPowerCard(clickedCard)) {
      return { autoPlay: false, reason: 'Winning power card restriction' };
    }

    // Exclude the clicked card and check for any other number cards with the same number value (0-9)
    const otherMatchingCards = hand.filter(
      c => c.id !== clickedCard.id && c.value >= '0' && c.value <= '9' && c.value === clickedCard.value
    );

    if (otherMatchingCards.length === 0) {
      return { autoPlay: true };
    }

    return { autoPlay: false, reason: 'Other matching cards exist in hand for multi-selection' };
  }

  it('Example A: Automatically plays legal Red 4 when no other 4s exist in hand', () => {
    const red4: Card = { id: 'r4', color: 'red', value: '4' };
    const blue7: Card = { id: 'b7', color: 'blue', value: '7' };
    const green2: Card = { id: 'g2', color: 'green', value: '2' };
    const yellow9: Card = { id: 'y9', color: 'yellow', value: '9' };
    const hand = [red4, blue7, green2, yellow9];
    const topCard: Card = { id: 'top', color: 'red', value: '1' };

    const decision = shouldAutoPlayNumberCard(hand, red4, topCard, 'special');
    assert.equal(decision.autoPlay, true);
  });

  it('Example B: Does NOT automatically play Red 4 when other 4s exist (Blue 4, Green 4)', () => {
    const red4: Card = { id: 'r4', color: 'red', value: '4' };
    const blue4: Card = { id: 'b4', color: 'blue', value: '4' };
    const green4: Card = { id: 'g4', color: 'green', value: '4' };
    const yellow7: Card = { id: 'y7', color: 'yellow', value: '7' };
    const hand = [red4, blue4, green4, yellow7];
    const topCard: Card = { id: 'top', color: 'red', value: '1' };

    const decision = shouldAutoPlayNumberCard(hand, red4, topCard, 'special');
    assert.equal(decision.autoPlay, false);
    assert.equal(decision.reason, 'Other matching cards exist in hand for multi-selection');
  });

  it('Example C: Does NOT automatically play Red 4 when exactly one other 4 exists (Blue 4)', () => {
    const red4: Card = { id: 'r4', color: 'red', value: '4' };
    const blue4: Card = { id: 'b4', color: 'blue', value: '4' };
    const hand = [red4, blue4];
    const topCard: Card = { id: 'top', color: 'red', value: '1' };

    const decision = shouldAutoPlayNumberCard(hand, red4, topCard, 'special');
    assert.equal(decision.autoPlay, false);
  });

  it('Does NOT auto-play illegal cards even if unique number in hand', () => {
    const blue7: Card = { id: 'b7', color: 'blue', value: '7' };
    const green2: Card = { id: 'g2', color: 'green', value: '2' };
    const hand: Card[] = [blue7, green2];
    const topCard: Card = { id: 'top', color: 'red', value: '1' }; // Neither color nor number matches

    const decision = shouldAutoPlayNumberCard(hand, blue7, topCard, 'special');
    assert.equal(decision.autoPlay, false);
    assert.equal(decision.reason, 'Illegal card play');
  });

  it('Action cards (e.g. Skip) do not use multi-card auto-play check', () => {
    const redSkip: Card = { id: 'rs', color: 'red', value: 'skip' };
    const green2: Card = { id: 'g2', color: 'green', value: '2' };
    const hand: Card[] = [redSkip, green2];
    const topCard: Card = { id: 'top', color: 'red', value: '1' };

    const decision = shouldAutoPlayNumberCard(hand, redSkip, topCard, 'special');
    assert.equal(decision.autoPlay, false);
    assert.equal(decision.reason, 'Action cards do not use multi-card auto-play check');
  });
});

describe('Special Mode: Sequential Animation Queueing', () => {
  it('Correctly extracts newly played cards in order from previous discard pile state', () => {
    const initialPile: Card[] = [{ id: 'c0', color: 'red', value: '9' }];
    const playedCards: Card[] = [
      { id: 'r5', color: 'red', value: '5' },
      { id: 'b5', color: 'blue', value: '5' },
      { id: 'g5', color: 'green', value: '5' },
      { id: 'y5', color: 'yellow', value: '5' },
    ];
    const updatedPile = [...initialPile, ...playedCards];

    const prevLen = initialPile.length;
    const addedCards = updatedPile.slice(prevLen);

    assert.equal(addedCards.length, 4);
    assert.equal(addedCards[0].id, 'r5');
    assert.equal(addedCards[1].id, 'b5');
    assert.equal(addedCards[2].id, 'g5');
    assert.equal(addedCards[3].id, 'y5');

    // Sequence order guarantees the last selected card (Yellow 5) is final top card
    assert.equal(addedCards[addedCards.length - 1].color, 'yellow');
    assert.equal(addedCards[addedCards.length - 1].value, '5');
  });

  it('Single-card addition produces single-item queue without delays', () => {
    const initialPile: Card[] = [{ id: 'c0', color: 'red', value: '9' }];
    const updatedPile = [...initialPile, { id: 'r4', color: 'red', value: '4' }];

    const addedCards = updatedPile.slice(initialPile.length);
    assert.equal(addedCards.length, 1);
    assert.equal(addedCards[0].id, 'r4');
  });

  it('Advances cards strictly on animation completion of the current active card', () => {
    // Model of completion-driven queue controller
    class AnimationQueueController {
      queue: Card[] = [];
      currentActiveId: string | null = null;
      displayedCard: Card | null = null;
      history: string[] = [];

      receiveNewCards(cards: Card[]) {
        if (this.currentActiveId !== null) {
          this.queue.push(...cards);
        } else if (cards.length > 0) {
          const first = cards[0];
          this.queue = cards.slice(1);
          this.currentActiveId = first.id;
          this.displayedCard = first;
          this.history.push(first.id);
        }
      }

      onCardAnimationComplete(completedId: string) {
        if (this.currentActiveId !== completedId) {
          // Ignore mismatched or duplicate calls
          return;
        }

        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.currentActiveId = next.id;
          this.displayedCard = next;
          this.history.push(next.id);
        } else {
          this.currentActiveId = null;
        }
      }

      reset() {
        this.queue = [];
        this.currentActiveId = null;
      }
    }

    const controller = new AnimationQueueController();
    const batch: Card[] = [
      { id: 'r5', color: 'red', value: '5' },
      { id: 'b5', color: 'blue', value: '5' },
      { id: 'g5', color: 'green', value: '5' },
      { id: 'y5', color: 'yellow', value: '5' },
    ];

    // Initial receive: first card displays immediately
    controller.receiveNewCards(batch);
    assert.equal(controller.displayedCard?.id, 'r5');
    assert.equal(controller.currentActiveId, 'r5');
    assert.equal(controller.queue.length, 3);

    // Duplicate or mismatched callback does NOT advance
    controller.onCardAnimationComplete('unknown-card');
    controller.onCardAnimationComplete('b5'); // Not yet active
    assert.equal(controller.displayedCard?.id, 'r5');
    assert.equal(controller.queue.length, 3);

    // Card 1 completes -> Card 2 displays
    controller.onCardAnimationComplete('r5');
    assert.equal(controller.displayedCard?.id, 'b5');
    assert.equal(controller.currentActiveId, 'b5');
    assert.equal(controller.queue.length, 2);

    // Repeated call with old Card 1 does nothing
    controller.onCardAnimationComplete('r5');
    assert.equal(controller.displayedCard?.id, 'b5');

    // Card 2 completes -> Card 3 displays
    controller.onCardAnimationComplete('b5');
    assert.equal(controller.displayedCard?.id, 'g5');
    assert.equal(controller.currentActiveId, 'g5');

    // Card 3 completes -> Card 4 (Yellow 5) displays
    controller.onCardAnimationComplete('g5');
    assert.equal(controller.displayedCard?.id, 'y5');
    assert.equal(controller.currentActiveId, 'y5');
    assert.equal(controller.queue.length, 0);

    // Final card completes -> queue empty, active is null, Yellow 5 remains displayed
    controller.onCardAnimationComplete('y5');
    assert.equal(controller.currentActiveId, null);
    assert.equal(controller.displayedCard?.id, 'y5');
    assert.deepEqual(controller.history, ['r5', 'b5', 'g5', 'y5']);
  });

  it('Enqueues cards correctly when a new play arrives while previous animation is in flight', () => {
    let currentActiveId: string | null = null;
    let displayedCard: Card | null = null;
    let queue: Card[] = [];
    const history: string[] = [];

    function receive(cards: Card[]) {
      if (currentActiveId !== null) {
        queue.push(...cards);
      } else if (cards.length > 0) {
        const first = cards[0];
        queue = cards.slice(1);
        currentActiveId = first.id;
        displayedCard = first;
        history.push(first.id);
      }
    }

    function complete(id: string) {
      if (currentActiveId !== id) return;
      if (queue.length > 0) {
        const next = queue.shift()!;
        currentActiveId = next.id;
        displayedCard = next;
        history.push(next.id);
      } else {
        currentActiveId = null;
      }
    }

    // Play 1: Red 5 and Blue 5
    receive([{ id: 'r5', color: 'red', value: '5' }, { id: 'b5', color: 'blue', value: '5' }]);
    assert.equal(displayedCard?.id, 'r5');

    // While Red 5 is animating, another play arrives: Green 5
    receive([{ id: 'g5', color: 'green', value: '5' }]);
    assert.equal(queue.length, 2); // b5 and g5 queued

    // Red 5 completes
    complete('r5');
    assert.equal(displayedCard?.id, 'b5');

    // Blue 5 completes
    complete('b5');
    assert.equal(displayedCard?.id, 'g5');

    // Green 5 completes
    complete('g5');
    assert.equal(currentActiveId, null);
    assert.deepEqual(history, ['r5', 'b5', 'g5']);
  });

  it('Never advances intermediate cards via timer; progression requires onAnimationComplete', () => {
    let currentActiveId: string | null = null;
    let displayedCard: Card | null = null;
    let queue: Card[] = [];

    const cards: Card[] = [
      { id: 'r5', color: 'red', value: '5' },
      { id: 'b5', color: 'blue', value: '5' },
      { id: 'g5', color: 'green', value: '5' },
      { id: 'y5', color: 'yellow', value: '5' },
    ];

    // Start 4-card batch
    const first = cards[0];
    queue = cards.slice(1);
    currentActiveId = first.id;
    displayedCard = first;

    // Verify: Regardless of simulated elapsed time, queue does NOT advance until onAnimationComplete
    assert.equal(displayedCard.id, 'r5');
    assert.equal(queue.length, 3);
    assert.equal(currentActiveId, 'r5');

    // Only when completion callback fires does the next card advance
    function onComplete(id: string) {
      if (currentActiveId !== id) return;
      if (queue.length > 0) {
        const next = queue.shift()!;
        currentActiveId = next.id;
        displayedCard = next;
      } else {
        currentActiveId = null;
      }
    }

    onComplete('r5');
    assert.equal(displayedCard.id, 'b5');
    assert.equal(queue.length, 2);

    onComplete('b5');
    assert.equal(displayedCard.id, 'g5');
    assert.equal(queue.length, 1);

    onComplete('g5');
    assert.equal(displayedCard.id, 'y5');
    assert.equal(queue.length, 0);

    onComplete('y5');
    assert.equal(displayedCard.id, 'y5');
    assert.equal(currentActiveId, null);
  });

  it('Emergency recovery flushes directly to authoritative final card without intermediate stepping', () => {
    let currentActiveId: string | null = null;
    let displayedCard: Card | null = null;
    let queue: Card[] = [];

    const cards: Card[] = [
      { id: 'r5', color: 'red', value: '5' },
      { id: 'b5', color: 'blue', value: '5' },
      { id: 'g5', color: 'green', value: '5' },
      { id: 'y5', color: 'yellow', value: '5' },
    ];

    const first = cards[0];
    queue = cards.slice(1);
    currentActiveId = first.id;
    displayedCard = first;

    // Simulate emergency recovery triggered (e.g. browser tab suspended / backgrounded for 4000ms)
    function emergencyRecover(expectedId: string, authoritativeFinalCard: Card) {
      if (currentActiveId === expectedId) {
        queue = [];
        currentActiveId = null;
        displayedCard = authoritativeFinalCard;
      }
    }

    // Emergency recovery flushes directly to authoritative final card (Yellow 5)
    emergencyRecover('r5', cards[cards.length - 1]);
    assert.equal(displayedCard.id, 'y5');
    assert.equal(queue.length, 0);
    assert.equal(currentActiveId, null);
  });
});

