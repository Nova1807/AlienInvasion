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

import { useGame } from '@/providers/game-provider';
import type { PlayerSummary } from '@/types/game';

export default function PlayerScreen() {
  const router = useRouter();
  const {
    state,
    sendPublicMessage,
    sendWerewolfMessage,
    castDayVote,
    castWerewolfVote,
    disconnect,
  } = useGame();
  const [publicMessage, setPublicMessage] = useState('');
  const [werewolfMessage, setWerewolfMessage] = useState('');

  useEffect(() => {
    if (!state.connected) {
      router.replace('/');
    }
  }, [router, state.connected]);

  const self = state.self;
  const isWerewolf = self?.role === 'werewolf';
  const alivePlayers = useMemo(() => state.players.filter((player) => player.alive), [state.players]);

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

  const handleDayVote = (player: PlayerSummary) => {
    castDayVote(player.id);
  };

  const handleWerewolfVote = (player: PlayerSummary) => {
    castWerewolfVote(player.id);
  };

  const playerVoteNames = useMemo(() => new Set(state.dayVotes.flatMap((vote) => vote.voters)), [state.dayVotes]);
  const werewolfVoteNames = useMemo(
    () => new Set(state.werewolfVotes.flatMap((vote) => vote.voters)),
    [state.werewolfVotes],
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{self?.name ?? 'Spieler'}</Text>
        <Text style={styles.headerSubtitle}>Rolle: {translateRole(self?.role)}</Text>
        <Text style={styles.headerSubtitle}>Raumcode: {state.roomCode ?? '–'}</Text>
        <Text style={styles.headerSubtitle}>Status: {self?.alive ? 'Lebendig' : 'Ausgeschieden'}</Text>
        <TouchableOpacity
          style={[styles.button, styles.danger]}
          onPress={() => {
            disconnect();
            router.replace('/');
          }}
        >
          <Text style={styles.buttonText}>Verbindung trennen</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Öffentlicher Chat</Text>
        <ChatMessageList messages={state.publicChat} emptyLabel="Noch keine Nachrichten" />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={publicMessage}
            onChangeText={setPublicMessage}
            placeholder="Nachricht an alle"
            placeholderTextColor="#64748b"
            editable={self?.alive ?? false}
          />
          <TouchableOpacity style={[styles.sendButton, styles.primary]} onPress={handleSendPublic}>
            <Text style={styles.buttonText}>Senden</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isWerewolf ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Werwolf-Chat</Text>
          <ChatMessageList messages={state.werewolfChat} emptyLabel="Keine Nachrichten" />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={werewolfMessage}
              onChangeText={setWerewolfMessage}
              placeholder="Nachricht an die Werwölfe"
              placeholderTextColor="#64748b"
              editable={self?.alive ?? false}
            />
            <TouchableOpacity style={[styles.sendButton, styles.secondary]} onPress={handleSendWerewolf}>
              <Text style={styles.buttonText}>Senden</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionSubtitle}>Ziel wählen</Text>
          <View style={styles.voteGrid}>
            {alivePlayers.map((player) => (
              <TouchableOpacity
                key={player.id}
                style={[
                  styles.voteOption,
                  werewolfVoteNames.has(player.name) ? styles.voteOptionActive : undefined,
                ]}
                onPress={() => handleWerewolfVote(player)}
              >
                <Text style={styles.voteLabel}>{player.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <VoteList votes={state.werewolfVotes} emptyLabel="Noch keine Stimmen" />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tag-Abstimmung</Text>
        {state.phase !== 'day' ? (
          <Text style={styles.sectionSubtitle}>Die Abstimmung ist nur während der Tagphase aktiv.</Text>
        ) : null}
        <View style={styles.voteGrid}>
          {alivePlayers.map((player) => (
            <TouchableOpacity
              key={player.id}
              style={[
                styles.voteOption,
                playerVoteNames.has(player.name) ? styles.voteOptionActive : undefined,
              ]}
              onPress={() => handleDayVote(player)}
              disabled={!self?.alive}
            >
              <Text style={styles.voteLabel}>{player.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <VoteList votes={state.dayVotes} emptyLabel="Noch keine Stimmen" />
      </View>
    </ScrollView>
  );
}

function translateRole(role?: string) {
  switch (role) {
    case 'werewolf':
      return 'Werwolf';
    case 'seer':
      return 'Seher';
    case 'villager':
      return 'Dorfbewohner';
    default:
      return 'Unbekannt';
  }
}

function ChatMessageList({ messages, emptyLabel }: { messages: Array<{ id: string; authorName: string; text: string; timestamp: string }>; emptyLabel: string }) {
  if (!messages.length) {
    return <Text style={styles.sectionSubtitle}>{emptyLabel}</Text>;
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

function VoteList({ votes, emptyLabel }: { votes: Array<{ targetId: string; targetName: string; votes: number; voters: string[] }>; emptyLabel: string }) {
  if (!votes.length) {
    return <Text style={styles.sectionSubtitle}>{emptyLabel}</Text>;
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
    gap: 24,
    paddingBottom: 80,
    backgroundColor: '#0b1120',
  },
  header: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#cbd5f5',
  },
  button: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  danger: {
    backgroundColor: '#ef4444',
  },
  section: {
    backgroundColor: '#111c32',
    borderRadius: 18,
    padding: 20,
    gap: 16,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '600',
  },
  sectionSubtitle: {
    color: '#94a3b8',
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
  primary: {
    backgroundColor: '#1d4ed8',
  },
  secondary: {
    backgroundColor: '#7c3aed',
  },
  voteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  voteOption: {
    flexBasis: '48%',
    backgroundColor: '#1f293b',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  voteOptionActive: {
    backgroundColor: '#2563eb',
  },
  voteLabel: {
    color: '#f8fafc',
    fontWeight: '600',
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
});
