-- ============================================================================
-- Subscription plan feature backfill
--   1. Adds audio_chat_enabled / video_chat_enabled and grants them per plan.
--   2. Backfills a baseline feature set for any active plan that has none.
--
-- Safe to re-run: every statement is idempotent (unique key upsert, or
-- INSERT ... SELECT guarded by NOT EXISTS). Run against the app database:
--
--   mysql -h <host> -P <port> -u <user> -p <database> \
--     < migrations/2026-08-28-call-features-and-plan-feature-backfill.sql
--
-- Context ---------------------------------------------------------------------
-- src/Routes/callRoutes.ts gates POST /api/calls/create on the per-plan features
-- 'audio_chat_enabled' (voice) and 'video_chat_enabled' (video). Neither name
-- existed in subscription_features_master, so requireSubscriptionFeature could
-- never find a row and EVERY call was rejected with 403 on EVERY plan — including
-- Supersathi Signature. These inserts are what makes that gate resolvable.
--
-- Note: general_settings.audio_restrictions / video_restrictions are NOT the gate.
-- Nothing in the backend reads them, there is no admin UI for them, and
-- video_restrictions is a GENERATED ALWAYS AS (0) VIRTUAL column that cannot even
-- be written. They are left untouched here.
-- ============================================================================

START TRANSACTION;

-- ── 1. Feature definitions ──────────────────────────────────────────────────
-- feature_name is UNIQUE, so this upsert is the idempotent form.
INSERT INTO subscription_features_master (feature_name, feature_description, user_status_id)
VALUES
  ('audio_chat_enabled', 'Voice calling with connected matches', 1),
  ('video_chat_enabled', 'Video calling with connected matches', 1)
ON DUPLICATE KEY UPDATE
  feature_description = VALUES(feature_description),
  user_status_id      = 1;


-- ── 2. Grant calling per plan ───────────────────────────────────────────────
-- Expressed as a RULE rather than hard-coded plan ids so it stays correct across
-- environments (ids differ) and applies to plans added later:
--
--   voice  -> every active plan.
--   video  -> plans of 6 months or longer.
--
-- The 6-month cut-off follows the ladder the plan data already uses: Elite 3M is
-- the deliberately stripped tier (parent_analytics 'false', review_calls '0',
-- search_ranking 'normal'), with the extras switching on from Elite 6M upward.
-- To include video on shorter plans, change the duration_months predicate below.

INSERT INTO subscription_plan_features (plan_id, feature_id, feature_value, user_status_id)
SELECT sp.id, sfm.id, 'true', 1
FROM subscription_plans sp
CROSS JOIN subscription_features_master sfm
WHERE sfm.feature_name = 'audio_chat_enabled'
  AND sp.user_status_id = 1
  AND NOT EXISTS (
    SELECT 1 FROM subscription_plan_features spf
    WHERE spf.plan_id = sp.id AND spf.feature_id = sfm.id
  );

INSERT INTO subscription_plan_features (plan_id, feature_id, feature_value, user_status_id)
SELECT sp.id, sfm.id, IF(sp.duration_months >= 6, 'true', 'false'), 1
FROM subscription_plans sp
CROSS JOIN subscription_features_master sfm
WHERE sfm.feature_name = 'video_chat_enabled'
  AND sp.user_status_id = 1
  AND NOT EXISTS (
    SELECT 1 FROM subscription_plan_features spf
    WHERE spf.plan_id = sp.id AND spf.feature_id = sfm.id
  );


-- ── 3. Baseline set for active plans that grant nothing ─────────────────────
-- A plan with no subscription_plan_features rows sells a subscription that unlocks
-- nothing: FeatureController finds no limit, requireSubscriptionFeature finds no
-- row, and the member is treated as free despite paying. Plan "555" (1 month,
-- INR 278) was in exactly that state with a live subscriber.
--
-- Quotas scale with duration so the values stay sensible whatever the plan length:
--   contact_unlock       = 25 per month
--   profile_boost_cycles = 1 per month
-- Everything else is the entry tier, one notch below Elite 3M.

