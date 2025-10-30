import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function NetworkJoinScreen() {
  const router = useRouter();
  const {
    state: { networkSessionActive, networkSessionCode },
    joinNetworkSession,
  } = useGame();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [vote, setVote] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const border = useThemeColor({ light: 'rgba(135,255,134,0.28)', dark: 'rgba(135,255,134,0.28)' }, 'tint');
  const placeholder = '#7fb896';
  const textColor = useThemeColor({}, 'text');

  const handleJoin = () => {
    if (!networkSessionActive || !networkSessionCode) {
      setMessage('Aktuell ist keine Lobby geöffnet. Bitte den Host darum bitten.');
      return;
    }
    if (code.trim().toUpperCase() !== networkSessionCode.toUpperCase()) {
      setMessage('Code stimmt nicht. Prüfe die Eingabe.');
      return;
    }
    const result = joinNetworkSession(name, vote);
    if (!result.ok) {
      setMessage(result.error ?? 'Teilnahme fehlgeschlagen.');
      return;
    }
    setMessage('Erfolgreich eingetragen!');
    setName('');
  };

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.intro}>
          <ThemedText type="title">Lobby beitreten</ThemedText>
          <ThemedText style={styles.hint}>
            Host teilt einen Code. Trage deinen Namen ein und stimme ab, ob Karten nach dem Tod
            aufgedeckt werden sollen.
          </ThemedText>
        </View>

        <View style={[styles.formCard, { backgroundColor: cardBg }]}>
          <ThemedText style={styles.label}>Raum-Code</ThemedText>
          <TextInput
            value={code}
            onChangeText={(text) => setCode(text.toUpperCase())}
            placeholder="CODE"
            placeholderTextColor={placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { borderColor: border, color: textColor }]}
          />

          <ThemedText style={styles.label}>Dein Name</ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={placeholder}
            autoCapitalize="words"
            autoCorrect={false}
            style={[styles.input, { borderColor: border, color: textColor }]}
          />

          <ThemedText style={styles.label}>Soll die Runde Karten aufdecken?</ThemedText>
          <View style={styles.voteRow}>
            <VoteButton label="Ja" active={vote === true} onPress={() => setVote(true)} />
            <VoteButton label="Nein" active={vote === false} onPress={() => setVote(false)} />
          </View>

          <PrimaryButton label="Beitreten" onPress={handleJoin} disabled={!name.trim()} />

          {message ? (
            <ThemedText style={styles.message}>{message}</ThemedText>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <ThemedText style={styles.backLabel}>Zurück</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

function VoteButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const background = useThemeColor(
    { light: active ? '#87ff86' : 'rgba(135,255,134,0.12)', dark: active ? '#87ff86' : 'rgba(135,255,134,0.12)' },
    'tint'
  );
  const text = active ? '#041a0e' : '#d8ffe8';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.voteButton,
        { backgroundColor: background, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
    >
      <ThemedText type="defaultSemiBold" style={{ color: text }}>
        {label}
      </ThemedText>
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
  formCard: {
    borderRadius: 22,
    padding: 20,
    gap: 12,
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
    fontSize: 13,
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
  voteRow: {
    flexDirection: 'row',
    gap: 12,
  },
  voteButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    shadowColor: '#1fff76',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  message: {
    fontSize: 13,
    textAlign: 'center',
    color: '#ff9fbe',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  backLabel: {
    color: '#87ff86',
    fontSize: 14,
  },
});
