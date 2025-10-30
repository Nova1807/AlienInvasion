import { createContext, useContext, useMemo, useReducer } from 'react';

import {
  getRoleDefinition,
  roleCatalog,
  selectableRoles,
  type RoleDefinition,
  type RoleId,
  type TeamId,
} from '@/constants/roles';

type GameMode = 'single' | 'network';
type PhaseId = 'night' | 'day';

type PlayerRecord = {
  id: string;
  name: string;
  revealVote: boolean | null;
  ready: boolean;
  isHost: boolean;
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

type GameState = {
  mode: GameMode;
  playerCount: number;
  players: PlayerRecord[];
  playerIdCounter: number;
  singleRevealAfterDeath: boolean;
  revealOnDeath: boolean;
  networkSessionActive: boolean;
  networkSessionCode: string | null;
  roleCounts: RoleCounts;
  assignments: PlayerAssignment[];
  status: GameStatus;
  currentPhase: PhaseId;
  round: number;
  revealIndex: number;
  nightLog: NightRecord[];
  dayLog: DayRecord[];
  outcome: GameOutcome | null;
};

type GameAction =
  | { type: 'setMode'; payload: GameMode }
  | { type: 'setPlayerCount'; payload: number }
  | { type: 'setPlayerName'; payload: { index: number; name: string } }
  | { type: 'setRoleCount'; payload: { roleId: RoleId; count: number } }
  | { type: 'setSingleRevealAfterDeath'; payload: boolean }
  | { type: 'startNetworkSession'; payload: { hostName: string } }
  | { type: 'endNetworkSession' }
  | { type: 'joinNetworkSession'; payload: { name: string; revealVote: boolean } }
  | { type: 'updateRevealVote'; payload: { playerId: string; revealVote: boolean } }
  | { type: 'setPlayerReady'; payload: { playerId: string; ready: boolean } }
  | { type: 'generateAssignments' }
  | { type: 'advanceReveal' }
  | { type: 'startGame' }
  | { type: 'setPhase'; payload: PhaseId }
  | { type: 'resetGame' }
  | { type: 'startNightRound' }
  | {
      type: 'setNightTarget';
      payload: { role: 'alienKatze' | 'seher' | 'doktor'; playerId: string | null };
    }
  | { type: 'resolveNight'; payload: NightResolution }
  | { type: 'resolveDayVote'; payload: DayResolution };

type GameContextValue = {
  state: GameState;
  setMode: (mode: GameMode) => void;
  setPlayerCount: (count: number) => void;
  setPlayerName: (index: number, name: string) => void;
  setRoleCount: (roleId: RoleId, count: number) => void;
  setSingleRevealAfterDeath: (value: boolean) => void;
  startNetworkSession: (hostName: string) => void;
  endNetworkSession: () => void;
  joinNetworkSession: (name: string, revealVote: boolean) => { ok: boolean; error?: string };
  updateRevealVote: (playerId: string, revealVote: boolean) => void;
  setPlayerReady: (playerId: string, ready: boolean) => void;
  generateAssignments: () => { ok: boolean; errors?: string[] };
  advanceReveal: () => void;
  startGame: () => void;
  setPhase: (phase: PhaseId) => void;
  resetGame: () => void;
  setupSummary: SetupSummary;
  startNightRound: () => void;
  setNightTarget: (role: 'alienKatze' | 'seher' | 'doktor', playerId: string | null) => void;
  resolveNight: () => NightResolution;
  resolveDayVote: (options: { targetId: string | null; skip: boolean }) => DayResolution;
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
    roleCounts: roleDefaults,
    assignments: [],
    status: 'setup',
    currentPhase: 'night',
    round: 1,
    revealIndex: 0,
    nightLog: [],
    dayLog: [],
    outcome: null,
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

function computeRevealMajority(players: PlayerRecord[]): boolean {
  if (players.length === 0) {
    return false;
  }
  const yesVotes = players.reduce((sum, player) => (player.revealVote ? sum + 1 : sum), 0);
  return yesVotes > players.length / 2;
}

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
    case 'startNetworkSession': {
      const base = createInitialState();
      const hostName = action.payload.hostName.trim() || 'Host';
      const host = {
        ...createPlayer(1),
        name: hostName,
        isHost: true,
      };
      return {
        ...base,
        mode: 'network',
        players: [host],
        playerCount: 1,
        playerIdCounter: 1,
        networkSessionActive: true,
        networkSessionCode: generateSessionCode(),
      };
    }
    case 'endNetworkSession':
      return createInitialState();
    case 'joinNetworkSession': {
      if (!state.networkSessionActive) {
        return state;
      }
      const trimmed = action.payload.name.trim();
      if (!trimmed) {
        return state;
      }
      if (state.playerCount >= 15) {
        return state;
      }
      const nextId = state.playerIdCounter + 1;
      const newPlayer = {
        ...createPlayer(nextId),
        name: trimmed,
        revealVote: action.payload.revealVote,
        isHost: false,
      };
      const players = [...state.players, newPlayer];
      return {
        ...state,
        players,
        playerIdCounter: nextId,
        playerCount: players.length,
        revealOnDeath: computeRevealMajority(players),
      };
    }
    case 'updateRevealVote': {
      const players = state.players.map((player) =>
        player.id === action.payload.playerId
          ? { ...player, revealVote: action.payload.revealVote }
          : player
      );
      return {
        ...state,
        players,
        revealOnDeath: computeRevealMajority(players),
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
      const preparedPlayers = sanitizePlayers(state.players, state.playerCount);
      const crewCount = deriveCrewCount(preparedPlayers.length, state.roleCounts);
      const nextCounts = { ...state.roleCounts, dorfkatze: crewCount };
      const playersForAssignment = shuffle(preparedPlayers);
      const assignments = buildAssignments(playersForAssignment, nextCounts);
      return {
        ...state,
        players: preparedPlayers,
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
      };
    case 'setPhase':
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
          return {
            ...assignment,
            alive: false,
            eliminatedBy: 'night',
            eliminatedInRound: round,
          };
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
      const outcome = state.outcome ?? evaluateOutcome(nextAssignments);
      return {
        ...state,
        assignments: nextAssignments,
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
            ? {
                ...assignment,
                alive: false,
                eliminatedBy: 'day',
                eliminatedInRound: round,
              }
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
    case 'resetGame':
      return createInitialState();
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
    const missingNames = state.players
      .slice(0, state.playerCount)
      .reduce((count, player) => (player.name.trim() ? count : count + 1), 0);
    return { errors, crewCount, definitions, nonCrewSelected, missingNames };
  }, [state.playerCount, state.players, state.roleCounts]);

  const value: GameContextValue = useMemo(
    () => ({
      state,
      setupSummary,
      setMode: (mode) => dispatch({ type: 'setMode', payload: mode }),
      setPlayerCount: (count) => dispatch({ type: 'setPlayerCount', payload: count }),
      setPlayerName: (index, name) =>
        dispatch({ type: 'setPlayerName', payload: { index, name } }),
      setRoleCount: (roleId, count) => dispatch({ type: 'setRoleCount', payload: { roleId, count } }),
      setSingleRevealAfterDeath: (value) =>
        dispatch({ type: 'setSingleRevealAfterDeath', payload: value }),
      startNetworkSession: (hostName) =>
        dispatch({ type: 'startNetworkSession', payload: { hostName } }),
      endNetworkSession: () => dispatch({ type: 'endNetworkSession' }),
      joinNetworkSession: (name, revealVote) => {
        if (!state.networkSessionActive) {
          return { ok: false, error: 'Keine aktive Sitzung gefunden.' };
        }
        if (state.playerCount >= 15) {
          return { ok: false, error: 'Maximal 15 Teilnehmer.' };
        }
        if (!name.trim()) {
          return { ok: false, error: 'Name darf nicht leer sein.' };
        }
        dispatch({ type: 'joinNetworkSession', payload: { name, revealVote } });
        return { ok: true };
      },
      updateRevealVote: (playerId, revealVote) =>
        dispatch({ type: 'updateRevealVote', payload: { playerId, revealVote } }),
      setPlayerReady: (playerId, ready) =>
        dispatch({ type: 'setPlayerReady', payload: { playerId, ready } }),
      generateAssignments: () => {
        if (setupSummary.errors.length > 0) {
          return { ok: false, errors: [...setupSummary.errors] };
        }
        try {
          dispatch({ type: 'generateAssignments' });
          return { ok: true };
        } catch (error) {
          return { ok: false, errors: ['Fehler beim Erstellen der Rollen.'] };
        }
      },
      advanceReveal: () => dispatch({ type: 'advanceReveal' }),
      startGame: () => dispatch({ type: 'startGame' }),
      setPhase: (phase) => dispatch({ type: 'setPhase', payload: phase }),
      resetGame: () => dispatch({ type: 'resetGame' }),
      startNightRound: () => dispatch({ type: 'startNightRound' }),
      setNightTarget: (role, playerId) =>
        dispatch({ type: 'setNightTarget', payload: { role, playerId } }),
      resolveNight: () => {
        const outcome = computeNightOutcome(state);
        dispatch({ type: 'resolveNight', payload: outcome });
        return outcome;
      },
      resolveDayVote: ({ targetId, skip }) => {
        const resolution: DayResolution = {
          round: state.round,
          votedOutId: skip ? null : targetId,
          skipped: skip || !targetId,
        };
        dispatch({ type: 'resolveDayVote', payload: resolution });
        return resolution;
      },
    }),
    [setupSummary, state]
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

export type { NightResolution, DayResolution, NightRecord, DayRecord, GameOutcome };
