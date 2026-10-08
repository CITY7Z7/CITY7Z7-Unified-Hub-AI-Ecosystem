import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Search, RefreshCw, Trash2, CheckCircle2, XCircle, Terminal, 
  ChevronLeft, ChevronRight 
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/useTheme";

const handleMonacoBeforeMount = (monaco: any) => {
  if (monaco?.languages?.json) {
    monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions?.({
      validate: false,
    });
  }
};

export function Logs() {
  const { t } = useI18n();
  const { monacoTheme } = useTheme();

  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Состояния серверной пагинации и фильтрации
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");

  const loadLogs = async (targetPage = page, targetLimit = limit, targetSearch = search) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: targetPage.toString(),
        limit: targetLimit.toString(),
        search: targetSearch
      });

      const res = await fetch(`/admin/api/logs?${query}`);
      if (res.ok) {
        const data = await res.json();
        const logsList = Array.isArray(data) ? data : (Array.isArray(data.logs) ? data.logs : []);
        setLogs(logsList);
        setTotal(typeof data.total === 'number' ? data.total : logsList.length);
        setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
        setPage(typeof data.page === 'number' ? data.page : targetPage);

        if (logsList.length > 0) {
          setSelectedLog(logsList[0]);
        } else {
          setSelectedLog(null);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || t("logs.err_fetch"));
      }
    } catch {
      toast.error(t("logs.err_fetch"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(1, limit, search);
  }, [limit]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    loadLogs(1, limit, val);
  };

  const formatJson = (data: any): string => {
    if (data === undefined) return "";
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2) ?? "";
    } catch {
      return String(data);
    }
  };

  const clearLogs = async () => {
    if (!confirm(t("common.confirm_clear_logs"))) return;
    try {
      const res = await fetch("/admin/api/logs", { method: "DELETE" });
      if (res.ok) {
        toast.success(t("logs.cleared"));
        setLogs([]);
        setSelectedLog(null);
        setTotal(0);
        setTotalPages(1);
        setPage(1);
      } else {
        toast.error(t("logs.err_clear"));
      }
    } catch {
      toast.error(t("logs.err_clear"));
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#eef1f5]">
      {/* Шапка щита оператора */}
      <div className="h-12 px-4 border-b border-slate-300 bg-white flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
            {t("nav.logs")} // {t("logs.entries", { count: total })}
          </span>

          {/* Селектор количества записей на страницу */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
            <span>{t("logs.per_page")}</span>
            <select
              value={limit}
              onChange={e => {
                const newLimit = parseInt(e.target.value);
                setLimit(newLimit);
              }}
              className="h-7 text-xs font-mono border border-slate-300 rounded bg-white px-1.5 text-slate-800 focus:outline-none"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input 
              placeholder={t("common.filter_path")} 
              className="pl-8 h-8 text-xs font-mono rounded border-slate-300 bg-white" 
              value={search} 
              onChange={e => handleSearchChange(e.target.value)} 
            />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => loadLogs()} 
            className="h-8 text-xs rounded border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearLogs} 
            className="h-8 text-red-600 hover:bg-red-50 hover:text-red-700 rounded cursor-pointer" 
            title={t("common.clear")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Рабочая область щита оператора */}
      <div className="p-4 flex-1 overflow-hidden min-h-0">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Левый список логов */}
          <div className="col-span-5 border border-slate-300 rounded bg-white overflow-hidden flex flex-col shadow-2xs">
            <div className="bg-slate-100 p-2.5 text-[10px] font-mono uppercase font-bold text-slate-700 border-b border-slate-300 flex justify-between shrink-0">
              <span>{t("logs.recent")}</span>
              <span>{t("logs.status_time")}</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200 text-xs">
              {logs.map(log => (
                <div 
                  key={log.id} 
                  onClick={() => setSelectedLog(log)}
                  className={`p-2.5 cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                    selectedLog?.id === log.id 
                      ? "bg-blue-50 border-l-4 border-l-blue-600 text-slate-900 font-medium" 
                      : "hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="font-mono font-bold truncate text-[11px] text-slate-900">{log.path}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {new Date(log.createdAt).toLocaleTimeString()} • {log.callerIp}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded font-semibold text-slate-700 border border-slate-300">
                      {log.durationMs}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Пагинатор списка */}
            <div className="p-2 border-t border-slate-300 bg-slate-50 flex items-center justify-between text-xs font-mono shrink-0">
              <span className="text-[10px] text-slate-600 font-semibold">
                {t("logs.page_info", { page, totalPages })}
              </span>
              <div className="flex items-center gap-1">
                <Button 
                  size="icon" 
                  variant="outline" 
                  disabled={page <= 1 || loading}
                  onClick={() => loadLogs(page - 1)}
                  className="h-6 w-6 rounded border-slate-300 bg-white"
                  title={t("logs.prev_page")}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button 
                  size="icon" 
                  variant="outline" 
                  disabled={page >= totalPages || loading}
                  onClick={() => loadLogs(page + 1)}
                  className="h-6 w-6 rounded border-slate-300 bg-white"
                  title={t("logs.next_page")}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Правая деталка лога */}
          <div className="col-span-7 border border-slate-300 rounded bg-white overflow-hidden flex flex-col shadow-2xs">
            {selectedLog ? (
              <div className="flex flex-col h-full">
                <div className="bg-slate-50 p-3 border-b border-slate-300 flex items-center justify-between shrink-0">
                  <div>
                    <div className="font-mono font-bold text-xs flex items-center gap-2 text-slate-900">
                      <Terminal className="h-4 w-4 text-blue-600" /> {selectedLog.path}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      ID: {selectedLog.id} • {new Date(selectedLog.createdAt).toLocaleString()} • Duration: {selectedLog.durationMs}ms
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border flex items-center gap-1.5 ${
                    selectedLog.success 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300" 
                      : "bg-red-50 text-red-700 border-red-300"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedLog.success ? "bg-emerald-600" : "bg-red-600"}`} />
                    {selectedLog.success ? "SUCCESS" : "FAILED"}
                  </span>
                </div>

                <div className="flex-1 flex flex-col p-3.5 gap-3 overflow-y-auto font-mono text-xs">
                  {selectedLog.error && (
                    <div className="p-3 bg-red-50 border border-red-300 text-red-700 rounded text-xs leading-relaxed">
                      <strong>{t("logs.error_details")}</strong> {selectedLog.error}
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">{t("logs.payload_input")}</span>
                    <div className="border border-slate-300 rounded overflow-hidden bg-white">
                      <Editor 
                        height="140px" 
                        defaultLanguage="json" 
                        theme={monacoTheme} 
                        value={formatJson(selectedLog.payload)} 
                        beforeMount={handleMonacoBeforeMount}
                        options={{ 
                          readOnly: true, 
                          minimap: { enabled: false }, 
                          fontSize: 11, 
                          lineNumbers: 'off',
                          renderValidationDecorations: 'off'
                        }} 
                      />
                    </div>
                  </div>

                  <div className="space-y-1 flex-1 flex flex-col min-h-[200px]">
                    <span className="text-[10px] uppercase font-bold text-slate-500">{t("logs.kernel_response")}</span>
                    <div className="border border-slate-300 rounded overflow-hidden flex-1 bg-white">
                      <Editor 
                        height="100%" 
                        defaultLanguage="json" 
                        theme={monacoTheme} 
                        value={formatJson(selectedLog.result)} 
                        beforeMount={handleMonacoBeforeMount}
                        options={{ 
                          readOnly: true, 
                          minimap: { enabled: false }, 
                          fontSize: 11, 
                          lineNumbers: 'off',
                          renderValidationDecorations: 'off'
                        }} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs font-mono">
                {t("logs.empty_select")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}