const STORAGE_KEY = "content-workbench-local-state-v1";

type LocalState = {
  categories: any[];
  projects: any[];
  sessions: any[];
  actives: any[];
  settings: Record<string, unknown>;
  serverNow: string;
};

const defaultCategories = [
  [1, "内容制作", 120, 10, "#0F766E"], [2, "茶叶实务", 120, 20, "#3F7D20"],
  [3, "客户对接", 120, 30, "#7C3AED"], [4, "资料整理", 120, 40, "#2563A6"],
  [5, "学习研究", 120, 50, "#B45309"], [6, "运营事务", 120, 60, "#BE185D"],
  [7, "其他", 120, 70, "#475569"],
].map(([id, name, default_budget_minutes, sort_order, color]) => ({ id, name, default_budget_minutes, sort_order, color, is_active: true }));

function emptyState(): LocalState {
  return { categories: defaultCategories, projects: [], sessions: [], actives: [], settings: { display_name: "内容工作台" }, serverNow: new Date().toISOString() };
}

function read(): LocalState {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : emptyState();
  } catch {
    return emptyState();
  }
}

function write(state: LocalState) {
  state.serverNow = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function nextId(rows: any[]) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

function categoryFor(state: LocalState, id: number) {
  return state.categories.find((item) => Number(item.id) === Number(id)) || state.categories.find((item) => item.name === "其他") || defaultCategories[6];
}

function refreshTotals(state: LocalState) {
  for (const project of state.projects) project.total_seconds = state.sessions.filter((session) => Number(session.project_id) === Number(project.id)).reduce((total, session) => total + Number(session.effective_seconds || 0), 0);
}

export async function loadLocalState() {
  const state = read();
  refreshTotals(state);
  write(state);
  return state;
}

export async function performLocalAction(payload: Record<string, any>) {
  const state = read();
  const now = new Date();
  const nowIso = now.toISOString();
  const project = state.projects.find((item) => Number(item.id) === Number(payload.projectId ?? payload.id));

  if (payload.action === "start") {
    if (!project) throw new Error("项目不存在");
    if (state.actives.some((item) => Number(item.project_id) === Number(project.id))) throw new Error("该项目已在计时");
    state.actives.push({ project_id: project.id, project_name: project.name, category_name: project.category_name, category_color: project.category_color, state: "running", started_at: nowIso, last_resumed_at: nowIso, paused_at: null, accumulated_seconds: 0, accumulated_pause_seconds: 0, budget_minutes: project.budget_minutes, progress_percent: project.progress_percent });
    project.status = "active";
    project.updated_at = nowIso;
  } else if (payload.action === "pause") {
    const active = state.actives.find((item) => Number(item.project_id) === Number(payload.projectId));
    if (!active || active.state !== "running") throw new Error("当前没有运行中的计时");
    active.accumulated_seconds = Number(active.accumulated_seconds || 0) + Math.max(0, Math.floor((now.getTime() - Date.parse(active.last_resumed_at)) / 1000));
    active.state = "paused";
    active.paused_at = nowIso;
  } else if (payload.action === "resume") {
    const active = state.actives.find((item) => Number(item.project_id) === Number(payload.projectId));
    if (!active || active.state !== "paused") throw new Error("当前没有暂停中的计时");
    active.accumulated_pause_seconds = Number(active.accumulated_pause_seconds || 0) + Math.max(0, Math.floor((now.getTime() - Date.parse(active.paused_at)) / 1000));
    active.state = "running";
    active.last_resumed_at = nowIso;
    active.paused_at = null;
  } else if (payload.action === "stop") {
    const active = state.actives.find((item) => Number(item.project_id) === Number(payload.projectId));
    if (!active) throw new Error("当前没有计时");
    const effective = Number(active.accumulated_seconds || 0) + (active.state === "running" ? Math.max(0, Math.floor((now.getTime() - Date.parse(active.last_resumed_at)) / 1000)) : 0);
    state.sessions.unshift({ id: nextId(state.sessions), project_id: active.project_id, project_name: active.project_name, category_name: active.category_name, started_at: active.started_at, ended_at: nowIso, effective_seconds: effective, pause_seconds: Number(active.accumulated_pause_seconds || 0), notes: "", is_manual_adjusted: 0, is_deleted: false, created_at: nowIso, updated_at: nowIso });
    state.actives = state.actives.filter((item) => Number(item.project_id) !== Number(active.project_id));
  } else if (payload.action === "saveProject") {
    const name = String(payload.name || "").trim();
    if (!name) throw new Error("项目名称不能为空");
    const category = categoryFor(state, payload.categoryId);
    const row = { name, category_id: Number(category.id), category_name: category.name, category_color: category.color, priority: payload.priority, status: payload.status, budget_minutes: Number(payload.budgetMinutes), progress_percent: Number(payload.progressPercent), notes: payload.notes || "", updated_at: nowIso };
    if (payload.id) {
      const existing = state.projects.find((item) => Number(item.id) === Number(payload.id));
      if (!existing) throw new Error("项目不存在");
      Object.assign(existing, row);
      for (const active of state.actives.filter((item) => Number(item.project_id) === Number(existing.id))) Object.assign(active, { project_name: name, category_name: category.name, category_color: category.color, budget_minutes: row.budget_minutes, progress_percent: row.progress_percent });
    } else state.projects.unshift({ id: nextId(state.projects), ...row, total_seconds: 0, created_at: nowIso });
  } else if (payload.action === "archiveProject") {
    state.projects = state.projects.filter((item) => Number(item.id) !== Number(payload.id));
    state.actives = state.actives.filter((item) => Number(item.project_id) !== Number(payload.id));
  } else if (payload.action === "saveSession") {
    const selected = state.projects.find((item) => Number(item.id) === Number(payload.projectId));
    if (!selected) throw new Error("项目不存在");
    const started = new Date(payload.startedAt);
    const ended = new Date(payload.endedAt);
    if (!(ended > started)) throw new Error("结束时间必须晚于开始时间");
    const pauseSeconds = Math.max(0, Number(payload.pauseMinutes || 0) * 60);
    const row = { project_id: selected.id, project_name: selected.name, category_name: selected.category_name, started_at: started.toISOString(), ended_at: ended.toISOString(), pause_seconds: pauseSeconds, effective_seconds: Math.max(0, Math.floor((ended.getTime() - started.getTime()) / 1000) - pauseSeconds), notes: payload.notes || "", is_manual_adjusted: 1, is_deleted: false, updated_at: nowIso };
    if (payload.id) {
      const existing = state.sessions.find((item) => Number(item.id) === Number(payload.id));
      if (!existing) throw new Error("工时记录不存在");
      Object.assign(existing, row);
    } else state.sessions.unshift({ id: nextId(state.sessions), ...row, created_at: nowIso });
  } else if (payload.action === "deleteSession") {
    state.sessions = state.sessions.filter((item) => Number(item.id) !== Number(payload.id));
  } else if (payload.action === "saveDisplayName") {
    const trimmed = String(payload.value || "").trim();
    state.settings.display_name = trimmed.length >= 2 && trimmed.length <= 20 ? trimmed : "内容工作台";
  } else throw new Error("未知操作");

  refreshTotals(state);
  write(state);
}
