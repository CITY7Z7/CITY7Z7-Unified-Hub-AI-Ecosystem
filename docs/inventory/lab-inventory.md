# Инвентаризация исходного репозитория: Lab (🧪lab / labstudio.tech)

> **Исходный репозиторий:** `https://github.com/Talos-popcorn/lab`  
> **Версия:** `1.2.0`  
> **Лицензия:** GNU Affero General Public License v3.0 (AGPL-3.0)  
> **Основной рантайм:** Bun >= 1.2 / Node.js >= 20 (Client-Side SPA)  
> **Архитектурный шаблон:** Single-Page Application (React 19 + Vite 8 + Dexie.js)

---

## 1. Назначение и концепция

Lab (`🧪lab`) — легковесный, локально-ориентированный (local-first) веб-клиент и студия работы с большими языковыми моделями. Создан как бессерверная (zero-backend) альтернатива Open WebUI и Google AI Studio, работающая полностью внутри браузера пользователя.

Все пользовательские данные, включая ключи API, параметры генерации, сохранённые чаты и ветвления диалогов, хранятся локально в браузере в **IndexedDB** через библиотеку **Dexie.js**.

Ключевые отличительные особенности Lab:
1. **Surgical Context Control** — мониторинг токенов в реальном времени с поддержкой `js-tiktoken` (OpenAI/Groq/etc.) и нативного токенизатора Gemini (`@lenml/tokenizer-gemini`). Ручное закрепление важных сообщений (pinning), отсечение устаревших веток (prune) и схлопывание блоков кода.
2. **Chat Tree** — нелинейная история диалогов с ветвлением, переключением между альтернативными генерациями (браузер версий) и редактированием узлов дерева.
3. **Monaco Editor & LaTeX** — полноценный редактор кода VS Code внутри блоков кода с подсветкой синтаксиса и рендеринг математических формул через KaTeX.
4. **Voice Engine** — поддержка Push-To-Talk голосового ввода (STT) и потокового озвучивания ответов (TTS).
5. **Интеграция с ToolHub** — встроенный клиент `HubSDK`, перехват вызовов `<hub>listTools(...)` и `<hub>callTool(...)`, пошаговое выполнение цепочек ReAct и отображение шагов инструментов в UI.
6. **Интеграция с GraphMem** — клиент для семантической графовой памяти.

---

## 2. Структура директорий и файлов

```text
lab/
├── .gitignore
├── LICENSE                   # AGPL-3.0
├── README.md                 # Документация на EN со сравнением с Open WebUI
├── bun.lock                  # Lockfile Bun
├── package.json              # Зависимости и скрипты клиента
├── components.json           # Конфигурация компонентов shadcn/ui
├── eslint.config.js          # ESLint плоский конфиг
├── index.html                # Точка входа SPA
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── vite.config.ts            # Конфигурация Vite с PWA и оптимизацией чанков
├── public/                   # Статические ресурсы, PWA манифест, иконки
│   ├── langs/
│   │   ├── en.json           # Локализация English
│   │   ├── ru.json           # Локализация Русский
│   │   └── zh.json           # Локализация 中文
│   ├── site.webmanifest
│   └── favicon.*
└── src/
    ├── App.css / index.css
    ├── App.json              # Метаданные баннеров и ссылки (включая ссылку на ToolHub)
    ├── App.tsx               # Основной макет: Sidebar, ChatArea, ContextSidebar, SettingsModal
    ├── main.tsx
    ├── assets/
    ├── db/
    │   └── db.ts             # Схема Dexie.js (Chat, Message, ToolStep, Provider)
    ├── store/
    │   └── useChatStore.ts   # Монолитное Zustand-хранилище (1100+ строк): управление потоком генерации, ReAct-циклом, токенами
    ├── components/
    │   ├── ChatArea.tsx      # Область сообщений, рендеринг Markdown/KaTeX, шаги ToolHub
    │   ├── ChatInput.tsx     # Поле ввода, кнопка отправки, PTT микрофон
    │   ├── CodeBlock.tsx     # Интеграция Monaco Editor для сниппетов
    │   ├── ContextSidebar.tsx# Правая панель контекста, токен-метр, переключатели ToolHub/GraphMem
    │   ├── SettingsModal.tsx # Настройки провайдеров (Ollama, OpenAI, Groq, OpenRouter, Gemini), голоса
    │   ├── Sidebar.tsx       # Левая панель истории диалогов, виртуальные префикс-папки
    │   └── ui/
    │       └── button.tsx    # Radix UI Button
    └── lib/
        ├── chatTree.ts       # Алгоритмы обхода и поиска в дереве сообщений
        ├── graphmemSdk.ts    # Клиент базы знаний GraphMem
        ├── i18n.tsx          # Провайдер мультиязычности
        ├── toolhubSdk.ts     # HubSDK для связи с ToolHub API (идентичен SDK в ToolHub)
        ├── utils.ts          # Утилита cn (clsx + tailwind-merge)
        └── voiceEngine.ts    # Голосовой движок Web Speech / TTS
```

---

## 3. Клиентская база данных (Dexie: `src/db/db.ts`)

База данных IndexedDB носит имя `LabDB` и включает таблицы:
1. **`chats`**: Сохранённые диалоги. Ключи: `id`, `title`, `folder`, `model`, `providerId`, `systemPrompt`, `pinnedMessageIds`, `toolhubEnabled`, `toolhubDelay`, `graphmemEnabled`, `updatedAt`, `createdAt`.
2. **`messages`**: Узлы диалога. Поля: `id`, `chatId`, `parentId`, `role`, `content`, `tokens`, `toolSteps` (массив исполненных шагов инструментов), `isPinned`, `createdAt`.
3. **`providers`**: Настройки внешних AI провайдеров (URL, API-ключи, список моделей).

---

## 4. Движок ToolHub в Lab (`useChatStore.ts` + `toolhubSdk.ts`)

Внутри `useChatStore.ts`:
* Хранятся параметры подключения к ToolHub: `toolhubUrl` (по умолчанию `http://localhost:3001`), `toolhubPassword` (`123`), флаг `toolhubEnabled`.
* При включённом ToolHub перед отправкой диалога в LLM запрашивается системный промпт через `sdk.getSmartPrompt()`, который добавляется к системным инструкциям чата.
* В процессе стриминга ответа модели детектируется закрывающий тег `</hub>`. Если обнаружен тег `<hub>listTools(...)` или `<hub>callTool(...)`, стриминг приостанавливается, в `toolSteps` добавляется шаг, через `HubSDK` выполняется HTTP-запрос к ToolHub, результат сериализуется в виде `HUB_RESULT: ...`, добавляется в контекст, и генерация продолжается (автономный ReAct-цикл).
