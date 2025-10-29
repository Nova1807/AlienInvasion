import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useGame } from '@/providers/game-provider';

export default function IndexScreen() {
  const router = useRouter();
  const { connectAsHost, joinGame, state, lastError, disconnect } = useGame();
  const [hostName, setHostName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isHost = useMemo(() => state.self?.isHost ?? false, [state.self]);

  useEffect(() => {
    if (lastError) {
      setMessage(lastError);
    }
  }, [lastError]);

  const handleHost = async () => {
    if (!hostName.trim()) {
      setMessage('Bitte gib einen Namen ein, bevor du ein Spiel erstellst.');
      return;
    }

    setIsBusy(true);
    setMessage(null);
    try {
      await connectAsHost(hostName.trim());
      router.push('/host');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Spiel konnte nicht erstellt werden.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!roomCode.trim()) {
      setMessage('Bitte gib einen Raumcode ein.');
      return;
    }
    if (!joinName.trim()) {
      setMessage('Bitte gib deinen Namen ein.');
      return;
    }

    setIsBusy(true);
    setMessage(null);
    try {
      await joinGame(roomCode.trim().toUpperCase(), joinName.trim());
      router.push('/player');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Beitritt fehlgeschlagen.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResume = () => {
    if (isHost) {
      router.push('/host');
    } else {
      router.push('/player');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setMessage('Verbindung getrennt.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Werwolf Host</Text>
        <Text style={styles.subtitle}>
          Erstelle ein Spiel als Host oder tritt mit deinem Raumcode einer laufenden Runde bei.
        </Text>

        {state.connected && state.roomCode ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Aktive Verbindung</Text>
            <Text style={styles.cardText}>Raumcode: {state.roomCode}</Text>
            <Text style={styles.cardText}>Rolle: {isHost ? 'Host' : 'Spieler'}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.button, styles.primary]} onPress={handleResume}>
                <Text style={styles.buttonText}>Fortsetzen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.danger]} onPress={handleDisconnect}>
                <Text style={styles.buttonText}>Trennen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spiel hosten</Text>
          <Text style={styles.cardText}>Gib deinen Namen ein und starte eine neue Partie.</Text>
          <TextInput
            style={styles.input}
            value={hostName}
            onChangeText={setHostName}
            placeholder="Dein Name"
            editable={!isBusy}
          />
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={handleHost} disabled={isBusy}>
            <Text style={styles.buttonText}>{isBusy ? 'Erstelle...' : 'Spiel erstellen'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spiel beitreten</Text>
          <Text style={styles.cardText}>Trage den erhaltenen Raumcode und deinen Namen ein.</Text>
          <TextInput
            style={styles.input}
            value={roomCode}
            onChangeText={(value) => setRoomCode(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
            placeholder="Raumcode"
            autoCapitalize="characters"
            editable={!isBusy}
          />
          <TextInput
            style={styles.input}
            value={joinName}
            onChangeText={setJoinName}
            placeholder="Dein Name"
            editable={!isBusy}
          />
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={handleJoin} disabled={isBusy}>
            <Text style={styles.buttonText}>{isBusy ? 'Verbinde...' : 'Beitreten'}</Text>
          </TouchableOpacity>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Text style={styles.hint}>Stelle sicher, dass der Host-Server läuft und erreichbar ist.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1321',
  },
  scrollContent: {
    padding: 24,
    gap: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#f0f4f8',
  },
  subtitle: {
    fontSize: 16,
    color: '#cbd5f5',
  },
  card: {
    backgroundColor: '#111b2d',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
  },
  cardText: {
    color: '#cbd5f5',
    fontSize: 15,
  },
  input: {
    backgroundColor: '#1a2333',
    color: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2f3a57',
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  primary: {
    backgroundColor: '#5b21b6',
  },
  secondary: {
    backgroundColor: '#1d4ed8',
  },
  danger: {
    backgroundColor: '#b91c1c',
  },
  buttonText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 16,
  },
  message: {
    color: '#f87171',
    textAlign: 'center',
  },
  hint: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
});
