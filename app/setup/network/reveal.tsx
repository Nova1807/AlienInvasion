import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { RoleCard } from '@/components/role-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getRoleDefinition, type RoleId } from '@/constants/roles';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';

type PlayerStatus = {
  id: string;
  name: string;
  ready: boolean;
  acknowledged: boolean;
  hasRole: boolean;
};

export default function NetworkRevealScreen() {
  const router = useRouter();
  const {
    state: { assignments, players, status },
    setPlayerReady,
    acknowledgePlayerRole,
    startGame,
  } = useGame();
  const autoStartRef = useRef(false);
  const [showHostRole, setShowHostRole] = useState(false);

  useEffect(() => {
    if (assignments.length === 0) {
      router.replace('/setup/network/roles');
    }
  }, [assignments.length, router]);

  const hostPlayer = useMemo(() => players.find((player) => player.isHost) ?? null, [players]);
  const hostAssignment = useMemo(() => {
    const hostId = hostPlayer?.id;
    if (!hostId) {
      return null;
    }
    return assignments.find((assignment) => assignment.playerId === hostId) ?? null;
  }, [assignments, hostPlayer?.id]);

  const hostParticipates = Boolean(hostAssignment);

  const revealList = useMemo<PlayerStatus[]>(() => {
    return players
      .filter((player) => !player.isHost || hostParticipates)
      .map((player) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
        acknowledged: player.roleAcknowledged,
        hasRole: player.roleId !== null,
      }));
  }, [players, hostParticipates]);

  const hostRole = useMemo(() => {
    if (!hostAssignment?.roleId) {
      return null;
    }
    try {
      return getRoleDefinition(hostAssignment.roleId as RoleId);
    } catch {
      return null;
    }
  }, [hostAssignment]);

  const hostReady = Boolean(hostPlayer?.ready);
  const hostAcknowledged = Boolean(hostPlayer?.roleAcknowledged || hostAssignment?.revealed);

  const totalPlayers = revealList.length;
  const readyCount = revealList.filter((entry) => entry.ready).length;
  const acknowledgedCount = revealList.filter((entry) => entry.acknowledged).length;
  const waitingForRole = revealList.filter((entry) => !entry.hasRole).length;
  const allReady = totalPlayers > 0 && readyCount === totalPlayers;

  const panelBg = useThemeColor(
    { light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' },
    'background'
  );

  useEffect(() => {
    if (!autoStartRef.current && status === 'reveal' && allReady) {
      autoStartRef.current = true;
      startGame();
      router.replace('/night');
    }
  }, [allReady, router, startGame, status]);

  useEffect(() => {
    if (status === 'reveal') {
      autoStartRef.current = false;
    }
  }, [status]);

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.intro}>
          <ThemedText type="title">Status der Lobby</ThemedText>
          <ThemedText style={styles.hint}>
            Jede Katze sieht ihre Karte auf dem eigenen Gerät. Sobald alle auf „Bereit“ tippen, kann
            die erste Nacht starten.
          </ThemedText>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: panelBg }]}>
          <ThemedText>
            Bereit: {readyCount} / {totalPlayers}
          </ThemedText>
          <ThemedText style={styles.summaryHint}>
            Rollen bestätigt: {acknowledgedCount} • Offene Zuteilungen: {waitingForRole}
          </ThemedText>
          <ThemedText style={styles.summaryHint}>
            Phase: {status === 'reveal' ? 'Rollen werden verteilt' : 'Spiel gestartet'}
          </ThemedText>
        </View>

        {hostParticipates && hostAssignment ? (
          <View style={[styles.hostCard, { backgroundColor: panelBg }]}> 
            <ThemedText type="subtitle">Host-Rolle</ThemedText>
            <ThemedText style={styles.hostHint}>
              {hostAssignment.revealed
                ? 'Host hat seine Karte gesehen und kann sie jederzeit erneut öffnen.'
                : 'Host muss seine Rolle noch ansehen.'}
            </ThemedText>
            <PrimaryButton
              label={hostAssignment.revealed ? 'Eigene Rolle ansehen' : 'Eigene Rolle anzeigen'}
              onPress={() => {
                if (!hostRole) {
                  return;
                }
                setShowHostRole(true);
              }}
            />
            <View style={styles.hostStatusRow}>
              <ThemedText style={styles.hostStatusLabel}>
                Rolle bestätigt: {hostAcknowledged ? 'Ja' : 'Nein'}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (!hostPlayer) {
                    return;
                  }
                  void acknowledgePlayerRole(hostPlayer.id, !hostAcknowledged);
                }}
                style={({ pressed }) => [styles.hostStatusAction, { opacity: pressed ? 0.6 : 1 }]}
              >
                <ThemedText style={styles.hostStatusActionLabel}>
                  {hostAcknowledged ? 'Zurücksetzen' : 'Bestätigen'}
                </ThemedText>
              </Pressable>
            </View>
            <View style={styles.hostStatusRow}>
              <ThemedText style={styles.hostStatusLabel}>
                Bereit: {hostReady ? 'Ja' : 'Nein'}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (!hostPlayer) {
                    return;
                  }
                  setPlayerReady(hostPlayer.id, !hostReady);
                }}
                style={({ pressed }) => [styles.hostStatusAction, { opacity: pressed ? 0.6 : 1 }]}
              >
                <ThemedText style={styles.hostStatusActionLabel}>
                  {hostReady ? 'Zurücknehmen' : 'Bereit melden'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.list}>
          {revealList.map((entry) => {
            const roleStatus = !entry.hasRole
              ? 'Wartet auf Zuteilung'
              : entry.acknowledged
              ? 'Rolle bestätigt'
              : 'Rolle noch offen';
            const readyStatus = entry.ready ? 'Bereit gemeldet' : 'Noch nicht bereit';
            return (
              <View key={entry.id} style={[styles.itemCard, { backgroundColor: panelBg }]}>
                <ThemedText type="defaultSemiBold">{entry.name}</ThemedText>
                <ThemedText style={styles.itemHint}>{roleStatus}</ThemedText>
                <ThemedText
                  style={[
                    styles.readyLabel,
                    entry.ready ? styles.readyDone : styles.readyPending,
                  ]}
                >
                  {readyStatus}
                </ThemedText>
                {entry.ready ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPlayerReady(entry.id, false)}
                    style={({ pressed }) => [styles.resetButton, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <ThemedText style={styles.resetLabel}>Bereitschaft zurücksetzen</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
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

      <Modal
        transparent
        animationType="fade"
        visible={showHostRole && Boolean(hostRole)}
        onRequestClose={() => setShowHostRole(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: panelBg }]}> 
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {hostPlayer?.name || 'Host'}
            </ThemedText>
            {hostRole ? (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}>
                <RoleCard role={hostRole} />
              </ScrollView>
            ) : (
              <ThemedText style={styles.modalHint}>
                Keine Rolle verfügbar. Bitte kurz warten.
              </ThemedText>
            )}
            <PrimaryButton
              label="Verstanden"
              onPress={() => {
                if (hostPlayer && !hostAcknowledged) {
                  void acknowledgePlayerRole(hostPlayer.id, true);
                }
                setShowHostRole(false);
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowHostRole(false)}
              style={({ pressed }) => [styles.modalClose, { opacity: pressed ? 0.7 : 1 }]}
            >
              <ThemedText style={styles.modalCloseLabel}>Schließen</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ThemedView>
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
  readyLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  readyDone: {
    color: '#87ff86',
  },
  readyPending: {
    color: '#ffb27c',
  },
  resetButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  resetLabel: {
    color: '#87ff86',
    fontSize: 13,
  },
  hostCard: {
    borderRadius: 22,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  hostHint: {
    fontSize: 13,
    color: '#d8ffe8',
  },
  hostStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hostStatusLabel: {
    fontSize: 13,
    color: '#d8ffe8',
    flexShrink: 1,
  },
  hostStatusAction: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.28)',
  },
  hostStatusActionLabel: {
    fontSize: 13,
    color: '#87ff86',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,7,15,0.92)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.28,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
    maxHeight: '90%',
  },
  modalTitle: {
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 420,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalHint: {
    fontSize: 14,
    textAlign: 'center',
    color: '#d8ffe8',
  },
  modalClose: {
    alignItems: 'center',
  },
  modalCloseLabel: {
    color: '#87ff86',
    fontSize: 13,
  },
});
