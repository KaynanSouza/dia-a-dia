import * as Sharing from 'expo-sharing';
import { Text } from 'react-native';

import { Button, Loading, Muted, Screen, colors } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { eventLogStats, recentEvents } from '@/db/repositories/event-log.repo';
import { dirs, freshFile } from '@/lib/files';
import { flush } from '@/logging/logger';

const LEVEL_COLOR = { debug: colors.muted, info: colors.text, warn: '#B45309', error: colors.danger } as const;

/** F-05: o log já é sanitizado na escrita; pode ser compartilhado com o autor do app. */
export default function Diagnostics() {
  const { db } = useDb();
  const { data, loading } = useDbQuery(async (d) => {
    await flush(d);
    return { events: await recentEvents(d, 200), stats: await eventLogStats(d) };
  });

  if (loading && !data) return <Loading />;

  const share = async () => {
    const all = await recentEvents(db, 5000);
    const f = freshFile(dirs.dataExport(), `dia-a-dia-diagnostico-${Date.now()}.jsonl`);
    f.write(all.map((e) => JSON.stringify(e)).join('\n'));
    await Sharing.shareAsync(f.uri, { mimeType: 'application/json' });
  };

  return (
    <Screen>
      <Muted>
        {data?.stats?.rows ?? 0} eventos · {Math.round((data?.stats?.bytes ?? 0) / 1024)} KB (máx. 7 dias / 1 MB)
      </Muted>
      <Button title="Compartilhar log" variant="secondary" onPress={share} />
      {data?.events.map((e) => (
        <Text key={e.id} style={{ color: LEVEL_COLOR[e.level], fontFamily: 'monospace', fontSize: 12 }}>
          {new Date(e.ts).toLocaleString('pt-BR')} {e.level.toUpperCase()} {e.event} {e.context ?? ''}
        </Text>
      ))}
    </Screen>
  );
}
