import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { PresenceProvider } from '../lib/usePresence';
import { IncomingInvitePrompt } from '../components/IncomingInvitePrompt';
import { SafeBoundary } from '../components/SafeBoundary';
import { installWebAlertShim } from '../lib/confirm';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync();
// Must run before any screen can call Alert.alert — on web the built-in is a
// silent no-op and every error/notice in the app was invisible.
installWebAlertShim();

// Root navigator. Loads the type system before showing anything, so text never
// flashes in a fallback face: Space Grotesk (display/headings/numerics) + Inter
// (all UI text). See ../theme.ts. Routes: index (landing) -> login -> ...
export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Web (SPA) only: the default document <body> is white, so mobile browsers
  // flash white when the page rubber-bands past the app. +html.tsx is ignored
  // in single-output mode, so set it at runtime instead.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor = colors.bg;
    document.body.style.backgroundColor = colors.bg;
    (document.documentElement.style as any).overscrollBehavior = 'none';
    (document.body.style as any).overscrollBehavior = 'none';
  }, []);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <PresenceProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'fade',
          }}
        />
        {/* Global invite listener — floats over every route (it self-hides on
            /game and /room). Boundary so a realtime hiccup can't blank the app. */}
        <SafeBoundary><IncomingInvitePrompt /></SafeBoundary>
      </PresenceProvider>
    </GestureHandlerRootView>
  );
}
