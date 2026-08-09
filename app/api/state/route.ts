import { env } from "cloudflare:workers";

function rows<T>(result: D1Result<T>): T[] {
  return (result.results ?? []) as T[];
}

export async function GET() {
  const db = env.DB;
  const [categories, projects, sessions, active, settings] = await Promise.all([
    db.prepare("SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, id").all(),
    db.prepare(`
      SELECT p.*, c.name AS category_name, c.color AS category_color,
             COALESCE(SUM(CASE WHEN ts.is_deleted = 0 THEN ts.effective_seconds ELSE 0 END), 0) AS total_seconds
      FROM projects p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN time_sessions ts ON ts.project_id = p.id
      WHERE p.is_archived = 0
      GROUP BY p.id
      ORDER BY CASE p.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, p.updated_at DESC
    `).all(),
    db.prepare(`
      SELECT ts.*, p.name AS project_name, c.name AS category_name
      FROM time_sessions ts
      JOIN projects p ON p.id = ts.project_id
      JOIN categories c ON c.id = p.category_id
      WHERE ts.is_deleted = 0
      ORDER BY ts.started_at DESC, ts.id DESC
    `).all(),
    db.prepare(`
      SELECT a.*, p.name AS project_name, p.budget_minutes, p.progress_percent,
             c.name AS category_name, c.color AS category_color
      FROM active_timer a
      JOIN projects p ON p.id = a.project_id
      JOIN categories c ON c.id = p.category_id
      WHERE a.id = 1
    `).first(),
    db.prepare("SELECT key, value_json FROM settings").all(),
  ]);

  return Response.json({
    categories: rows(categories),
    projects: rows(projects),
    sessions: rows(sessions),
    active,
    settings: Object.fromEntries(rows<{ key: string; value_json: string }>(settings).map((item) => {
      try { return [item.key, JSON.parse(item.value_json)]; }
      catch { return [item.key, item.value_json]; }
    })),
    serverNow: new Date().toISOString(),
  });
}
