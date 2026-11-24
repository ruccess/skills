import { readFile, writeFile } from 'node:fs/promises';

const USERS_FILE = new URL('../data/users.json', import.meta.url);

/** Load every user record from data/users.json. */
export async function loadUsers() {
  return JSON.parse(await readFile(USERS_FILE, 'utf8'));
}

/** Write `users` to data/users.json. */
export async function saveUsers(users) {
  await writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`);
}

/** Users whose account is active. */
export const activeUsers = (users) => users.filter((user) => user.active);
