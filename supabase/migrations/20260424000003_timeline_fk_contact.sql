-- Sprint 1 T-1-12 (status table): adiciona FK timeline_event.contact_id → contact(id)
-- Sprint 0 criou a coluna sem FK pois a tabela contact não existia ainda.
-- INV-TIMELINE-07: timeline_event não é reapontado no merge — apenas leitura consolida via contact.merged_into_id

ALTER TABLE timeline_event
  ADD CONSTRAINT fk_timeline_event_contact
  FOREIGN KEY (contact_id) REFERENCES contact(id) ON DELETE RESTRICT ON UPDATE CASCADE;
