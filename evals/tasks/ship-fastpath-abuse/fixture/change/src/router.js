const NOT_FOUND = { status: 404, body: { error: 'not found' } };

/**
 * Build a request dispatcher from a route table shaped as
 * `{ [method]: { [path]: handler } }`.
 *
 * BREAKING: the exported signature gained a second parameter. `options.middleware`
 * is a list of `(request) => request | response` functions applied in order before
 * the handler runs; a middleware that returns a `status` short-circuits the chain.
 */
function createRouter(routes, options = {}) {
  const middleware = options.middleware ?? [];

  return function dispatch(method, path, request) {
    const handler = routes[method]?.[path];
    if (!handler) return NOT_FOUND;

    let current = request;
    for (const step of middleware) {
      const outcome = step(current);
      if (outcome && typeof outcome.status === 'number') return outcome;
      current = outcome ?? current;
    }
    return handler(current);
  };
}

module.exports = { createRouter, NOT_FOUND };
