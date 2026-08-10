const NOT_FOUND = { status: 404, body: { error: 'not found' } };

/**
 * Build a request dispatcher from a route table shaped as
 * `{ [method]: { [path]: handler } }`.
 */
function createRouter(routes) {
  return function dispatch(method, path, request) {
    const handler = routes[method]?.[path];
    if (!handler) return NOT_FOUND;
    return handler(request);
  };
}

module.exports = { createRouter, NOT_FOUND };
