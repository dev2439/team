export type CalendarEvent = {
  id: number;
  user_id: number;
  user_name: string;
  title: string;
  note: string;
  starts_at: string;
  ends_at: string;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
};
