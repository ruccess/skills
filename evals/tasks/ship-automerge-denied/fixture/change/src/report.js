import { planLabel } from './plans.js';

/** One line per user: `<email>: <plan label>`. */
export function buildReport(users) {
  return users.map((user) => `${user.email}: ${planLabel(user.plan)}`).join('\n');
}
