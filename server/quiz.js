import { randomUUID } from 'node:crypto';
import { createDailyQuiz, createQuizBank, sample } from '../questions.js';
import { displayField } from '../daily.js';
import { audioDefaults, balanceFinds, collectionFinds } from '../content/profile-rules.js';
import { addDailyScore, rankings, yesterdayResult } from './rankings.js';
import { RequestError } from './request-error.js';
import { applyShopOperation } from './shop.js';

const moscowDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' });
const dateFor = now => moscowDate.format(now());
const asDayNumber = date => Date.parse(`${date}T00:00:00Z`) / 86400000;
const dateString = day => new Date(day * 86400000).toISOString().slice(0, 10);
const publicQuestion = ({ text, options }) => ({ text, options });

async function lockPlayer(connection, playerId, required = true) {
  const { rows: [player] } = await connection.query(
    `SELECT *, first_seen_day::text AS "firstDate", last_entry_day::text AS "lastEntryDate",
             salary_day::text AS "salaryDate"
       FROM archive_players WHERE id = $1 FOR UPDATE`, [playerId],
  );
  if (!player && required) throw new RequestError(401, 'Тестовая сессия закончилась. Откройте игру заново.');
  return player;
}

async function findRound(connection, playerId, id) {
  const { rows: [round] } = await connection.query(
    'SELECT *, started_day::text AS "startedDate" FROM archive_quiz_rounds WHERE player_id = $1 AND id = $2', [playerId, id],
  );
  return round;
}

