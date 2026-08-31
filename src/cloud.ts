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
  const projects = (projectsResult.data || []).map((item: any) => ({ ...item, category_name: item.categories?.name || "其他", category_color: item.categories?.color || "#475569", total_seconds: (item.time_sessions || []).filter((session: any) => !session.is_deleted).reduce((total: number, session: any) => total + Number(session.effective_seconds || 0), 0) }));
  const sessions = (sessionsResult.data || []).map((item: any) => ({ ...item, project_name: item.projects?.name || "", category_name: item.projects?.categories?.name || "其他", is_manual_adjusted: item.is_manual_adjusted ? 1 : 0 }));
  const actives = (timerResult.data || []).map((timer: any) => ({ ...timer, project_name: timer.projects?.name || "", category_name: timer.projects?.categories?.name || "其他", category_color: timer.projects?.categories?.color || "#475569", budget_minutes: timer.projects?.budget_minutes || 1, progress_percent: timer.projects?.progress_percent || 0 }));
  const settings = Object.fromEntries((settingsResult.data || []).map((item: any) => [item.key, item.value_json]));
  return { categories: categoriesResult.data || [], projects, sessions, actives, settings, serverNow: new Date().toISOString() };
}
