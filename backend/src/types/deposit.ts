export type Deposit = {
  id: number;
  user_id: number;
  project_id: number | null;
  /** Resolved project name, or "Bid" when project_id is null. */
  project_name: string;
  amount: number;
  created_at: string;
};
