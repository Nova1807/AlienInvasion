import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { RoleCard } from '@/components/role-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';
import { getRoleDefinition, type RoleId } from '@/constants/roles';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function NetworkRevealScreen() {
  const router = useRouter();
  const {
    state: { assignments, players, status },
    setPlayerReady,
    startGame,
  } = useGame();

  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (assignments.length === 0) {
      router.replace('/setup/network/roles');
    }
  }, [assignments.length, router]);

  const revealList = useMemo(() => {
    return assignments.map((assignment) => {
      const player = players.find((p) => p.id === assignment.playerId);
      return {
        ...assignment,
        ready: player?.ready ?? false,
      };
    });
  }, [assignments, players]);

  const allReady = revealList.length > 0 && revealList.every((entry) => entry.ready);
  const waitingCount = revealList.filter((entry) => !entry.ready).length;

  const panelBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.intro}>
          <ThemedText type="title">Rollen anzeigen</ThemedText>
          <ThemedText style={styles.hint}>
            Gib das Gerät an die jeweilige Person. Nach dem Lesen auf „Bereit“ tippen – der Eintrag
            wird anschließend verborgen.
          </ThemedText>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: panelBg }]}> 
          <ThemedText>
            Bereits bereit: {revealList.length - waitingCount} / {revealList.length}
          </ThemedText>
          <ThemedText style={styles.summaryHint}>
            Status: {status === 'reveal' ? 'Rollen werden verteilt' : 'Spiel gestartet'}
          </ThemedText>
        </View>

        <View style={styles.list}>
          {revealList.map((entry) => (
            <View key={entry.playerId} style={[styles.itemCard, { backgroundColor: panelBg }]}> 
              <ThemedText type="defaultSemiBold">{entry.playerName}</ThemedText>
              <ThemedText style={styles.itemHint}>
                {entry.ready ? 'Bereit – Rolle verborgen' : 'Wartet auf Enthüllung'}
              </ThemedText>
              {!entry.ready ? (
                <PrimaryButton
                  label="Rolle zeigen"
                  onPress={() => setActivePlayerId(entry.playerId)}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPlayerReady(entry.playerId, false)}
                  style={({ pressed }) => [styles.resetButton, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <ThemedText style={styles.resetLabel}>Zurücksetzen</ThemedText>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <PrimaryButton
          label="Host-Steuerung öffnen"
          onPress={() => {
            startGame();
            router.replace('/host');
          }}
          disabled={!allReady}
        />
      </ScrollView>

      <RoleModal
        visible={activePlayerId !== null}
        assignment={
          activePlayerId ? assignments.find((assignment) => assignment.playerId === activePlayerId) : null
        }
        onClose={() => setActivePlayerId(null)}
        onConfirm={(playerId) => {
          setActivePlayerId(null);
          setPlayerReady(playerId, true);
        }}
      />
    </ThemedView>
  );
}

function RoleModal({
  visible,
  assignment,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  assignment: { playerId: string; playerName: string; roleId: string; order: number } | undefined;
  onClose: () => void;
  onConfirm: (playerId: string) => void;
}) {
  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.96)', dark: 'rgba(9,16,28,0.96)' }, 'background');

  if (!assignment) {
    return null;
  }

  const role = getRoleDefinition(assignment.roleId as RoleId);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: cardBg }]}> 
          <ThemedText type="subtitle" style={styles.modalTitle}>
            {assignment.playerName}
          </ThemedText>
          <ThemedText style={styles.modalOrder}>Reihenfolge #{assignment.order}</ThemedText>
          <RoleCard role={role} />
          <PrimaryButton label="Ich bin bereit" onPress={() => onConfirm(assignment.playerId)} />
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.modalClose, { opacity: pressed ? 0.6 : 1 }]}
          >
            <ThemedText style={styles.modalCloseLabel}>Abbrechen</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    padding: 24,
    gap: 24,
    paddingBottom: 48,
  },
  intro: {
    gap: 12,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#d8ffe8',
  },
  summaryCard: {
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
  summaryHint: {
    fontSize: 13,
    color: '#d8ffe8',
  },
  list: {
    gap: 16,
  },
  itemCard: {
    borderRadius: 22,
    padding: 18,
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
  itemHint: {
    fontSize: 13,
    color: '#d8ffe8',
  },
  resetButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  resetLabel: {
    color: '#87ff86',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,7,15,0.92)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    padding: 22,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.28)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.3,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
  },
  modalTitle: {
    textAlign: 'center',
  },
  modalOrder: {
    textAlign: 'center',
    fontSize: 13,
    color: '#d8ffe8',
  },
  modalClose: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalCloseLabel: {
    color: '#87ff86',
    fontSize: 13,
  },
});
