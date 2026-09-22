'use strict';

// Domain utilities: no Brightspace field names or API payloads belong here.
function normalizeInstant(value, field) {
  if (value == null) return null;
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/);
  const fail = () => { const error = new Error('Invalid timezone-aware timestamp'); error.code = 'INVALID_DATE'; error.field = field; throw error; };
  if (!match) return fail();
  const [, y, m, d, h, min, sec, fraction, zone] = match;
  const days = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  if (+m < 1 || +m > 12 || +d < 1 || +d > days || +h > 23 || +min > 59 || +sec > 59 ||
      (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) return fail();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fail();
  const utc = new Date(timestamp).toISOString();
  return fraction?.length > 3 ? utc.replace(/\.\d{3}Z$/, `.${fraction}Z`) : utc;
}

function normalizeActivity({ type, id, parentId = null, name, orgUnitId, dates = {},
  availability, identity = { activityId: null }, metadata = {} }) {
  return { key: `${type}:${orgUnitId}:${id}`, type, id, parentId, name, orgUnitId,
    dates: { start: normalizeInstant(dates.start, 'start'), due: normalizeInstant(dates.due, 'due'),
      end: normalizeInstant(dates.end, 'end') }, availability, identity, metadata };
}
const hasDates = activity => Object.values(activity.dates).some(value => value !== null);
module.exports = { normalizeActivity, normalizeInstant, hasDates };
