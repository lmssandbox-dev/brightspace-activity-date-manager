'use strict';

const { id } = require('./id');

// Shared read-only API transport, pagination and URL validation.
function createBrightspaceClient({ get, leRoot, lpRoot }) {
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
      if (raw) raw.push({ url, data });
      return data;
    } catch (error) {
      const status = error.response?.status;
      // Do not expose Axios config, credentials, or arbitrary upstream error bodies.
      throw new Error(`Brightspace GET ${new URL(url).pathname} failed${Number.isInteger(status) ? ` (HTTP ${status})` : ''}`);
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
  return { read, list, coursePath, sourcePath };
}

// Keep the existing service-account token exchange and request safeguards.
function createBrightspaceGet({ http, oauth, baseUrl }) {
  return async function get(path) {
    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || url.protocol !== 'https:') {
      throw new Error('API URL must belong to the configured Brightspace HTTPS origin');
    }
    const token = await oauth.getAccessToken();
    const response = await http({
      timeout: 15000, maxRedirects: 0, method: 'GET', url: url.href,
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  };
}

module.exports = { createBrightspaceClient, createBrightspaceGet };
