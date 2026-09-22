'use strict';
const { id } = require('../id');
const { describeAvailabilityType } = require('../availability');
const { normalizeActivity } = require('../../services/activityNormalizer');

function availability(row) {
  const field = key => describeAvailabilityType(row?.[key], row != null && Object.hasOwn(row, key));
  return { startType: field('StartDateAvailabilityType'), endType: field('EndDateAvailabilityType') };
}
function metadata(row) {
  const result = {};
  for (const key of ['IsHidden', 'IsActive', 'IsLocked', 'IsBroken', 'DisplayInCalendar']) {
    if (Object.hasOwn(row, key)) result[key[0].toLowerCase() + key.slice(1)] = row[key];
  }
  return result;
}
function activity(type, row, orgUnitId, itemId, parentId = null, dates = row, types = row) {
  return normalizeActivity({ type, id: id(itemId), parentId: parentId == null ? null : id(parentId),
    name: row.Name ?? row.Title ?? '', orgUnitId: id(orgUnitId),
    dates: { start: dates.StartDate, due: dates.DueDate, end: dates.EndDate },
    availability: availability(types), identity: { activityId: row.ActivityId ?? null }, metadata: metadata(row) });
}
function normalizeAssignment(row, orgUnitId) {
  return activity('assignment', row, orgUnitId, row.Id, row.CategoryId,
    { StartDate: row.Availability?.StartDate, EndDate: row.Availability?.EndDate, DueDate: row.DueDate }, row.Availability);
}
const normalizeQuiz = (row, orgUnitId) => activity('quiz', row, orgUnitId, row.QuizId, row.CategoryId);
const normalizeDiscussionForum = (row, orgUnitId) => activity('discussionForum', row, orgUnitId, row.ForumId);
const normalizeDiscussionTopic = (row, orgUnitId) => activity('discussionTopic', row, orgUnitId, row.TopicId, row.ForumId);

function flattenToc(toc) {
  if (!toc || !Array.isArray(toc.Modules)) throw new Error('Invalid Content TOC response');
  const entries = [];
  const seen = new Set();
  function visit(row, kind, parentId, position) {
    const itemId = id(kind === 'module' ? row.ModuleId : row.TopicId);
    if (seen.has(itemId)) throw new Error('Duplicate Content identity');
    seen.add(itemId);
    entries.push({ kind, id: itemId, parentId, position, name: row.Title ?? '', row });
    if (kind !== 'module') return;
    const children = [...(row.Modules ?? []).map(row => ({ row, kind: 'module' })),
      ...(row.Topics ?? []).map(row => ({ row, kind: 'topic' }))];
    children.sort((a, b) => (a.row.SortOrder ?? Number.MAX_SAFE_INTEGER) - (b.row.SortOrder ?? Number.MAX_SAFE_INTEGER));
    children.forEach((child, index) => visit(child.row, child.kind, itemId, index));
  }
  [...toc.Modules].sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0)).forEach((row, index) => visit(row, 'module', null, index));
  return entries;
}

const nativeTypes = Object.freeze({ 3: 'assignment', 4: 'quiz', 5: 'discussionForum', 6: 'discussionTopic' });
function contentReference(row, kind) {
  const activityType = row.ActivityType ?? null;
  const nativeType = Object.hasOwn(nativeTypes, activityType) ? nativeTypes[activityType] : null;
  // Only positive evidence of File/Link with no tool pointer is standalone.
  // Unknown/future types stay visible as unsupported, not editable Content.
  const standalone = kind === 'module' || ((activityType === 1 || activityType === 2 || activityType === '1' || activityType === '2' ||
    (activityType == null && (row.TopicType === 1 || row.TopicType === 3 || row.TypeIdentifier === 'File'))) &&
    row.ToolId == null && row.ToolItemId == null);
  return { activityId: row.ActivityId ?? null, activityType, toolId: row.ToolId ?? null,
    toolItemId: row.ToolItemId == null ? null : String(row.ToolItemId), nativeType, standalone };
}
function normalizeContent(entry, orgUnitId, detail = {}) {
  const row = { ...entry.row, ...detail };
  const module = entry.kind === 'module';
  const date = (key, fallback) => Object.hasOwn(row, key) ? row[key] : row[fallback];
  return activity(module ? 'contentModule' : 'contentTopic', row, orgUnitId, entry.id, entry.parentId, {
    StartDate: date(module ? 'ModuleStartDate' : 'StartDate', 'StartDateTime'),
    DueDate: date(module ? 'ModuleDueDate' : 'DueDate', 'DueDateTime'),
    EndDate: date(module ? 'ModuleEndDate' : 'EndDate', 'EndDateTime')
  });
}
module.exports = { normalizeAssignment, normalizeQuiz, normalizeDiscussionForum, normalizeDiscussionTopic,
  normalizeContent, flattenToc, contentReference };