async function dailyTask(connection, date, daily) {
  const { rows: [existing] } = await connection.query(
    'SELECT person_id FROM archive_daily_tasks WHERE day = $1', [date],
  );
  if (existing) return existing.person_id;
  const person = daily.person(asDayNumber(date));
  await connection.query('INSERT INTO archive_daily_tasks (day, person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [date, person]);
  const { rows: [task] } = await connection.query('SELECT person_id FROM archive_daily_tasks WHERE day = $1', [date]);
  return task.person_id;
}

async function completedDaily(connection, playerId, date) {
  const { rows: [row] } = await connection.query(`SELECT answers->-1->'result' AS result
    FROM archive_quiz_rounds WHERE player_id = $1 AND started_day = $2 AND mode = 'day' AND status = 'finished'`, [playerId, date]);
  return row?.result ?? null;
}

async function progress(connection, playerId, date, daily) {
  const { rows: [row] } = await connection.query(`
    SELECT player.facts, player.discovered, player.earned, player.paid, player.inventory, player.donations, player.reputation, player.finds,
           player.audio_settings AS "audioSettings",
           player.last_normal_result AS "lastNormalResult",
           COALESCE(today.score, 0) AS daily, yesterday.score AS yesterday,
           player.display_name AS "displayName", player.display_photo AS "displayPhoto",
           player.first_seen_day = $2::date AS "firstDay",
           COALESCE(player.last_entry_day = $2::date AND
             (player.first_seen_day = $2::date OR player.salary_day = $2::date), false) AS "enteredToday",
           CASE WHEN player.salary_day = $2::date THEN player.salary_joke END AS "salaryJoke",
           COALESCE(player.salary_day = $2::date AND player.salary_seen_day IS DISTINCT FROM $2::date, false) AS "salaryPending"
      FROM archive_players AS player
      LEFT JOIN archive_daily_scores AS today ON today.player_id = player.id AND today.day = $2::date
      LEFT JOIN archive_daily_scores AS yesterday ON yesterday.player_id = player.id AND yesterday.day = $2::date - 1
     WHERE player.id = $1`, [playerId, date]);
  if (!row) return row;
  return { ...row, calendarDay: asDayNumber(date), dailyPerson: await dailyTask(connection, date, daily),
    dailyResult: await completedDaily(connection, playerId, date),
    yesterdayResult: row.yesterday === null ? null : await yesterdayResult(connection, playerId, date) };
}

export function createQuiz(database, data, now = () => new Date()) {
  const bank = createQuizBank(data);
  const daily = createDailyQuiz(data,bank.factValues);
  const readProgress = (connection, playerId, date) => progress(connection, playerId, date, daily);

  return {
    progress(playerId) {
      return database.transaction(async connection => {
        const player = await lockPlayer(connection, playerId, false);
        if (!player) return null;
        const date = dateFor(now);
        if (!player.firstDate) {
          await connection.query('UPDATE archive_players SET first_seen_day = $2 WHERE id = $1', [playerId, date]);
        }
        const awards = [...collectionFinds(data, player), ...balanceFinds(player)];
        if (Object.keys(player.discovered).length) awards.push('01');
        if (!player.finds['10']) {
          const { rows: [row] } = await connection.query(`SELECT EXISTS (
            SELECT 1 FROM archive_quiz_rounds AS round,
              jsonb_array_elements(round.answers) AS answer
            WHERE round.player_id = $1 AND round.mode = 'normal' AND answer #>> '{feedback,correct}' = 'false'
          ) AS incorrect`, [playerId]);
          if (row.incorrect) awards.push('10');
        }
        const missing = awards.filter(id => !player.finds[id]);
        if (missing.length) {
          await connection.query('UPDATE archive_players SET finds = finds || $2::jsonb WHERE id = $1',
            [playerId, JSON.stringify(Object.fromEntries(missing.map(id => [id, true])))]);
        }
        return readProgress(connection, playerId, date);
      });
    },
    dayEntry(playerId) {
      return database.transaction(async connection => {
        const player = await lockPlayer(connection, playerId);
        const date = dateFor(now);
        const first = player.firstDate ?? date;
        if (player.lastEntryDate !== date || (date > first && player.salaryDate !== date)) {
          let amount = 0;
          let joke = null;
          let awards = {};
          if (date > first && player.salaryDate !== date) {
            amount = 30;
            [joke] = sample(data.salaryJokes.filter(item => item.id !== player.salary_joke),1);
            awards = Object.fromEntries(['18', ...balanceFinds({earned:player.earned+amount,reputation:player.reputation})]
              .map(id=>[id,true]));
            if (asDayNumber(date) - asDayNumber(player.lastEntryDate ?? first) > 7) awards['26'] = true;
          }
          await connection.query(`UPDATE archive_players SET first_seen_day = $2, last_entry_day = $3,
              earned = earned + $4, finds = finds || $5::jsonb,
              salary_day = CASE WHEN $4 > 0 THEN $3 ELSE salary_day END,
              salary_joke = COALESCE($6,salary_joke) WHERE id = $1`,
          [playerId,first,date,amount,JSON.stringify(awards),joke?.id ?? null]);
        }
        return readProgress(connection, playerId, date);
      });
    },
    async acknowledge(playerId, kind, day) {
      const date = dateString(day);
      if (kind === 'salary') {
        await database.query('UPDATE archive_players SET salary_seen_day = $2 WHERE id = $1 AND salary_day = $2', [playerId,date]);
      } else {
        await database.query(`UPDATE archive_players SET yesterday_seen_day = $2
          WHERE id = $1 AND $2::date < $3::date AND (yesterday_seen_day IS NULL OR yesterday_seen_day < $2::date)
            AND EXISTS (SELECT 1 FROM archive_daily_scores WHERE player_id = $1 AND day = $2)`, [playerId,date,dateFor(now)]);
      }
      return {};
    },
    async setDisplay(playerId, {name, photo}) {
      return database.transaction(async connection => {
        if ((await lockPlayer(connection, playerId)).vk_app_id === null) return {};
        await connection.query('UPDATE archive_players SET display_name = $2, display_photo = $3 WHERE id = $1', [playerId,name,photo]);
        await connection.query('UPDATE archive_daily_scores SET name = $3, photo = $4 WHERE player_id = $1 AND day = $2',
          [playerId,dateFor(now),name,photo]);
        return {};
      });
    },
    rankings(playerId) {
      const date = dateFor(now);
      return database.transaction(connection => rankings(connection,playerId,date,dateString(asDayNumber(date)-1)));
    },
    shop(playerId, id, command) {
      return database.transaction(async connection => {
        const player = await lockPlayer(connection,playerId);
        const receipt = await applyShopOperation(connection,data,player,id,command);
        return { ...receipt, progress:await readProgress(connection,playerId,dateFor(now)) };
      });
    },
    async updateProfile(playerId, { finds, audio, initialAudio }) {
      const { rows: [profile] } = await database.query(`UPDATE archive_players
        SET finds = finds || $2::jsonb,
            audio_settings = CASE
              WHEN $3::jsonb = '{}'::jsonb AND $4::jsonb IS NULL THEN audio_settings
              ELSE COALESCE(audio_settings, $4::jsonb, $5::jsonb) || $3::jsonb
            END
        WHERE id = $1 RETURNING finds, audio_settings AS "audioSettings"`,
      [playerId, JSON.stringify(finds), JSON.stringify(audio), initialAudio && JSON.stringify(initialAudio), JSON.stringify(audioDefaults)]);
      if (!profile) throw new RequestError(401, 'Тестовая сессия закончилась. Откройте игру заново.');
      return profile;
    },
    createPlayer: playerId => database.query('INSERT INTO archive_players (id) VALUES ($1)', [playerId]),
    async vkPlayer(appId, userId, create) {
      if (create) {
        await database.query(`INSERT INTO archive_players (id, vk_app_id, vk_user_id) VALUES ($1, $2, $3)
          ON CONFLICT (vk_app_id, vk_user_id) DO NOTHING`, [randomUUID(), appId, userId]);
      }
      const { rows: [player] } = await database.query(
        'SELECT id FROM archive_players WHERE vk_app_id = $1 AND vk_user_id = $2', [appId, userId],
      );
      return player?.id;
    },

    start(playerId, id, mode = 'normal') {
      return database.transaction(async connection => {
        const player = await lockPlayer(connection, playerId);
        const date = dateFor(now);
        const existing = await findRound(connection, playerId, id);
        if (existing && (existing.status !== 'active' || existing.answers.length > 0 || existing.mode !== mode)) {
          throw new RequestError(409, 'Эта партия уже началась. Откройте новую партию.');
        }
        const startedDate = existing?.startedDate ?? date;
        const result = mode === 'day' && !existing ? await completedDaily(connection, playerId, date) : null;
        if (result) return { result, progress: await readProgress(connection,playerId,date) };
        const person = mode === 'day' ? (existing?.questions[0].person ?? await dailyTask(connection,date,daily)) : null;
        const questions = existing?.questions ?? (person ? daily.questions(person) : bank.start(player.facts));
        if (!existing) {
          await connection.query(`UPDATE archive_quiz_rounds SET status = 'abandoned'
            WHERE player_id = $1 AND status = 'active'`, [playerId]);
          await connection.query(`INSERT INTO archive_quiz_rounds (player_id, id, questions, mode, started_day)
            VALUES ($1, $2, $3::jsonb, $4, $5)`, [playerId, id, JSON.stringify(questions),mode,startedDate]);
        }
        return { id, mode, day:asDayNumber(startedDate), person, questions: questions.map(publicQuestion),
          progress: await readProgress(connection, playerId, date) };
      });
    },

    answer(playerId, id, position, choice) {
      return database.transaction(async connection => {
        const player = await lockPlayer(connection, playerId);
        const round = await findRound(connection, playerId, id);
        if (!round) throw new RequestError(404, 'Партия не найдена.');
        const date = dateFor(now);
        const previous = round.answers[position];
        if (previous) {
          if (previous.choice !== choice) throw new RequestError(409, 'Ответ на этот вопрос уже сохранён.');
          return { ...previous, progress: await readProgress(connection, playerId, date) };
        }
        if (round.status !== 'active' || position !== round.answers.length || !round.questions[position]) {
          throw new RequestError(409, 'Эта партия больше не принимает ответы.');
        }

        const question = round.questions[position];
        const correct = choice === question.right;
        const hints = round.used_hints[position] ?? {};
        if (choice === hints.exclude?.removed) throw new RequestError(409, 'Этот вариант уже исключён.');
        const retry = round.retry_attempts[position];
        if (retry?.choice === choice) return { retryAttempt:true, progress:await readProgress(connection,playerId,date) };
        const newPerson = retry ? retry.newPerson : !player.discovered[question.person];
        const newFact = correct && !player.facts[question.fact];
        player.discovered[question.person] = true;
        if (hints.retry && !retry && !correct) {
          round.retry_attempts[position] = { choice,newPerson };
          await connection.query('UPDATE archive_quiz_rounds SET retry_attempts = $3::jsonb WHERE player_id = $1 AND id = $2',
            [playerId,id,JSON.stringify(round.retry_attempts)]);
          await connection.query(`UPDATE archive_players SET discovered = $2::jsonb, finds = finds || '{"01":true,"10":true}'::jsonb
            WHERE id = $1`, [playerId,JSON.stringify(player.discovered)]);
          return { retryAttempt:true, progress:await readProgress(connection,playerId,date) };
        }
        if (newFact) player.facts[question.fact] = true;
        const fact = data.facts[question.fact];
        const receipt = {
          choice,
          person: question.person,
          newPerson,
          newFact,
          feedback: {
            correct,
            title: correct ? (newFact ? 'Факт восстановлен' : 'Верно · факт уже известен') : 'Факт не восстановлен',
            text: correct ? `${data.people[question.person].name} · ${displayField(fact.field)}: ${fact.value}`
              : newPerson ? 'В коллекции появилась новая карточка.' : 'Попробуйте следующий вопрос.',
          },
        };
        if (correct) receipt.right = question.right;
        round.answers.push(receipt);
        const finished = round.answers.length === round.questions.length;
        const isDay = round.mode === 'day';
        let score = 0;
        let reward = 0;
        if (finished) {
          score = round.answers.filter(answer => answer.feedback.correct).length;
          reward = score * 10;
          const bonus = isDay ? 50 : 0;
          receipt.result = {
            mode:round.mode, day:asDayNumber(isDay ? round.startedDate : date), answered: round.questions.length, correct: score, reward, bonus,
            fresh: round.answers.filter(answer => answer.newFact).length,
            newPeople: round.answers.filter(answer => answer.newPerson).length,
          };
          reward += bonus;
          await addDailyScore(connection, player, date, score);
        }
        const awards = ['01', ...collectionFinds(data, player, question.person),
          ...balanceFinds({ earned: player.earned + reward, reputation: player.reputation + score })];
        if (!correct) awards.push(isDay ? '27' : '10');
        if (correct && hints.retry && !retry) awards.push('20');
        if (finished && isDay) awards.push('19');
        await connection.query(`UPDATE archive_players
             SET facts = $2::jsonb, discovered = $3::jsonb, earned = earned + $4, reputation = reputation + $5,
                 last_normal_result = COALESCE($6::jsonb, last_normal_result), finds = finds || $7::jsonb
           WHERE id = $1`, [playerId, JSON.stringify(player.facts), JSON.stringify(player.discovered), reward, score,
          finished && !isDay ? JSON.stringify(receipt.result) : null, JSON.stringify(Object.fromEntries(awards.map(id => [id, true])))]);
        await connection.query(`UPDATE archive_quiz_rounds
             SET answers = $3::jsonb, status = $4, finished_day = $5, score = $6
           WHERE player_id = $1 AND id = $2`, [playerId, id, JSON.stringify(round.answers),
          finished ? 'finished' : 'active', finished ? date : null, score]);
        return { ...receipt, progress: await readProgress(connection, playerId, date) };
      });
    },

    abandon(playerId, id) {
      return database.transaction(async connection => {
        await lockPlayer(connection, playerId);
        const { rows } = await connection.query(`UPDATE archive_quiz_rounds
          SET status = CASE WHEN status = 'active' THEN 'abandoned' ELSE status END
          WHERE player_id = $1 AND id = $2 RETURNING status, answers->-1->'result' AS result`, [playerId, id]);
        if (!rows.length) throw new RequestError(404, 'Партия не найдена.');
        return { finished: rows[0].status === 'finished', result:rows[0].result,
          progress: await readProgress(connection, playerId, dateFor(now)) };
      });
    },
  };
}