CREATE TEMPORARY TABLE tmp_baseline_features (
  feature_name  VARCHAR(100) NOT NULL,
  feature_value VARCHAR(100) NULL,
  scale_by_month TINYINT NOT NULL DEFAULT 0,
  per_month     INT NOT NULL DEFAULT 0
);

INSERT INTO tmp_baseline_features (feature_name, feature_value, scale_by_month, per_month) VALUES
  ('unlimited_chat',             'unlimited', 0, 0),
  ('contact_unlock',             NULL,        1, 25),
  ('profile_boost_cycles',       NULL,        1, 1),
  ('search_ranking',             'normal',    0, 0),
  ('ai_match_depth',             'standard',  0, 0),
  ('support_level',              'normal',    0, 0),
  ('govt_id_verified_access',    'true',      0, 0),
  ('ai_compatibility_score',     'true',      0, 0),
  ('horoscope_matching',         'true',      0, 0),
  ('advanced_search_filters',    'true',      0, 0),
  ('privacy_shield',             'true',      0, 0),
  ('fraud_monitoring',           'true',      0, 0),
  ('secure_contact_unlock',      'true',      0, 0),
  ('parent_parallel_login',      'true',      0, 0),
  ('grievance_priority_handling','false',     0, 0),
  ('parent_analytics',           'false',     0, 0),
  ('review_calls',               '0',         0, 0);

-- Which plans need the baseline? Not "has zero rows" — step 2 above just gave every
-- plan two calling rows, so that test would already be false and this step would
-- silently do nothing (and would depend on statement order, which is fragile).
--
-- Test instead for the absence of 'unlimited_chat'. Every genuinely configured plan
-- grants it, and it is the feature requirePremium keys on, so a plan without it is
-- by definition one that unlocks nothing. That predicate is order-independent and
-- stays correct on a re-run.
CREATE TEMPORARY TABLE tmp_empty_plans AS
SELECT sp.id, sp.duration_months
FROM subscription_plans sp
WHERE sp.user_status_id = 1
  AND NOT EXISTS (
    SELECT 1
    FROM subscription_plan_features spf
    JOIN subscription_features_master sfm ON sfm.id = spf.feature_id
    WHERE spf.plan_id = sp.id
      AND sfm.feature_name = 'unlimited_chat'
  );

INSERT INTO subscription_plan_features (plan_id, feature_id, feature_value, user_status_id)
SELECT
  ep.id,
  sfm.id,
  CASE WHEN b.scale_by_month = 1
       THEN CAST(GREATEST(b.per_month, b.per_month * COALESCE(ep.duration_months, 1)) AS CHAR)
       ELSE b.feature_value
  END,
  1
FROM tmp_empty_plans ep
CROSS JOIN tmp_baseline_features b
JOIN subscription_features_master sfm
  ON sfm.feature_name = b.feature_name
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plan_features spf
  WHERE spf.plan_id = ep.id AND spf.feature_id = sfm.id
);

DROP TEMPORARY TABLE tmp_baseline_features;
DROP TEMPORARY TABLE tmp_empty_plans;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
SELECT sp.plan_name, sp.duration_months, sp.price,
       COUNT(spf.id) AS feature_count,
       MAX(CASE WHEN sfm.feature_name = 'audio_chat_enabled' THEN spf.feature_value END) AS audio,
       MAX(CASE WHEN sfm.feature_name = 'video_chat_enabled' THEN spf.feature_value END) AS video
FROM subscription_plans sp
LEFT JOIN subscription_plan_features spf ON spf.plan_id = sp.id
LEFT JOIN subscription_features_master sfm ON sfm.id = spf.feature_id
WHERE sp.user_status_id = 1
GROUP BY sp.id, sp.plan_name, sp.duration_months, sp.price
ORDER BY sp.price;
