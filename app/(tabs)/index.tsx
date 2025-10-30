import { useRouter } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';

export default function ModeGatewayScreen() {
  const router = useRouter();
  const { setMode, resetGame } = useGame();
  const alienPortrait = require('@/assets/images/Alien.jpg');

  const handleSingle = () => {
    resetGame();
    setMode('single');
    router.push('/setup/single/player-count');
  };

  const handleNetwork = () => {
    resetGame();
    setMode('network');
    router.push('/setup/network');
  };

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <Image source={alienPortrait} style={styles.heroImage} accessibilityIgnoresInvertColors />
          <View style={styles.heroText}>
            <ThemedText type="title" style={styles.title}>
              Alien Invasion
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Kosmische Katzen brauchen eine Spielleitung. Wähle den Modus und leite sie durch die
              Sterne.
            </ThemedText>
          </View>
        </View>

        <View style={styles.buttonStack}>
          <PrimaryButton label="Gemeinsames Gerät" onPress={handleSingle} />
          <PrimaryButton label="Mehrgeräte" onPress={handleNetwork} />
        </View>

        <ThemedText style={styles.hint}>
          Im Mehrgeräte-Modus startet eine Host-Lobby mit Code, Gäste treten mit Namen und Stimme
          bei.
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
    justifyContent: 'center',
    gap: 28,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(9,16,28,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.25)',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#3aff9d',
    shadowOpacity: 0.25,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  heroGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    top: -110,
    right: -120,
    backgroundColor: 'rgba(135,255,134,0.18)',
    borderRadius: 260,
    opacity: 0.9,
    shadowColor: '#87ff86',
    shadowOpacity: 0.6,
    shadowRadius: 120,
    shadowOffset: { width: 0, height: 0 },
  },
  heroImage: {
    width: 160,
    height: 160,
    borderRadius: 120,
    borderWidth: 2,
    borderColor: 'rgba(135,255,134,0.4)',
    alignSelf: 'center',
  },
  heroText: {
    gap: 12,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  buttonStack: {
    gap: 16,
    backgroundColor: 'rgba(9,16,28,0.9)',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.2)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 6,
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    opacity: 0.8,
  },
});
