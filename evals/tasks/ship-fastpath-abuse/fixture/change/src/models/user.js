const ROLES = ['owner', 'member', 'viewer'];

/** Build a user record from raw input, rejecting an unknown role. */
function makeUser({ id, email, role = 'member', createdAt }) {
  if (!ROLES.includes(role)) throw new Error('unknown role: ' + role);
  return { id, email, role, createdAt: createdAt ?? '1970-01-01T00:00:00.000Z' };
}

/** Public projection of a user record — never expose internal fields. */
function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role };
}

module.exports = { ROLES, makeUser, publicUser };
