import * as Sharing from 'expo-sharing';
import { Text, View } from 'react-native';

import { Badge, Button, Card, Loading, Muted, Screen } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { eventLogStats, recentEvents } from '@/db/repositories/event-log.repo';
import { dirs, freshFile } from '@/lib/files';
import { flush } from '@/logging/logger';
import { useTheme } from '@/theme';

const LEVEL_TONE = { debug: 'neutral', info: 'info', warn: 'warning', error: 'danger' } as const;

/** F-05: o log já é sanitizado na escrita; pode ser compartilhado com o autor do app. */
export default function Diagnostics() {
  const t = useTheme();
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
        {data?.stats?.rows ?? 0} eventos · {Math.round((data?.stats?.bytes ?? 0) / 1024)} KB (máx. 7 dias / 1 MB). Sem valores nem descrições
        de transações.
      </Muted>
      <Button title="Compartilhar log" icon="share" variant="secondary" onPress={share} />
      <Card style={{ gap: 0, padding: 0 }}>
        {data?.events.map((e, i) => (
          <View key={e.id} style={{ padding: 12, gap: 4, borderTopWidth: i ? 0.5 : 0, borderColor: t.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Badge label={e.level.toUpperCase()} tone={LEVEL_TONE[e.level]} />
              <Text style={{ color: t.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>{e.event}</Text>
            </View>
            <Text style={{ color: t.muted, fontSize: 12 }}>{new Date(e.ts).toLocaleString('pt-BR')}</Text>
            {e.context ? <Text style={{ color: t.muted, fontFamily: 'monospace', fontSize: 11 }}>{e.context}</Text> : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
