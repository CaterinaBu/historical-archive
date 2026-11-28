async function ranking(connection, playerId, day) {
  const { rows } = await connection.query(`
    WITH candidates AS (
      SELECT player.id,
             CASE WHEN $2::date IS NULL THEN player.reputation ELSE daily.score END AS score,
             CASE WHEN $2::date IS NULL THEN player.display_name ELSE daily.name END AS name,
             CASE WHEN $2::date IS NULL THEN player.display_photo ELSE daily.photo END AS photo
        FROM archive_players AS player
        JOIN archive_players AS viewer ON viewer.id = $1 AND player.vk_app_id IS NOT DISTINCT FROM viewer.vk_app_id
        LEFT JOIN archive_daily_scores AS daily ON daily.player_id = player.id AND daily.day = $2::date
       WHERE ($2::date IS NULL AND (player.reputation > 0 OR player.id = $1 OR EXISTS (
             SELECT 1 FROM archive_quiz_rounds WHERE player_id = player.id AND finished_day IS NOT NULL
           ))) OR ($2::date IS NOT NULL AND daily.player_id IS NOT NULL)
    ), ranked AS (
      SELECT *, RANK() OVER (ORDER BY score DESC)::integer AS place,
             ROW_NUMBER() OVER (ORDER BY score DESC, id) AS sequence FROM candidates
    )
    SELECT place, score, name, photo, id = $1 AS "isSelf"
      FROM ranked WHERE sequence <= 50 OR id = $1 ORDER BY sequence`, [playerId, day]);
  return rows;
}

export async function rankings(connection, playerId, date, previousDate) {
  return {
    reputation: await ranking(connection, playerId, null),
    today: await ranking(connection, playerId, date),
    yesterday: await ranking(connection, playerId, previousDate),
  };
}

export async function yesterdayResult(connection, playerId, date) {
  const { rows: [result] } = await connection.query(`
    SELECT mine.score, 1 + (
      SELECT COUNT(*)::integer FROM archive_daily_scores AS other
        JOIN archive_players AS rival ON rival.id = other.player_id
       WHERE other.day = mine.day AND other.score > mine.score
         AND rival.vk_app_id IS NOT DISTINCT FROM viewer.vk_app_id
    ) AS place
      FROM archive_daily_scores AS mine JOIN archive_players AS viewer ON viewer.id = mine.player_id
     WHERE mine.player_id = $1 AND mine.day = $2::date - 1
       AND (viewer.yesterday_seen_day IS NULL OR viewer.yesterday_seen_day < mine.day)`, [playerId, date]);
  return result ?? null;
}

export async function addDailyScore(connection, player, date, score) {
  await connection.query(`INSERT INTO archive_daily_scores (player_id, day, score, name, photo)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (player_id, day) DO UPDATE SET
      score = archive_daily_scores.score + EXCLUDED.score, name = EXCLUDED.name, photo = EXCLUDED.photo`,
  [player.id, date, score, player.display_name, player.display_photo]);
}
