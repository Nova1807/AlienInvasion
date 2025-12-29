import { Pressable, StyleSheet } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

import { ThemedText } from './themed-text';

type PrimaryButtonProps = {
  label: string;
  onPress?: () => void;
  accessibilityHint?: string;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, accessibilityHint, disabled }: PrimaryButtonProps) {
  const accent = useThemeColor({ light: '#87ff86', dark: '#87ff86' }, 'tint');

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
  onPress={disabled || !onPress ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: accent,
          opacity: disabled ? 0.35 : pressed ? 0.9 : 1,
        },
      ]}>
      <ThemedText type="defaultSemiBold" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6bff99',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  label: {
    fontSize: 16,
    color: '#041a0e',
  },
});
