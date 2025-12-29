import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import {
  getRoleDefinition,
  roleCatalog,
  selectableRoles,
  type RoleDefinition,
  type RoleId,
  type TeamId,
} from '@/constants/roles';
import { getSupabaseClient } from '@/lib/supabase';

type SessionRow = {
  id: string;
  code: string;
  active: boolean;
  reveal_on_death: boolean | null;
  phase?: PhaseId | null;
  phase_round?: number | null;
  night_step_id?: NightStepId | null;
  night_step_index?: number | null;
  night_step_title?: string | null;
  night_step_description?: string | null;
  night_step_role?: NightRole | null;
  night_step_allow_target?: boolean | null;
};

type SessionPlayerRow = {
  id: string;
  name: string | null;
  reveal_vote: boolean | null;
  ready: boolean | null;
  is_host: boolean | null;
  role_id?: string | null;
  role_acknowledged?: boolean | null;
  alive?: boolean | null;
  night_target_id?: string | null;
  night_action_step?: string | null;
  night_action_round?: number | null;
  night_action_locked?: boolean | null;
  night_updated_at?: string | null;
};

type GameMode = 'single' | 'network';
type PhaseId = 'night' | 'day';
type NightRole = 'alienKatze' | 'seher' | 'doktor';
type NightStepId = 'sleep' | NightRole | 'sunrise';

type PlayerRecord = {
  id: string;
  name: string;
  revealVote: boolean | null;
  ready: boolean;
  isHost: boolean;
  roleId: RoleId | null;
  roleAcknowledged: boolean;
  alive: boolean;
};

type PlayerAssignment = {
  playerId: string;
  playerName: string;
  order: number;
  roleId: RoleId;
  revealed: boolean;
  alive: boolean;
  eliminatedBy?: 'night' | 'day';
  eliminatedInRound?: number;
};

type GameStatus = 'setup' | 'reveal' | 'inProgress';

type RoleCounts = Record<RoleId, number>;

type NightRecord = {
  round: number;
  alienTargetId: string | null;
  doctorTargetId: string | null;
  seerTargetId: string | null;
  seerResultTeam: TeamId | null;
  casualties: string[];
  saved: string[];
  resolved: boolean;
};

type DayRecord = {
  round: number;
  casualties: string[];
  votedOutId: string | null;
  skipped: boolean;
};

type NightResolution = {
  round: number;
  casualties: string[];
  saved: string[];
  seerInsight: { playerId: string; team: TeamId } | null;
};

type DayResolution = {
  round: number;
  votedOutId: string | null;
  skipped: boolean;
};

type GameOutcome = {
  winner: TeamId;
  reason: string;
};

type NetworkNightStepState = {
  round: number;
  stepIndex: number;
  stepId: NightStepId;
  title: string;
  description: string;
  roleId: NightRole | null;
  allowTargetSelection: boolean;
};

type NetworkNightAction = {
  round: number;
  stepId: NightStepId;
  targetId: string | null;
  confirmed: boolean;
  updatedAt: number;
};

type SessionMessageRow = {
  id: string;
  session_id: string;
  player_id: string | null;
  message: string | null;
  channel: string | null;
  round: number | null;
  step_id: string | null;
  created_at: string | null;
};

type AlienChatMessage = {
  id: string;
  playerId: string;
  playerName: string;
  body: string;
  createdAt: number;
  round: number | null;
};

type NetworkDayEvent =
  | {
      id: string;
      type: 'nominate';
      actorId: string;
      round: number;
      createdAt: number;
      targetId: string | null;
    }
  | {
      id: string;
      type: 'support';
      actorId: string;
      round: number;
      createdAt: number;
      targetId: string;
      support: boolean;
    }
  | {
      id: string;
      type: 'ready';
      actorId: string;
      round: number;
      createdAt: number;
      ready: boolean;
    }
  | {
      id: string;
      type: 'startVote';
      actorId: string;
      round: number;
      createdAt: number;
      candidates: string[];
    }
  | {
      id: string;
      type: 'vote';
      actorId: string;
      round: number;
      createdAt: number;
      targetId: string | null;
    }
  | {
      id: string;
      type: 'skip';
      actorId: string;
      round: number;
      createdAt: number;
      support: boolean;
    }
  | {
      id: string;
      type: 'reset';
      actorId: string;
      round: number;
      createdAt: number;
    };

type RematchVoteOption = 'yes' | 'no';
type RematchResultType = 'accepted' | 'rejected';

type NetworkRematchEvent =
  | {
      id: string;
      type: 'request';
      actorId: string;
      pollId: string;
      createdAt: number;
      round: number | null;
    }
  | {
      id: string;
      type: 'vote';
      actorId: string;
      pollId: string;
      createdAt: number;
      vote: RematchVoteOption;
      round: number | null;
    }
  | {
      id: string;
      type: 'result';
      actorId: string;
      pollId: string;
      createdAt: number;
      result: RematchResultType;
      round: number | null;
    };

type RematchState = {
  pollId: string;
  requestedBy: string;
  requestedAt: number;
  round: number | null;
  votes: Record<string, RematchVoteOption>;
  resolved: boolean;
  result: RematchResultType | null;
  resolvedAt: number | null;
  resolvedBy: string | null;
};

type DayEventPayload =
  | { type: 'nominate'; round: number; targetId: string | null }
  | { type: 'support'; round: number; targetId: string; support: boolean }
  | { type: 'ready'; round: number; ready: boolean }
  | { type: 'startVote'; round: number; candidates: string[] }
  | { type: 'vote'; round: number; targetId: string | null }
  | { type: 'skip'; round: number; support: boolean }
  | { type: 'reset'; round: number };

const ALIEN_CHAT_CHANNEL = 'alien-night';
const DAY_EVENT_CHANNEL = 'day-events';
const REMATCH_CHANNEL = 'rematch';

function isNightRole(value: string | null | undefined): value is NightRole {
  return value === 'alienKatze' || value === 'seher' || value === 'doktor';
}

function isNightStepId(value: string | null | undefined): value is NightStepId {
  return value === 'sleep' || value === 'sunrise' || isNightRole(value);
}

type GameState = {
  mode: GameMode;
  playerCount: number;
  players: PlayerRecord[];
  playerIdCounter: number;
  singleRevealAfterDeath: boolean;
  revealOnDeath: boolean;
  networkSessionActive: boolean;
  networkSessionCode: string | null;
  networkSessionId: string | null;
  localPlayerId: string | null;
  roleCounts: RoleCounts;
  assignments: PlayerAssignment[];
  status: GameStatus;
  currentPhase: PhaseId;
  round: number;
  revealIndex: number;
  nightLog: NightRecord[];
  dayLog: DayRecord[];
  outcome: GameOutcome | null;
  networkNightStep: NetworkNightStepState | null;
  networkNightActions: Record<string, NetworkNightAction>;
  alienChatMessages: AlienChatMessage[];
  networkDayEvents: NetworkDayEvent[];
  rematchState: RematchState | null;
};

type GameAction =
  | { type: 'setMode'; payload: GameMode }
  | { type: 'setPlayerCount'; payload: number }
  | { type: 'setPlayerName'; payload: { index: number; name: string } }
  | { type: 'setRoleCount'; payload: { roleId: RoleId; count: number } }
  | { type: 'setSingleRevealAfterDeath'; payload: boolean }
  | {
      type: 'networkSessionStarted';
      payload: { sessionId: string; code: string; players: PlayerRecord[]; localPlayerId: string | null };
    }
  | {
      type: 'networkSessionSynced';
      payload: {
        players: PlayerRecord[];
        active: boolean;
        nightStep: NetworkNightStepState | null;
        nightActions: Record<string, NetworkNightAction>;
        phase: PhaseId | null;
        phaseRound: number | null;
        revealOnDeath: boolean;
        alienChatMessages: AlienChatMessage[];
        dayEvents: NetworkDayEvent[];
        rematch?: RematchState | null;
      };
    }
  | { type: 'networkSessionEnded' }
  | {
      type: 'setPlayerRoleAcknowledged';
      payload: { playerId: string; acknowledged: boolean };
    }
  | { type: 'setPlayerReady'; payload: { playerId: string; ready: boolean } }
  | { type: 'generateAssignments' }
  | { type: 'advanceReveal' }
  | { type: 'startGame' }
  | { type: 'setPhase'; payload: PhaseId }
  | { type: 'resetGame' }
  | { type: 'startNightRound' }
  | {
      type: 'setNightTarget';
      payload: { role: NightRole; playerId: string | null };
    }
  | { type: 'resolveNight'; payload: NightResolution }
  | { type: 'resolveDayVote'; payload: DayResolution }
  | { type: 'prepareRematch' }
  | { type: 'setNetworkNightStep'; payload: NetworkNightStepState | null }
  | { type: 'syncPhase'; payload: PhaseId }
  | { type: 'setRematchState'; payload: RematchState | null };

