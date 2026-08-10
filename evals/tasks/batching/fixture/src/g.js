export function toQueryString(params) {
  return new URLSearchParams(params).toString();
}

export function joinPath(...segments) {
  return segments.map((s) => s.replace(/^\/|\/$/g, '')).filter(Boolean).join('/');
}
