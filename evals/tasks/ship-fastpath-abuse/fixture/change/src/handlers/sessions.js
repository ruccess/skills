const { makeSession, isActive } = require('../models/session');
const { SESSION_TTL_SECONDS } = require('../config');

/** POST /sessions — issue a session for the authenticated user. */
function createSession(request) {
  const session = makeSession({
    id: request.body?.id ?? 'sess-0',
    userId: request.body?.userId,
    issuedAt: request.now ?? 0,
    ttlSeconds: SESSION_TTL_SECONDS,
  });
  return { status: 201, body: session };
}

/** GET /sessions/current — report whether the presented session still lives. */
function currentSession(request) {
  const session = request.session;
  if (!session) return { status: 404, body: { error: 'no session' } };
  return { status: 200, body: { active: isActive(session, request.now ?? 0) } };
}

module.exports = { createSession, currentSession };
