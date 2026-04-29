import { Image, StyleSheet, View } from 'react-native';
import { useMemo } from 'react';

import { type RoleDefinition } from '@/constants/roles';
import { RoleArtworks } from '@/constants/role-artwork';
import { TeamColors } from '@/constants/theme';
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
  const cardBg = useThemeColor({ light: 'rgba(7,16,28,0.88)', dark: 'rgba(7,16,28,0.88)' }, 'background');
  const teamColor = TeamColors[role.team];
  const teamTextColor = role.team === 'aliens' ? '#2a0012' : '#041a0e';

  const artworkSource = useMemo(() => {
    const artworks = RoleArtworks[role.id] ?? [];
    if (artworks.length === 0) {
      return null;
    }
    if (artworks.length === 1) {
      return artworks[0];
    }
    const index = Math.floor(Math.random() * artworks.length);
    return artworks[index];
  }, [role.id]);

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: teamColor.border, shadowColor: teamColor.primary }]}>
      <View style={[styles.teamPill, { backgroundColor: teamColor.primary, shadowColor: teamColor.primary }]}>
        <ThemedText style={[styles.teamText, { color: teamTextColor }]} type="defaultSemiBold">
          {teamLabels[role.team]}
        </ThemedText>
      </View>
      {artworkSource ? (
        <View
          style={[
            styles.artworkFrame,
            {
              borderColor: teamColor.primary,
              shadowColor: teamColor.primary,
              backgroundColor: teamColor.bg,
            },
          ]}>
          <Image
            source={artworkSource}
            style={styles.artwork}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}
      <ThemedText type="subtitle" style={[styles.title, { color: teamColor.primary }]}>
        {role.name}
      </ThemedText>
      <ThemedText style={styles.tagline}>{role.tagline}</ThemedText>
      <ThemedText style={[styles.label, { color: teamColor.primary }]} type="defaultSemiBold">
        Fähigkeit
      </ThemedText>
      <ThemedText style={styles.text}>{role.ability}</ThemedText>
      {role.nightAction ? (
        <>
          <ThemedText style={[styles.label, { color: teamColor.primary }]} type="defaultSemiBold">
            Nachtaktion
          </ThemedText>
          <ThemedText style={styles.text}>{role.nightAction}</ThemedText>
        </>
      ) : null}
      {role.dayAction ? (
        <>
          <ThemedText style={[styles.label, { color: teamColor.primary }]} type="defaultSemiBold">
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
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
  },
  artworkFrame: {
    borderRadius: 24,
    borderWidth: 2,
    padding: 10,
    marginTop: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.32,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 28,
    elevation: 6,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  artwork: {
    width: '100%',
    height: 260,
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
