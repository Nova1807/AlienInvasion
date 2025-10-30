import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function NetworkHostScreen() {
  const router = useRouter();
  const {
    state: { networkSessionActive, networkSessionCode, players, playerCount, revealOnDeath },
    startNetworkSession,
    endNetworkSession,
    updateRevealVote,
  } = useGame();

  const [hostName, setHostName] = useState('');
  const bgCard = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const border = useThemeColor({ light: 'rgba(135,255,134,0.28)', dark: 'rgba(135,255,134,0.28)' }, 'tint');
  const placeholder = '#7fb896';
  const textColor = useThemeColor({}, 'text');

  const voteStats = useMemo(() => {
    const yes = players.filter((p) => p.revealVote === true).length;
    const no = players.filter((p) => p.revealVote === false).length;
    const undecided = players.length - yes - no;
    const majorityReached = yes > players.length / 2;
    return { yes, no, undecided, majorityReached };
  }, [players]);

  if (!networkSessionActive) {
    return (
      <ThemedView style={styles.screen}>
        <View style={styles.container}>
          <View style={styles.intro}>
            <ThemedText type="title">Host-Sitzung starten</ThemedText>
            <ThemedText style={styles.hint}>
              Gib deinen Namen ein und erstelle einen Raum. Teile anschließend den Code mit deinen
              Mitspielenden.
            </ThemedText>
          </View>

          <View style={[styles.inputCard, { backgroundColor: bgCard }]}>
            <ThemedText style={styles.label}>Dein Name</ThemedText>
            <TextInput
              value={hostName}
              onChangeText={setHostName}
              placeholder="Host"
              placeholderTextColor={placeholder}
              style={[styles.input, { borderColor: border, color: textColor }]}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <PrimaryButton
              label="Sitzung erstellen"
              onPress={() => {
                startNetworkSession(hostName);
              }}
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.intro}>
          <ThemedText type="title">Lobby offen</ThemedText>
          <ThemedText style={styles.hint}>
            Code weitergeben, Katzen eintragen lassen und auf genug Stimmen warten. Mit mindestens vier
            Katzen kannst du zur Rollen-Auswahl wechseln.
          </ThemedText>
        </View>

        <View style={[styles.codeCard, { backgroundColor: bgCard }]}> 
          <ThemedText type="defaultSemiBold" style={styles.codeLabel}>
            Raum-Code
          </ThemedText>
          <ThemedText style={styles.codeValue}>{networkSessionCode}</ThemedText>
          <ThemedText style={styles.codeHint}>
            Jede Katze öffnet die Join-Seite und gibt diesen Code ein.
          </ThemedText>
        </View>

        <View style={[styles.voteCard, { backgroundColor: bgCard }]}> 
          <ThemedText type="subtitle">Reveal-Abstimmung</ThemedText>
          <ThemedText>
            Ja: {voteStats.yes} • Nein: {voteStats.no} • Offen: {voteStats.undecided}
          </ThemedText>
          <ThemedText style={styles.voteHint}>
            {voteStats.majorityReached
              ? 'Mehrheit erreicht – Karten werden nach Eliminierungen gezeigt.'
              : 'Noch keine Mehrheit: Karten bleiben versteckt, solange nicht mehr als die Hälfte zustimmt.'}
          </ThemedText>
          <ThemedText style={styles.voteHint}>Aktuell eingestellt: {revealOnDeath ? 'Aufdecken' : 'Versteckt lassen'}</ThemedText>
        </View>

        <View style={[styles.listCard, { backgroundColor: bgCard }]}> 
          <ThemedText type="subtitle">Teilnehmende ({playerCount})</ThemedText>
          <View style={styles.playerList}>
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                name={player.name}
                revealVote={player.revealVote}
                onToggleVote={() =>
                  updateRevealVote(player.id, !(player.revealVote ?? false))
                }
                canToggle={player.isHost}
              />
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Zur Rollen-Auswahl"
            onPress={() => router.push('/setup/network/roles')}
            disabled={playerCount < 4}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              endNetworkSession();
              router.replace('/setup/network');
            }}
            style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <ThemedText style={styles.closeLabel}>Sitzung schließen</ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

function PlayerRow({
  name,
  revealVote,
  onToggleVote,
  canToggle,
}: {
  name: string;
  revealVote: boolean | null;
  onToggleVote: () => void;
  canToggle: boolean;
}) {
  const rowBg = useThemeColor({ light: 'rgba(9,16,28,0.9)', dark: 'rgba(9,16,28,0.9)' }, 'background');
  const label =
    revealVote === null ? 'Keine Stimme' : revealVote ? 'Stimmt für Aufdecken' : 'Stimmt dagegen';
  return (
    <Pressable
      accessibilityRole={canToggle ? 'button' : undefined}
      onPress={canToggle ? onToggleVote : undefined}
      style={({ pressed }) => [
        styles.playerRow,
        { backgroundColor: rowBg, opacity: canToggle && pressed ? 0.6 : 1 },
      ]}
    >
      <ThemedText type="defaultSemiBold">{name}</ThemedText>
      <ThemedText style={styles.playerVote}>{label}</ThemedText>
      {canToggle ? (
        <ThemedText style={styles.playerVoteHint}>
          Tippen, um eigene Stimme umzuschalten
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
  },
  container: {
    flex: 1,
    gap: 24,
  },
  intro: {
    gap: 12,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#d8ffe8',
  },
  inputCard: {
    borderRadius: 20,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    backgroundColor: 'rgba(9,16,28,0.92)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  label: {
    fontSize: 14,
    color: '#b7ffd4',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: 'rgba(9,16,28,0.9)',
    shadowColor: '#1fff76',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  codeCard: {
    borderRadius: 22,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    backgroundColor: 'rgba(9,16,28,0.92)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  codeLabel: {
    textTransform: 'uppercase',
    fontSize: 12,
    color: '#b7ffd4',
  },
  codeValue: {
    fontSize: 28,
    textAlign: 'center',
  },
  codeHint: {
    fontSize: 13,
    textAlign: 'center',
    color: '#d8ffe8',
  },
  voteCard: {
    borderRadius: 22,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    backgroundColor: 'rgba(9,16,28,0.92)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  voteHint: {
    fontSize: 13,
    color: '#d8ffe8',
  },
  listCard: {
    borderRadius: 22,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    backgroundColor: 'rgba(9,16,28,0.92)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  playerList: {
    gap: 12,
  },
  playerRow: {
    borderRadius: 16,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    backgroundColor: 'rgba(9,16,28,0.9)',
    shadowColor: '#1fff76',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  playerVote: {
    fontSize: 13,
    color: '#b7ffd4',
  },
  playerVoteHint: {
    fontSize: 11,
    color: '#9beab4',
  },
  actions: {
    gap: 12,
  },
  closeButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeLabel: {
    color: '#ff9fbe',
    fontSize: 14,
  },
});
