-- ============================================================================
-- Make general_settings.video_restrictions a real, writable column.
--
-- It ships as:
--   `video_restrictions` tinyint(1) GENERATED ALWAYS AS (0) VIRTUAL
--
-- A generated column is computed, never stored, and cannot be assigned. That had
-- two consequences:
--   1. Any admin save that included the column made MySQL/MariaDB reject the whole
--      statement ("The value specified for generated column 'video_restrictions'
--      ... has been ignored"), which is what silently broke every General/Site
--      settings save — the subscription toggle included.
--   2. A video-calling on/off switch is impossible while the value is pinned to 0.
--
-- Converting it to an ordinary tinyint(1) DEFAULT 0 keeps the current value (0 =
-- not restricted, i.e. video calling allowed) so behaviour is unchanged until an
-- admin actually flips it.
--
-- Safe to re-run: the conversion is skipped when the column is already writable.
--
--   mysql -h <host> -P <port> -u <user> -p <database> \
--     < migrations/2026-08-28-make-video-restrictions-writable.sql
-- ============================================================================

SET @is_generated := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'general_settings'
    AND COLUMN_NAME  = 'video_restrictions'
    AND (UPPER(IFNULL(EXTRA, '')) LIKE '%GENERATED%'
         OR IFNULL(GENERATION_EXPRESSION, '') <> '')
);

-- MariaDB rejects MODIFY on a generated column ("ERROR 1907: This is not yet
-- supported for generated columns"), so the conversion has to be DROP + ADD.
-- That is safe here and loses nothing: the column is GENERATED ALWAYS AS (0), so
-- every row's value is the constant 0 and carries no information to preserve. The
-- replacement column defaults to that same 0.
SET @sql_drop := IF(@is_generated > 0,
  'ALTER TABLE general_settings DROP COLUMN video_restrictions',
  'DO 0');

PREPARE stmt FROM @sql_drop;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql_add := IF(@is_generated > 0,
  'ALTER TABLE general_settings
     ADD COLUMN video_restrictions tinyint(1) NOT NULL DEFAULT 0
     COMMENT ''1 = video calling disabled platform-wide, 0 = allowed''
     AFTER audio_restrictions',
  'DO 0');

PREPARE stmt FROM @sql_add;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Match audio_restrictions' shape so both switches behave identically.
ALTER TABLE general_settings
  MODIFY COLUMN audio_restrictions tinyint(1) NOT NULL DEFAULT 0
  COMMENT '1 = voice calling disabled platform-wide, 0 = allowed';

-- Anything that was NULL before the NOT NULL tightening becomes "allowed".
UPDATE general_settings
   SET audio_restrictions = COALESCE(audio_restrictions, 0),
       video_restrictions = COALESCE(video_restrictions, 0);

-- ── Verification ────────────────────────────────────────────────────────────
SELECT COLUMN_NAME, COLUMN_TYPE, IFNULL(EXTRA, '') AS extra,
       IFNULL(GENERATION_EXPRESSION, '(none)') AS generated_as, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'general_settings'
  AND COLUMN_NAME IN ('subscription_restrictions', 'audio_restrictions', 'video_restrictions')
ORDER BY COLUMN_NAME;
