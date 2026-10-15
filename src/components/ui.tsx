import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  primary: '#2563EB',
  danger: '#DC2626',
  border: '#E5E7EB',
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => <Text style={styles.title}>{children}</Text>;
export const Muted = ({ children }: { children: ReactNode }) => <Text style={styles.muted}>{children}</Text>;
export const ErrorText = ({ children }: { children?: ReactNode }) =>
  children ? <Text style={styles.error}>{children}</Text> : null;

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} autoCapitalize="none" placeholderTextColor={colors.muted} {...props} />
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'secondary' ? colors.primary : '#FFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="button"
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function ListItem({ title, subtitle, onPress, right }: { title: string; subtitle?: string; onPress?: () => void; right?: ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.item}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export const Loading = () => (
  <View style={styles.center}>
    <ActivityIndicator />
  </View>
);

/** Campo de PIN: 6 dígitos, teclado numérico, sem autocomplete/sugestões. */
export function PinField({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Field
      label={label}
      value={value}
      onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
      keyboardType="number-pad"
      secureTextEntry
      autoFocus={autoFocus}
      autoComplete="off"
      textContentType="oneTimeCode"
      importantForAutofill="no"
      maxLength={6}
      style={[styles.input, styles.pin]}
    />
  );
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatCents = (cents: number) => brl.format(cents / 100);
export const formatDate = (iso: string) => iso.split('-').reverse().join('/');

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted },
  error: { color: colors.danger },
  field: { gap: 6 },
  label: { fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: colors.text },
  pin: { fontSize: 28, letterSpacing: 12, textAlign: 'center' },
  button: { borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { fontWeight: '600', fontSize: 16 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border, gap: 12 },
  itemTitle: { fontSize: 16, color: colors.text },
});
