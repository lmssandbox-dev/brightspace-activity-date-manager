'use strict';
const { id } = require('../id');
const { flattenToc, normalizeContent, contentReference } = require('./normalizers');
const { recordWarning } = require('./readResult');
const { apiWarning } = require('../errors');
// Scopes: content:toc:read, content:modules:readonly, content:topics:readonly.
// ignoreDateRestrictions requires LE 1.67+. TOC alone does not carry due dates.
function createContentClient({ read, coursePath, supportsLeVersion = () => true }) {
  const getContentToc = (orgUnitId, raw) => {
    if (!supportsLeVersion('1.67')) throw new Error('Content discovery requires LE 1.67 or later');
    return read(coursePath(orgUnitId, 'content/toc?ignoreDateRestrictions=true'), raw);
  };
  const getContentModule = (orgUnitId, moduleId, raw) => read(coursePath(orgUnitId, `content/modules/${id(moduleId)}`), raw);
  const getContentTopic = (orgUnitId, topicId, raw) => read(coursePath(orgUnitId, `content/topics/${id(topicId)}`), raw);
  return { getContentToc, getContentModule, getContentTopic,
    async getContent(orgUnitId, raw) {
      const entries = flattenToc(await getContentToc(orgUnitId, raw));
      const items = [], warnings = [];
      for (const entry of entries) {
        let reference = contentReference(entry.row, entry.kind);
        let normalized = null;
        try {
          const detail = await (entry.kind === 'module' ? getContentModule : getContentTopic)(orgUnitId, entry.id, raw);
          if (!detail || typeof detail !== 'object' || id(detail.Id) !== entry.id) throw new Error('Invalid Content detail');
          reference = contentReference({ ...entry.row, ...detail }, entry.kind);
          normalized = normalizeContent(entry, orgUnitId, detail);
        } catch (error) {
          if (error.fatal) throw error;
          warnings.push(error.code === 'API_READ_FAILED' ? apiWarning('content', error, { id: entry.id }) : recordWarning('content', error, entry.id));
        }
        items.push({ id: entry.id, parentId: entry.parentId, name: normalized?.name ?? entry.name,
          orgUnitId: id(orgUnitId), kind: entry.kind, position: entry.position, reference,
          activity: normalized, readStatus: normalized ? 'read' : 'failed' });
      }
      return { items, warnings };
    }
  };
}
module.exports = { createContentClient };
