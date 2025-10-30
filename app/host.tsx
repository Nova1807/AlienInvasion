import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, SafeAreaView } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { RoleCard } from '@/components/role-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGame } from '@/context/game-context';
import { getRoleDefinition, type RoleId } from '@/constants/roles';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function HostScreen() {
  const router = useRouter();
  const {
    state: {
      status,
      assignments,
      revealIndex,
      currentPhase,
      roleCounts,
      playerCount,
      mode,
      revealOnDeath,
      singleRevealAfterDeath,
    },
    advanceReveal,
    startGame,
    setPhase,
    resetGame,
  } = useGame();

  const [visibleRole, setVisibleRole] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'reveal' && revealIndex === 0) {
      setVisibleRole(null);
    }
  }, [revealIndex, status]);

  const remainingToReveal = assignments.length - revealIndex;
  const currentAssignment = assignments[revealIndex];
  const allRevealed = assignments.length > 0 && revealIndex >= assignments.length;

  const summaryItems = useMemo(() => {
    return Object.entries(roleCounts)
      .filter(([, count]) => count > 0)
      .map(([roleId, count]) => {
        const role = getRoleDefinition(roleId as RoleId);
        return {
          id: role.id,
          name: role.name,
          count,
        };
      });
  }, [roleCounts]);

  const revealPolicyLabel =
    mode === 'single'
      ? singleRevealAfterDeath
        ? 'Ja'
        : 'Nein'
      : revealOnDeath
      ? 'Ja'
      : 'Nein';

  if (status === 'setup') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.centered}>
          <ThemedText type="title" style={styles.centeredText}>
            Noch kein Spiel vorbereitet
          </ThemedText>
          <ThemedText style={styles.centeredHint}>
            Lege im Start-Tab Dorfgröße und Rollen fest. Danach kannst du hier das Spiel leiten.
          </ThemedText>
          <PrimaryButton
            label="Zurück zur Vorbereitung"
            onPress={() => router.replace('/')}
            accessibilityHint="Öffnet die Startseite mit der Spielkonfiguration."
          />
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Host Steuerung
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Koordiniere deine Crew aus Alienkatzen und führe sie durch jede Phase.
        </ThemedText>
        <ThemedText style={styles.modeLabel}>
          Modus: {mode === 'single' ? 'Gemeinsames Gerät' : 'Mehrgeräte (Beta)'}
        </ThemedText>
        <View style={styles.summaryRow}>
          <View style={styles.summaryPill}>
            <ThemedText style={styles.summaryLabel}>Katzen im Dorf</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.summaryValue}>
              {playerCount}
            </ThemedText>
          </View>
          <View style={styles.summaryPill}>
            <ThemedText style={styles.summaryLabel}>Karten nach Tod</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.summaryValue}>
              {revealPolicyLabel}
            </ThemedText>
          </View>
        </View>
        {mode === 'network' && status === 'reveal' ? (
          <NetworkRevealNotice onOpen={() => router.push('/setup/network/reveal')} />
        ) : null}

        <View style={styles.rolesStrip}>
          {summaryItems.map((item) => (
            <View key={item.id} style={styles.rolesPill}>
              <ThemedText type="defaultSemiBold">
                {item.count} × {item.name}
              </ThemedText>
            </View>
          ))}
        </View>

        {status === 'reveal' ? (
        <RevealSection
          remaining={remainingToReveal}
          currentIndex={revealIndex}
          totalCount={assignments.length}
          onShowRole={(index) => {
            const assignment = assignments[index];
            if (!assignment) {
              return;
            }
            setVisibleRole(index);
          }}
          currentAssignment={currentAssignment}
          allRevealed={allRevealed}
          onStartGame={() => {
            startGame();
            setPhase('night');
            router.replace('/night');
          }}
        />
        ) : (
          <PhaseControls
            currentPhase={currentPhase}
            onNight={() => {
              setPhase('night');
              router.push('/night');
            }}
            onDay={() => {
              setPhase('day');
              router.push('/day');
            }}
          />
        )}

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.resetButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            resetGame();
            router.replace('/');
          }}>
          <ThemedText style={styles.resetLabel}>Neues Setup starten</ThemedText>
        </Pressable>
      </ScrollView>

      <RoleRevealModal
        visible={visibleRole !== null}
        assignment={visibleRole !== null ? assignments[visibleRole] : null}
        onClose={() => {
          setVisibleRole(null);
        }}
        onConfirm={() => {
          if (visibleRole !== null) {
            setVisibleRole(null);
            advanceReveal();
          }
        }}
      />
    </ThemedView>
    </SafeAreaView>
  );
}

function RevealSection({
  remaining,
  currentIndex,
  onShowRole,
  totalCount,
  currentAssignment,
  allRevealed,
  onStartGame,
}: {
  remaining: number;
  currentIndex: number;
  onShowRole: (revealIndex: number) => void;
  totalCount: number;
  currentAssignment?: { order: number; playerName: string; roleId: string };
  allRevealed: boolean;
  onStartGame: () => void;
}) {
  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  if (!currentAssignment && !allRevealed) {
    return null;
  }
  return (
    <View
      style={[styles.revealCard, { backgroundColor: cardBg }]}
    >
      {allRevealed ? (
        <>
          <ThemedText style={styles.revealHint}>
            Alle Katzen kennen ihre Rollen. Starte die erste Nacht, wenn alle bereit sind.
          </ThemedText>
          <PrimaryButton label="Spiel starten" onPress={onStartGame} />
        </>
      ) : (
        <>
          <ThemedText style={styles.revealHint}>
            Noch {remaining} von {totalCount} Katzen warten auf ihre Rolle. Gib das Gerät nur der genannten Katze.
          </ThemedText>
          {currentAssignment ? (
            <View style={styles.revealNameCard}>
              <ThemedText style={styles.revealLabel}>Jetzt dran</ThemedText>
              <ThemedText type="title" style={styles.revealName}>
                {currentAssignment.playerName}
              </ThemedText>
              <ThemedText style={styles.revealProgress}>
                Spieler {currentIndex + 1} / {totalCount}
              </ThemedText>
            </View>
          ) : null}
          <PrimaryButton
            label="Rolle anzeigen"
            onPress={() => {
              if (currentAssignment) {
                onShowRole(currentIndex);
              }
            }}
          />
        </>
      )}
    </View>
  );
}

