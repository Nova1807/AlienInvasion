import { Stack } from 'expo-router';

export default function SetupLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="single/player-count" />
      <Stack.Screen name="single/names" />
      <Stack.Screen name="single/roles" />

      <Stack.Screen name="network/index" />
      <Stack.Screen name="network/host" />
      <Stack.Screen name="network/join" />
      <Stack.Screen name="network/roles" />
      <Stack.Screen name="network/reveal" />
    </Stack>
  );
}
