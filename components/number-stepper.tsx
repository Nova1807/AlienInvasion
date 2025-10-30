import { Pressable, StyleSheet, View } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

import { ThemedText } from './themed-text';

type NumberStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
};

export function NumberStepper({ value, onChange, min = 0, max, label }: NumberStepperProps) {
  const border = useThemeColor({ light: 'rgba(135,255,134,0.3)', dark: 'rgba(135,255,134,0.3)' }, 'tint');
  const accent = useThemeColor({ light: '#87ff86', dark: '#87ff86' }, 'tint');

  const handlePress = (delta: number) => {
    const next = value + delta;
    if (next < min) return;
    if (typeof max === 'number' && next > max) return;
    onChange(next);
  };

  return (
    <View style={[styles.container, { borderColor: border }]}>
      {label ? (
        <ThemedText type="defaultSemiBold" style={styles.label}>
          {label}
        </ThemedText>
      ) : null}
      <Pressable
        accessibilityLabel="Weniger"
        onPress={() => handlePress(-1)}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}>
        <ThemedText style={styles.symbol}>−</ThemedText>
      </Pressable>
      <ThemedText type="defaultSemiBold" style={styles.value}>
        {value}
      </ThemedText>
      <Pressable
        accessibilityLabel="Mehr"
        onPress={() => handlePress(1)}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}>
        <ThemedText style={[styles.symbol, { color: accent }]}>＋</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(9,16,28,0.9)',
    shadowColor: '#1fff76',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    gap: 12,
  },
  label: {
    flex: 1,
  },
  button: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  symbol: {
    fontSize: 24,
    lineHeight: 24,
  },
  value: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 18,
  },
});
