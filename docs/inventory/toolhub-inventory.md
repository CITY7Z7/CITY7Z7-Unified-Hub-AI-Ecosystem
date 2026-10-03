# Инвентаризация исходного репозитория: ToolHub

> **Исходный репозиторий:** `https://github.com/Talos-popcorn/toolhub`  
> **Версия:** `1.0.0`  
> **Лицензия:** GNU Affero General Public License v3.0 (AGPL-3.0)  
> **Основной рантайм:** Bun >= 1.2 / Node.js >= 20  
> **Архитектурный шаблон:** Monorepo (Bun/npm workspaces: `apps/*`)

---

## 1. Назначение и концепция

ToolHub — высокопроизводительный, легковесный, локально-развёртываемый сервер оркестрации навыков и инструментов для LLM-агентов. Решает проблему перегрузки контекстных окон моделей сотнями статических JSON-схем за счёт предоставления виртуальной файловой системы навыков с динамической навигацией (`listTools`) и вызовом (`callTool`).

Поддерживает запуск скриптов на TypeScript, JavaScript, Python, Bash, Go, C++ без обязательной контейнеризации в Docker, а также бесшовный шлюз к Model Context Protocol (MCP) с пулом долгоживущих процессов и межсерверную федерацию.

---

## 2. Структура директорий и файлов

```text
toolhub/
├── .gitignore
├── LICENSE                   # AGPL-3.0
├── README.md                 # Документация на EN/RU/ZH со скриншотами
├── bun.lock                  # Lockfile Bun
├── package.json              # Корневой манифест monorepo с workspaces ["apps/*"]
├── hub.db                    # База данных SQLite (генерируется Prisma)
├── SDK/
│   └── JS/
│       ├── sdk.ts            # Клиентская библиотека HubSDK (TypeScript)
│       └── example.js        # Пример вызова инструментов через SDK
├── basic-toolpacks/          # Готовые наборы инструментов (дистрибутивные пакеты)
│   ├── benchmark/            # Бенчмарк-тулпак для измерения времени работы
│   ├── meta-tools/           # Мета-инструменты для интроспекции хаба
│   └── sublime-text/         # Плагин для Sublime Text и интеграция с IDE
├── prisma/
│   ├── schema.prisma         # Описание моделей SQLite (Category, Tool, Runner, etc.)
│   └── seed.ts               # Инициализатор базовых системных настроек и раннеров
└── apps/
    ├── api/                  # Backend-сервер Fastify
    │   ├── package.json
    │   └── src/
    │       ├── index.ts      # Основной монолитный сервер API (1942 строки кода)
    │       ├── mcp-helper.ts # Утилиты взаимодействия со stdio MCP серверами
    │       └── mcp-pool.ts   # Пул долгоживущих стейтфул процессов MCP
    └── admin/                # Веб-панель администратора на React 19 + Vite
        ├── index.html
        ├── package.json
        ├── vite.config.ts
        ├── tailwind.config.js
        └── src/
            ├── App.tsx       # Маршрутизатор админки, авторизация по паролю
            ├── main.tsx
            ├── pages/
            │   ├── Categories.tsx # Дерево категорий и редактор инструментов
            │   ├── Runners.tsx    # Среды выполнения скриптов
            │   ├── Processes.tsx  # Монитор активных MCP-процессов
            │   ├── Logs.tsx       # Журнал аудита вызовов инструментов
            │   └── Playground.tsx # Песочница для тестирования агентов
            ├── components/
            ├── locales/           # Языковые файлы (en, ru, zh)
            └── lib/
```

---

## 3. Модель данных (Prisma Schema: `hub.db`)

1. **`Category`**: Виртуальная папка в дереве навыков. Поля: `name`, `slug`, `fullPath` (уникальный путь, например `/system/files`), `parentId`, `appendPrompt`, `type` (`LOCAL`, `REMOTE`, `MCP`), параметры шлюза `remoteUrl`, `remoteToken`, `mcpCommand`, `mcpArgs`, `mcpEnv`, `mcpToolsCache`, `mcpIsStateful`.
2. **`Tool`**: Инструмент (навык). Поля: `name`, `slug`, `descriptionMd`, `agentDescription`, `code` (исходный текст скрипта), `packageJson` (зависимости инструмента), `inputSchema`, `outputSchema`, `examples`, `isActive`, `timeoutMs`, `runnerId`, флаги MCP (`isMcpProxy`, `mcpMethodName`, `mcpSourceId`).
3. **`Runner`**: Среда исполнения скриптов. Поля: `name`, `type` (`bun_local`, `bash_local`, `python_local` и т.д.), `config` (JSON с именами файлов, командами установки зависимостей и запуска).
4. **`ToolVersion`**: История изменений кода инструмента для отката (rollback).
5. **`ToolCategory`**: Связующая таблица Many-to-Many между инструментами и категориями.
6. **`SystemSetting`**: Глобальная конфигурация: `rootPrompt`, `rootAppendPrompt`, `agentSecret`, `adminPassword`, `maxLogRetention`.
7. **`ExecutionLog`**: Журнал вызовов: `path`, `durationMs`, `success`, `payload`, `result`, `error`, `callerIp`, `createdAt`.

---

## 4. Серверный API (Fastify: `apps/api`)

* **Агентские маршруты:**
  * `GET /*` — навигация агента по дереву навыков.
  * `POST /*` — исполнение указанного инструмента (запуск скрипта в `os.tmpdir()` или делегирование в MCP/Remote).
  * `GET /prompt` — выдача скомпилированного системного промпта с подстановкой корневых папок `{{AvailableResources}}`.
* **Административные маршруты (`/admin/api/*`):**
  * `POST /auth/verify` — валидация пароля админа.
  * `GET/POST/PUT/DELETE /categories` — управление каталогом.
  * `GET/POST/PUT/DELETE /tools` — CRUD инструментов, версионирование, откат.
  * `GET/POST/PUT/DELETE /runners` — конфигурация раннеров.
  * `GET/DELETE /logs` — просмотр и очистка логов выполнения.
  * `GET/DELETE /mcp/pool` — мониторинг и принудительное завершение зависших MCP процессов.
  * `GET /export/category/:id`, `GET /export/tool/:id`, `POST /import` — экспорт и импорт тулпаков (`.toolpack` JSON-архивы).
* **Статика и документация:**
  * `GET /admin/*` — раздача скомпилированной админки из `apps/admin/dist`.
  * `GET /docs` — Swagger UI документация OpenAPI.

---

## 5. Зависимости ToolHub

* **Корневые:** `@prisma/client` ^5.12.0, `ollama` ^0.6.3, `prisma` ^5.12.0, `concurrently` ^9.2.1.
* **API:** `fastify` ^4.26.2, `@fastify/cors` ^9.0.1, `@fastify/static` ^6.12.0, `@fastify/swagger` ^8.14.0, `@fastify/swagger-ui` ^3.0.0.
* **Admin UI:** `react` ^19.2.4, `react-dom` ^19.2.4, `react-router-dom` ^7.14.0, `@monaco-editor/react` ^4.7.0, `@radix-ui/*`, `tailwindcss` ^3.4, `lucide-react` ^1.8.0, `sonner` ^2.0.7.
