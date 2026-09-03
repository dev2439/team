import { getApiBase, getToken } from "@/lib/auth";

export type PlanItemStatus = "pending" | "done" | "not_done";
export type PlanItemScope = "day" | "week" | "month";

export type PlanItem = {
  id: number;
  user_id: number;
  plan_date: string;
  scope: PlanItemScope;
  title: string;
  status: PlanItemStatus;
  note: string;
  not_done_reason: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  user_name?: string;
};

type ErrorResponse = {
  error: string;
};

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new Error("Not signed in");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers,
  });

  const data = (await res.json()) as T | ErrorResponse;

  if (!res.ok) {
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? data.error
        : "Request failed",
    );
  }

  return data as T;
}

export async function fetchPlansInRange(input: {
  from: string;
  to: string;
  userId?: number;
}): Promise<PlanItem[]> {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
  });
  if (input.userId != null) {
    params.set("user_id", String(input.userId));
  }
  const data = await authFetch<{ plans: PlanItem[] }>(
    `/api/plans?${params.toString()}`,
  );
  return data.plans;
}

export async function createPlanRequest(input: {
  planDate: string;
  title: string;
  scope?: PlanItemScope;
  userId?: number;
}): Promise<PlanItem> {
  const data = await authFetch<{ plan: PlanItem }>("/api/plans", {
    method: "POST",
    body: JSON.stringify({
      plan_date: input.planDate,
      title: input.title,
      scope: input.scope ?? "day",
      user_id: input.userId,
    }),
  });
  return data.plan;
}

export async function updatePlanRequest(input: {
  id: number;
  title?: string;
  status?: PlanItemStatus;
  note?: string;
  notDoneReason?: string;
}): Promise<PlanItem> {
  const data = await authFetch<{ plan: PlanItem }>(`/api/plans/${input.id}`, {
    method: "PUT",
    body: JSON.stringify({
      title: input.title,
      status: input.status,
      note: input.note,
      not_done_reason: input.notDoneReason,
    }),
  });
  return data.plan;
}

export async function deletePlanRequest(id: number): Promise<void> {
  await authFetch<{ ok: boolean }>(`/api/plans/${id}`, {
    method: "DELETE",
  });
}