function NetworkRevealNotice({ onOpen }: { onOpen: () => void }) {
  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  return (
    <View style={[styles.networkNotice, { backgroundColor: cardBg }]}>
      <ThemedText type="subtitle">Rollenverteilen aktiv</ThemedText>
      <ThemedText style={styles.networkNoticeHint}>
        Öffne den Bildschirm „Rollen anzeigen“, damit jede Person ihr Smartphone nutzen kann. Sobald
        alle bereit sind, startet das Spiel automatisch.
      </ThemedText>
      <PrimaryButton label="Zu Rollen anzeigen" onPress={onOpen} />
    </View>
  );
}

function RoleRevealModal({
  visible,
  assignment,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  assignment: { roleId: string; playerName: string; order: number } | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!assignment) {
    return null;
  }
  const role = getRoleDefinition(assignment.roleId as RoleId);
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ThemedText type="subtitle" style={styles.modalTitle}>
            {assignment.playerName}
          </ThemedText>
          <ThemedText style={styles.modalOrder}>Reihenfolge #{assignment.order}</ThemedText>
          <RoleCard role={role} />
          <PrimaryButton label="Verstanden" onPress={onConfirm} />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.modalClose, { opacity: pressed ? 0.7 : 1 }]}
            onPress={onClose}>
            <ThemedText style={styles.modalCloseLabel}>Schließen, ohne weiterzugehen</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PhaseControls({
  currentPhase,
  onNight,
  onDay,
}: {
  currentPhase: 'night' | 'day';
  onNight: () => void;
  onDay: () => void;
}) {
  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  return (
    <View style={[styles.phaseCard, { backgroundColor: cardBg }]}>
      <ThemedText type="subtitle">
        Aktuelle Phase: {currentPhase === 'night' ? 'Nacht' : 'Tag'}
      </ThemedText>
      <ThemedText style={styles.phaseHint}>
        Starte immer mit der Nachtübersicht. Sobald der Morgen gekommen ist, erscheint die
        Tag-Schaltfläche.
      </ThemedText>
      {currentPhase === 'night' ? (
        <PrimaryButton
          label="Nachtphase starten"
          onPress={onNight}
          accessibilityHint="Öffnet die Nacht-Anweisungen und startet die Sprachausgabe."
        />
      ) : (
        <PrimaryButton
          label="Tagphase starten"
          onPress={onDay}
          accessibilityHint="Öffnet die Tag-Hinweise für das Dorf."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  container: {
    padding: 24,
    gap: 24,
    paddingTop: 64,
    paddingBottom: 72,
  },
  title: {
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#d8ffe8',
    marginBottom: 8,
  },
  modeLabel: {
    textAlign: 'center',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#9beab4',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    marginTop: 16,
  },
  summaryPill: {
    width: '48%',
    minWidth: 140,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(9,16,28,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.25)',
    gap: 6,
    shadowColor: '#2cff9d',
    shadowOpacity: 0.22,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  summaryLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#b7ffd4',
  },
  summaryValue: {
    fontSize: 18,
    color: '#f2fff5',
  },
  rolesStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  rolesPill: {
    width: '48%',
    minWidth: 140,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(9,16,28,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#1fff76',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  revealCard: {
    borderRadius: 24,
    padding: 22,
    gap: 16,
    backgroundColor: 'rgba(9,16,28,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.24,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  revealHint: {
    fontSize: 15,
    lineHeight: 22,
    color: '#e6ffee',
  },
  revealNameCard: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(135,255,134,0.12)',
    alignItems: 'center',
    gap: 6,
  },
  revealLabel: {
    fontSize: 13,
    color: '#b7ffd4',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  revealName: {
    textAlign: 'center',
  },
  revealProgress: {
    fontSize: 13,
    color: '#d8ffe8',
  },
  networkNotice: {
    borderRadius: 24,
    padding: 22,
    gap: 12,
    backgroundColor: 'rgba(9,16,28,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.24,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  networkNoticeHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#d8ffe8',
  },
  phaseCard: {
    borderRadius: 24,
    padding: 22,
    gap: 16,
    backgroundColor: 'rgba(9,16,28,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.24,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  phaseHint: {
    fontSize: 14,
    lineHeight: 22,
    color: '#d8ffe8',
  },
  resetButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  resetLabel: {
    color: '#ff7aa6',
    fontSize: 14,
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
    gap: 18,
    backgroundColor: 'rgba(9,16,28,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.25)',
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
  },
  modalCloseLabel: {
    color: '#87ff86',
    fontSize: 13,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 20,
  },
  centeredText: {
    textAlign: 'center',
  },
  centeredHint: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#d8ffe8',
  },
});
