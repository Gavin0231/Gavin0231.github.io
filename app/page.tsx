"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCloudState, performCloudAction, supabase } from "../src/cloud";

type Category = { id: number; name: string; color: string; default_budget_minutes: number };
type Project = {
  id: number; name: string; category_id: number; category_name: string; category_color: string;
  priority: string; status: string; budget_minutes: number; progress_percent: number;
  notes: string; total_seconds: number;
};
type Session = {
  id: number; project_id: number; project_name: string; category_name: string;
  started_at: string; ended_at: string; effective_seconds: number; pause_seconds: number;
  notes: string; is_manual_adjusted: number;
};
type Active = {
  project_id: number; project_name: string; category_name: string; category_color: string;
  state: "running" | "paused"; started_at: string; last_resumed_at: string | null;
  accumulated_seconds: number; accumulated_pause_seconds: number;
  budget_minutes: number; progress_percent: number;
};
type State = { categories: Category[]; projects: Project[]; sessions: Session[]; actives: Active[]; settings: Record<string, unknown>; serverNow: string };

const priorityText: Record<string, string> = { high: "高", medium: "中", low: "低" };
const statusText: Record<string, string> = { not_started: "未开始", active: "进行中", paused: "已暂停", waiting: "等待中", completed: "已完成", cancelled: "已取消" };

function formatDuration(total = 0, seconds = false) {
  const value = Math.max(0, Math.floor(total));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  return seconds ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function localDateTime(value: string) {
  const date = new Date(value);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function inputDateTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Timer({ active }: { active: Active | null }) {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(id); }, []);
  return <>{formatDuration(activeDuration(active, tick), true)}</>;
}

function activeDuration(active: Active | null, tick: number) {
  if (!active) return 0;
  let seconds = Number(active.accumulated_seconds);
  if (active.state === "running" && active.last_resumed_at) seconds += Math.max(0, Math.floor((tick - Date.parse(active.last_resumed_at)) / 1000));
  return seconds;
}

