import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BOT_TOKEN: z.string().min(1, 'Укажите BOT_TOKEN в .env').refine((token) => token !== 'replace_with_telegram_bot_token', 'Замените шаблонный BOT_TOKEN в .env на токен от @BotFather'),
  DATABASE_PATH: z.string().default('./data/life-manager.sqlite'),
  TIMEZONE: z.string().default('Asia/Almaty').refine((timezone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, 'Укажите существующий часовой пояс в TIMEZONE'),
  SUPPORT_ADMIN_IDS: z.string().default(''),
});

export const config = schema.parse(process.env);
