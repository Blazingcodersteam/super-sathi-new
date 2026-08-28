const db = require("../database");
const utils = require("util");
const query = utils.promisify(db.query).bind(db);

// ── Exact enum values from privacy_settings table ────────────────────────────
// display_name_privacy:    hide_last_name | hide_first_name | show_full_name
// profile_photo_privacy:   visible_to_all | visible_to_liked_premium | visible_to_premium_only | visible_to_liked
// album_photo_privacy:     visible_to_all | visible_to_premium_only | visible_to_liked
// phone_privacy:           premium_members | premium_members_liked | no_one | all_matches
// email_privacy:           all_premium_members | premium_members_wish_connect | hide_email | all_matches_expires
// contact_filter_privacy:  all_members | premium_members_only | premium_members_liked | matches_only_expires
// dob_privacy:             hide_dob | show_age_only | visible_to_all
// income_privacy:          visible_all_members | keep_private
// shortlist_privacy:       allow_all | premium_only | disable
// shortlist_visibility:    let_others_know | do_not_let_others_know
// profile_visibility:      visible_to_all_including_unregistered | visible_to_registered_members_only

export interface PrivacySettings {
  display_name_privacy?: string;
  profile_photo_privacy?: string;
  album_photo_privacy?: string;
  phone_privacy?: string;
  email_privacy?: string;
  contact_filter_privacy?: string;
  dob_privacy?: string;
  income_privacy?: string;
  shortlist_privacy?: string;
  shortlist_visibility?: string;
  profile_visibility?: string;
  block_users?: string | null;
  hide_profile_from?: string | null;
  show_vivaaha_id?: number | null;
  vivaaha_user_id?: string | null;
}

