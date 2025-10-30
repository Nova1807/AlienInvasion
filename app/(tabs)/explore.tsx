import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { RoleCard } from '@/components/role-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { displayRoles, type RoleDefinition } from '@/constants/roles';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function RulesScreen() {
  const [selectedRole, setSelectedRole] = useState<RoleDefinition | null>(null);
  const alienPortrait = require('@/assets/images/Alien.jpg');

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <Image source={alienPortrait} style={styles.heroImage} accessibilityIgnoresInvertColors />
          <View style={styles.heroText}>
            <ThemedText type="title" style={styles.title}>
              Regeln & Rollen
            </ThemedText>
            <ThemedText style={styles.intro}>
              Kosmische Katzen, klare Mission: Lerne Siegbedingungen und Spezialkräfte in einem
              galaktischen Überblick kennen.
            </ThemedText>
          </View>
        </View>

        <Section title="Siegbedingungen">
          <ThemedText style={styles.body}>
            Das Dorf gewinnt, wenn alle Alienkatzen verbannt wurden. Die Alienkatzen gewinnen,
            sobald sie die Dorfkatzen zahlenmäßig einholen – dann übernehmen sie jedes Gerät im
            Dorf.
          </ThemedText>
        </Section>

        <Section title="Spielablauf">
          <ThemedText style={styles.body}>
            Nacht: Spezialrollen handeln nacheinander mit geschlossenen Augen. Tag: Das gesamte
            Dorf diskutiert, stimmt ab und versucht, Alienkatzen zu entlarven. Wiederhole, bis eine
            Seite gewinnt.
          </ThemedText>
        </Section>

        <Section title="Spezialrollen">
          <View style={styles.roleGrid}>
            {displayRoles.map((role) => (
              <RoleTile key={role.id} role={role} onPress={() => setSelectedRole(role)} />
            ))}
          </View>
        </Section>
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={selectedRole !== null}
        onRequestClose={() => setSelectedRole(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selectedRole ? <RoleCard role={selectedRole} /> : null}
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.modalClose, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setSelectedRole(null)}>
              <ThemedText style={styles.modalCloseLabel}>Schließen</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">{title}</ThemedText>
      {children}
    </View>
  );
}

function RoleTile({ role, onPress }: { role: RoleDefinition; onPress: () => void }) {
  const cardBg = useThemeColor({ light: 'rgba(9,16,28,0.9)', dark: 'rgba(9,16,28,0.9)' }, 'background');
  const badge = useThemeColor({ light: 'rgba(135,255,134,0.22)', dark: 'rgba(135,255,134,0.22)' }, 'tint');
  const badgeText = '#041a0e';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.roleTile,
        {
          backgroundColor: cardBg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={[styles.roleBadge, { backgroundColor: badge }]}>
        <ThemedText type="defaultSemiBold" style={[styles.roleInitial, { color: badgeText }]}>
          {role.name.charAt(0)}
        </ThemedText>
      </View>
      <ThemedText type="defaultSemiBold">{role.name}</ThemedText>
      <ThemedText style={styles.roleTagline}>{role.tagline}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    padding: 24,
    gap: 28,
    paddingBottom: 72,
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(9,16,28,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.28)',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#3aff9d',
    shadowOpacity: 0.25,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  heroGlow: {
    position: 'absolute',
    width: 320,
    height: 320,
    top: -200,
    right: -200,
    backgroundColor: 'rgba(135,255,134,0.18)',
    borderRadius: 320,
    opacity: 0.9,
    shadowColor: '#87ff86',
    shadowOpacity: 0.55,
    shadowRadius: 160,
    shadowOffset: { width: 0, height: 0 },
  },
  heroImage: {
    width: 180,
    height: 180,
    borderRadius: 140,
    borderWidth: 2,
    borderColor: 'rgba(135,255,134,0.45)',
  },
  heroText: {
    gap: 10,
  },
  title: {
    textAlign: 'center',
  },
  intro: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
    opacity: 0.88,
  },
  section: {
    gap: 12,
    borderRadius: 24,
    padding: 20,
    backgroundColor: 'rgba(9,16,28,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.22)',
    shadowColor: '#3aff9d',
    shadowOpacity: 0.22,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.9,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  roleTile: {
    flexBasis: '48%',
    maxWidth: '48%',
    flexGrow: 1,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(135,255,134,0.2)',
    shadowColor: '#1fff76',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  roleBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    shadowColor: '#1fff76',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  roleInitial: {
    color: '#041a0e',
    fontSize: 20,
  },
  roleTagline: {
    fontSize: 13,
    opacity: 0.75,
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
  modalClose: {
    alignItems: 'center',
  },
  modalCloseLabel: {
    color: '#87ff86',
    fontSize: 14,
  },
});
