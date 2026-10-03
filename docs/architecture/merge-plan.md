# План слияния систем (Merge Plan)

> **Статус документа:** Рабочий план интеграции  
> **Основание:** [ADR-001 (Целевая архитектура)](decisions/ADR-001-target-architecture.md)  
> **Принцип:** *Preserve behavior first. Refactor second.*

---

## 1. Обзор процесса слияния

Интеграция выполняется по строгому пошаговому алгоритму, гарантирующему работоспособность каждого промежуточного состояния:

```text
[ЭТАП 1: Подготовка окружения и структуры Monorepo]
  ├── Создание структуры apps/ (apps/api, apps/admin, apps/lab)
  ├── Создание packages/sdk (вынесение единого HubSDK)
  └── Создание корневого package.json с workspaces и единым lockfile

[ЭТАП 2: Миграция ToolHub Backend & Admin]
  ├── Перенос prisma/ и seed.ts
  ├── Перенос apps/api
  ├── Перенос apps/admin
  └── Перенос basic-toolpacks

[ЭТАП 3: Миграция Lab Studio]
  ├── Перенос src/ -> apps/lab/src/
  ├── Перенос public/ -> apps/lab/public/
  ├── Перенос конфигураций Vite, Tailwind, TSConfig
  └── Подключение apps/lab к общему SDK (@toolhub/sdk)

[ЭТАП 4: Интеграция единого Full Stack сервера]
  ├── Обновление Fastify API (apps/api/src/index.ts):
  │     - Обслуживание apps/lab/dist на маршруте /
  │     - Обслуживание apps/admin/dist на маршруте /admin/
  │     - Сохранение эндпоинтов /*, /prompt, /admin/api/*
  └── Настройка единого скрипта запуска (bun run dev / start)

[ЭТАП 5: Верификация и тестирование]
  ├── Повторение baseline проверок
  ├── Проверка сквозного ReAct цикла
  └── Составление финального отчёта
```

---

## 2. Что переносится, что объединяется, что остаётся на месте

### Что переносится:
1. **`toolhub/apps/api`** -> `apps/api` (Backend Fastify API).
2. **`toolhub/apps/admin`** -> `apps/admin` (Панель управления навыками ToolHub Admin).
3. **`toolhub/prisma`** -> `prisma` (Схема SQLite `schema.prisma` и сид `seed.ts`).
4. **`toolhub/basic-toolpacks`** -> `basic-toolpacks` (Предустановленные наборы инструментов: benchmark, meta-tools, sublime-text).
5. **`lab/src`** -> `apps/lab/src` (Пользовательский интерфейс AI Studio).
6. **`lab/public`** -> `apps/lab/public` (PWA-манифест, локали en/ru/zh, иконки).

### Что объединяется:
1. **`HubSDK`** (`toolhub/SDK/JS/sdk.ts` и `lab/src/lib/toolhubSdk.ts`):
   - Файлы идентичны побайтово.
   - Выносятся в `packages/sdk` (или `packages/sdk/src/index.ts`) как единый источник истины.
   - `apps/lab` и внешние клиенты импортируют один и тот же SDK.
2. **Корневой `package.json`:**
   - Объединяет скрипты управления: `dev`, `build`, `build:all`, `db:generate`, `db:push`, `db:seed`, `lint`, `typecheck`.
   - Настраивает `workspaces: ["apps/*", "packages/*"]`.
3. **Единый Bun Lockfile (`bun.lock`):**
   - Гарантирует согласованность версий React, Vite, Tailwind и Fastify во всех модулях.

### Что остаётся независимым (внутреннее разделение):
1. **Базы данных:**
   - `hub.db` (серверный SQLite) хранит инструменты, раннеры и логи.
   - `LabDB` (клиентский IndexedDB) хранит персональные диалоги и настройки пользователя в браузере.
   - Данные не смешиваются, обеспечивая приватность и архитектурную чистоту.

---

## 3. Таблица миграции путей (Migration Map)

| Исходный путь | Новый путь | Назначение / Причина |
|---|---|---|
| `toolhub/package.json` | `package.json` | Корневой манифест объединённого монорепозитория |
| `toolhub/prisma/schema.prisma` | `prisma/schema.prisma` | Схема БД SQLite ToolHub |
| `toolhub/prisma/seed.ts` | `prisma/seed.ts` | Инициализатор настроек и раннеров |
| `toolhub/basic-toolpacks/` | `basic-toolpacks/` | Базовые тулпаки |
| `toolhub/SDK/JS/sdk.ts` | `packages/sdk/src/index.ts` | Единый разделяемый HubSDK |
| `toolhub/apps/api/` | `apps/api/` | Fastify backend API сервер |
| `toolhub/apps/admin/` | `apps/admin/` | React SPA панель администратора ToolHub |
| `lab/package.json` | `apps/lab/package.json` | Манифест зависимостей клиента Lab |
| `lab/vite.config.ts` | `apps/lab/vite.config.ts` | Сборка клиента Lab с PWA |
| `lab/src/` | `apps/lab/src/` | Исходный код Lab AI Studio |
| `lab/public/` | `apps/lab/public/` | Статика и локали Lab |
| `lab/src/lib/toolhubSdk.ts` | `apps/lab/src/lib/toolhubSdk.ts` | Реэкспорт из единого SDK (для 100% обратной совместимости) |

---

## 4. Разрешение конфликтов окружения и зависимостей

1. **Версии React:**
   - В ToolHub Admin: `react` ^19.2.4
   - В Lab: `react` ^19.2.6
   - **Решение:** Унификация на `react` ^19.2.6 (обеспечивает 100% совместимость).
2. **Сборщик Vite:**
   - В ToolHub Admin: `vite` ^8.0.4
   - В Lab: `vite` ^8.0.12
   - **Решение:** Унификация на `vite` ^8.0.14.
3. **Tailwind CSS:**
   - Оба фронтенда используют Tailwind CSS v3 с PostCSS и `autoprefixer`. Конфликт отсутствует.
4. **Конфликт переменных окружения:**
   - ToolHub API использует `PORT` (по умолчанию 3000), `HOST` (0.0.0.0), `DATABASE_URL` (опционально, default `file:../hub.db`).
   - Lab работает со стандартными клиентскими переменными `VITE_*` (опционально).
   - Объединённый `.env.example` агрегирует все переменные без коллизий.
