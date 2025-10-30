import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function SingleNamesScreen() {
  const router = useRouter();
  const {
    state: { players, playerCount },
    setPlayerName,
  } = useGame();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <View style={styles.container}>
        <View style={styles.intro}>
          <ThemedText type="title">Wie heißen die Mitspielenden?</ThemedText>
          <ThemedText style={styles.hint}>
            Jede Person wird beim Enthüllen namentlich aufgerufen. Lasse Eingaben frei, falls der
            Name offen bleiben soll.
          </ThemedText>
        </View>

        <View style={styles.list}>
          {players.slice(0, playerCount).map((player, index) => (
            <PlayerNameRow
              key={player.id}
              index={index}
              value={player.name}
              onChange={(text) => setPlayerName(index, text)}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Weiter"
            onPress={() => router.push('/setup/single/roles')}
          />
        </View>
      </View>
    </ThemedView>
    </SafeAreaView>
  );
}

function PlayerNameRow({
  index,
  value,
  onChange,
}: {
  index: number;
  value: string;
  onChange: (text: string) => void;
}) {
  const inputBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const border = useThemeColor({ light: 'rgba(135,255,134,0.28)', dark: 'rgba(135,255,134,0.28)' }, 'tint');
  const placeholder = '#7fb896';
  const textColor = useThemeColor({}, 'text');
  return (
    <View style={styles.row}>
      <ThemedText style={styles.rowLabel}>Katze {index + 1}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={`Katze ${index + 1}`}
        placeholderTextColor={placeholder}
        style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: textColor }]}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
      />
    </View>
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
  list: {
    gap: 14,
  },
  row: {
    gap: 6,
  },
  rowLabel: {
    fontSize: 13,
    color: '#9beab4',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    shadowColor: '#1fff76',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  actions: {
    gap: 12,
  },
});
