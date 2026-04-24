-- Migration: 20260425000007_conversation_status_history_nullable_actor
-- Resolve SYNC-PENDING T-3-05: changed_by_user_id precisa ser nullable
-- para suportar operações de sistema (webhooks) sem userId humano.
--
-- docs/20-domain/05-conversation-inbox.md §3

ALTER TABLE conversation_status_history
  ALTER COLUMN changed_by_user_id DROP NOT NULL;
