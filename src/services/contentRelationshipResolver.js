'use strict';

// Resolves already mapped identities. No API field names or tool-number tables.
function resolveContentRelationships(nativeActivities, items) {
  const activities = [...nativeActivities], contentRelationships = [], warnings = [];
  const nodes = new Map();
  for (const item of items) {
    const ref = item.reference;
    const candidates = nativeActivities.filter(a => a.orgUnitId === item.orgUnitId);
    const primary = candidates.filter(a => typeof ref.activityId === 'string' && ref.activityId.length > 0 && a.identity.activityId === ref.activityId);
    const secondary = candidates.filter(a => a.type === ref.nativeType && a.id === ref.toolItemId);
    const matches = primary.length ? primary : secondary;
    let activityKey = null, relationshipKey = null;
    const isRelationship = item.kind === 'topic' && (!ref.standalone || matches.length > 0);
    if (isRelationship) {
      const status = matches.length === 1 ? 'matched' : matches.length > 1 ? 'ambiguous' : ref.nativeType ? 'unmatched' : 'unsupported';
      const identifierConflict = primary.length > 0 && ref.nativeType != null && ref.toolItemId != null && !primary.every(a => secondary.includes(a));
      relationshipKey = `contentRelationship:${item.orgUnitId}:${item.id}`;
      const native = matches.length === 1 ? matches[0] : null;
      contentRelationships.push({ key: relationshipKey, contentId: item.id, parentId: item.parentId,
        orgUnitId: item.orgUnitId, name: item.name,
        identity: { activityId: ref.activityId, activityType: ref.activityType, toolId: ref.toolId, toolItemId: ref.toolItemId },
        nativeActivity: native ? { key: native.key, type: native.type, id: native.id } : null,
        status, matchedBy: primary.length ? 'activityId' : secondary.length ? 'typeAndToolItemId' : null,
        identifierConflict, readStatus: item.readStatus,
        dates: item.activity?.dates ?? null, availability: item.activity?.availability ?? null,
        metadata: item.activity?.metadata ?? {} });
      activityKey = native?.key ?? null;
      if (native && item.activity) {
        const comparable = value => value === null ? null : value.replace(/\.(\d*?)0+Z$/, '.$1Z').replace('.Z', 'Z');
        for (const field of ['start', 'due', 'end']) {
          const nativeValue = native.dates[field], contentValue = item.activity.dates[field];
          if (comparable(nativeValue) !== comparable(contentValue)) warnings.push({
            source: 'contentRelationships', code: 'DATE_INCONSISTENCY',
            message: `Content ${item.id}: ${field} date differs from its canonical native activity.`,
            activityKey: native.key, field, nativeValue, contentValue, details: { contentId: item.id }
          });
        }
      }
      if (status !== 'matched') warnings.push({ source: 'contentRelationships', code: `RELATIONSHIP_${status.toUpperCase()}`,
        message: `Content ${item.id}: ${status} relationship; not a separate editable activity.`, details: { contentId: item.id } });
      if (identifierConflict) warnings.push({ source: 'contentRelationships', code: 'IDENTIFIER_CONFLICT',
        message: `Content ${item.id}: activity identifiers disagree; ActivityId takes precedence.`, details: { contentId: item.id } });
    } else if (item.activity) {
      activities.push(item.activity);
      activityKey = item.activity.key;
    }
    nodes.set(item.id, { key: `contentNode:${item.orgUnitId}:${item.id}`, contentId: item.id,
      parentId: item.parentId, orgUnitId: item.orgUnitId, name: item.name, kind: item.kind,
      position: item.position, readStatus: item.readStatus, activityKey, relationshipKey, children: [] });
  }
  const contentStructure = [];
  for (const node of nodes.values()) {
    if (node.parentId == null) contentStructure.push(node);
    else nodes.get(node.parentId).children.push(node);
  }
  const sort = nodes => { nodes.sort((a, b) => a.position - b.position); nodes.forEach(n => sort(n.children)); };
  sort(contentStructure);
  return { activities, contentRelationships, contentStructure, warnings };
}
module.exports = { resolveContentRelationships };
