export type Phase = 'lobby' | 'night' | 'day';
export type Role = 'villager' | 'werewolf' | 'seer';

export interface PlayerSummary {
  id: string;
  name: string;
  role?: Role;
  isHost: boolean;
  alive: boolean;
}

export interface SelfPlayer extends PlayerSummary {
  role: Role;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: string;
  type: 'public' | 'werewolf';
}

export interface VoteSummary {
  targetId: string;
  targetName: string;
  votes: number;
  voters: string[];
}

export interface GameState {
  connected: boolean;
  roomCode?: string;
  playerId?: string;
  phase: Phase;
  players: PlayerSummary[];
  self?: SelfPlayer | null;
  publicChat: ChatMessage[];
  werewolfChat: ChatMessage[];
  werewolfVotes: VoteSummary[];
  dayVotes: VoteSummary[];
}

export interface RoomJoinedPayload {
  roomCode: string;
  playerId: string;
}

export interface RoomUpdatePayload {
  roomCode: string;
  phase: Phase;
  self: SelfPlayer | null;
  players: PlayerSummary[];
  publicChat: ChatMessage[];
  werewolfChat: ChatMessage[];
  werewolfVotes: VoteSummary[];
  dayVotes: VoteSummary[];
}

export interface ErrorPayload {
  message: string;
}
