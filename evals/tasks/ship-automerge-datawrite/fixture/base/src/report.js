/** One line per user: `<email>: <plan>`. */
export function buildReport(users) {
  return users.map((user) => `${user.email}: ${user.plan}`).join('\n');
}
