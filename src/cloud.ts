import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://bvyzjzeepwgergcppncv.supabase.co",
  "sb_publishable_Aoo1hbybQ-1bonUXzjnH1g_QO5NGMCF",
);

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadCloudState() {
  const [categoriesResult, projectsResult, sessionsResult, timerResult, settingsResult] = await Promise.all([
    supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("projects").select("*, categories(name,color), time_sessions(effective_seconds,is_deleted)").eq("is_archived", false).order("updated_at", { ascending: false }),
    supabase.from("time_sessions").select("*, projects(name,categories(name))").eq("is_deleted", false).order("started_at", { ascending: false }),
    supabase.from("active_timer").select("*, projects(name,budget_minutes,progress_percent,categories(name,color))").order("started_at"),
    supabase.from("settings").select("key,value_json"),
  ]);
  [categoriesResult, projectsResult, sessionsResult, timerResult, settingsResult].forEach((result) => fail(result.error));

  const projects = (projectsResult.data || []).map((item: any) => ({
    ...item,
    category_name: item.categories?.name || "其他",
    category_color: item.categories?.color || "#475569",
    total_seconds: (item.time_sessions || []).filter((session: any) => !session.is_deleted).reduce((total: number, session: any) => total + Number(session.effective_seconds || 0), 0),
  }));
  const sessions = (sessionsResult.data || []).map((item: any) => ({
    ...item,
    project_name: item.projects?.name || "",
    category_name: item.projects?.categories?.name || "其他",
    is_manual_adjusted: item.is_manual_adjusted ? 1 : 0,
  }));
  const actives = (timerResult.data || []).map((timer: any) => ({
    ...timer,
    project_name: timer.projects?.name || "",
    category_name: timer.projects?.categories?.name || "其他",
    category_color: timer.projects?.categories?.color || "#475569",
    budget_minutes: timer.projects?.budget_minutes || 1,
    progress_percent: timer.projects?.progress_percent || 0,
  }));
  const settings = Object.fromEntries((settingsResult.data || []).map((item: any) => [item.key, item.value_json]));
  return { categories: categoriesResult.data || [], projects, sessions, actives, settings, serverNow: new Date().toISOString() };
}

export async function performCloudAction(payload: Record<string, any>, userId: string) {
  const action = payload.action;
  if (action === "start") fail((await supabase.rpc("timer_start", { p_project_id: payload.projectId })).error);
  else if (action === "pause") fail((await supabase.rpc("timer_pause", { p_project_id: payload.projectId })).error);
  else if (action === "resume") fail((await supabase.rpc("timer_resume", { p_project_id: payload.projectId })).error);
  else if (action === "stop") fail((await supabase.rpc("timer_stop", { p_project_id: payload.projectId, p_notes: "" })).error);
  else if (action === "saveProject") {
    const row = { user_id: userId, name: String(payload.name).trim(), category_id: payload.categoryId, priority: payload.priority, status: payload.status, budget_minutes: payload.budgetMinutes, progress_percent: payload.progressPercent, notes: payload.notes || "", updated_at: new Date().toISOString() };
    if (!row.name) throw new Error("项目名称不能为空");
    if (payload.id) fail((await supabase.from("projects").update(row).eq("id", payload.id)).error);
    else fail((await supabase.from("projects").insert(row)).error);
  } else if (action === "archiveProject") fail((await supabase.from("projects").update({ is_archived: true, updated_at: new Date().toISOString() }).eq("id", payload.id)).error);
  else if (action === "saveSession") {
    const started = new Date(payload.startedAt); const ended = new Date(payload.endedAt);
    const pauseSeconds = Math.max(0, Number(payload.pauseMinutes || 0) * 60);
    const effectiveSeconds = Math.max(0, Math.floor((ended.getTime() - started.getTime()) / 1000) - pauseSeconds);
    if (!(ended > started)) throw new Error("结束时间必须晚于开始时间");
    const row = { user_id: userId, project_id: payload.projectId, started_at: started.toISOString(), ended_at: ended.toISOString(), pause_seconds: pauseSeconds, effective_seconds: effectiveSeconds, notes: payload.notes || "", is_manual_adjusted: true, updated_at: new Date().toISOString() };
    if (payload.id) fail((await supabase.from("time_sessions").update(row).eq("id", payload.id)).error);
    else fail((await supabase.from("time_sessions").insert(row)).error);
  } else if (action === "deleteSession") fail((await supabase.from("time_sessions").update({ is_deleted: true, updated_at: new Date().toISOString() }).eq("id", payload.id)).error);
  else if (action === "saveDisplayName") {
    const trimmed = String(payload.value || "").trim();
    const value = trimmed.length >= 2 && trimmed.length <= 20 ? trimmed : "内容工作台";
    fail((await supabase.from("settings").upsert({ user_id: userId, key: "display_name", value_json: value, updated_at: new Date().toISOString() })).error);
  } else throw new Error("未知操作");
}
