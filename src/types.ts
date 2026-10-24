export type CardColor = 'red' | 'green' | 'blue' | 'yellow' | 'wild';
export type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'draw4';
export type GameMode = 'normal' | 'special';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export interface Player {
  id: string;
  name: string;
  cards: Card[];
  isReady: boolean;
  isBot: boolean;
  hasSaidUno: boolean;
  hasReturnedToLobby: boolean;
  sessionToken?: string;
}

export interface GameState {
  roomId: string;
  players: Player[];
  status: 'waiting' | 'playing' | 'ended';
  currentPlayerIndex: number;
  direction: 1 | -1;
  discardPile: Card[];
  drawPile: Card[];
  stackCount: number;
  winner: string | null;
  winners: string[]; // Order of finishing
  hasDrawnThisTurn: boolean;
  startingCardCount: number;
  missedUnoPlayers: string[];
  autoResetAt: number | null;
  gameMode: GameMode;
  turnCount?: number;
}

export interface ServerToClientEvents {
  roomState: (state: GameState) => void;
  error: (message: string) => void;
  gameStarted: (state: GameState) => void;
  cardPlayed: (playerId: string, card: Card) => void;
  cardDrawn: (playerId: string, count: number) => void;
  unoPenalty: (playerId: string) => void;
  turnChanged: (nextPlayerIndex: number) => void;
  turnTransition?: (data: {
    roomId: string;
    transitionId: string;
    prevPlayerIndex: number;
    nextPlayerIndex: number;
    action: string;
    direction: number;
  }) => void;
}

export interface ClientToServerEvents {
  joinRoom: (roomId: string, name: string, sessionToken?: string) => void;
  changeName: (newName: string) => void;
  toggleReady: () => void;
  playCard: (cardId: string, color?: CardColor) => void;
  playCards: (cardIds: string[], color?: CardColor) => void;
  drawCard: () => void;
  sayUno: () => void;
  catchUno: (targetId: string) => void;
  skipTurn: () => void;
  updateSettings: (settings: { startingCardCount?: number; gameMode?: GameMode }) => void;
  setGameMode: (gameMode: GameMode) => void;
  easterEggCard: (choice: '+2' | '+4', color?: CardColor) => void;
  kickPlayer: (targetId: string) => void;
  resetToLobby: () => void;
  returnToLobby: () => void;
}

