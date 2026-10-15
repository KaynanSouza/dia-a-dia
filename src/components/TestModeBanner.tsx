import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DB_ENCRYPTED } from '@/lib/runtime';

/** Aviso fixo quando o app roda no Expo Go: banco SEM criptografia, só para testes. */
export function TestModeBanner() {
  const insets = useSafeAreaInsets();
  if (DB_ENCRYPTED) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4 }]} accessibilityRole="alert">
      <Text style={styles.text}>MODO DE TESTE (Expo Go): dados sem criptografia. Não use dados reais.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#B45309', paddingHorizontal: 12, paddingBottom: 6 },
  text: { color: '#FFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
