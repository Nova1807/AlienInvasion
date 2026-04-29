import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getRoleDefinition, type RoleId, type TeamId } from '@/constants/roles';
import { useGame, type NightRecord } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { speakSequence, stop } from '@/utils/speech';

type NightRoleId = 'alienKatze' | 'seher' | 'doktor' | 'hexe' | 'amor';

type NightStep = {
  id: 'sleep' | NightRoleId | 'sunrise';
  title: string;
  description: string;
  roleId?: NightRoleId;
  allowTargetSelection?: boolean;
  enterSpeech?: string[];
  exitSpeech?: string[];
  exitDelayMs?: number;
  autoAdvanceAfterMs?: number;
};

type TablePlayer = {
  id: string;
  name: string;
  alive: boolean;
};

type SeerInsight = {
  playerId: string;
  playerName: string;
  team: TeamId;
};

type CasualtyDetail = {
  name: string;
  roleName: string | null;
};

export default function NightScreen() {
  const router = useRouter();
  const {
    state: {
      mode,
      roleCounts,
      players,
      playerCount,
      assignments,
      nightLog,
      round,
      revealOnDeath,
      networkNightActions,
      hexeHealAvailable,
      hexeKillAvailable,
    },
    setPhase,
    startNightRound,
    setNightTarget,
    resolveNight,
    broadcastNightStep,
  } = useGame();

  const [stepIndex, setStepIndex] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingAlienTarget, setPendingAlienTarget] = useState<string | null>(null);
  const [amorFirstPick, setAmorFirstPick] = useState<string | null>(null);
  const [hexeAction, setHexeAction] = useState<'heal' | 'kill' | null>(null);
  const isNetworkMode = mode === 'network';

  const exitDelayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownValueRef = useRef<number | null>(null);
  const advancingRef = useRef(false);
  const entryStepKeyRef = useRef<string | null>(null);
  const seerAnnouncedRef = useRef<string | null>(null);
  const alienTieAnnouncedRef = useRef(false);
  const alienSelfVoteWarnedRef = useRef(false);

  const setAdvancing = useCallback((value: boolean) => {
    advancingRef.current = value;
    setIsAdvancing(value);
  }, []);

  const clearExitDelay = useCallback(() => {
    if (exitDelayTimeout.current) {
      clearTimeout(exitDelayTimeout.current);
      exitDelayTimeout.current = null;
    }
  }, []);

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimeout.current) {
      clearTimeout(autoAdvanceTimeout.current);
      autoAdvanceTimeout.current = null;
    }
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    if (countdownValueRef.current !== null) {
      countdownValueRef.current = null;
      setCountdown(null);
    }
  }, []);

  useEffect(() => {
    setStepIndex(0);
    setAdvancing(false);
    clearExitDelay();
    clearAutoAdvance();
    clearCountdown();
    entryStepKeyRef.current = null;
    seerAnnouncedRef.current = null;
  }, [clearAutoAdvance, clearCountdown, clearExitDelay, round, setAdvancing]);

  useEffect(() => {
    startNightRound();
    setPhase('night');
    stop();
    return () => {
      stop();
      clearExitDelay();
      clearAutoAdvance();
      clearCountdown();
    };
  }, [clearAutoAdvance, clearCountdown, clearExitDelay, round, setPhase, startNightRound]);

  const steps = useMemo(() => buildNightSteps(roleCounts, round), [roleCounts, round]);
  const currentStep = steps[stepIndex] ?? null;

  useEffect(() => {
    if (currentStep?.roleId !== 'alienKatze') {
      setPendingAlienTarget(null);
    }
  }, [currentStep?.roleId]);

  const currentNight = useMemo<NightRecord | null>(() => {
    return nightLog.find((entry) => entry.round === round) ?? null;
  }, [nightLog, round]);

  const tablePlayers = useMemo(
    () => buildTablePlayers(assignments, players, playerCount),
    [assignments, players, playerCount]
  );

  const assignmentByPlayerId = useMemo(() => {
    return assignments.reduce<Record<string, (typeof assignments)[number]>>((map, assignment) => {
      map[assignment.playerId] = assignment;
      return map;
    }, {});
  }, [assignments]);

  const seerPlayerId = useMemo(() => {
    return assignments.find((assignment) => assignment.roleId === 'seher')?.playerId ?? null;
  }, [assignments]);

  const roleNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    assignments.forEach((assignment) => {
      const roleId = assignment.roleId as RoleId | undefined;
      if (!roleId) {
        return;
      }
      try {
        const role = getRoleDefinition(roleId);
        map.set(assignment.playerId, role.name);
      } catch {
        map.set(assignment.playerId, roleId);
      }
    });
    return map;
  }, [assignments]);

  const previousDoctorTarget = useMemo(() => {
    const previousRecord = nightLog.find((entry) => entry.round === round - 1);
    return previousRecord?.doctorTargetId ?? null;
  }, [nightLog, round]);

  const pendingAlienName = useMemo(() => {
    if (!pendingAlienTarget) {
      return null;
    }
    return getPlayerName(tablePlayers, pendingAlienTarget);
  }, [pendingAlienTarget, tablePlayers]);

  const selectedTargetId = getSelectedId(currentNight, currentStep?.roleId);
  const selectedTargetName = useMemo(() => {
    const targetId =
      currentStep?.roleId === 'alienKatze'
        ? pendingAlienTarget ?? selectedTargetId
        : selectedTargetId;
    return getPlayerName(tablePlayers, targetId);
  }, [currentStep?.roleId, pendingAlienTarget, selectedTargetId, tablePlayers]);

  const seerInsight = useMemo<SeerInsight | null>(() => {
    if (!currentNight || currentNight.seerTargetId === null || currentNight.seerResultTeam === null) {
      return null;
    }
    const playerName = getPlayerName(tablePlayers, currentNight.seerTargetId);
    if (!playerName) {
      return null;
    }
    return {
      playerId: currentNight.seerTargetId,
      playerName,
      team: currentNight.seerResultTeam,
    };
  }, [currentNight, tablePlayers]);

  const selectionCounts = useMemo(() => {
    if (!isNetworkMode || currentStep?.roleId !== 'alienKatze') {
      return {};
    }
    const counts: Record<string, number> = {};
    assignments.forEach((assignment) => {
      if ((assignment.roleId === 'alienKatze' || assignment.roleId === 'spion') && assignment.alive) {
        const action = networkNightActions[assignment.playerId];
        if (action && action.round === round && action.stepId === currentStep.id && action.targetId) {
          counts[action.targetId] = (counts[action.targetId] || 0) + 1;
        }
      }
    });
    return counts;
  }, [assignments, isNetworkMode, currentStep?.roleId, currentStep?.id, networkNightActions, round]);

  const networkStatusLines = useMemo(() => {
    // Build a list of status lines for each alive alien indicating their current vote
    // This should only be computed in network mode and when an alien step is active.
    if (!isNetworkMode || !currentStep?.roleId) {
      return [] as string[];
    }
    if (currentStep.roleId === 'alienKatze') {
      const aliveAliens = assignments.filter(
        (assignment) => (assignment.roleId === 'alienKatze' || assignment.roleId === 'spion') && assignment.alive
      );
      if (aliveAliens.length === 0) {
        return [] as string[];
      }
      return aliveAliens.map((assignment) => {
        const action = networkNightActions[assignment.playerId];
        if (!action || action.round !== round || action.stepId !== currentStep.id) {
          return `${assignment.playerName}: wartet`;
        }
        if (action.confirmed && action.targetId) {
          const targetName = getPlayerName(tablePlayers, action.targetId) ?? 'Unbekannt';
          return `${assignment.playerName}: ${targetName} bestätigt`;
        }
        if (action.targetId) {
          const targetName = getPlayerName(tablePlayers, action.targetId) ?? 'Unbekannt';
          return `${assignment.playerName}: ${targetName} gewählt`;
        }
        return `${assignment.playerName}: wählen…`;
      });
    }
    return [];
  }, [
    assignments,
    currentStep?.id,
    currentStep?.roleId,
    isNetworkMode,
    networkNightActions,
    round,
    tablePlayers,
  ]);

  // Prevent revealing alien identities and their choices on the host screen
  // When aliens are acting, hide the status lines and selection counts entirely on the host.
  const displayNetworkStatusLines = useMemo(() => {
    if (isNetworkMode && currentStep?.roleId === 'alienKatze') {
      return [] as string[];
    }
    return networkStatusLines;
  }, [isNetworkMode, currentStep?.roleId, networkStatusLines]);

  const showSelectionCounts = useMemo(() => {
    // Only show vote counts when not in the alien voting step
    return !(isNetworkMode && currentStep?.roleId === 'alienKatze');
  }, [isNetworkMode, currentStep?.roleId]);

  const advanceStep = useCallback(
    (expectedIndex?: number) => {
      if (!currentStep) {
        return;
      }
      if (typeof expectedIndex === 'number' && expectedIndex !== stepIndex) {
        return;
      }
      if (advancingRef.current) {
        return;
      }

      clearAutoAdvance();
      clearCountdown();
      setCountdown(null);

      const proceed = () => {
        if (stepIndex + 1 < steps.length) {
          setStepIndex((index) => index + 1);
          setAdvancing(false);
          return;
        }
        const outcome = resolveNight();
        const casualties = outcome.casualties
          .map((id) => {
            const name = getPlayerName(tablePlayers, id);
            if (!name) {
              return null;
            }
            return {
              name,
              roleName: roleNameLookup.get(id) ?? null,
            } as CasualtyDetail;
          })
          .filter((detail): detail is CasualtyDetail => Boolean(detail));
        const savedNames = outcome.saved
          .map((id) => getPlayerName(tablePlayers, id))
          .filter((name): name is string => Boolean(name));
        const announcement = buildSunriseAnnouncement(casualties, savedNames, revealOnDeath);
        speakSequence([announcement], {
          onComplete: () => {
            setAdvancing(false);
            setPhase('day');
            router.replace('/day');
          },
        });
      };

      const continueAfterDelay = () => {
        const delay = currentStep.exitDelayMs ?? 0;
        if (delay > 0) {
          clearExitDelay();
          exitDelayTimeout.current = setTimeout(() => {
            exitDelayTimeout.current = null;
            proceed();
          }, delay);
        } else {
          proceed();
        }
      };

      setAdvancing(true);
      const exitLines = [...(currentStep.exitSpeech ?? [])];
      if (exitLines.length > 0) {
        speakSequence(exitLines, {
          onComplete: continueAfterDelay,
        });
      } else {
        continueAfterDelay();
      }
    },
    [
      clearAutoAdvance,
      clearCountdown,
      clearExitDelay,
      currentStep,
      resolveNight,
      router,
      setAdvancing,
      setPhase,
      stepIndex,
      steps.length,
      tablePlayers,
      revealOnDeath,
      roleNameLookup,
    ]
  );

  const startCountdown = useCallback(
    (ms: number, expectedIndex: number) => {
      setCountdown(Math.max(1, Math.ceil(ms / 1000)));
      countdownValueRef.current = Math.max(1, Math.ceil(ms / 1000));
      countdownInterval.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) {
            return prev;
          }
          if (prev <= 1) {
            if (countdownInterval.current) {
              clearInterval(countdownInterval.current);
              countdownInterval.current = null;
            }
            countdownValueRef.current = 0;
            return 0;
          }
          const next = prev - 1;
          countdownValueRef.current = next;
          return next;
        });
      }, 1000);
      autoAdvanceTimeout.current = setTimeout(() => {
        clearAutoAdvance();
        clearCountdown();
        setAdvancing(false);
        advanceStep(expectedIndex);
      }, ms);
    },
    [advanceStep, clearAutoAdvance, clearCountdown, setAdvancing]
  );

  useEffect(() => {
    countdownValueRef.current = countdown;
  }, [countdown]);

  useEffect(() => {
    if (!currentStep) {
      return;
    }
    const stepKey = `${round}-${stepIndex}-${currentStep.id}`;
    if (entryStepKeyRef.current === stepKey) {
      return;
    }
    entryStepKeyRef.current = stepKey;
    setAdvancing(false);
    clearAutoAdvance();
    clearCountdown();
    alienTieAnnouncedRef.current = false;
    alienSelfVoteWarnedRef.current = false;
    const entryLines =
      currentStep.enterSpeech && currentStep.enterSpeech.length > 0
        ? currentStep.enterSpeech
        : [currentStep.description];
    const stepIndexSnapshot = stepIndex;
    if (isNetworkMode) {
      void broadcastNightStep({
        round,
        stepIndex: stepIndexSnapshot,
        stepId: currentStep.id,
        title: currentStep.title,
        description: currentStep.description,
        roleId: currentStep.roleId ?? null,
        allowTargetSelection: Boolean(currentStep.allowTargetSelection),
      });
    }
    speakSequence(entryLines, {
      onComplete: () => {
        if (currentStep.allowTargetSelection) {
          return;
        }
        const delay = currentStep.autoAdvanceAfterMs ?? 0;
        if (delay > 0) {
          startCountdown(delay, stepIndexSnapshot);
        } else {
          advanceStep(stepIndexSnapshot);
        }
      },
    });
    return () => {
      clearAutoAdvance();
      clearCountdown();
    };
  }, [
    advanceStep,
    clearAutoAdvance,
    clearCountdown,
    broadcastNightStep,
    currentStep,
    isNetworkMode,
    round,
    setAdvancing,
    startCountdown,
    stepIndex,
  ]);

  useEffect(() => {
    if (currentStep?.roleId !== 'seher') {
      seerAnnouncedRef.current = null;
    }
    if (!currentStep?.allowTargetSelection) {
      return;
    }
    if (currentStep.roleId === 'alienKatze') {
      if (pendingAlienTarget) {
        return;
      }
      if (!selectedTargetId) {
        return;
      }
    }
    if (!selectedTargetId) {
      return;
    }
    if (advancingRef.current) {
      return;
    }
    if (currentStep.roleId === 'seher') {
      if (seerAnnouncedRef.current === selectedTargetId) {
        return;
      }
      seerAnnouncedRef.current = selectedTargetId;
      if (seerInsight) {
        clearAutoAdvance();
        clearCountdown();
        setAdvancing(true);
        startCountdown(2000, stepIndex);
        return;
      }
    }
    advanceStep(stepIndex);
  }, [
    advanceStep,
    clearAutoAdvance,
    clearCountdown,
    currentStep?.allowTargetSelection,
    currentStep?.roleId,
    pendingAlienTarget,
    seerInsight,
    selectedTargetId,
    setAdvancing,
    startCountdown,
    stepIndex,
  ]);

  useEffect(() => {
    if (!isNetworkMode) {
      return;
    }
    const roleId = currentStep?.roleId;
    const stepId = currentStep?.id;
    if (!roleId || !stepId) {
      return;
    }
    if (roleId === 'alienKatze') {
      const aliveAliens = assignments.filter(
        (assignment) => (assignment.roleId === 'alienKatze' || assignment.roleId === 'spion') && assignment.alive
      );
      if (aliveAliens.length === 0) {
        return;
      }
      const threshold = Math.floor(aliveAliens.length / 2) + 1;
      const voteCounts = new Map<string, number>();
      let validVoteFound = false;
      aliveAliens.forEach((assignment) => {
        const action = networkNightActions[assignment.playerId];
        if (
          !action ||
          action.round !== round ||
          action.stepId !== stepId ||
          !action.confirmed ||
          !action.targetId
        ) {
          return;
        }
        const targetAssignment = assignmentByPlayerId[action.targetId];
        if (targetAssignment?.roleId === 'alienKatze' || targetAssignment?.roleId === 'spion') {
          if (!alienSelfVoteWarnedRef.current) {
            alienSelfVoteWarnedRef.current = true;
            speakSequence(['Nein Alien, ihr könnt keine Verbündeten opfern.']);
          }
          return;
        }
        voteCounts.set(action.targetId, (voteCounts.get(action.targetId) ?? 0) + 1);
        validVoteFound = true;
      });
      if (!validVoteFound) {
        return;
      }
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
      if (topCount >= threshold && leadingTarget) {
        if (selectedTargetId !== leadingTarget) {
          setNightTarget('alienKatze', leadingTarget);
        }
        setPendingAlienTarget(null);
        alienTieAnnouncedRef.current = false;
        alienSelfVoteWarnedRef.current = false;
        return;
      }
      if (tie && !alienTieAnnouncedRef.current) {
        alienTieAnnouncedRef.current = true;
        speakSequence(['Einigt euch auf ein Opfer.']);
        setNightTarget('alienKatze', null);
        setPendingAlienTarget(null);
        return;
      }
      if (pendingAlienTarget && !voteCounts.has(pendingAlienTarget)) {
        setPendingAlienTarget(null);
      }
      alienSelfVoteWarnedRef.current = false;
      return;
    }
    type NightActionEntry = { round: number; stepId: string; targetId: string | null; confirmed: boolean; updatedAt: number };
    let latestAction: NightActionEntry | null = null;
    for (const assignment of assignments) {
      if (assignment.roleId !== roleId || !assignment.alive) {
        continue;
      }
      const action = networkNightActions[assignment.playerId];
      if (!action) {
        continue;
      }
      if (action.round !== round || action.stepId !== stepId) {
        continue;
      }
      if (!latestAction || action.updatedAt > latestAction.updatedAt) {
        latestAction = action;
      }
    }
    if (!latestAction || !latestAction.confirmed || !latestAction.targetId) {
      return;
    }
    if (selectedTargetId !== latestAction.targetId) {
      setNightTarget(roleId, latestAction.targetId);
    }
  }, [
    assignmentByPlayerId,
    assignments,
    currentStep?.id,
    currentStep?.roleId,
    isNetworkMode,
    networkNightActions,
    pendingAlienTarget,
    round,
    selectedTargetId,
    setNightTarget,
  ]);

  const handleSelect = (playerId: string) => {
    if (!currentStep?.roleId) {
      return;
    }
    if (currentStep.roleId === 'alienKatze') {
      const selectedAssignment = assignmentByPlayerId[playerId];
      if (selectedAssignment?.roleId === 'alienKatze' || selectedAssignment?.roleId === 'spion') {
        speakSequence(['Nein Alien, du darfst keine Verbündeten angreifen.']);
        return;
      }
      setPendingAlienTarget((prev) => (prev === playerId ? null : playerId));
      return;
    }
    if (currentStep.roleId === 'doktor') {
      if (previousDoctorTarget && previousDoctorTarget === playerId) {
        speakSequence(['Doktor, du kannst dieselbe Katze nicht zwei Nächte hintereinander schützen.']);
        return;
      }
    }
    if (currentStep.roleId === 'seher' && seerPlayerId && playerId === seerPlayerId) {
      speakSequence(['Du kennst deine eigene Karte bereits.']);
      return;
    }
    if (currentStep.roleId === 'hexe') {
      if (!hexeAction) {
        return;
      }
      setNightTarget('hexe', `${hexeAction}:${playerId}`);
      setHexeAction(null);
      return;
    }
    if (currentStep.roleId === 'amor') {
      if (!amorFirstPick) {
        setAmorFirstPick(playerId);
        setNightTarget('amor', playerId);
        speakSequence(['Erste Wahl getroffen. Wähle nun die zweite Katze für das Liebespaar.']);
        return;
      }
      if (playerId === amorFirstPick) {
        speakSequence(['Du hast diese Katze bereits gewählt. Wähle eine andere.']);
        return;
      }
      setNightTarget('amor', playerId);
      setAmorFirstPick(null);
      return;
    }
    setNightTarget(currentStep.roleId, playerId);
  };

  const handleAlienConfirm = () => {
    if (!currentStep || currentStep.roleId !== 'alienKatze' || !pendingAlienTarget) {
      return;
    }
    const targetId = pendingAlienTarget;
    setPendingAlienTarget(null);
    setNightTarget('alienKatze', targetId);
  };

  const alienVictimName = useMemo(() => {
    if (!currentNight?.alienTargetId) {
      return null;
    }
    return getPlayerName(tablePlayers, currentNight.alienTargetId);
  }, [currentNight?.alienTargetId, tablePlayers]);

  const allowTargetSelection = currentStep?.allowTargetSelection ?? false;
  const hexeSelectionEnabled = currentStep?.roleId === 'hexe' && hexeAction !== null && !isAdvancing && !isNetworkMode;
  const selectionEnabled = (allowTargetSelection && !isAdvancing && !isNetworkMode && currentStep?.roleId !== 'hexe') || hexeSelectionEnabled;
  const tableHighlightColor = currentStep?.roleId === 'alienKatze'
    ? '#ff7aa6'
    : currentStep?.roleId === 'hexe'
    ? '#b366ff'
    : currentStep?.roleId === 'amor'
    ? '#ff6b9d'
    : undefined;
  const effectiveSelectedId = isNetworkMode
    ? null
    : currentStep?.roleId === 'alienKatze'
    ? pendingAlienTarget ?? selectedTargetId
    : currentStep?.roleId === 'amor'
    ? amorFirstPick
    : selectedTargetId;

  const handleHexeSkip = () => {
    setHexeAction(null);
    advanceStep(stepIndex);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Nachtphase
        </ThemedText>
        <View style={styles.roundBadge}>
          <ThemedText style={styles.roundBadgeText}>Runde {round}</ThemedText>
        </View>
        <ThemedText style={styles.description}>
          Das Dorf schläft. Die App führt jede Rolle nacheinander durch die Nacht.
        </ThemedText>

        <NightTable
          players={tablePlayers}
          selectedId={effectiveSelectedId}
          allowSelection={selectionEnabled}
          onSelect={selectionEnabled ? handleSelect : undefined}
          highlightColor={tableHighlightColor}
          selectionCounts={showSelectionCounts ? selectionCounts : undefined}
        />

        {currentStep?.roleId === 'alienKatze' && !isNetworkMode ? (
          <View
            style={[
              styles.alienConfirm,
              tableHighlightColor
                ? { borderColor: 'rgba(255,122,166,0.35)', shadowColor: 'rgba(255,122,166,0.25)' }
                : undefined,
            ]}>
            <ThemedText style={styles.alienConfirmText}>
              {pendingAlienName
                ? `${pendingAlienName} umbringen?`
                : 'Tippt auf eine Katze und bestätigt eure Wahl.'}
            </ThemedText>
            <PrimaryButton
              label={
                pendingAlienName ? `${pendingAlienName} umbringen` : 'Bestätigen'
              }
              onPress={handleAlienConfirm}
              disabled={!pendingAlienTarget}
            />
          </View>
        ) : null}

        {currentStep?.roleId === 'hexe' && !isNetworkMode ? (
          <View style={[styles.alienConfirm, { borderColor: 'rgba(179,102,255,0.35)' }]}>
            {alienVictimName ? (
              <ThemedText style={styles.alienConfirmText}>
                Angegriffenes Opfer: {alienVictimName}
              </ThemedText>
            ) : (
              <ThemedText style={styles.alienConfirmText}>
                Niemand wurde angegriffen.
              </ThemedText>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {hexeHealAvailable && alienVictimName ? (
                <PrimaryButton
                  label={hexeAction === 'heal' ? 'Heiltrank aktiv — tippe auf eine Katze' : 'Heiltrank'}
                  onPress={() => setHexeAction(hexeAction === 'heal' ? null : 'heal')}
                />
              ) : null}
              {hexeKillAvailable ? (
                <PrimaryButton
                  label={hexeAction === 'kill' ? 'Gifttrank aktiv — tippe auf eine Katze' : 'Gifttrank'}
                  onPress={() => setHexeAction(hexeAction === 'kill' ? null : 'kill')}
                />
              ) : null}
            </View>
            <PrimaryButton
              label="Nichts einsetzen"
              onPress={handleHexeSkip}
            />
          </View>
        ) : null}

        {currentStep?.roleId === 'amor' && !isNetworkMode ? (
          <View style={[styles.alienConfirm, { borderColor: 'rgba(255,107,157,0.35)' }]}>
            <ThemedText style={styles.alienConfirmText}>
              {amorFirstPick
                ? `Erste Wahl: ${getPlayerName(tablePlayers, amorFirstPick) ?? '?'}. Wähle die zweite Katze.`
                : 'Wähle die erste Katze für das Liebespaar.'}
            </ThemedText>
          </View>
        ) : null}

        {currentStep ? (
          <NightStepCard
            step={currentStep}
            selectedTargetName={selectedTargetName}
            seerInsight={isNetworkMode ? null : seerInsight}
            advancing={isAdvancing}
            countdown={countdown}
            networkStatusLines={displayNetworkStatusLines}
          />
        ) : null}

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => {
              stop();
              router.back();
            }}>
            <ThemedText style={styles.backLabel}>Zur Host-Übersicht</ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

function buildNightSteps(roleCounts: Record<string, number>, round: number): NightStep[] {
  const steps: NightStep[] = [
    {
      id: 'sleep',
      title: 'Alle Katzen schlafen ein',
      description: 'Alle Katzen schließen die Augen und legen ihre Pfoten sichtbar hin.',
      enterSpeech: [
        `Runde ${round}. Es wird Nacht im Dorf.`,
        'Alle Katzen schließen jetzt die Augen und legen die Pfoten sichtbar auf den Tisch.',
      ],
      autoAdvanceAfterMs: 1800,
    },
  ];

  if ((roleCounts.alienKatze ?? 0) > 0) {
    steps.push({
      id: 'alienKatze',
      roleId: 'alienKatze',
      title: 'Alienkatzen erwachen',
      description:
        'Alienkatzen öffnen die Augen, erkennen einander und tippen gemeinsam auf den Namen der Katze, die heute das Dorf verlassen soll. Danach schließen sie wieder die Augen.',
      allowTargetSelection: true,
      enterSpeech: [
        'Alienkatzen, öffnet eure Augen.',
        'Wählt gemeinsam eine Katze, die heute das Dorf verlassen soll.',
      ],
      exitSpeech: ['Alienkatzen, schließt eure Augen.'],
      exitDelayMs: 1500,
    });
  }

  if ((roleCounts.seher ?? 0) > 0) {
    steps.push({
      id: 'seher',
      roleId: 'seher',
      title: 'Seher schaut nach',
      description:
        'Seher öffnet die Augen und tippt heimlich auf einen Namen. Die App verrät nur dem Seher, ob dort eine Alienkatze schnurrt.',
      allowTargetSelection: true,
      enterSpeech: ['Nächste Rolle: Seher, öffne deine Augen.', 'Wähle heimlich eine Katze zum Prüfen.'],
      exitSpeech: ['Seher, schließe deine Augen.'],
      exitDelayMs: 1500,
    });
  }

  if ((roleCounts.doktor ?? 0) > 0) {
    steps.push({
      id: 'doktor',
      roleId: 'doktor',
      title: 'Doktor schützt',
      description:
        'Doktor erwacht und tippt den Namen einer Katze, die diese Nacht sicher schlafen soll. Danach schließen sich die Augen wieder.',
      allowTargetSelection: true,
      enterSpeech: ['Nächste Rolle: Doktor, öffne deine Augen.', 'Wen möchtest du heute beschützen?'],
      exitSpeech: ['Doktor, schließe deine Augen.'],
      exitDelayMs: 1500,
    });
  }

  if ((roleCounts.hexe ?? 0) > 0) {
    steps.push({
      id: 'hexe',
      roleId: 'hexe',
      title: 'Hexe braut Tränke',
      description:
        'Die Hexe erwacht und sieht, wer angegriffen wurde. Sie kann ihren Heiltrank oder ihren Gifttrank einsetzen (je einmal pro Spiel).',
      allowTargetSelection: true,
      enterSpeech: [
        'Nächste Rolle: Hexe, öffne deine Augen.',
        'Du siehst, wer angegriffen wurde. Möchtest du einen Trank einsetzen?',
      ],
      exitSpeech: ['Hexe, schließe deine Augen.'],
      exitDelayMs: 1500,
    });
  }

  if (round === 1 && (roleCounts.amor ?? 0) > 0) {
    steps.push({
      id: 'amor',
      roleId: 'amor',
      title: 'Amor wählt ein Liebespaar',
      description:
        'Amor erwacht und wählt zwei Katzen, die sich unsterblich ineinander verlieben. Stirbt eine, stirbt die andere aus gebrochenem Herzen.',
      allowTargetSelection: true,
      enterSpeech: [
        'Amor, öffne deine Augen.',
        'Wähle zwei Katzen, die zum Liebespaar werden.',
      ],
      exitSpeech: ['Amor, schließe deine Augen.'],
      exitDelayMs: 1500,
    });
  }

  return steps;
}

function buildTablePlayers(
  assignments: { playerId: string; playerName: string; alive?: boolean }[],
  players: { id: string; name: string }[],
  playerCount: number
): TablePlayer[] {
  if (assignments.length > 0) {
    return assignments.map((assignment) => ({
      id: assignment.playerId,
      name: assignment.playerName,
      alive: assignment.alive !== false,
    }));
  }
  return players.slice(0, playerCount).map((player, index) => ({
    id: player.id,
    name: player.name.trim() || `Katze ${index + 1}`,
    alive: true,
  }));
}

function NightStepCard({
  step,
  selectedTargetName,
  seerInsight,
  advancing,
  countdown,
  networkStatusLines,
}: {
  step: NightStep;
  selectedTargetName: string | null;
  seerInsight: SeerInsight | null;
  advancing: boolean;
  countdown: number | null;
  networkStatusLines?: string[];
}) {
  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.94)', dark: 'rgba(9,16,28,0.94)' }, 'background');
  const cardBorder = useThemeColor(
    { light: 'rgba(135,255,134,0.22)', dark: 'rgba(135,255,134,0.22)' },
    'tint'
  );

  let selectionHint: string | null = null;
  let seerResultText: string | null = null;
  if (step.allowTargetSelection) {
    if (!selectedTargetName) {
      selectionHint =
        step.roleId === 'alienKatze'
          ? 'Tippt gemeinsam auf den Namen der Katze, die das Dorf verlassen soll.'
          : step.roleId === 'doktor'
          ? 'Tippe auf die Katze, die du heute beschützen möchtest.'
          : step.roleId === 'hexe'
          ? 'Wähle einen Trank und tippe auf eine Katze — oder überspringe.'
          : step.roleId === 'amor'
          ? 'Tippe nacheinander auf zwei Katzen für das Liebespaar.'
          : 'Tippe heimlich auf einen Namen, um seine Energie zu prüfen.';
    } else if (step.roleId === 'doktor') {
      selectionHint = `Schutz aktiviert für: ${selectedTargetName}`;
    } else if (step.roleId === 'seher') {
      selectionHint = `Gewählter Blick: ${selectedTargetName}`;
      seerResultText = seerInsight
        ? `${seerInsight.playerName} gehört zum ${teamShortLabel(seerInsight.team)}.`
        : null;
    } else if (step.roleId === 'hexe') {
      selectionHint = `Trank eingesetzt auf: ${selectedTargetName}`;
    } else if (step.roleId === 'amor') {
      selectionHint = `Liebespaar wird verbunden…`;
    } else {
      selectionHint = `Ziel gewählt: ${selectedTargetName}`;
    }
  }

  const waitingHint =
    advancing && !(step.roleId === 'seher' && seerResultText)
      ? 'Bitte wartet einen Moment.'
      : null;
  const countdownHint = countdown !== null
    ? countdown > 0
      ? `Wechsel in ${countdown} ${countdown === 1 ? 'Sekunde' : 'Sekunden'}.`
      : 'Weiter geht sofort.'
    : null;
  const seerResultStyle = seerInsight?.team === 'aliens' ? styles.seerResultAlien : styles.seerResultVillage;

  return (
    <View style={[styles.stepCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <ThemedText type="subtitle">{step.title}</ThemedText>
      <ThemedText style={styles.stepDescription}>{step.description}</ThemedText>
      {selectionHint ? <ThemedText style={styles.stepHint}>{selectionHint}</ThemedText> : null}
      {waitingHint ? <ThemedText style={styles.stepHint}>{waitingHint}</ThemedText> : null}
      {countdownHint ? <ThemedText style={styles.stepHint}>{countdownHint}</ThemedText> : null}
      {networkStatusLines && networkStatusLines.length > 0
        ? networkStatusLines.map((line, index) => (
            <ThemedText key={`${line}-${index}`} style={styles.stepHint}>
              {line}
            </ThemedText>
          ))
        : null}
      {step.roleId === 'seher' && seerResultText ? (
        <ThemedText style={[styles.seerResultBase, seerResultStyle]}>{seerResultText}</ThemedText>
      ) : null}
    </View>
  );
}

type TableLayout = {
  size: number;
  seatWidth: number;
  seatHeight: number;
  radius: number;
  fontSize: number;
};

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
}: {
  players: TablePlayer[];
  selectedId: string | null;
  allowSelection: boolean;
  onSelect?: (id: string) => void;
  highlightColor?: string;
  selectionCounts?: Record<string, number>;
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
                    : idleBorderColor,
                  opacity: pressed && canSelect ? 0.82 : entry.alive ? 1 : 0.45,
                  shadowColor: isSelected || hasGroupSelection ? (highlightColor ?? '#ff7aa6') : seatShadowColor,
                },
              ]}>
              <ThemedText
                style={[styles.tableSeatText, seatTextStyle, !entry.alive && styles.tableSeatTextDead]}
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

