/** Keep the first record for each email, comparing emails case-insensitively. */
export function dedupeUsers(users) {
  const seen = new Set();
  return users.filter((user) => {
    const key = user.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
