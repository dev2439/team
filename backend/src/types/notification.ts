export type BidNotification = {
  id: number;
  bid_id: number;
  recipient_user_id: number;
  actor_user_id: number;
  actor_name: string;
  bid_url: string;
  read_at: string | null;
  created_at: string;
};