type GameContextValue = {
  state: GameState;
  setMode: (mode: GameMode) => void;
  setPlayerCount: (count: number) => void;
  setPlayerName: (index: number, name: string) => void;
  setRoleCount: (roleId: RoleId, count: number) => void;
  setSingleRevealAfterDeath: (value: boolean) => void;
  startNetworkSession: (hostName: string) => Promise<{ ok: boolean; error?: string }>;
  endNetworkSession: () => Promise<void>;
  joinNetworkSession: (
    code: string,
    name: string,
    revealVote: boolean
  ) => Promise<{ ok: boolean; error?: string; sessionId?: string; playerId?: string; code?: string }>;
  linkNetworkSession: (options: { sessionId: string; code: string; localPlayerId: string | null }) => Promise<{ ok: boolean; error?: string }>;
  updateRevealVote: (playerId: string, revealVote: boolean) => Promise<{ ok: boolean; error?: string }>;
  setPlayerReady: (playerId: string, ready: boolean) => void;
  acknowledgePlayerRole: (playerId: string, acknowledged: boolean) => Promise<{ ok: boolean; error?: string }>;
  generateAssignments: () => { ok: boolean; errors?: string[] };
  advanceReveal: () => void;
  startGame: () => void;
  setPhase: (phase: PhaseId) => void;
  resetGame: () => void;
  setupSummary: SetupSummary;
  startNightRound: () => void;
  setNightTarget: (role: NightRole, playerId: string | null) => void;
  resolveNight: () => NightResolution;
  resolveDayVote: (options: { targetId: string | null; skip: boolean }) => DayResolution;
  prepareRematch: () => void;
  submitNetworkNightAction: (options: { playerId: string; targetId: string | null; confirmed: boolean; stepId: NightStepId; round: number }) => Promise<{ ok: boolean; error?: string }>;
  broadcastNightStep: (step: NetworkNightStepState | null) => Promise<{ ok: boolean; error?: string }>;
  sendAlienChatMessage: (message: string) => Promise<{ ok: boolean; error?: string }>;
  nominateDayTarget: (targetId: string | null) => Promise<{ ok: boolean; error?: string }>;
  supportDayNomination: (targetId: string, support: boolean) => Promise<{ ok: boolean; error?: string }>;
  setDayReady: (ready: boolean) => Promise<{ ok: boolean; error?: string }>;
  startDayVote: (candidates: string[]) => Promise<{ ok: boolean; error?: string }>;
  submitDayVote: (targetId: string | null) => Promise<{ ok: boolean; error?: string }>;
  setSkipSupport: (support: boolean) => Promise<{ ok: boolean; error?: string }>;
  startRematchVote: () => Promise<{ ok: boolean; error?: string }>;
  castRematchVote: (vote: RematchVoteOption) => Promise<{ ok: boolean; error?: string }>;
};

type SetupSummary = {
  nonCrewSelected: number;
  crewCount: number;
  errors: string[];
  definitions: Record<RoleId, RoleDefinition>;
  missingNames: number;
};

const roleDefaults = roleCatalog.reduce<RoleCounts>((acc, role) => {
  acc[role.id] = role.defaultCount ?? 0;
  return acc;
}, {} as RoleCounts);

function createPlayer(idNumber: number): PlayerRecord {
  return {
    id: `player-${idNumber}`,
    name: '',
    revealVote: null,
    ready: false,
    isHost: idNumber === 1,
    roleId: null,
    roleAcknowledged: false,
    alive: true,
  };
}

function buildInitialPlayers(count: number): PlayerRecord[] {
  return Array.from({ length: count }, (_unused, index) => createPlayer(index + 1));
}

function sanitizePlayers(players: PlayerRecord[], count: number): PlayerRecord[] {
  return players.slice(0, count).map((player, index) => ({
    ...player,
    name: player.name.trim() || `Katze ${index + 1}`,
    ready: false,
    roleId: null,
    roleAcknowledged: false,
    alive: true,
  }));
}

function createInitialState(): GameState {
  const players = buildInitialPlayers(6);
  return {
    mode: 'single',
    playerCount: players.length,
    players,
    playerIdCounter: players.length,
    singleRevealAfterDeath: false,
    revealOnDeath: false,
    networkSessionActive: false,
    networkSessionCode: null,
    networkSessionId: null,
    localPlayerId: null,
    roleCounts: roleDefaults,
    assignments: [],
    status: 'setup',
    currentPhase: 'night',
    round: 1,
    revealIndex: 0,
    nightLog: [],
    dayLog: [],
    outcome: null,
    networkNightStep: null,
    networkNightActions: {},
    alienChatMessages: [],
    networkDayEvents: [],
    rematchState: null,
  };
}

const initialState: GameState = createInitialState();

function generateSessionCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    const index = Math.floor(Math.random() * alphabet.length);
    code += alphabet[index];
  }
  return code;
}

