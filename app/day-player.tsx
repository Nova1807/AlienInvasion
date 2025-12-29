import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { deriveNetworkDayState, type DayParticipant, type DerivedDayState } from '@/utils/network-day';
import { formatNameList } from '@/utils/text';

type SelectionOption = {
  id: string;
  name: string;
  order: number;
};

export default function DayPlayerScreen() {
  const router = useRouter();
  const {
    state: {
      networkSessionActive,
      localPlayerId,
      currentPhase,
      networkDayEvents,
      assignments,
      players,
      mode,
      round,
      rematchState,
      status,
    },
    nominateDayTarget,
    supportDayNomination,
    setDayReady,
    submitDayVote,
    setSkipSupport,
    startDayVote,
    castRematchVote,
  } = useGame();

  const [dayRound] = useState(round);
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);
  const [playerMessage, setPlayerMessage] = useState<string | null>(null);
  const [playerTone, setPlayerTone] = useState<'info' | 'error'>('info');
  const [nominationBusy, setNominationBusy] = useState(false);
  const [supportBusyId, setSupportBusyId] = useState<string | null>(null);
  const [readyBusy, setReadyBusy] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const [rematchBusy, setRematchBusy] = useState(false);

  useEffect(() => {
    if (!networkSessionActive || !localPlayerId || mode !== 'network') {
      router.replace('/setup/network/join');
      return;
    }
    if (status !== 'inProgress') {
      router.replace('/setup/network/player');
      return;
    }
    if (currentPhase === 'night') {
      router.replace('/night-player');
      return;
    }
    if (currentPhase !== 'day') {
      router.replace('/setup/network/player');
    }
  }, [currentPhase, localPlayerId, mode, networkSessionActive, router, status]);

  const localPlayer = useMemo(
    () => players.find((player) => player.id === localPlayerId) ?? null,
    [players, localPlayerId]
  );

  useEffect(() => {
    if (localPlayer?.isHost) {
      router.replace('/host');
    }
  }, [localPlayer?.isHost, router]);

  const assignmentMap = useMemo(() => {
    return assignments.reduce<Map<string, (typeof assignments)[number]>>((map, assignment) => {
      map.set(assignment.playerId, assignment);
      return map;
    }, new Map());
  }, [assignments]);

  const rematchEligiblePlayers = useMemo(
    () => players,
    [players]
  );

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

  const rematchResult = rematchState?.result ?? null;

  const localRematchVote = useMemo(() => {
    if (!rematchState || !localPlayerId) {
      return null;
    }
    return rematchState.votes[localPlayerId] ?? null;
  }, [localPlayerId, rematchState]);

  const rematchYesDisabled = rematchBusy || localRematchVote === 'yes';
  const rematchNoDisabled = rematchBusy || localRematchVote === 'no';

  const participants = useMemo<DayParticipant[]>(() => {
    if (assignments.length > 0) {
      return assignments.map((assignment) => ({
        id: assignment.playerId,
        name: assignment.playerName,
        alive: assignment.alive,
      }));
    }
    return players
      .map((player, index) => ({
        id: player.id,
        name: player.name.trim() || `Katze ${index + 1}`,
        alive: player.alive,
      }));
  }, [assignments, players]);

  const networkDayState = useMemo<DerivedDayState | null>(() => {
    if (mode !== 'network') {
      return null;
    }
    return deriveNetworkDayState({
      events: networkDayEvents,
      round: dayRound,
      participants,
    });
  }, [mode, networkDayEvents, dayRound, participants]);

  const localAssignment = useMemo(() => {
    if (!localPlayerId) {
      return null;
    }
    return assignmentMap.get(localPlayerId) ?? null;
  }, [assignmentMap, localPlayerId]);
  const isAlive = localAssignment ? localAssignment.alive : localPlayer?.alive ?? true;
  const localId = localPlayerId ?? '';
  const isEligible = Boolean(networkDayState?.eligibleIds.includes(localId) && isAlive);

  const localNomination = networkDayState?.nominationByPlayer[localId] ?? null;
  const localSupports = useMemo(() => {
    return networkDayState?.supportByPlayer[localId] ?? [];
  }, [networkDayState, localId]);
  const localReady = networkDayState?.readyByPlayer[localId] ?? false;
  const remoteVote = networkDayState?.votesByPlayer[localId] ?? null;

  useEffect(() => {
    if (networkDayState?.stage === 'voting') {
      setPendingVoteId(remoteVote);
    } else {
      setPendingVoteId(null);
    }
  }, [networkDayState?.stage, remoteVote]);

  useEffect(() => {
    setPlayerMessage(null);
    setPlayerTone('info');
  }, [networkDayState?.stage]);

  useEffect(() => {
    if (!rematchState?.result) {
      return;
    }
    if (rematchState.result === 'rejected') {
      if (rematchNavigationRef.current === rematchState.pollId) {
        return;
      }
      rematchNavigationRef.current = rematchState.pollId;
      setPlayerMessage('Rematch abgelehnt – danke fürs Mitspielen!');
      setPlayerTone('info');
      router.replace('/');
      rematchNavigationRef.current = null;
      return;
    }
    if (rematchState.result === 'accepted') {
      rematchNavigationRef.current = rematchState.pollId;
      setPlayerMessage('Rematch beschlossen – neue Runde wird vorbereitet.');
      setPlayerTone('info');
    }
  }, [rematchState, router]);

  useEffect(() => {
    if (!rematchNavigationRef.current) {
      return;
    }
    if (status !== 'setup') {
      return;
    }
    rematchNavigationRef.current = null;
    router.replace('/setup/network/player');
  }, [router, status]);

  const aliveOptions = useMemo<SelectionOption[]>(() => {
    if (assignments.length > 0) {
      return assignments
        .filter((assignment) => assignment.alive)
        .sort((a, b) => a.order - b.order)
        .map((assignment) => ({
          id: assignment.playerId,
          name: assignment.playerName,
          order: assignment.order,
        }));
    }
    const aliveParticipants = participants.filter((participant) => participant.alive);
    return aliveParticipants.map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      order: index + 1,
    }));
  }, [assignments, participants]);

  const getPlayerName = useCallback(
    (playerId: string) => {
      const assignment = assignmentMap.get(playerId);
      if (assignment) {
        return assignment.playerName;
      }
      const record = players.find((player) => player.id === playerId);
      if (record) {
        const trimmed = record.name.trim();
        return trimmed || 'Unbekannt';
      }
      return 'Unbekannt';
    },
    [assignmentMap, players]
  );

  const formatPlayerList = useCallback(
    (playerIds: string[]) => {
      const names = playerIds.map(getPlayerName).filter((name) => Boolean(name));
      return names.length > 0 ? formatNameList(names) : '—';
    },
    [getPlayerName]
  );

  const readyCount = networkDayState?.readyIds.length ?? 0;
  const totalEligible = networkDayState?.eligibleIds.length ?? aliveOptions.length;
  const majorityThreshold = networkDayState?.majorityThreshold ?? Math.floor(totalEligible / 2) + 1;
  const localSkipSupport = Boolean(networkDayState?.skipSupportIds.includes(localId));
  const skipSupportCount = networkDayState?.skipSupportCount ?? 0;
  const skipMajorityNeeded = Math.max(Math.floor(totalEligible / 2) + 1, 1);
  const skipHasMajority = Boolean(networkDayState?.skipHasMajority);
  const panelBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const panelBorder = useThemeColor(
    { light: 'rgba(135,255,134,0.24)', dark: 'rgba(135,255,134,0.24)' },
    'tint'
  );

  const autoStartRef = useRef(false);
  const rematchNavigationRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'network' || !networkDayState || networkDayState.stage === 'voting') {
      autoStartRef.current = networkDayState?.stage === 'voting';
      return;
    }
    if (skipHasMajority) {
      autoStartRef.current = false;
      return;
    }
    const validCandidates = networkDayState.nominations
      .filter((nomination) => nomination.valid)
      .map((nomination) => nomination.targetId);
    if (
      networkDayState.eligibleIds.length > 0 &&
      networkDayState.readyIds.length === networkDayState.eligibleIds.length &&
      validCandidates.length > 0 &&
      !autoStartRef.current
    ) {
      autoStartRef.current = true;
      void startDayVote(validCandidates).catch(() => {
        autoStartRef.current = false;
      });
    }
    if (
      networkDayState.readyIds.length !== networkDayState.eligibleIds.length ||
      validCandidates.length === 0
    ) {
      autoStartRef.current = false;
    }
  }, [mode, networkDayState, skipHasMajority, startDayVote]);

  const setInfoMessage = useCallback((message: string) => {
    setPlayerMessage(message);
    setPlayerTone('info');
  }, []);

  const setErrorMessage = useCallback((message: string) => {
    setPlayerMessage(message);
    setPlayerTone('error');
  }, []);

  const handleNominate = useCallback(
    async (targetId: string) => {
      if (!isEligible || nominationBusy) {
        return;
      }
      const nextTarget = localNomination === targetId ? null : targetId;
      setNominationBusy(true);
      const result = await nominateDayTarget(nextTarget);
      setNominationBusy(false);
      if (!result.ok) {
        setErrorMessage(result.error ?? 'Nominierung fehlgeschlagen.');
        return;
      }
      if (nextTarget) {
        setInfoMessage(`Du nominierst ${getPlayerName(nextTarget)}.`);
      } else {
        setInfoMessage('Nominierung zurückgezogen.');
      }
    },
    [
      getPlayerName,
      isEligible,
      localNomination,
      nominateDayTarget,
      nominationBusy,
      setErrorMessage,
      setInfoMessage,
    ]
  );

  const handleSupportToggle = useCallback(
    async (targetId: string) => {
      if (!isEligible || supportBusyId === targetId) {
        return;
      }
      const nominationDetails = networkDayState?.nominations.find(
        (nomination) => nomination.targetId === targetId
      );
      if (nominationDetails && nominationDetails.nominators.includes(localId)) {
        setErrorMessage('Du kannst deinen eigenen Vorschlag nicht unterstützen.');
        return;
      }
      const nextSupport = !localSupports.includes(targetId);
      setSupportBusyId(targetId);
      const result = await supportDayNomination(targetId, nextSupport);
      setSupportBusyId(null);
      if (!result.ok) {
        setErrorMessage(result.error ?? 'Unterstützung konnte nicht geändert werden.');
        return;
      }
      setInfoMessage(
        nextSupport
          ? `Du unterstützt ${getPlayerName(targetId)}.`
          : `Du ziehst die Unterstützung für ${getPlayerName(targetId)} zurück.`
      );
    },
    [
      getPlayerName,
      isEligible,
      localId,
      localSupports,
      networkDayState,
      setErrorMessage,
      setInfoMessage,
      supportBusyId,
      supportDayNomination,
    ]
  );

  const handleReadyToggle = useCallback(async () => {
    if (!isEligible || readyBusy) {
      return;
    }
    setReadyBusy(true);
    const result = await setDayReady(!localReady);
    setReadyBusy(false);
    if (!result.ok) {
      setErrorMessage(result.error ?? 'Bereitschaft konnte nicht gespeichert werden.');
      return;
    }
    setInfoMessage(!localReady ? 'Bereitschaft gemeldet.' : 'Bereitschaft zurückgenommen.');
  }, [isEligible, localReady, readyBusy, setDayReady, setErrorMessage, setInfoMessage]);

  const handleVoteSubmit = useCallback(async () => {
    if (!networkDayState || networkDayState.stage !== 'voting' || !isEligible || voteBusy) {
      return;
    }
    if (!pendingVoteId) {
      setErrorMessage('Bitte wähle zuerst eine Katze aus.');
      return;
    }
    setVoteBusy(true);
    const result = await submitDayVote(pendingVoteId);
    setVoteBusy(false);
    if (!result.ok) {
      setErrorMessage(result.error ?? 'Stimme konnte nicht gespeichert werden.');
      return;
    }
    setInfoMessage(`Du stimmst für ${getPlayerName(pendingVoteId)}.`);
  }, [
    getPlayerName,
    isEligible,
    networkDayState,
    pendingVoteId,
    setErrorMessage,
    setInfoMessage,
    submitDayVote,
    voteBusy,
  ]);

  const handleRematchVote = useCallback(
    async (choice: 'yes' | 'no') => {
      if (!rematchState || rematchResult) {
        return;
      }
      if (!localPlayerId) {
        return;
      }
      if (rematchBusy) {
        return;
      }
      if (localRematchVote === choice) {
        setInfoMessage(
          choice === 'yes'
            ? 'Du stimmst bereits für ein Rematch.'
            : 'Du stimmst bereits gegen ein Rematch.'
        );
        return;
      }
      setRematchBusy(true);
      const result = await castRematchVote(choice);
      setRematchBusy(false);
      if (!result.ok) {
        setErrorMessage(result.error ?? 'Rematch-Stimme konnte nicht gespeichert werden.');
        return;
      }
      setInfoMessage(
        choice === 'yes'
          ? 'Stimme für ein Rematch gespeichert.'
          : 'Stimme gegen ein Rematch gespeichert.'
      );
    },
    [
      castRematchVote,
      localPlayerId,
      localRematchVote,
      rematchBusy,
      rematchResult,
      rematchState,
      setErrorMessage,
      setInfoMessage,
    ]
  );

  const handleSkipToggle = useCallback(async () => {
    if (!isEligible || networkDayState?.stage !== 'nominations' || skipBusy) {
      return;
    }
    setSkipBusy(true);
    const nextSupport = !localSkipSupport;
    const result = await setSkipSupport(nextSupport);
    setSkipBusy(false);
    if (!result.ok) {
      setErrorMessage(result.error ?? 'Überspringen nicht möglich.');
      return;
    }
    if (nextSupport && localReady) {
      void setDayReady(false);
    }
    setInfoMessage(
      nextSupport
        ? 'Du unterstützt das Überspringen der Abstimmung.'
        : 'Du nimmst deine Unterstützung fürs Überspringen zurück.'
    );
  }, [
    isEligible,
    localReady,
    localSkipSupport,
    networkDayState?.stage,
    setDayReady,
    setErrorMessage,
    setInfoMessage,
    setSkipSupport,
    skipBusy,
  ]);

  if (!networkSessionActive || !localPlayerId || mode !== 'network') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.screen}>
          <View style={styles.centered}>
            <ThemedText type="title">Keine Sitzung verbunden</ThemedText>
            <ThemedText style={styles.centeredHint}>
              Bitte kehre zur Lobby zurück und trete erneut bei.
            </ThemedText>
            <PrimaryButton label="Zur Lobby" onPress={() => router.replace('/setup/network/join')} />
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={styles.title}>
            Tagphase
          </ThemedText>
          <View style={styles.roundBadge}>
            <ThemedText style={styles.roundBadgeText}>Runde {dayRound}</ThemedText>
          </View>
          <ThemedText style={styles.description}>
            {networkDayState?.stage === 'voting'
              ? 'Wähle nun eine der bestätigten Katzen. Jede Stimme zählt.'
              : 'Nominiere genau eine Katze und unterstütze Verdächtige deiner Wahl. Tippe anschließend auf „Bereit“ oder stimme für das Überspringen. Sobald eine Mehrheit bereit ist, startet die Abstimmung automatisch – außer das Dorf beschließt zu skippen.'}
          </ThemedText>

          {rematchState ? (
            <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
              <ThemedText type="subtitle">Rematch-Abstimmung</ThemedText>
              <ThemedText style={styles.panelText}>
                Ja: {rematchVoteStats?.yes ?? 0} • Nein: {rematchVoteStats?.no ?? 0} • Offen: {rematchVoteStats?.pending ?? 0}
              </ThemedText>
              <ThemedText style={styles.panelText}>
                Mehrheit benötigt: {rematchVoteStats?.majority ?? Math.max(Math.floor(rematchEligiblePlayers.length / 2) + 1, 1)}
              </ThemedText>
              {rematchResult ? (
                <ThemedText
                  style={[
                    styles.panelText,
                    rematchResult === 'accepted' ? styles.rematchSuccess : styles.rematchRejected,
                  ]}>
                  {rematchResult === 'accepted'
                    ? 'Mehrheit für ein Rematch. Neue Runde startet gleich.'
                    : 'Rematch abgelehnt – dieser Durchgang endet hier.'}
                </ThemedText>
              ) : (
                <View style={styles.rematchActionsRow}>
                  <View style={styles.rematchActionButton}>
                    <PrimaryButton
                      label={
                        rematchYesDisabled
                          ? localRematchVote === 'yes'
                            ? 'Ja gewählt'
                            : 'Stimme…'
                          : 'Ja, Rematch'
                      }
                      onPress={() => handleRematchVote('yes')}
                      disabled={rematchYesDisabled}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={rematchNoDisabled}
                    onPress={() => handleRematchVote('no')}
                    style={({ pressed }) => [
                      styles.rematchNoButton,
                      {
                        opacity: rematchNoDisabled ? 0.45 : pressed ? 0.8 : 1,
                      },
                    ]}>
                    <ThemedText style={styles.rematchNoLabel}>
                      {rematchNoDisabled
                        ? localRematchVote === 'no'
                          ? 'Nein gewählt'
                          : 'Stimme…'
                        : 'Nein, danke'}
                    </ThemedText>
                  </Pressable>
                </View>
              )}
            </View>
          ) : null}

          {!isAlive ? (
            <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
              <ThemedText type="subtitle">Zuschauermodus</ThemedText>
              <ThemedText style={styles.panelText}>
                Du bist nicht mehr im Spiel und kannst nur noch zuschauen.
              </ThemedText>
            </View>
          ) : null}

          {networkDayState ? (
            <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
              <View style={styles.statusRow}>
                <View style={styles.statusBadge}>
                  <ThemedText style={styles.statusBadgeLabel}>
                    Bereit {readyCount}/{totalEligible}
                  </ThemedText>
                </View>
                <ThemedText style={styles.statusHint}>
                  Mehrheit bei {majorityThreshold}
                </ThemedText>
              </View>

              {networkDayState.stage === 'nominations' ? (
                <>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Deine Nominierung
                  </ThemedText>
                  <View style={styles.optionList}>
                    {aliveOptions.map((option) => {
                      const isSelected = localNomination === option.id;
                      return (
                        <Pressable
                          key={option.id}
                          accessibilityRole={isEligible ? 'button' : undefined}
                          onPress={isEligible ? () => handleNominate(option.id) : undefined}
                          style={({ pressed }) => [
                            styles.optionItem,
                            {
                              borderColor: isSelected ? '#87ff86' : 'rgba(135,255,134,0.22)',
                              opacity: pressed && isEligible ? 0.85 : 1,
                            },
                          ]}>
                          <ThemedText style={styles.optionOrder}>#{option.order}</ThemedText>
                          <ThemedText style={styles.optionName}>{option.name}</ThemedText>
                          {isSelected ? (
                            <ThemedText style={styles.optionBadge}>Deine Wahl</ThemedText>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>

                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Unterstützungen
                  </ThemedText>
                  <View style={styles.supportList}>
                    {networkDayState.nominations.length === 0 ? (
                      <ThemedText style={styles.muted}>Noch keine Vorschläge im Umlauf.</ThemedText>
                    ) : (
                      networkDayState.nominations.map((nomination) => {
                        const supported = localSupports.includes(nomination.targetId);
                        const supportBusy = supportBusyId === nomination.targetId;
                        const isOwnNomination = nomination.nominators.includes(localId);
                        return (
                          <View key={nomination.targetId} style={styles.supportItem}>
                            <View style={styles.supportInfo}>
                              <ThemedText style={styles.supportName}>
                                {getPlayerName(nomination.targetId)}
                              </ThemedText>
                              <ThemedText style={styles.supportDetail}>
                                Vorgeschlagen von {formatPlayerList(nomination.nominators)}
                              </ThemedText>
                              <ThemedText style={styles.supportDetail}>
                                Unterstützt von {formatPlayerList(nomination.supporters)}
                              </ThemedText>
                            </View>
                            <PrimaryButton
                              label={
                                supportBusy
                                  ? 'Aktualisiere…'
                                  : isOwnNomination
                                  ? 'Eigenen Vorschlag'
                                  : supported
                                  ? 'Unterstützung zurückziehen'
                                  : 'Unterstützen'
                              }
                              onPress={isOwnNomination ? undefined : () => handleSupportToggle(nomination.targetId)}
                              disabled={!isEligible || supportBusy || isOwnNomination}
                            />
                            {isOwnNomination ? (
                              <ThemedText style={styles.supportHint}>
                                Du brauchst Unterstützung von einer anderen Katze.
                              </ThemedText>
                            ) : null}
                          </View>
                        );
                      })
                    )}
                  </View>

                  <View style={styles.actionsColumn}>
                    <PrimaryButton
                      label={readyBusy ? 'Aktualisiere…' : `Bereit ${readyCount}/${totalEligible}`}
                      onPress={handleReadyToggle}
                      disabled={!isEligible || readyBusy}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={skipBusy ? undefined : handleSkipToggle}
                      style={({ pressed }) => [
                        styles.skipLink,
                        { opacity: pressed && !skipBusy ? 0.7 : skipBusy ? 0.5 : 1 },
                      ]}>
                      <ThemedText style={styles.skipLinkText}>
                        {skipBusy
                          ? 'Übermittle…'
                          : localSkipSupport
                          ? 'Unterstützung fürs Überspringen zurückziehen'
                          : 'Abstimmung überspringen'}
                      </ThemedText>
                    </Pressable>
                    <ThemedText style={styles.muted}>
                      Skip-Stimmen: {skipSupportCount}/{skipMajorityNeeded}
                    </ThemedText>
                    {skipHasMajority ? (
                      <ThemedText style={styles.feedbackInfo}>
                        Mehrheit erreicht – die Runde wird gleich übersprungen.
                      </ThemedText>
                    ) : null}
                  </View>
                </>
              ) : (
                <>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Abstimmung läuft
                  </ThemedText>
                  <View style={styles.optionList}>
                    {networkDayState.candidates.map((candidateId) => {
                      const isSelected = pendingVoteId === candidateId;
                      const voteCount = networkDayState.voteCounts[candidateId] ?? 0;
                      return (
                        <Pressable
                          key={candidateId}
                          accessibilityRole={isEligible ? 'button' : undefined}
                          onPress={isEligible ? () => setPendingVoteId(candidateId) : undefined}
                          style={({ pressed }) => [
                            styles.optionItem,
                            {
                              borderColor: isSelected ? '#87ff86' : 'rgba(135,255,134,0.22)',
                              opacity: pressed && isEligible ? 0.85 : 1,
                            },
                          ]}>
                          <ThemedText style={styles.optionName}>{getPlayerName(candidateId)}</ThemedText>
                          <View style={styles.optionBadgeContainer}>
                            <ThemedText style={styles.optionBadge}>{voteCount}</ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  <PrimaryButton
                    label={voteBusy ? 'Übermittle…' : 'Stimme abgeben'}
                    onPress={handleVoteSubmit}
                    disabled={!isEligible || voteBusy || !pendingVoteId}
                  />
                  <ThemedText style={styles.muted}>
                    Deine aktuelle Stimme: {remoteVote ? getPlayerName(remoteVote) : 'Keine'}
                  </ThemedText>
                </>
              )}

              {playerMessage ? (
                <ThemedText
                  style={[
                    styles.feedback,
                    playerTone === 'error' ? styles.feedbackError : styles.feedbackInfo,
                  ]}>
                  {playerMessage}
                </ThemedText>
              ) : null}
            </View>
          ) : (
            <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
              <ThemedText style={styles.panelText}>Synchronisiere Abstimmungsdaten…</ThemedText>
            </View>
          )}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
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
    paddingTop: 48,
    paddingBottom: 80,
    gap: 24,
  },
  title: {
    textAlign: 'center',
  },
  roundBadge: {
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(135,255,134,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.35)',
    marginTop: 8,
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
  },
  panel: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    gap: 16,
    shadowColor: '#3aff9d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  panelText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#d8ffe8',
  },
  rematchSuccess: {
    color: '#87ff86',
  },
  rematchRejected: {
    color: '#ff7aa6',
  },
  rematchActionsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  rematchActionButton: {
    flex: 1,
  },
  rematchNoButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,122,166,0.5)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rematchNoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff7aa6',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(135,255,134,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.4)',
  },
  statusBadgeLabel: {
    fontSize: 13,
    color: '#87ff86',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statusHint: {
    flex: 1,
    fontSize: 13,
    color: '#d8ffe8',
    textAlign: 'right',
    opacity: 0.8,
  },
  sectionTitle: {
    marginTop: 4,
  },
  optionList: {
    gap: 10,
  },
  optionItem: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(9,16,28,0.88)',
  },
  optionOrder: {
    fontSize: 13,
    opacity: 0.7,
  },
  optionName: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 15,
  },
  optionBadgeContainer: {
    minWidth: 32,
    alignItems: 'center',
  },
  optionBadge: {
    fontSize: 13,
    color: '#87ff86',
  },
  supportList: {
    gap: 12,
  },
  supportItem: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(9,16,28,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    gap: 12,
  },
  supportInfo: {
    gap: 4,
  },
  supportName: {
    fontSize: 15,
  },
  supportDetail: {
    fontSize: 13,
    color: '#d8ffe8',
    opacity: 0.82,
  },
  supportHint: {
    fontSize: 12,
    color: '#ff7aa6',
    opacity: 0.85,
  },
  actionsColumn: {
    marginTop: 12,
    gap: 12,
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipLinkText: {
    color: '#ff7aa6',
    fontSize: 14,
  },
  feedback: {
    marginTop: 12,
    fontSize: 13,
    textAlign: 'center',
  },
  feedbackError: {
    color: '#ff7aa6',
  },
  feedbackInfo: {
    color: '#87ff86',
  },
  muted: {
    fontSize: 13,
    color: '#d8ffe8',
    opacity: 0.7,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  centeredHint: {
    textAlign: 'center',
    fontSize: 14,
    color: '#d8ffe8',
    opacity: 0.85,
  },
});
