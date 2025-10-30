import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, Switch, View } from 'react-native';

import { NumberStepper } from '@/components/number-stepper';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function SinglePlayerCountScreen() {
  const router = useRouter();
  const {
    state: { playerCount, singleRevealAfterDeath },
    setPlayerCount,
    setSingleRevealAfterDeath,
  } = useGame();

  const cardBackground = useThemeColor(
    { light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' },
    'background'
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <View style={styles.container}>
        <View style={styles.intro}>
          <ThemedText type="title">Wie groß ist dein Dorf?</ThemedText>
          <ThemedText style={styles.hint}>
            Stelle die Anzahl der Katzen ein, die in dieser Runde mitmachen. Du kannst jederzeit
            nachjustieren.
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
            Katzen im Dorf
          </ThemedText>
          <NumberStepper value={playerCount} onChange={setPlayerCount} min={4} />
          <View style={styles.toggleRow}>
            <ThemedText style={styles.toggleLabel}>Rollen sofort aufdecken</ThemedText>
            <Switch
              value={singleRevealAfterDeath}
              onValueChange={setSingleRevealAfterDeath}
              thumbColor={singleRevealAfterDeath ? '#1e3a21' : '#101821'}
              trackColor={{ false: 'rgba(135,255,134,0.28)', true: '#87ff86' }}
            />
          </View>
          <ThemedText style={styles.cardHint}>Das Dorf kann beliebig wachsen. Mindestens vier Stimmen sind sinnvoll.</ThemedText>
          <ThemedText style={styles.cardHint}>
            Wenn aktiviert, deckt eine ausgeschiedene Katze ihre Rolle sofort auf.
          </ThemedText>
        </View>

        <PrimaryButton label="Weiter" onPress={() => router.push('/setup/single/names')} />
      </View>
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
    padding: 24,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 32,
  },
  intro: {
    gap: 12,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#d8ffe8',
  },
  card: {
    borderRadius: 20,
    padding: 24,
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
  cardTitle: {
    fontSize: 16,
    color: '#f2fff5',
  },
  cardHint: {
    fontSize: 13,
    color: '#b7ffd4',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#e6ffee',
  },
});
