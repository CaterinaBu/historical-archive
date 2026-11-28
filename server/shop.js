import { hintInfo, researchProducts } from '../content/shop-rules.js';
import { collectionFinds } from '../content/profile-rules.js';
import { RequestError } from './request-error.js';

function spend(player, amount, awards) {
  if (player.earned + player.paid < amount) throw new RequestError(409, 'На балансе не хватает скрепок.');
  const paid = Math.min(amount, player.paid);
  player.paid -= paid;
  player.earned -= amount - paid;
  if (paid < amount) awards.push('21');
}

async function useHint(connection, player, command, awards) {
  const { hint, kind, roundId, position } = command;
  const { rows: [round] } = await connection.query(
    'SELECT mode, status, questions, answers, used_hints, retry_attempts FROM archive_quiz_rounds WHERE player_id = $1 AND id = $2',
    [player.id, roundId],
  );
  const question = round?.questions[position];
  if (!question || round.mode !== 'normal' || round.status !== 'active' || position !== round.answers.length) {
    throw new RequestError(409, 'Подсказку можно применить только к текущему вопросу обычной викторины.');
  }
  const used = round.used_hints[position] ?? {};
  if (Object.hasOwn(used, hint) || (hint === 'retry' && round.retry_attempts[position])) {
    throw new RequestError(409, 'Подсказка уже применена к этому вопросу.');
  }
  if (kind === 'rush') {
    spend(player,hintInfo[hint].now,awards);
    awards.push('14');
  } else {
    if (!player.inventory[hint]) throw new RequestError(409, 'Подсказок этого вида больше нет в запасе.');
    player.inventory[hint]--;
  }
  const receipt = { hint };
  if (hint === 'exclude') {
    receipt.removed = question.options.findIndex((_,index) => index !== question.right && index !== round.retry_attempts[position]?.choice);
  }
  if (hint === 'expert') receipt.right = question.right;
  round.used_hints[position] = { ...used, [hint]:receipt };
  await connection.query('UPDATE archive_quiz_rounds SET used_hints = $3::jsonb WHERE player_id = $1 AND id = $2',
    [player.id,roundId,JSON.stringify(round.used_hints)]);
  return receipt;
}

function research(data, player, command, awards) {
  const { personId, product, fact } = command;
  if (!Object.hasOwn(data.people,personId) || !player.discovered[personId]) {
    throw new RequestError(409, 'Сначала обнаружьте личность в викторине.');
  }
  const remaining = data.people[personId].facts.filter(id => !player.facts[id]);
  const selected = product === 'fact' ? remaining.filter(id => id === fact) : remaining;
  if (!selected.length) throw new RequestError(409, 'Выбранные факты уже открыты или недоступны.');
  spend(player,researchProducts[product].price,awards);
  for (const id of selected) player.facts[id] = true;
  awards.push(product === 'fact' ? '16' : '15', ...collectionFinds(data,player,personId));
}

export async function applyShopOperation(connection, data, player, id, command) {
  const encoded = JSON.stringify(command);
  const { rows: [previous] } = await connection.query(`SELECT receipt, command = $3::jsonb AS same
    FROM archive_shop_operations WHERE player_id = $1 AND id = $2`, [player.id,id,encoded]);
  if (previous) {
    if (!previous.same) throw new RequestError(409, 'Номер операции уже использован.');
    return previous.receipt;
  }

  const awards = [];
  let receipt = {};
  switch (command.kind) {
    case 'buy':
      spend(player,hintInfo[command.hint].before,awards);
      player.inventory[command.hint] = (player.inventory[command.hint] ?? 0) + 1;
      break;
    case 'apply':
    case 'rush':
      receipt = await useHint(connection,player,command,awards);
      break;
    case 'research':
      research(data,player,command,awards);
      break;
    case 'donate':
      if (command.sum > player.earned) throw new RequestError(409, 'Для такого перевода не хватает заработанных скрепок.');
      player.earned -= command.sum;
      player.donations += command.sum;
      awards.push('12');
      break;
  }
  const finds = Object.fromEntries(awards.map(item => [item,true]));
  await connection.query(`UPDATE archive_players SET earned = $2, paid = $3, donations = $4,
    inventory = $5::jsonb, facts = $6::jsonb, finds = finds || $7::jsonb WHERE id = $1`,
  [player.id,player.earned,player.paid,player.donations,JSON.stringify(player.inventory),
    JSON.stringify(player.facts),JSON.stringify(finds)]);
  await connection.query(`INSERT INTO archive_shop_operations (player_id,id,command,receipt)
    VALUES ($1,$2,$3::jsonb,$4::jsonb)`, [player.id,id,encoded,JSON.stringify(receipt)]);
  return receipt;
}
