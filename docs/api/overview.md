# Спецификация API и протокол взаимодействия (API & Protocol Overview)

> **Статус документа:** Технический стандарт  
> **Сервер:** ToolHub Fastify Core  
> **Интерактивная документация:** `/docs` (Swagger UI)  
> **Машинно-читаемая схема:** `docs/api/openapi.json`

---

## 1. Протокол взаимодействия агентов (`<hub>...</hub>`)

Система ToolHub реализует специализированный потоковый протокол взаимодействия языковых моделей с инструментами. Вместо передачи сотен JSON-схем в тело системного промпта, агенту передаётся краткая инструкция с корневым списком категорий и правилами вызова.

### 1.1. Теги протокола
Все вызовы агента оформляются в виде XML-тегов:
* **Навигация по папкам:** `<hub>listTools("/path")</hub>`
* **Исполнение инструмента:** `<hub>callTool("/path/to/tool", {"argument": "value"})</hub>`

### 1.2. Правила для моделей
1. **Строго однострочный вызов:** Тег `<hub>...</hub>` не должен содержать неэкранированных переносов строк внутри аргументов.
2. **Один вызов за сообщение:** За одну генерацию допускается строго один тег `<hub>`.
3. **Терминальный токен:** Закрывающий тег `</hub>` является безусловным сигналом остановки генерации (Terminal Token). После него модель обязана немедленно остановить генерацию ответа.
4. **Формат ответа среды:** Результат вызова возвращается модели в следующей реплике со специальным маркером `HUB_RESULT: <JSON>`.

---

## 2. Ключевые эндпоинты сервера

### 2.1. Агентские эндпоинты (Agent API)

#### `GET /prompt`
* **Назначение:** Получение скомпилированного системного промпта ToolHub с подстановкой доступных корневых папок (`{{AvailableResources}}`).
* **Аутентификация:** Заголовок `x-agent-password`.
* **Ответ:**
  ```json
  {
    "prompt": "You are an elite autonomous engineer..."
  }
  ```

#### `GET /*` (Навигация)
* **Назначение:** Обход дерева категорий или получение описания инструментов внутри папки.
* **Пример:** `GET /system`
* **Аутентификация:** Заголовок `x-agent-password`.
* **Ответ (для папки с подпапками):**
  ```json
  {
    "path": "/system",
    "appendPrompt": "System utilities and tools",
    "categories": [
      { "name": "Files", "path": "/system/files" },
      { "name": "Processes", "path": "/system/processes" }
    ],
    "tools": []
  }
  ```
* **Ответ (для папки с инструментами):**
  ```json
  {
    "path": "/system/files",
    "tools": [
      {
        "name": "Read File",
        "path": "/system/files/read-file",
        "description": "Reads text content from file",
        "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } },
        "callExample": "<hub>callTool(\"/system/files/read-file\", {\"path\":\"/etc/hosts\"})</hub>"
      }
    ]
  }
  ```

#### `POST /*` (Вызов инструмента)
* **Назначение:** Выполнение указанного инструмента.
* **Пример:** `POST /system/files/read-file`
* **BODY:** `{"path": "/tmp/test.txt"}`
* **Аутентификация:** Заголовок `x-agent-password`.
* **Ответ:**
  ```json
  {
    "success": true,
    "durationMs": 14,
    "data": {
      "content": "file contents..."
    }
  }
  ```

---

## 3. Административные эндпоинты (`/admin/api/*`)

Все вызовы защищены заголовком `x-admin-password`.

* `POST /admin/api/auth/verify` — Проверка мастер-пароля админа.
* `GET /admin/api/categories` — Полное дерево категорий с инструментами.
* `POST /admin/api/categories` — Создание категории (LOCAL, REMOTE, MCP).
* `PUT /admin/api/categories/:id` — Обновление категории.
* `DELETE /admin/api/categories/:id` — Удаление категории.
* `GET /admin/api/tools` — Список всех инструментов.
* `POST /admin/api/tools` — Создание нового инструмента.
* `PUT /admin/api/tools/:id` — Обновление инструмента и сохранение версии в историю.
* `POST /admin/api/tools/:id/rollback/:versionId` — Откат инструмента к предыдущей версии.
* `GET /admin/api/runners` — Список зарегистрированных раннеров (Bun, Bash, Python, etc.).
* `GET /admin/api/logs` — Журнал аудита вызовов с фильтрацией и пагинацией.
* `GET /admin/api/mcp/pool` — Список активных процессов MCP и статус памяти.
* `DELETE /admin/api/mcp/pool/:catId` — Принудительное завершение зависшего MCP-процесса.
* `GET /admin/api/export/category/:id` — Экспорт категории в переносимый файл `.toolpack`.
* `POST /admin/api/import` — Импорт `.toolpack` архива.
