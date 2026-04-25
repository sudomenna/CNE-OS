-- =============================================================================
-- seed-e2e.sql — Seed mínimo para rodar os specs Playwright do Sprint 8
--
-- Uso:
--   supabase db query --linked --file scripts/seed-e2e.sql
--
-- Idempotente:
--   Usa SET session_replication_role = replica para desabilitar todos os
--   triggers (imutabilidade, append-only) durante o cleanup inicial.
--   Após o cleanup, volta para DEFAULT antes dos INSERTs principais.
--
-- Circular FK transaction ↔ transaction_snapshot:
--   1. INSERT transaction (pending)  2. INSERT snapshot  3. UPDATE → approved
-- =============================================================================

DO $$
DECLARE
  v_brand_id              UUID := '11111111-0000-0000-0000-000000000001';
  v_legal_entity_id       UUID := '11111111-0000-0000-0000-000000000002';
  v_contact_id            UUID := '11111111-0000-0000-0000-000000000003';
  v_product_category_id   UUID := '11111111-0000-0000-0000-000000000004';
  v_product_id            UUID := '11111111-0000-0000-0000-000000000005';
  v_offer_id              UUID := '11111111-0000-0000-0000-000000000006';
  v_condition_id          UUID := '11111111-0000-0000-0000-000000000007';
  v_condition_item_id     UUID := '11111111-0000-0000-0000-000000000008';
  v_payment_option_id     UUID := '11111111-0000-0000-0000-000000000009';
  v_txn_approved_id       UUID := '11111111-0000-0000-0000-000000000010';
  v_txn_refused_id        UUID := '11111111-0000-0000-0000-000000000011';
  v_snapshot_id           UUID := '11111111-0000-0000-0000-000000000012';
  v_txn_item_id           UUID := '11111111-0000-0000-0000-000000000013';
  v_entitlement_id        UUID := '11111111-0000-0000-0000-000000000014';
  v_webhook_received_id   UUID := '11111111-0000-0000-0000-000000000015';
  v_webhook_dlq_id        UUID := '11111111-0000-0000-0000-000000000016';
  v_role_id               UUID;
  v_user_id               UUID;
  v_now                   TIMESTAMPTZ := NOW();
