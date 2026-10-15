import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseAmountCents } from '@/core/parsing/values';
import type { Category } from '@/db/repositories/finance.repo';
import { addDays, parseISODate, todayLocal, type ISODate } from '@/services/recurrence/dates';
import { makeStyles, useTheme } from '@/theme';
import { CategoryPicker } from './CategoryPicker';
import { Icon, categoryIcon, type IconName } from './Icon';
import { IconBadge } from './ui';

const brl = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centavos ↔ texto "1.234,56". Digitação estilo app de banco: os dígitos entram pela direita. */
export const centsToInput = (c: number | null) => (c ? brl.format(c / 100) : '');
export const inputToCents = (s: string) => {
  const v = parseAmountCents(s);
  return v === null ? null : Math.abs(v);
};

export function AmountInput({ label, cents, onChange, tone, autoFocus }: { label: string; cents: number | null; onChange: (c: number | null) => void; tone?: 'income' | 'expense'; autoFocus?: boolean }) {
  const t = useTheme();
  const s = useStyles();
  const color = tone === 'income' ? t.success : tone === 'expense' ? t.text : t.text;
  return (
    <View style={s.amountWrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.amountRow}>
        <Text style={[s.currency, { color: t.muted }]}>R$</Text>
        <TextInput
          value={centsToInput(cents)}
          onChangeText={(txt) => {
            const digits = txt.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11);
            onChange(digits ? Number(digits) : null);
          }}
          keyboardType="number-pad"
          placeholder="0,00"
          placeholderTextColor={t.faint}
          selectionColor={t.primary}
          autoFocus={autoFocus}
          style={[s.amountInput, { color }]}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

const fmtDate = (iso: ISODate) => {
  const { y, m, d } = parseISODate(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
};

/** Data: atalhos (hoje/ontem) + seletor nativo do sistema. */
export function DateField({ label, value, onChange, shortcuts = true }: { label: string; value: ISODate; onChange: (d: ISODate) => void; shortcuts?: boolean }) {
  const t = useTheme();
  const s = useStyles();
  const [iosOpen, setIosOpen] = useState(false);
  const today = todayLocal();
  const asDate = () => {
    const { y, m, d } = parseISODate(value);
    return new Date(y, m - 1, d, 12);
  };
  const fromDate = (d?: Date) => d && onChange(todayLocal(d));

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: asDate(), mode: 'date', onChange: (e, d) => e.type === 'set' && fromDate(d) });
    } else setIosOpen((v) => !v);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pressable onPress={open} style={[s.dateBtn, { flexGrow: 1 }]} accessibilityRole="button" accessibilityLabel={`${label}: ${fmtDate(value)}`}>
          <Icon name="calendar" size={18} color={t.primary} />
          <Text style={s.dateText}>{fmtDate(value)}</Text>
        </Pressable>
        {shortcuts && (
          <>
            <Chip label="Hoje" active={value === today} onPress={() => onChange(today)} />
            <Chip label="Ontem" active={value === addDays(today, -1)} onPress={() => onChange(addDays(today, -1))} />
          </>
        )}
      </View>
      {Platform.OS === 'ios' && iosOpen && (
        <DateTimePicker value={asDate()} mode="date" display="inline" onChange={(_, d) => fromDate(d)} accentColor={t.primary} />
      )}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, active && { backgroundColor: t.primary, borderColor: t.primary }]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      {icon ? <Icon name={icon} size={14} color={active ? '#FFF' : t.muted} /> : null}
      <Text style={[s.chipText, active && { color: '#FFF' }]}>{label}</Text>
    </Pressable>
  );
}

/** Escolha única em chips roláveis. */
export function ChipSelect<T extends string | number>({ label, options, value, onChange }: { label?: string; options: { id: T; label: string; icon?: IconName }[]; value: T | null; onChange: (v: T) => void }) {
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => (
          <Chip key={String(o.id)} label={o.label} icon={o.icon} active={o.id === value} onPress={() => onChange(o.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Categoria: linha compacta que expande a árvore completa. */
export function CategorySelect({ label = 'Categoria', categories, value, onChange, allowAuto }: { label?: string; categories: Category[]; value: string | null; onChange: (id: string | null) => void; allowAuto?: boolean }) {
  const t = useTheme();
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const cur = value ? byId.get(value) : undefined;
  let root = cur;
  while (root?.parent_id) root = byId.get(root.parent_id);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable onPress={() => setOpen((v) => !v)} style={s.select} accessibilityRole="button">
        <IconBadge name={cur ? categoryIcon(root?.id) : allowAuto ? 'sparkles' : 'tag'} color={cur?.color ?? root?.color ?? t.primary} size={34} />
        <Text style={[s.selectText, !cur && { color: t.muted }]}>{cur?.name ?? (allowAuto ? 'Automática' : 'Escolher')}</Text>
        <Icon name={open ? 'chevronLeft' : 'chevronRight'} size={16} color={t.faint} />
      </Pressable>
      {open && (
        <View style={{ gap: 8 }}>
          {allowAuto && <Chip label="Automática (pela descrição)" icon="sparkles" active={!value} onPress={() => { onChange(null); setOpen(false); }} />}
          <CategoryPicker categories={categories} selected={value} onSelect={(id) => { onChange(id); setOpen(false); }} />
        </View>
      )}
    </View>
  );
}

export function FormSection({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <View style={s.section}>{children}</View>;
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    label: { fontWeight: '600', color: t.text, fontSize: 14 },
    amountWrap: { gap: 4, alignItems: 'center', paddingVertical: 8 },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    currency: { fontSize: 24, fontWeight: '700' },
    amountInput: { fontSize: 40, fontWeight: '800', minWidth: 140, textAlign: 'center', letterSpacing: -1, paddingVertical: 4, fontVariant: ['tabular-nums'] },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
    dateText: { color: t.text, fontSize: 16, fontWeight: '600' },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
    chipText: { color: t.text, fontWeight: '600', fontSize: 14 },
    select: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surfaceAlt, borderRadius: 14, padding: 10 },
    selectText: { flex: 1, color: t.text, fontSize: 16, fontWeight: '600' },
    section: { backgroundColor: t.surface, borderRadius: 20, padding: 16, gap: 16, borderWidth: t.dark ? StyleSheet.hairlineWidth : 0, borderColor: t.border },
  }),
);
