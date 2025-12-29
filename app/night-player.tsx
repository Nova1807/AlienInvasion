import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getRoleDefinition, type RoleId } from '@/constants/roles';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { speakSequence } from '@/utils/speech';


export default function NightPlayerScreen() {
  const router = useRouter();
  const {
    state: {
      networkSessionActive,
      localPlayerId,
      players,
      assignments,
      playerCount,
      currentPhase,
      networkNightStep,
      networkNightActions,
      alienChatMessages,
      round,
      rematchState,
      status,
    },
    submitNetworkNightAction,
    sendAlienChatMessage,
  } = useGame();

  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'info' | 'error'>('info');
  const [submitting, setSubmitting] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatSubmitting, setChatSubmitting] = useState(false);

  // Keep track of whether the player has already been warned about selecting an alien companion.
  // This prevents the warning speech from repeating on every invalid tap.
  const alienSelfVoteWarnedRef = useRef(false);
  const rematchNavigationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!networkSessionActive || !localPlayerId) {
      router.replace('/setup/network/join');
    }
  }, [localPlayerId, networkSessionActive, router]);

  const localPlayer = useMemo(
    () => players.find((player) => player.id === localPlayerId) ?? null,
    [players, localPlayerId]
  );

  // For the purposes of the night UI, treat the local player as a normal participant
  // even if they are the session host. This prevents host-only flags from changing
  // what the host sees during the night phase.
  const uiLocalPlayer = useMemo(() => {
    if (!localPlayer) return null;
    return { ...localPlayer, isHost: false } as typeof localPlayer;
  }, [localPlayer]);

  useEffect(() => {
    // Don't redirect the host to a special host-only screen here.
    // Hosts should participate on their device as regular players during the night.
  }, [localPlayer?.isHost, router]);

  useEffect(() => {
    if (status !== 'inProgress') {
      router.replace('/setup/network/player');
      return;
    }
    if (currentPhase !== 'night') {
      router.replace('/setup/network/player');
    }
  }, [currentPhase, router, status]);

  useEffect(() => {
    if (!rematchState?.result) {
      return;
    }
    if (rematchState.result === 'rejected') {
      if (rematchNavigationRef.current === rematchState.pollId) {
        return;
      }
      rematchNavigationRef.current = rematchState.pollId;
      router.replace('/');
      rematchNavigationRef.current = null;
      return;
    }
    if (rematchState.result === 'accepted') {
      rematchNavigationRef.current = rematchState.pollId;
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

  useEffect(() => {
    setPendingTarget(null);
    setFeedback(null);
  }, [networkNightStep?.stepId, networkNightStep?.round]);

  // Reset the alien self-vote warning whenever the night step changes (e.g. a new round or new role step).
  useEffect(() => {
    alienSelfVoteWarnedRef.current = false;
  }, [networkNightStep?.stepId, networkNightStep?.round]);

  const tablePlayers = useMemo(
    () => buildTablePlayers(assignments, players, playerCount),
    [assignments, players, playerCount]
  );

  const assignmentById = useMemo(() => {
    return assignments.reduce<Record<string, (typeof assignments)[number]>>((map, assignment) => {
      map[assignment.playerId] = assignment;
      return map;
    }, {});
  }, [assignments]);

  const resolveRoleId = useCallback((playerId: string): RoleId | null => {
    const viaAssignment = assignmentById[playerId]?.roleId;
    if (viaAssignment) {
      return viaAssignment as RoleId;
    }
    const playerRecord = players.find((player) => player.id === playerId);
    if (playerRecord?.roleId) {
      return playerRecord.roleId;
    }
    return null;
  }, [assignmentById, players]);

  const localRoleId = useMemo(() => {
    if (!uiLocalPlayer?.id) {
      return null;
    }
    return resolveRoleId(uiLocalPlayer.id) ?? uiLocalPlayer.roleId ?? null;
  }, [uiLocalPlayer?.id, uiLocalPlayer?.roleId, resolveRoleId]);

  const localIsAlive = useMemo(() => {
    if (!uiLocalPlayer?.id) {
      return false;
    }
    const assignmentAlive = assignmentById[uiLocalPlayer.id]?.alive;
    if (assignmentAlive === false) {
      return false;
    }
    if (uiLocalPlayer.alive === false) {
      return false;
    }
    return true;
  }, [assignmentById, uiLocalPlayer?.alive, uiLocalPlayer?.id]);

  const showAlienChatPanel =
    Boolean(networkNightStep?.roleId === 'alienKatze') &&
    Boolean(networkSessionActive) &&
    localRoleId === 'alienKatze' &&
    localIsAlive;

  const targetNameLookup = useMemo(() => {
    return tablePlayers.reduce<Record<string, string>>((map, player) => {
      map[player.id] = player.name || 'Unbekannt';
      return map;
    }, {});
  }, [tablePlayers]);

  const aliveAlienPlayers = useMemo(() => {
    return tablePlayers.filter(
      (player) => player.alive && resolveRoleId(player.id) === 'alienKatze'
    );
  }, [resolveRoleId, tablePlayers]);

  const panelBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const panelBorder = useThemeColor({ light: 'rgba(135,255,134,0.24)', dark: 'rgba(135,255,134,0.24)' }, 'tint');
  const chatInputBg = useThemeColor({ light: 'rgba(9,16,28,0.9)', dark: 'rgba(9,16,28,0.9)' }, 'background');
  const chatInputBorder = useThemeColor({ light: 'rgba(135,255,134,0.24)', dark: 'rgba(135,255,134,0.24)' }, 'tint');
  const chatTextColor = useThemeColor({}, 'text');
  const chatSendBg = useThemeColor({ light: '#87ff86', dark: '#87ff86' }, 'tint');
  const chatPlaceholder = '#7fb896';

  const actingRole = networkNightStep?.roleId ?? null;
  const isActingPlayer =
    Boolean(actingRole) && Boolean(uiLocalPlayer?.roleId === actingRole) && Boolean(uiLocalPlayer?.alive);
  const canSelect = Boolean(isActingPlayer && networkNightStep?.allowTargetSelection);

  const localAction = useMemo(() => {
    if (!localPlayer) {
      return null;
    }
    const action = networkNightActions[localPlayer.id];
    if (!action || !networkNightStep) {
      return null;
    }
    if (action.round !== networkNightStep.round || action.stepId !== networkNightStep.stepId) {
      return null;
    }
    return action;
  }, [localPlayer, networkNightActions, networkNightStep]);

  useEffect(() => {
    if (!localAction) {
      return;
    }
  }, [localAction, targetNameLookup]);

  const seerTeamHint = useMemo(() => {
    if (
      actingRole !== 'seher' ||
      !localAction?.confirmed ||
      !localAction.targetId
    ) {
      return null;
    }
    const roleId = resolveRoleId(localAction.targetId);
    if (!roleId) {
      return null;
    }
    try {
      const role = getRoleDefinition(roleId);
      return {
        text:
          role.team === 'aliens'
            ? `${targetNameLookup[localAction.targetId] ?? 'Unbekannt'} gehört zu den Alienkatzen.`
            : `${targetNameLookup[localAction.targetId] ?? 'Unbekannt'} gehört zum Dorf.`,
        team: role.team,
      };
    } catch {
      return null;
    }
  }, [actingRole, localAction, resolveRoleId, targetNameLookup]);

  const alienVoteSummary = useMemo(() => {
    if (networkNightStep?.roleId !== 'alienKatze') {
      return null;
    }
    const aliveAliens = aliveAlienPlayers;
    if (aliveAliens.length === 0) {
      return null;
    }
    const threshold = Math.floor(aliveAliens.length / 2) + 1;
    const voteCounts = new Map<string, number>();
    aliveAliens.forEach((entry) => {
      const action = networkNightActions[entry.id];
      if (
        !action ||
        action.round !== networkNightStep.round ||
        action.stepId !== networkNightStep.stepId ||
        !action.confirmed ||
        !action.targetId
      ) {
        return;
      }
      const targetRole = resolveRoleId(action.targetId);
      if (targetRole === 'alienKatze') {
        return;
      }
      voteCounts.set(action.targetId, (voteCounts.get(action.targetId) ?? 0) + 1);
    });
    let leadingTarget: string | null = null;
    let topCount = 0;
    let tie = false;
    voteCounts.forEach((count, targetId) => {
      if (count > topCount) {
        leadingTarget = targetId;
        topCount = count;
        tie = false;
      } else if (count === topCount) {
        tie = true;
      }
    });
    const majorityReached = topCount >= threshold && leadingTarget !== null;
    return {
      threshold,
      leadingTarget,
      topCount,
      tie,
      majorityReached,
    };
  }, [aliveAlienPlayers, networkNightActions, networkNightStep, resolveRoleId]);

  const alienStatusText = useMemo(() => {
    if (networkNightStep?.roleId !== 'alienKatze' || !isActingPlayer) {
      return null;
    }
    if (!alienVoteSummary) {
      return 'Legt ein gemeinsames Ziel fest.';
    }
    const { majorityReached, leadingTarget, topCount, threshold, tie } = alienVoteSummary;
    if (majorityReached && leadingTarget) {
      const name = targetNameLookup[leadingTarget] ?? 'euer Ziel';
      return `Mehrheit erreicht: ${name}.`;
    }
    if (tie && topCount > 0) {
      return 'Stimmengleichstand – einigt euch auf ein Opfer.';
    }
    if (topCount > 0 && leadingTarget) {
      const needed = Math.max(1, threshold - topCount);
      const name = targetNameLookup[leadingTarget] ?? 'euer Ziel';
      return `Noch ${needed} Stimme${needed === 1 ? '' : 'n'} für ${name}, um die Mehrheit zu erreichen.`;
    }
    return 'Legt ein gemeinsames Ziel fest.';
  }, [alienVoteSummary, isActingPlayer, networkNightStep?.roleId, targetNameLookup]);

  const alienSelectionCounts = useMemo(() => {
    if (networkNightStep?.roleId !== 'alienKatze') {
      return {} as Record<string, number>;
    }
    const counts: Record<string, number> = {};
    aliveAlienPlayers.forEach((alien) => {
      if (alien.id === localPlayer?.id) {
        return;
      }
      const action = networkNightActions[alien.id];
      if (
        action &&
        action.round === networkNightStep.round &&
        action.stepId === networkNightStep.stepId &&
        action.targetId
      ) {
        counts[action.targetId] = (counts[action.targetId] ?? 0) + 1;
      }
    });
    return counts;
  }, [aliveAlienPlayers, localPlayer?.id, networkNightActions, networkNightStep]);

  const chatMessages = useMemo(() => {
    if (!showAlienChatPanel) {
      return [] as typeof alienChatMessages;
    }
    return alienChatMessages.filter((message) => message.round === null || message.round === round);
  }, [alienChatMessages, round, showAlienChatPanel]);

  useEffect(() => {
    if (!showAlienChatPanel) {
      setChatDraft('');
      setChatError(null);
      setChatSubmitting(false);
    }
  }, [showAlienChatPanel]);

  const handleSendChat = useCallback(() => {
    if (!showAlienChatPanel || chatSubmitting) {
      return;
    }
    const trimmed = chatDraft.trim();
    if (!trimmed) {
      setChatError('Nachricht darf nicht leer sein.');
      return;
    }
    setChatSubmitting(true);
    setChatError(null);
    void (async () => {
      const result = await sendAlienChatMessage(trimmed);
      if (!result.ok) {
        setChatError(result.error ?? 'Nachricht konnte nicht gesendet werden.');
      } else {
        setChatDraft('');
      }
      setChatSubmitting(false);
    })();
  }, [chatDraft, chatSubmitting, sendAlienChatMessage, showAlienChatPanel]);

  if (!networkSessionActive || !localPlayerId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.screen}>
          <View style={styles.centered}>
            <ThemedText type="title">Verbindung verloren</ThemedText>
            <ThemedText style={styles.centeredHint}>
              Bitte kehre zur Lobby zurück und tritt erneut bei.
            </ThemedText>
            <PrimaryButton
              label="Zur Lobby"
              onPress={() => router.replace('/setup/network/join')}
            />
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (!localPlayer) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.screen}>
          <View style={styles.centered}>
            <ThemedText type="title">Lade Spieler…</ThemedText>
            <ThemedText style={styles.centeredHint}>Warte einen Moment auf die Synchronisation.</ThemedText>
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (!networkNightStep) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.screen}>
          <View style={styles.centered}>
            <ThemedText type="title">Nachtphase startet gleich</ThemedText>
            <ThemedText style={styles.centeredHint}>
              Der Host bereitet die Nacht vor. Halte dich bereit.
            </ThemedText>
            <PrimaryButton
              label="Zur Lobby"
              onPress={() => router.replace('/setup/network/player')}
            />
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  const handleSelect = (playerId: string) => {
    if (!canSelect || submitting) {
      return;
    }
    if (pendingTarget === playerId) {
      setPendingTarget(null);
      setFeedback(null);
      return;
    }
    if (actingRole === 'alienKatze') {
      const targetRole = resolveRoleId(playerId);
      if (targetRole === 'alienKatze') {
        // Clear any pending selection when an alien accidentally taps another alien.
        setPendingTarget(null);
        // Only speak the warning once per night step to avoid repetition.
        if (!alienSelfVoteWarnedRef.current) {
          alienSelfVoteWarnedRef.current = true;
          speakSequence(['Nein Alien, du darfst dich nicht selbst umbringen.']);
        }
        setFeedback('Alienfreund bleibt verschont.');
        setFeedbackTone('error');
        return;
      }
    }
    if (actingRole === 'seher' && playerId === localPlayer.id) {
      speakSequence(['Du kennst deine eigene Karte bereits.']);
      setFeedback('Du kennst deine eigene Karte bereits.');
      setFeedbackTone('error');
      return;
    }
    setFeedback(null);
    setPendingTarget(playerId);
  };

  const handleConfirm = () => {
    if (!canSelect || !pendingTarget || !localPlayer || !networkNightStep) {
      return;
    }
    setSubmitting(true);
    void (async () => {
      const result = await submitNetworkNightAction({
        playerId: localPlayer.id,
        targetId: pendingTarget,
        confirmed: true,
        stepId: networkNightStep.stepId,
        round: networkNightStep.round,
      });
      if (!result.ok) {
        setFeedback(result.error ?? 'Aktion konnte nicht gesendet werden.');
        setFeedbackTone('error');
      } else {
        const targetName = targetNameLookup[pendingTarget] ?? 'Ziel gespeichert';
        setFeedback(`Aktion bestätigt: ${targetName}`);
        setFeedbackTone('info');
        setPendingTarget(null);
      }
      setSubmitting(false);
    })();
  };

  const highlightColor = actingRole === 'alienKatze' ? '#ff7aa6' : undefined;
  const effectiveSelectedId = pendingTarget ?? null;

  const instructions = isActingPlayer
    ? networkNightStep.description || 'Wähle heimlich ein Ziel und bestätige deine Entscheidung.'
    : 'Halte die Augen geschlossen und warte ruhig.';

  const disableConfirm = !pendingTarget || submitting;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText type="title">Nacht {round}</ThemedText>
          </View>

          <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            {isActingPlayer ? (
              <ThemedText type="defaultSemiBold" style={styles.activeHeadline}>
                Du bist dran!
              </ThemedText>
            ) : null}
            <ThemedText style={styles.panelDescription}>{instructions}</ThemedText>
            {actingRole === 'seher' && seerTeamHint ? (
              <ThemedText
                style={[
                  styles.seerResult,
                  seerTeamHint.team === 'aliens' ? styles.seerResultAlien : styles.seerResultVillage,
                ]}>
                {seerTeamHint.text}
              </ThemedText>
            ) : null}
            {actingRole === 'alienKatze' && alienStatusText ? (
              <ThemedText style={styles.statusHint}>{alienStatusText}</ThemedText>
            ) : null}
            {feedback ? (
              <ThemedText style={[styles.feedback, feedbackTone === 'error' && styles.feedbackError]}>
                {feedback}
              </ThemedText>
            ) : null}
          </View>

          {showAlienChatPanel ? (
            <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
              <ThemedText type="defaultSemiBold" style={styles.alienChatTitle}>
                Alien-Chat
              </ThemedText>
              {chatMessages.length > 0 ? (
                <View style={styles.alienChatMessages}>
                  {chatMessages.map((message) => {
                    const isOwn = message.playerId === localPlayerId;
                    const metaParts = [
                      isOwn ? 'Du' : message.playerName,
                      formatChatTimestamp(message.createdAt),
                    ];
                    if (message.round !== null && message.round !== round) {
                      metaParts.push(`Runde ${message.round}`);
                    }
                    return (
                      <View
                        key={message.id}
                        style={[
                          styles.alienChatMessage,
                        ]}>
                        <View
                          style={[
                            styles.alienChatBubble,
                            isOwn ? styles.alienChatBubbleOwn : styles.alienChatBubbleOther,
                          ]}>
                          <ThemedText
                            style={[
                              styles.alienChatBody,
                              isOwn && styles.alienChatBodyOwn,
                            ]}>
                            {message.body}
                          </ThemedText>
                          <ThemedText
                            style={[
                              styles.alienChatMeta,
                              isOwn ? styles.alienChatMetaOwn : styles.alienChatMetaOther,
                            ]}>
                            {metaParts.join(' · ')}
                          </ThemedText>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <ThemedText style={styles.alienChatEmpty}>
                  Noch keine Nachrichten. Plant euren Angriff.
                </ThemedText>
              )}
              {chatError ? <ThemedText style={styles.alienChatError}>{chatError}</ThemedText> : null}
              <View style={styles.alienChatInputRow}>
                <TextInput
                  value={chatDraft}
                  onChangeText={(text) => {
                    setChatDraft(text);
                    if (chatError) {
                      setChatError(null);
                    }
                  }}
                  editable={!chatSubmitting}
                  placeholder="Nachricht eingeben…"
                  placeholderTextColor={chatPlaceholder}
                  style={[
                    styles.alienChatInput,
                    { backgroundColor: chatInputBg, borderColor: chatInputBorder, color: chatTextColor },
                  ]}
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSendChat}
                  blurOnSubmit={false}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={handleSendChat}
                  disabled={chatSubmitting || !chatDraft.trim()}
                  style={({ pressed }) => [
                    styles.alienChatSendButton,
                    {
                      backgroundColor: chatSendBg,
                      opacity: chatSubmitting || !chatDraft.trim() ? 0.5 : pressed ? 0.75 : 1,
                    },
                  ]}>
                  <ThemedText style={styles.alienChatSendLabel}>
                    {chatSubmitting ? '…' : 'Senden'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <NightTable
              players={tablePlayers}
              selectedId={effectiveSelectedId}
              allowSelection={canSelect}
              onSelect={canSelect ? handleSelect : undefined}
              highlightColor={highlightColor}
              selectionCounts={
                networkNightStep?.roleId === 'alienKatze' ? alienSelectionCounts : undefined
              }
              allyIds={
                showAlienChatPanel
                  ? aliveAlienPlayers
                      .filter((player) => player.id !== localPlayer.id)
                      .map((player) => player.id)
                  : undefined
              }
              allyColor="#ff7aa6"
            />
            {canSelect ? (
              <PrimaryButton
                label="Ziel bestätigen"
                onPress={handleConfirm}
                disabled={disableConfirm}
              />
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.replace('/setup/network/player')}>
            <ThemedText style={styles.backLabel}>Zur Lobby</ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

function formatChatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
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
    paddingBottom: 48,
  },
  header: {
    gap: 8,
  },
  panel: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  activeHeadline: {
    fontSize: 17,
  },
  panelDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  seerResult: {
    fontSize: 15,
    fontWeight: '600',
  },
  seerResultAlien: {
    color: '#ff7aa6',
  },
  seerResultVillage: {
    color: '#87ff86',
  },
  statusHint: {
    fontSize: 13,
    color: '#d8ffe8',
    opacity: 0.85,
  },
  feedback: {
    fontSize: 13,
    color: '#87ff86',
  },
  feedbackError: {
    color: '#ff7aa6',
  },
  tableWrapper: {
    alignItems: 'center',
  },
  tableCircle: {
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(9,16,28,0.85)',
    shadowColor: '#2cff9d',
    shadowOpacity: 0.25,
    shadowRadius: 42,
    shadowOffset: { width: 0, height: 18 },
    elevation: 6,
  },
  tablePlaceholder: {
    width: '100%',
    borderRadius: 22,
    padding: 20,
    backgroundColor: 'rgba(9,16,28,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.25)',
  },
  tablePlaceholderText: {
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.85,
  },
  tableSeat: {
    position: 'absolute',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  tableSeatDead: {
    borderStyle: 'dashed',
  },
  tableSeatText: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 16,
    paddingHorizontal: 6,
  },
  tableSeatTextDead: {
    textDecorationLine: 'line-through',
    opacity: 0.65,
  },
  tableSeatTextAlly: {
    color: '#ff7aa6',
    fontWeight: '700',
  },
  tableSeatBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,122,166,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tableSeatBadgeText: {
    color: '#090f1a',
    fontSize: 12,
    fontWeight: '700',
  },
  backButton: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backLabel: {
    fontSize: 15,
    color: '#87ff86',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  centeredHint: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#d8ffe8',
  },
  alienChatTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  alienChatMessages: {
    gap: 12,
  },
  alienChatMessage: {
    alignItems: 'flex-end',
    gap: 6,
  },
  alienChatBubble: {
    alignSelf: 'flex-end',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    maxWidth: '100%',
  },
  alienChatBubbleOther: {
    backgroundColor: 'rgba(135,255,134,0.14)',
  },
  alienChatBubbleOwn: {
    backgroundColor: 'rgba(255,122,166,0.2)',
  },
  alienChatMeta: {
    fontSize: 12,
    opacity: 0.78,
    textAlign: 'right',
  },
  alienChatMetaOwn: {
    color: '#ffb3d0',
  },
  alienChatMetaOther: {
    color: '#87ff86',
  },
  alienChatBody: {
    fontSize: 15,
    lineHeight: 20,
    color: '#d8ffe8',
  },
  alienChatBodyOwn: {
    color: '#ffe2f0',
  },
  alienChatEmpty: {
    fontSize: 14,
    opacity: 0.7,
  },
  alienChatError: {
    fontSize: 12,
    color: '#ff7aa6',
  },
  alienChatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alienChatInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  alienChatSendButton: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  alienChatSendLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#041a0e',
  },
});

type TablePlayer = {
  id: string;
  name: string;
  alive: boolean;
};

type TableLayout = {
  size: number;
  seatWidth: number;
  seatHeight: number;
  radius: number;
  fontSize: number;
};

function buildTablePlayers(
  assignments: { playerId: string; playerName: string; alive?: boolean }[],
  players: { id: string; name: string; isHost?: boolean }[],
  playerCount: number
): TablePlayer[] {
  if (assignments.length > 0) {
    return assignments.map((assignment) => ({
      id: assignment.playerId,
      name: assignment.playerName,
      alive: assignment.alive !== false,
    }));
  }
  // Include the host in the table so the host can play from the same UI as others.
  // Previously the host was filtered out here which required the host to use a
  // separate device or view.
  const eligible = players;
  return eligible.slice(0, playerCount).map((player, index) => ({
    id: player.id,
    name: player.name.trim() || `Katze ${index + 1}`,
    alive: true,
  }));
}

function computeTableLayout(count: number): TableLayout {
  if (count <= 0) {
    return { size: 300, seatWidth: 110, seatHeight: 66, radius: 134, fontSize: 13 };
  }
  const baseSize = 320;
  const maxSize = 420;
  const extra = Math.max(0, count - 8);
  const size = Math.min(maxSize, baseSize + extra * 12);
  const maxSeatWidth = 122;
  const minSeatWidth = 64;
  const padding = 24;
  const baseRadius = Math.max(size / 2 - padding, 80);
  const circumference = 2 * Math.PI * baseRadius;
  const availablePerSeat = circumference / count;
  const seatWidth = Math.min(maxSeatWidth, Math.max(minSeatWidth, availablePerSeat - 12));
  const seatHeight = Math.max(48, seatWidth * 0.64);
  const radius = Math.max(size / 2 - seatHeight / 2 - 16, 60);
  const fontSize = count > 12 ? 11 : count > 9 ? 12 : 13;
  return { size, seatWidth, seatHeight, radius, fontSize };
}

function NightTable({
  players,
  selectedId,
  allowSelection,
  onSelect,
  highlightColor,
  selectionCounts,
  allyIds,
  allyColor,
}: {
  players: TablePlayer[];
  selectedId: string | null;
  allowSelection: boolean;
  onSelect?: (id: string) => void;
  highlightColor?: string;
  selectionCounts?: Record<string, number>;
  allyIds?: string[];
  allyColor?: string;
}) {
  const layout = useMemo(() => computeTableLayout(players.length), [players.length]);
  const nameBg = useThemeColor({ light: 'rgba(7,16,28,0.92)', dark: 'rgba(7,16,28,0.92)' }, 'background');
  const defaultBorder = useThemeColor(
    { light: 'rgba(135,255,134,0.35)', dark: 'rgba(135,255,134,0.35)' },
    'tint'
  );
  const ringBorderColor = highlightColor ? 'rgba(255,122,166,0.42)' : defaultBorder;
  const defaultHighlight = useThemeColor({ light: '#87ff86', dark: '#87ff86' }, 'tint');
  const selectionHighlight = highlightColor ?? defaultHighlight;
  const idleBorderColor = highlightColor ? 'rgba(255,122,166,0.22)' : 'rgba(135,255,134,0.16)';
  const seatShadowColor = highlightColor ?? '#1fff76';
  const seatTextStyle = useMemo(
    () => ({ fontSize: layout.fontSize, lineHeight: layout.fontSize + 3 }),
    [layout.fontSize]
  );
  const allyColorValue = allyColor ?? '#ff7aa6';
  const allyIdSet = useMemo(() => new Set(allyIds ?? []), [allyIds]);

  const positioned = useMemo(() => {
    if (players.length === 0) {
      return [];
    }
    return players.map((player, index) => {
      const angle = players.length === 1 ? -Math.PI / 2 : (index / players.length) * Math.PI * 2 - Math.PI / 2;
      const x = layout.size / 2 + layout.radius * Math.cos(angle) - layout.seatWidth / 2;
      const y = layout.size / 2 + layout.radius * Math.sin(angle) - layout.seatHeight / 2;
      return {
        ...player,
        style: {
          left: x,
          top: y,
          width: layout.seatWidth,
          height: layout.seatHeight,
        },
      };
    });
  }, [layout, players]);

  if (players.length === 0) {
    return (
      <View style={styles.tablePlaceholder}>
        <ThemedText style={styles.tablePlaceholderText}>
          Füge zuerst Katzen hinzu, um die Nacht zu starten.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.tableWrapper, { minHeight: layout.size }]}>
      <View
        style={[
          styles.tableCircle,
          {
            borderColor: ringBorderColor,
            width: layout.size,
            height: layout.size,
            borderRadius: layout.size / 2,
            shadowColor: highlightColor ? highlightColor : '#2cff9d',
          },
        ]}>
        {positioned.map((entry) => {
          const isSelected = entry.id === selectedId;
          const votes = selectionCounts?.[entry.id] ?? 0;
          const hasGroupSelection = votes > 0;
          const canSelect = allowSelection && Boolean(onSelect) && entry.alive;
          const isAlly = allyIdSet.has(entry.id);
          return (
            <Pressable
              key={entry.id}
              accessibilityRole={canSelect ? 'button' : undefined}
              onPress={canSelect ? () => onSelect?.(entry.id) : undefined}
              style={({ pressed }) => [
                styles.tableSeat,
                entry.style,
                !entry.alive && styles.tableSeatDead,
                {
                  backgroundColor: entry.alive ? nameBg : 'rgba(32,20,44,0.6)',
                  borderColor: isSelected
                    ? selectionHighlight
                    : hasGroupSelection
                    ? 'rgba(255,122,166,0.5)'
                    : isAlly
                    ? allyColorValue
                    : idleBorderColor,
                  opacity: pressed && canSelect ? 0.82 : entry.alive ? 1 : 0.45,
                  shadowColor:
                    isSelected || hasGroupSelection
                      ? (highlightColor ?? '#ff7aa6')
                      : isAlly
                      ? allyColorValue
                      : seatShadowColor,
                },
              ]}>
              <ThemedText
                style={[
                  styles.tableSeatText,
                  seatTextStyle,
                  !entry.alive && styles.tableSeatTextDead,
                  isAlly && styles.tableSeatTextAlly,
                ]}
                numberOfLines={2}>
                {entry.name}
              </ThemedText>
              {hasGroupSelection ? (
                <View style={styles.tableSeatBadge}>
                  <ThemedText style={styles.tableSeatBadgeText}>{votes}</ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
