const UNAUTHORIZED = { status: 401, body: { error: 'unauthorized' } };

/**
 * Reject a request that carries no bearer token. Returns the request unchanged
 * when a token is present, so the dispatcher keeps walking the chain.
 */
function requireBearer(request) {
  const header = request.headers?.authorization ?? '';
  if (!header.startsWith('Bearer ')) return UNAUTHORIZED;
  return { ...request, token: header.slice('Bearer '.length) };
}

module.exports = { UNAUTHORIZED, requireBearer };
