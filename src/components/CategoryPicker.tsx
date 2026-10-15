import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/db/repositories/finance.repo';
import { makeStyles, useTheme } from '@/theme';
import { Icon, categoryIcon } from './Icon';
import { IconBadge } from './ui';

/** Árvore achatada (pré-ordem): categorias raiz com ícone, subcategorias recuadas. */
export function CategoryPicker({ categories, selected, onSelect }: { categories: Category[]; selected: string | null; onSelect: (id: string) => void }) {
  const t = useTheme();
  const s = useStyles();
  const colorOf = new Map<string, string | null>();
  for (const c of categories) colorOf.set(c.id, c.color ?? (c.parent_id ? (colorOf.get(c.parent_id) ?? null) : null));
  const rootOf = (c: Category): string => {
    let cur: Category | undefined = c;
    while (cur?.parent_id) cur = categories.find((x) => x.id === cur!.parent_id);
    return cur?.id ?? c.id;
  };

  return (
    <View style={s.wrap}>
      {categories.map((c, i) => {
        const active = selected === c.id;
        const color = colorOf.get(c.id) ?? t.muted;
        return (
          <Pressable
            key={c.id}
            onPress={() => onSelect(c.id)}
            style={({ pressed }) => [
              s.item,
              i > 0 && c.depth === 0 && s.rootDivider,
              { paddingLeft: 14 + c.depth * 22 },
              active && { backgroundColor: t.primarySoft },
              pressed && !active && { backgroundColor: t.surfaceAlt },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {c.depth === 0 ? (
              <IconBadge name={categoryIcon(rootOf(c))} color={color} size={32} />
            ) : (
              <View style={[s.dot, { backgroundColor: color }]} />
            )}
            <Text style={[s.name, c.depth === 0 && s.root, active && { color: t.primary }]}>{c.name}</Text>
            {active && <Icon name="checkCircle" size={20} color={t.primary} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { backgroundColor: t.surface, borderRadius: 20, overflow: 'hidden', borderWidth: t.dark ? StyleSheet.hairlineWidth : 0, borderColor: t.border },
    item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingRight: 14 },
    rootDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 12 },
    name: { flex: 1, color: t.text, fontSize: 15 },
    root: { fontWeight: '700' },
  }),
);
