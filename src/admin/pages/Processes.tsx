import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Cpu, Trash2, RefreshCw, Activity, Clock, Layers } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface PoolProcess {
  catId: number;
  pid: number;
  idleSec: number;
  pendingRequests: number;
}

export function Processes() {
  const { t } = useI18n();
  const [processes, setProcesses] = useState<PoolProcess[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProcesses = async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      const res = await fetch("/admin/api/mcp/pool");
      if (res.ok) {
        const data = await res.json();
        setProcesses(Array.isArray(data) ? data : []);
      }
    } catch {
      if (isManual) toast.error("Error loading process list");
    } finally {
      if (isManual) setLoading(false);
    }
  };

  useEffect(() => {
    loadProcesses(false);
    const interval = setInterval(() => loadProcesses(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const killProcess = async (catId: number) => {
    if (!confirm(t("common.confirm_kill_process") || "Stop this MCP process?")) return;
    try {
      const res = await fetch(`/admin/api/mcp/pool/${catId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("processes.stopped", { id: catId }));
        loadProcesses(false);
      } else {
        toast.error(t("processes.stop_failed"));
      }
    } catch {
      toast.error("Network error stopping process");
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#eef1f5]">
      {/* Шапка щита оператора */}
      <div className="h-12 px-4 border-b border-slate-300 bg-white flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
            {t("nav.processes")} // {t("processes.active")}: {processes.length}
          </span>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
            POOL: {processes.length}
          </span>
          <p className="text-slate-500 text-xs hidden sm:block">
            {t("processes.desc")}
          </p>
        </div>
        <Button 
          onClick={() => loadProcesses(true)} 
          variant="outline" 
          size="sm" 
          className="h-8 text-xs rounded border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
        </Button>
      </div>

      {/* Рабочая область щита оператора */}
      <div className="p-4 flex-1 overflow-y-auto min-h-0 space-y-4">
        {processes.length === 0 ? (
          <div className="h-full border border-dashed border-slate-300 rounded bg-white flex flex-col items-center justify-center p-8 text-center shadow-2xs">
            <Layers className="h-10 w-10 text-slate-400 mb-3" />
            <p className="text-sm font-bold text-slate-800">{t("processes.empty")}</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {t("processes.empty_desc")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {processes.map((proc) => (
              <Card key={proc.catId} className="border border-slate-300 rounded bg-white overflow-hidden shadow-2xs hover:border-slate-400 transition-colors">
                <CardHeader className="bg-slate-50 border-b border-slate-300 p-3 flex flex-row items-center justify-between space-y-0">
                  <div className="min-w-0 pr-2">
                    <CardTitle className="text-xs font-mono font-bold uppercase truncate flex items-center gap-1.5 text-slate-800">
                      <Cpu className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      {t("processes.category_id", { id: proc.catId })}
                    </CardTitle>
                    <CardDescription className="font-mono text-[11px] mt-0.5 text-slate-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      PID: <span className="font-bold text-slate-800">{proc.pid}</span>
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 shrink-0 rounded cursor-pointer"
                    onClick={() => killProcess(proc.catId)}
                    title={t("common.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardHeader>
                <CardContent className="p-3 grid grid-cols-2 gap-2.5 text-xs font-mono">
                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded border border-slate-200">
                    <Clock className="h-4 w-4 text-slate-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] text-slate-500 uppercase font-sans font-bold truncate">
                        {t("processes.idle")}
                      </div>
                      <div className="font-bold truncate text-slate-800">
                        {proc.idleSec} {t("processes.seconds")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-blue-50/60 p-2.5 rounded border border-blue-200">
                    <Activity className="h-4 w-4 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] text-blue-700 uppercase font-sans font-bold truncate">
                        {t("processes.queue")}
                      </div>
                      <div className="font-bold truncate text-blue-900">
                        {proc.pendingRequests}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}