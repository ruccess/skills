/** Build a session record bound to a user id and an issue time. */
function makeSession({ id, userId, issuedAt, ttlSeconds }) {
  return { id, userId, issuedAt, expiresAt: issuedAt + ttlSeconds * 1000 };
}

/** True when the session is still valid at `now` (epoch milliseconds). */
function isActive(session, now) {
  return session.expiresAt > now;
}

module.exports = { makeSession, isActive };
