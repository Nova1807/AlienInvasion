import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getRoleDefinition, type RoleId } from '@/constants/roles';
import { useGame, type GameOutcome } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { deriveNetworkDayState, type DayParticipant, type DerivedDayState } from '@/utils/network-day';
import { speak, speakSequence, stop } from '@/utils/speech';
import { formatNameList } from '@/utils/text';

type VotePlayer = {
  id: string;
  name: string;
  order: number;
};

type CasualtyDetail = {
  name: string;
  roleName: string | null;
};

export default function DayScreen() {
  const router = useRouter();
  const {
    state: {
      assignments,
      dayLog,
      nightLog,
      round,
      outcome,
      revealOnDeath,
      mode,
      networkDayEvents,
      rematchState,
      players,
      status,
    },
    setPhase,
    resolveDayVote,
    prepareRematch,
    resetGame,
    startDayVote,
    startRematchVote,
  } = useGame();

  const [dayRound] = useState(round);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [hostActionMessage, setHostActionMessage] = useState<string | null>(null);
  const [hostActionTone, setHostActionTone] = useState<'info' | 'error'>('info');
  const [startingVote, setStartingVote] = useState(false);
  const [requestingRematch, setRequestingRematch] = useState(false);
  const isNetworkMode = mode === 'network';

  const assignmentMap = useMemo(() => {
    return assignments.reduce<Record<string, (typeof assignments)[number]>>((map, assignment) => {
      map[assignment.playerId] = assignment;
      return map;
    }, {});
  }, [assignments]);

  const rematchEligiblePlayers = useMemo(() => players, [players]);

  const rematchVoteStats = useMemo(() => {
    if (!rematchState) {
      return null;
    }
    const yes = rematchEligiblePlayers.reduce(
      (count, player) => (rematchState.votes[player.id] === 'yes' ? count + 1 : count),
      0
    );
    const no = rematchEligiblePlayers.reduce(
      (count, player) => (rematchState.votes[player.id] === 'no' ? count + 1 : count),
      0
    );
    const total = rematchEligiblePlayers.length;
    const pending = Math.max(total - yes - no, 0);
    const majority = Math.max(Math.floor(total / 2) + 1, 1);
    return { yes, no, pending, total, majority };
  }, [rematchEligiblePlayers, rematchState]);

  const rematchInProgress = Boolean(isNetworkMode && rematchState && !rematchState.resolved);
  const rematchResult = rematchState?.result ?? null;

  const getPlayerName = useCallback(
    (playerId: string) => assignmentMap[playerId]?.playerName ?? 'Unbekannt',
    [assignmentMap]
  );

  const formatPlayerList = useCallback(
    (playerIds: string[]) => {
      const names = playerIds.map(getPlayerName).filter((name) => Boolean(name));
      return names.length > 0 ? formatNameList(names) : '—';
    },
    [getPlayerName]
  );

  const dayParticipants = useMemo<DayParticipant[]>(() => {
    return assignments.map((assignment) => ({
      id: assignment.playerId,
      name: assignment.playerName,
      alive: assignment.alive,
    }));
  }, [assignments]);

  const dayRecord = useMemo(() => {
    return (
      dayLog.find((entry) => entry.round === dayRound) ?? {
        round: dayRound,
        casualties: [],
        votedOutId: null,
        skipped: false,
      }
    );
  }, [dayLog, dayRound]);

  const nightRecord = useMemo(
    () => nightLog.find((entry) => entry.round === dayRound) ?? null,
    [nightLog, dayRound]
  );

  const casualtyDetails = useMemo<CasualtyDetail[]>(() => {
    return dayRecord.casualties
      .map((playerId) => {
        const assignment = assignmentMap[playerId];
        if (!assignment) {
          return null;
        }
        const roleName =
          revealOnDeath && assignment.roleId
            ? (() => {
                try {
                  return getRoleDefinition(assignment.roleId as RoleId).name;
                } catch {
                  return null;
                }
              })()
            : null;
        return {
          name: assignment.playerName,
          roleName,
        } as CasualtyDetail;
      })
      .filter((detail): detail is CasualtyDetail => Boolean(detail));
  }, [assignmentMap, dayRecord.casualties, revealOnDeath]);

  const savedNames = useMemo(() => {
    if (!nightRecord) {
      return [] as string[];
    }
    return nightRecord.saved
      .map((playerId) => assignmentMap[playerId]?.playerName ?? null)
      .filter((name): name is string => Boolean(name));
  }, [assignmentMap, nightRecord]);

  const alivePlayers = useMemo<VotePlayer[]>(() => {
    return assignments
      .filter((assignment) => assignment.alive)
      .sort((a, b) => a.order - b.order)
      .map((assignment) => ({
        id: assignment.playerId,
        name: assignment.playerName,
        order: assignment.order,
      }));
  }, [assignments]);

  const networkDayState = useMemo<DerivedDayState | null>(() => {
    if (!isNetworkMode) {
      return null;
    }
    return deriveNetworkDayState({
      events: networkDayEvents,
      round: dayRound,
      participants: dayParticipants,
    });
  }, [dayParticipants, dayRound, isNetworkMode, networkDayEvents]);

  const votedOutName = useMemo(() => {
    if (!dayRecord.votedOutId) {
      return null;
    }
    return assignmentMap[dayRecord.votedOutId]?.playerName ?? null;
  }, [assignmentMap, dayRecord.votedOutId]);

  const votedOutRoleName = useMemo(() => {
    if (!revealOnDeath || !dayRecord.votedOutId) {
      return null;
    }
    const assignment = assignmentMap[dayRecord.votedOutId];
    if (!assignment?.roleId) {
      return null;
    }
    try {
      return getRoleDefinition(assignment.roleId as RoleId).name;
    } catch {
      return null;
    }
  }, [assignmentMap, dayRecord.votedOutId, revealOnDeath]);

  const votedOutDisplayName = useMemo(() => {
    if (!votedOutName) {
      return null;
    }
    if (!revealOnDeath || !votedOutRoleName) {
      return votedOutName;
    }
    return `${votedOutName} (${votedOutRoleName})`;
  }, [votedOutName, votedOutRoleName, revealOnDeath]);

  const voteResolved = dayRecord.skipped || Boolean(dayRecord.votedOutId);
  const gameEnded = Boolean(outcome);

  useEffect(() => {
    if (voteResolved) {
      setSelectedPlayerId(null);
    }
  }, [voteResolved]);

  const morningSummary = useMemo(
    () => buildMorningSummary(casualtyDetails, savedNames, revealOnDeath),
    [casualtyDetails, savedNames, revealOnDeath]
  );

  useEffect(() => {
    setPhase('day');
    stop();
  }, [setPhase]);

  useEffect(() => {
    if (!isNetworkMode) {
      setHostActionMessage(null);
      setHostActionTone('info');
    }
  }, [isNetworkMode]);

  useEffect(() => {
    if (!isNetworkMode) {
      return;
    }
    if (rematchResult === 'accepted') {
      setHostActionMessage('Rematch beschlossen – neue Runde wird vorbereitet.');
      setHostActionTone('info');
    } else if (rematchResult === 'rejected') {
      setHostActionMessage('Rematch abgelehnt – ihr kehrt zum Start zurück.');
      setHostActionTone('info');
    }
  }, [isNetworkMode, rematchResult]);

  const networkResolutionTriggeredRef = useRef(false);
  const networkAutoStartRef = useRef(false);
  const autoNightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoNightTriggeredRef = useRef(false);
  const rematchNavigationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNetworkMode || !rematchState?.result) {
      return;
    }
    if (rematchState.result === 'rejected') {
      if (rematchNavigationRef.current === rematchState.pollId) {
        return;
      }
      rematchNavigationRef.current = rematchState.pollId;
      resetGame();
      router.replace('/');
      rematchNavigationRef.current = null;
      return;
    }
    if (rematchState.result === 'accepted') {
      rematchNavigationRef.current = rematchState.pollId;
      setShowOutcomeModal(false);
      setOutcomeSeen(false);
    }
  }, [isNetworkMode, rematchState, resetGame, router]);

  useEffect(() => {
    if (!isNetworkMode) {
      return;
    }
    if (!rematchNavigationRef.current) {
      return;
    }
    if (status !== 'reveal') {
      return;
    }
    if (assignments.length === 0) {
      return;
    }
    rematchNavigationRef.current = null;
    router.replace('/setup/network/reveal');
  }, [assignments.length, isNetworkMode, router, status]);

  useEffect(() => {
    networkResolutionTriggeredRef.current = false;
    networkAutoStartRef.current = false;
    autoNightTriggeredRef.current = false;
    if (autoNightTimeoutRef.current) {
      clearTimeout(autoNightTimeoutRef.current);
      autoNightTimeoutRef.current = null;
    }
  }, [dayRound]);
  const outcomeAnnounced = useRef<string | null>(null);
  useEffect(() => {
    if (!outcome) {
      outcomeAnnounced.current = null;
      return;
    }
    const message = formatOutcomeMessage(outcome);
    if (outcomeAnnounced.current === message) {
      return;
    }
    outcomeAnnounced.current = message;
    stop();
    speak(message);
  }, [outcome]);

  const voteAnnouncement = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (autoNightTimeoutRef.current) {
        clearTimeout(autoNightTimeoutRef.current);
        autoNightTimeoutRef.current = null;
      }
    };
  }, []);
  const scheduleAutoNight = useCallback(() => {
    if (gameEnded) {
      return;
    }
    if (autoNightTriggeredRef.current) {
      return;
    }
    autoNightTriggeredRef.current = true;
    if (autoNightTimeoutRef.current) {
      clearTimeout(autoNightTimeoutRef.current);
    }
    autoNightTimeoutRef.current = setTimeout(() => {
      setPhase('night');
      router.replace('/night');
    }, 4500);
  }, [gameEnded, router, setPhase]);

  useEffect(() => {
    if (!voteResolved) {
      voteAnnouncement.current = null;
      autoNightTriggeredRef.current = false;
      if (autoNightTimeoutRef.current) {
        clearTimeout(autoNightTimeoutRef.current);
        autoNightTimeoutRef.current = null;
      }
      return;
    }
    let message: string | null = null;
    if (dayRecord.skipped) {
      message = 'Das Dorf verzichtet heute auf eine Abstimmung.';
    } else if (votedOutDisplayName) {
      message = `${votedOutDisplayName} wurde vom Dorf verbannt.`;
    }
    if (outcome) {
      const outcomeMessage = formatOutcomeMessage(outcome);
      outcomeAnnounced.current = outcomeMessage;
      message = message ? `${message} ${outcomeMessage}` : outcomeMessage;
    }
    if (message) {
      if (voteAnnouncement.current === message) {
        scheduleAutoNight();
        return;
      }
      voteAnnouncement.current = message;
      speakSequence([message], {
        onComplete: scheduleAutoNight,
      });
    } else {
      scheduleAutoNight();
    }
  }, [
    dayRecord.skipped,
    outcome,
    scheduleAutoNight,
    voteResolved,
    votedOutDisplayName,
  ]);

  // Derived values for network day control (used by effects below)
  const skipSupportCount = networkDayState?.skipSupportCount ?? 0;
  const skipMajorityNeeded = networkDayState
    ? Math.max(Math.floor(networkDayState.eligibleIds.length / 2) + 1, 1)
    : Math.max(Math.floor(alivePlayers.length / 2) + 1, 1);
  const skipHasMajority = Boolean(networkDayState?.skipHasMajority);
  const readyCount = networkDayState?.readyIds.length ?? 0;
  const totalEligible = networkDayState?.eligibleIds.length ?? alivePlayers.length;
  const majorityReady = readyCount > totalEligible / 2;
  
  
  useEffect(() => {
    if (!isNetworkMode || !networkDayState || voteResolved) {
      return;
    }
    if (networkDayState.stage === 'voting') {
      return;
    }
    if (skipHasMajority) {
      networkAutoStartRef.current = false;
      return;
    }
    const validCandidates = networkDayState.nominations
      .filter((nomination) => nomination.valid)
      .map((nomination) => nomination.targetId);
    if (validCandidates.length === 0) {
      networkAutoStartRef.current = false;
      return;
    }
    if (!majorityReady || totalEligible === 0) {
      networkAutoStartRef.current = false;
      return;
    }
    if (networkAutoStartRef.current) {
      return;
    }
    networkAutoStartRef.current = true;
    void (async () => {
      const result = await startDayVote(validCandidates);
      if (!result.ok) {
        setHostActionMessage(result.error ?? 'Abstimmung konnte nicht gestartet werden.');
        setHostActionTone('error');
        networkAutoStartRef.current = false;
      } else {
        setHostActionMessage('Mehrheit ist bereit – Abstimmung gestartet.');
        setHostActionTone('info');
      }
    })();
  }, [
    isNetworkMode,
    majorityReady,
    networkDayState,
    skipHasMajority,
    startDayVote,
    totalEligible,
    voteResolved,
  ]);

  useEffect(() => {
    if (!isNetworkMode || !networkDayState || voteResolved) {
      return;
    }
    if (networkResolutionTriggeredRef.current) {
      return;
    }
    if (skipHasMajority && networkDayState.stage === 'nominations') {
      networkResolutionTriggeredRef.current = true;
      resolveDayVote({ targetId: null, skip: true });
      setHostActionMessage('Das Dorf hat die Abstimmung übersprungen.');
      setHostActionTone('info');
      return;
    }
    if (
      networkDayState.stage === 'nominations' &&
      skipSupportCount > 0 &&
      !skipHasMajority &&
      hostActionTone !== 'error'
    ) {
      setHostActionMessage(
        `Skip-Stimmen: ${skipSupportCount}/${skipMajorityNeeded} – noch keine Mehrheit.`
      );
      setHostActionTone('info');
    }
    if (networkDayState.majorityTargetId) {
      networkResolutionTriggeredRef.current = true;
      resolveDayVote({ targetId: networkDayState.majorityTargetId, skip: false });
      setHostActionMessage('Mehrheit erreicht – Ergebnis festgehalten.');
      setHostActionTone('info');
      return;
    }
    if (networkDayState.tie) {
      networkResolutionTriggeredRef.current = true;
      resolveDayVote({ targetId: null, skip: true });
      setHostActionMessage('Abstimmung endet ohne Ergebnis.');
      setHostActionTone('info');
    }
  }, [
    isNetworkMode,
    networkDayState,
    resolveDayVote,
    skipHasMajority,
    skipMajorityNeeded,
    hostActionTone,
    skipSupportCount,
    voteResolved,
  ]);

  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const cardBorder = useThemeColor(
    { light: 'rgba(135,255,134,0.22)', dark: 'rgba(135,255,134,0.22)' },
    'tint'
  );

  const readyMissingNames = networkDayState
    ? networkDayState.readyMissingIds.map(getPlayerName)
    : [];
  const readyMissingDisplay =
    readyMissingNames.length > 0 ? formatNameList(readyMissingNames) : 'weitere Katzen';
  const pendingVoteNames = networkDayState
    ? networkDayState.pendingVoterIds.map(getPlayerName)
    : [];
  const pendingVoteDisplay =
    pendingVoteNames.length > 0 ? formatNameList(pendingVoteNames) : '';
  const validNominationCount = networkDayState
    ? networkDayState.nominations.filter((nomination) => nomination.valid).length
    : 0;

  const handleSubmitVote = () => {
    if (!selectedPlayerId) {
      return;
    }
    resolveDayVote({ targetId: selectedPlayerId, skip: false });
  };

  const handleSkipVote = () => {
    resolveDayVote({ targetId: null, skip: true });
  };

  const handleNetworkStartVote = async () => {
    if (!networkDayState || voteResolved || networkDayState.stage === 'voting') {
      return;
    }
    const readyCount = networkDayState.readyIds.length;
    const totalEligible = networkDayState.eligibleIds.length;
    if (readyCount !== totalEligible || totalEligible === 0) {
      setHostActionMessage('Noch nicht alle Katzen sind bereit.');
      setHostActionTone('error');
      return;
    }
    const validCandidates = networkDayState.nominations
      .filter((nomination) => nomination.valid)
      .map((nomination) => nomination.targetId);
    if (validCandidates.length === 0) {
      setHostActionMessage('Es gibt noch keine bestätigten Nominierungen.');
      setHostActionTone('error');
      return;
    }
    setStartingVote(true);
    const result = await startDayVote(validCandidates);
    setStartingVote(false);
    if (!result.ok) {
      setHostActionMessage(result.error ?? 'Abstimmung konnte nicht gestartet werden.');
      setHostActionTone('error');
      networkAutoStartRef.current = false;
    } else {
      setHostActionMessage('Abstimmung gestartet.');
      setHostActionTone('info');
    }
  };

  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [outcomeSeen, setOutcomeSeen] = useState(false);

  useEffect(() => {
    if (outcome) {
      if (!outcomeSeen) {
        setShowOutcomeModal(true);
        setOutcomeSeen(true);
      }
    } else {
      setOutcomeSeen(false);
      setShowOutcomeModal(false);
    }
  }, [outcome, outcomeSeen]);

  const outcomeMessage = outcome ? formatOutcomeMessage(outcome) : '';
  const playAgainLabel = isNetworkMode
    ? requestingRematch
      ? 'Abstimmung startet…'
      : rematchInProgress
      ? 'Abstimmung läuft…'
      : 'Rematch abstimmen'
    : 'Nochmal spielen';
  const playAgainDisabled = isNetworkMode && (requestingRematch || rematchInProgress);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Tagphase
        </ThemedText>
        <View style={styles.roundBadge}>
          <ThemedText style={styles.roundBadgeText}>Runde {dayRound}</ThemedText>
        </View>
        <ThemedText style={styles.description}>
          Das Dorf erwacht. Erzählt, was in der Nacht passiert ist, diskutiert gemeinsam und stimmt
          über einen Verdacht ab – oder überspringt die Runde.
        </ThemedText>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <ThemedText type="subtitle">Ereignisse der Nacht</ThemedText>
          <ThemedText style={styles.cardText}>{morningSummary}</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <ThemedText type="subtitle">Abstimmung</ThemedText>
          {isNetworkMode ? (
            networkDayState ? (
              <>
                <ThemedText style={styles.cardText}>
                  Mehrgeräte-Modus: Die Katzen nominieren und stimmen auf ihren eigenen Geräten ab.
                </ThemedText>
                <View style={styles.networkStatsRow}>
                  <View style={styles.networkBadge}>
                    <ThemedText style={styles.networkBadgeLabel}>
                      Bereit {networkDayState.readyIds.length}/{networkDayState.eligibleIds.length}
                    </ThemedText>
                  </View>
                  {majorityReady ? (
                    <ThemedText style={styles.networkHint}>
                      Mehrheit bereit: {readyCount}/{totalEligible}
                    </ThemedText>
                  ) : (
                    <ThemedText style={styles.networkHint}>
                      Wartet auf {readyMissingDisplay}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.nominationSection}>
                  <ThemedText type="defaultSemiBold" style={styles.sectionHeading}>
                    Nominierungen
                  </ThemedText>
                  {networkDayState.nominations.length === 0 ? (
                    <ThemedText style={styles.networkHint}>
                      Noch keine vorgeschlagenen Katzen.
                    </ThemedText>
                  ) : (
                    networkDayState.nominations.map((nomination) => {
                      const hasSupport = nomination.supporterCount > 0;
                      return (
                        <View
                          key={nomination.targetId}
                          style={[
                            styles.nominationItem,
                            nomination.valid ? styles.nominationValid : styles.nominationPending,
                          ]}>
                          <ThemedText type="defaultSemiBold" style={styles.nominationName}>
                            {getPlayerName(nomination.targetId)}
                          </ThemedText>
                          <ThemedText style={styles.nominationDetail}>
                            Vorgeschlagen von {formatPlayerList(nomination.nominators)}
                          </ThemedText>
                          <ThemedText style={styles.nominationDetail}>
                            {hasSupport
                              ? `Unterstützung: ${formatPlayerList(nomination.supporters)}`
                              : 'Wartet auf Unterstützung'}
                          </ThemedText>
                        </View>
                      );
                    })
                  )}
                </View>
                {hostActionMessage ? (
                  <ThemedText
                    style={[
                      styles.networkMessage,
                      hostActionTone === 'error'
                        ? styles.networkMessageError
                        : styles.networkMessageInfo,
                    ]}>
                    {hostActionMessage}
                  </ThemedText>
                ) : null}
                {networkDayState.stage === 'nominations' ? (
                  <View style={styles.voteActions}>
                    <PrimaryButton
                      label={startingVote ? 'Startet…' : 'Abstimmung starten'}
                      onPress={handleNetworkStartVote}
                      disabled={
                        voteResolved ||
                        startingVote ||
                        !majorityReady ||
                        validNominationCount === 0 ||
                        networkDayState.skipHasMajority
                      }
                    />
                    <ThemedText style={styles.networkHint}>
                      Skip-Stimmen: {skipSupportCount}/{skipMajorityNeeded}
                      {skipHasMajority ? ' – Mehrheit fürs Überspringen erreicht.' : ' – Mehrheit nötig.'}
                    </ThemedText>
                  </View>
                ) : (
                  <>
                    <ThemedText style={styles.cardText}>
                      Stimmen abgegeben: {networkDayState.totalVotes}/
                      {networkDayState.eligibleIds.length}. Mehrheit bei {networkDayState.majorityThreshold}.
                    </ThemedText>
                    <View style={styles.networkVoteList}>
                      {networkDayState.candidates.map((candidateId) => (
                        <View key={candidateId} style={styles.networkVoteItem}>
                          <ThemedText style={styles.networkVoteName}>
                            {getPlayerName(candidateId)}
                          </ThemedText>
                          <View style={styles.networkVoteCountBadge}>
                            <ThemedText style={styles.networkVoteCountText}>
                              {networkDayState.voteCounts[candidateId] ?? 0}
                            </ThemedText>
                          </View>
                        </View>
                      ))}
                    </View>
                    {pendingVoteNames.length > 0 ? (
                      <ThemedText style={styles.networkHint}>
                        Wartet auf Stimmen von {pendingVoteDisplay}.
                      </ThemedText>
                    ) : (
                      <ThemedText style={styles.networkHint}>
                        Alle Stimmen sind abgegeben. Mehrheit bei {networkDayState.majorityThreshold}.
                      </ThemedText>
                    )}
                  </>
                )}
              </>
            ) : (
              <ThemedText style={styles.cardText}>
                Netzwerkstatus wird geladen. Bitte einen Moment Geduld.
              </ThemedText>
            )
          ) : (
            <>
              <ThemedText style={styles.cardText}>
                Noch im Spiel: {alivePlayers.length} Katzen. Tippe auf eine Katze, um deine Wahl zu
                markieren.
              </ThemedText>
              <VotingList
                players={alivePlayers}
                selectedId={selectedPlayerId}
                disabled={voteResolved || gameEnded}
                onSelect={setSelectedPlayerId}
              />
              <View style={styles.voteActions}>
                <PrimaryButton
                  label="Abstimmung abschließen"
                  onPress={handleSubmitVote}
                  disabled={!selectedPlayerId || voteResolved || gameEnded}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={voteResolved || gameEnded ? undefined : handleSkipVote}
                  style={({ pressed }) => [
                    styles.skipButton,
                    { opacity: pressed && !voteResolved && !gameEnded ? 0.7 : 1 },
                  ]}>
                  <ThemedText
                    style={[
                      styles.skipLabel,
                      (voteResolved || gameEnded) && styles.skipLabelDisabled,
                    ]}>
                    Abstimmung überspringen
                  </ThemedText>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {voteResolved ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <ThemedText type="subtitle">Ergebnis</ThemedText>
            <ThemedText style={styles.cardText}>
              {dayRecord.skipped
                ? 'Das Dorf hat heute niemanden gewählt.'
                : votedOutDisplayName
                ? `${votedOutDisplayName} verlässt das Spiel.`
                : 'Ergebnis konnte nicht ermittelt werden.'}
            </ThemedText>
          </View>
        ) : null}

        {isNetworkMode && rematchState ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <ThemedText type="subtitle">Rematch-Abstimmung</ThemedText>
            <ThemedText style={styles.cardText}>
              Ja: {rematchVoteStats?.yes ?? 0} • Nein: {rematchVoteStats?.no ?? 0} • Offen: {rematchVoteStats?.pending ?? 0}
            </ThemedText>
            <ThemedText style={styles.cardText}>
              Mehrheit benötigt: {rematchVoteStats?.majority ?? Math.max(Math.floor(rematchEligiblePlayers.length / 2) + 1, 1)}
            </ThemedText>
            {rematchResult ? (
              <ThemedText
                style={[
                  styles.cardText,
                  rematchResult === 'accepted' ? styles.rematchSuccess : styles.rematchRejected,
                ]}>
                {rematchResult === 'accepted'
                  ? 'Mehrheit für ein Rematch. Neue Runde wird vorbereitet.'
                  : 'Rematch abgelehnt. Zurück zum Start.'}
              </ThemedText>
            ) : (
              <ThemedText style={styles.cardText}>
                Abstimmung läuft – Ergebnis wird automatisch übernommen.
              </ThemedText>
            )}
          </View>
        ) : null}

        <PrimaryButton
          label="Nächste Nacht starten"
          onPress={() => {
            setPhase('night');
            router.replace('/night');
          }}
          disabled={!voteResolved || gameEnded}
        />

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              stop();
              router.back();
            }}>
            <ThemedText style={styles.backLabel}>Zur Host-Übersicht</ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
      {outcome ? (
        <OutcomeModal
          visible={showOutcomeModal}
          outcomeMessage={outcomeMessage}
          playAgainLabel={playAgainLabel}
          playAgainDisabled={playAgainDisabled}
          onPlayAgain={async () => {
            if (isNetworkMode) {
              if (requestingRematch || rematchInProgress) {
                return;
              }
              setRequestingRematch(true);
              const result = await startRematchVote();
              setRequestingRematch(false);
              if (!result.ok) {
                setHostActionMessage(result.error ?? 'Rematch-Abstimmung konnte nicht gestartet werden.');
                setHostActionTone('error');
                return;
              }
              setHostActionMessage('Rematch-Abstimmung gestartet. Stimmen werden gesammelt.');
              setHostActionTone('info');
              setShowOutcomeModal(false);
              setOutcomeSeen(false);
              return;
            }
            setShowOutcomeModal(false);
            setOutcomeSeen(false);
            prepareRematch();
            const targetRoute = '/setup/single/roles';
            router.replace(targetRoute);
          }}
          onExit={() => {
            setShowOutcomeModal(false);
            setOutcomeSeen(false);
            resetGame();
            router.replace('/');
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function OutcomeModal({
  visible,
  outcomeMessage,
  playAgainLabel = 'Nochmal spielen',
  playAgainDisabled = false,
  onPlayAgain,
  onExit,
}: {
  visible: boolean;
  outcomeMessage: string;
  playAgainLabel?: string;
  playAgainDisabled?: boolean;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onExit}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ThemedText type="title" style={styles.modalTitle}>
            Spiel beendet
          </ThemedText>
          <ThemedText style={styles.modalSubtitle}>{outcomeMessage}</ThemedText>
          <View style={styles.modalActions}>
            <PrimaryButton label={playAgainLabel} onPress={onPlayAgain} disabled={playAgainDisabled} />
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.modalCloseButton, { opacity: pressed ? 0.7 : 1 }]}
              onPress={onExit}>
              <ThemedText style={styles.modalCloseText}>Beenden</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function VotingList({
  players,
  selectedId,
  disabled,
  onSelect,
}: {
  players: VotePlayer[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const itemBg = useThemeColor({ light: 'rgba(9,16,28,0.88)', dark: 'rgba(9,16,28,0.88)' }, 'background');
  const highlight = useThemeColor({ light: '#87ff86', dark: '#87ff86' }, 'tint');
  if (players.length === 0) {
    return (
      <View style={styles.voteEmpty}>
        <ThemedText style={styles.voteEmptyText}>Keine Katzen mehr zur Auswahl.</ThemedText>
      </View>
    );
  }
  return (
    <View style={styles.voteList}>
      {players.map((player) => {
        const isSelected = player.id === selectedId;
        return (
          <Pressable
            key={player.id}
            accessibilityRole={disabled ? undefined : 'button'}
            onPress={disabled ? undefined : () => onSelect(player.id)}
            style={({ pressed }) => [
              styles.voteItem,
              {
                backgroundColor: itemBg,
                borderColor: isSelected ? highlight : 'rgba(135,255,134,0.16)',
                opacity: pressed && !disabled ? 0.85 : disabled ? 0.45 : 1,
              },
            ]}>
            <ThemedText style={styles.voteItemOrder}>#{player.order}</ThemedText>
            <ThemedText style={styles.voteItemName}>{player.name}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function buildMorningSummary(
  casualties: CasualtyDetail[],
  saved: string[],
  revealRoles: boolean
): string {
  if (casualties.length > 0) {
    const list = formatNameList(
      casualties.map((entry) =>
        revealRoles && entry.roleName ? `${entry.name} (${entry.roleName})` : entry.name
      )
    );
    const verb = casualties.length === 1 ? 'hat' : 'haben';
    return `Am Morgen entdeckt ihr: ${list} ${verb} die Nacht nicht überlebt.`;
  }
  if (saved.length > 0) {
    const list = formatNameList(saved);
    const verb = saved.length === 1 ? 'ist' : 'sind';
    return `Gute Nachrichten: ${list} ${verb} dank des Doktors noch im Spiel.`;
  }
  return 'Niemand ist in dieser Nacht gestorben.';
}

function formatOutcomeMessage(outcome: GameOutcome): string {
  return outcome.winner === 'dorf'
    ? `Das Dorf gewinnt! ${outcome.reason}`
    : `Die Alienkatzen gewinnen! ${outcome.reason}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  container: {
    padding: 24,
    gap: 24,
    paddingTop: 64,
    paddingBottom: 72,
  },
  title: {
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  roundBadge: {
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(135,255,134,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.35)',
    shadowColor: '#1fff76',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
    marginTop: 12,
  },
  roundBadgeText: {
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.82,
  },
  description: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    color: '#d8ffe8',
    marginTop: 12,
  },
  card: {
    borderRadius: 24,
    padding: 22,
    gap: 12,
    borderWidth: 1,
    shadowColor: '#3aff9d',
    shadowOpacity: 0.24,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#d8ffe8',
  },
  rematchSuccess: {
    color: '#87ff86',
  },
  rematchRejected: {
    color: '#ff7aa6',
  },
  voteActions: {
    gap: 12,
    marginTop: 12,
  },
  networkStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  networkBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(135,255,134,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.4)',
  },
  networkBadgeLabel: {
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#87ff86',
  },
  networkHint: {
    flex: 1,
    fontSize: 13,
    color: '#d8ffe8',
    opacity: 0.82,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipLabel: {
    color: '#87ff86',
    fontSize: 14,
  },
  skipLabelDisabled: {
    opacity: 0.5,
  },
  nominationSection: {
    marginTop: 16,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 15,
    opacity: 0.9,
  },
  nominationItem: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    backgroundColor: 'rgba(9,16,28,0.88)',
    gap: 6,
  },
  nominationValid: {
    borderColor: '#87ff86',
    shadowColor: '#1fff76',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  nominationPending: {
    borderStyle: 'dashed',
  },
  nominationName: {
    fontSize: 15,
  },
  nominationDetail: {
    fontSize: 13,
    color: '#d8ffe8',
    opacity: 0.82,
  },
  networkMessage: {
    marginTop: 12,
    fontSize: 13,
  },
  networkMessageError: {
    color: '#ff7aa6',
  },
  networkMessageInfo: {
    color: '#87ff86',
  },
  voteList: {
    gap: 12,
  },
  networkVoteList: {
    marginTop: 16,
    gap: 10,
  },
  networkVoteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    backgroundColor: 'rgba(9,16,28,0.88)',
  },
  networkVoteName: {
    fontSize: 15,
  },
  networkVoteCountBadge: {
    minWidth: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: 'rgba(135,255,134,0.18)',
  },
  networkVoteCountText: {
    fontSize: 14,
    color: '#87ff86',
  },
  voteItem: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(9,16,28,0.88)',
    borderColor: 'rgba(135,255,134,0.16)',
    shadowColor: '#1fff76',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  voteItemOrder: {
    fontSize: 13,
    opacity: 0.7,
  },
  voteItemName: {
    fontSize: 15,
  },
  voteEmpty: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(9,16,28,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.25)',
  },
  voteEmptyText: {
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.85,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backLabel: {
    color: '#87ff86',
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,7,15,0.92)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    padding: 24,
    gap: 18,
    backgroundColor: 'rgba(9,16,28,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.28)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.3,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
  },
  modalTitle: {
    textAlign: 'center',
  },
  modalSubtitle: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    color: '#d8ffe8',
  },
  modalActions: {
    gap: 12,
  },
  modalCloseButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalCloseText: {
    color: '#ff7aa6',
    fontSize: 14,
  },
});
