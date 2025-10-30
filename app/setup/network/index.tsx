import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';

export default function NetworkModeLandingScreen() {
  const router = useRouter();
  const { endNetworkSession } = useGame();

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title">Mehrgeräte-Modus</ThemedText>
          <ThemedText style={styles.subtitle}>
            Host startet einen Raum, Gäste treten über einen Code bei und stimmen über das
            Aufdecken ab.
          </ThemedText>
        </View>

        <View style={styles.buttonStack}>
          <PrimaryButton
            label="Sitzung als Host starten"
            onPress={() => {
              endNetworkSession();
              router.push('/setup/network/host');
            }}
          />
          <PrimaryButton
            label="Lobby beitreten"
            onPress={() => router.push('/setup/network/join')}
          />
        </View>

        <ThemedText style={styles.hint}>
          Alle Aktionen finden lokal im Gerät statt. Nutze die Join-Seite, um Namen und Stimmen der
          Mitspielenden einzutragen.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 32,
  },
  header: {
    gap: 12,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#d8ffe8',
  },
  buttonStack: {
    gap: 16,
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: '#b7ffd4',
  },
});
