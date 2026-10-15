import type { ColorValue } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

/** Ícones nativos: SF Symbols no iOS, Material Symbols no Android (ambos inclusos no Expo Go). */
const ICONS = {
  home: { ios: 'house.fill', android: 'home' },
  list: { ios: 'list.bullet.rectangle.portrait.fill', android: 'receipt_long' },
  import: { ios: 'square.and.arrow.down.fill', android: 'upload_file' },
  settings: { ios: 'gearshape.fill', android: 'settings' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left' },
  lock: { ios: 'lock.fill', android: 'lock' },
  shield: { ios: 'lock.shield.fill', android: 'shield_lock' },
  tag: { ios: 'tag.fill', android: 'sell' },
  backup: { ios: 'externaldrive.fill.badge.timemachine', android: 'backup' },
  share: { ios: 'square.and.arrow.up', android: 'ios_share' },
  pulse: { ios: 'waveform.path.ecg', android: 'monitor_heart' },
  trash: { ios: 'trash.fill', android: 'delete' },
  up: { ios: 'arrow.up.right', android: 'trending_up' },
  down: { ios: 'arrow.down.right', android: 'trending_down' },
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  error: { ios: 'xmark.octagon.fill', android: 'error' },
  info: { ios: 'info.circle.fill', android: 'info' },
  plus: { ios: 'plus', android: 'add' },
  biometric: { ios: 'faceid', android: 'fingerprint' },
  backspace: { ios: 'delete.left', android: 'backspace' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  doc: { ios: 'doc.text.fill', android: 'description' },
  card: { ios: 'creditcard.fill', android: 'credit_card' },
  bank: { ios: 'building.columns.fill', android: 'account_balance' },
  wallet: { ios: 'wallet.pass.fill', android: 'account_balance_wallet' },
  search: { ios: 'magnifyingglass', android: 'search' },
  close: { ios: 'xmark.circle.fill', android: 'cancel' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  timer: { ios: 'timer', android: 'timer' },
  bell: { ios: 'bell.fill', android: 'notifications' },
  key: { ios: 'key.fill', android: 'key' },
  restore: { ios: 'clock.arrow.circlepath', android: 'restore' },
  store: { ios: 'storefront.fill', android: 'storefront' },
  chart: { ios: 'chart.bar.fill', android: 'bar_chart' },
  pie: { ios: 'chart.pie.fill', android: 'pie_chart' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  bills: { ios: 'calendar.badge.clock', android: 'event_upcoming' },
  barcode: { ios: 'barcode', android: 'barcode' },
  edit: { ios: 'pencil', android: 'edit' },
  skip: { ios: 'forward.end.fill', android: 'skip_next' },
  repeat: { ios: 'repeat', android: 'repeat' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  battery: { ios: 'battery.100', android: 'battery_full' },
  alarm: { ios: 'alarm.fill', android: 'alarm' },
  eyeOff: { ios: 'eye.slash.fill', android: 'visibility_off' },
  moon: { ios: 'moon.fill', android: 'bedtime' },
  link: { ios: 'link', android: 'link' },
  // categorias raiz
  food: { ios: 'fork.knife', android: 'restaurant' },
  house: { ios: 'house.fill', android: 'home' },
  car: { ios: 'car.fill', android: 'directions_car' },
  health: { ios: 'cross.case.fill', android: 'medical_services' },
  fun: { ios: 'party.popper.fill', android: 'celebration' },
  subscription: { ios: 'play.rectangle.fill', android: 'subscriptions' },
  bag: { ios: 'bag.fill', android: 'shopping_bag' },
  tools: { ios: 'wrench.and.screwdriver.fill', android: 'build' },
  school: { ios: 'book.fill', android: 'school' },
  pets: { ios: 'pawprint.fill', android: 'pets' },
  receipt: { ios: 'doc.plaintext.fill', android: 'receipt' },
  cash: { ios: 'banknote.fill', android: 'payments' },
  more: { ios: 'ellipsis.circle.fill', android: 'more_horiz' },
  income: { ios: 'arrow.down.circle.fill', android: 'savings' },
  transfer: { ios: 'arrow.left.arrow.right', android: 'swap_horiz' },
  question: { ios: 'questionmark.circle.fill', android: 'help' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} resizeMode="scaleAspectFit" style={{ width: size, height: size }} />;
}

/** Ícone por categoria raiz (as do usuário caem em "tag"). */
const CATEGORY_ICON: Record<string, IconName> = {
  cat_alimentacao: 'food',
  cat_moradia: 'house',
  cat_transporte: 'car',
  cat_saude: 'health',
  cat_lazer: 'fun',
  cat_assinaturas: 'subscription',
  cat_compras: 'bag',
  cat_servicos: 'tools',
  cat_educacao: 'school',
  cat_pets: 'pets',
  cat_impostos: 'receipt',
  cat_saques: 'cash',
  cat_outros: 'more',
  cat_receitas: 'income',
  cat_transferencia: 'transfer',
  cat_pagamento_fatura: 'card',
};

export const categoryIcon = (rootId: string | null | undefined): IconName =>
  rootId ? (CATEGORY_ICON[rootId] ?? 'tag') : 'question';