function getSelectedId(record: NightRecord | null, roleId?: NightRoleId): string | null {
  if (!record || !roleId) {
    return null;
  }
  switch (roleId) {
    case 'alienKatze':
      return record.alienTargetId;
    case 'doktor':
      return record.doctorTargetId;
    case 'seher':
      return record.seerTargetId;
    case 'hexe':
      return record.hexeKillTarget ?? record.hexeHealTarget ?? null;
    case 'amor':
      return record.amorLover2 ?? record.amorLover1 ?? null;
    default:
      return null;
  }
}

function getPlayerName(players: TablePlayer[], playerId: string | null): string | null {
  if (!playerId) {
    return null;
  }
  return players.find((player) => player.id === playerId)?.name ?? null;
}

function teamShortLabel(team: TeamId): string {
  return team === 'aliens' ? 'Alienkatzen' : 'Dorf';
}

function formatNameList(names: string[]): string {
  if (names.length === 0) {
    return '';
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} und ${names[1]}`;
  }
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

function buildSunriseAnnouncement(
  casualties: CasualtyDetail[],
  saved: string[],
  revealRoles: boolean
): string {
  const openEyes = 'Alle Katzen dürfen jetzt die Augen öffnen.';
  if (casualties.length > 0) {
    const list = formatNameList(
      casualties.map((entry) =>
        revealRoles && entry.roleName ? `${entry.name} (${entry.roleName})` : entry.name
      )
    );
    const verb = casualties.length === 1 ? 'hat' : 'haben';
    return `Die Sonne geht auf. ${list} ${verb} die Nacht nicht überlebt. ${openEyes}`;
  }
  if (saved.length > 0) {
    const list = formatNameList(saved);
    const verb = saved.length === 1 ? 'ist' : 'sind';
    return `Die Sonne geht auf. ${list} ${verb} dank des Doktors weiterhin im Spiel. ${openEyes}`;
  }
  return `Die Sonne geht auf. Niemand ist in dieser Nacht gestorben. ${openEyes}`;
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
    paddingBottom: 64,
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
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    color: '#d8ffe8',
    marginTop: 12,
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
  stepCard: {
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
  stepDescription: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.9,
  },
  stepHint: {
    fontSize: 13,
    opacity: 0.75,
  },
  seerResultBase: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  seerResultAlien: {
    color: '#ff7aa6',
  },
  seerResultVillage: {
    color: '#87ff86',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backLabel: {
    color: '#87ff86',
    fontSize: 14,
  },
  alienConfirm: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.25)',
    backgroundColor: 'rgba(9,16,28,0.92)',
    padding: 16,
    gap: 12,
    shadowColor: '#1fff76',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  alienConfirmText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#d8ffe8',
  },
});
