# Реестр миграции путей (Path Map)

> **Статус документа:** Нормативный реестр миграции файлов  
> **Формат:** `OLD PATH → NEW PATH → WHAT CHANGED → DEPENDENCIES AFFECTED → VERIFICATION`

---

| Исходный путь (OLD PATH) | Целевой путь (NEW PATH) | Что изменилось (WHAT CHANGED) | Затронутые зависимости (DEPENDENCIES AFFECTED) | Способ проверки (VERIFICATION) |
|---|---|---|---|---|
| `toolhub/apps/api/src/index.ts` | `apps/api/src/index.ts` | Добавлена регистрация раздачи статики Lab Studio на `/` параллельно с `/admin/` | Fastify, `@fastify/static` | `curl http://localhost:3000/` возвращает Lab HTML |
| `toolhub/apps/api/src/mcp-helper.ts` | `apps/api/src/mcp-helper.ts` | Перенос без изменений логики | Child process spawn, MCP stdio | Тест запуска MCP методов |
| `toolhub/apps/api/src/mcp-pool.ts` | `apps/api/src/mcp-pool.ts` | Перенос без изменений логики | MCP processes pool | Проверка очистки процессов в тестах |
| `toolhub/apps/admin/` | `apps/admin/` | Перенос в workspaces монорепозитория | React 19, Vite, Tailwind | `bun run build:admin` |
| `toolhub/prisma/schema.prisma` | `prisma/schema.prisma` | Перенос схемы в корень монорепозитория | Prisma Client | `bun run db:generate && bun run db:push` |
| `toolhub/prisma/seed.ts` | `prisma/seed.ts` | Перенос сида в корень монорепозитория | Prisma Client | `bun run db:seed` |
| `toolhub/basic-toolpacks/` | `basic-toolpacks/` | Перенос эталонных тулпаков | Runner engine | Импорт через Admin API |
| `toolhub/SDK/JS/sdk.ts` | `packages/sdk/src/index.ts` | Вынесение в единый пакет `@toolhub/sdk` | Никаких (код идентичен) | Тесты HubSDK |
| `lab/src/` | `apps/lab/src/` | Перенос исходников Lab Studio | React 19, Monaco, Dexie, Tiktoken | `bun run build:lab` |
| `lab/public/` | `apps/lab/public/` | Перенос статики Lab (манифест, локали) | PWA Plugin, i18n | Проверка загрузки `langs/en.json` |
| `lab/src/lib/toolhubSdk.ts` | `apps/lab/src/lib/toolhubSdk.ts` | Реэкспорт из единого SDK (`export * from '@toolhub/sdk'`) | `useChatStore.ts` | Полная совместимость всех импортов в Lab |
| `lab/vite.config.ts` | `apps/lab/vite.config.ts` | Адаптация под структуру монорепозитория | Vite 8, PWA | Сборка `dist/` клиента |
