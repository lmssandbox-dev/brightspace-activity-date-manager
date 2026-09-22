'use strict';
const { hasDates } = require('../src/services/activityNormalizer');
function assessDiscovery(result) {
  const activities = result.activities, relationships = result.contentRelationships;
  const linked = new Set(relationships.filter(r => r.status === 'matched').map(r => r.nativeActivity.key));
  const nodes = [];
  const walk = children => { for (const node of children) { nodes.push(node); walk(node.children); } };
  walk(result.contentStructure);
  const has = (type, predicate = () => true) => activities.some(a => a.type === type && predicate(a));
  const keys = activities.map(a => a.key);
  const checks = {
    complete: result.complete,
    noWarnings: result.warnings.length === 0,
    uniqueKeys: keys.length === new Set(keys).size,
    correctOrgUnit: [...activities, ...relationships, ...nodes].every(a => a.orgUnitId === result.orgUnitId),
    datedModule: has('contentModule', a => a.parentId === null && hasDates(a)),
    nestedModule: has('contentModule', a => a.parentId != null && hasDates(a)),
    datedStandaloneTopic: has('contentTopic', hasDates),
    linkedAssignment: has('assignment', a => linked.has(a.key)),
    unlinkedAssignment: has('assignment', a => !linked.has(a.key)),
    linkedQuiz: has('quiz', a => linked.has(a.key)),
    unlinkedQuiz: has('quiz', a => !linked.has(a.key)),
    discussionForum: has('discussionForum'),
    linkedDiscussionTopic: has('discussionTopic', a => linked.has(a.key)),
    startOnly: activities.some(a => a.dates.start !== null && a.dates.due === null && a.dates.end === null),
    dueOnly: activities.some(a => a.dates.start === null && a.dates.due !== null && a.dates.end === null),
    endOnly: activities.some(a => a.dates.start === null && a.dates.due === null && a.dates.end !== null),
    ...Object.fromEntries(['assignment', 'quiz', 'discussionTopic', 'contentTopic'].map(type => [`undated_${type}`, has(type, a => !hasDates(a))])),
    ...Object.fromEntries([0,1,2].map(value => [`assignmentAvailability${value}`, has('assignment', a => Object.values(a.availability).some(t => String(t.value) === String(value)))])),
    nonDefaultAvailability: activities.some(a => Object.values(a.availability).some(t => ['SubmissionRestricted','Hidden'].includes(t.name))),
    noDuplicateContentActivities: relationships.every(r => !activities.some(a => a.type === 'contentTopic' && a.id === r.contentId)),
    hierarchyReferences: nodes.every(n => (!n.activityKey || keys.includes(n.activityKey)) &&
      (!n.relationshipKey || relationships.some(r => r.key === n.relationshipKey))),
    utcDates: activities.every(a => Object.values(a.dates).every(d => d === null || /^\d{4}-\d{2}-\d{2}T.*Z$/.test(d)))
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}
module.exports = { assessDiscovery };
