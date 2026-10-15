import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { alpha, makeStyles, radius, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';

// ───────────────────────── Estrutura

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** telas sem cabeçalho de navegação (abas, bloqueio) precisam da margem do topo */
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll = true, edges = ['bottom'], contentStyle }: ScreenProps) {
  const s = useStyles();
  const body = <View style={[s.body, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView style={s.safe} edges={edges}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

/** Título grande das abas (estilo "large title"). */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={s.headerSubtitle}>{subtitle}</Text> : null}
        <Text style={s.headerTitle} accessibilityRole="header">{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const s = useStyles();
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && s.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

const GroupContext = createContext(false);

/** Lista agrupada num cartão, com separadores (ajustes, seleção de conta…). */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const s = useStyles();
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={s.groupTitle}>{title}</Text> : null}
      <View style={s.group}>
        <GroupContext.Provider value>
          {items.map((child, i) => (
            <View key={i}>
              {i > 0 && <View style={s.separator} />}
              {child}
            </View>
          ))}
        </GroupContext.Provider>
      </View>
      {footer ? <Text style={s.groupFooter}>{footer}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  const s = useStyles();
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={s.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ───────────────────────── Texto

export const Title = ({ children }: { children: ReactNode }) => <Text style={useStyles().title}>{children}</Text>;
export const Muted = ({ children, center }: { children: ReactNode; center?: boolean }) => (
  <Text style={[useStyles().muted, center && { textAlign: 'center' }]}>{children}</Text>
);

type Tone = 'info' | 'success' | 'warning' | 'danger';
const TONE_ICON: Record<Tone, IconName> = { info: 'info', success: 'checkCircle', warning: 'warning', danger: 'error' };

/** Aviso em caixa colorida com ícone. */
export function Notice({ tone = 'info', title, children, onPress }: { tone?: Tone; title?: string; children?: ReactNode; onPress?: () => void }) {
  const t = useTheme();
  const s = useStyles();
  const fg = { info: t.primary, success: t.success, warning: t.warning, danger: t.danger }[tone];
  const bg = { info: t.primarySoft, success: t.successSoft, warning: t.warningSoft, danger: t.dangerSoft }[tone];
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.notice, { backgroundColor: bg }, pressed && s.pressed]}>
      <Icon name={TONE_ICON[tone]} size={20} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={[s.noticeTitle, { color: t.text }]}>{title}</Text> : null}
        {children ? <Text style={s.noticeText}>{children}</Text> : null}
      </View>
      {onPress ? <Icon name="chevronRight" size={16} color={t.muted} /> : null}
    </Pressable>
  );
}

export const ErrorText = ({ children }: { children?: ReactNode }) => (children ? <Notice tone="danger">{children}</Notice> : null);

export function Badge({ label, tone = 'info' }: { label: string; tone?: Tone | 'neutral' }) {
  const t = useTheme();
  const fg = { info: t.primary, success: t.success, warning: t.warning, danger: t.danger, neutral: t.muted }[tone];
  const bg = { info: t.primarySoft, success: t.successSoft, warning: t.warningSoft, danger: t.dangerSoft, neutral: t.surfaceAlt }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Valor monetário: entradas em verde com "+", saídas na cor do texto. */
export function Amount({ cents, size = 16, strong = true, neutral }: { cents: number; size?: number; strong?: boolean; neutral?: boolean }) {
  const t = useTheme();
  const positive = cents > 0;
  return (
    <Text
      style={{
        fontSize: size,
        fontWeight: strong ? '700' : '500',
        color: neutral ? t.text : positive ? t.success : t.text,
        fontVariant: ['tabular-nums'],
      }}
      numberOfLines={1}
    >
      {positive && !neutral ? '+' : ''}
      {formatCents(cents)}
    </Text>
  );
}

// ───────────────────────── Ícones

export function IconBadge({ name, color, size = 40, soft = true }: { name: IconName; color?: string; size?: number; soft?: boolean }) {
  const t = useTheme();
  const c = color ?? t.primary;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: soft ? alpha(c, t.dark ? 0.2 : 0.13) : c,
      }}
    >
      <Icon name={name} size={size * 0.5} color={soft ? c : '#FFF'} />
    </View>
  );
}

// ───────────────────────── Entrada

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  const s = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        placeholderTextColor={t.faint}
        selectionColor={t.primary}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[s.input, focused && { borderColor: t.primary, backgroundColor: t.surface }, props.style]}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  small?: boolean;
};

