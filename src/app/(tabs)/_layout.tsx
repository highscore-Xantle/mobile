import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { colors, font } from '../../theme';

// ─── Tab icon helper ──────────────────────────────────────────────────────────
type FAIconName = React.ComponentProps<typeof FontAwesome>['name'];

function TabIcon({ name, focused }: { name: FAIconName; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <FontAwesome
        name={name}
        size={20}
        color={focused ? colors.blue : colors.textFaint}
      />
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: styles.tabLabel,
        // Shift the label down slightly to sit flush with the icon
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          tabBarIcon: ({ focused }) => <TabIcon name="rss" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="gamepad" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="bell" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon name="cog" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.hairline,
    borderTopWidth: 1,
    // Extra height so the labels don't feel cramped
    height: 68,
    paddingBottom: 10,
    paddingTop: 6,
  },
  tabItem: {
    gap: 4,
  },
  tabLabel: {
    fontFamily: font.bold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  iconWrap: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(59,157,231,0.12)',
  },
});
