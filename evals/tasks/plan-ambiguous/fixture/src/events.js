const SEVERITIES = ['info', 'warning', 'critical'];

/** Build an event record, rejecting a severity outside the known set. */
function makeEvent({ id, kind, severity = 'info', at }) {
  if (!SEVERITIES.includes(severity)) throw new Error('unknown severity: ' + severity);
  return { id, kind, severity, at };
}

/** Events at or above `severity`, ordered as given. */
function filterBySeverity(events, severity) {
  const floor = SEVERITIES.indexOf(severity);
  return events.filter((event) => SEVERITIES.indexOf(event.severity) >= floor);
}

module.exports = { SEVERITIES, makeEvent, filterBySeverity };
