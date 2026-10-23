import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_PATH ?? './data/life-manager.sqlite';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (telegram_id INTEGER PRIMARY KEY, timezone TEXT NOT NULL DEFAULT 'Asia/Almaty', reminders_enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE, title TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(user_id, due_at, status);
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE, name TEXT NOT NULL, opening_balance INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, name));
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('income','expense')), UNIQUE(user_id,name,kind));
CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE, account_id INTEGER NOT NULL REFERENCES accounts(id), kind TEXT NOT NULL CHECK(kind IN ('income','expense')), amount INTEGER NOT NULL CHECK(amount > 0), category TEXT NOT NULL, occurred_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions(user_id,occurred_on);
CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE, from_account INTEGER NOT NULL REFERENCES accounts(id), to_account INTEGER NOT NULL REFERENCES accounts(id), amount INTEGER NOT NULL CHECK(amount > 0), occurred_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(from_account <> to_account));
CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,name));
CREATE TABLE IF NOT EXISTS habit_entries (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE, habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE, done_on TEXT NOT NULL, UNIQUE(habit_id,done_on));
CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, due_at TEXT NOT NULL, sent_at TEXT, UNIQUE(task_id,due_at));
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);

// Additive migration: keeps existing user data and asks every existing user to choose a language once.
const migration = db.prepare('SELECT 1 FROM schema_migrations WHERE version=1').get();
if (!migration) {
  const addColumn = (table: string, column: string, definition: string) => {
    const columns = db.pragma(`table_info(${table})`) as {name:string}[];
    if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn('users', 'language', 'TEXT');
  addColumn('users', 'currency', "TEXT NOT NULL DEFAULT 'KZT'");
  addColumn('habits', 'target_days', 'INTEGER NOT NULL DEFAULT 90');
  addColumn('habit_entries', 'duration_minutes', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sections (
      user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      section TEXT NOT NULL CHECK(section IN ('tasks','finance','habits','reports')),
      enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(user_id,section)
    );
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'new'
    );
    CREATE INDEX IF NOT EXISTS support_messages_status_idx ON support_messages(status,created_at);
  `);
  db.prepare('INSERT INTO schema_migrations(version) VALUES (1)').run();
}

export function ensureUser(id: number): void {
  db.prepare('INSERT INTO users(telegram_id) VALUES (?) ON CONFLICT(telegram_id) DO NOTHING').run(id);
  const insertSection=db.prepare('INSERT OR IGNORE INTO user_sections(user_id,section) VALUES (?,?)');
  for(const section of ['tasks','finance','habits','reports'])insertSection.run(id,section);
  // У каждого пользователя свои названия счетов и банков. Старый пустой демо-счёт Kaspi убираем.
  db.prepare("DELETE FROM accounts WHERE user_id=? AND name='Kaspi' AND opening_balance=0 AND NOT EXISTS (SELECT 1 FROM transactions WHERE account_id=accounts.id) AND NOT EXISTS (SELECT 1 FROM transfers WHERE from_account=accounts.id OR to_account=accounts.id)").run(id);
  const defaults = [
    ['Еда','expense'],['Транспорт','expense'],['Одежда','expense'],['Развлечения','expense'],['Здоровье','expense'],['Другое','expense'],['Зарплата','income'],['Другое','income'],
  ];
  const insert = db.prepare('INSERT OR IGNORE INTO categories(user_id,name,kind) VALUES (?,?,?)');
  for (const [name, kind] of defaults) insert.run(id, name, kind);
}
