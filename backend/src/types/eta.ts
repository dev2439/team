export type EtaEntry = {
  id: number;
  project_id: number;
  user_id: number;
  amount: number;
  created_at: string;
  project_name?: string;
  user_name?: string;
};
