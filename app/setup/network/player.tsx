import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { RoleCard } from '@/components/role-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getRoleDefinition } from '@/constants/roles';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function NetworkPlayerScreen() {
  const router = useRouter();
  const {
    state: { networkSessionActive, localPlayerId, players, currentPhase, status },
    acknowledgePlayerRole,
    setPlayerReady,
  } = useGame();

  const [showRole, setShowRole] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info');
  const [pendingAction, setPendingAction] = useState<'ack' | 'ready' | null>(null);

  const localPlayer = useMemo(
    () => players.find((player) => player.id === localPlayerId) ?? null,
    [players, localPlayerId]
  );

  useEffect(() => {
    if (!networkSessionActive || !localPlayerId) {
      router.replace('/setup/network/join');
    }
  }, [networkSessionActive, localPlayerId, router]);

  useEffect(() => {
    if (!networkSessionActive || !localPlayerId) {
      return;
    }
    if (currentPhase === 'night' && status === 'inProgress') {
      router.replace('/night-player');
      return;
    }
    if (currentPhase === 'day' && status === 'inProgress') {
      router.replace('/day-player');
    }
  }, [currentPhase, status, networkSessionActive, localPlayerId, router]);

  useEffect(() => {
    if (!localPlayer?.roleAcknowledged) {
      setShowRole(false);
    }
  }, [localPlayer?.roleAcknowledged, localPlayer?.roleId]);

  const cardRole = localPlayer?.roleId ? getRoleDefinition(localPlayer.roleId) : null;

  const cardBg = useThemeColor(
    { light: 'rgba(9,16,28,0.96)', dark: 'rgba(9,16,28,0.96)' },
    'background'
  );

  if (!networkSessionActive || !localPlayerId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.screen}>
          <View style={styles.centered}>
            <ThemedText type="title">Keine Sitzung verbunden</ThemedText>
            <ThemedText style={styles.centeredHint}>
              Bitte kehre zur Lobby zurück und trete mit dem Code erneut bei.
            </ThemedText>
            <PrimaryButton
              label="Zur Join-Seite"
              onPress={() => router.replace('/setup/network/join')}
            />
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (!localPlayer) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.screen}>
          <View style={styles.centered}>
            <ThemedText type="title">Spieler wird geladen…</ThemedText>
            <ThemedText style={styles.centeredHint}>
              Einen Moment Geduld, die Verbindung zur Lobby wird aktualisiert.
            </ThemedText>
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (localPlayer.isHost) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.screen}>
          <View style={styles.centered}>
            <ThemedText type="title">Host-Gerät</ThemedText>
            <ThemedText style={styles.centeredHint}>
              Dieses Gerät moderiert die Runde. Öffne die Host-Steuerung, um fortzufahren.
            </ThemedText>
            <PrimaryButton label="Host-Steuerung" onPress={() => router.replace('/host')} />
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  const waitingForAssignment = !cardRole;
  const acknowledged = localPlayer.roleAcknowledged;
  const ready = localPlayer.ready;

  const handleAcknowledge = async () => {
    if (!localPlayer || !cardRole || acknowledged) {
      return;
    }
    setPendingAction('ack');
    const result = await acknowledgePlayerRole(localPlayer.id, true);
    if (!result.ok) {
      setMessage(result.error ?? 'Konnte die Bestätigung nicht speichern.');
      setMessageTone('error');
    } else {
      setMessage('Danke! Du kannst jetzt „Bereit“ melden.');
      setMessageTone('info');
    }
    setPendingAction(null);
  };

  const handleReadyToggle = (nextReady: boolean) => {
    if (!localPlayer) {
      return;
    }
    setPendingAction('ready');
    setPlayerReady(localPlayer.id, nextReady);
    setMessage(
      nextReady ? 'Bereit gemeldet – warte auf die anderen.' : 'Bereitschaft zurückgenommen.'
    );
    setMessageTone('info');
    setPendingAction(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <ThemedText type="title">Deine Rolle</ThemedText>
            <ThemedText style={styles.hint}>
              {waitingForAssignment
                ? 'Der Host teilt gerade die Rollen zu. Diese Ansicht aktualisiert sich automatisch.'
                : 'Lies deine Karte in Ruhe. Bestätige sie anschließend und tippe auf „Bereit“.'
              }
            </ThemedText>
          </View>

          <View style={styles.playerCard}>
            <ThemedText style={styles.nameLabel}>Spielende Katze</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.playerName}>
              {localPlayer.name}
            </ThemedText>
          </View>

          {cardRole ? (
            <View style={[styles.roleCardContainer, { backgroundColor: cardBg }]}>
              {showRole ? (
                <RoleCard role={cardRole} />
              ) : (
                <View style={styles.hiddenRole}>
                  <ThemedText type="defaultSemiBold" style={styles.hiddenRoleTitle}>
                    Rolle verborgen
                  </ThemedText>
                  <ThemedText style={styles.hiddenRoleHint}>
                    Tippe unten auf „Rolle anzeigen“, um deine Karte aufzudecken.
                  </ThemedText>
                </View>
              )}
              <PrimaryButton
                label={showRole ? 'Rolle verbergen' : 'Rolle anzeigen'}
                onPress={() => setShowRole((value) => !value)}
                accessibilityHint="Wechselt zwischen verdeckter und sichtbarer Rollenkarte."
              />
            </View>
          ) : (
            <View style={[styles.waitingCard, { backgroundColor: cardBg }]}>
              <ThemedText style={styles.waitingText}>
                Noch keine Karte verfügbar. Bitte kurz warten, bis der Host die Verteilung abgeschlossen hat.
              </ThemedText>
            </View>
          )}

          <View style={styles.actions}>
            <PrimaryButton
              label="Ich habe die Rolle verstanden"
              onPress={handleAcknowledge}
              disabled={waitingForAssignment || acknowledged || pendingAction === 'ack'}
            />
            <PrimaryButton
              label={ready ? 'Bereit gemeldet' : 'Bereit tippen'}
              onPress={() => handleReadyToggle(!ready)}
              disabled={!acknowledged || pendingAction === 'ready'}
            />
            {ready ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => handleReadyToggle(false)}
                style={({ pressed }) => [styles.resetReady, { opacity: pressed ? 0.6 : 1 }]}
              >
                <ThemedText style={styles.resetReadyLabel}>Bereitschaft zurücknehmen</ThemedText>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.statusBox}>
            <StatusBullet
              label="Rolle bestätigt"
              value={acknowledged ? 'Ja' : waitingForAssignment ? 'Noch nicht zugeteilt' : 'Nein'}
            />
            <StatusBullet label="Bereit gemeldet" value={ready ? 'Ja' : 'Nein'} />
          </View>

          {message ? (
            <ThemedText style={messageTone === 'error' ? styles.messageError : styles.messageInfo}>
              {message}
            </ThemedText>
          ) : null}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

