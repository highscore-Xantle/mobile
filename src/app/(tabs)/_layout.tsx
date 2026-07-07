import { Tabs } from 'expo-router';
import { BottomNav } from '../../components/BottomNav';

// Custom animated tab bar (BottomNav). It shows Home · Live · Settings ·
// Profile; games & notifications stay as routes (reachable from the home cards
// and the header bell) but aren't shown in the bar.
export default function TabsLayout() {
  return (
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
  );
}