BEGIN

  -- =========================================================================
  -- CLEANUP — desabilita triggers via session_replication_role=replica para
  -- resetar estado mutável de execuções anteriores (refunds, snapshot, webhook).
  -- =========================================================================
  SET session_replication_role = replica;

  -- Remove refunds criados por runs anteriores dos testes E2E
  DELETE FROM refund_effect_log     WHERE refund_id IN (SELECT id FROM refund WHERE transaction_id = v_txn_approved_id);
  DELETE FROM refund_status_history WHERE refund_id IN (SELECT id FROM refund WHERE transaction_id = v_txn_approved_id);
  DELETE FROM refund                WHERE transaction_id = v_txn_approved_id;

  -- Reseta transação aprovada → pending (nullify snapshot FK antes de deletar snapshot)
  UPDATE transaction
  SET snapshot_id = NULL, status = 'pending', approved_at = NULL, updated_at = v_now
  WHERE id = v_txn_approved_id;

  -- Remove transaction_item e snapshot (bloco cleanup deleta para permitir re-insert correto)
  DELETE FROM transaction_item     WHERE transaction_id = v_txn_approved_id;
  DELETE FROM transaction_snapshot WHERE id = v_snapshot_id;

  -- Reseta webhook DLQ → dead_letter (pode ter sido reprocessado por run anterior)
  UPDATE webhook_log
  SET status = 'dead_letter', attempts = 5,
      dead_lettered_at = v_now, processed_at = NULL
  WHERE id = v_webhook_dlq_id;

  -- Reabilita triggers antes dos INSERTs principais
  SET session_replication_role = DEFAULT;

  RAISE NOTICE 'Cleanup concluído — inserindo dados seed...';

  -- =========================================================================
  -- DADOS BASE
  -- =========================================================================

  -- brand
  INSERT INTO brand (id, name, slug, created_at, updated_at)
  VALUES (v_brand_id, 'Seed Brand E2E', 'seed-brand-e2e', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- legal_entity
  INSERT INTO legal_entity (id, company_name, cnpj, tax_regime, created_at, updated_at)
  VALUES (v_legal_entity_id, 'Seed Empresa Ltda', '00000000000100', 'simples', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- brand_legal_entity  (sem updated_at — tabela join simples)
  INSERT INTO brand_legal_entity (brand_id, legal_entity_id, is_default, created_at)
  VALUES (v_brand_id, v_legal_entity_id, true, v_now)
  ON CONFLICT (brand_id, legal_entity_id) DO NOTHING;

  -- user_account (para o usuário Supabase já existente)
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'tiagomenna@gmail.com' LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- totp_enabled=true + last_login_at no futuro: garante twoFactorRecentlyVerified=true por 1h
    -- (lib/auth/session.ts: twoFactorRecentlyVerified = totpEnabled && lastLoginAt within 5min)
    INSERT INTO user_account (id, email, full_name, is_active, totp_enabled, last_login_at, created_at, updated_at)
    SELECT v_user_id, email, COALESCE(raw_user_meta_data->>'full_name', email), true, true,
           v_now + INTERVAL '1 hour', v_now, v_now
    FROM auth.users WHERE id = v_user_id
    ON CONFLICT (id) DO UPDATE SET
      totp_enabled   = true,
      last_login_at  = EXCLUDED.last_login_at,
      updated_at     = EXCLUDED.updated_at;
  END IF;

  -- role admin  (sem timestamps — tabela simples)
  INSERT INTO role (kind, description)
  VALUES ('admin', 'Administrador — acesso total')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_role_id FROM role WHERE kind = 'admin' LIMIT 1;

  -- user_role
  IF v_user_id IS NOT NULL AND v_role_id IS NOT NULL THEN
    INSERT INTO user_role (user_id, role_id, granted_at)
    VALUES (v_user_id, v_role_id, v_now)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  -- contact
  INSERT INTO contact (id, full_name, status, classification, origin, created_at, updated_at)
  VALUES (v_contact_id, 'João Seed E2E', 'active', 'customer', 'seed-e2e', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- contact_email
  INSERT INTO contact_email (id, contact_id, email, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_contact_id, 'joao.seed.e2e@example.com', 'primary', v_now, v_now)
  ON CONFLICT DO NOTHING;

  -- product_category
  INSERT INTO product_category (id, brand_id, name, slug, created_at, updated_at)
  VALUES (v_product_category_id, v_brand_id, 'Cursos Seed', 'cursos-seed', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- product
  INSERT INTO product (id, brand_id, category_id, name, slug, kind, status, created_at, updated_at)
  VALUES (v_product_id, v_brand_id, v_product_category_id, 'Produto Seed E2E', 'produto-seed-e2e', 'course', 'active', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- offer
  INSERT INTO offer (id, brand_id, issuing_legal_entity_id, name, slug, type, status, created_at, updated_at)
  VALUES (v_offer_id, v_brand_id, v_legal_entity_id, 'Oferta Seed E2E', 'oferta-seed-e2e', 'regular', 'active', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- offer_sales_counter
  INSERT INTO offer_sales_counter (offer_id, approved_count, updated_at)
  VALUES (v_offer_id, 1, v_now)
  ON CONFLICT (offer_id) DO NOTHING;

  -- offer_condition (default + active)
  INSERT INTO offer_condition (id, offer_id, name, priority, advantage_score, status, is_public, is_default, created_at, updated_at)
  VALUES (v_condition_id, v_offer_id, 'Condição Padrão Seed', 0, '0', 'active', true, true, v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- offer_condition_item (kind=main → product_id NOT NULL)
  INSERT INTO offer_condition_item (id, offer_condition_id, kind, product_id, quantity, access_rule, order_index, created_at, updated_at)
  VALUES (v_condition_item_id, v_condition_id, 'main', v_product_id, 1, '{}', 0, v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- offer_payment_option (pix)
  INSERT INTO offer_payment_option (id, offer_condition_id, method, price, is_active, created_at, updated_at)
  VALUES (v_payment_option_id, v_condition_id, 'pix', '497.00', true, v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- TRANSACTION APROVADA — circular FK: pending → snapshot → approved
  -- =========================================================================

  -- Passo 1: INSERT pending (snapshot_id = NULL)
  INSERT INTO transaction (
    id, brand_id, contact_id, offer_id, offer_condition_id, offer_payment_option_id,
    status, amount, currency, external_provider, external_id, created_at, updated_at
  )
  VALUES (
    v_txn_approved_id, v_brand_id, v_contact_id, v_offer_id, v_condition_id, v_payment_option_id,
    'pending', '497.00', 'BRL', 'digital_guru', 'EXT-SEED-001', v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- Passo 2: snapshot (cleanup deletou o antigo — INSERT sempre cria novo)
  INSERT INTO transaction_snapshot (id, transaction_id, payload, created_at)
  VALUES (
    v_snapshot_id,
    v_txn_approved_id,
    jsonb_build_object(
      'version', 1,
      'captured_at', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'brand', jsonb_build_object('id', v_brand_id, 'name', 'Seed Brand E2E', 'slug', 'seed-brand-e2e'),
      'legal_entity', jsonb_build_object('id', v_legal_entity_id, 'cnpj', '00000000000100', 'company_name', 'Seed Empresa Ltda', 'tax_regime', 'simples'),
      'offer', jsonb_build_object('id', v_offer_id, 'name', 'Oferta Seed E2E', 'slug', 'oferta-seed-e2e', 'type', 'regular'),
      'condition', jsonb_build_object('id', v_condition_id, 'name', 'Condição Padrão Seed', 'priority', 0, 'advantage_score', 0, 'is_default', true, 'is_public', true),
      'rules', jsonb_build_object('group_id', gen_random_uuid()::text, 'operator', 'and', 'children', '[]'::jsonb, 'evaluation', 'fallback_default', 'context_snapshot', '{}'::jsonb),
      'items', jsonb_build_array(
        jsonb_build_object(
          'condition_item_id', v_condition_item_id,
          'kind', 'main',
          'product', jsonb_build_object('id', v_product_id, 'name', 'Produto Seed E2E', 'slug', 'produto-seed-e2e', 'kind', 'course'),
          'quantity', 1,
          'access_rule', '{}'::jsonb,
          'vigency_months', NULL,
          'discount', NULL,
          'responsible_user_id', NULL
        )
      ),
      'payment_option', jsonb_build_object(
        'id', v_payment_option_id,
        'method', 'pix',
        'price', 497.00,
        'installments', NULL,
        'custom_config', '{}'::jsonb
      ),
      'source', jsonb_build_object(
        'provider', 'digital_guru',
        'external_id', 'EXT-SEED-001',
        'raw_event_id', NULL
      )
    ),
    v_now
  );

  -- transaction_item
  INSERT INTO transaction_item (id, transaction_id, item_kind, product_id, quantity, resolved_rules, delivery_status, snapshot_id, created_at, updated_at)
  VALUES (v_txn_item_id, v_txn_approved_id, 'main', v_product_id, 1, '{}', 'pending', v_snapshot_id, v_now, v_now);

  -- Passo 3: UPDATE → approved
  UPDATE transaction
  SET status = 'approved', snapshot_id = v_snapshot_id, approved_at = v_now, updated_at = v_now
  WHERE id = v_txn_approved_id AND status = 'pending';

  -- status_history para aprovada
  INSERT INTO transaction_status_history (id, transaction_id, from_status, to_status, actor_system, reason, created_at)
  VALUES (gen_random_uuid(), v_txn_approved_id, 'pending', 'approved', 'seed-e2e', 'Seed E2E', v_now)
  ON CONFLICT DO NOTHING;

  -- =========================================================================
  -- CUSTOMER ENTITLEMENT
  -- =========================================================================
  INSERT INTO customer_entitlement (
    id, contact_id, brand_id, kind, ref_kind, ref_id,
    quantity, started_at, ends_at, status,
    origin_transaction_id, last_update_transaction_id,
    access_rule, created_at, updated_at
  )
  VALUES (
    v_entitlement_id, v_contact_id, v_brand_id,
    'product_access', 'product', v_product_id,
    1, v_now, NULL, 'active',
    v_txn_approved_id, v_txn_approved_id,
    '{}', v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- TRANSACTION RECUSADA
  -- =========================================================================
  INSERT INTO transaction (
    id, brand_id, contact_id, offer_id, offer_condition_id, offer_payment_option_id,
    status, amount, currency, external_provider, external_id,
    refused_at, created_at, updated_at
  )
  VALUES (
    v_txn_refused_id, v_brand_id, v_contact_id, v_offer_id, v_condition_id, v_payment_option_id,
    'refused', '497.00', 'BRL', 'digital_guru', 'EXT-SEED-002',
    v_now, v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO transaction_status_history (id, transaction_id, from_status, to_status, actor_system, reason, created_at)
  VALUES (gen_random_uuid(), v_txn_refused_id, 'pending', 'refused', 'seed-e2e', 'Seed E2E', v_now)
  ON CONFLICT DO NOTHING;

  -- =========================================================================
  -- WEBHOOK LOG — processed (para CT-FLOW12-02: detalhe de um webhook qualquer)
  -- =========================================================================
  INSERT INTO webhook_log (id, provider, external_event_id, payload, status, attempts, received_at, processed_at)
  VALUES (
    v_webhook_received_id, 'digital_guru', 'SEED-EVT-RECEIVED-001',
    '{"event_type": "purchase_approved", "id": "SEED-EVT-RECEIVED-001"}'::jsonb,
    'processed', 1, v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- WEBHOOK LOG — dead_letter (para CT-FLOW12-03 e CT-FLOW12-04)
  -- O bloco de cleanup já resetou o status via UPDATE.
  -- =========================================================================
  INSERT INTO webhook_log (id, provider, external_event_id, payload, status, attempts, last_error, received_at, dead_lettered_at)
  VALUES (
    v_webhook_dlq_id, 'digital_guru', 'SEED-EVT-DLQ-001',
    '{"event_type": "purchase_approved", "id": "SEED-EVT-DLQ-001"}'::jsonb,
    'dead_letter', 5, 'Falha após 5 tentativas — seed E2E',
    v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- OUTPUT
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SEED E2E CONCLUÍDO ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Adicione ao .env.local:';
  RAISE NOTICE '';
  RAISE NOTICE 'SEED_E2E=true';
  RAISE NOTICE 'E2E_ADMIN_EMAIL=tiagomenna@gmail.com';
  RAISE NOTICE 'E2E_ADMIN_PASSWORD=<sua senha>';
  RAISE NOTICE 'E2E_TRANSACTION_ID=%', v_txn_approved_id;
  RAISE NOTICE 'E2E_REFUSED_TRANSACTION_ID=%', v_txn_refused_id;
  RAISE NOTICE 'E2E_APPROVED_TRANSACTION_ID=%', v_txn_approved_id;
  RAISE NOTICE 'E2E_CONTACT_ID=%', v_contact_id;
  RAISE NOTICE 'E2E_WEBHOOK_LOG_ID=%', v_webhook_received_id;
  RAISE NOTICE 'E2E_DEAD_LETTER_WEBHOOK_ID=%', v_webhook_dlq_id;

END $$;

-- =============================================================================
-- SEED E2E — BILLING (FLOW-11 — subscription-cycle)
--
-- Cria 5 subscriptions em estados pre-computados para os cenarios do FLOW-11:
--   sub_trial_id    — status=active (trial expirado + parcela paga → advanceSubscription ja executado)
--   sub_past_due_id — status=past_due (active com installment overdue)
--   sub_active_id   — status=active (past_due recuperado por pagamento)
--   sub_dunning_id  — status=cancelled, cancel_reason='dunning_exhausted'
--   sub_cancel_id   — status=active (para cancelamento manual no CT-FLOW11-05)
--
-- Todas compartilham:
--   - o mesmo contact (v_billing_contact_id, com entitlement ativo)
--   - mesmos brand/offer/condition/payment_option do seed principal
--   - origin_transaction = v_txn_approved_id (transacao aprovada do seed principal)
--
-- Nota: advanceSubscription nao e chamado aqui — o estado final e inserido
-- diretamente para refletir o resultado esperado em cada cenario.
-- =============================================================================

DO $$
DECLARE
  -- Reutiliza UUIDs fixos do seed principal
  v_brand_id              UUID := '11111111-0000-0000-0000-000000000001';
  v_contact_id            UUID := '11111111-0000-0000-0000-000000000003';
  v_offer_id              UUID := '11111111-0000-0000-0000-000000000006';
  v_condition_id          UUID := '11111111-0000-0000-0000-000000000007';
  v_payment_option_id     UUID := '11111111-0000-0000-0000-000000000009';
  v_txn_approved_id       UUID := '11111111-0000-0000-0000-000000000010';
  v_product_id            UUID := '11111111-0000-0000-0000-000000000005';

  -- UUIDs exclusivos do seed billing
  v_billing_contact_id    UUID := '22222222-0000-0000-0000-000000000001';
  v_billing_txn_id        UUID := '22222222-0000-0000-0000-000000000002';
  v_billing_snapshot_id   UUID := '22222222-0000-0000-0000-000000000003';
  v_billing_txn_item_id   UUID := '22222222-0000-0000-0000-000000000004';

  -- Subscriptions
  v_sub_trial_id          UUID := '22222222-0000-0000-0001-000000000001';
  v_sub_past_due_id       UUID := '22222222-0000-0000-0002-000000000001';
  v_sub_active_id         UUID := '22222222-0000-0000-0003-000000000001';
  v_sub_dunning_id        UUID := '22222222-0000-0000-0004-000000000001';
  v_sub_cancel_id         UUID := '22222222-0000-0000-0005-000000000001';

  -- Installments
  v_inst_trial_id         UUID := '22222222-0000-0000-0001-000000000002';
  v_inst_past_due_id      UUID := '22222222-0000-0000-0002-000000000002';
  v_inst_active_id        UUID := '22222222-0000-0000-0003-000000000002';
  v_inst_dunning_id       UUID := '22222222-0000-0000-0004-000000000002';
  v_inst_cancel_id        UUID := '22222222-0000-0000-0005-000000000002';

  -- Entitlement do contato billing
  v_billing_entitlement_id UUID := '22222222-0000-0000-0000-000000000010';

  v_now                   TIMESTAMPTZ := NOW();
  v_period_start          TIMESTAMPTZ := NOW() - INTERVAL '30 days';
  v_period_end_future     TIMESTAMPTZ := NOW() + INTERVAL '30 days';
  v_period_end_past       TIMESTAMPTZ := NOW() - INTERVAL '1 day';
BEGIN

  -- =========================================================================
  -- CLEANUP — billing seed (resetar estado de runs anteriores)
  -- =========================================================================
  SET session_replication_role = replica;

  DELETE FROM installment_status_history
    WHERE installment_id IN (
      v_inst_trial_id, v_inst_past_due_id, v_inst_active_id,
      v_inst_dunning_id, v_inst_cancel_id
    );
  DELETE FROM subscription_status_history
    WHERE subscription_id IN (
      v_sub_trial_id, v_sub_past_due_id, v_sub_active_id,
      v_sub_dunning_id, v_sub_cancel_id
    );
  DELETE FROM installment
    WHERE id IN (
      v_inst_trial_id, v_inst_past_due_id, v_inst_active_id,
      v_inst_dunning_id, v_inst_cancel_id
    );
  DELETE FROM subscription
    WHERE id IN (
      v_sub_trial_id, v_sub_past_due_id, v_sub_active_id,
      v_sub_dunning_id, v_sub_cancel_id
    );
  DELETE FROM customer_entitlement WHERE id = v_billing_entitlement_id;
  DELETE FROM transaction_item WHERE transaction_id = v_billing_txn_id;
  UPDATE transaction SET snapshot_id = NULL WHERE id = v_billing_txn_id;
  DELETE FROM transaction_snapshot WHERE id = v_billing_snapshot_id;
  DELETE FROM transaction WHERE id = v_billing_txn_id;
  DELETE FROM contact_email WHERE contact_id = v_billing_contact_id;
  DELETE FROM contact WHERE id = v_billing_contact_id;

  SET session_replication_role = DEFAULT;

  -- =========================================================================
  -- CONTATO BILLING (separado do contato do seed principal)
  -- =========================================================================
  INSERT INTO contact (id, full_name, status, classification, origin, created_at, updated_at)
  VALUES (v_billing_contact_id, 'Maria Billing E2E', 'active', 'customer', 'seed-e2e-billing', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO contact_email (id, contact_id, email, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_billing_contact_id, 'maria.billing.e2e@example.com', 'primary', v_now, v_now)
  ON CONFLICT DO NOTHING;

  -- =========================================================================
  -- TRANSACTION FUNDADORA (origin_transaction para as subscriptions billing)
  -- Circular FK: pending → snapshot → approved
  -- =========================================================================

  -- Passo 1: INSERT pending
  INSERT INTO transaction (
    id, brand_id, contact_id, offer_id, offer_condition_id, offer_payment_option_id,
    status, amount, currency, external_provider, external_id, created_at, updated_at
  )
  VALUES (
    v_billing_txn_id, v_brand_id, v_billing_contact_id, v_offer_id, v_condition_id, v_payment_option_id,
    'pending', '497.00', 'BRL', 'digital_guru', 'EXT-BILLING-SEED-001', v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- Passo 2: snapshot
  INSERT INTO transaction_snapshot (id, transaction_id, payload, created_at)
  VALUES (
    v_billing_snapshot_id,
    v_billing_txn_id,
    jsonb_build_object(
      'version', 1,
      'captured_at', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'brand', jsonb_build_object('id', v_brand_id, 'name', 'Seed Brand E2E', 'slug', 'seed-brand-e2e'),
      'legal_entity', jsonb_build_object('id', '11111111-0000-0000-0000-000000000002', 'cnpj', '00000000000100', 'company_name', 'Seed Empresa Ltda', 'tax_regime', 'simples'),
      'offer', jsonb_build_object('id', v_offer_id, 'name', 'Oferta Seed E2E', 'slug', 'oferta-seed-e2e', 'type', 'regular'),
      'condition', jsonb_build_object('id', v_condition_id, 'name', 'Condicao Padrao Seed', 'priority', 0, 'advantage_score', 0, 'is_default', true, 'is_public', true),
      'rules', jsonb_build_object('group_id', gen_random_uuid()::text, 'operator', 'and', 'children', '[]'::jsonb, 'evaluation', 'fallback_default', 'context_snapshot', '{}'::jsonb),
      'items', jsonb_build_array(
        jsonb_build_object(
          'condition_item_id', '11111111-0000-0000-0000-000000000008',
          'kind', 'main',
          'product', jsonb_build_object('id', v_product_id, 'name', 'Produto Seed E2E', 'slug', 'produto-seed-e2e', 'kind', 'course'),
          'quantity', 1,
          'access_rule', '{}'::jsonb,
          'vigency_months', NULL,
          'discount', NULL,
          'responsible_user_id', NULL
        )
      ),
      'payment_option', jsonb_build_object(
        'id', v_payment_option_id,
        'method', 'pix',
        'price', 497.00,
        'installments', NULL,
        'custom_config', '{}'::jsonb
      ),
      'source', jsonb_build_object(
        'provider', 'digital_guru',
        'external_id', 'EXT-BILLING-SEED-001',
        'raw_event_id', NULL
      )
    ),
    v_now
  );

  -- transaction_item
  INSERT INTO transaction_item (id, transaction_id, item_kind, product_id, quantity, resolved_rules, delivery_status, snapshot_id, created_at, updated_at)
  VALUES (v_billing_txn_item_id, v_billing_txn_id, 'main', v_product_id, 1, '{}', 'pending', v_billing_snapshot_id, v_now, v_now);

  -- Passo 3: UPDATE → approved
  UPDATE transaction
  SET status = 'approved', snapshot_id = v_billing_snapshot_id, approved_at = v_now, updated_at = v_now
  WHERE id = v_billing_txn_id AND status = 'pending';

  -- =========================================================================
  -- ENTITLEMENT DO CONTATO BILLING
  -- INV-BILL-07: persiste mesmo apos cancelamento de subscription
  -- =========================================================================
  INSERT INTO customer_entitlement (
    id, contact_id, brand_id, kind, ref_kind, ref_id,
    quantity, started_at, ends_at, status,
    origin_transaction_id, last_update_transaction_id,
    access_rule, created_at, updated_at
  )
  VALUES (
    v_billing_entitlement_id, v_billing_contact_id, v_brand_id,
    'product_access', 'product', v_product_id,
    1, v_now, v_period_end_future, 'active',
    v_billing_txn_id, v_billing_txn_id,
    '{}', v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- CT-FLOW11-01: subscription status=active
  -- Representa: trial expirado + parcela paga → advanceSubscription → active
  -- =========================================================================
  INSERT INTO subscription (
    id, contact_id, brand_id, offer_id, offer_condition_id, offer_payment_option_id,
    origin_transaction_id, status,
    current_period_start, current_period_end,
    next_billing_at, trial_ends_at,
    created_at, updated_at
  )
  VALUES (
    v_sub_trial_id, v_billing_contact_id, v_brand_id, v_offer_id, v_condition_id, v_payment_option_id,
    v_billing_txn_id, 'active',
    v_period_start, v_period_end_future,
    v_period_end_future, NULL,
    v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- Installment pago (prova do pagamento que fez trial→active)
  INSERT INTO installment (
    id, subscription_id, sequence, due_at, amount, status, paid_at, created_at, updated_at
  )
  VALUES (
    v_inst_trial_id, v_sub_trial_id, 1,
    v_period_start + INTERVAL '7 days',
    '497.00', 'paid', v_period_start + INTERVAL '7 days',
    v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- CT-FLOW11-02: subscription status=past_due
  -- Representa: active com installment overdue → advanceSubscription → past_due
  -- =========================================================================
  INSERT INTO subscription (
    id, contact_id, brand_id, offer_id, offer_condition_id, offer_payment_option_id,
    origin_transaction_id, status,
    current_period_start, current_period_end,
    next_billing_at,
    created_at, updated_at
  )
  VALUES (
    v_sub_past_due_id, v_billing_contact_id, v_brand_id, v_offer_id, v_condition_id, v_payment_option_id,
    v_billing_txn_id, 'past_due',
    v_period_start, v_period_end_past,
    NULL,
    v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- Installment overdue (vencida ha 5 dias)
  INSERT INTO installment (
    id, subscription_id, sequence, due_at, amount, status, retry_count, created_at, updated_at
  )
  VALUES (
    v_inst_past_due_id, v_sub_past_due_id, 1,
    v_now - INTERVAL '5 days',
    '497.00', 'overdue', 1,
    v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- CT-FLOW11-03: subscription status=active (apos recuperacao de past_due)
  -- Representa: past_due + installment pago (retry sucedeu) → active
  -- =========================================================================
  INSERT INTO subscription (
    id, contact_id, brand_id, offer_id, offer_condition_id, offer_payment_option_id,
    origin_transaction_id, status,
    current_period_start, current_period_end,
    next_billing_at,
    created_at, updated_at
  )
  VALUES (
    v_sub_active_id, v_billing_contact_id, v_brand_id, v_offer_id, v_condition_id, v_payment_option_id,
    v_billing_txn_id, 'active',
    v_now - INTERVAL '1 day', v_period_end_future,
    v_period_end_future,
    v_now - INTERVAL '35 days', v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- Installment pago recentemente (o retry que recuperou a subscription)
  INSERT INTO installment (
    id, subscription_id, sequence, due_at, amount, status, paid_at,
    retry_count, last_retry_at, created_at, updated_at
  )
  VALUES (
    v_inst_active_id, v_sub_active_id, 1,
    v_now - INTERVAL '5 days',
    '497.00', 'paid', v_now - INTERVAL '1 hour',
    1, v_now - INTERVAL '3 days',
    v_now - INTERVAL '35 days', v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- CT-FLOW11-04: subscription status=cancelled (dunning_exhausted)
  -- Representa: past_due com D+15 sem pagamento → cancelled
  -- =========================================================================
  INSERT INTO subscription (
    id, contact_id, brand_id, offer_id, offer_condition_id, offer_payment_option_id,
    origin_transaction_id, status,
    current_period_start, current_period_end,
    next_billing_at,
    cancelled_at, cancel_reason,
    created_at, updated_at
  )
  VALUES (
    v_sub_dunning_id, v_billing_contact_id, v_brand_id, v_offer_id, v_condition_id, v_payment_option_id,
    v_billing_txn_id, 'cancelled',
    v_now - INTERVAL '45 days', v_period_end_future,
    NULL,
    v_now, 'dunning_exhausted',
    v_now - INTERVAL '45 days', v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- Installment ainda overdue (nao pago, D+16)
  INSERT INTO installment (
    id, subscription_id, sequence, due_at, amount, status,
    retry_count, last_retry_at, created_at, updated_at
  )
  VALUES (
    v_inst_dunning_id, v_sub_dunning_id, 1,
    v_now - INTERVAL '16 days',
    '497.00', 'overdue', 2, v_now - INTERVAL '1 day',
    v_now - INTERVAL '45 days', v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- CT-FLOW11-05: subscription status=active (para cancelamento manual)
  -- Representa: subscription ativa que sera cancelada pelo admin no teste
  -- =========================================================================
  INSERT INTO subscription (
    id, contact_id, brand_id, offer_id, offer_condition_id, offer_payment_option_id,
    origin_transaction_id, status,
    current_period_start, current_period_end,
    next_billing_at,
    created_at, updated_at
  )
  VALUES (
    v_sub_cancel_id, v_billing_contact_id, v_brand_id, v_offer_id, v_condition_id, v_payment_option_id,
    v_billing_txn_id, 'active',
    v_period_start, v_period_end_future,
    v_period_end_future,
    v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- Installment pago (periodo corrente quitado — subscription saudavel)
  INSERT INTO installment (
    id, subscription_id, sequence, due_at, amount, status, paid_at, created_at, updated_at
  )
  VALUES (
    v_inst_cancel_id, v_sub_cancel_id, 1,
    v_period_start + INTERVAL '1 day',
    '497.00', 'paid', v_period_start + INTERVAL '1 day',
    v_now, v_now
  )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- OUTPUT (variaveis para .env.local — FLOW-11)
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SEED E2E BILLING (FLOW-11) CONCLUIDO ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Adicione ao .env.local:';
  RAISE NOTICE '';
  RAISE NOTICE 'E2E_BILLING_CONTACT_ID=%', v_billing_contact_id;
  RAISE NOTICE 'E2E_SUBSCRIPTION_TRIAL_ID=%', v_sub_trial_id;
  RAISE NOTICE 'E2E_SUBSCRIPTION_PAST_DUE_ID=%', v_sub_past_due_id;
  RAISE NOTICE 'E2E_SUBSCRIPTION_ACTIVE_ID=%', v_sub_active_id;
  RAISE NOTICE 'E2E_SUBSCRIPTION_DUNNING_ID=%', v_sub_dunning_id;
  RAISE NOTICE 'E2E_SUBSCRIPTION_CANCEL_ID=%', v_sub_cancel_id;

END $$