function StatusBullet({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <ThemedText style={styles.statusLabel}>{label}</ThemedText>
      <ThemedText style={styles.statusValue}>{value}</ThemedText>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  centeredHint: {
    textAlign: 'center',
    color: '#d8ffe8',
  },
  playerCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    backgroundColor: 'rgba(9,16,28,0.92)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
    gap: 4,
  },
  nameLabel: {
    color: '#b7ffd4',
    fontSize: 13,
  },
  playerName: {
    fontSize: 20,
  },
  roleCardContainer: {
    borderRadius: 24,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.28)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.28,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  hiddenRole: {
    gap: 8,
    alignItems: 'center',
  },
  hiddenRoleTitle: {
    fontSize: 16,
  },
  hiddenRoleHint: {
    fontSize: 13,
    color: '#d8ffe8',
    textAlign: 'center',
  },
  waitingCard: {
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.28)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  waitingText: {
    fontSize: 13,
    color: '#d8ffe8',
    textAlign: 'center',
  },
  actions: {
    gap: 12,
  },
  resetReady: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  resetReadyLabel: {
    color: '#87ff86',
    fontSize: 13,
  },
  statusBox: {
    borderRadius: 18,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    backgroundColor: 'rgba(9,16,28,0.9)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusLabel: {
    color: '#b7ffd4',
    fontSize: 13,
  },
  statusValue: {
    color: '#d8ffe8',
    fontSize: 13,
  },
  messageInfo: {
    textAlign: 'center',
    fontSize: 13,
    color: '#87ff86',
  },
  messageError: {
    textAlign: 'center',
    fontSize: 13,
    color: '#ff9fbe',
  },
});
