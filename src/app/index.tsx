import { Redirect } from 'expo-router';

import { Loading } from '@/components/ui';
import { useAppLock } from '@/security/lock/AppLockProvider';

/** Âncora: toda mudança de estado do bloqueio volta para cá e é redirecionada. */
export default function Index() {
  const { status } = useAppLock();
  if (status === 'booting') return <Loading />;
  if (status === 'setup') return <Redirect href="/setup-pin" />;
  if (status === 'locked') return <Redirect href="/unlock" />;
  return <Redirect href="/home" />;
}
