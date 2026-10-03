/**
 * @license AGPL-3.0
 * server.ts - Единый Full Stack сервер Lab + ToolHub.
 * 
 * Особенности:
 * 1. Запуск на порту 3000 (или переопределение через переменную PORT).
 * 2. Обслуживание API оркестрации навыков:
 *    - GET /prompt (системный промпт хаба со списком ресурсов)
 *    - GET /* (навигация агента listTools)
 *    - POST /* (исполнение инструментов callTool)
 *    - /admin/api/* (CRUD категорий, инструментов, раннеров, аудит логов, MCP)
 * 3. В режиме разработки (dev) монтирует Vite middlewares для моментального HMR и загрузки UI.
 * 4. В режиме продакшена (prod) раздаёт собранный бандл из директории dist/.
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

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
  const withLeading = p.startsWith('/') ? p : `/${p}`;
  return withLeading.replace(/\/+$/, '') || '/';
};

// Открытый доступ для домашнего ПК: пароли полностью вырезаны
const checkAgentAuth = async (_req: Request, _res: Response): Promise<boolean> => {
  return true;
};

const checkAdminAuth = async (_req: Request, _res: Response): Promise<boolean> => {
  return true;
};

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
        result: safeStringifyJson(params.result, null),
        error: params.error || null,
        callerIp: params.callerIp || '127.0.0.1'
      }
    });
  } catch (err) {
    console.error('Failed to write execution log:', err);
  }
};

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

    const env: Record<string, string> = { ...process.env as Record<string, string> };
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

// 1. АГЕНТСКИЙ API
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

// 2. АДМИНИСТРАТИВНЫЙ API (Всегда открыт для домашнего ПК)
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
  const logs = await prisma.executionLog.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: { tool: true }
  });
  res.json(logs);
});

app.delete('/admin/api/logs', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  await prisma.executionLog.deleteMany({});
  res.json({ success: true });
});

app.get('/admin/api/categories', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const categories = await prisma.category.findMany({
    include: {
      tools: {
        include: { tool: true }
      },
      children: true
    }
  });
  res.json(categories);
});

app.post('/admin/api/categories', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const { name, slug, fullPath, parentId, appendPrompt, type, remoteUrl, remoteToken } = req.body;
  const cat = await prisma.category.create({
    data: {
      name,
      slug,
      fullPath: normalizePath(fullPath),
      parentId: parentId || null,
      appendPrompt,
      type: type || 'LOCAL',
      remoteUrl,
      remoteToken
    }
  });
  res.json(cat);
});

app.put('/admin/api/categories/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  const updated = await prisma.category.update({
    where: { id },
    data: req.body
  });
  res.json(updated);
});

app.delete('/admin/api/categories/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  await prisma.category.delete({ where: { id } });
  res.json({ success: true });
});

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
  const { name, slug, agentDescription, descriptionMd, code, packageJson, inputSchema, outputSchema, examples, runnerId, categoryIds, timeoutMs } = req.body;
  
  const created = await prisma.tool.create({
    data: {
      name,
      slug,
      agentDescription: agentDescription || name,
      descriptionMd,
      code,
      packageJson,
      inputSchema: typeof inputSchema === 'object' ? JSON.stringify(inputSchema) : inputSchema,
      outputSchema: typeof outputSchema === 'object' ? JSON.stringify(outputSchema) : outputSchema,
      examples: typeof examples === 'object' ? JSON.stringify(examples) : examples,
      runnerId: Number(runnerId) || 1,
      timeoutMs: Number(timeoutMs) || 30000,
      categories: {
        create: (categoryIds || []).map((cId: number) => ({
          category: { connect: { id: Number(cId) } }
        }))
      }
    }
  });
  res.json(created);
});

app.put('/admin/api/tools/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  const { name, slug, agentDescription, descriptionMd, code, packageJson, inputSchema, outputSchema, examples, runnerId, timeoutMs } = req.body;

  const current = await prisma.tool.findUnique({ where: { id } });
  if (current && (current.code !== code || current.inputSchema !== inputSchema)) {
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
      slug,
      agentDescription,
      descriptionMd,
      code,
      packageJson,
      inputSchema: typeof inputSchema === 'object' ? JSON.stringify(inputSchema) : inputSchema,
      outputSchema: typeof outputSchema === 'object' ? JSON.stringify(outputSchema) : outputSchema,
      examples: typeof examples === 'object' ? JSON.stringify(examples) : examples,
      runnerId: runnerId ? Number(runnerId) : undefined,
      timeoutMs: timeoutMs ? Number(timeoutMs) : undefined
    }
  });
  res.json(updated);
});

app.delete('/admin/api/tools/:id', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const id = Number(req.params.id);
  await prisma.tool.delete({ where: { id } });
  res.json({ success: true });
});

app.get('/admin/api/runners', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const runners = await prisma.runner.findMany();
  res.json(runners);
});

app.post('/admin/api/test-tool/*', async (req: Request, res: Response) => {
  if (!(await checkAdminAuth(req, res))) return;
  const toolSlug = req.params[0]?.replace(/^\/+/, '');
  const tool = await prisma.tool.findFirst({
    where: { slug: toolSlug },
    include: { runner: true }
  });

  if (!tool) {
    return res.status(404).json({ error: `Tool ${toolSlug} not found` });
  }

  const result = await executeTool(tool, req.body);
  res.json(result);
});

// 3. АГЕНТСКИЙ МАРШРУТИЗАТОР
app.get('/api/hub/nav/*', async (req: Request, res: Response) => {
  const pathStr = normalizePath(req.params[0] || '');
  if (!(await checkAgentAuth(req, res))) return;

  const settings = await prisma.systemSetting.findFirst();

  if (pathStr === '/') {
    const rootCats = await prisma.category.findMany({
      where: { parentId: null, isActive: true }
    });
    return res.json({
      path: '/',
      appendPrompt: settings?.rootAppendPrompt || 'Root skills directory. Use listTools("/folder") to navigate into specific categories.',
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

  res.status(404).json({ error: `Category '${pathStr}' not found` });
});

app.post('/api/hub/call/*', async (req: Request, res: Response) => {
  const pathStr = normalizePath(req.params[0] || '');
  if (!(await checkAgentAuth(req, res))) return;

  const startTime = Date.now();
  const lastSlash = pathStr.lastIndexOf('/');
  const dirPath = lastSlash === 0 ? '/' : pathStr.slice(0, lastSlash);
  const toolSlug = pathStr.slice(lastSlash + 1);

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

  if (!dbTool) {
    return res.status(404).json({ error: `Tool not found at path: ${pathStr}` });
  }

  const result = await executeTool(dbTool, req.body);

  await logExecution({
    toolId: dbTool.id,
    path: pathStr,
    durationMs: result.durationMs || (Date.now() - startTime),
    success: result.success !== false,
    payload: req.body,
    result: result.data || result,
    error: result.error ? (result.details || result.error) : null,
    callerIp: req.ip
  });

  res.json(result);
});

// 4. VITE & STATIC
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('⚡ Vite dev middleware mounted');
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================================`);
    console.log(`🚀 Lab + ToolHub Unified Ecosystem is running on port ${PORT}`);
    console.log(`👉 Web Interface: http://localhost:${PORT}`);
    console.log(`👉 ToolHub Admin: http://localhost:${PORT}/admin/`);
    console.log(`👉 Agent Prompt:  http://localhost:${PORT}/prompt`);
    console.log(`==================================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
  process.exit(1);
});
