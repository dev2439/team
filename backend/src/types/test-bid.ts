export type TestBid = {
  id: number;
  url: string;
  image: string | null;
  user_id: number | null;
  created_at: string;
  /** True when at least one test_bid proposal exists for this bid_test id. */
  has_proposal: boolean;
  /**
   * When true, Member / SubBoss / Tester can see the proposal list on Test Result.
   * BigBoss always sees proposals. Default false.
   */
  results_visible: boolean;
};

export type TestBidProposal = {
  id: number;
  proposal: string;
  parent_id: number;
  user_id: number;
  created_at: string;
};

export type TestBidProposalResult = TestBidProposal & {
  user_name: string;
  parent_url: string;
  parent_image: string | null;
  /** bid_test.created_at for the parent job. */
  parent_created_at: string;
  is_favorited: boolean;
  /** How many users favorited this proposal. */
  favorites_received: number;
  my_rating: number | null;
  my_rating_comment: string | null;
  /** When the current viewer first opened this proposal (View more). */
  viewed_at: string | null;
  /**
   * Signed-in user's open order for this proposal among proposals in the same
   * bid_test (earliest of their viewed_at = 1). Null if they have not viewed it.
   */
  view_order: number | null;
  /** First bid = 5, second = 4.5, third = 4, … (by created_at ascending within parent). */
  bid_speed: number;
  /** Sum of star ratings / rating count; 0 when none. */
  avg_rating: number;
  /** (0 * bid_speed + 10 * avg_rating) / 10 — bid speed weight is 0 */
  ranking_score: number;
  /**
   * Average of each viewer's personal view_order for this proposal within the
   * parent bid_test. Lower is better. Null when nobody has viewed it.
   */
  view_score: number | null;
};

export type TestBidFavorite = {
  id: number;
  user_id: number;
  test_bid_id: number;
  created_at: string;
};

export type TestBidRating = {
  id: number;
  user_id: number;
  test_bid_id: number;
  rating: number | null;
  comment: string | null;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
};
