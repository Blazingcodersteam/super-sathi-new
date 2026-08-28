// 21-07-2026 - Profile complete condition
function filled(column: string): string {
  return `${column} IS NOT NULL AND TRIM(CAST(${column} AS CHAR)) != ''`;
}

// 21-07-2026 - Profile complete condition
function filledChoice(column: string): string {
  return `${filled(column)} AND ${column} != 0`;
}

// 21-07-2026 - Profile complete condition
function filledJson(column: string): string {
  return `${filled(column)} AND ${column} != '[]'`;
}

// 21-07-2026 - Profile complete condition
export function profileCompleteCondition(userAlias = "u", profileAlias = "up"): string {
  const userId = `${userAlias}.id`;
  const email = `${userAlias}.email`;

  return `(
    ${filled(`${profileAlias}.first_name`)}
    AND ${filled(`${profileAlias}.last_name`)}
    AND ${filled(email)}
    AND ${email} REGEXP '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
    AND ${filledChoice(`${profileAlias}.gender_id`)}
    AND ${filled(`${profileAlias}.date_of_birth`)}
    AND ${filledChoice(`${profileAlias}.marital_status_id`)}
    AND ${filled(`${profileAlias}.height`)}
    AND ${filled(`${profileAlias}.weight`)}
    AND ${filledChoice(`${profileAlias}.disability_id`)}
    AND ${filledChoice(`${profileAlias}.mother_tongue_id`)}
    AND EXISTS (
      SELECT 1 FROM location_details complete_ld
      WHERE complete_ld.user_id = ${userId}
        AND ${filledChoice("complete_ld.country_id")}
        AND ${filledChoice("complete_ld.state_id")}
        AND ${filledChoice("complete_ld.city_id")}
    )
    AND ${filledChoice(`${profileAlias}.religion_id`)}
    AND ${filledChoice(`${profileAlias}.community_id`)}
    AND ${filledChoice(`${profileAlias}.caste_id`)}
    AND EXISTS (
      SELECT 1 FROM astro_details complete_astro
      WHERE complete_astro.user_id = ${userId}
        AND ${filled("complete_astro.manglik_status")}
    )
    AND (
      EXISTS (
        SELECT 1 FROM education_details complete_ed
        WHERE complete_ed.user_id = ${userId}
          AND ${filledChoice("complete_ed.education_level_id")}
      )
      OR EXISTS (
        SELECT 1 FROM career_details complete_career_education
        WHERE complete_career_education.user_id = ${userId}
          AND ${filled("complete_career_education.highest_qualification")}
      )
    )
    AND EXISTS (
      SELECT 1 FROM career_details complete_cd
      WHERE complete_cd.user_id = ${userId}
        AND (
          ${filledChoice("complete_cd.working_with_id")}
          OR ${filled("complete_cd.working_as")}
          OR ${filled("complete_cd.occupation")}
        )
    )
    AND ${filledChoice(`${profileAlias}.diet_id`)}
    AND ${filledChoice(`${profileAlias}.smoking_id`)}
    AND ${filledChoice(`${profileAlias}.drinking_id`)}
    AND ${filled(`${profileAlias}.about_myself`)}
    AND EXISTS (
      SELECT 1 FROM user_hobbies complete_hobbies
      WHERE complete_hobbies.user_id = ${userId}
    )
    AND EXISTS (
      SELECT 1 FROM partner_preferences complete_pp
      WHERE complete_pp.user_id = ${userId}
        AND (
          ${filled("complete_pp.min_age")}
          OR ${filled("complete_pp.max_age")}
          OR ${filled("complete_pp.min_height")}
          OR ${filledJson("complete_pp.marital_status_ids")}
          OR ${filledJson("complete_pp.religion_ids")}
          OR ${filledJson("complete_pp.education_level_ids")}
          OR ${filled("complete_pp.min_income")}
          OR ${filledJson("complete_pp.state_ids")}
        )
    )
    AND (
      ${filled(`${profileAlias}.profile_picture`)}
      OR EXISTS (
        SELECT 1 FROM user_photos complete_photos
        WHERE complete_photos.user_id = ${userId}
      )
    )
  )`;
}
