export type Report = {
  id: number;
  user_id: number;
  working_time: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  created_at: string;
};

export type WeekDayKey =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type WeekDayReport = {
  day: WeekDayKey;
  date: string;
  working_time: number;
  bid: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  is_today: boolean;
};
