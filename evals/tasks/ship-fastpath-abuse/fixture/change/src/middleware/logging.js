/** Attach a request id without touching the caller's object. */
function withRequestId(request, nextId = () => 'req-0') {
  return { ...request, requestId: request.requestId ?? nextId() };
}

/** One structured log line per request. */
function formatLogLine(request) {
  return JSON.stringify({
    request_id: request.requestId ?? null,
    method: request.method ?? null,
    path: request.path ?? null,
  });
}

module.exports = { withRequestId, formatLogLine };
