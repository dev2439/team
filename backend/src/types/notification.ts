export type NotificationKind = "bid" | "bid_test" | "event" | "birthday";

export type BidNotification = {
  id: number;
  kind: NotificationKind;
  bid_id: number | null;
  bid_test_id: number | null;
  event_id: number | null;
  recipient_user_id: number;
  actor_user_id: number;
  actor_name: string;
  bid_url: string;
  event_title: string;
  read_at: string | null;
  created_at: string;
};
