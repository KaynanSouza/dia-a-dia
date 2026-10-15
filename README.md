# Dia a Dia

Finanças pessoais **local-first**: Expo SDK 57 + Expo Router, 100% offline. Sem conta, sem servidor.

## Rodar

```bash
npm install
npx expo run:android   # ou run:ios — SQLCipher, biometria e SecureStore exigem dev build (não funciona no Expo Go)
```

`npm run typecheck` · `npx expo-doctor`

## Segurança (Épico 1)

| Requisito | Onde |
|---|---|
| Bloqueio por biometria/PIN, timeout em background (padrão 1 min), atraso progressivo após 5 erros | `src/security/lock/` |
| PIN só como PBKDF2-SHA256 + sal no SecureStore | `src/security/pin/pin-hash.ts` |
| Screenshot/app switcher bloqueados | `src/security/privacy/PrivacyShield.tsx` |
| Banco SQLCipher (AES-256), chave gerada no 1º uso e guardada no Keystore/Keychain | `src/db/client.ts`, `src/security/keystore/db-key.ts` |
| `allowBackup: false` | `app.json` |
| CSV descartado após importação (retenção máx. 30 dias) | `src/import/` |
| Log local sanitizado, 7 dias / 1 MB | `src/logging/`, tabela `event_log` |
| Exportar (JSON + CSV) e apagar tudo | `src/data-rights/` |
| Backup `.diabkp`: Argon2id + AES-256-GCM, restore com validação de integridade/schema e rollback | `src/backup/` |
| Lembrete mensal de backup | `src/notifications/` |

## Importação e categorização (Épico 2)

| Requisito | Onde |
|---|---|
| Assistente upload → mapping → preview → progress | `src/app/(app)/import/` |
| Leitura em streaming (64 KB), UTF-8/CP1252, CSV incremental, limite 10 MB / 50k linhas | `src/import/stream/`, `src/import/limits.ts` |
| Processamento fatiado no tempo (UI não trava), cancelável | `src/import/scheduler.ts`, `src/import/analyze.ts` |
| Commit tudo-ou-nada, notificação se terminar em segundo plano | `src/import/commit.ts`, `src/import/job.ts` |
| Perfis embutidos (Nubank, Itaú, Bradesco, BB, Caixa, Inter) + perfis salvos | `src/import/profiles/` |
| Idempotência por hash, desfazer importação em 30 dias | `src/core/dedup/fingerprint.ts`, `src/import/undo.ts` |
| Categorização em 5 camadas (regras → normalização → dicionário → fuzzy → TF-IDF + Naive Bayes) | `src/categorization/` |
| "Aplicar a todas as parecidas" | `src/categorization/learn.ts` |
| Dashboard em SQL (visão mensal, DRE, top 10, comparativo), com reconciliação | `src/dashboard/` |

React Native não tem Web Workers: o parsing roda em fatias de ~8 ms no thread JS, cedendo o event loop entre elas, enquanto I/O de arquivo e SQLite já rodam em threads nativas.

## Estrutura

```
src/
├── app/            rotas: index (âncora) · (lock) setup-pin/unlock · (app) abas + settings
├── db/             client SQLCipher, schema/*.sql.ts, migrations (append-only, checksum), repositories
├── security/       keystore · biometrics · pin · lock (máquina de estados + useAppLock) · privacy
├── backup/         formato, KDF, export, restore
├── core/           parsing CSV, categorização por regras, deduplicação (TS puro, sem I/O)
├── import/         fluxo de importação + retenção
├── data-rights/    exportação e exclusão (F-04)
├── events/         barramento tipado em memória
├── logging/        bus → event_log (sanitize + rotação)
└── notifications/  agendamento derivado do banco
```

Migrações são **append-only**: nunca edite um arquivo em `src/db/schema/` já publicado; crie um novo e registre em `src/db/migrations/index.ts`.
