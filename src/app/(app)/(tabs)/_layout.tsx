import { Tabs } from 'expo-router';
import { StyleSheet, type ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { useTheme } from '@/theme';

const tabIcon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={24} color={color} />;
  };

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Início', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transações', tabBarIcon: tabIcon('list') }} />
      <Tabs.Screen name="bills" options={{ title: 'Contas', tabBarIcon: tabIcon('bills') }} />
      <Tabs.Screen name="import" options={{ title: 'Importar', tabBarIcon: tabIcon('import') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}
