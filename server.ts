/**
 * @license AGPL-3.0
 * server.ts - Единый Full Stack сервер Lab + ToolHub.
 * 
 * Назначение:
 * 1. Запуск оркестратора навыков ToolHub Core API на едином порту (по умолчанию 3000):
 *    - GET /prompt (генерация системного промпта со списком доступных ресурсов)
 *    - GET /* (навигация агента по дереву навыков, схемы input/output, примеры вызовов)
 *    - POST /* (исполнение инструментов агентом: Bun, Bash, Node, Python, MCP Stdio/Pool, Remote Federation)
 *    - /admin/api/* (управление категориями, инструментами, средами runners, пулом MCP, аудитом логов, импортом/экспортом)
 *    - /api/dialogs/* (поддержка протокола GraphMem для семантической графовой памяти)
 * 2. Монтирование интерфейса Lab AI Studio и ToolHub Admin:
 *    - В режиме разработки (dev) монтирует Vite middlewares для моментального HMR и загрузки UI.
 *    - В режиме продакшена раздаёт собранный бандл из директории dist/.
 * 3. Автоматическая самоинициализация (Auto-Seed):
 *    - При пустой базе данных автоматически применяет базовые настройки и импортирует базовые тулпаки из basic-toolpacks/.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';

import { callMcpStdio } from './apps/api/src/mcp-helper';
import { callMcpPooled, killMcpProcess, getPoolStatus, cleanupAllPoolProcesses } from './apps/api/src/mcp-pool';
import { HubSDK } from './packages/sdk/src/index';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Уникальный идентификатор текущего узла для защиты от петель федерации
const SERVER_NODE_ID = `hub_node_${Math.random().toString(36).substring(2, 9)}`;

// Настройка CORS для поддержки вызовов с любого источника и порта
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-agent-password', 'x-admin-password', 'accept', 'x-hub-nodes']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Транслитерация кириллицы для генерации безопасных путей (slugs)
const cyrillicMap: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

const slugify = (text: string, defaultSlug = 'item'): string => {
  if (!text) return defaultSlug;
  let str = text.toLowerCase().trim();
  str = str.split('').map(char => cyrillicMap[char] || char).join('');
  str = str.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return str || defaultSlug;
};

// Парсинг аргументов командной строки с учетом кавычек
const parseCommandArgs = (argsStr?: string | null): string[] => {
  if (!argsStr || !argsStr.trim()) return [];
  const match = argsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!match) return [];
  return match.map(arg => arg.replace(/^['"]|['"]$/g, ''));
};

const safeParseJson = (val: any, fallback: any = {}) => {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

const safeStringifyJson = (val: any, fallback: string = '{}') => {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch {
    return fallback;
  }
};

const normalizePath = (p: string): string => {
  if (!p) return '/';
  let decoded = decodeURIComponent(p).trim();
  if (!decoded.startsWith('/')) decoded = '/' + decoded;
  return decoded.replace(/\/+$/, '') || '/';
};

// Проверка аутентификации (открытый доступ для домашнего ПК)
const checkAgentAuth = async (_req: Request, _res: Response): Promise<boolean> => {
  return true;
};

const checkAdminAuth = async (_req: Request, _res: Response): Promise<boolean> => {
  return true;
};

// Извлечение чистого полезного содержимого из ответов протокола MCP
const extractMcpResponse = (response: any) => {
  if (!response) return null;
  if (response.result?.content && Array.isArray(response.result.content)) {
    const textItem = response.result.content.find((c: any) => c.type === 'text');
    if (textItem && typeof textItem.text === 'string') {
      try {
        return JSON.parse(textItem.text);
      } catch {
        return textItem.text;
      }
    }
    return response.result.content;
  }
  return response.result !== undefined ? response.result : response;
};

// Вызов MCP процесса (stateful через пул или stateless через stdio)
const callMcp = (cat: any, request: any) => {
  const mcpEnvParsed = safeParseJson(cat.mcpEnv, {});
  const args = parseCommandArgs(cat.mcpArgs);

  if (cat.mcpIsStateful) {
    return callMcpPooled(cat.id, cat.mcpCommand!, args, mcpEnvParsed, request);
  }
  return callMcpStdio(cat.mcpCommand!, args, mcpEnvParsed, request);
};

// Рекурсивный пересчет fullPath для всех дочерних категорий при перемещении
const updateChildCategoryPaths = async (parentId: number, parentFullPath: string) => {
  const children = await prisma.category.findMany({ where: { parentId } });
  for (const child of children) {
    const newFullPath = `${parentFullPath}/${child.slug}`.replace(/\/+/g, '/');
    await prisma.category.update({
      where: { id: child.id },
      data: { fullPath: newFullPath }
    });
    await updateChildCategoryPaths(child.id, newFullPath);
  }
};

// Рекурсивное удаление категории со всеми подпапками и осиротевшими инструментами
async function deleteCategoryRecursive(categoryId: number) {
  const children = await prisma.category.findMany({
    where: { parentId: categoryId },
    select: { id: true }
  });

  for (const child of children) {
    await deleteCategoryRecursive(child.id);
  }

  const boundTools = await prisma.toolCategory.findMany({
    where: { categoryId },
    select: { toolId: true }
  });

  await prisma.toolCategory.deleteMany({ where: { categoryId } });

  for (const { toolId } of boundTools) {
    const remainingBindings = await prisma.toolCategory.count({ where: { toolId } });
    if (remainingBindings === 0) {
      await prisma.toolVersion.deleteMany({ where: { toolId } });
      await prisma.tool.delete({ where: { id: toolId } }).catch(() => {});
    }
  }

  await prisma.category.delete({ where: { id: categoryId } });
}

// Запись аудита выполнения инструмента
const logExecution = async (params: {
  toolId?: number | null;
  path: string;
  durationMs: number;
  success: boolean;
  payload: any;
  result: any;
  error?: string | null;
  callerIp?: string;
}) => {
  try {
    await prisma.executionLog.create({
      data: {
        toolId: params.toolId || null,
        path: params.path,
        durationMs: params.durationMs,
        success: params.success,
        payload: safeStringifyJson(params.payload, '{}'),
        result: safeStringifyJson(params.result, '{}'),
        error: params.error || null,
        callerIp: params.callerIp || '127.0.0.1'
      }
    });
  } catch (err) {
    console.error('Failed to write execution log:', err);
  }
};

// Исполнение нативного скрипта в изолированном воркспейсе
const executeTool = async (tool: any, payload: any) => {
  const startTime = Date.now();
  const runDir = path.join(os.tmpdir(), `hub_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const timeoutMs = tool.timeoutMs || 30000;

  try {
    await fs.mkdir(runDir, { recursive: true });
    const runner = tool.runner;
    const rConfig = safeParseJson(runner?.config, {});

    const codeFileName = path.basename(rConfig.codeFileName || 'index.ts');
    const runCmd = rConfig.runCmd || 'bun run index.ts';

    await fs.writeFile(path.join(runDir, 'input.json'), JSON.stringify(payload || {}));

    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    if (payload && typeof payload === 'object') {
      for (const [k, v] of Object.entries(payload)) {
        const sanitizedKey = k.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
        if (!['PATH', 'NODE_ENV', 'HOME', 'USER', 'SHELL'].includes(sanitizedKey)) {
          env[`INPUT_${sanitizedKey}`] = typeof v === 'object' ? JSON.stringify(v) : String(v);
        }
      }
    }

    await fs.writeFile(path.join(runDir, codeFileName), tool.code || '');

    let hasDeps = false;
    if (rConfig.depFileName && tool.packageJson && tool.packageJson.trim().length > 0) {
      const depFileName = path.basename(rConfig.depFileName);
      await fs.writeFile(path.join(runDir, depFileName), tool.packageJson);
      hasDeps = true;
    }

    const maxBuffer = 10 * 1024 * 1024;
    if (rConfig.installCmd && hasDeps) {
      console.log(`📦 [${tool.name}] Installing dependencies...`);
      await execAsync(rConfig.installCmd, { cwd: runDir, timeout: timeoutMs, maxBuffer });
    }

    console.log(`🚀 [${tool.name}] Executing (${timeoutMs}ms limit): ${runCmd}`);
    const { stdout, stderr } = await execAsync(runCmd, { cwd: runDir, env, timeout: timeoutMs, maxBuffer });

    let finalResult;
    try {
      const outJson = await fs.readFile(path.join(runDir, 'output.json'), 'utf-8');
      finalResult = JSON.parse(outJson);
    } catch {
      const cleanStdout = stdout.trim();
      try {
        finalResult = JSON.parse(cleanStdout);
      } catch {
        finalResult = { raw: cleanStdout };
      }
    }

    return {
      success: true,
      data: finalResult,
      logs: stderr.trim() || undefined,
      durationMs: Date.now() - startTime
    };
  } catch (error: any) {
    const isTimeout = error.killed || error.signal === 'SIGTERM';
    const errorMsg = isTimeout ? `Execution Timeout Exceeded (${timeoutMs}ms)` : (error.stderr || error.message);
    console.error(`❌ Execution error [${tool.name}]:`, errorMsg);
    return {
      success: false,
      error: isTimeout ? 'Timeout Error' : 'Execution Error',
      details: errorMsg,
      durationMs: Date.now() - startTime
    };
  } finally {
    try {
      await fs.rm(runDir, { recursive: true, force: true });
    } catch {}
  }
};

// Функция разрешения раннера при импорте
const resolveRunner = async (toolData: any) => {
  let defaultRunner = await prisma.runner.findFirst();
  if (!defaultRunner) {
    defaultRunner = await prisma.runner.create({
      data: { name: 'Bun', type: 'bun_local', config: JSON.stringify({ runCmd: 'bun run index.ts', codeFileName: 'index.ts' }) }
    });
  }

  const typeKey = (toolData.runnerType || '').trim();
  const nameKey = (toolData.runnerName || '').trim();

  const found = await prisma.runner.findFirst({
    where: {
      OR: [
        ...(typeKey ? [{ type: typeKey }, { name: typeKey }] : []),
        ...(nameKey ? [{ name: nameKey }, { type: nameKey }] : [])
      ]
    }
  });
  return found || defaultRunner;
};

// Рекурсивный импорт узлов категории из пакета .toolpack
const importCategoryNode = async (catData: any, parentId: number | null) => {
  const slug = slugify(catData.slug || catData.name, 'cat');
  let fullPath = `/${slug}`;

  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (parent) fullPath = `${parent.fullPath}/${slug}`.replace(/\/+/g, '/');
  }

  const createdCat = await prisma.category.create({
    data: {
      name: catData.name,
      slug,
      fullPath,
      parentId,
      appendPrompt: catData.appendPrompt,
      type: catData.type || 'LOCAL',
      remoteUrl: catData.remoteUrl,
      remoteToken: catData.remoteToken,
      mcpCommand: catData.mcpCommand,
      mcpArgs: catData.mcpArgs,
      mcpEnv: safeStringifyJson(catData.mcpEnv, '{}'),
      mcpIsStateful: !!catData.mcpIsStateful
    }
  });

  if (catData.tools && Array.isArray(catData.tools)) {
    for (const t of catData.tools) {
      const runner = await resolveRunner(t);
      const created = await prisma.tool.create({
        data: {
          name: t.name,
          slug: slugify(t.slug || t.name, 'tool'),
          agentDescription: t.agentDescription || '',
          descriptionMd: t.descriptionMd || '',
          code: t.code || '',
          packageJson: t.packageJson || '',
          inputSchema: safeStringifyJson(t.inputSchema, '{}'),
          outputSchema: safeStringifyJson(t.outputSchema, '{}'),
          examples: safeStringifyJson(t.examples, '[]'),
          timeoutMs: t.timeoutMs || 30000,
          isMcpProxy: !!t.isMcpProxy,
          mcpMethodName: t.mcpMethodName,
          runnerId: runner.id,
          categories: { create: { categoryId: createdCat.id } }
        }
      });

      await prisma.toolVersion.create({
        data: {
          toolId: created.id,
          code: created.code,
          inputSchema: created.inputSchema,
          agentDescription: created.agentDescription
        }
      });
    }
  }

  if (catData.children && Array.isArray(catData.children)) {
    for (const child of catData.children) {
      await importCategoryNode(child, createdCat.id);
    }
  }
};

// Рекурсивный экспорт категории в формат .toolpack
async function exportCategoryRecursive(categoryId: number): Promise<any> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    include: {
      tools: {
        include: {
          tool: {
            include: { runner: true }
          }
        }
      },
      children: true
    }
  });

  if (!cat) return null;

  const toolsData = cat.tools.map(t => ({
    name: t.tool.name,
    slug: t.tool.slug,
    descriptionMd: t.tool.descriptionMd,
    agentDescription: t.tool.agentDescription,
    code: t.tool.code,
    packageJson: t.tool.packageJson,
    inputSchema: safeParseJson(t.tool.inputSchema, {}),
    outputSchema: safeParseJson(t.tool.outputSchema, {}),
    examples: safeParseJson(t.tool.examples, []),
    timeoutMs: t.tool.timeoutMs,
    runnerType: t.tool.runner?.type || 'bun_local',
    runnerName: t.tool.runner?.name || 'Bun',
    isMcpProxy: t.tool.isMcpProxy,
    mcpMethodName: t.tool.mcpMethodName
  }));

  const childrenData = await Promise.all(
    cat.children.map(c => exportCategoryRecursive(c.id))
  );

  return {
    name: cat.name,
    slug: cat.slug,
    appendPrompt: cat.appendPrompt,
    type: cat.type,
    remoteUrl: cat.remoteUrl,
    remoteToken: cat.remoteToken,
    mcpCommand: cat.mcpCommand,
    mcpArgs: cat.mcpArgs,
    mcpEnv: safeParseJson(cat.mcpEnv, {}),
    mcpIsStateful: cat.mcpIsStateful,
    tools: toolsData,
    children: childrenData.filter(Boolean)
  };
}

// Автоматическая самоинициализация базы данных при первом запуске
async function ensureDatabaseSeeded() {
  try {
    // 1. Проверяем и создаем системные настройки
    const settingCount = await prisma.systemSetting.count();
    if (settingCount === 0) {
      await prisma.systemSetting.create({
        data: {
          adminPassword: 'admin',
          agentSecret: '123',
          maxLogRetention: 1000,
          rootPrompt: `Ты — высококлассный автономный инженер и кодинг-агент. У тебя есть прямой доступ к операционной системе, проекту и редактору через распределенный оркестратор навыков ToolHub.

=== 1. ИЕРАРХИЯ И НАВИГАЦИЯ В TOOLHUB (ФАЙЛОВАЯ СИСТЕМА НАВЫКОВ) ===
ToolHub организован как виртуальная древовидная файловая система, начинающаяся с корня "/".
• Каждая папка (Категория) может содержать подпапки, инструменты (Tools) и дочерние контекстные инструкции (appendPrompt).
• Ты всегда стартуешь в корне "/". В секции 5 ниже отображаются ТОЛЬКО корневые папки верхнего уровня.
• ПРАВИЛО АБСОЛЮТНЫХ ПУТЕЙ: Вызов инструмента ВСЕГДА содержит его полный абсолютный путь (например, "/sublime/get-active-code"). Попытка вызвать "/get-active-code" без указания родительской папки приведет к ошибке 404!
• Навигация: Чтобы исследовать содержимое любой подпапки, используй:
  <hub>listTools("/path/to/folder")</hub>

=== 2. СИНТАКСИС ВЫЗОВА (HUB PROTOCOL) ===
Для любых действий используй строго XML-тег <hub>...</hub>:
• Навигация: <hub>listTools("/path")</hub>
• Вызов инструмента: <hub>callTool("/path/to/tool", {"arg": "val"})</hub>

=== 3. СТРОГИЕ ПРАВИЛА ГЕНЕРАЦИИ ТЕКСТА И СТОП-СИГНАЛ ===
1. ТЕКСТ ДО ТЕГА <hub> — РАЗРЕШЁН, НО НЕ ОБЯЗАТЕЛЕН.
2. ЕДИНСТВЕННЫЙ ВЫЗОВ В ХОДУ.
3. ТЕГ </hub> — СТРОГИЙ КОНЕЦ СООБЩЕНИЯ (TERMINAL TOKEN): мгновенно останови генерацию!

=== 5. ДОСТУПНЫЕ РЕСУРСЫ В КОРНЕ (listTools("/")) ===
{{AvailableResources}}`,
          rootAppendPrompt: 'Корневой каталог навыков ToolHub. Используй listTools("/folder") для перехода в нужный раздел.'
        }
      });
      console.log('✅ System settings automatically initialized.');
    }

    // 2. Проверяем и создаем базовые раннеры
    const runnerCount = await prisma.runner.count();
    if (runnerCount === 0) {
      await prisma.runner.createMany({
        data: [
          {
            name: 'Bun (TypeScript/JavaScript)',
            type: 'bun_local',
            description: 'TypeScript/JavaScript via Bun runtime',
            config: JSON.stringify({ codeFileName: 'index.ts', depFileName: 'package.json', installCmd: 'bun install', runCmd: 'bun run index.ts' })
          },
          {
            name: 'Bash Shell',
            type: 'bash_local',
            description: 'Linux Shell execution',
            config: JSON.stringify({ codeFileName: 'script.sh', runCmd: 'bash script.sh' })
          }
        ]
      });
      console.log('✅ Base runners (Bun, Bash) created.');
    }

    // 3. Проверяем категории: если база пуста, импортируем стандартные тулпаки
    const catCount = await prisma.category.count();
    if (catCount === 0) {
      console.log('📦 Database has 0 categories. Auto-importing default toolpacks from /basic-toolpacks...');
      const packsToImport = [
        'basic-toolpacks/meta-tools/meta.toolpack',
        'basic-toolpacks/benchmark/benchmark.toolpack',
        'basic-toolpacks/sublime-text/sublime.toolpack'
      ];

      for (const packPath of packsToImport) {
        try {
          const absPath = path.resolve(process.cwd(), packPath);
          if (fsSync.existsSync(absPath)) {
            const raw = await fs.readFile(absPath, 'utf-8');
            const data = JSON.parse(raw);
            if (data.kind === 'TOOLHUB_PACK' && data.category) {
              await importCategoryNode(data.category, null);
              console.log(`✨ Successfully seeded toolpack: ${data.category.name} (${packPath})`);
            }
          }
        } catch (packErr: any) {
          console.warn(`⚠️ Warning: could not seed toolpack ${packPath}:`, packErr.message);
        }
      }
    }
  } catch (err: any) {
    console.error('⚠️ Database seed check encountered error:', err.message);
  }
}

// ==========================================
// --- 1. АГЕНТСКИЙ API & ОРКЕСТРАЦИЯ ---
// ==========================================

// Системный промпт хаба со списком корневых ресурсов
app.get('/prompt', async (req: Request, res: Response) => {
  if (!(await checkAgentAuth(req, res))) return;

  const settings = await prisma.systemSetting.findFirst();
  const rootCats = await prisma.category.findMany({
    where: { parentId: null, isActive: true }
  });

  const folderLines = rootCats.map(c => `[Folder] ${c.fullPath} - ${c.name}${c.appendPrompt ? ` | Description: ${c.appendPrompt}` : ''}`);
  const resourcesList = folderLines.join('\n') || '(No root folders)';
  const rawPrompt = settings?.rootPrompt || 'Root skills directory. Use listTools("/folder") to navigate into specific categories.';
  const formattedPrompt = rawPrompt.replace('{{AvailableResources}}', resourcesList);

  res.json({ prompt: formattedPrompt });
});

// Хелпер агентской навигации
async function handleAgentNavigation(pathStr: string, res: Response) {
  const settings = await prisma.systemSetting.findFirst();

  if (pathStr === '/') {
    const rootCats = await prisma.category.findMany({
      where: { parentId: null, isActive: true }
    });
    return res.json({
      path: '/',
      appendPrompt: settings?.rootAppendPrompt || 'Корневой каталог навыков ToolHub. Используй listTools("/folder") для перехода в нужный раздел.',
      categories: rootCats.map(c => ({
        name: c.name,
        path: c.fullPath,
        appendPrompt: c.appendPrompt || undefined
      }))
    });
  }

  const localCat = await prisma.category.findFirst({
    where: { fullPath: pathStr, isActive: true },
    include: {
      children: { where: { isActive: true } },
      tools: {
        where: { tool: { isActive: true } },
        include: { tool: true }
      }
    }
  });

  if (localCat) {
    if (localCat.children.length > 0) {
      return res.json({
        path: localCat.fullPath,
        appendPrompt: localCat.appendPrompt,
        categories: localCat.children.map(c => ({
          name: c.name,
          path: c.fullPath,
          appendPrompt: c.appendPrompt || undefined
        })),
        tools: []
      });
    }

    return res.json({
      path: localCat.fullPath,
      appendPrompt: localCat.appendPrompt,
      tools: localCat.tools.map(t => {
        const parsedExamples = safeParseJson(t.tool.examples, []);
        const firstExample = parsedExamples[0]?.input || {};
        return {
          name: t.tool.name,
          path: normalizePath(`${localCat.fullPath}/${t.tool.slug}`),
          description: t.tool.agentDescription,
          inputSchema: safeParseJson(t.tool.inputSchema, {}),
          outputSchema: safeParseJson(t.tool.outputSchema, {}),
          callExample: `<hub>callTool("${normalizePath(localCat.fullPath + '/' + t.tool.slug)}", ${JSON.stringify(firstExample)})</hub>`
        };
      })
    });
  }

  return res.status(404).json({ error: `Category '${pathStr}' not found` });
}

// Алиас для обратной совместимости навигации
app.get('/api/hub/nav/*', async (req: Request, res: Response) => {
  const pathStr = normalizePath(req.params[0] || '');
  await handleAgentNavigation(pathStr, res);
});

// Хелпер агентского исполнения инструментов
async function handleAgentCall(pathStr: string, body: any, req: Request, res: Response) {
  const startTime = Date.now();
  const lastSlash = pathStr.lastIndexOf('/');
  const dirPath = lastSlash === 0 ? '/' : pathStr.slice(0, lastSlash);
  const toolSlug = pathStr.slice(lastSlash + 1);

  // 1. Поиск инструмента в локальной базе
  const dbTool = await prisma.tool.findFirst({
    where: {
      slug: toolSlug,
      isActive: true,
      categories: {
        some: {
          category: { fullPath: dirPath }
        }
      }
    },
    include: { runner: true }
  });

  if (dbTool) {
    let result: any;
    if (dbTool.isMcpProxy && dbTool.mcpSourceId) {
      const mcpSource = await prisma.category.findUnique({ where: { id: dbTool.mcpSourceId } });
      if (!mcpSource) return res.status(500).json({ error: 'MCP Source category missing' });

      try {
        const response = await callMcp(mcpSource, {
          method: 'tools/call',
          params: { name: dbTool.mcpMethodName!, arguments: body }
        });
        const parsedData = extractMcpResponse(response);
        result = { success: true, data: parsedData, durationMs: Date.now() - startTime };
      } catch (mcpErr: any) {
        result = { success: false, error: mcpErr.message, durationMs: Date.now() - startTime };
      }
    } else {
      result = await executeTool(dbTool, body);
    }

    await logExecution({
      toolId: dbTool.id,
      path: pathStr,
      durationMs: result.durationMs || (Date.now() - startTime),
      success: result.success !== false,
      payload: body,
      result: result.data || result,
      error: result.error ? (result.details || result.error) : null,
      callerIp: req.ip
    });

    return res.json(result);
  }

  // 2. Поиск через шлюзы REMOTE или динамические MCP категории
  const allGateways = await prisma.category.findMany({
    where: { isActive: true, OR: [{ type: 'REMOTE' }, { type: 'MCP' }] }
  });
  const gatewayParent = allGateways
    .filter(c => pathStr.startsWith(c.fullPath))
    .sort((a, b) => b.fullPath.length - a.fullPath.length)[0];

  if (gatewayParent) {
    const subPath = normalizePath(pathStr.replace(gatewayParent.fullPath, '')) || '/';
    let gatewayRes: any;

    if (gatewayParent.type === 'REMOTE') {
      const incomingNodes = ((req.headers['x-hub-nodes'] as string) || '').split(',').filter(Boolean);

      if (incomingNodes.includes(SERVER_NODE_ID) || incomingNodes.length > 10) {
        return res.status(400).json({
          error: `[Cycle Protection] Execution aborted. Loop detected for target: ${gatewayParent.remoteUrl}`
        });
      }

      const nextNodes = [...incomingNodes, SERVER_NODE_ID].join(',');
      try {
        gatewayRes = await new HubSDK(gatewayParent.remoteUrl!, gatewayParent.remoteToken!, {
          'x-hub-nodes': nextNodes
        }).callTool(subPath, body);
      } catch (gwErr: any) {
        gatewayRes = { success: false, error: gwErr.message, durationMs: Date.now() - startTime };
      }
    } else if (gatewayParent.type === 'MCP') {
      try {
        const response = await callMcp(gatewayParent, {
          method: 'tools/call',
          params: { name: subPath.replace(/^\//, ''), arguments: body }
        });
        const parsedData = extractMcpResponse(response);
        gatewayRes = { success: true, data: parsedData, durationMs: Date.now() - startTime };
      } catch (mcpErr: any) {
        gatewayRes = { success: false, error: mcpErr.message, durationMs: Date.now() - startTime };
      }
    }

    await logExecution({
      path: pathStr,
      durationMs: Date.now() - startTime,
      success: gatewayRes?.success !== false,
      payload: body,
      result: gatewayRes?.data || gatewayRes,
      error: gatewayRes?.error || null,
      callerIp: req.ip
    });

    return res.json(gatewayRes);
  }

  return res.status(404).json({ error: `Tool not found at path: ${pathStr}` });
}

// Алиас для вызова инструментов
app.post('/api/hub/call/*', async (req: Request, res: Response) => {
  const pathStr = normalizePath(req.params[0] || '');
  await handleAgentCall(pathStr, req.body, req, res);
});

// ==========================================
// --- 2. АДМИНИСТРАТИВНЫЙ API TOOLHUB ---
// ==========================================

app.post('/admin/api/auth/verify', async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Open access for home PC' });
});

app.get('/admin/api/settings', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const settings = await prisma.systemSetting.findFirst();
  res.json(settings || {});
});

app.put('/admin/api/settings', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const existing = await prisma.systemSetting.findFirst();
  if (existing) {
    const updated = await prisma.systemSetting.update({
      where: { id: existing.id },
      data: req.body
    });
    res.json(updated);
  } else {
    const created = await prisma.systemSetting.create({ data: req.body });
    res.json(created);
  }
});

app.get('/admin/api/logs', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit as string) || 50));
  const search = ((req.query.search as string) || '').trim();

  const where = search ? {
    path: { contains: search }
  } : {};

  try {
    const [total, rawLogs] = await Promise.all([
      prisma.executionLog.count({ where }),
      prisma.executionLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { tool: true }
      })
    ]);

    const formattedLogs = rawLogs.map((l) => ({
      ...l,
      payload: safeParseJson(l.payload, {}),
      result: safeParseJson(l.result, {})
    }));

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({ logs: formattedLogs, total, page, limit, totalPages });
  } catch (err: any) {
    console.error('Failed to query logs:', err);
    res.status(500).json({ error: 'Failed to retrieve logs', details: err?.message });
  }
});

app.delete('/admin/api/logs', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  await prisma.executionLog.deleteMany({});
  res.json({ success: true });
});

// Список всех категорий с вложенностями и _count для фронтенда
app.get('/admin/api/categories', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: { select: { children: true, tools: true } },
        tools: { include: { tool: true } },
        children: true
      }
    });

    const parsedCategories = categories.map(c => ({
      ...c,
      mcpEnv: safeParseJson(c.mcpEnv, {}),
      mcpToolsCache: safeParseJson(c.mcpToolsCache, null)
    }));

    res.json(parsedCategories);
  } catch (err: any) {
    console.error('Failed to get categories:', err);
    res.status(500).json({ error: 'Failed to load categories', details: err.message });
  }
});

// Создание категории
app.post('/admin/api/categories', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const { name, slug, fullPath: rawFullPath, parentId, appendPrompt, type, remoteUrl, remoteToken, mcpCommand, mcpArgs, mcpEnv, mcpIsStateful } = req.body;

  try {
    const cleanSlug = slugify(slug || name, 'category');
    let fullPath = `/${cleanSlug}`;

    const parsedParentId = parentId ? Number(parentId) : null;
    if (parsedParentId) {
      const parent = await prisma.category.findUnique({ where: { id: parsedParentId } });
      if (parent) {
        fullPath = `${parent.fullPath}/${cleanSlug}`.replace(/\/+/g, '/');
      }
    }

    const cat = await prisma.category.create({
      data: {
        name,
        slug: cleanSlug,
        fullPath: normalizePath(rawFullPath || fullPath),
        parentId: parsedParentId,
        appendPrompt,
        type: type || 'LOCAL',
        remoteUrl,
        remoteToken,
        mcpCommand,
        mcpArgs,
        mcpEnv: safeStringifyJson(mcpEnv, '{}'),
        mcpIsStateful: !!mcpIsStateful
      }
    });
    res.json(cat);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Category with this path already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Обновление категории
app.put('/admin/api/categories/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  const { name, slug, fullPath: rawFullPath, parentId, appendPrompt, type, remoteUrl, remoteToken, mcpCommand, mcpArgs, mcpEnv, mcpIsStateful } = req.body;

  try {
    const cleanSlug = slugify(slug || name, 'category');
    let fullPath = `/${cleanSlug}`;

    const parsedParentId = parentId ? Number(parentId) : null;
    if (parsedParentId) {
      const parent = await prisma.category.findUnique({ where: { id: parsedParentId } });
      if (parent) {
        if (parent.fullPath === rawFullPath || parent.fullPath.startsWith(rawFullPath + '/')) {
          return res.status(400).json({ error: 'Cannot move category inside its own subfolder' });
        }
        fullPath = `${parent.fullPath}/${cleanSlug}`.replace(/\/+/g, '/');
      }
    }

    const targetPath = normalizePath(rawFullPath || fullPath);

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name,
        slug: cleanSlug,
        fullPath: targetPath,
        parentId: parsedParentId,
        appendPrompt,
        type: type || 'LOCAL',
        remoteUrl,
        remoteToken,
        mcpCommand,
        mcpArgs,
        mcpEnv: safeStringifyJson(mcpEnv, '{}'),
        mcpIsStateful: !!mcpIsStateful
      }
    });

    await updateChildCategoryPaths(id, targetPath);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Удаление категории
app.delete('/admin/api/categories/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  try {
    await deleteCategoryRecursive(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Проверка доступности REMOTE узла
app.post('/admin/api/categories/:id/ping', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const cat = await prisma.category.findUnique({ where: { id: Number(req.params.id) } });
  if (!cat || cat.type !== 'REMOTE' || !cat.remoteUrl) {
    return res.status(400).json({ error: 'Category is not a REMOTE node' });
  }

  const startTime = Date.now();
  try {
    const sdk = new HubSDK(cat.remoteUrl, cat.remoteToken || undefined);
    const result = await sdk.listTools('/');
    res.json({
      online: true,
      latencyMs: Date.now() - startTime,
      categoriesCount: result.categories?.length || 0
    });
  } catch (e: any) {
    res.json({ online: false, error: e.message, latencyMs: Date.now() - startTime });
  }
});

// Синхронизация схем инструментов MCP сервера
app.post('/admin/api/categories/:id/mcp-sync', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const cat = await prisma.category.findUnique({ where: { id: Number(req.params.id) } });
  if (!cat || cat.type !== 'MCP') return res.status(400).json({ error: 'Not an MCP category' });

  try {
    const result = await callMcp(cat, { method: 'tools/list', params: {} });
    const tools = result.result || result;
    await prisma.category.update({
      where: { id: cat.id },
      data: { mcpToolsCache: JSON.stringify(tools) }
    });
    res.json({ success: true, count: tools.tools?.length || 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Экспорт категории в .toolpack
app.get('/admin/api/export/category/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const exported = await exportCategoryRecursive(Number(req.params.id));
  if (!exported) return res.status(404).json({ error: 'Category not found' });

  res.json({
    kind: 'TOOLHUB_PACK',
    version: 1,
    category: exported
  });
});

// Экспорт отдельного инструмента
app.get('/admin/api/export/tool/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const tool = await prisma.tool.findUnique({
    where: { id: Number(req.params.id) },
    include: { runner: true }
  });
  if (!tool) return res.status(404).json({ error: 'Tool not found' });

  res.json({
    kind: 'TOOLHUB_TOOL',
    version: 1,
    tool: {
      name: tool.name,
      slug: tool.slug,
      agentDescription: tool.agentDescription,
      descriptionMd: tool.descriptionMd,
      code: tool.code,
      packageJson: tool.packageJson,
      inputSchema: safeParseJson(tool.inputSchema, {}),
      outputSchema: safeParseJson(tool.outputSchema, {}),
      examples: safeParseJson(tool.examples, []),
      timeoutMs: tool.timeoutMs,
      runnerType: tool.runner?.type || 'bun_local',
      runnerName: tool.runner?.name || 'Bun'
    }
  });
});

// Импорт инструмента или тулпака (.toolpack)
app.post('/admin/api/import', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const { payload, targetCategoryId } = req.body || {};
  if (!payload || !payload.kind) {
    return res.status(400).json({ error: 'Invalid ToolHub package format. Missing "kind" field.' });
  }

  try {
    if (payload.kind === 'TOOLHUB_TOOL' && payload.tool) {
      const t = payload.tool;
      const runner = await resolveRunner(t);
      let categoryIdToBind = targetCategoryId ? Number(targetCategoryId) : null;

      if (!categoryIdToBind) {
        let importedCat = await prisma.category.findFirst({ where: { fullPath: '/imported' } });
        if (!importedCat) {
          importedCat = await prisma.category.create({
            data: { name: 'Imported Tools', slug: 'imported', fullPath: '/imported', type: 'LOCAL', isActive: true }
          });
        }
        categoryIdToBind = importedCat.id;
      }

      const created = await prisma.tool.create({
        data: {
          name: t.name,
          slug: slugify(t.slug || t.name, 'imported-tool'),
          agentDescription: t.agentDescription || '',
          descriptionMd: t.descriptionMd || '',
          code: t.code || '',
          packageJson: t.packageJson || '',
          inputSchema: safeStringifyJson(t.inputSchema, '{}'),
          outputSchema: safeStringifyJson(t.outputSchema, '{}'),
          examples: safeStringifyJson(t.examples, '[]'),
          timeoutMs: t.timeoutMs || 30000,
          isMcpProxy: !!t.isMcpProxy,
          mcpMethodName: t.mcpMethodName,
          runnerId: runner.id,
          categories: { create: { categoryId: categoryIdToBind } }
        }
      });

      await prisma.toolVersion.create({
        data: {
          toolId: created.id,
          code: created.code,
          inputSchema: created.inputSchema,
          agentDescription: created.agentDescription
        }
      });

      return res.json({ success: true, importedType: 'TOOL', toolName: created.name, toolId: created.id });
    }

    if (payload.kind === 'TOOLHUB_PACK' && payload.category) {
      await importCategoryNode(payload.category, targetCategoryId ? Number(targetCategoryId) : null);
      return res.json({ success: true, importedType: 'TOOLPACK' });
    }

    return res.status(400).json({ error: 'Unsupported package format' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Управление инструментами (Tools CRUD)
app.get('/admin/api/tools', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const tools = await prisma.tool.findMany({
    include: {
      runner: true,
      categories: { include: { category: true } }
    }
  });
  res.json(tools);
});

app.post('/admin/api/tools', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const { name, slug, agentDescription, descriptionMd, code, packageJson, inputSchema, outputSchema, examples, runnerId, categoryIds, timeoutMs, mcpSourceId } = req.body;

  try {
    const created = await prisma.tool.create({
      data: {
        name,
        slug: slugify(slug || name, 'tool'),
        agentDescription: agentDescription || name,
        descriptionMd,
        code,
        packageJson,
        inputSchema: safeStringifyJson(inputSchema, '{}'),
        outputSchema: safeStringifyJson(outputSchema, '{}'),
        examples: safeStringifyJson(examples, '[]'),
        runnerId: Number(runnerId) || 1,
        timeoutMs: Number(timeoutMs) || 30000,
        mcpSourceId: mcpSourceId ? Number(mcpSourceId) : null,
        categories: {
          create: (categoryIds || []).map((cId: number) => ({
            category: { connect: { id: Number(cId) } }
          }))
        }
      }
    });

    await prisma.toolVersion.create({
      data: {
        toolId: created.id,
        code: created.code,
        inputSchema: created.inputSchema,
        agentDescription: created.agentDescription
      }
    });

    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/api/tools/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  const { name, slug, agentDescription, descriptionMd, code, packageJson, inputSchema, outputSchema, examples, runnerId, timeoutMs, mcpSourceId } = req.body;

  try {
    const current = await prisma.tool.findUnique({ where: { id } });
    const strInput = safeStringifyJson(inputSchema, '{}');
    if (current && (current.code !== code || current.inputSchema !== strInput)) {
      await prisma.toolVersion.create({
        data: {
          toolId: id,
          code: current.code,
          inputSchema: current.inputSchema,
          agentDescription: current.agentDescription
        }
      });
    }

    const updated = await prisma.tool.update({
      where: { id },
      data: {
        name,
        slug: slug ? slugify(slug, 'tool') : undefined,
        agentDescription,
        descriptionMd,
        code,
        packageJson,
        inputSchema: strInput,
        outputSchema: safeStringifyJson(outputSchema, '{}'),
        examples: safeStringifyJson(examples, '[]'),
        runnerId: runnerId ? Number(runnerId) : undefined,
        timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
        mcpSourceId: mcpSourceId !== undefined ? (mcpSourceId ? Number(mcpSourceId) : null) : undefined
      }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/api/tools/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  await prisma.tool.delete({ where: { id } });
  res.json({ success: true });
});

// Управление средами выполнения (Runners CRUD)
app.get('/admin/api/runners', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const runners = await prisma.runner.findMany();
  res.json(runners);
});

app.post('/admin/api/runners', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const { name, type, description, config } = req.body;
  try {
    const runner = await prisma.runner.create({
      data: {
        name,
        type: type || slugify(name, 'runner'),
        description,
        config: typeof config === 'object' ? JSON.stringify(config) : config
      }
    });
    res.json(runner);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/api/runners/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  const { name, type, description, config, isActive } = req.body;
  try {
    const updated = await prisma.runner.update({
      where: { id },
      data: {
        name,
        type,
        description,
        config: typeof config === 'object' ? JSON.stringify(config) : config,
        isActive
      }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/api/runners/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  try {
    await prisma.runner.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Тестирование инструмента администратором
app.post('/admin/api/test-tool/*', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const rawPath = req.params[0] || '';
  const cleanPath = normalizePath(rawPath);
  const lastSlash = cleanPath.lastIndexOf('/');
  const toolSlug = cleanPath.slice(lastSlash + 1);

  // Ищем инструмент либо по slug, либо по полному пути категории
  const tool = await prisma.tool.findFirst({
    where: {
      OR: [
        { slug: toolSlug },
        { slug: rawPath.replace(/^\/+/, '') }
      ]
    },
    include: { runner: true }
  });

  if (!tool) {
    return res.status(404).json({ error: `Tool '${toolSlug}' not found` });
  }

  const result = await executeTool(tool, req.body);
  res.json(result);
});

// Пул процессов MCP
const handleGetPool = async (_req: Request, res: Response) => {
  res.json(getPoolStatus());
};

const handleKillPool = async (req: Request, res: Response) => {
  const catId = Number(req.params.catId);
  killMcpProcess(catId);
  res.json({ success: true });
};

app.get('/admin/api/pool', handleGetPool);
app.get('/admin/api/mcp/pool', handleGetPool);
app.delete('/admin/api/pool/:catId', handleKillPool);
app.delete('/admin/api/mcp/pool/:catId', handleKillPool);

// ==========================================
// --- 3. ШЛЮЗ GRAPHMEM (DIALOGS API) ---
// ==========================================
// Локальное хранилище диалогов GraphMem в оперативной памяти / SQLite
interface LocalDialog {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const localDialogs: LocalDialog[] = [];

app.get('/api/dialogs', (req: Request, res: Response) => {
  res.json(localDialogs);
});

app.post('/api/dialogs', (req: Request, res: Response) => {
  const newDialog: LocalDialog = {
    id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: req.body?.message?.slice(0, 40) || 'New Graph Dialogue',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  localDialogs.unshift(newDialog);
  res.json(newDialog);
});

app.put('/api/dialogs/:dialogId', (req: Request, res: Response) => {
  const dlg = localDialogs.find(d => d.id === req.params.dialogId);
  if (dlg && req.body?.title) {
    dlg.title = req.body.title;
    dlg.updatedAt = new Date().toISOString();
  }
  res.json(dlg || { id: req.params.dialogId, title: req.body?.title || 'Dialogue' });
});

app.delete('/api/dialogs/:dialogId', (req: Request, res: Response) => {
  const idx = localDialogs.findIndex(d => d.id === req.params.dialogId);
  if (idx !== -1) localDialogs.splice(idx, 1);
  res.json({ success: true });
});

app.get('/api/dialogs/:dialogId/messages', (_req: Request, res: Response) => {
  res.json({ messages: [], nextCursor: null });
});

app.post('/api/dialogs/:dialogId/messages', (req: Request, res: Response) => {
  res.json({
    id: `msg_${Date.now()}`,
    dialogId: req.params.dialogId,
    content: req.body?.content || '',
    role: 'USER',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/dialogs/:dialogId/retrieve', (_req: Request, res: Response) => {
  res.json({ contextSnippets: '', fragments: [] });
});

app.post('/api/dialogs/:dialogId/ingest', (_req: Request, res: Response) => {
  res.json({ message: 'ok', messageId: `ingest_${Date.now()}` });
});

app.get('/api/dialogs/:dialogId/search', (_req: Request, res: Response) => {
  res.json([]);
});

app.get('/api/dialogs/:dialogId/context', (_req: Request, res: Response) => {
  res.json([]);
});

app.get('/api/dialogs/:dialogId/graph', (_req: Request, res: Response) => {
  res.json({ nodes: [], links: [] });
});

app.get('/api/dialogs/:dialogId/graph/nodes/:nodeId/memories', (_req: Request, res: Response) => {
  res.json([]);
});

app.get('/api/dialogs/:dialogId/graph/statistics', (_req: Request, res: Response) => {
  res.json({ totalNodes: 0, totalEdges: 0, fragmentCount: 0 });
});

// ==========================================
// --- 4. ЕДИНЫЙ ПЕРЕХВАТЧИК МАРШРУТОВ ---
// ==========================================

// Глобальный POST маршрутизатор (исполнение инструментов агентом callTool)
app.post('/*', async (req: Request, res: Response, next: NextFunction) => {
  const pathStr = normalizePath(req.params[0] || req.path);

  // Исключаем системные и административные вызовы
  if (pathStr.startsWith('/admin/api') || pathStr.startsWith('/api/') || pathStr === '/prompt') {
    return next();
  }

  await handleAgentCall(pathStr, req.body, req, res);
});

// Глобальный GET маршрутизатор (навигация агента listTools vs веб-интерфейс)
app.get('/*', async (req: Request, res: Response, next: NextFunction) => {
  const pathStr = normalizePath(req.params[0] || req.path);

  // Системные ресурсы
  if (
    pathStr.startsWith('/admin/api') ||
    pathStr.startsWith('/api/') ||
    pathStr === '/prompt' ||
    pathStr.startsWith('/@') ||
    pathStr.startsWith('/src/') ||
    pathStr.startsWith('/node_modules/') ||
    pathStr.startsWith('/public/') ||
    pathStr.startsWith('/langs/') ||
    pathStr.includes('.')
  ) {
    return next();
  }

  // 1. Корень "/"
  if (pathStr === '/') {
    const isJsonRequested = req.headers.accept?.includes('application/json') || req.headers['x-agent-password'];
    if (isJsonRequested) {
      return handleAgentNavigation('/', res);
    }
    // Браузер загружает страницу приложения
    return next();
  }

  // 2. Проверяем, существует ли такая категория навыков в базе данных
  try {
    const catExists = await prisma.category.findFirst({
      where: { fullPath: pathStr, isActive: true }
    });

    if (catExists) {
      return handleAgentNavigation(pathStr, res);
    }
  } catch {}

  // 3. Если агент явно запросил JSON и категория не найдена
  if (req.headers.accept?.includes('application/json') || req.headers['x-agent-password']) {
    return res.status(404).json({ error: `Category '${pathStr}' not found` });
  }

  // 4. Иначе это маршрут SPA фронтенда (например, /admin, /categories и т.д.)
  next();
});

// ==========================================
// --- 5. VITE DEV SERVER & PRODUCTION ---
// ==========================================

async function startServer() {
  // Первичная самоинициализация базы
  await ensureDatabaseSeeded();

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('⚡ Vite dev middleware successfully mounted');
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fsSync.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      console.log(`📦 Serving production build from ${distPath}`);
    }
  }

  // Обработка завершения работы сервера
  const shutdown = () => {
    console.log('\n🛑 Gracefully shutting down ToolHub server and MCP processes...');
    cleanupAllPoolProcesses();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================================`);
    console.log(`🚀 Lab + ToolHub Unified Ecosystem is running on port ${PORT}`);
    console.log(`👉 Web Interface:  http://localhost:${PORT}`);
    console.log(`👉 ToolHub Admin:  http://localhost:${PORT}/admin/`);
    console.log(`👉 Agent Prompt:   http://localhost:${PORT}/prompt`);
    console.log(`👉 Agent Root:     http://localhost:${PORT}/`);
    console.log(`==================================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
  process.exit(1);
});
