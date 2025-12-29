import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { NumberStepper } from '@/components/number-stepper';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { selectableRoles, type RoleDefinition } from '@/constants/roles';
import { RoleArtworks } from '@/constants/role-artwork';
import { RoleCard } from '@/components/role-card';
import { useGame } from '@/context/game-context';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function SingleRolesScreen() {
  const router = useRouter();
  const {
    state: { roleCounts, playerCount, mode, revealOnDeath },
    setupSummary,
    setRoleCount,
    generateAssignments,
  } = useGame();

  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const [infoRole, setInfoRole] = useState<RoleDefinition | null>(null);

  const totalAssigned = useMemo(
    () => setupSummary.nonCrewSelected + setupSummary.crewCount,
    [setupSummary.crewCount, setupSummary.nonCrewSelected]
  );

  const isReady =
    setupSummary.errors.length === 0 &&
    localErrors.length === 0 &&
    totalAssigned === playerCount &&
    playerCount >= 4;

  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');
  const panelBg = useThemeColor({ light: 'rgba(9,16,28,0.92)', dark: 'rgba(9,16,28,0.92)' }, 'background');

  const handleRoleChange = (roleId: string, nextValue: number) => {
    const numeric = Math.max(0, Math.floor(nextValue));
    const role = selectableRoles.find((entry) => entry.id === roleId);
    if (!role) return;
    const current = roleCounts[role.id] ?? 0;
    const otherSelected = setupSummary.nonCrewSelected - current;
    const remainingSlots = Math.max(playerCount - otherSelected, 0);
    let maxForRole = typeof role.maxCount === 'number' ? role.maxCount : remainingSlots;
    if (role.id === 'alienKatze') {
      maxForRole = Math.min(remainingSlots, playerCount - 1);
    }
    const clamped = Math.min(numeric, Math.max(maxForRole, 0));
    const min = role.minCount ?? 0;
    if (clamped < min) {
      setRoleCount(role.id, min);
      return;
    }
    if (otherSelected + clamped > playerCount) {
      return;
    }
    setRoleCount(role.id, clamped);
  };

  const handleGenerate = () => {
    const result = generateAssignments();
    if (!result.ok) {
      setLocalErrors(result.errors ?? []);
      return;
    }
    setLocalErrors([]);
    if (mode === 'network') {
      router.push('/setup/network/reveal');
    } else {
      router.push('/host');
    }
  };

  const dorfLabel =
    setupSummary.crewCount === 1 ? 'Dorfkatze' : `${setupSummary.crewCount} Dorfkatzen`;

  const errorsToShow = localErrors.length > 0 ? localErrors : setupSummary.errors;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.screen}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
          <View style={styles.intro}>
            <ThemedText type="title">Rollen im Dorf</ThemedText>
            <ThemedText style={styles.hint}>
              Wähle, welche Spezialrollen teilnehmen. Dorfkatzen ergänzt die App automatisch anhand der freien Plätze.
            </ThemedText>
          </View>

          <ThemedText style={styles.detail}>
            Aktuell sind {totalAssigned}/{playerCount} Plätze vergeben. {dorfLabel} kommen automatisch
            dazu.
          </ThemedText>

          {mode === 'single' ? null : (
            <View style={[styles.revealInfo, { backgroundColor: panelBg }]}>
              <ThemedText type="defaultSemiBold">Abstimmung der Lobby</ThemedText>
              <ThemedText style={styles.revealHint}>
                Aktuell eingestellt: {revealOnDeath ? 'Karten werden gezeigt' : 'Karten bleiben verdeckt'}
              </ThemedText>
            </View>
          )}

          <View style={styles.roleGrid}>
            {selectableRoles.map((role) => {
              const currentCount = roleCounts[role.id] ?? 0;
              const min = role.minCount ?? 0;
              const otherSelected = setupSummary.nonCrewSelected - currentCount;
              const remainingSlots = Math.max(playerCount - otherSelected, 0);
              const maxByRule = typeof role.maxCount === 'number' ? role.maxCount : remainingSlots;
              const max =
                role.id === 'alienKatze'
                  ? Math.min(maxByRule, playerCount - 1)
                  : Math.min(maxByRule, remainingSlots);
              return (
                <View key={role.id} style={[styles.roleCard, { backgroundColor: cardBg }]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setInfoRole(role)}
                    style={({ pressed }) => [
                      styles.roleArtwork,
                      { opacity: pressed ? 0.85 : 1 },
                    ]}>
                    {(() => {
                      const previews = RoleArtworks[role.id] ?? [];
                      const previewSource = previews[0] ?? null;
                      if (previewSource) {
                        return (
                          <Image
                            source={previewSource}
                            style={styles.roleImage}
                            resizeMode="contain"
                            accessibilityIgnoresInvertColors
                          />
                        );
                      }
                      return (
                        <View style={styles.roleArtworkFallback}>
                          <ThemedText type="title" style={styles.roleFallbackLetter}>
                            {role.name.charAt(0)}
                          </ThemedText>
                        </View>
                      );
                    })()}
                  </Pressable>
                  <ThemedText type="defaultSemiBold" style={styles.roleName}>
                    {role.name}
                  </ThemedText>
                  <RoleStepper
                    value={currentCount}
                    min={min}
                    max={Math.max(min, max)}
                    onChange={(value) => handleRoleChange(role.id, value)}
                  />
                </View>
              );
            })}
          </View>

          {errorsToShow.length > 0 ? (
            <View style={styles.errorBox}>
              {errorsToShow.map((error, index) => (
                <ThemedText key={index} style={styles.errorText}>
                  • {error}
                </ThemedText>
              ))}
            </View>
          ) : null}

          <PrimaryButton
            label="Rollen zufällig verteilen"
            onPress={handleGenerate}
            disabled={!isReady}
            accessibilityHint="Erstellt das verdeckte Rollen-Deck und öffnet die passende Ansicht."
          />
        </ScrollView>
      </ThemedView>
      <Modal
        transparent
        animationType="fade"
        visible={infoRole !== null}
        onRequestClose={() => setInfoRole(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalScrollContainer}>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled>
                {infoRole ? <RoleCard role={infoRole} /> : null}
              </ScrollView>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setInfoRole(null)}
              style={({ pressed }) => [styles.modalClose, { opacity: pressed ? 0.7 : 1 }]}>
              <ThemedText style={styles.modalCloseLabel}>Schließen</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function RoleStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return <NumberStepper value={value} onChange={onChange} min={min} max={max} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: 24,
    gap: 28,
    paddingTop: 64,
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
  detail: {
    fontSize: 14,
    lineHeight: 20,
    color: '#e6ffee',
  },
  revealHint: {
    fontSize: 13,
    color: '#d8ffe8',
    lineHeight: 18,
  },
  revealInfo: {
    borderRadius: 20,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  roleCard: {
    width: '48%',
    maxWidth: '48%',
    flexBasis: '48%',
    borderRadius: 20,
    padding: 14,
    gap: 14,
    backgroundColor: 'rgba(9,16,28,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.24)',
    shadowColor: '#1fff76',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
    marginBottom: 16,
  },
  roleArtwork: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(135,255,134,0.35)',
    overflow: 'hidden',
    backgroundColor: 'rgba(135,255,134,0.12)',
    alignItems: 'center',
    padding: 6,
    shadowColor: '#3aff9d',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  roleImage: {
    width: '100%',
    height: 180,
  },
  roleArtworkFallback: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleFallbackLetter: {
    color: '#87ff86',
  },
  roleName: {
    textAlign: 'center',
  },
  errorBox: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,122,166,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,166,0.35)',
    gap: 4,
  },
  errorText: {
    color: '#ff9fbe',
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
    padding: 20,
    backgroundColor: 'rgba(9,16,28,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.28)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.3,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    flexShrink: 1,
    flexGrow: 0,
    minHeight: 0,
  },
  modalScrollContainer: {
    flex: 1,
    minHeight: 0,
    marginBottom: 18,
  },
  modalScroll: {
    flexGrow: 1,
    flexShrink: 1,
    width: '100%',
    maxHeight: '100%',
    minHeight: 0,
  },
  modalScrollContent: {
    paddingBottom: 18,
  },
  modalClose: {
    alignItems: 'center',
  },
  modalCloseLabel: {
    color: '#87ff86',
    fontSize: 14,
  },
});
