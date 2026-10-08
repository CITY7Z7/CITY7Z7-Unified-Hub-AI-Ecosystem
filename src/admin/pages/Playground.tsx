import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  PlaySquare, Send, Terminal, Sparkles, FolderTree, 
  Trash2, CheckCircle2, Clock, Bot, Cpu, Sliders, Code2, AlertCircle
} from "lucide-react";
import { HubSDK } from "@/lib/toolhubSdk";
import Editor from "@monaco-editor/react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/useTheme";

interface ChatMessage {
  id: string;
  sender: "agent" | "hub";
  timestamp: string;
  rawInput?: string;
  response?: any;
  durationMs?: number;
}

interface HubCategoryPath {
  path: string;
  name: string;
}

const handleMonacoBeforeMount = (monaco: any) => {
  if (monaco?.languages?.json) {
    monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions?.({
      validate: false,
    });
  }
};

export function Playground() {
  const { t } = useI18n();
  const { monacoTheme } = useTheme();

  const getTargetUrl = () => {
    if (window.location.port && window.location.port !== "3000") {
      return `${window.location.protocol}//${window.location.hostname}:`+window.location.port;
    }
    return window.location.origin;
  };

  const [hostUrl, setHostUrl] = useState(getTargetUrl());
  const [allPaths, setAllPaths] = useState<HubCategoryPath[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Рекурсивный обход всего дерева категорий для построения полного списка путей
  const scanAllPaths = async (sdk: HubSDK, currentPath = "/", visited = new Set<string>()): Promise<HubCategoryPath[]> => {
    if (visited.has(currentPath)) return [];
    visited.add(currentPath);

    let result: HubCategoryPath[] = [{ path: currentPath, name: currentPath === "/" ? t("play.root_option") : currentPath }];
    try {
      const res = await sdk.listTools(currentPath);
      if (res && Array.isArray(res.categories)) {
        for (const cat of res.categories) {
          const catPath = cat.path || cat.fullPath;
          if (catPath && !visited.has(catPath)) {
            const subResults = await scanAllPaths(sdk, catPath, visited);
            result = result.concat(subResults);
          }
        }
      }
    } catch {}
    return result;
  };

  const syncNode = async (overrideUrl?: string) => {
    const targetUrl = overrideUrl ?? hostUrl;
    setIsScanning(true);

    try {
      const sdk = new HubSDK(targetUrl);
      const paths = await scanAllPaths(sdk, "/");
      if (paths.length > 0) {
        setAllPaths(paths);
        toast.success(t("play.connected_sync"));
      } else {
        setAllPaths([{ path: "/", name: "/" }]);
        toast.error(t("play.invalid_hub_res"));
      }
    } catch (e: any) {
      setAllPaths([{ path: "/", name: "/" }]);
      toast.error(t("play.conn_failed", { error: e.message }));
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    syncNode(hostUrl);
  }, []);

  const formatJson = (data: any): string => {
    if (data === undefined) return "";
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2) ?? "";
    } catch {
      return String(data);
    }
  };

  const [mode, setMode] = useState<"visual" | "raw">("visual");
  const [rawTag, setRawTag] = useState<string>('<hub>listTools("/")</hub>');

  const [actionType, setActionType] = useState<"list" | "call">("list");
  const [selectedPath, setSelectedPath] = useState("/");
  const [selectedToolSlug, setSelectedToolSlug] = useState("");
  const [toolPayload, setToolPayload] = useState("{}");
  const [pathTools, setPathTools] = useState<any[]>([]);

  // Двустороннее состояние аргументов (Форма <-> JSON)
  const [payloadMode, setPayloadMode] = useState<"form" | "json">("form");
  const [selectedToolObject, setSelectedToolObject] = useState<any>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (actionType !== "call") return;

    const sdk = new HubSDK(hostUrl);
    sdk.listTools(selectedPath).then(res => {
      if (res && Array.isArray(res.tools)) {
        setPathTools(res.tools);
      } else {
        setPathTools([]);
      }
    }).catch(() => setPathTools([]));
  }, [selectedPath, actionType, hostUrl]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Обновление payload из интерактивной формы
  const updateFormField = (key: string, val: any) => {
    const updated = { ...formValues, [key]: val };
    setFormValues(updated);
    setToolPayload(JSON.stringify(updated, null, 2));
  };

  const buildCurrentTag = () => {
    if (mode === "raw") return rawTag;

    if (actionType === "list") {
      return `<hub>listTools("${selectedPath || "/"}")</hub>`;
    } else {
      const fullToolPath = `${selectedPath}/${selectedToolSlug}`.replace(/\/+/g, '/');
      let parsedPayload = {};
      try { parsedPayload = JSON.parse(toolPayload || "{}"); } catch {}
      return `<hub>callTool("${fullToolPath}", ${JSON.stringify(parsedPayload)})</hub>`;
    }
  };

  const handleExecute = async () => {
    if (mode === "visual" && actionType === "call" && toolPayload.trim()) {
      try {
        JSON.parse(toolPayload);
      } catch (e: any) {
        return toast.error(t("play.invalid_payload_json", { error: e.message }));
      }
    }

    const finalTag = buildCurrentTag();
    if (!finalTag.trim()) return toast.error(t("play.empty_tag_error"));

    setLoading(true);
    const startTime = Date.now();
    const msgId = Date.now().toString();

    const agentMsg: ChatMessage = {
      id: msgId + "_agent",
      sender: "agent",
      timestamp: new Date().toLocaleTimeString(),
      rawInput: finalTag
    };

    setMessages(prev => [...prev, agentMsg]);

    try {
      const sdk = new HubSDK(hostUrl);
      const res = await sdk.processAgentResponse(finalTag);
      const durationMs = Date.now() - startTime;

      const hubMsg: ChatMessage = {
        id: msgId + "_hub",
        sender: "hub",
        timestamp: new Date().toLocaleTimeString(),
        response: res,
        durationMs
      };

      setMessages(prev => [...prev, hubMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: msgId + "_err",
        sender: "hub",
        timestamp: new Date().toLocaleTimeString(),
        response: { error: e.message }
      }]);
    } finally {
      setLoading(false);
    }
  };

  const inputSchemaProperties = selectedToolObject?.inputSchema?.properties || {};
  const requiredFields: string[] = selectedToolObject?.inputSchema?.required || [];
  const hasSchemaProperties = Object.keys(inputSchemaProperties).length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#eef1f5]">
      {/* Шапка щита оператора */}
      <div className="h-12 px-4 border-b border-slate-300 bg-white flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
            {t("nav.playground")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 px-2.5 py-1 rounded border border-slate-300">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-tight">{t("play.host_label")}</span>
            <input 
              type="text" 
              value={hostUrl} 
              onChange={e => setHostUrl(e.target.value)} 
              placeholder="http://localhost:3000"
              className="bg-transparent border-b border-slate-300 focus:border-blue-500 focus:outline-none w-44 text-xs font-mono text-slate-800"
            />
            <Button size="sm" variant="ghost" onClick={() => syncNode()} disabled={isScanning} className="h-6 px-2 text-[10px] text-blue-600 font-bold hover:bg-blue-50 rounded cursor-pointer">
              {isScanning ? t("play.fetching_paths") : t("play.sync_btn")}
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setMessages([])} className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 rounded border-slate-300 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {t("play.clear_chat")}
          </Button>
        </div>
      </div>

      {/* Контент щита оператора */}
      <div className="p-3 flex-1 overflow-hidden min-h-0">
        <div className="grid grid-cols-12 gap-3 h-full">
          {/* Левый блок - Конструктор / Редактор вызова */}
          <div className="col-span-5 border border-slate-300 rounded bg-white flex flex-col overflow-hidden p-3 gap-2.5 shadow-2xs">
            <div className="flex justify-between items-center border-b border-slate-300 pb-2 shrink-0">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" /> {t("play.builder")}
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-bold">
                <button
                  onClick={() => setMode("visual")}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    mode === "visual" ? "bg-white text-blue-700 font-semibold shadow-2xs border border-slate-200" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t("play.interactive")}
                </button>
                <button
                  onClick={() => setMode("raw")}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    mode === "raw" ? "bg-white text-blue-700 font-semibold shadow-2xs border border-slate-200" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t("play.raw")}
                </button>
              </div>
            </div>

            {mode === "visual" ? (
              <div className="space-y-2.5 flex-1 overflow-y-auto pr-0.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-500">{t("play.action_type")}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setActionType("list")}
                      className={`p-2 border rounded text-left text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                        actionType === "list" 
                          ? "bg-blue-50 border-blue-400 text-blue-900" 
                          : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <FolderTree className="h-4 w-4 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate">{t("play.nav_action")}</div>
                        <div className="text-[9px] font-normal text-slate-500 truncate">{t("play.nav_desc")}</div>
                      </div>
                    </button>

                    <button
                      onClick={() => setActionType("call")}
                      className={`p-2 border rounded text-left text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                        actionType === "call" 
                          ? "bg-blue-50 border-blue-400 text-blue-900" 
                          : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <Terminal className="h-4 w-4 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate">{t("play.call_action")}</div>
                        <div className="text-[9px] font-normal text-slate-500 truncate">{t("play.call_desc")}</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Целевой путь в дереве */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-500">{t("play.target_path")}</label>
                  <select 
                    className="h-8 w-full border border-slate-300 rounded text-xs px-2 bg-white font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                    value={selectedPath}
                    onChange={e => {
                      setSelectedPath(e.target.value);
                      setSelectedToolSlug("");
                      setSelectedToolObject(null);
                      setToolPayload("{}");
                      setFormValues({});
                    }}
                  >
                    {allPaths.map((p, idx) => (
                      <option key={idx} value={p.path}>{p.path}</option>
                    ))}
                  </select>
                </div>

                {actionType === "call" && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    {/* Выбор инструмента */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase font-bold text-slate-500">
                        {t("play.pick_tool", { count: pathTools.length })}
                      </label>
                      <select 
                        className="h-8 w-full border border-slate-300 rounded text-xs px-2 bg-white font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        value={selectedToolSlug}
                        onChange={e => {
                          const slug = e.target.value;
                          setSelectedToolSlug(slug);

                          const targetTool = pathTools.find(x => {
                            const toolSlug = x.path ? x.path.split('/').pop() : x.slug;
                            return toolSlug === slug;
                          });

                          setSelectedToolObject(targetTool || null);

                          if (targetTool) {
                            let initialValues: Record<string, any> = {};
                            if (typeof targetTool.callExample === "string") {
                              try {
                                const match = targetTool.callExample.match(/\{[\s\S]*\}/);
                                if (match) initialValues = JSON.parse(match[0]);
                              } catch {}
                            }
                            setFormValues(initialValues);
                            setToolPayload(JSON.stringify(initialValues, null, 2));
                          } else {
                            setFormValues({});
                            setToolPayload("{}");
                          }
                        }}
                      >
                        <option value="">{t("play.select_tool_placeholder", { count: pathTools.length })}</option>
                        {pathTools.map((tItem, idx) => {
                          const slug = tItem.path ? tItem.path.split('/').pop() : tItem.slug;
                          return (
                            <option key={idx} value={slug}>{tItem.name} ({slug})</option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Редактор параметров: Форма из JSON Schema vs Raw JSON */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-mono uppercase font-bold text-slate-500">{t("play.payload")}</label>
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[9px] font-bold">
                          <button
                            onClick={() => setPayloadMode("form")}
                            className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
                              payloadMode === "form" ? "bg-white text-blue-700 shadow-2xs font-semibold" : "text-slate-600"
                            }`}
                          >
                            <Sliders className="h-3 w-3" /> {t("play.form_mode")}
                          </button>
                          <button
                            onClick={() => setPayloadMode("json")}
                            className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
                              payloadMode === "json" ? "bg-white text-blue-700 shadow-2xs font-semibold" : "text-slate-600"
                            }`}
                          >
                            <Code2 className="h-3 w-3" /> {t("play.json_mode")}
                          </button>
                        </div>
                      </div>

                      {payloadMode === "form" ? (
                        <div className="border border-slate-300 rounded p-2.5 bg-slate-50 space-y-2 max-h-56 overflow-y-auto">
                          {!selectedToolObject ? (
                            <div className="text-[11px] text-slate-500 italic text-center py-4">
                              {t("play.select_tool_placeholder", { count: pathTools.length })}
                            </div>
                          ) : !hasSchemaProperties ? (
                            <div className="text-[11px] text-slate-500 text-center py-4 flex flex-col items-center gap-1">
                              <AlertCircle className="h-4 w-4 text-blue-600" />
                              <span>{t("play.no_params")}</span>
                            </div>
                          ) : (
                            Object.entries(inputSchemaProperties).map(([propKey, propMeta]: [string, any]) => {
                              const isRequired = requiredFields.includes(propKey);
                              const propType = propMeta.type || "string";
                              const val = formValues[propKey];

                              return (
                                <div key={propKey} className="space-y-1 border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-bold font-mono text-slate-800 flex items-center gap-1">
                                      {propKey}
                                      {isRequired && <span className="text-red-500 font-bold">*</span>}
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-500">({propType})</span>
                                  </div>

                                  {propMeta.description && (
                                    <p className="text-[9px] text-slate-500 leading-tight">{propMeta.description}</p>
                                  )}

                                  {propType === "boolean" ? (
                                    <div className="pt-0.5">
                                      <Switch 
                                        checked={!!val} 
                                        onCheckedChange={v => updateFormField(propKey, v)} 
                                      />
                                    </div>
                                  ) : propType === "number" || propType === "integer" ? (
                                    <Input 
                                      type="number"
                                      value={val !== undefined ? val : ""}
                                      onChange={e => updateFormField(propKey, e.target.value ? Number(e.target.value) : undefined)}
                                      className="h-7 text-xs font-mono bg-white border-slate-300"
                                    />
                                  ) : propType === "object" || propType === "array" ? (
                                    <Textarea 
                                      value={typeof val === "object" ? JSON.stringify(val, null, 2) : (val || "")}
                                      onChange={e => {
                                        try {
                                          updateFormField(propKey, JSON.parse(e.target.value));
                                        } catch {
                                          updateFormField(propKey, e.target.value);
                                        }
                                      }}
                                      className="h-14 font-mono text-[10px] p-1.5 resize-none bg-white border-slate-300"
                                    />
                                  ) : (
                                    <Input 
                                      type="text"
                                      value={val !== undefined ? val : ""}
                                      onChange={e => updateFormField(propKey, e.target.value)}
                                      className="h-7 text-xs font-mono bg-white border-slate-300"
                                    />
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      ) : (
                        <div className="border border-slate-300 rounded overflow-hidden h-36 bg-white">
                          <Editor 
                            height="100%" 
                            defaultLanguage="json" 
                            theme={monacoTheme} 
                            value={toolPayload}
                            onChange={val => {
                              const newPayload = val || "{}";
                              setToolPayload(newPayload);
                              try {
                                setFormValues(JSON.parse(newPayload));
                              } catch {}
                            }}
                            beforeMount={handleMonacoBeforeMount}
                            options={{ 
                              minimap: { enabled: false }, 
                              fontSize: 11, 
                              lineNumbers: "off", 
                              wordWrap: "on",
                              renderValidationDecorations: 'off'
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-1">
                <label className="text-[10px] font-mono uppercase font-bold text-slate-500">{t("play.raw_placeholder")}</label>
                <Textarea 
                  value={rawTag}
                  onChange={e => setRawTag(e.target.value)}
                  placeholder='<hub>callTool("/system/system-info", {})</hub>'
                  className="flex-1 font-mono text-xs p-3 leading-relaxed resize-none border border-slate-300 bg-white focus-visible:ring-blue-500 whitespace-pre-wrap break-all"
                />
              </div>
            )}

            <div className="space-y-2 border-t border-slate-300 pt-2 shrink-0">
              <div className="space-y-1">
                <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">{t("play.command_preview")}</span>
                <div className="p-2 bg-slate-100 border border-slate-300 rounded text-slate-800 font-mono text-xs whitespace-pre-wrap break-all leading-tight">
                  {buildCurrentTag()}
                </div>
              </div>

              <Button 
                onClick={handleExecute} 
                disabled={loading} 
                className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded border border-blue-700 shadow-2xs text-xs cursor-pointer"
              >
                <Send className="h-3.5 w-3.5 mr-2" /> {loading ? t("play.simulating") : t("play.send")}
              </Button>
            </div>
          </div>

          {/* Правый блок - История сообщений (Timeline) */}
          <div className="col-span-7 border border-slate-300 rounded bg-white flex flex-col shadow-2xs overflow-hidden">
            <div className="p-2.5 border-b border-slate-300 bg-slate-100 text-[10px] font-mono font-bold uppercase text-slate-700 flex justify-between items-center shrink-0">
              <span className="flex items-center gap-1.5"><Bot className="h-4 w-4 text-blue-600" /> {t("play.timeline")}</span>
              <span className="text-[10px] font-mono">{t("play.events_count", { count: messages.length })}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 bg-slate-50/50">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <PlaySquare className="h-10 w-10 text-slate-300 mb-2" />
                  <div className="text-xs font-bold text-slate-700">{t("play.ready")}</div>
                  <p className="text-[11px] max-w-xs mt-1 text-slate-500">{t("play.ready_desc")}</p>
                </div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className="space-y-1">
                    {m.sender === "agent" ? (
                      <div className="flex gap-2.5 items-start max-w-[95%]">
                        <div className="p-1 bg-blue-600 text-white rounded shrink-0 mt-0.5">
                          <Bot className="h-3.5 w-3.5" />
                        </div>
                        <div className="bg-blue-50/70 border border-blue-200 rounded p-2.5 space-y-1 text-xs flex-1 min-w-0">
                          <div className="flex justify-between items-center gap-4 text-[9px] font-mono font-bold text-blue-700">
                            <span>{t("play.agent_cmd")}</span>
                            <span>{m.timestamp}</span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-900 font-bold bg-white p-2 rounded border border-blue-200 whitespace-pre-wrap break-all leading-relaxed">
                            {m.rawInput}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2.5 items-start max-w-[98%] ml-auto flex-row-reverse">
                        <div className="p-1 bg-slate-700 text-white rounded shrink-0 mt-0.5">
                          <Cpu className="h-3.5 w-3.5" />
                        </div>
                        <div className="bg-white rounded p-2.5 space-y-2 text-xs flex-1 min-w-0 border border-slate-300 shadow-2xs">
                          <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 border-b border-slate-200 pb-1.5">
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {t("play.response")}
                            </span>
                            <span className="flex items-center gap-1 font-semibold">
                              <Clock className="h-3 w-3" /> {m.durationMs}ms | {m.timestamp}
                            </span>
                          </div>

                          <div className="border border-slate-300 rounded overflow-hidden h-48 bg-white">
                            <Editor 
                              height="100%" 
                              defaultLanguage="json" 
                              theme={monacoTheme} 
                              value={formatJson(m.response)} 
                              beforeMount={handleMonacoBeforeMount}
                              options={{ 
                                readOnly: true, 
                                minimap: { enabled: false }, 
                                fontSize: 11, 
                                wordWrap: "on", 
                                lineNumbers: "off", 
                                scrollBeyondLastLine: false, 
                                automaticLayout: true, 
                                fontFamily: 'JetBrains Mono, monospace',
                                renderValidationDecorations: 'off'
                              }} 
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}