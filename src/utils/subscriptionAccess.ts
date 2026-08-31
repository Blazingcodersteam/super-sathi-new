// Single source of truth for the global "subscription restrictions" kill-switch.
//
// general_settings.subscription_restrictions
//   1 = restrictions ENABLED  -> normal paid product. Free members are limited; paying
//       members get exactly what their plan grants.
//   0 = restrictions DISABLED -> the product behaves as if every logged-in member were
//       premium. Nothing is gated on the VIEWER's subscription.
//
// IMPORTANT: this switch never overrides another member's OWN privacy choices. A member who
// hid their email/phone/DOB stays hidden regardless. It only lifts gates that exist because
// the *viewer* has not paid.
//
// Before this module the flag was read in five different places with three different
// comparisons (`=== 0`, `Number(...) === 0`, and none at all in the biggest gates), so the
// switch only reached chat and calls. Everything now routes through here.

const db = require("../database");
const utils = require("util");
const query = utils.promisify(db.query).bind(db);

// The privacy filter runs once per profile in a match list, so an uncached read would add a
// query per row. A short TTL keeps list rendering cheap while still letting an admin see the
// effect of flipping the switch on the next page load.
const RESTRICTIONS_CACHE_MS = 5000;

interface GeneralFlags {
  subscriptionRestrictions: number | null;
  audioRestrictions: number | null;
  videoRestrictions: number | null;
}

let cachedFlags: GeneralFlags | null = null;
let cachedAt = 0;

/**
 * Read every general_settings switch in one cached query.
 *
 * Selects * rather than naming the columns on purpose: audio_restrictions and
 * video_restrictions are absent (or generated, and unreadable as real values) on
 * environments that have not run the migrations yet. Naming them would make the whole
 * query error there and take the subscription switch down with it.
 */
async function getGeneralFlags(): Promise<GeneralFlags> {
  const now = Date.now();
  if (cachedFlags && now - cachedAt < RESTRICTIONS_CACHE_MS) return cachedFlags;

  let flags: GeneralFlags = {
    subscriptionRestrictions: null,
    audioRestrictions: null,
    videoRestrictions: null,
  };

  try {
    const [row] = await query("SELECT * FROM general_settings LIMIT 1");
    flags = {
      subscriptionRestrictions: normalizeFlag(row?.subscription_restrictions),
      audioRestrictions: normalizeFlag(row?.audio_restrictions),
      videoRestrictions: normalizeFlag(row?.video_restrictions),
    };
  } catch (error) {
    console.error("[subscriptionAccess] Failed to read general_settings:", error);
  }

  cachedFlags = flags;
  cachedAt = now;
  return flags;
}

// The column is tinyint, but it reaches us as a number, a string or a boolean depending on
// driver settings and on which admin screen last wrote it. Returns null for "no usable
// value", which callers treat as "fail closed".
function normalizeFlag(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Buffer.isBuffer(value)) return value.length && value[0] ? 1 : 0;

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return 1;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return 0;

  const numeric = Number(normalized);
  if (Number.isNaN(numeric)) return null;
  return numeric !== 0 ? 1 : 0;
}

/**
 * Are subscription restrictions currently enforced?
 *
 * Fails CLOSED (returns true) when general_settings has no row, an unreadable value, or the
 * query errors — an outage must never hand every member a free premium account.
 */
export async function areSubscriptionRestrictionsEnabled(): Promise<boolean> {
  const { subscriptionRestrictions } = await getGeneralFlags();
  // null = no row, unreadable value, or a failed read -> fail CLOSED (keep enforcing).
  return subscriptionRestrictions === null ? true : subscriptionRestrictions !== 0;
}

/**
 * Is this call type allowed platform-wide?
 *
 * general_settings.audio_restrictions / video_restrictions, where 1 = that call type is
 * switched off for everyone. This sits ABOVE the per-plan feature gate and the receiver's
 * own privacy preference — it does not replace either.
 *
 * Fails OPEN (allowed), the opposite of the subscription switch, and deliberately: these
 * columns default to 0 and may not exist at all on an un-migrated database, so a read
 * failure must not take working calling away from every member. The subscription switch
 * fails closed because there the safe direction is "keep charging"; here the safe
 * direction is "do not break a live feature".
 */
export async function isCallTypeGloballyEnabled(callType: string): Promise<boolean> {
  const flags = await getGeneralFlags();
  const isVideo = String(callType || "").trim().toLowerCase() === "video";
  const flag = isVideo ? flags.videoRestrictions : flags.audioRestrictions;
  return flag === null ? true : flag === 0;
}

/** Drop the cached flags so an admin toggle takes effect on the very next request. */
export function invalidateSubscriptionRestrictionsCache(): void {
  cachedFlags = null;
  cachedAt = 0;
}

/** Does this user hold a live, unexpired subscription? Ignores the kill-switch. */
export async function hasActiveSubscription(userId: number): Promise<boolean> {
  if (!userId) return false;
  try {
    const [subscription] = await query(
      `SELECT id FROM user_subscriptions
        WHERE user_id = ?
          AND is_active = 1
          AND subscription_status_id = 1
          AND (end_date IS NULL OR end_date >= CURRENT_DATE)
        LIMIT 1`,
      [userId]
    );
    return !!subscription;
  } catch (error) {
    console.error("[subscriptionAccess] Failed to read user_subscriptions:", error);
    return false;
  }
}

/**
 * Should this viewer be shown premium-gated content?
 *
 * True when the kill-switch is off (everyone is premium) OR the viewer actually pays.
 * This is the check every viewer-subscription gate should use.
 */
export async function isViewerPremium(userId: number): Promise<boolean> {
  if (!(await areSubscriptionRestrictionsEnabled())) return true;
  return hasActiveSubscription(userId);
}

/** The active subscription row plus its plan name, or null. Ignores the kill-switch. */
export async function getActiveSubscription(userId: number): Promise<any | null> {
  if (!userId) return null;
  try {
    const [subscription] = await query(
      `SELECT us.*, sp.plan_name
         FROM user_subscriptions us
         JOIN subscription_plans sp ON sp.id = us.plan_id
        WHERE us.user_id = ?
          AND us.is_active = 1
          AND (us.end_date IS NULL OR us.end_date >= CURRENT_DATE)
        ORDER BY us.end_date DESC, us.id DESC
        LIMIT 1`,
      [userId]
    );
    return subscription || null;
  } catch (error) {
    console.error("[subscriptionAccess] Failed to read active subscription:", error);
    return null;
  }
}