export default function Home() {
  const [data, setData] = useState<State | null>(null);
  const [page, setPage] = useState("工作台");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [projectModal, setProjectModal] = useState<Project | "new" | null>(null);
  const [sessionModal, setSessionModal] = useState<Session | "new" | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [liveTick, setLiveTick] = useState(Date.now());

  async function load() {
    try {
      const json = await loadCloudState();
      localStorage.setItem("content-workbench-local-state-v1", JSON.stringify(json));
      setData(json);
      setSelectedId((current) => current ?? json.actives[0]?.project_id ?? json.projects[0]?.id ?? null);
      document.title = String(json.settings?.display_name || "内容工作台");
      setError("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "读取失败";
      if (message.toLowerCase().includes("jwt issued at future")) {
        await supabase.auth.signOut({ scope: "local" });
        setUserId(null);
        setData(null);
        setError("登录状态已失效，请重新登录");
        return;
      }
      setError(message);
    }
  }

  useEffect(() => {
    const finishAuth = (session: { user: { id: string } } | null) => {
      setUserId(session?.user.id || null);
      setAuthReady(true);
      if (window.location.hash.includes("access_token=")) window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    };
    supabase.auth.getSession().then(({ data: { session } }) => finishAuth(session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => finishAuth(session));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (userId) load(); else setData(null); }, [userId]);
  useEffect(() => {
    if (!data?.actives.length) return;
    const id = setInterval(() => setLiveTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [data?.actives]);

  async function action(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      if (!userId) throw new Error("请先登录");
      await performCloudAction(payload, userId);
      await load();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); return false; }
    finally { setBusy(false); }
  }

  const metrics = useMemo(() => {
    if (!data) return { today: 0, week: 0, month: 0 };
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart); weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const totals = data.sessions.reduce((sum, item) => {
      const start = new Date(item.started_at);
      if (start >= dayStart) sum.today += Number(item.effective_seconds);
      if (start >= weekStart) sum.week += Number(item.effective_seconds);
      if (start >= monthStart) sum.month += Number(item.effective_seconds);
      return sum;
    }, { today: 0, week: 0, month: 0 });
    for (const active of data.actives) {
      const live = activeDuration(active, liveTick);
      const start = new Date(active.started_at);
      if (start >= dayStart) totals.today += live;
      if (start >= weekStart) totals.week += live;
      if (start >= monthStart) totals.month += live;
    }
    return totals;
  }, [data, liveTick]);

  if (!authReady) return <main className="loading">正在打开内容工作台…</main>;
  if (!userId) return <main className="login"><section><h1>内容工作台</h1><p>使用你的 Google 账号登录，在不同电脑上继续同一份项目和工时。</p><button className="primary" onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } })}>使用 Google 账号登录</button>{error && <div className="error">{error}</div>}</section></main>;
  if (!data) return <main className="loading">{error || "正在读取内容工作台…"}</main>;
  const displayName = String(data.settings.display_name || "内容工作台");
  const selected = data.projects.find((item) => item.id === selectedId) ?? null;
  const selectedActive = data.actives.find((item) => item.project_id === selected?.id) ?? null;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div><div className="brand">{displayName}</div><p>专注当前项目，记录真实工时</p></div>
        <nav>{["工作台", "工时记录", "统计图表", "设置中心"].map((item) => <button key={item} className={page === item ? "active" : ""} onClick={() => setPage(item)}>{item}</button>)}</nav>
        <small>V1 · 云端版</small>
      </aside>
      <section className="content">
        {error && <div className="error">{error}<button onClick={() => setError("")}>×</button></div>}
        {page === "工作台" && <>
          <header><h1>工作台</h1><p>选择一个项目，进入当前工作区并记录真实投入时间。</p></header>
          <div className="metrics">
            <Metric title="今日工时" value={formatDuration(metrics.today, true)} />
            <Metric title="本周工时" value={formatDuration(metrics.week, true)} />
            <Metric title="本月工时" value={formatDuration(metrics.month, true)} />
            <Metric title="进行中项目" value={String(data.projects.filter((item) => item.status === "active").length)} />
          </div>
          <section className="current-card">
            <label>进行中的工作</label>
            {data.actives.length === 0 && <p>当前没有正在计时的项目。</p>}
            {data.actives.map((active) => {
              const project = data.projects.find((item) => item.id === active.project_id);
              const used = Number(project?.total_seconds || 0) + activeDuration(active, liveTick);
              return <div className="active-task" key={active.project_id}>
                <div className="active-task-head"><div><h2>{active.project_name}</h2><div className="category" style={{ background: active.category_color }}>{active.category_name}</div></div><strong><Timer active={active} /></strong></div>
                <div className="active-task-meta"><span>已用 {formatDuration(used, true)} / 预算 {formatDuration(active.budget_minutes * 60)}</span><div className="timer-actions">{active.state === "running" ? <button className="primary" disabled={busy} onClick={() => action({ action: "pause", projectId: active.project_id })}>暂停</button> : <button className="primary" disabled={busy} onClick={() => action({ action: "resume", projectId: active.project_id })}>继续</button>}<button disabled={busy} onClick={() => action({ action: "stop", projectId: active.project_id })}>结束工作</button></div></div>
                <Progress value={Math.min(100, (used / Math.max(1, active.budget_minutes * 60)) * 100)} />
              </div>;
            })}
            {selected && !selectedActive && <div className="start-candidate"><div><span>已选择项目</span><h2>{selected.name}</h2><div className="category" style={{ background: selected.category_color }}>{selected.category_name}</div></div><button className="primary" disabled={busy} onClick={() => action({ action: "start", projectId: selected.id })}>开始工作</button></div>}
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>项目列表</h2><p>当前已选择：{selected?.name || "无"}</p></div><div className="toolbar"><button disabled={!selected} onClick={() => selected && setProjectModal(selected)}>编辑</button><button className="primary" onClick={() => setProjectModal("new")}>新建项目</button></div></div>
            <ProjectTable projects={data.projects} selectedId={selectedId} onSelect={setSelectedId} actives={data.actives} liveTick={liveTick} />
          </section>
        </>}

        {page === "工时记录" && <Records data={data} onAdd={() => setSessionModal("new")} onEdit={setSessionModal} />}
        {page === "统计图表" && <Statistics data={data} />}
        {page === "设置中心" && <Settings data={data} action={action} onLogout={() => supabase.auth.signOut()} />}
      </section>
      {projectModal && <ProjectDialog value={projectModal} categories={data.categories} busy={busy} onClose={() => setProjectModal(null)} onSave={async (payload) => { if (await action({ action: "saveProject", ...payload })) setProjectModal(null); }} onArchive={projectModal !== "new" ? async () => { if (await action({ action: "archiveProject", id: projectModal.id })) setProjectModal(null); } : undefined} />}
      {sessionModal && <SessionDialog value={sessionModal} projects={data.projects} busy={busy} onClose={() => setSessionModal(null)} onSave={async (payload) => { if (await action({ action: "saveSession", ...payload })) setSessionModal(null); }} onDelete={sessionModal !== "new" ? async () => { if (await action({ action: "deleteSession", id: sessionModal.id })) setSessionModal(null); } : undefined} />}
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) { return <div className="metric"><span>{title}</span><strong>{value}</strong></div>; }
function Progress({ value }: { value: number }) { return <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }

