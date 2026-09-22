'use strict';

// AVAILABILITY_T: https://docs.valence.desire2learn.com/res/apiprop.html
// These describe restrictions outside an availability boundary, not dates or
// the current visibility of an item. Never infer a type from a date or IsHidden.
const types = Object.freeze({
  0: { name: 'AccessRestricted', label: 'Access restricted' },
  1: { name: 'SubmissionRestricted', label: 'Submission restricted' },
  2: { name: 'Hidden', label: 'Hidden' }
});

function describeAvailabilityType(raw, present = true) {
  if (!present) return { value: null, name: null, label: 'Not provided', state: 'missing' };
  if (raw == null) return { value: null, name: null, label: 'Not specified', state: 'unspecified' };
  // Accept the documented numeric/string representations without coercing
  // booleans, empty strings or unexpected values into a known restriction.
  const known = (typeof raw === 'number' || typeof raw === 'string') &&
    Object.hasOwn(types, raw) ? types[raw] : null;
  return known ? { value: raw, ...known, state: 'known' } :
    { value: structuredClone(raw), name: null, label: 'Unknown availability type', state: 'unknown' };
}

module.exports = { describeAvailabilityType };
