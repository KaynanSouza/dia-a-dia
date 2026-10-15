import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';

/** Marca do app (telas de bloqueio/boas-vindas). */
export function BrandMark({ icon = 'wallet', title, subtitle }: { icon?: IconName; title: string; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={t.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
        <Icon name={icon} size={34} color="#FFF" />
      </LinearGradient>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: t.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  logo: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 21, paddingHorizontal: 12 },
});
