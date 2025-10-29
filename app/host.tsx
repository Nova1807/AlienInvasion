import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useNarrator } from '@/hooks/use-narrator';
import { useGame } from '@/providers/game-provider';
import type { PlayerSummary, Role } from '@/types/game';

const ROLE_OPTIONS: Array<{ key: Role; label: string }> = [
  { key: 'villager', label: 'Dorf' },
  { key: 'werewolf', label: 'Werwolf' },
  { key: 'seer', label: 'Seher' },
];

export default function HostScreen() {
  const router = useRouter();
  const {
    state,
    sendPublicMessage,
    sendWerewolfMessage,
    setRole,
    setAlive,
    setPhase,
    clearVotes,
    disconnect,
  } = useGame();
  const [publicMessage, setPublicMessage] = useState('');
  const [werewolfMessage, setWerewolfMessage] = useState('');
  const [speechText, setSpeechText] = useState('');
  const {
    voices,
    selectedVoice,
    setSelectedVoice,
    speak,
    stop,
    isSpeaking,
    isLoading,
    error: ttsError,
  } = useNarrator();

  useEffect(() => {
    if (!state.connected && !state.roomCode) {
      router.replace('/');
      return;
    }
    if (state.connected && !state.self?.isHost) {
      router.replace('/player');
    }
  }, [router, state.connected, state.roomCode, state.self]);

  const aliveCount = useMemo(
    () => state.players.filter((player) => player.alive).length,
    [state.players],
  );

  const handleRoleChange = (player: PlayerSummary, role: Role) => {
    if (player.role === role) {
      return;
    }
    setRole(player.id, role);
  };

  const toggleAlive = (player: PlayerSummary) => {
    setAlive(player.id, !player.alive);
  };

  const handleSendPublic = () => {
    if (!publicMessage.trim()) {
      return;
    }
    sendPublicMessage(publicMessage.trim());
    setPublicMessage('');
  };

  const handleSendWerewolf = () => {
    if (!werewolfMessage.trim()) {
      return;
    }
    sendWerewolfMessage(werewolfMessage.trim());
    setWerewolfMessage('');
  };

  const handleSpeak = async () => {
    if (!speechText.trim()) {
      return;
    }
    await speak(speechText.trim(), { voiceId: selectedVoice });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Raumcode</Text>
          <Text style={styles.badgeValue}>{state.roomCode ?? '–'}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Phase</Text>
          <Text style={styles.badgeValue}>{translatePhase(state.phase)}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Lebend</Text>
          <Text style={styles.badgeValue}>{aliveCount}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.smallButton, styles.danger]}
          onPress={() => {
            disconnect();
            router.replace('/');
          }}
        >
          <Text style={styles.smallButtonText}>Sitzung beenden</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Phasensteuerung</Text>
        <View style={styles.row}>
          <PhaseButton label="Lobby" active={state.phase === 'lobby'} onPress={() => setPhase('lobby')} />
          <PhaseButton label="Nacht" active={state.phase === 'night'} onPress={() => setPhase('night')} />
          <PhaseButton label="Tag" active={state.phase === 'day'} onPress={() => setPhase('day')} />
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.smallButton, styles.warning]} onPress={() => clearVotes('werewolf')}>
            <Text style={styles.smallButtonText}>Werwolf Stimmen löschen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallButton, styles.warning]} onPress={() => clearVotes('day')}>
            <Text style={styles.smallButtonText}>Tag Stimmen löschen</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spielerübersicht</Text>
        {state.players.map((player) => (
          <View key={player.id} style={styles.playerCard}>
            <View style={styles.playerHeader}>
              <Text style={styles.playerName}>{player.name}</Text>
              <TouchableOpacity
                style={[styles.statusBadge, player.alive ? styles.statusAlive : styles.statusDead]}
                onPress={() => toggleAlive(player)}
              >
                <Text style={styles.statusLabel}>{player.alive ? 'Lebt' : 'Ausgeschieden'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.roleButton,
                    player.role === option.key ? styles.roleButtonActive : undefined,
                  ]}
                  onPress={() => handleRoleChange(player, option.key)}
                >
                  <Text
                    style={[
                      styles.roleLabel,
                      player.role === option.key ? styles.roleLabelActive : undefined,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Öffentlicher Chat</Text>
        <ChatMessageList messages={state.publicChat} emptyLabel="Keine Nachrichten" />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={publicMessage}
            onChangeText={setPublicMessage}
            placeholder="Nachricht an alle"
            placeholderTextColor="#64748b"
          />
          <TouchableOpacity style={[styles.sendButton, styles.primary]} onPress={handleSendPublic}>
            <Text style={styles.smallButtonText}>Senden</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Werwolf Chat</Text>
        <ChatMessageList messages={state.werewolfChat} emptyLabel="Noch keine Flüstereien" />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={werewolfMessage}
            onChangeText={setWerewolfMessage}
            placeholder="Nachricht an Werwölfe"
            placeholderTextColor="#64748b"
          />
          <TouchableOpacity style={[styles.sendButton, styles.secondary]} onPress={handleSendWerewolf}>
            <Text style={styles.smallButtonText}>Senden</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Werwolf Abstimmung</Text>
        <VoteList votes={state.werewolfVotes} emptyLabel="Noch keine Stimmen" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tag Abstimmung</Text>
        <VoteList votes={state.dayVotes} emptyLabel="Noch keine Stimmen" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sprachausgabe</Text>
        <Text style={styles.sectionText}>
          Wähle eine Stimme und lasse den Moderator Text vorlesen. Für realistischere Stimmen kann ein externer Dienst in der
          Konfiguration hinterlegt werden.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voiceRow}>
          {voices.map((voice) => (
            <TouchableOpacity
              key={voice.identifier}
              style={[styles.voiceChip, selectedVoice === voice.identifier ? styles.voiceChipActive : undefined]}
              onPress={() => setSelectedVoice(voice.identifier)}
            >
              <Text
                style={[styles.voiceLabel, selectedVoice === voice.identifier ? styles.voiceLabelActive : undefined]}
              >
                {voice.name}
              </Text>
              <Text style={styles.voiceSubLabel}>{voice.language}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input}
          value={speechText}
          onChangeText={setSpeechText}
          placeholder="Text zum Vorlesen"
          placeholderTextColor="#64748b"
        />
        <View style={styles.row}>
          <TouchableOpacity style={[styles.smallButton, styles.primary]} onPress={handleSpeak}>
            <Text style={styles.smallButtonText}>{isLoading ? 'Lädt…' : 'Abspielen'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallButton, styles.danger]} onPress={stop} disabled={!isSpeaking}>
            <Text style={styles.smallButtonText}>Stoppen</Text>
          </TouchableOpacity>
        </View>
        {ttsError ? <Text style={styles.errorText}>{ttsError}</Text> : null}
      </View>
    </ScrollView>
  );
}

function translatePhase(phase: string) {
  switch (phase) {
    case 'night':
      return 'Nacht';
    case 'day':
      return 'Tag';
    default:
      return 'Lobby';
  }
}

function PhaseButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.phaseButton, active ? styles.phaseButtonActive : undefined]}
      onPress={onPress}
    >
      <Text style={[styles.phaseButtonLabel, active ? styles.phaseButtonLabelActive : undefined]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ChatMessageList({ messages, emptyLabel }: { messages: Array<{ id: string; authorName: string; text: string; timestamp: string }>; emptyLabel: string }) {
  if (!messages.length) {
    return <Text style={styles.sectionText}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.messageList}>
      {messages.map((message) => (
        <View key={message.id} style={styles.messageRow}>
          <Text style={styles.messageAuthor}>{message.authorName}</Text>
          <Text style={styles.messageTime}>{formatTime(message.timestamp)}</Text>
          <Text style={styles.messageContent}>{message.text}</Text>
        </View>
      ))}
    </View>
  );
}

