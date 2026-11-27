import { createQuizBank } from '../questions.js';
import { displayField } from '../daily.js';

const moscowDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' });
const dateFor = now => moscowDate.format(now());
const asDayNumber = date => Date.parse(`${date}T00:00:00Z`) / 86400000;
const publicQuestion = ({ text, options }) => ({ text, options });

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function lockPlayer(connection, playerId) {
  const { rows: [player] } = await connection.query(
    'SELECT * FROM archive_players WHERE id = $1 FOR UPDATE', [playerId],
  );
  if (!player) throw new RequestError(401, 'Тестовая сессия закончилась. Откройте игру заново.');
  return player;
}

async function findRound(connection, playerId, id) {
  const { rows: [round] } = await connection.query(
    'SELECT * FROM archive_quiz_rounds WHERE player_id = $1 AND id = $2', [playerId, id],
  );
  return round;
}

async function progress(connection, playerId, date) {
  const { rows: [row] } = await connection.query(`
    SELECT player.facts, player.discovered, player.earned, player.reputation,
           player.last_normal_result AS "lastNormalResult",
           COALESCE(day_scores.today, 0)::integer AS daily,
           day_scores.yesterday::integer AS yesterday
      FROM archive_players AS player
      CROSS JOIN LATERAL (
        SELECT SUM(score) FILTER (WHERE finished_day = $2::date) AS today,
               SUM(score) FILTER (WHERE finished_day = $2::date - 1) AS yesterday
          FROM archive_quiz_rounds
         WHERE player_id = player.id AND finished_day BETWEEN $2::date - 1 AND $2::date
      ) AS day_scores
     WHERE player.id = $1`, [playerId, date]);
  return row && { ...row, calendarDay: asDayNumber(date) };
}

export function createQuiz(database, data, now = () => new Date()) {
  const bank = createQuizBank(data);

  return {
    progress: playerId => progress(database, playerId, dateFor(now)),
    createPlayer: playerId => database.query('INSERT INTO archive_players (id) VALUES ($1)', [playerId]),

    start(playerId, id) {
      return database.transaction(async connection => {
        const player = await lockPlayer(connection, playerId);
        const date = dateFor(now);
        const existing = await findRound(connection, playerId, id);
        if (existing && (existing.status !== 'active' || existing.answers.length > 0)) {
          throw new RequestError(409, 'Эта партия уже началась. Откройте новую партию.');
        }
        const questions = existing?.questions ?? bank.start(player.facts);
        if (!existing) {
          await connection.query(`UPDATE archive_quiz_rounds SET status = 'abandoned'
            WHERE player_id = $1 AND status = 'active'`, [playerId]);
          await connection.query(`INSERT INTO archive_quiz_rounds (player_id, id, questions)
            VALUES ($1, $2, $3::jsonb)`, [playerId, id, JSON.stringify(questions)]);
        }
        return { id, questions: questions.map(publicQuestion), progress: await progress(connection, playerId, date) };
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
          return { ...previous, progress: await progress(connection, playerId, date) };
        }
        if (round.status !== 'active' || position !== round.answers.length || !round.questions[position]) {
          throw new RequestError(409, 'Эта партия больше не принимает ответы.');
        }

        const question = round.questions[position];
        const correct = choice === question.right;
        const newPerson = !player.discovered[question.person];
        const newFact = correct && !player.facts[question.fact];
        player.discovered[question.person] = true;
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
        let score = 0;
        let reward = 0;
        if (finished) {
          score = round.answers.filter(answer => answer.feedback.correct).length;
          reward = score * 10;
          receipt.result = {
            mode: 'normal', day: asDayNumber(date), answered: round.questions.length, correct: score, reward, bonus: 0,
            fresh: round.answers.filter(answer => answer.newFact).length,
            newPeople: round.answers.filter(answer => answer.newPerson).length,
          };
        }
        await connection.query(`UPDATE archive_players
             SET facts = $2::jsonb, discovered = $3::jsonb, earned = earned + $4, reputation = reputation + $5,
                 last_normal_result = COALESCE($6::jsonb, last_normal_result)
           WHERE id = $1`, [playerId, JSON.stringify(player.facts), JSON.stringify(player.discovered), reward, score,
          finished ? JSON.stringify(receipt.result) : null]);
        await connection.query(`UPDATE archive_quiz_rounds
             SET answers = $3::jsonb, status = $4, finished_day = $5, score = $6
           WHERE player_id = $1 AND id = $2`, [playerId, id, JSON.stringify(round.answers),
          finished ? 'finished' : 'active', finished ? date : null, score]);
        return { ...receipt, progress: await progress(connection, playerId, date) };
      });
    },

    abandon(playerId, id) {
      return database.transaction(async connection => {
        await lockPlayer(connection, playerId);
        const { rows } = await connection.query(`UPDATE archive_quiz_rounds
          SET status = CASE WHEN status = 'active' THEN 'abandoned' ELSE status END
          WHERE player_id = $1 AND id = $2 RETURNING status`, [playerId, id]);
        if (!rows.length) throw new RequestError(404, 'Партия не найдена.');
        return { finished: rows[0].status === 'finished', progress: await progress(connection, playerId, dateFor(now)) };
      });
    },
  };
}