function ProjectTable({ projects, selectedId, onSelect, actives, liveTick }: { projects: Project[]; selectedId: number | null; onSelect: (id: number) => void; actives: Active[]; liveTick: number }) {
  return <div className="table-wrap"><table><thead><tr><th>项目名称</th><th>分类</th><th>优先级</th><th>状态</th><th>完成度</th><th>已用 / 预算</th></tr></thead><tbody>{projects.map((item) => { const active = actives.find((timer) => timer.project_id === item.id) ?? null; const used = Number(item.total_seconds) + activeDuration(active, liveTick); return <tr key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => onSelect(item.id)}><td>{item.name}</td><td><b className="pill" style={{ background: item.category_color }}>{item.category_name}</b></td><td><b className={`pill priority-${item.priority}`}>{priorityText[item.priority]}</b></td><td>{statusText[item.status]}</td><td>{item.progress_percent}%</td><td>{formatDuration(used)} / {formatDuration(item.budget_minutes * 60)}</td></tr>; })}</tbody></table></div>;
}

function Records({ data, onAdd, onEdit }: { data: State; onAdd: () => void; onEdit: (session: Session) => void }) {
  return <><header><h1>工时记录</h1><p>按日期查看每一段真实计时流水，并修正异常记录。</p></header><section className="panel fill"><div className="panel-head"><div><h2>全部记录</h2><p>{data.sessions.length} 条记录 · 总计 {formatDuration(data.sessions.reduce((n, s) => n + Number(s.effective_seconds), 0))}</p></div><button className="primary" onClick={onAdd}>补录工时</button></div><div className="table-wrap"><table><thead><tr><th>日期</th><th>项目</th><th>时间段</th><th>有效时长</th><th>备注</th><th>修正状态</th><th>分类</th></tr></thead><tbody>{data.sessions.map((item) => <tr key={item.id} onClick={() => onEdit(item)}><td>{localDateTime(item.started_at).slice(0, 10)}</td><td>{item.project_name}</td><td>{localDateTime(item.started_at).slice(11)} - {localDateTime(item.ended_at).slice(11)}</td><td>{formatDuration(item.effective_seconds, true)}</td><td>{item.notes}</td><td>{item.is_manual_adjusted ? "已手动修正" : "原始记录"}</td><td>{item.category_name}</td></tr>)}</tbody></table></div></section></>;
}

function Statistics({ data }: { data: State }) {
  const categoryTotals = data.categories.map((category) => ({ ...category, seconds: data.sessions.filter((s) => s.category_name === category.name).reduce((n, s) => n + Number(s.effective_seconds), 0) })).sort((a, b) => b.seconds - a.seconds);
  const max = Math.max(1, ...categoryTotals.map((item) => item.seconds));
  return <><header><h1>统计图表</h1><p>查看项目投入、分类分布和累计完成情况。</p></header><div className="metrics"><Metric title="累计工时" value={formatDuration(data.sessions.reduce((n, s) => n + Number(s.effective_seconds), 0))} /><Metric title="项目总数" value={String(data.projects.length)} /><Metric title="已完成" value={String(data.projects.filter((p) => p.status === "completed").length)} /><Metric title="工时记录" value={String(data.sessions.length)} /></div><section className="panel"><h2>分类工时</h2><div className="bars">{categoryTotals.map((item) => <div className="bar-row" key={item.id}><span>{item.name}</span><div><i style={{ width: `${item.seconds / max * 100}%`, background: item.color }} /></div><strong>{formatDuration(item.seconds)}</strong></div>)}</div></section></>;
}

function Settings({ data, action, onLogout }: { data: State; action: (payload: Record<string, unknown>) => Promise<boolean>; onLogout: () => void }) {
  const [name, setName] = useState(String(data.settings.display_name || "内容工作台"));
  function exportCsv() {
    const rows = [["项目", "开始时间", "结束时间", "有效秒数", "备注"], ...data.sessions.map((s) => [s.project_name, localDateTime(s.started_at), localDateTime(s.ended_at), String(s.effective_seconds), s.notes])];
    download(`${name}_工时记录.csv`, "\ufeff" + rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8");
  }
  function exportHtml() {
    const rows = data.projects.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category_name)}</td><td>${formatDuration(p.total_seconds)}</td><td>${p.progress_percent}%</td></tr>`).join("");
    download(`${name}_只读报告.html`, `<!doctype html><meta charset="utf-8"><title>${escapeHtml(name)}</title><style>body{font:16px sans-serif;max-width:960px;margin:40px auto;color:#17313d}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #ccd5d9;text-align:left}</style><h1>${escapeHtml(name)}</h1><table><tr><th>项目</th><th>分类</th><th>累计工时</th><th>完成度</th></tr>${rows}</table>`, "text/html;charset=utf-8");
  }
  return <><header><h1>设置中心</h1><p>管理基础名称和数据导出。</p></header><section className="panel settings"><h2>基础设置</h2><label>软件显示名称</label><div className="inline"><input minLength={2} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} /><button className="primary" onClick={() => action({ action: "saveDisplayName", value: name })}>保存</button></div><h2>数据导出</h2><div className="inline"><button onClick={exportCsv}>导出CSV</button><button onClick={exportHtml}>导出只读HTML报告</button></div><h2>账号</h2><button onClick={onLogout}>退出登录</button></section></>;
}

