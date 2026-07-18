import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomNav } from '../../components/BottomNav';
import { IncomingInvitePrompt } from '../../components/IncomingInvitePrompt';
import { SafeBoundary } from '../../components/SafeBoundary';
import { AccentProvider } from '../../lib/accent';

// Custom animated tab bar (BottomNav). It shows Home · Live · Settings ·
// Profile; games & notifications stay as routes (reachable from the home cards
// and the header bell) but aren't shown in the bar. AccentProvider lets the
// home carousel re-theme the nav pill to match the focused game.
export default function TabsLayout() {
  // The global invite overlay must live inside a flex container alongside the
  // navigator — a bare sibling directly under the provider collapsed the
  // Tabs navigator's layout and blanked the screen (white screen on Back to
  // Home). The wrapping View gives the navigator its flex:1 and lets the
  // absolutely-positioned prompt float above it.
  return (
    <AccentProvider>
      <View style={{ flex: 1 }}>
        <Tabs
          tabBar={(props) => <BottomNav {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="home" />
          <Tabs.Screen name="live" />
          <Tabs.Screen name="games" />
          <Tabs.Screen name="notifications" />
          <Tabs.Screen name="settings" />
          <Tabs.Screen name="profile" />
        </Tabs>
        <SafeBoundary><IncomingInvitePrompt /></SafeBoundary>
      </View>
    </AccentProvider>
  );
}