function VoteList({
  votes,
  emptyLabel,
}: {
  votes: Array<{ targetId: string; targetName: string; votes: number; voters: string[] }>;
  emptyLabel: string;
}) {
  if (!votes.length) {
    return <Text style={styles.sectionText}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.voteList}>
      {votes.map((vote) => (
        <View key={vote.targetId} style={styles.voteRow}>
          <Text style={styles.voteName}>{vote.targetName}</Text>
          <Text style={styles.voteCount}>{vote.votes} Stimme{vote.votes === 1 ? '' : 'n'}</Text>
          <Text style={styles.voteVoters}>{vote.voters.join(', ')}</Text>
        </View>
      ))}
    </View>
  );
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleTimeString();
  } catch (error) {
    return '';
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 80,
    gap: 24,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  badge: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  badgeLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  badgeValue: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#111c32',
    borderRadius: 18,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 3,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '600',
  },
  sectionText: {
    color: '#cbd5f5',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  phaseButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1f2a44',
    alignItems: 'center',
  },
  phaseButtonActive: {
    backgroundColor: '#1d4ed8',
  },
  phaseButtonLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  phaseButtonLabelActive: {
    color: '#fff',
  },
  smallButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  warning: {
    backgroundColor: '#c2410c',
  },
  primary: {
    backgroundColor: '#1d4ed8',
  },
  secondary: {
    backgroundColor: '#7c3aed',
  },
  danger: {
    backgroundColor: '#ef4444',
  },
  playerCard: {
    backgroundColor: '#17233f',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusAlive: {
    backgroundColor: '#16a34a',
  },
  statusDead: {
    backgroundColor: '#6b7280',
  },
  statusLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#1f2a44',
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#7c3aed',
  },
  roleLabel: {
    color: '#cbd5f5',
    fontWeight: '500',
  },
  roleLabelActive: {
    color: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#1b2540',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    gap: 12,
  },
  messageRow: {
    backgroundColor: '#1f293b',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  messageAuthor: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  messageTime: {
    color: '#94a3b8',
    fontSize: 12,
  },
  messageContent: {
    color: '#cbd5f5',
  },
  voteList: {
    gap: 12,
  },
  voteRow: {
    backgroundColor: '#1f293b',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  voteName: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  voteCount: {
    color: '#fde68a',
    fontWeight: '600',
  },
  voteVoters: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  voiceRow: {
    gap: 12,
  },
  voiceChip: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1f2a44',
    marginRight: 12,
  },
  voiceChipActive: {
    backgroundColor: '#2563eb',
  },
  voiceLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  voiceLabelActive: {
    color: '#fff',
  },
  voiceSubLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  errorText: {
    color: '#f87171',
  },
});
