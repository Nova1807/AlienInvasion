import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame, type GameOutcome } from '@/context/game-context';
import { getRoleDefinition, type RoleId } from '@/constants/roles';
import { useThemeColor } from '@/hooks/use-theme-color';
import { speak, stop } from '@/utils/speech';

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
    state: { assignments, dayLog, nightLog, round, outcome, revealOnDeath },
    setPhase,
    resolveDayVote,
  } = useGame();

  const [dayRound] = useState(round);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const assignmentMap = useMemo(() => {
    return assignments.reduce<Record<string, (typeof assignments)[number]>>((map, assignment) => {
      map[assignment.playerId] = assignment;
      return map;
    }, {});
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
    return () => {
      stop();
    };
  }, [setPhase]);

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
    if (!voteResolved) {
      voteAnnouncement.current = null;
      return;
    }
    let message: string | null = null;
    if (dayRecord.skipped) {
      message = 'Das Dorf verzichtet heute auf eine Abstimmung.';
    } else if (votedOutDisplayName) {
      message = `${votedOutDisplayName} wurde vom Dorf verbannt.`;
    }
    if (!message) {
      return;
    }
    if (outcome) {
      const outcomeMessage = formatOutcomeMessage(outcome);
      outcomeAnnounced.current = outcomeMessage;
      message = `${message} ${outcomeMessage}`;
    }
    if (voteAnnouncement.current === message) {
      return;
    }
    voteAnnouncement.current = message;
    stop();
    speak(message);
  }, [voteResolved, dayRecord.skipped, votedOutDisplayName, outcome]);

  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const cardBorder = useThemeColor(
    { light: 'rgba(135,255,134,0.22)', dark: 'rgba(135,255,134,0.22)' },
    'tint'
  );

  const handleSubmitVote = () => {
    if (!selectedPlayerId) {
      return;
    }
    resolveDayVote({ targetId: selectedPlayerId, skip: false });
  };

  const handleSkipVote = () => {
    resolveDayVote({ targetId: null, skip: true });
  };

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

        {outcome ? (
          <View style={[styles.card, styles.outcomeCard]}>
            <ThemedText type="subtitle">Spielende</ThemedText>
            <ThemedText style={styles.outcomeText}>{formatOutcomeMessage(outcome)}</ThemedText>
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
    </SafeAreaView>
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
  voteActions: {
    gap: 12,
    marginTop: 12,
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
  outcomeCard: {
    backgroundColor: 'rgba(135,255,134,0.15)',
    borderColor: 'rgba(135,255,134,0.35)',
  },
  outcomeText: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.95,
  },
  voteList: {
    gap: 12,
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
});