function ProjectDialog({ value, categories, busy, onClose, onSave, onArchive }: { value: Project | "new"; categories: Category[]; busy: boolean; onClose: () => void; onSave: (data: Record<string, unknown>) => void; onArchive?: () => void }) {
  const initial = value === "new" ? { id: 0, name: "", categoryId: categories[0]?.id || 0, priority: "medium", status: "not_started", budgetMinutes: categories[0]?.default_budget_minutes || 60, progressPercent: 0, notes: "" } : { id: value.id, name: value.name, categoryId: value.category_id, priority: value.priority, status: value.status, budgetMinutes: value.budget_minutes, progressPercent: value.progress_percent, notes: value.notes };
  const [form, setForm] = useState(initial);
  const field = (key: string, val: unknown) => setForm({ ...form, [key]: val });
  return <div className="modal"><form onSubmit={(e) => { e.preventDefault(); onSave(form); }}><h2>{value === "new" ? "新建项目" : "编辑项目"}</h2><label>项目名称<input value={form.name} onChange={(e) => field("name", e.target.value)} required /></label><label>分类<select value={form.categoryId} onChange={(e) => field("categoryId", Number(e.target.value))}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="two"><label>优先级<select value={form.priority} onChange={(e) => field("priority", e.target.value)}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label>状态<select value={form.status} onChange={(e) => field("status", e.target.value)}>{Object.entries(statusText).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><div className="two"><label>预算（分钟）<input type="number" min="1" value={form.budgetMinutes} onChange={(e) => field("budgetMinutes", Number(e.target.value))} /></label><label>完成度（%）<input type="number" min="0" max="100" value={form.progressPercent} onChange={(e) => field("progressPercent", Number(e.target.value))} /></label></div><label>备注<textarea value={form.notes} onChange={(e) => field("notes", e.target.value)} /></label><div className="dialog-actions">{onArchive && <button type="button" className="danger" onClick={onArchive}>归档</button>}<span /><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={busy}>保存</button></div></form></div>;
}

function SessionDialog({ value, projects, busy, onClose, onSave, onDelete }: { value: Session | "new"; projects: Project[]; busy: boolean; onClose: () => void; onSave: (data: Record<string, unknown>) => void; onDelete?: () => void }) {
  const end = new Date(); const start = new Date(end.getTime() - 3600000);
  const initial = value === "new" ? { id: 0, projectId: projects[0]?.id || 0, startedAt: inputDateTime(start.toISOString()), endedAt: inputDateTime(end.toISOString()), pauseMinutes: 0, notes: "" } : { id: value.id, projectId: value.project_id, startedAt: inputDateTime(value.started_at), endedAt: inputDateTime(value.ended_at), pauseMinutes: Math.round(value.pause_seconds / 60), notes: value.notes };
  const [form, setForm] = useState(initial); const field = (key: string, val: unknown) => setForm({ ...form, [key]: val });
  return <div className="modal"><form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, startedAt: new Date(form.startedAt).toISOString(), endedAt: new Date(form.endedAt).toISOString() }); }}><h2>{value === "new" ? "补录工时" : "修正工时记录"}</h2><label>项目<select disabled={value !== "new"} value={form.projectId} onChange={(e) => field("projectId", Number(e.target.value))}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>开始时间<input type="datetime-local" value={form.startedAt} onChange={(e) => field("startedAt", e.target.value)} /></label><label>结束时间<input type="datetime-local" value={form.endedAt} onChange={(e) => field("endedAt", e.target.value)} /></label><label>暂停时长（分钟）<input type="number" min="0" value={form.pauseMinutes} onChange={(e) => field("pauseMinutes", Number(e.target.value))} /></label><label>备注<textarea value={form.notes} onChange={(e) => field("notes", e.target.value)} /></label><div className="dialog-actions">{onDelete && <button type="button" className="danger" onClick={onDelete}>删除</button>}<span /><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={busy}>保存</button></div></form></div>;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char)); }
function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
