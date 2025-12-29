import type { NetworkDayEvent } from '@/context/game-context';

type DayParticipant = {
  id: string;
  name: string;
  alive: boolean;
};

type DerivedNomination = {
  targetId: string;
  nominators: string[];
  supporters: string[];
  supporterCount: number;
  valid: boolean;
  order: number;
};

type DerivedDayState = {
  round: number;
  stage: 'nominations' | 'voting';
  eligibleIds: string[];
  readyIds: string[];
  readyMissingIds: string[];
  readyByPlayer: Record<string, boolean>;
  nominations: DerivedNomination[];
  nominationByPlayer: Record<string, string | null>;
  supportByPlayer: Record<string, string[]>;
  candidates: string[];
  votesByPlayer: Record<string, string | null>;
  voteCounts: Record<string, number>;
  totalVotes: number;
  pendingVoterIds: string[];
  majorityTargetId: string | null;
  majorityThreshold: number;
  tie: boolean;
  allVotesSubmitted: boolean;
  skipRequested: boolean;
  skipSupportIds: string[];
  skipSupportCount: number;
  skipHasMajority: boolean;
  topVoteCount: number;
  secondVoteCount: number;
};

type DeriveOptions = {
  events: NetworkDayEvent[];
  round: number;
  participants: DayParticipant[];
};

