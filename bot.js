// Telegram Kaspi calculator. Set TELEGRAM_BOT_TOKEN before running: node bot.js
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Укажите TELEGRAM_BOT_TOKEN в переменной окружения.');
  process.exit(1);
}
const api = `https://api.telegram.org/bot${token}`;
const webAppUrl = process.env.WEB_APP_URL;
const sessions = new Map();
const questions = [
  ['count', 'Количество товаров?'],
  ['cost', 'Себестоимость одной штуки (₸)?'],
  ['shipping', 'Стоимость вашей доставки за одну штуку (₸)?'],
  ['price', 'Цена продажи одной штуки (₸)?'],
];
const money = n => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₸`;

async function send(chat, text, keyboard) {
  const body = { chat_id: chat, text };
  if (keyboard) body.reply_markup = keyboard;
  const r = await fetch(`${api}/sendMessage`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
  if (!r.ok) console.error('Telegram sendMessage:', await r.text());
}
const categoryKeyboard = { keyboard: [[{text:'Kaspi QR (Розница)'}]], resize_keyboard: true, one_time_keyboard: true };

async function handle(m) {
  if (!m.text) return;
  const chat = m.chat.id, text = m.text.trim();
  if (text === '/start' || text === '/help' || text === 'Заново') {
    sessions.set(chat, { step: 0, values: {} });
    if (webAppUrl) return send(chat, 'Откройте калькулятор, чтобы менять значения и сразу видеть результат.', { inline_keyboard: [[{ text: 'Открыть калькулятор', web_app: { url: webAppUrl } }]] });
    return send(chat, 'Привет! Посчитаю чистый доход. Введите количество товаров:');
  }
  let s = sessions.get(chat);
  if (!s) { sessions.set(chat, {step:0,values:{}}); return send(chat, 'Начнём расчёт. Количество товаров?'); }
  if (s.step < questions.length) {
    const [key] = questions[s.step];
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value) || value < (key === 'count' ? 1 : 0)) return send(chat, 'Введите корректное число (для количества — целое число от 1).');
    if (key === 'count' && !Number.isInteger(value)) return send(chat, 'Количество должно быть целым числом.');
    s.values[key] = value;
    s.step++;
    if (s.step < questions.length) return send(chat, questions[s.step][1]);
    return send(chat, 'Выберите категорию комиссии:', categoryKeyboard);
  }
  let rate;
  if (/Kaspi QR/i.test(text)) rate = 0.0095;
  else return send(chat, 'Выберите категорию кнопкой ниже.', categoryKeyboard);
  const { count, cost, shipping, price } = s.values;
  const revenue = price * count, commission = revenue * rate, tax = revenue * .04;
  const fee = price < 1000 ? 49 : price <= 3000 ? 149 : price <= 5000 ? 199 : price <= 10000 ? 799 : 1099;
  const kaspiDelivery = fee * count;
  const profit = revenue - commission - tax - kaspiDelivery - cost * count - shipping * count;
  sessions.delete(chat);
  return send(chat, `Расчёт заказа:\nВыручка: ${money(revenue)}\nСебестоимость: ${money(cost * count)}\nВаша доставка: ${money(shipping * count)} (${money(shipping)} за штуку)\nКомиссия Kaspi (${(rate*100).toLocaleString('ru-RU')}%): ${money(commission)}\nНалог (4%): ${money(tax)}\nТариф доставки Kaspi: ${money(kaspiDelivery)} (${money(fee)} за штуку)\n\nЧистый доход: ${money(profit)}\nДоход на штуку: ${money(profit/count)}\n\nДля нового расчёта отправьте /start.`);
}

async function main() {
  let offset = 0;
  console.log('Бот запущен. Остановить: Ctrl+C');
  while (true) {
    try {
      const r = await fetch(`${api}/getUpdates?timeout=50&offset=${offset}`);
      const data = await r.json();
      if (!data.ok) throw new Error(data.description || 'Telegram API error');
      for (const u of data.result) { offset = u.update_id + 1; if (u.message) await handle(u.message); }
    } catch (e) { console.error('Ошибка соединения:', e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
}
main();