// ── Fetch privacy settings + show_vivaaha_id + vivaaha_user_id ─────────────
async function getPrivacySettings(userId: number): Promise<PrivacySettings> {
  // Always fetch show_vivaaha_id and vivaaha_user_id regardless of privacy_settings row
  const [base] = await query(
    `SELECT u.vivaaha_user_id, up.show_vivaaha_id
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );

  const [ps] = await query(
    `SELECT display_name_privacy, profile_photo_privacy, album_photo_privacy,
            phone_privacy, email_privacy, contact_filter_privacy, dob_privacy,
            income_privacy, shortlist_privacy, shortlist_visibility,
            profile_visibility, block_users, hide_profile_from
     FROM privacy_settings WHERE user_id = ?`,
    [userId]
  );

  // Merge: privacy_settings row may not exist (user never changed settings)
  return {
    ...(ps || {}),
    show_vivaaha_id: base?.show_vivaaha_id ?? 0,
    vivaaha_user_id: base?.vivaaha_user_id ?? null,
  };
}

// ── Check if viewer has active subscription ──────────────────────────────────
async function viewerIsPremium(viewerId: number): Promise<boolean> {
  const [sub] = await query(
    `SELECT id FROM user_subscriptions
     WHERE user_id = ? AND subscription_status_id = 1 AND end_date > NOW()
     LIMIT 1`,
    [viewerId]
  );
  return !!sub;
}

// ── Check if viewer has sent interest to profile owner ───────────────────────
// IMPORTANT: Photo requests (message containing "photo") only count if ACCEPTED by owner.
// Regular interests count as "liked" regardless of acceptance (status != 'declined').
async function viewerHasLiked(viewerId: number, profileOwnerId: number): Promise<boolean> {
  const [action] = await query(
    `SELECT id FROM user_interests
     WHERE sender_id = ? AND receiver_id = ? AND status != 'declined'
     AND (
       LOWER(message) NOT LIKE '%photo%'
       OR (LOWER(message) LIKE '%photo%' AND status = 'accepted')
     )
     LIMIT 1`,
    [viewerId, profileOwnerId]
  );
  return !!action;
}

// ── Check if viewer is in profile owner's accepted connections ───────────────
async function viewerIsConnected(viewerId: number, profileOwnerId: number): Promise<boolean> {
  const [conn] = await query(
    `SELECT id FROM connect_now_requests
     WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
       AND status = 'accepted'
     LIMIT 1`,
    [viewerId, profileOwnerId, profileOwnerId, viewerId]
  );
  return !!conn;
}

// ── Core single-profile filter ────────────────────────────────────────────────
export async function applyPrivacyFilter(matchData: any, viewerId: number): Promise<any> {
  if (!matchData || !matchData.id) return matchData;
  if (matchData.id === viewerId) return matchData; // never filter own profile

  try {
    const ps = await getPrivacySettings(matchData.id);

    // ── Check if viewer is blocked by profile owner (privacy_settings.block_users) ──
    if (ps.block_users) {
      try {
        const blocked: number[] = JSON.parse(ps.block_users);
        if (blocked.includes(viewerId)) {
          return null; // completely hide — profile disappears
        }
      } catch (_) {}
    }

    // ── Check if either user blocked the other via user_actions table ─────
    const [blockExists] = await query(
      `SELECT id FROM user_actions
       WHERE ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))
         AND action_type_id = 3
       LIMIT 1`,
      [matchData.id, viewerId, viewerId, matchData.id]
    );
    if (blockExists) {
      return null; // completely hide — profile disappears
    }

    // ── Check hide_profile_from ──────────────────────────────────────────────
    if (ps.hide_profile_from) {
      try {
        const hiddenFrom: number[] = JSON.parse(ps.hide_profile_from);
        if (hiddenFrom.includes(viewerId)) {
          return {
            id: matchData.id,
            is_hidden: true,
            profile_picture: null,
            first_name: 'Member',
            last_name: null,
            display_name: 'Member',
          };
        }
      } catch (_) {}
    }

    // ── Section 11 — profile_visibility ─────────────────────────────────────
    // DB enum: visible_to_all_including_unregistered (default) | visible_to_registered_members_only
    // All API callers are authenticated (registered), so both values pass for API viewers.
    // account_settings.profile_hidden = 1 is the "hidden" state — check it here.
    const [acct] = await query(
      `SELECT profile_hidden FROM account_settings WHERE user_id = ?`,
      [matchData.id]
    );
    if (acct?.profile_hidden === 1) {
      return {
        id: matchData.id,
        is_hidden: true,
        profile_picture: null,
        first_name: 'Member',
        last_name: null,
        display_name: 'Member',
      };
    }

    // visible_to_premium — only premium viewers can see this profile
    const pv = ps.profile_visibility;
    if (pv === 'visible_to_premium') {
      const viewerPremium = await viewerIsPremium(viewerId);
      if (!viewerPremium) {
        return {
          id: matchData.id,
          is_hidden: true,
          profile_picture: null,
          first_name: 'Member',
          last_name: null,
          display_name: 'Member',
        };
      }
    }

    // Lazy-load subscription/liked status only when needed
    let _isPremium: boolean | null = null;
    let _hasLiked: boolean | null = null;
    let _isConnected: boolean | null = null;

    const isPremium = async () => {
      if (_isPremium === null) _isPremium = await viewerIsPremium(viewerId);
      return _isPremium;
    };
    const hasLiked = async () => {
      if (_hasLiked === null) _hasLiked = await viewerHasLiked(viewerId, matchData.id);
      return _hasLiked;
    };
    const isConnected = async () => {
      if (_isConnected === null) _isConnected = await viewerIsConnected(viewerId, matchData.id);
      return _isConnected;
    };

    const filtered = { ...matchData };

    // ── 1. show_vivaaha_id (STEP 1 — highest priority) ───────────────────────
    // If the match has enabled ID masking, show Vivaaha ID instead of name.
    // This overrides ALL display_name_privacy settings.
    const showVivaahaId = ps.show_vivaaha_id === 1 || filtered.show_vivaaha_id === 1;
    const vivaahaUserId = ps.vivaaha_user_id || filtered.vivaaha_user_id;

    if (showVivaahaId) {
      filtered.display_name = vivaahaUserId || 'Member';
      filtered.first_name   = null;
      filtered.middle_name  = null;
      filtered.last_name    = null;
    } else {
      // ── 2. display_name_privacy (STEP 2) ─────────────────────────────────
      // DB enum: hide_last_name (default) | hide_first_name | show_full_name
      // Spec:    hide_last_name           | hide_full_name   | visible_to_all
      const dnp = ps.display_name_privacy;

      if (dnp === 'hide_last_name' || !dnp) {
        // DEFAULT — hide last name, show first + middle only
        filtered.last_name    = null;
        filtered.display_name = [
          filtered.first_name,
          filtered.middle_name,
        ].filter(Boolean).join(' ') || 'Member';
      } else if (dnp === 'hide_first_name' || dnp === 'hide_full_name') {
        // hide_full_name (spec) = hide_first_name (DB) → show first name only
        filtered.first_name   = null;
        filtered.middle_name  = null;
        filtered.last_name    = null;
        filtered.display_name = 'Member';
      }
      // show_full_name / visible_to_all → no change, show full name
    }

    // ── 2. profile_photo_privacy ─────────────────────────────────────────────
    // Section 2 spec:
    //   visible_to_all    → show to everyone
    //   hide_from_all     → never show — null photo + signal
    //   visible_to_premium (visible_to_premium_only) → blur for free viewers
    //   visible_to_liked / visible_to_liked_premium  → existing logic
    const ppp = ps.profile_photo_privacy;

    if (ppp === 'hide_from_all') {
      // STEP 1 — hard hide: no profile photo for anyone
      // Only null the PRIMARY photo — album photos are controlled separately by album_photo_privacy
      filtered.profile_picture      = null;
      filtered.photo_privacy_status = 'hidden';   // Flutter renders placeholder + "Photo not available"
      if (Array.isArray(filtered.photos)) {
        filtered.photos = filtered.photos.map((p: any) =>
          (p.is_primary === 1 || p.is_primary === true)
            ? { ...p, photo_url: null }
            : p  // album photos untouched — album_photo_privacy handles them
        );
      }
    } else {
      const hideProfilePhoto =
        (ppp === 'visible_to_premium_only'   && !(await isPremium())) ||
        (ppp === 'visible_to_liked'          && !(await hasLiked()))  ||
        (ppp === 'visible_to_liked_premium'  && (!(await isPremium()) || !(await hasLiked())));

      if (hideProfilePhoto) {
        // STEP 2 — premium gate: null profile_picture + primary photo in array
        filtered.profile_picture = null;
        filtered.photo_privacy_status = 'premium_only'; // Flutter renders blur + lock overlay
        if (Array.isArray(filtered.photos)) {
          filtered.photos = filtered.photos.map((p: any) =>
            (p.is_primary === 1 || p.is_primary === true) ? { ...p, photo_url: null } : p
          );
        }
      } else {
        filtered.photo_privacy_status = 'visible';      // Flutter shows photo normally
      }
    }

    // ── 3. album_photo_privacy ───────────────────────────────────────────────────────
    // DB enum: visible_to_all (default) | visible_to_premium_only | visible_to_liked | hide_from_all
    const ap = ps.album_photo_privacy;

    if (ap === 'hide_from_all') {
      // Hard hide — no album photos for anyone
      filtered.album_privacy_status = 'hidden';
      if (Array.isArray(filtered.photos)) {
        filtered.photos = filtered.photos.map((p: any) =>
          (p.is_primary === 1 || p.is_primary === true)
            ? { ...p }
            : { ...p, photo_url: null }
        );
      }
    } else if (ap === 'visible_to_premium_only') {
      if (await isPremium()) {
        filtered.album_privacy_status = 'visible';
      } else {
        filtered.album_privacy_status = 'premium_only';
        if (Array.isArray(filtered.photos)) {
          filtered.photos = filtered.photos.map((p: any) =>
            (p.is_primary === 1 || p.is_primary === true)
              ? { ...p }
              : { ...p, photo_url: null }
          );
        }
      }
    } else if (ap === 'visible_to_liked') {
      if (await hasLiked()) {
        filtered.album_privacy_status = 'visible';
      } else {
        filtered.album_privacy_status = 'premium_only';
        if (Array.isArray(filtered.photos)) {
          filtered.photos = filtered.photos.map((p: any) =>
            (p.is_primary === 1 || p.is_primary === true)
              ? { ...p }
              : { ...p, photo_url: null }
          );
        }
      }
    } else {
      // visible_to_all (default) — show all photos to everyone
      filtered.album_privacy_status = 'visible';
    }

    // ── 4. phone_privacy ─────────────────────────────────────────────────────
    // Spec: hide_phone | visible_to_all | premium_members (default)
    const pp = ps.phone_privacy;

    if (pp === 'hide_phone' || pp === 'no_one') {
      // Hard hide — subscription cannot unlock
      filtered.phone              = null;
      filtered.phone_verified     = null;
      filtered.phone_privacy_status = 'hidden';
    } else if (pp === 'visible_to_all') {
      filtered.phone_privacy_status = 'visible';
    } else {
      // premium_members (default) | premium_members_liked | all_matches
      const hidePhone =
        (pp === 'premium_members'       && !(await isPremium()))                 ||
        (pp === 'premium_members_liked' && (!(await isPremium()) || !(await hasLiked()))) ||
        (pp === 'all_matches'           && !(await isConnected()));

      if (hidePhone) {
        filtered.phone              = null;  // null the value — don't expose even partially
        filtered.phone_verified     = null;
        filtered.phone_privacy_status = 'premium_only';
      } else {
        filtered.phone_privacy_status = 'visible';
      }
    }

     // ── 5. email_privacy ─────────────────────────────────────────────────────
     // Spec: hide_email | visible_to_all | premium_members (default)
     const ep = ps.email_privacy;

     if (ep === 'hide_email') {
       // Hard hide — subscription cannot unlock
       filtered.email              = null;
       filtered.email_verified     = null;
       filtered.email_privacy_status = 'hidden';
     } else if (ep === 'visible_to_all') {
       filtered.email_privacy_status = 'visible';
     } else {
       // all_premium_members (default) | premium_members_wish_connect | all_matches_expires
       const hideEmail =
         (ep === 'all_premium_members'          && !(await isPremium()))                        ||
         (ep === 'premium_members_wish_connect' && (!(await isPremium()) || !(await hasLiked()))) ||
         (ep === 'all_matches_expires'          && !(await isConnected()));

       if (hideEmail) {
         filtered.email              = null;  // null the value
         filtered.email_verified     = null;
         filtered.email_privacy_status = 'premium_only';
       } else {
         filtered.email_privacy_status = 'visible';
       }
     }


    // ── 6. dob_privacy ───────────────────────────────────────────────────────
    // Spec: hide_dob | show_age_only (default) | visible_to_all
    //
    //  hide_dob       → null out DOB + age, set status = 'hidden'
    //  show_age_only  → null out DOB, keep age, set status = 'age_only'  ← DEFAULT
    //  visible_to_all → premium viewer gets full DOB; free viewer gets age only
    const dp = ps.dob_privacy;

    if (dp === 'hide_dob') {
      // Hard hide — no DOB, no age for anyone
      filtered.date_of_birth   = null;
      filtered.age             = null;
      filtered.dob_privacy_status = 'hidden';
    } else if (dp === 'visible_to_all') {
      // Premium → full DOB; Free → age only
      if (await isPremium()) {
        filtered.dob_privacy_status = 'visible'; // Flutter shows full date
      } else {
        filtered.date_of_birth      = null;       // hide raw DOB
        filtered.dob_privacy_status = 'age_only'; // Flutter shows age only
      }
    } else {
      // show_age_only (default) — null out DOB, keep age for everyone
      filtered.date_of_birth      = null;
      filtered.dob_privacy_status = 'age_only';
    }

     // ── 7. income_privacy ─────────────────────────────────────────────────────
     // Spec: visible_all_members (default) | keep_private | visible_to_premium
     const ip = ps.income_privacy;

     if (ip === 'keep_private') {
       // Hard hide — subscription cannot unlock
       filtered.annual_income       = null;
       filtered.income_type         = null;
       filtered.income_privacy_status = 'hidden';
     } else if (ip === 'visible_to_premium') {
       if (!(await isPremium())) {
         filtered.annual_income       = null;
         filtered.income_type         = null;
         filtered.income_privacy_status = 'premium_only';
       } else {
         filtered.income_privacy_status = 'visible';
       }
     } else {
       // visible_all_members (default)
       filtered.income_privacy_status = 'visible';
     }


    return filtered;
  } catch (error) {
    console.error('[privacyFilter] error:', error);
    return matchData; // fail-open
  }
}

// ── Batch filter — runs in parallel ──────────────────────────────────────────
export async function applyPrivacyFilterToMatches(
  matches: any[],
  viewerId: number
): Promise<any[]> {
  if (!matches || matches.length === 0) return matches;
  const results = await Promise.all(
    matches
      .filter((m: any) => m !== null && m !== undefined)
      .map((m: any) => applyPrivacyFilter(m, viewerId))
  );
  return results.filter((r: any) => r !== null && r !== undefined);
}
