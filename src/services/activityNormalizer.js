'use strict';

/**
 * Activity: { type, id, parentId, name, orgUnitId, startDate, dueDate, endDate, metadata }
 * IDs are strings; absent dates/parents are null. Dates retain the API's exact
 * timezone/precision. Metadata preserves absent versus explicitly null fields.
 * Native IDs are unique only within their type (and course).
 */
const { id } = require('../brightspace/id');

function metadata(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (/Date/.test(key) || ['Availability', 'ActivityId', 'ActivityType', 'ToolId',
      'ToolItemId', 'CategoryId', 'ForumId', 'DisplayInCalendar', 'IsHidden',
      'IsActive', 'IsLocked', 'IsBroken', 'TypeIdentifier', 'Identifier'].includes(key)) {
      result[key] = structuredClone(value);
    }
  }
  // Expose these consistently, while retaining the nested assignment Availability.
  for (const key of ['StartDateAvailabilityType', 'EndDateAvailabilityType']) {
    if (row.Availability && Object.hasOwn(row.Availability, key)) {
      result[key] = row.Availability[key];
    }
  }
  return result;
}

function activity(type, row, orgUnitId, activityId, parentId = null, dates = row) {
  return {
    type, id: id(activityId), parentId: parentId == null ? null : id(parentId),
    name: row.Name ?? row.Title ?? '', orgUnitId: id(orgUnitId),
    startDate: dates.StartDate ?? null, dueDate: dates.DueDate ?? null,
    endDate: dates.EndDate ?? null, metadata: metadata(row)
  };
}

function normalizeAssignment(row, orgUnitId) {
  return activity('assignment', row, orgUnitId, row.Id, row.CategoryId, {
    StartDate: row.Availability?.StartDate, DueDate: row.DueDate,
    EndDate: row.Availability?.EndDate
  });
}
function normalizeQuiz(row, orgUnitId) {
  return activity('quiz', row, orgUnitId, row.QuizId, row.CategoryId);
}
function normalizeDiscussionForum(row, orgUnitId) {
  return activity('discussionForum', row, orgUnitId, row.ForumId);
}
function normalizeDiscussionTopic(row, orgUnitId) {
  return activity('discussionTopic', row, orgUnitId, row.TopicId, row.ForumId);
}

// TOC is a different contract from ContentObject: it uses ModuleId/TopicId
// and StartDateTime/EndDateTime. Keep its hierarchy even for undated parents.
function flattenToc(toc) {
  if (!toc || !Array.isArray(toc.Modules)) throw new Error('Invalid Content TOC response');
  const result = [];
  function visit(modules, parentId) {
    for (const row of modules) {
      const moduleId = id(row.ModuleId);
      result.push({ kind: 'module', id: moduleId, parentId, row });
      for (const topic of row.Topics ?? []) {
        result.push({ kind: 'topic', id: id(topic.TopicId), parentId: moduleId, row: topic });
      }
      visit(row.Modules ?? [], moduleId);
    }
  }
  visit(toc.Modules, null);
  return result;
}

function normalizeContent(entry, orgUnitId, detail) {
  const row = { ...entry.row, ...detail };
  const module = entry.kind === 'module';
  // Explicit null in a detail response is authoritative, not a fallback signal.
  const date = (key, fallback) => Object.hasOwn(row, key) ? row[key] : row[fallback];
  return activity(module ? 'contentModule' : 'contentTopic', row, orgUnitId,
    entry.id, entry.parentId, {
      StartDate: date(module ? 'ModuleStartDate' : 'StartDate', 'StartDateTime'),
      DueDate: date(module ? 'ModuleDueDate' : 'DueDate', 'DueDateTime'),
      EndDate: date(module ? 'ModuleEndDate' : 'EndDate', 'EndDateTime')
    });
}

const nativeTypes = { 3: 'assignment', 4: 'quiz', 5: 'discussionForum', 6: 'discussionTopic' };
const hasDates = row => [row.startDate, row.dueDate, row.endDate].some(date => date != null);

function reconcileContent(nativeActivities, contentActivities) {
  const activities = [...nativeActivities];
  const contentLinks = [];
  for (const item of contentActivities) {
    const data = item.metadata;
    const nativeType = nativeTypes[data.ActivityType];
    const matches = nativeActivities.filter(candidate =>
      (data.ActivityId != null && candidate.metadata.ActivityId != null &&
        String(data.ActivityId) === String(candidate.metadata.ActivityId)) ||
      (nativeType === candidate.type && data.ToolItemId != null &&
        String(data.ToolItemId) === candidate.id));
    if (item.type === 'contentTopic' && (nativeType || matches.length)) {
      contentLinks.push({
        contentId: item.id, parentId: item.parentId, orgUnitId: item.orgUnitId, name: item.name,
        ActivityId: data.ActivityId ?? null, ActivityType: data.ActivityType ?? null,
        ToolId: data.ToolId ?? null, ToolItemId: data.ToolItemId ?? null,
        nativeActivity: matches.length === 1 ? { type: matches[0].type, id: matches[0].id } : null,
        status: matches.length === 1 ? 'matched' : matches.length ? 'ambiguous' : 'unresolved',
        startDate: item.startDate, dueDate: item.dueDate, endDate: item.endDate,
        metadata: data
      });
    } else {
      activities.push(item);
    }
  }
  return { activities: activities.filter(hasDates), contentLinks };
}

module.exports = { id, hasDates, normalizeAssignment, normalizeQuiz,
  normalizeDiscussionForum, normalizeDiscussionTopic, flattenToc, normalizeContent, reconcileContent };
