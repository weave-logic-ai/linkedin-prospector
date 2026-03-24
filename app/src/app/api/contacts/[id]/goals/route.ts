// GET /api/contacts/[id]/goals — Goals and tasks linked to this contact

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;

    if (!contactId) {
      return NextResponse.json(
        { error: "Contact ID required" },
        { status: 400 }
      );
    }

    // Goals linked through tasks
    const goalsRes = await query<{
      id: string;
      title: string;
      description: string | null;
      goal_type: string;
      status: string;
      target_value: number;
      current_value: number;
      created_at: Date;
    }>(
      `SELECT DISTINCT g.id, g.title, g.description, g.goal_type, g.status,
              g.target_value, g.current_value, g.created_at
       FROM goals g
       JOIN tasks t ON t.goal_id = g.id
       WHERE t.contact_id = $1
       ORDER BY g.created_at DESC
       LIMIT 20`,
      [contactId]
    ).catch(() => ({ rows: [] }));

    // All tasks for this contact (including standalone ones without a goal)
    const tasksRes = await query<{
      id: string;
      title: string;
      description: string | null;
      task_type: string;
      status: string;
      priority: number;
      goal_id: string | null;
      url: string | null;
      created_at: Date;
    }>(
      `SELECT id, title, description, task_type, status, priority, goal_id, url, created_at
       FROM tasks
       WHERE contact_id = $1
       ORDER BY
         CASE status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         priority DESC, created_at DESC
       LIMIT 50`,
      [contactId]
    ).catch(() => ({ rows: [] }));

    const goals = goalsRes.rows.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      goalType: g.goal_type,
      status: g.status,
      progress: g.target_value > 0 ? g.current_value / g.target_value : 0,
      targetValue: g.target_value,
      currentValue: g.current_value,
      createdAt: g.created_at.toISOString(),
    }));

    const tasks = tasksRes.rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      taskType: t.task_type,
      status: t.status,
      priority: t.priority,
      goalId: t.goal_id,
      url: t.url,
      createdAt: t.created_at.toISOString(),
    }));

    return NextResponse.json({
      data: {
        goals,
        tasks,
        summary: {
          activeGoals: goals.filter((g) => g.status === "active" || g.status === "in_progress").length,
          pendingTasks: tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length,
          completedTasks: tasks.filter((t) => t.status === "completed").length,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load goals",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