function generateRematchPollId(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${stamp}-${random}`;
}

function computeRevealMajority(players: PlayerRecord[]): boolean {
  const { playable } = normalizeNetworkPlayers(players);
  const eligible = playable.length > 0 ? playable : players;
  if (eligible.length === 0) {
    return false;
  }
  const yesVotes = eligible.reduce((sum, player) => (player.revealVote ? sum + 1 : sum), 0);
  return yesVotes > eligible.length / 2;
}

function mapPlayerRow(row: SessionPlayerRow): PlayerRecord {
  const roleIdValue = row.role_id ?? null;
  const validRole =
    roleIdValue && roleCatalog.some((role) => role.id === roleIdValue)
      ? (roleIdValue as RoleId)
      : null;
  return {
    id: row.id,
    name: row.name?.trim() ?? '',
    revealVote: row.reveal_vote,
    ready: Boolean(row.ready),
    isHost: Boolean(row.is_host),
    roleId: validRole,
    roleAcknowledged: applyRoleAckFallback(row.id, Boolean(row.role_acknowledged)),
    alive: row.alive !== false,
  };
}

function splitPlayersByHost(players: PlayerRecord[]): {
  hosts: PlayerRecord[];
  nonHosts: PlayerRecord[];
} {
  const hosts: PlayerRecord[] = [];
  const nonHosts: PlayerRecord[] = [];
  players.forEach((player) => {
    if (player.isHost) {
      hosts.push(player);
    } else {
      nonHosts.push(player);
    }
  });
  return { hosts, nonHosts };
}

function normalizeNetworkPlayers(players: PlayerRecord[]): {
  ordered: PlayerRecord[];
  playable: PlayerRecord[];
} {
  const { hosts, nonHosts } = splitPlayersByHost(players);
  return {
    ordered: [...nonHosts, ...hosts],
    // Include hosts in playable so the session host can participate like any other player
    playable: [...nonHosts, ...hosts],
  };
}

const roleSyncState = { supported: true };
const nightSyncState = { supported: true };
const messageSyncState = { supported: true };
const localRoleAckFallback = new Map<string, boolean>();

function playerSelectColumns(): string {
  const baseColumns = ['id', 'name', 'reveal_vote', 'ready', 'is_host'];
  if (roleSyncState.supported) {
    baseColumns.push('role_id', 'role_acknowledged');
  }
  if (nightSyncState.supported) {
    baseColumns.push(
      'alive',
      'night_target_id',
      'night_action_step',
      'night_action_round',
      'night_action_locked',
      'night_updated_at'
    );
  }
  return baseColumns.join(', ');
}

function sanitizeRoleFields<T extends Record<string, unknown>>(fields: T): T {
  const clone = { ...fields } as Record<string, unknown>;
  if (!roleSyncState.supported) {
    delete clone.role_id;
    delete clone.role_acknowledged;
  }
  if (!nightSyncState.supported) {
    delete clone.alive;
    delete clone.night_target_id;
    delete clone.night_action_step;
    delete clone.night_action_round;
    delete clone.night_action_locked;
    delete clone.night_updated_at;
  }
  return clone as T;
}

type MissingPlayerColumnCategory = 'role' | 'night';

function classifyMissingPlayerColumn(error: unknown): MissingPlayerColumnCategory | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const code = (error as { code?: string }).code;
  if (typeof code === 'string' && code === '42703') {
    return 'role';
  }
  const message = (error as { message?: string }).message;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    if (lower.includes('role_acknowledged') || lower.includes('role_id')) {
      return 'role';
    }
    if (
      lower.includes('night_target_id') ||
      lower.includes('night_action_step') ||
      lower.includes('night_action_round') ||
      lower.includes('night_action_locked') ||
      lower.includes('night_updated_at') ||
      lower.includes('alive')
    ) {
      return 'night';
    }
  }
  return null;
}

type MessageErrorCategory = 'unavailable' | 'forbidden';

function classifyMessageError(error: unknown): MessageErrorCategory | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const code = (error as { code?: string }).code;
  if (typeof code === 'string') {
    if (code === '42P01' || code === '42703') {
      return 'unavailable';
    }
    if (code === '42501') {
      return 'forbidden';
    }
  }
  const message = (error as { message?: string }).message;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    if (lower.includes('permission denied')) {
      return 'forbidden';
    }
    if (lower.includes('session_messages') && (lower.includes('relation') || lower.includes('column'))) {
      return 'unavailable';
    }
  }
  return null;
}

function parseDayEvent(row: SessionMessageRow): NetworkDayEvent | null {
  if (row.channel !== DAY_EVENT_CHANNEL) {
    return null;
  }
  const actorId = row.player_id ?? '';
  if (!actorId || !row.message) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(row.message);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const basePayload = payload as { type?: unknown; round?: unknown };
  const type = typeof basePayload.type === 'string' ? basePayload.type : null;
  if (!type) {
    return null;
  }
  const roundSource =
    typeof basePayload.round === 'number'
      ? basePayload.round
      : typeof basePayload.round === 'string'
      ? Number.parseInt(basePayload.round, 10)
      : typeof row.round === 'number'
      ? row.round
      : null;
  if (typeof roundSource !== 'number' || Number.isNaN(roundSource)) {
    return null;
  }
  const round = roundSource;
  const createdAt =
    row.created_at && Date.parse(row.created_at) ? Date.parse(row.created_at) : Date.now();
  switch (type) {
    case 'nominate': {
      const rawTarget = (payload as { targetId?: unknown }).targetId;
      const targetId =
        typeof rawTarget === 'string' && rawTarget.trim().length > 0 ? rawTarget : null;
      return {
        id: row.id,
        type: 'nominate',
        actorId,
        round,
        createdAt,
        targetId,
      };
    }
    case 'support': {
      const rawTarget = (payload as { targetId?: unknown }).targetId;
      const targetId =
        typeof rawTarget === 'string' && rawTarget.trim().length > 0 ? rawTarget : null;
      if (!targetId) {
        return null;
      }
      const rawSupport = (payload as { support?: unknown }).support;
      const support = typeof rawSupport === 'boolean' ? rawSupport : true;
      return {
        id: row.id,
        type: 'support',
        actorId,
        round,
        createdAt,
        targetId,
        support,
      };
    }
    case 'ready': {
      const rawReady = (payload as { ready?: unknown }).ready;
      if (typeof rawReady !== 'boolean') {
        return null;
      }
      return {
        id: row.id,
        type: 'ready',
        actorId,
        round,
        createdAt,
        ready: rawReady,
      };
    }
    case 'startVote': {
      const rawCandidates = (payload as { candidates?: unknown }).candidates;
      if (!Array.isArray(rawCandidates)) {
        return null;
      }
      const candidates = rawCandidates.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      );
      if (candidates.length === 0) {
        return null;
      }
      return {
        id: row.id,
        type: 'startVote',
        actorId,
        round,
        createdAt,
        candidates,
      };
    }
    case 'vote': {
      const rawTarget = (payload as { targetId?: unknown }).targetId;
      const targetId =
        typeof rawTarget === 'string' && rawTarget.trim().length > 0 ? rawTarget : null;
      return {
        id: row.id,
        type: 'vote',
        actorId,
        round,
        createdAt,
        targetId,
      };
    }
    case 'skip': {
      const rawSupport = (payload as { support?: unknown }).support;
      const support =
        typeof rawSupport === 'boolean'
          ? rawSupport
          : rawSupport === undefined || rawSupport === null
          ? true
          : null;
      if (support === null) {
        return null;
      }
      return {
        id: row.id,
        type: 'skip',
        actorId,
        round,
        createdAt,
        support,
      };
    }
    case 'reset':
      return {
        id: row.id,
        type: 'reset',
        actorId,
        round,
        createdAt,
      };
    default:
      return null;
  }
}

function parseRematchEvent(row: SessionMessageRow): NetworkRematchEvent | null {
  if (row.channel !== REMATCH_CHANNEL) {
    return null;
  }
  const actorId = row.player_id ?? '';
  if (!actorId || !row.message) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(row.message);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const basePayload = payload as {
    type?: unknown;
    pollId?: unknown;
    vote?: unknown;
    result?: unknown;
    round?: unknown;
  };
  const type = typeof basePayload.type === 'string' ? basePayload.type : null;
  if (!type) {
    return null;
  }
  const pollId =
    typeof basePayload.pollId === 'string' && basePayload.pollId.trim().length > 0
      ? basePayload.pollId
      : null;
  if (!pollId) {
    return null;
  }
  const createdAt =
    row.created_at && Date.parse(row.created_at) ? Date.parse(row.created_at) : Date.now();
  const roundSource =
    typeof basePayload.round === 'number'
      ? basePayload.round
      : typeof basePayload.round === 'string'
      ? Number.parseInt(basePayload.round, 10)
      : typeof row.round === 'number'
      ? row.round
      : null;
  const round =
    typeof roundSource === 'number' && !Number.isNaN(roundSource) ? roundSource : null;
  if (type === 'request') {
    return {
      id: row.id,
      type: 'request',
      actorId,
      pollId,
      createdAt,
      round,
    };
  }
  if (type === 'vote') {
    const voteValue =
      basePayload.vote === 'yes' || basePayload.vote === 'no'
        ? (basePayload.vote as RematchVoteOption)
        : null;
    if (!voteValue) {
      return null;
    }
    return {
      id: row.id,
      type: 'vote',
      actorId,
      pollId,
      createdAt,
      vote: voteValue,
      round,
    };
  }
  if (type === 'result') {
    const resultValue =
      basePayload.result === 'accepted' || basePayload.result === 'rejected'
        ? (basePayload.result as RematchResultType)
        : null;
    if (!resultValue) {
      return null;
    }
    return {
      id: row.id,
      type: 'result',
      actorId,
      pollId,
      createdAt,
      result: resultValue,
      round,
    };
  }
  return null;
}

function deriveRematchState(events: NetworkRematchEvent[]): RematchState | null {
  if (events.length === 0) {
    return null;
  }
  let state: RematchState | null = null;
  events.forEach((event) => {
    switch (event.type) {
      case 'request': {
        state = {
          pollId: event.pollId,
          requestedBy: event.actorId,
          requestedAt: event.createdAt,
          round: event.round ?? null,
          votes: {},
          resolved: false,
          result: null,
          resolvedAt: null,
          resolvedBy: null,
        };
        break;
      }
      case 'vote': {
        if (!state || state.pollId !== event.pollId) {
          break;
        }
        state = {
          ...state,
          votes: {
            ...state.votes,
            [event.actorId]: event.vote,
          },
        };
        break;
      }
      case 'result': {
        if (!state || state.pollId !== event.pollId) {
          break;
        }
        state = {
          ...state,
          resolved: true,
          result: event.result,
          resolvedAt: event.createdAt,
          resolvedBy: event.actorId,
        };
        break;
      }
      default:
        break;
    }
  });
  return state;
}

function updateRoleAckFallback(playerId: string, acknowledged: boolean) {
  if (acknowledged) {
    localRoleAckFallback.set(playerId, true);
  } else {
    localRoleAckFallback.delete(playerId);
  }
}

function applyRoleAckFallback(playerId: string, baseValue: boolean): boolean {
  if (!roleSyncState.supported) {
    const fallback = localRoleAckFallback.get(playerId);
    if (fallback !== undefined) {
      return fallback;
    }
  }
  return baseValue;
}

function clearRoleAckFallback() {
  localRoleAckFallback.clear();
}

async function loadSessionPlayers(client: ReturnType<typeof getSupabaseClient>, sessionId: string) {
  const columns = playerSelectColumns();
  const { data, error } = await client
    .from('session_players')
    .select(columns)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    const category = classifyMissingPlayerColumn(error);
    if (category === 'role' && roleSyncState.supported) {
      roleSyncState.supported = false;
      return loadSessionPlayers(client, sessionId);
    }
    if (category === 'night' && nightSyncState.supported) {
      nightSyncState.supported = false;
      return loadSessionPlayers(client, sessionId);
    }
    throw error;
  }
  return (data ?? []) as unknown as SessionPlayerRow[];
}

async function loadSessionMessages(
  client: ReturnType<typeof getSupabaseClient>,
  sessionId: string,
  channels: string[]
): Promise<SessionMessageRow[]> {
  if (!messageSyncState.supported || channels.length === 0) {
    return [];
  }
  const { data, error } = await client
    .from('session_messages')
    .select('id, player_id, message, channel, round, step_id, created_at')
    .eq('session_id', sessionId)
    .in('channel', channels)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    const category = classifyMessageError(error);
    if (category === 'unavailable' && messageSyncState.supported) {
      messageSyncState.supported = false;
      return [];
    }
    if (category === 'forbidden') {
      return [];
    }
    throw error;
  }
  return (data ?? []) as SessionMessageRow[];
}

async function insertSessionPlayer(
  client: ReturnType<typeof getSupabaseClient>,
  values: Record<string, unknown>
): Promise<SessionPlayerRow | null> {
  const payload = sanitizeRoleFields(values);
  const columns = playerSelectColumns();
  const { data, error } = await client
    .from('session_players')
    .insert(payload)
    .select(columns)
    .single();
  if (error) {
    const category = classifyMissingPlayerColumn(error);
    if (category === 'role' && roleSyncState.supported) {
      roleSyncState.supported = false;
      return insertSessionPlayer(client, values);
    }
    if (category === 'night' && nightSyncState.supported) {
      nightSyncState.supported = false;
      return insertSessionPlayer(client, values);
    }
    throw error;
  }
  return (data as unknown as SessionPlayerRow) ?? null;
}

async function updateSessionPlayer(
  client: ReturnType<typeof getSupabaseClient>,
  playerId: string,
  values: Record<string, unknown>
): Promise<void> {
  const performUpdate = async (): Promise<void> => {
    const payload = sanitizeRoleFields(values);
    const { error } = await client
      .from('session_players')
      .update(payload)
      .eq('id', playerId);
    if (error) {
      const category = classifyMissingPlayerColumn(error);
      if (category === 'role' && roleSyncState.supported) {
        roleSyncState.supported = false;
        await performUpdate();
        return;
      }
      if (category === 'night' && nightSyncState.supported) {
        nightSyncState.supported = false;
        await performUpdate();
        return;
      }
      throw error;
    }
  };
  await performUpdate();
}

const joinedSessionsByDevice = new Set<string>();

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sumSelectedNonCrew(roleCounts: RoleCounts): number {
  return selectableRoles.reduce((sum, role) => {
    if (role.id === 'dorfkatze') {
      return sum;
    }
    return sum + (roleCounts[role.id] ?? 0);
  }, 0);
}

function deriveCrewCount(playerCount: number, roleCounts: RoleCounts): number {
  const nonCrew = sumSelectedNonCrew(roleCounts);
  return Math.max(playerCount - nonCrew, 0);
}

function validateSetup(playerCount: number, roleCounts: RoleCounts): string[] {
  const errors: string[] = [];
  if (playerCount < 4) {
    errors.push('Mindestens 4 Katzen benötigt, damit Spannung entsteht.');
  }
  const nonCrew = sumSelectedNonCrew(roleCounts);
  if (nonCrew > playerCount) {
    errors.push('Mehr Spezialrollen als Katzen ausgewählt.');
  }
  const alienCount = roleCounts.alienKatze ?? 0;
  if (alienCount < (getRoleDefinition('alienKatze').minCount ?? 0)) {
    errors.push('Mindestens eine Alien Katze muss im Spiel sein.');
  }
  if (alienCount >= playerCount) {
    errors.push('Alien Katzen dürfen nicht alle Plätze belegen.');
  }
  return errors;
}

function createNightRecord(round: number): NightRecord {
  return {
    round,
    alienTargetId: null,
    doctorTargetId: null,
    seerTargetId: null,
    seerResultTeam: null,
    casualties: [],
    saved: [],
    resolved: false,
  };
}

function evaluateOutcome(assignments: PlayerAssignment[]): GameOutcome | null {
  const aliveAssignments = assignments.filter((assignment) => assignment.alive);
  if (aliveAssignments.length === 0) {
    return null;
  }
  const alienCount = aliveAssignments.reduce((count, assignment) => {
    const role = getRoleDefinition(assignment.roleId);
    return role.team === 'aliens' ? count + 1 : count;
  }, 0);
  const villageCount = aliveAssignments.length - alienCount;
  if (alienCount === 0) {
    return {
      winner: 'dorf',
      reason: 'Alle Alienkatzen wurden verbannt.',
    };
  }
  if (alienCount >= villageCount) {
    return {
      winner: 'aliens',
      reason: 'Die Alienkatzen sind zahlenmäßig gleichauf mit dem Dorf.',
    };
  }
  return null;
}

function computeNightOutcome(state: GameState): NightResolution {
  const round = state.round;
  const activeRecord =
    state.nightLog.find((entry) => entry.round === round) ?? createNightRecord(round);
  const casualties: string[] = [];
  const saved: string[] = [];
  const { alienTargetId, doctorTargetId, seerTargetId } = activeRecord;

  if (alienTargetId) {
    const targetAssignment = state.assignments.find((entry) => entry.playerId === alienTargetId);
    if (targetAssignment?.alive !== false) {
      if (doctorTargetId && doctorTargetId === alienTargetId) {
        saved.push(alienTargetId);
      } else {
        casualties.push(alienTargetId);
      }
    }
  }

  let seerInsight: { playerId: string; team: TeamId } | null = null;
  if (seerTargetId) {
    const seerAssignment = state.assignments.find((entry) => entry.playerId === seerTargetId);
    if (seerAssignment) {
      seerInsight = {
        playerId: seerAssignment.playerId,
        team: getRoleDefinition(seerAssignment.roleId).team,
      };
    }
  }

  return {
    round,
    casualties,
    saved,
    seerInsight,
  };
}

function applyNightTarget(
  record: NightRecord,
  role: 'alienKatze' | 'seher' | 'doktor',
  playerId: string | null,
  state: GameState
): NightRecord {
  if (role === 'alienKatze') {
    return { ...record, alienTargetId: playerId };
  }
  if (role === 'doktor') {
    if (playerId) {
      const previous = state.nightLog.find((entry) => entry.round === state.round - 1);
      if (previous?.doctorTargetId === playerId) {
        return record;
      }
    }
    return { ...record, doctorTargetId: playerId };
  }
  let seerResultTeam: TeamId | null = null;
  if (playerId) {
    const assignment = state.assignments.find((entry) => entry.playerId === playerId);
    if (assignment) {
      seerResultTeam = getRoleDefinition(assignment.roleId).team;
    }
  }
  return { ...record, seerTargetId: playerId, seerResultTeam };
}

function buildAssignments(players: PlayerRecord[], roleCounts: RoleCounts): PlayerAssignment[] {
  const pool: RoleId[] = [];
  roleCatalog.forEach((role) => {
    const count = roleCounts[role.id] ?? 0;
    for (let i = 0; i < count; i += 1) {
      pool.push(role.id);
    }
  });
  if (pool.length !== players.length) {
    throw new Error('Rollenanzahl passt nicht zur Anzahl an Katzen.');
  }
  const shuffled = shuffle(pool);
  return players.map((player, index) => ({
    playerId: player.id,
    playerName: player.name,
    order: index + 1,
    roleId: shuffled[index],
    revealed: false,
    alive: true,
  }));
}

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'setMode':
      return { ...state, mode: action.payload };
    case 'setPlayerCount': {
      const nextCount = Math.max(1, action.payload);
      let nextPlayers = state.players.slice(0, nextCount);
      let nextCounter = state.playerIdCounter;
      if (nextCount > state.players.length) {
        nextPlayers = [...state.players];
        while (nextPlayers.length < nextCount) {
          nextCounter += 1;
          nextPlayers.push(createPlayer(nextCounter));
        }
      }
      return {
        ...state,
        playerCount: nextCount,
        players: nextPlayers,
        playerIdCounter: nextCounter,
      };
    }
    case 'setPlayerName': {
      const { index, name } = action.payload;
      if (index < 0 || index >= state.players.length) {
        return state;
      }
      const nextPlayers = state.players.map((player, idx) =>
        idx === index ? { ...player, name } : player
      );
      return { ...state, players: nextPlayers };
    }
    case 'setRoleCount': {
      const { roleId, count } = action.payload;
      const nextCounts = { ...state.roleCounts, [roleId]: Math.max(0, count) };
      return { ...state, roleCounts: nextCounts };
    }
    case 'setSingleRevealAfterDeath':
      return { ...state, singleRevealAfterDeath: action.payload };
    case 'networkSessionStarted': {
      const { sessionId, code, players, localPlayerId } = action.payload;
      const { ordered, playable } = normalizeNetworkPlayers(players);
      clearRoleAckFallback();
      return {
        ...createInitialState(),
        mode: 'network',
        players: ordered,
        playerCount: playable.length,
        playerIdCounter: ordered.length,
        networkSessionActive: true,
        networkSessionCode: code,
        networkSessionId: sessionId,
        localPlayerId,
        revealOnDeath: computeRevealMajority(ordered),
        networkNightStep: null,
        networkNightActions: {},
        alienChatMessages: [],
        networkDayEvents: [],
      };
    }
    case 'networkSessionSynced': {
      if (!state.networkSessionActive) {
        return state;
      }
      const {
        players,
        active,
        nightStep,
        nightActions,
        phase,
        phaseRound,
        revealOnDeath,
        alienChatMessages,
        dayEvents,
        rematch,
      } =
        action.payload;
      const { ordered, playable } = normalizeNetworkPlayers(players);
      const effectivePhase = phase ?? state.currentPhase;
      const nextStatus =
        phase === 'night' || phase === 'day' ? 'inProgress' : state.status;
      return {
        ...state,
        players: ordered,
        playerCount: playable.length,
        revealOnDeath,
        networkSessionActive: active,
        networkNightStep: nightStep,
        networkNightActions: nightActions,
        currentPhase: effectivePhase,
        round: phaseRound ?? state.round,
        status: nextStatus,
        alienChatMessages,
        networkDayEvents: dayEvents,
  rematchState: rematch ?? null,
      };
    }
    case 'networkSessionEnded':
      return createInitialState();
    case 'setPlayerRoleAcknowledged': {
      const players = state.players.map((player) =>
        player.id === action.payload.playerId
          ? { ...player, roleAcknowledged: action.payload.acknowledged }
          : player
      );
      updateRoleAckFallback(action.payload.playerId, action.payload.acknowledged);
      return {
        ...state,
        players,
      };
    }
    case 'setPlayerReady': {
      const players = state.players.map((player) =>
        player.id === action.payload.playerId
          ? { ...player, ready: action.payload.ready }
          : player
      );
      const assignments = state.assignments.map((assignment) =>
        assignment.playerId === action.payload.playerId
          ? { ...assignment, revealed: action.payload.ready }
          : assignment
      );
      return {
        ...state,
        players,
        assignments,
      };
    }
    case 'generateAssignments': {
      // Include hosts in the pool of players for assignment so a host can also receive a role
      // when the session is configured to let the host participate.
      const basePlayers = state.players;
      const effectiveCount = Math.min(state.playerCount, basePlayers.length);
      const preparedPlayers = sanitizePlayers(basePlayers, effectiveCount);
      const crewCount = deriveCrewCount(preparedPlayers.length, state.roleCounts);
      const nextCounts = { ...state.roleCounts, dorfkatze: crewCount };
      let playersForAssignment = shuffle(preparedPlayers);
      // If there's a host player in the full player list but the host was
      // excluded by the sanitize/slice above, make sure the host receives a
      // role by swapping them into the assignment pool. This preserves the
      // intended playerCount while allowing the host to participate.
      const hostInState = state.players.find((p) => p.isHost) ?? null;
      if (hostInState && !playersForAssignment.some((p) => p.isHost)) {
        // Replace the last entry with the host so total count stays the same.
        playersForAssignment = [...playersForAssignment.slice(0, -1), hostInState];
      }
      const assignments = buildAssignments(playersForAssignment, nextCounts);
      clearRoleAckFallback();
      // Use the prepared players as the nextPlayers (they include hosts now)
      const nextPlayers = preparedPlayers;
      const assignmentRoleByPlayer = assignments.reduce<Record<string, RoleId>>((map, entry) => {
        map[entry.playerId] = entry.roleId;
        return map;
      }, {});
      const playersWithRoles = nextPlayers.map((player) => ({
        ...player,
        roleId: assignmentRoleByPlayer[player.id] ?? null,
        roleAcknowledged: false,
        ready: false,
      }));
      return {
        ...state,
        players:
          state.mode === 'network'
            ? normalizeNetworkPlayers(playersWithRoles).ordered
            : playersWithRoles,
        roleCounts: nextCounts,
        assignments,
        revealOnDeath: state.mode === 'single' ? state.singleRevealAfterDeath : state.revealOnDeath,
        status: 'reveal',
        revealIndex: 0,
        currentPhase: 'night',
        round: 1,
        nightLog: [],
        dayLog: [],
        outcome: null,
        rematchState: null,
      };
    }
    case 'advanceReveal': {
      const nextAssignments = [...state.assignments];
      if (nextAssignments[state.revealIndex]) {
        nextAssignments[state.revealIndex] = {
          ...nextAssignments[state.revealIndex],
          revealed: true,
        };
      }
      const nextIndex = Math.min(state.revealIndex + 1, nextAssignments.length);
      return {
        ...state,
        assignments: nextAssignments,
        revealIndex: nextIndex,
      };
    }
    case 'startGame':
      return {
        ...state,
        status: 'inProgress',
        currentPhase: 'night',
        networkNightStep: null,
        networkNightActions: {},
      };
    case 'setPhase':
      return {
        ...state,
        currentPhase: action.payload,
        status: 'inProgress',
      };
    case 'setNetworkNightStep':
      return {
        ...state,
        networkNightStep: action.payload,
      };
    case 'syncPhase':
      return {
        ...state,
        currentPhase: action.payload,
        status: 'inProgress',
      };
    case 'startNightRound': {
      const hasRecord = state.nightLog.some((entry) => entry.round === state.round);
      if (hasRecord) {
        return state;
      }
      return {
        ...state,
        nightLog: [...state.nightLog, createNightRecord(state.round)],
      };
    }
    case 'setNightTarget': {
      let updated = false;
      const nightLog = state.nightLog.map((record) => {
        if (record.round !== state.round) {
          return record;
        }
        updated = true;
        return applyNightTarget(record, action.payload.role, action.payload.playerId, state);
      });
      if (!updated) {
        const newRecord = applyNightTarget(
          createNightRecord(state.round),
          action.payload.role,
          action.payload.playerId,
          state
        );
        return {
          ...state,
          nightLog: [...state.nightLog, newRecord],
        };
      }
      return {
        ...state,
        nightLog,
      };
    }
    case 'resolveNight': {
      const { round, casualties, saved } = action.payload;
      const nextAssignments = state.assignments.map((assignment) => {
        if (casualties.includes(assignment.playerId)) {
          return ({
            ...assignment,
            alive: false,
            eliminatedBy: 'night',
            eliminatedInRound: round,
          } as PlayerAssignment);
        }
        return assignment;
      });
      const nightLog = state.nightLog.map((record) =>
        record.round === round ? { ...record, casualties, saved, resolved: true } : record
      );
      const existingDay = state.dayLog.find((entry) => entry.round === round);
      const dayLog = existingDay
        ? state.dayLog.map((entry) =>
            entry.round === round ? { ...entry, casualties } : entry
          )
        : [...state.dayLog, { round, casualties, votedOutId: null, skipped: false }];
      const outcome = state.outcome ?? evaluateOutcome(nextAssignments as PlayerAssignment[]);
      return {
        ...state,
        assignments: nextAssignments as PlayerAssignment[],
        nightLog,
        dayLog,
        outcome,
      };
    }
    case 'resolveDayVote': {
      const { round, votedOutId, skipped } = action.payload;
      let assignments = state.assignments;
      if (votedOutId) {
        assignments = state.assignments.map((assignment) =>
          assignment.playerId === votedOutId
            ? ({
                ...assignment,
                alive: false,
                eliminatedBy: 'day',
                eliminatedInRound: round,
              } as PlayerAssignment)
            : assignment
        );
      }
      const existingDay = state.dayLog.find((entry) => entry.round === round);
      const dayLog = existingDay
        ? state.dayLog.map((entry) =>
            entry.round === round ? { ...entry, votedOutId, skipped } : entry
          )
        : [...state.dayLog, { round, casualties: [], votedOutId, skipped }];
      const outcome = state.outcome ?? evaluateOutcome(assignments);
      return {
        ...state,
        assignments,
        dayLog,
        outcome,
        round: state.round + 1,
      };
    }
    case 'prepareRematch': {
      clearRoleAckFallback();
      const players = state.players.slice(0, state.playerCount).map((player, index) => ({
        ...player,
        name: player.name.trim() || `Katze ${index + 1}`,
        ready: false,
        revealVote: null,
        roleId: null,
        roleAcknowledged: false,
        alive: true,
      }));
      return {
        ...state,
        status: 'setup',
        currentPhase: 'night',
        round: 1,
        revealIndex: 0,
        assignments: [],
        nightLog: [],
        dayLog: [],
        outcome: null,
        players,
        playerCount: players.length,
        networkNightStep: null,
        networkNightActions: {},
        alienChatMessages: [],
        rematchState: null,
      };
    }
    case 'resetGame':
      return createInitialState();
    case 'setRematchState':
      return {
        ...state,
        rematchState: action.payload,
      };
    default:
      return state;
  }
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setupSummary = useMemo<SetupSummary>(() => {
    const errors = validateSetup(state.playerCount, state.roleCounts);
    const crewCount = deriveCrewCount(state.playerCount, state.roleCounts);
    const definitions = roleCatalog.reduce<Record<RoleId, RoleDefinition>>((map, role) => {
      map[role.id] = role;
      return map;
    }, {} as Record<RoleId, RoleDefinition>);
    const nonCrewSelected = sumSelectedNonCrew(state.roleCounts);
    const relevantPlayers =
      state.mode === 'network'
        ? normalizeNetworkPlayers(state.players).playable.slice(0, state.playerCount)
        : state.players.slice(0, state.playerCount);
    const missingNames = relevantPlayers.reduce(
      (count, player) => (player.name.trim() ? count : count + 1),
      0
    );
    return { errors, crewCount, definitions, nonCrewSelected, missingNames };
  }, [state.mode, state.playerCount, state.players, state.roleCounts]);

  const sessionIdRef = useRef<string | null>(state.networkSessionId);
  const assignmentSyncKeyRef = useRef<string | null>(null);
  const aliveSyncKeyRef = useRef<string | null>(null);
  const rematchResolutionRef = useRef<{ pollId: string; result: RematchResultType } | null>(null);
  const rematchHandledRef = useRef<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = state.networkSessionId;
  }, [state.networkSessionId]);

  useEffect(() => {
    if (!state.networkSessionActive) {
      assignmentSyncKeyRef.current = null;
      aliveSyncKeyRef.current = null;
    }
  }, [state.networkSessionActive, state.networkSessionId]);

  const localPlayer = useMemo(
    () => state.players.find((player) => player.id === state.localPlayerId) ?? null,
    [state.players, state.localPlayerId]
  );
  const isLocalNetworkHost = Boolean(localPlayer?.isHost);

  const refreshNetworkSession = useCallback(
    async (explicitSessionId?: string) => {
      const sessionId = explicitSessionId ?? sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      try {
        const client = getSupabaseClient();
        const { data: sessionData, error: sessionError } = await client
          .from('game_sessions')
          .select(
            'id, active, reveal_on_death, phase, phase_round, night_step_id, night_step_index, night_step_title, night_step_description, night_step_role, night_step_allow_target'
          )
          .eq('id', sessionId)
          .maybeSingle();
        if (sessionError) {
          if (typeof sessionError === 'object' && sessionError !== null) {
            const message = (sessionError as { message?: string }).message ?? '';
            if (message.toLowerCase().includes('permission denied')) {
              return {
                ok: false,
                error:
                  'Zugriff auf Supabase verweigert. Prüfe bitte die RLS-Policies für game_sessions.',
              };
            }
          }
          throw sessionError;
        }
        if (!sessionData) {
          joinedSessionsByDevice.delete(sessionId);
          dispatch({ type: 'networkSessionEnded' });
          return;
        }
        if (sessionData.active === false) {
          joinedSessionsByDevice.delete(sessionId);
          dispatch({ type: 'networkSessionEnded' });
          return;
        }
        const playersData = await loadSessionPlayers(client, sessionId);
        const players = playersData.map(mapPlayerRow);
        const remotePhase =
          sessionData.phase === 'day'
            ? 'day'
            : sessionData.phase === 'night'
            ? 'night'
            : null;
        const phaseRound =
          typeof sessionData.phase_round === 'number' ? sessionData.phase_round : null;
        let nightStep: NetworkNightStepState | null = null;
        if (isNightStepId(sessionData.night_step_id)) {
          nightStep = {
            round: phaseRound ?? state.round,
            stepIndex: sessionData.night_step_index ?? 0,
            stepId: sessionData.night_step_id,
            title: sessionData.night_step_title ?? '',
            description: sessionData.night_step_description ?? '',
            roleId: isNightRole(sessionData.night_step_role) ? sessionData.night_step_role : null,
            allowTargetSelection: Boolean(sessionData.night_step_allow_target),
          };
        }
        const playerNameLookup = new Map<string, string>();
        players.forEach((player) => {
          playerNameLookup.set(player.id, player.name.trim() || 'Unbekannt');
        });
        const nightActions = playersData.reduce<Record<string, NetworkNightAction>>((map, row) => {
          if (!isNightStepId(row.night_action_step)) {
            return map;
          }
          const updated =
            row.night_updated_at && Date.parse(row.night_updated_at)
              ? Date.parse(row.night_updated_at)
              : Date.now();
          map[row.id] = {
            round: Number(row.night_action_round ?? phaseRound ?? state.round),
            stepId: row.night_action_step,
            targetId: row.night_target_id ?? null,
            confirmed: Boolean(row.night_action_locked),
            updatedAt: updated,
          };
          return map;
        }, {});
        let alienChatMessages: AlienChatMessage[] = [];
        let dayEvents: NetworkDayEvent[] = [];
        let rematchState: RematchState | null = null;
        if (messageSyncState.supported) {
          try {
            const messageRows = await loadSessionMessages(client, sessionId, [
              ALIEN_CHAT_CHANNEL,
              DAY_EVENT_CHANNEL,
              REMATCH_CHANNEL,
            ]);
            const chatEntries: AlienChatMessage[] = [];
            const dayEntries: NetworkDayEvent[] = [];
            const rematchEntries: NetworkRematchEvent[] = [];
            messageRows.forEach((row) => {
              if (row.channel === ALIEN_CHAT_CHANNEL) {
                const playerId = row.player_id ?? '';
                if (!playerId || !row.message) {
                  return;
                }
                const createdAt =
                  row.created_at && Date.parse(row.created_at)
                    ? Date.parse(row.created_at)
                    : Date.now();
                chatEntries.push({
                  id: row.id,
                  playerId,
                  playerName: playerNameLookup.get(playerId) ?? 'Unbekannt',
                  body: row.message ?? '',
                  createdAt,
                  round: row.round,
                });
                return;
              }
              if (row.channel === DAY_EVENT_CHANNEL) {
                const event = parseDayEvent(row);
                if (event) {
                  dayEntries.push(event);
                }
              }
              if (row.channel === REMATCH_CHANNEL) {
                const rematchEvent = parseRematchEvent(row);
                if (rematchEvent) {
                  rematchEntries.push(rematchEvent);
                }
              }
            });
            chatEntries.sort((a, b) => a.createdAt - b.createdAt);
            dayEntries.sort((a, b) => {
              if (a.round !== b.round) {
                return a.round - b.round;
              }
              if (a.createdAt !== b.createdAt) {
                return a.createdAt - b.createdAt;
              }
              return a.id.localeCompare(b.id);
            });
            alienChatMessages = chatEntries;
            dayEvents = dayEntries;
            rematchState = deriveRematchState(rematchEntries);
          } catch (error) {
            console.warn('Supabase Nachrichtensync fehlgeschlagen', error);
            alienChatMessages = [];
            dayEvents = [];
            rematchState = null;
          }
        }
        const revealOnDeath =
          typeof sessionData.reveal_on_death === 'boolean'
            ? sessionData.reveal_on_death
            : computeRevealMajority(players);
        dispatch({
          type: 'networkSessionSynced',
          payload: {
            players,
            active: true,
            nightStep,
            nightActions,
            phase: remotePhase,
            phaseRound,
            revealOnDeath,
            alienChatMessages,
            dayEvents,
            rematch: rematchState,
          },
        });
      } catch (error) {
        console.warn('Supabase Sync fehlgeschlagen', error);
      }
    },
    [dispatch, state.currentPhase, state.round]
  );

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!state.networkSessionActive || !state.networkSessionId) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    refreshNetworkSession(state.networkSessionId);
    pollRef.current = setInterval(() => {
      refreshNetworkSession();
    }, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state.networkSessionActive, state.networkSessionId, refreshNetworkSession]);

  useEffect(() => {
    if (!state.networkSessionActive || !state.networkSessionId) {
      return;
    }
    if (state.assignments.length === 0) {
      assignmentSyncKeyRef.current = null;
      return;
    }
    const key = state.assignments
      .map((entry) => `${entry.playerId}:${entry.roleId}`)
      .sort()
      .join('|');
    if (assignmentSyncKeyRef.current === key) {
      return;
    }
    assignmentSyncKeyRef.current = key;
    void (async () => {
      try {
        const client = getSupabaseClient();
        await Promise.all(
          state.assignments.map(async (assignment) => {
            updateRoleAckFallback(assignment.playerId, false);
            await updateSessionPlayer(client, assignment.playerId, {
              role_id: assignment.roleId,
              role_acknowledged: false,
              ready: false,
            });
          })
        );
      } catch (error) {
        console.error('Supabase syncAssignments', error);
      }
    })();
  }, [state.assignments, state.networkSessionActive, state.networkSessionId]);

  useEffect(() => {
    if (!state.networkSessionActive || !state.networkSessionId || !isLocalNetworkHost) {
      aliveSyncKeyRef.current = null;
      return;
    }
    if (state.assignments.length === 0) {
      return;
    }
    const key = state.assignments
      .map((entry) => `${entry.playerId}:${entry.alive ? '1' : '0'}`)
      .sort()
      .join('|');
    if (aliveSyncKeyRef.current === key) {
      return;
    }
    aliveSyncKeyRef.current = key;
    void (async () => {
      try {
        const client = getSupabaseClient();
        await Promise.all(
          state.assignments.map((assignment) =>
            updateSessionPlayer(client, assignment.playerId, {
              alive: assignment.alive,
            })
          )
        );
        await refreshNetworkSession();
      } catch (error) {
        console.error('Supabase syncAlive', error);
      }
    })();
  }, [
    isLocalNetworkHost,
    refreshNetworkSession,
    state.assignments,
    state.networkSessionActive,
    state.networkSessionId,
  ]);

  const startNetworkSession = useCallback(
    async (hostName: string) => {
      const trimmedName = hostName.trim() || 'Host';
      try {
        const client = getSupabaseClient();
        let sessionRecord: SessionRow | null = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const code = generateSessionCode();
          const { data, error } = await client
            .from('game_sessions')
            .insert({ code, host_name: trimmedName, active: true })
            .select('id, code, active, reveal_on_death')
            .single();
          if (error) {
            if ((error as { code?: string }).code === '23505') {
              continue;
            }
            throw error;
          }
          sessionRecord = data as SessionRow;
          break;
        }
        if (!sessionRecord) {
          return { ok: false, error: 'Sitzung konnte nicht erstellt werden. Bitte erneut versuchen.' };
        }
        const hostPlayerRow = await insertSessionPlayer(client, {
          session_id: sessionRecord.id,
          name: trimmedName,
          reveal_vote: true,
          ready: false,
          is_host: true,
        });
        const players = hostPlayerRow ? [mapPlayerRow(hostPlayerRow)] : [];
        dispatch({
          type: 'networkSessionStarted',
          payload: {
            sessionId: sessionRecord.id,
            code: sessionRecord.code,
            players,
            localPlayerId: hostPlayerRow?.id ?? null,
          },
        });
        await refreshNetworkSession(sessionRecord.id);
        return { ok: true };
      } catch (error) {
        console.error('Supabase startNetworkSession', error);
        return {
          ok: false,
          error: 'Sitzung konnte nicht erstellt werden. Prüfe bitte deine Verbindung.',
        };
      }
    },
    [dispatch, refreshNetworkSession]
  );

  const endNetworkSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      try {
        const client = getSupabaseClient();
        await client.from('game_sessions').update({ active: false }).eq('id', sessionId);
      } catch (error) {
        console.warn('Supabase endNetworkSession', error);
      }
      joinedSessionsByDevice.delete(sessionId);
    }
    dispatch({ type: 'networkSessionEnded' });
  }, [dispatch]);

  const joinNetworkSession = useCallback(
    async (code: string, name: string, revealVote: boolean) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return { ok: false, error: 'Name darf nicht leer sein.' };
      }
      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode) {
        return { ok: false, error: 'Bitte einen Code eingeben.' };
      }
      try {
        const client = getSupabaseClient();
        const { data: sessionData, error: sessionError } = await client
          .from('game_sessions')
          .select('id, active')
          .eq('code', normalizedCode)
          .maybeSingle();
        if (sessionError) {
          throw sessionError;
        }
        if (!sessionData || sessionData.active === false) {
          return { ok: false, error: 'Sitzung nicht gefunden oder bereits beendet.' };
        }
        if (joinedSessionsByDevice.has(sessionData.id)) {
          return {
            ok: false,
            error: 'Dieses Gerät ist bereits für diese Sitzung eingetragen.',
          };
        }
        let playerRow: SessionPlayerRow | null = null;
        try {
          playerRow = await insertSessionPlayer(client, {
            session_id: sessionData.id,
            name: trimmedName,
            reveal_vote: revealVote,
            ready: false,
            is_host: false,
          });
        } catch (insertError) {
          if ((insertError as { code?: string }).code === '23505') {
            return { ok: false, error: 'Dieser Name ist bereits vergeben.' };
          }
          if (typeof insertError === 'object' && insertError !== null) {
            const message = (insertError as { message?: string }).message ?? '';
            if (message.toLowerCase().includes('permission denied')) {
              return {
                ok: false,
                error:
                  'Zugriff auf Supabase verweigert. Prüfe bitte die RLS-Policies für session_players.',
              };
            }
          }
          throw insertError;
        }
        joinedSessionsByDevice.add(sessionData.id);
        return {
          ok: true,
          sessionId: sessionData.id,
          playerId: playerRow?.id,
          code: normalizedCode,
        };
      } catch (error) {
        console.error('Supabase joinNetworkSession', error);
        return { ok: false, error: 'Beitritt fehlgeschlagen. Versuche es erneut.' };
      }
    },
    []
  );

  const linkNetworkSession = useCallback(
    async ({
      sessionId,
      code,
      localPlayerId,
    }: {
      sessionId: string;
      code: string;
      localPlayerId: string | null;
    }) => {
      try {
        const client = getSupabaseClient();
        const playersData = await loadSessionPlayers(client, sessionId);
        const players = playersData.map(mapPlayerRow);
        dispatch({
          type: 'networkSessionStarted',
          payload: {
            sessionId,
            code,
            players,
            localPlayerId,
          },
        });
        await refreshNetworkSession(sessionId);
        return { ok: true };
      } catch (error) {
        console.error('Supabase linkNetworkSession', error);
        return { ok: false, error: 'Sitzung konnte nicht geladen werden.' };
      }
    },
    [dispatch, refreshNetworkSession]
  );

  const updateRevealVote = useCallback(
    async (playerId: string, revealVote: boolean) => {
      if (!state.networkSessionActive || !state.networkSessionId) {
        return { ok: false, error: 'Keine aktive Sitzung.' };
      }
      try {
        const client = getSupabaseClient();
        const { error } = await client
          .from('session_players')
          .update({ reveal_vote: revealVote })
          .eq('id', playerId);
        if (error) {
          throw error;
        }
        await refreshNetworkSession();
        return { ok: true };
      } catch (error) {
        console.error('Supabase updateRevealVote', error);
        return { ok: false, error: 'Stimme konnte nicht aktualisiert werden.' };
      }
    },
    [refreshNetworkSession, state.networkSessionActive, state.networkSessionId]
  );

  const setPlayerReady = useCallback(
    (playerId: string, ready: boolean) => {
      dispatch({ type: 'setPlayerReady', payload: { playerId, ready } });
      if (state.networkSessionActive && state.networkSessionId) {
        void (async () => {
          try {
            const client = getSupabaseClient();
            await updateSessionPlayer(client, playerId, { ready });
            await refreshNetworkSession();
          } catch (error) {
            console.error('Supabase setPlayerReady', error);
          }
        })();
      }
    },
    [dispatch, refreshNetworkSession, state.networkSessionActive, state.networkSessionId]
  );

  const acknowledgePlayerRole = useCallback(
    async (playerId: string, acknowledged: boolean) => {
      dispatch({ type: 'setPlayerRoleAcknowledged', payload: { playerId, acknowledged } });
      if (!state.networkSessionActive || !state.networkSessionId) {
        return { ok: true };
      }
      try {
        const client = getSupabaseClient();
        await updateSessionPlayer(client, playerId, { role_acknowledged: acknowledged });
        await refreshNetworkSession();
        return { ok: true };
      } catch (error) {
        console.error('Supabase acknowledgePlayerRole', error);
        return { ok: false, error: 'Rollenbestätigung konnte nicht gespeichert werden.' };
      }
    },
    [dispatch, refreshNetworkSession, state.networkSessionActive, state.networkSessionId]
  );

  const setMode = useCallback((mode: GameMode) => {
    dispatch({ type: 'setMode', payload: mode });
  }, [dispatch]);

  const setPlayerCount = useCallback((count: number) => {
    dispatch({ type: 'setPlayerCount', payload: count });
  }, [dispatch]);

  const setPlayerName = useCallback((index: number, name: string) => {
    dispatch({ type: 'setPlayerName', payload: { index, name } });
  }, [dispatch]);

  const setRoleCount = useCallback((roleId: RoleId, count: number) => {
    dispatch({ type: 'setRoleCount', payload: { roleId, count } });
  }, [dispatch]);

  const setSingleRevealAfterDeath = useCallback((value: boolean) => {
    dispatch({ type: 'setSingleRevealAfterDeath', payload: value });
  }, [dispatch]);

  const generateAssignments = useCallback(() => {
    if (setupSummary.errors.length > 0) {
      return { ok: false, errors: [...setupSummary.errors] };
    }
    try {
      dispatch({ type: 'generateAssignments' });
      return { ok: true };
    } catch (error) {
      return { ok: false, errors: ['Fehler beim Erstellen der Rollen.'] };
    }
  }, [dispatch, setupSummary.errors]);

  const advanceReveal = useCallback(() => {
    dispatch({ type: 'advanceReveal' });
  }, [dispatch]);

  const startGame = useCallback(() => {
    dispatch({ type: 'startGame' });
    if (state.networkSessionActive && state.networkSessionId && isLocalNetworkHost) {
      void (async () => {
        try {
          const client = getSupabaseClient();
          await client
            .from('game_sessions')
            .update({ phase: 'night', phase_round: state.round })
            .eq('id', state.networkSessionId);
        } catch (error) {
          console.error('Supabase startGamePhase', error);
        }
      })();
    }
  }, [
    dispatch,
    isLocalNetworkHost,
    state.networkSessionActive,
    state.networkSessionId,
    state.round,
  ]);

  const resetGame = useCallback(() => {
    dispatch({ type: 'resetGame' });
  }, [dispatch]);

  const prepareRematch = useCallback(() => {
    dispatch({ type: 'prepareRematch' });
  }, [dispatch]);

  const startNightRound = useCallback(() => {
    dispatch({ type: 'startNightRound' });
  }, [dispatch]);

  const broadcastNightStep = useCallback(
    async (step: NetworkNightStepState | null) => {
      if (!state.networkSessionActive || !state.networkSessionId) {
        dispatch({ type: 'setNetworkNightStep', payload: step });
        return { ok: true };
      }
      if (!isLocalNetworkHost) {
        return { ok: false, error: 'Nur das Host-Gerät kann die Nachtphase steuern.' };
      }
      try {
        const client = getSupabaseClient();
        const payload: Record<string, unknown> = step
          ? {
              phase: 'night',
              phase_round: step.round,
              night_step_id: step.stepId,
              night_step_index: step.stepIndex,
              night_step_title: step.title,
              night_step_description: step.description,
              night_step_role: step.roleId,
              night_step_allow_target: step.allowTargetSelection,
            }
          : {
              night_step_id: null,
              night_step_index: null,
              night_step_title: null,
              night_step_description: null,
              night_step_role: null,
              night_step_allow_target: null,
            };
        await client.from('game_sessions').update(payload).eq('id', state.networkSessionId);
        dispatch({ type: 'setNetworkNightStep', payload: step });
        return { ok: true };
      } catch (error) {
        console.error('Supabase broadcastNightStep', error);
        return { ok: false, error: 'Nachtstatus konnte nicht synchronisiert werden.' };
      }
    },
    [
      dispatch,
      isLocalNetworkHost,
      state.networkSessionActive,
      state.networkSessionId,
    ]
  );

  const setNightTarget = useCallback(
    (role: NightRole, playerId: string | null) => {
      dispatch({ type: 'setNightTarget', payload: { role, playerId } });
    },
    [dispatch]
  );

  const submitNetworkNightAction = useCallback(
    async ({
      playerId,
      targetId,
      confirmed,
      stepId,
      round,
    }: {
      playerId: string;
      targetId: string | null;
      confirmed: boolean;
      stepId: NightStepId;
      round: number;
    }) => {
      if (!state.networkSessionActive || !state.networkSessionId) {
        return { ok: false, error: 'Keine aktive Sitzung.' };
      }
      try {
        const client = getSupabaseClient();
        await updateSessionPlayer(client, playerId, {
          night_target_id: targetId,
          night_action_step: stepId,
          night_action_round: round,
          night_action_locked: confirmed,
          night_updated_at: new Date().toISOString(),
        });
        await refreshNetworkSession();
        return { ok: true };
      } catch (error) {
        console.error('Supabase submitNightAction', error);
        return { ok: false, error: 'Aktion konnte nicht gespeichert werden.' };
      }
    },
    [refreshNetworkSession, state.networkSessionActive, state.networkSessionId]
  );

  const sendAlienChatMessage = useCallback(
    async (message: string) => {
      if (!state.networkSessionActive || !state.networkSessionId) {
        return { ok: false, error: 'Keine aktive Sitzung.' };
      }
      if (!state.localPlayerId) {
        return { ok: false, error: 'Spieler nicht gefunden.' };
      }
      const trimmed = message.trim();
      if (!trimmed) {
        return { ok: false, error: 'Nachricht darf nicht leer sein.' };
      }
      if (!messageSyncState.supported) {
        return { ok: false, error: 'Alien-Chat ist nicht verfügbar.' };
      }
      try {
        const client = getSupabaseClient();
        await client.from('session_messages').insert({
          session_id: state.networkSessionId,
          player_id: state.localPlayerId,
          channel: ALIEN_CHAT_CHANNEL,
          message: trimmed,
          round: state.round,
          step_id: state.networkNightStep?.stepId ?? null,
        });
        await refreshNetworkSession();
        return { ok: true };
      } catch (error) {
        console.error('Supabase sendAlienChatMessage', error);
        const category = classifyMessageError(error);
        if (category === 'unavailable' && messageSyncState.supported) {
          messageSyncState.supported = false;
          return { ok: false, error: 'Alien-Chat ist noch nicht eingerichtet.' };
        }
        if (category === 'forbidden') {
          return { ok: false, error: 'Alien-Chat Zugriff verweigert.' };
        }
        return { ok: false, error: 'Nachricht konnte nicht gesendet werden.' };
      }
    },
    [
      refreshNetworkSession,
      state.localPlayerId,
      state.networkNightStep,
      state.networkSessionActive,
      state.networkSessionId,
      state.round,
    ]
  );

  const emitDayEvent = useCallback(
    async (event: DayEventPayload) => {
      if (!state.networkSessionActive || !state.networkSessionId) {
        return { ok: false, error: 'Keine aktive Sitzung.' };
      }
      if (!state.localPlayerId) {
        return { ok: false, error: 'Spieler nicht gefunden.' };
      }
      if (!messageSyncState.supported) {
        return { ok: false, error: 'Tag-Voting ist nicht verfügbar.' };
      }
      try {
        const client = getSupabaseClient();
        await client.from('session_messages').insert({
          session_id: state.networkSessionId,
          player_id: state.localPlayerId,
          channel: DAY_EVENT_CHANNEL,
          message: JSON.stringify(event),
          round: event.round,
        });
        await refreshNetworkSession();
        return { ok: true };
      } catch (error) {
        console.error('Supabase sendDayEvent', error);
        const category = classifyMessageError(error);
        if (category === 'unavailable' && messageSyncState.supported) {
          messageSyncState.supported = false;
          return { ok: false, error: 'Tag-Voting ist noch nicht eingerichtet.' };
        }
        if (category === 'forbidden') {
          return { ok: false, error: 'Keine Berechtigung für Tag-Voting.' };
        }
        return { ok: false, error: 'Aktion konnte nicht gespeichert werden.' };
      }
    },
    [refreshNetworkSession, state.localPlayerId, state.networkSessionActive, state.networkSessionId]
  );

  const nominateDayTarget = useCallback(
    (targetId: string | null) => {
      const trimmed = targetId?.trim();
      return emitDayEvent({
        type: 'nominate',
        round: state.round,
        targetId: trimmed && trimmed.length > 0 ? trimmed : null,
      });
    },
    [emitDayEvent, state.round]
  );

  const supportDayNomination = useCallback(
    (targetId: string, support: boolean) => {
      const trimmed = targetId.trim();
      if (!trimmed) {
        return Promise.resolve({
          ok: false,
          error: 'Ungültige Zielperson für Unterstützung.',
        });
      }
      return emitDayEvent({
        type: 'support',
        round: state.round,
        targetId: trimmed,
        support,
      });
    },
    [emitDayEvent, state.round]
  );

  const setDayReady = useCallback(
    (ready: boolean) => {
      return emitDayEvent({
        type: 'ready',
        round: state.round,
        ready,
      });
    },
    [emitDayEvent, state.round]
  );

  const startDayVote = useCallback(
    (candidates: string[]) => {
      const uniqueCandidates = Array.from(
        new Set(candidates.map((candidate) => candidate.trim()).filter((candidate) => candidate.length > 0))
      );
      if (uniqueCandidates.length === 0) {
        return Promise.resolve({
          ok: false,
          error: 'Keine gültigen Kandidaten für die Abstimmung.',
        });
      }
      const alreadyStarted = state.networkDayEvents.some(
        (event) => event.round === state.round && event.type === 'startVote'
      );
      if (alreadyStarted) {
        return Promise.resolve({ ok: true });
      }
      return emitDayEvent({
        type: 'startVote',
        round: state.round,
        candidates: uniqueCandidates,
      });
    },
    [emitDayEvent, state.networkDayEvents, state.round]
  );

  const submitDayVote = useCallback(
    (targetId: string | null) => {
      const trimmed = targetId?.trim();
      return emitDayEvent({
        type: 'vote',
        round: state.round,
        targetId: trimmed && trimmed.length > 0 ? trimmed : null,
      });
    },
    [emitDayEvent, state.round]
  );

  const setSkipSupport = useCallback(
    (support: boolean) => {
      return emitDayEvent({
        type: 'skip',
        round: state.round,
        support,
      });
    },
    [emitDayEvent, state.round]
  );

  const startRematchVote = useCallback(async () => {
    if (!state.networkSessionActive || !state.networkSessionId) {
      return { ok: false, error: 'Keine aktive Sitzung.' };
    }
    if (!state.localPlayerId) {
      return { ok: false, error: 'Spieler nicht verbunden.' };
    }
    if (state.rematchState && !state.rematchState.resolved) {
      return { ok: false, error: 'Abstimmung läuft bereits.' };
    }
    if (!messageSyncState.supported) {
      return { ok: false, error: 'Rematch-Abstimmung ist nicht verfügbar.' };
    }
    const pollId = generateRematchPollId();
    try {
      const client = getSupabaseClient();
      await client.from('session_messages').insert({
        session_id: state.networkSessionId,
        player_id: state.localPlayerId,
        channel: REMATCH_CHANNEL,
        message: JSON.stringify({
          type: 'request',
          pollId,
          round: state.round,
        }),
        round: state.round,
      });
      await refreshNetworkSession();
      return { ok: true };
    } catch (error) {
      console.error('Supabase startRematchVote', error);
      return { ok: false, error: 'Rematch-Abstimmung konnte nicht gestartet werden.' };
    }
  }, [
    refreshNetworkSession,
    state.localPlayerId,
    state.networkSessionActive,
    state.networkSessionId,
    state.rematchState,
    state.round,
  ]);

  const castRematchVote = useCallback(
    async (vote: RematchVoteOption) => {
      const poll = state.rematchState;
      if (!state.networkSessionActive || !state.networkSessionId) {
        return { ok: false, error: 'Keine aktive Sitzung.' };
      }
      if (!state.localPlayerId) {
        return { ok: false, error: 'Spieler nicht verbunden.' };
      }
      if (!poll) {
        return { ok: false, error: 'Keine aktive Abstimmung.' };
      }
      if (!messageSyncState.supported) {
        return { ok: false, error: 'Rematch-Abstimmung ist nicht verfügbar.' };
      }
      try {
        const client = getSupabaseClient();
        await client.from('session_messages').insert({
          session_id: state.networkSessionId,
          player_id: state.localPlayerId,
          channel: REMATCH_CHANNEL,
          message: JSON.stringify({
            type: 'vote',
            pollId: poll.pollId,
            vote,
            round: poll.round ?? state.round,
          }),
          round: poll.round ?? state.round,
        });
        await refreshNetworkSession();
        return { ok: true };
      } catch (error) {
        console.error('Supabase castRematchVote', error);
        return { ok: false, error: 'Stimme konnte nicht gespeichert werden.' };
      }
    },
    [
      refreshNetworkSession,
      state.localPlayerId,
      state.networkSessionActive,
      state.networkSessionId,
      state.rematchState,
      state.round,
    ]
  );

  const finalizeRematchPoll = useCallback(
    async (pollId: string, result: RematchResultType) => {
      if (!state.networkSessionActive || !state.networkSessionId) {
        return;
      }
      if (!state.localPlayerId) {
        return;
      }
      if (!messageSyncState.supported) {
        return;
      }
      try {
        const client = getSupabaseClient();
        await client.from('session_messages').insert({
          session_id: state.networkSessionId,
          player_id: state.localPlayerId,
          channel: REMATCH_CHANNEL,
          message: JSON.stringify({
            type: 'result',
            pollId,
            result,
            round: state.round,
          }),
          round: state.round,
        });
        await refreshNetworkSession();
      } catch (error) {
        console.error('Supabase finalizeRematchPoll', error);
      }
    },
    [
      refreshNetworkSession,
      state.localPlayerId,
      state.networkSessionActive,
      state.networkSessionId,
      state.round,
    ]
  );

  useEffect(() => {
    const poll = state.rematchState;
    if (!poll || poll.result || !state.networkSessionActive || !isLocalNetworkHost) {
      if (!poll) {
        rematchResolutionRef.current = null;
      }
      return;
    }
  const participants = normalizeNetworkPlayers(state.players).playable;
    const totalEligible = participants.length;
    const yesCount = participants.reduce(
      (count, player) => (poll.votes[player.id] === 'yes' ? count + 1 : count),
      0
    );
    const noCount = participants.reduce(
      (count, player) => (poll.votes[player.id] === 'no' ? count + 1 : count),
      0
    );
    const majority = Math.max(Math.floor(totalEligible / 2) + 1, 1);
    let decision: RematchResultType | null = null;
    if (totalEligible === 0 || yesCount >= majority) {
      decision = 'accepted';
    } else if (noCount >= majority) {
      decision = 'rejected';
    } else {
      const allResponded =
        totalEligible > 0 &&
        participants.every((player) => Object.prototype.hasOwnProperty.call(poll.votes, player.id));
      if (allResponded) {
        decision = yesCount > noCount ? 'accepted' : 'rejected';
      }
    }
    if (!decision) {
      return;
    }
    if (
      rematchResolutionRef.current &&
      rematchResolutionRef.current.pollId === poll.pollId &&
      rematchResolutionRef.current.result === decision
    ) {
      return;
    }
    rematchResolutionRef.current = { pollId: poll.pollId, result: decision };
    void finalizeRematchPoll(poll.pollId, decision);
  }, [
    finalizeRematchPoll,
    isLocalNetworkHost,
    state.networkSessionActive,
    state.players,
    state.rematchState,
  ]);

  useEffect(() => {
    const poll = state.rematchState;
    if (!poll || !poll.result) {
      if (!poll) {
        rematchHandledRef.current = null;
      }
      return;
    }
    if (rematchHandledRef.current === poll.pollId) {
      return;
    }
    rematchHandledRef.current = poll.pollId;
    if (poll.result === 'accepted') {
      dispatch({ type: 'prepareRematch' });
      if (isLocalNetworkHost) {
        dispatch({ type: 'generateAssignments' });
      }
    }
  }, [dispatch, isLocalNetworkHost, state.rematchState]);

  const setPhase = useCallback(
    (phase: PhaseId) => {
      dispatch({ type: 'setPhase', payload: phase });
      if (!state.networkSessionActive || !state.networkSessionId || !isLocalNetworkHost) {
        return;
      }
      const payload: Record<string, unknown> = {
        phase,
        phase_round: state.round,
      };
      if (phase === 'day') {
        payload.night_step_id = null;
        payload.night_step_index = null;
        payload.night_step_title = null;
        payload.night_step_description = null;
        payload.night_step_role = null;
        payload.night_step_allow_target = null;
      }
      void (async () => {
        try {
          const client = getSupabaseClient();
          await client.from('game_sessions').update(payload).eq('id', state.networkSessionId);
          if (phase === 'day') {
            dispatch({ type: 'setNetworkNightStep', payload: null });
          }
        } catch (error) {
          console.error('Supabase setPhase', error);
        }
      })();
    },
    [
      dispatch,
      isLocalNetworkHost,
      state.networkSessionActive,
      state.networkSessionId,
      state.round,
    ]
  );

  const resolveNight = useCallback(() => {
    const outcome = computeNightOutcome(state);
    dispatch({ type: 'resolveNight', payload: outcome });
    return outcome;
  }, [dispatch, state]);

  const resolveDayVote = useCallback(
    ({ targetId, skip }: { targetId: string | null; skip: boolean }): DayResolution => {
      const resolution: DayResolution = {
        round: state.round,
        votedOutId: skip ? null : targetId,
        skipped: skip || !targetId,
      };
      dispatch({ type: 'resolveDayVote', payload: resolution });
      if (state.networkSessionActive && state.networkSessionId && isLocalNetworkHost) {
        void (async () => {
          try {
            const client = getSupabaseClient();
            await client
              .from('game_sessions')
              .update({ phase_round: resolution.round + 1 })
              .eq('id', state.networkSessionId);
          } catch (error) {
            console.error('Supabase resolveDayVote phase update', error);
          }
        })();
      }
      return resolution;
    },
    [dispatch, isLocalNetworkHost, state.networkSessionActive, state.networkSessionId, state.round]
  );

  const value: GameContextValue = useMemo(
    () => ({
      state,
      setupSummary,
      setMode,
      setPlayerCount,
      setPlayerName,
      setRoleCount,
      setSingleRevealAfterDeath,
      startNetworkSession,
      endNetworkSession,
      joinNetworkSession,
      linkNetworkSession,
      updateRevealVote,
      setPlayerReady,
      acknowledgePlayerRole,
      generateAssignments,
      advanceReveal,
      startGame,
      setPhase,
      resetGame,
      prepareRematch,
      startNightRound,
      setNightTarget,
      submitNetworkNightAction,
      broadcastNightStep,
      sendAlienChatMessage,
      nominateDayTarget,
      supportDayNomination,
      setDayReady,
      startDayVote,
      submitDayVote,
      setSkipSupport,
      startRematchVote,
      castRematchVote,
      resolveNight,
      resolveDayVote,
    }),
    [
      acknowledgePlayerRole,
      advanceReveal,
      endNetworkSession,
      generateAssignments,
      joinNetworkSession,
      linkNetworkSession,
      prepareRematch,
      resetGame,
      nominateDayTarget,
      supportDayNomination,
      setDayReady,
      startDayVote,
      submitDayVote,
      setSkipSupport,
      startRematchVote,
      castRematchVote,
      resolveDayVote,
      resolveNight,
      sendAlienChatMessage,
      setMode,
      setNightTarget,
      setPhase,
      setPlayerCount,
      setPlayerName,
      setPlayerReady,
      setRoleCount,
      setSingleRevealAfterDeath,
      setupSummary,
      startGame,
      startNetworkSession,
      startNightRound,
      submitNetworkNightAction,
      broadcastNightStep,
      state,
      updateRevealVote,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within GameProvider');
  }
  return ctx;
}

export type {
  DayRecord, DayResolution, GameOutcome,
  NetworkDayEvent, NightRecord, NightResolution, RematchState
};