function deriveNetworkDayState({ events, round, participants }: DeriveOptions): DerivedDayState {
  const participantOrder = new Map<string, number>();
  participants.forEach((participant, index) => {
    participantOrder.set(participant.id, index);
  });

  const aliveParticipants = participants.filter((participant) => participant.alive);
  const eligibleIds = aliveParticipants.map((participant) => participant.id);
  const eligibleSet = new Set(eligibleIds);

  const relevantEvents = events
    .filter((event) => event.round === round)
    .slice()
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a.id.localeCompare(b.id);
    });

  const nominationByActor = new Map<string, string | null>();
  const supportByPlayer = new Map<string, Set<string>>();
  const supportByTarget = new Map<string, Set<string>>();
  const readySet = new Set<string>();
  const votesByPlayer = new Map<string, string | null>();
  const targetFirstIndex = new Map<string, number>();
  const skipVotes = new Map<string, boolean>();

  let startVoteEvent: NetworkDayEvent | null = null;

  const resetState = () => {
    nominationByActor.clear();
    supportByPlayer.clear();
    supportByTarget.clear();
    readySet.clear();
    votesByPlayer.clear();
    startVoteEvent = null;
    skipVotes.clear();
  };

  relevantEvents.forEach((event, index) => {
    if (event.type === 'reset') {
      resetState();
      return;
    }
    if (event.type === 'startVote') {
      startVoteEvent = event;
      return;
    }
    const actorId = event.actorId;
    if (!eligibleSet.has(actorId)) {
      return;
    }
    switch (event.type) {
      case 'nominate': {
        const targetId = event.targetId && eligibleSet.has(event.targetId) ? event.targetId : null;
        nominationByActor.set(actorId, targetId);
        if (targetId && !targetFirstIndex.has(targetId)) {
          targetFirstIndex.set(targetId, index);
        }
        break;
      }
      case 'support': {
        if (!eligibleSet.has(event.targetId)) {
          break;
        }
        const current = supportByPlayer.get(actorId) ?? new Set<string>();
        const targetSupporters = supportByTarget.get(event.targetId) ?? new Set<string>();
        if (event.support) {
          current.add(event.targetId);
          targetSupporters.add(actorId);
        } else {
          current.delete(event.targetId);
          targetSupporters.delete(actorId);
        }
        if (current.size > 0) {
          supportByPlayer.set(actorId, current);
        } else {
          supportByPlayer.delete(actorId);
        }
        if (targetSupporters.size > 0) {
          supportByTarget.set(event.targetId, targetSupporters);
        } else {
          supportByTarget.delete(event.targetId);
        }
        break;
      }
      case 'ready': {
        if (event.ready) {
          readySet.add(actorId);
        } else {
          readySet.delete(actorId);
        }
        break;
      }
      case 'vote': {
        votesByPlayer.set(actorId, event.targetId);
        break;
      }
      case 'skip': {
        if (event.support) {
          skipVotes.set(actorId, true);
        } else {
          skipVotes.delete(actorId);
        }
        break;
      }
      default:
        break;
    }
  });

  const nominationByPlayerRecord: Record<string, string | null> = {};
  const supportByPlayerRecord: Record<string, string[]> = {};
  const readyByPlayerRecord: Record<string, boolean> = {};

  const sortByParticipantOrder = (lhs: string, rhs: string) => {
    const left = participantOrder.get(lhs) ?? Number.MAX_SAFE_INTEGER;
    const right = participantOrder.get(rhs) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  };

  eligibleIds.forEach((id) => {
    nominationByPlayerRecord[id] = nominationByActor.get(id) ?? null;
    const supports = supportByPlayer.get(id);
    supportByPlayerRecord[id] = supports ? Array.from(supports).sort(sortByParticipantOrder) : [];
    readyByPlayerRecord[id] = readySet.has(id);
  });

  const readyIds = Array.from(readySet).sort(sortByParticipantOrder);
  const readyMissingIds = eligibleIds.filter((id) => !readySet.has(id));

  const nominationsByTarget = new Map<
    string,
    { nominators: string[]; order: number }
  >();
  nominationByActor.forEach((targetId, actorId) => {
    if (!targetId) {
      return;
    }
    if (!eligibleSet.has(targetId)) {
      return;
    }
    const entry = nominationsByTarget.get(targetId) ?? {
      nominators: [],
      order: targetFirstIndex.get(targetId) ?? Number.MAX_SAFE_INTEGER,
    };
    if (!entry.nominators.includes(actorId)) {
      entry.nominators.push(actorId);
    }
    nominationsByTarget.set(targetId, entry);
  });

  const nominations: DerivedNomination[] = [];
  nominationsByTarget.forEach((entry, targetId) => {
    const supporters = Array.from(supportByTarget.get(targetId) ?? [])
      .filter((supporterId) => eligibleSet.has(supporterId))
      .sort(sortByParticipantOrder);
    const nominators = entry.nominators.sort(sortByParticipantOrder);
    const supporterCount = supporters.length;
    const nominatorSet = new Set(nominators);
    const hasExternalSupport = supporters.some((supporterId) => !nominatorSet.has(supporterId));
    const valid = nominators.length > 0 && supporterCount > 0 && hasExternalSupport;
    nominations.push({
      targetId,
      nominators,
      supporters,
      supporterCount,
      valid,
      order: entry.order,
    });
  });

  nominations.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return sortByParticipantOrder(a.targetId, b.targetId);
  });

  const stage: 'nominations' | 'voting' = startVoteEvent ? 'voting' : 'nominations';
  const candidates: string[] = [];
  if (startVoteEvent) {
    const seen = new Set<string>();
    startVoteEvent.candidates.forEach((candidateId) => {
      if (eligibleSet.has(candidateId) && !seen.has(candidateId)) {
        seen.add(candidateId);
        candidates.push(candidateId);
      }
    });
  }
  const candidateSet = new Set(candidates);

  const votesByPlayerRecord: Record<string, string | null> = {};
  eligibleIds.forEach((id) => {
    const vote = votesByPlayer.get(id) ?? null;
    if (!vote || !candidateSet.has(vote)) {
      votesByPlayerRecord[id] = null;
    } else {
      votesByPlayerRecord[id] = vote;
    }
  });

  const voteCounts = new Map<string, number>();
  Object.values(votesByPlayerRecord).forEach((targetId) => {
    if (targetId && candidateSet.has(targetId)) {
      voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
    }
  });

  const voteCountsRecord: Record<string, number> = {};
  candidates.forEach((candidateId) => {
    voteCountsRecord[candidateId] = voteCounts.get(candidateId) ?? 0;
  });

  const totalVotes = Array.from(voteCounts.values()).reduce((sum, value) => sum + value, 0);

  const pendingVoterIds = eligibleIds.filter((id) => {
    const vote = votesByPlayerRecord[id];
    return !vote || !candidateSet.has(vote);
  });

  const majorityThreshold = Math.floor(eligibleIds.length / 2) + 1;
  const sortedVoteEntries = candidates
    .map((candidateId) => ({
      candidateId,
      count: voteCounts.get(candidateId) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || sortByParticipantOrder(a.candidateId, b.candidateId));

  const topVote = sortedVoteEntries[0];
  const secondVote = sortedVoteEntries[1];
  const topVoteCount = topVote?.count ?? 0;
  const secondVoteCount = secondVote?.count ?? 0;

  const majorityTargetId =
    stage === 'voting' && topVote && topVote.count >= majorityThreshold ? topVote.candidateId : null;

  const allVotesSubmitted = stage === 'voting' && candidates.length > 0 && pendingVoterIds.length === 0;

  const skipSupportIds = Array.from(skipVotes.keys()).sort(sortByParticipantOrder);
  const skipSupportCount = skipSupportIds.length;
  const skipHasMajority = skipSupportCount > eligibleIds.length / 2;
  const skipRequested = skipSupportCount > 0;

  const tie =
    stage === 'voting' &&
    candidates.length > 0 &&
    allVotesSubmitted &&
    majorityTargetId === null &&
    ((sortedVoteEntries.length >= 2 && topVoteCount === secondVoteCount) ||
      (sortedVoteEntries.length === 1 && topVoteCount * 2 === eligibleIds.length));

  return {
    round,
    stage,
    eligibleIds,
    readyIds,
    readyMissingIds,
    readyByPlayer: readyByPlayerRecord,
    nominations,
    nominationByPlayer: nominationByPlayerRecord,
    supportByPlayer: supportByPlayerRecord,
    candidates,
    votesByPlayer: votesByPlayerRecord,
    voteCounts: voteCountsRecord,
    totalVotes,
    pendingVoterIds,
    majorityTargetId,
    majorityThreshold,
    tie,
    allVotesSubmitted,
    skipRequested,
    skipSupportIds,
    skipSupportCount,
    skipHasMajority,
    topVoteCount,
    secondVoteCount,
  };
}

export type { DayParticipant, DerivedDayState, DerivedNomination };
export { deriveNetworkDayState };
