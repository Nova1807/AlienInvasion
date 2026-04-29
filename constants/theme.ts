/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#87ff86';
const tintColorDark = '#87ff86';

export const Colors = {
  light: {
    text: '#e9ffe7',
    background: '#05070f',
    tint: tintColorLight,
    icon: '#9fffd6',
    tabIconDefault: '#4b5a6f',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#e9ffe7',
    background: '#05070f',
    tint: tintColorDark,
    icon: '#9fffd6',
    tabIconDefault: '#4b5a6f',
    tabIconSelected: tintColorDark,
  },
};

export const TeamColors = {
  aliens: {
    primary: '#ff5a7e',
    glow: 'rgba(255,90,126,0.3)',
    border: 'rgba(255,90,126,0.35)',
    bg: 'rgba(255,90,126,0.08)',
  },
  dorf: {
    primary: '#87ff86',
    glow: 'rgba(135,255,134,0.3)',
    border: 'rgba(135,255,134,0.35)',
    bg: 'rgba(135,255,134,0.08)',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
