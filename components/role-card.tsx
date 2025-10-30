import { StyleSheet, View } from 'react-native';

import { type RoleDefinition } from '@/constants/roles';
import { useThemeColor } from '@/hooks/use-theme-color';

import { ThemedText } from './themed-text';

type RoleCardProps = {
  role: RoleDefinition;
};

const teamLabels: Record<RoleDefinition['team'], string> = {
  aliens: 'Team Alien',
  dorf: 'Team Dorf',
};

export function RoleCard({ role }: RoleCardProps) {
  const accent = useThemeColor({ light: '#87ff86', dark: '#87ff86' }, 'tint');
  const cardBg = useThemeColor({ light: 'rgba(7,16,28,0.88)', dark: 'rgba(7,16,28,0.88)' }, 'background');
  const border = useThemeColor({ light: 'rgba(135,255,134,0.28)', dark: 'rgba(135,255,134,0.28)' }, 'tint');
  const teamTextColor = '#041a0e';

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
      <View style={[styles.teamPill, { backgroundColor: accent }]}>
        <ThemedText style={[styles.teamText, { color: teamTextColor }]} type="defaultSemiBold">
          {teamLabels[role.team]}
        </ThemedText>
      </View>
      <ThemedText type="subtitle" style={styles.title}>
        {role.name}
      </ThemedText>
      <ThemedText style={styles.tagline}>{role.tagline}</ThemedText>
      <ThemedText style={styles.label} type="defaultSemiBold">
        Fähigkeit
      </ThemedText>
      <ThemedText style={styles.text}>{role.ability}</ThemedText>
      {role.nightAction ? (
        <>
          <ThemedText style={styles.label} type="defaultSemiBold">
            Nachtaktion
          </ThemedText>
          <ThemedText style={styles.text}>{role.nightAction}</ThemedText>
        </>
      ) : null}
      {role.dayAction ? (
        <>
          <ThemedText style={styles.label} type="defaultSemiBold">
            Tagsüber
          </ThemedText>
          <ThemedText style={styles.text}>{role.dayAction}</ThemedText>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#3aff9d',
    shadowOpacity: 0.32,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 24,
    elevation: 4,
    gap: 10,
  },
  teamPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 2,
    shadowColor: '#3aff9d',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
  },
  teamText: {
    fontSize: 12,
  },
  title: {
    marginTop: 4,
  },
  tagline: {
    fontSize: 14,
    opacity: 0.85,
  },
  label: {
    marginTop: 6,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
});
