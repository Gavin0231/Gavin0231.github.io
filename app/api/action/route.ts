import { env } from "cloudflare:workers";

type Payload = Record<string, unknown> & { action?: string };
const now = () => new Date().toISOString();

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function secondsBetween(start: string, end: string) {
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload;
    const db = env.DB;
    const stamp = now();

    switch (body.action) {
      case "start": {
        const projectId = number(body.projectId);
        if (!projectId) throw new Error("请选择项目。");
        const existing = await db.prepare("SELECT id FROM active_timer WHERE id = 1").first();
        if (existing) throw new Error("已有项目正在计时。");
        await db.batch([
          db.prepare(`INSERT INTO active_timer(id, project_id, state, started_at, last_resumed_at, accumulated_seconds, accumulated_pause_seconds, updated_at)
            VALUES(1, ?, 'running', ?, ?, 0, 0, ?)` ).bind(projectId, stamp, stamp, stamp),
          db.prepare("UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?").bind(stamp, projectId),
        ]);
        break;
      }
      case "pause": {
        const active = await db.prepare("SELECT * FROM active_timer WHERE id = 1 AND state = 'running'").first<Record<string, unknown>>();
        if (!active) throw new Error("当前没有运行中的计时。");
        const accumulated = number(active.accumulated_seconds) + secondsBetween(String(active.last_resumed_at), stamp);
        await db.prepare("UPDATE active_timer SET state='paused', accumulated_seconds=?, paused_at=?, updated_at=? WHERE id=1")
          .bind(accumulated, stamp, stamp).run();
        break;
      }
      case "resume": {
        const active = await db.prepare("SELECT * FROM active_timer WHERE id = 1 AND state = 'paused'").first<Record<string, unknown>>();
        if (!active) throw new Error("当前没有暂停中的计时。");
        const paused = number(active.accumulated_pause_seconds) + secondsBetween(String(active.paused_at), stamp);
        await db.prepare("UPDATE active_timer SET state='running', last_resumed_at=?, paused_at=NULL, accumulated_pause_seconds=?, updated_at=? WHERE id=1")
          .bind(stamp, paused, stamp).run();
        break;
      }
      case "stop": {
        const active = await db.prepare("SELECT * FROM active_timer WHERE id = 1").first<Record<string, unknown>>();
        if (!active) throw new Error("当前没有计时。");
        let effective = number(active.accumulated_seconds);
        if (active.state === "running") effective += secondsBetween(String(active.last_resumed_at), stamp);
        await db.batch([
          db.prepare(`INSERT INTO time_sessions(project_id, started_at, ended_at, effective_seconds, pause_seconds, notes, is_manual_adjusted, is_deleted, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, 0, 0, ?, ?)` ).bind(active.project_id, active.started_at, stamp, effective, active.accumulated_pause_seconds, text(body.notes), stamp, stamp),
          db.prepare("DELETE FROM active_timer WHERE id = 1"),
          db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(stamp, active.project_id),
        ]);
        break;
      }
      case "saveProject": {
        const id = number(body.id);
        const name = text(body.name);
        if (name.length < 1) throw new Error("请输入项目名称。");
        const values = [name, number(body.categoryId), text(body.priority), text(body.status), number(body.budgetMinutes), Math.min(100, Math.max(0, number(body.progressPercent))), text(body.notes), stamp];
        if (id) {
          await db.prepare("UPDATE projects SET name=?, category_id=?, priority=?, status=?, budget_minutes=?, progress_percent=?, notes=?, updated_at=? WHERE id=?")
            .bind(...values, id).run();
        } else {
          await db.prepare(`INSERT INTO projects(name, category_id, priority, status, budget_minutes, progress_percent, notes, is_archived, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?)` ).bind(...values.slice(0, 7), stamp, stamp).run();
        }
        break;
      }
      case "archiveProject":
        await db.prepare("UPDATE projects SET is_archived=1, updated_at=? WHERE id=?").bind(stamp, number(body.id)).run();
        break;
      case "saveSession": {
        const id = number(body.id);
        const startedAt = text(body.startedAt);
        const endedAt = text(body.endedAt);
        const pauseSeconds = number(body.pauseMinutes) * 60;
        const effective = secondsBetween(startedAt, endedAt) - pauseSeconds;
        if (!startedAt || !endedAt || effective < 0) throw new Error("请检查开始、结束和暂停时间。");
        if (id) {
          await db.prepare("UPDATE time_sessions SET started_at=?, ended_at=?, effective_seconds=?, pause_seconds=?, notes=?, is_manual_adjusted=1, updated_at=? WHERE id=?")
            .bind(startedAt, endedAt, effective, pauseSeconds, text(body.notes), stamp, id).run();
        } else {
          await db.prepare(`INSERT INTO time_sessions(project_id, started_at, ended_at, effective_seconds, pause_seconds, notes, is_manual_adjusted, is_deleted, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, 1, 0, ?, ?)` ).bind(number(body.projectId), startedAt, endedAt, effective, pauseSeconds, text(body.notes), stamp, stamp).run();
        }
        break;
      }
      case "deleteSession":
        await db.prepare("UPDATE time_sessions SET is_deleted=1, updated_at=? WHERE id=?").bind(stamp, number(body.id)).run();
        break;
      case "saveDisplayName": {
        let name = text(body.value);
        if (!name) name = "内容工作台";
        if (name.length < 2 || name.length > 20) throw new Error("软件显示名称需要2至20个字符。");
        await db.prepare(`INSERT INTO settings(key, value_json, updated_at) VALUES('display_name', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`)
          .bind(JSON.stringify(name), stamp).run();
        break;
      }
      default:
        throw new Error("未知操作。");
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "操作失败。" }, { status: 400 });
  }
}
