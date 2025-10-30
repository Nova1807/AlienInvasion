import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame, type NightRecord } from '@/context/game-context';
import { getRoleDefinition, type RoleId, type TeamId } from '@/constants/roles';
import { useThemeColor } from '@/hooks/use-theme-color';
import { speakSequence, stop } from '@/utils/speech';

type NightRoleId = 'alienKatze' | 'seher' | 'doktor';

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
    state: { roleCounts, players, playerCount, assignments, nightLog, round, revealOnDeath },
    setPhase,
    startNightRound,
    setNightTarget,
    resolveNight,
  } = useGame();

  const [stepIndex, setStepIndex] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const exitDelayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancingRef = useRef(false);
  const entryStepKeyRef = useRef<string | null>(null);
  const seerAnnouncedRef = useRef<string | null>(null);

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
    setCountdown(null);
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

  const selectedTargetId = getSelectedId(currentNight, currentStep?.roleId);
  const selectedTargetName = useMemo(
    () => getPlayerName(tablePlayers, selectedTargetId),
    [tablePlayers, selectedTargetId]
  );

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
            return 0;
          }
          return prev - 1;
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
    const entryLines =
      currentStep.enterSpeech && currentStep.enterSpeech.length > 0
        ? currentStep.enterSpeech
        : [currentStep.description];
    const stepIndexSnapshot = stepIndex;
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
    currentStep,
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
    seerInsight,
    selectedTargetId,
    setAdvancing,
    startCountdown,
    stepIndex,
  ]);

  const handleSelect = (playerId: string) => {
    if (!currentStep?.roleId) {
      return;
    }
    if (currentStep.roleId === 'alienKatze') {
      const selectedAssignment = assignmentByPlayerId[playerId];
      if (selectedAssignment?.roleId === 'alienKatze') {
        speakSequence(['Nein Alien, du darfst dich nicht selbst umbringen.']);
        return;
      }
    }
    if (currentStep.roleId === 'seher' && seerPlayerId && playerId === seerPlayerId) {
      speakSequence(['Du kennst deine eigene Karte bereits.']);
      return;
    }
    setNightTarget(currentStep.roleId, playerId);
  };

  const allowTargetSelection = currentStep?.allowTargetSelection ?? false;
  const selectionEnabled = allowTargetSelection && !isAdvancing;

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
          selectedId={selectedTargetId}
          allowSelection={selectionEnabled}
          onSelect={selectionEnabled ? handleSelect : undefined}
        />

        {currentStep ? (
          <NightStepCard
            step={currentStep}
            selectedTargetName={selectedTargetName}
            seerInsight={seerInsight}
            advancing={isAdvancing}
            countdown={countdown}
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
}: {
  step: NightStep;
  selectedTargetName: string | null;
  seerInsight: SeerInsight | null;
  advancing: boolean;
  countdown: number | null;
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
          : 'Tippe heimlich auf einen Namen, um seine Energie zu prüfen.';
    } else if (step.roleId === 'doktor') {
      selectionHint = `Schutz aktiviert für: ${selectedTargetName}`;
    } else if (step.roleId === 'seher') {
      selectionHint = `Gewählter Blick: ${selectedTargetName}`;
      seerResultText = seerInsight
        ? `${seerInsight.playerName} gehört zum ${teamShortLabel(seerInsight.team)}.`
        : null;
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
      {step.roleId === 'seher' && seerResultText ? (
        <ThemedText style={[styles.seerResultBase, seerResultStyle]}>{seerResultText}</ThemedText>
      ) : null}
    </View>
  );
}

function NightTable({
  players,
  selectedId,
  allowSelection,
  onSelect,
}: {
  players: TablePlayer[];
  selectedId: string | null;
  allowSelection: boolean;
  onSelect?: (id: string) => void;
}) {
  const border = useThemeColor(
    { light: 'rgba(135,255,134,0.35)', dark: 'rgba(135,255,134,0.35)' },
    'tint'
  );
  const highlight = useThemeColor({ light: '#87ff86', dark: '#87ff86' }, 'tint');
  const nameBg = useThemeColor({ light: 'rgba(7,16,28,0.92)', dark: 'rgba(7,16,28,0.92)' }, 'background');

  const positioned = useMemo(() => {
    if (players.length === 0) {
      return [];
    }
    const size = 300;
    const seatWidth = 110;
    const seatHeight = 66;
    const radius = size / 2 - Math.max(seatWidth, seatHeight) / 2 - 6;
    return players.map((player, index) => {
      const angle = players.length === 1 ? -Math.PI / 2 : (index / players.length) * Math.PI * 2 - Math.PI / 2;
      const x = size / 2 + radius * Math.cos(angle) - seatWidth / 2;
      const y = size / 2 + radius * Math.sin(angle) - seatHeight / 2;
      return {
        ...player,
        style: {
          left: x,
          top: y,
          width: seatWidth,
          height: seatHeight,
        },
      };
    });
  }, [players]);

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
    <View style={styles.tableWrapper}>
      <View style={[styles.tableCircle, { borderColor: border }]}>
        {positioned.map((entry) => {
          const isSelected = entry.id === selectedId;
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
                  borderColor: isSelected ? highlight : 'rgba(135,255,134,0.16)',
                  opacity: pressed && canSelect ? 0.82 : entry.alive ? 1 : 0.45,
                },
              ]}>
              <ThemedText
                style={[styles.tableSeatText, !entry.alive && styles.tableSeatTextDead]}
                numberOfLines={2}>
                {entry.name}
              </ThemedText>
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
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1fff76',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
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
});