export function Button({ title, onPress, loading, disabled, variant = 'primary', icon, small }: ButtonProps) {
  const t = useTheme();
  const s = useStyles();
  const bg = { primary: t.primary, secondary: t.primarySoft, danger: t.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? t.primary : '#FFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[s.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Controle segmentado (filtros). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[s.segment, active && { backgroundColor: t.surface, shadowOpacity: t.dark ? 0 : 0.08 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[s.segmentText, active && { color: t.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────────────────── Listas

type ListItemProps = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  icon?: IconName;
  iconColor?: string;
  /** mostra a seta (padrão: quando há onPress e nada à direita) */
  chevron?: boolean;
  destructive?: boolean;
  selected?: boolean;
};

export function ListItem({ title, subtitle, onPress, right, icon, iconColor, chevron, destructive, selected }: ListItemProps) {
  const t = useTheme();
  const s = useStyles();
  const inGroup = useContext(GroupContext);
  const showChevron = chevron ?? (!!onPress && !right && selected === undefined);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        s.item,
        !inGroup && s.itemStandalone,
        selected && { borderColor: t.primary, backgroundColor: t.primarySoft },
        pressed && { backgroundColor: t.surfaceAlt },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={selected !== undefined ? { selected } : undefined}
    >
      {icon ? <IconBadge name={icon} color={destructive ? t.danger : iconColor} size={36} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.itemTitle, destructive && { color: t.danger }]} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={s.itemSubtitle} numberOfLines={3}>{subtitle}</Text> : null}
      </View>
      {right}
      {selected !== undefined ? (
        <View style={[s.radio, selected && { borderColor: t.primary, backgroundColor: t.primary }]}>
          {selected ? <Icon name="check" size={14} color="#FFF" /> : null}
        </View>
      ) : null}
      {showChevron ? <Icon name="chevronRight" size={16} color={t.faint} /> : null}
    </Pressable>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.empty}>
      <IconBadge name={icon} size={64} />
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={[s.muted, { textAlign: 'center' }]}>{text}</Text> : null}
      {action ? <View style={{ alignSelf: 'stretch', marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

/** Indicador de etapas do assistente de importação. */
export function Steps({ current, labels }: { current: number; labels: string[] }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {labels.map((_, i) => (
          <View key={i} style={[s.step, { backgroundColor: i < current ? t.primary : t.border }]} />
        ))}
      </View>
      <Text style={s.stepLabel}>
        Etapa {current} de {labels.length} · <Text style={{ color: t.text, fontWeight: '700' }}>{labels[current - 1]}</Text>
      </Text>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }]}>
      <ActivityIndicator color={t.primary} size="large" />
    </View>
  );
}

/** Campo de PIN: 6 dígitos, teclado numérico, sem autocomplete/sugestões. */
export function PinField({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const s = useStyles();
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
      style={s.pin}
    />
  );
}

// ───────────────────────── Formatação

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatCents = (cents: number) => brl.format(cents / 100);
export const formatDate = (iso: string) => iso.split('-').reverse().join('/');

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    body: { padding: 16, gap: 14 },
    pressed: { opacity: 0.85 },
    header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 8, paddingBottom: 4 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: t.text, letterSpacing: -0.8 },
    headerSubtitle: { fontSize: 14, color: t.muted, fontWeight: '600', marginBottom: 2 },
    card: {
      backgroundColor: t.surface,
      borderRadius: radius.lg,
      padding: 16,
      gap: 12,
      borderWidth: t.dark ? StyleSheet.hairlineWidth : 0,
      borderColor: t.border,
      shadowColor: t.shadow,
      shadowOpacity: t.dark ? 0 : 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: t.dark ? 0 : 1,
    },
    group: {
      backgroundColor: t.surface,
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: t.dark ? StyleSheet.hairlineWidth : 0,
      borderColor: t.border,
    },
    groupTitle: { fontSize: 13, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 },
    groupFooter: { fontSize: 12, color: t.muted, paddingHorizontal: 4 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 16 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: t.text },
    link: { color: t.primary, fontWeight: '600' },
    title: { fontSize: 22, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
    muted: { color: t.muted, fontSize: 14, lineHeight: 20 },
    notice: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.md, alignItems: 'center' },
    noticeTitle: { fontWeight: '700', fontSize: 15 },
    noticeText: { color: t.muted, fontSize: 13, lineHeight: 18 },
    field: { gap: 6 },
    label: { fontWeight: '600', color: t.text, fontSize: 14 },
    hint: { color: t.muted, fontSize: 12 },
    input: {
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: t.surfaceAlt,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      color: t.text,
    },
    pin: { fontSize: 26, letterSpacing: 14, textAlign: 'center' },
    button: { borderRadius: radius.md, minHeight: 52, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    buttonSmall: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.sm },
    buttonText: { fontWeight: '700', fontSize: 16 },
    segmented: { flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: 4 },
    segment: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: radius.sm,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    segmentText: { fontWeight: '600', color: t.muted, fontSize: 14 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, gap: 12, backgroundColor: t.surface },
    itemStandalone: { borderRadius: radius.md, borderWidth: 1.5, borderColor: t.dark ? t.border : 'transparent' },
    itemTitle: { fontSize: 16, color: t.text, fontWeight: '600' },
    itemSubtitle: { fontSize: 13, color: t.muted, lineHeight: 18 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.faint, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: t.text, textAlign: 'center' },
    step: { flex: 1, height: 5, borderRadius: 3 },
    stepLabel: { color: t.muted, fontSize: 13 },
  }),
);
