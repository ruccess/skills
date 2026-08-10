const DEFAULT_PAGE_SIZE = 20;
const SESSION_TTL_SECONDS = 3600;

/** Read runtime config from the environment, falling back to the defaults above. */
function loadConfig(env = {}) {
  return {
    pageSize: Number(env.PAGE_SIZE ?? DEFAULT_PAGE_SIZE),
    sessionTtlSeconds: Number(env.SESSION_TTL_SECONDS ?? SESSION_TTL_SECONDS),
    requireAuth: env.REQUIRE_AUTH !== 'false',
  };
}

module.exports = { DEFAULT_PAGE_SIZE, SESSION_TTL_SECONDS, loadConfig };
