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
