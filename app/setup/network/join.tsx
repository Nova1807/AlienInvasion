import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function NetworkJoinScreen() {
  const router = useRouter();
  const { joinNetworkSession, linkNetworkSession } = useGame();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [vote, setVote] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const border = useThemeColor({ light: 'rgba(135,255,134,0.28)', dark: 'rgba(135,255,134,0.28)' }, 'tint');
  const placeholder = '#7fb896';
  const textColor = useThemeColor({}, 'text');

  const handleJoin = () => {
    if (isJoining) {
      return;
    }
    setIsJoining(true);
    setMessage(null);
    void (async () => {
      const result = await joinNetworkSession(code, name, vote);
      if (!result.ok) {
        setMessage(result.error ?? 'Teilnahme fehlgeschlagen.');
        setIsJoining(false);
        return;
      }
      if (!result.sessionId) {
        setMessage('Sitzung konnte nicht verknüpft werden.');
        setIsJoining(false);
        return;
      }
      const linkResult = await linkNetworkSession({
        sessionId: result.sessionId,
        code: result.code ?? code.trim().toUpperCase(),
        localPlayerId: result.playerId ?? null,
      });
      if (!linkResult.ok) {
        setMessage(linkResult.error ?? 'Verbindung zur Lobby fehlgeschlagen.');
        setIsJoining(false);
        return;
      }
      setIsJoining(false);
      router.replace('/setup/network/player');
    })();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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

          <PrimaryButton
            label="Beitreten"
            onPress={handleJoin}
            disabled={!name.trim() || !code.trim() || isJoining}
          />

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
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
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
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
    padding: 24,
  },
  container: {
    flexGrow: 1,
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
