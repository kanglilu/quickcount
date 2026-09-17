import Dexie, { type EntityTable } from "dexie";

export type QueueStatus = "pending" | "syncing" | "synced" | "failed";

export type PendingVoteEvent = {
  id: string;
  owner_user_id: string;
  kind: "candidate" | "golput";
  candidate_id: string | null;
  delta: 1 | -1;
  client_created_at: string;
  status: QueueStatus;
  attempts: number;
  last_error?: string;
};

class QuickCountDb extends Dexie {
  pending_vote_events!: EntityTable<PendingVoteEvent, "id">;

  constructor() {
    super("quickcount-21-tps");
    this.version(1).stores({
      pending_vote_events: "id, owner_user_id, candidate_id, status, client_created_at",
    });
    this.version(2).stores({
      pending_vote_events: "id, owner_user_id, kind, candidate_id, status, client_created_at",
    }).upgrade((transaction) => transaction.table("pending_vote_events").toCollection().modify((event) => {
      event.kind = event.kind ?? "candidate";
    }));
  }
}

export const offlineDb = new QuickCountDb();
