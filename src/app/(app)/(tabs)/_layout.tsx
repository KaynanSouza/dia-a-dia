import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title: 'Início' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transações' }} />
      <Tabs.Screen name="import" options={{ title: 'Importar' }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
