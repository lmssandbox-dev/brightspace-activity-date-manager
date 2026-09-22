'use strict';

const { validateLeRoot, atLeast } = require('./apiVersions');
const { id } = require('./id');
const { ApiReadError } = require('./errors');

// Shared read-only API transport, pagination and URL validation.
function createBrightspaceClient({ get, leRoot, lpRoot }) {
  const version = validateLeRoot(leRoot);
  const origin = new URL(leRoot).origin;
  function safeUrl(path, base = leRoot) {
    const url = new URL(path, base);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password ||
        !url.pathname.startsWith('/d2l/api/')) throw new Error('Invalid Brightspace API URL');
    return url.href;
  }
  async function read(path, raw) {
    const url = safeUrl(path);
    try {
      const data = await get(url);
      if (raw) raw.push({ url, data: redactDiagnostic(data) });
      return data;
    } catch (error) {
      if (error instanceof ApiReadError) throw error;
      throw new ApiReadError(error.response?.status);
    }
  }
  async function list(path, raw) {
    let next = safeUrl(path);
    const seen = new Set();
    const result = [];
    while (next) {
      if (seen.has(next)) throw new Error('Brightspace pagination cycle detected');
      seen.add(next);
      const page = await read(next, raw);
      if (Array.isArray(page)) return result.concat(page);
      if (page && Array.isArray(page.Items) && page.PagingInfo) {
        if (typeof page.PagingInfo.HasMoreItems !== 'boolean') throw new Error('Invalid paging metadata');
        result.push(...page.Items);
        if (!page.PagingInfo.HasMoreItems) return result;
        const bookmark = page.PagingInfo.Bookmark;
        if ((typeof bookmark !== 'string' && typeof bookmark !== 'number') || String(bookmark) === '') {
          throw new Error('Missing pagination bookmark');
        }
        const url = new URL(next);
        url.searchParams.set('bookmark', String(bookmark));
        next = url.href;
        continue;
      }
      if (!page || !Array.isArray(page.Objects) || !Object.hasOwn(page, 'Next')) {
        throw new Error('Invalid Brightspace list response');
      }
      result.push(...page.Objects);
      if (page.Next != null && (typeof page.Next !== 'string' || !page.Next)) {
        throw new Error('Invalid Brightspace pagination link');
      }
      next = page.Next == null ? null : safeUrl(page.Next, next);
    }
    return result;
  }
  const coursePath = (orgUnitId, suffix) => `${leRoot}/${id(orgUnitId)}/${suffix}`;
  function sourcePath(suffix, subOrganizationOrgUnitId) {
    const url = new URL(`${lpRoot}/sourceCourses/${suffix}`);
    if (subOrganizationOrgUnitId != null) url.searchParams.set('subOrganizationOrgUnitId', id(subOrganizationOrgUnitId));
    return url.href;
  }
  const supportsLeVersion = minimum => atLeast(version, minimum);
  return { read, list, coursePath, sourcePath, supportsLeVersion };
}

// Keep the existing service-account token exchange and request safeguards.
function createBrightspaceGet({ http, oauth, baseUrl }) {
  return async function get(path) {
    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || url.protocol !== 'https:') {
      throw new Error('API URL must belong to the configured Brightspace HTTPS origin');
    }
    let token;
    try { token = await oauth.getAccessToken(); }
    catch { throw new ApiReadError(401, true); }
    const response = await http({
      timeout: 15000, maxRedirects: 0, method: 'GET', url: url.href,
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  };
}

// Debug data is separate from the domain contract and omits known secrets/PII.
function redactDiagnostic(value) {
  if (Array.isArray(value)) return value.map(redactDiagnostic);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /password|token|secret|assertion|private.?key|authorization|notificationemail|userinfo/i.test(key)
      ? '[REDACTED]' : redactDiagnostic(item)]));
}
module.exports = { createBrightspaceClient, createBrightspaceGet };
