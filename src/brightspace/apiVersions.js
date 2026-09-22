'use strict';
const MINIMUM_LE_VERSION = '1.90';
function atLeast(version, minimum = MINIMUM_LE_VERSION) {
  if (!/^\d+\.\d+$/.test(version)) return false;
  const [major, minor] = version.split('.').map(Number);
  const [requiredMajor, requiredMinor] = minimum.split('.').map(Number);
  return major > requiredMajor || (major === requiredMajor && minor >= requiredMinor);
}
function validateLeRoot(root) {
  const match = new URL(root).pathname.match(/^\/d2l\/api\/le\/(\d+\.\d+)$/);
  if (!match || !atLeast(match[1])) throw new Error(`Discovery requires Brightspace LE ${MINIMUM_LE_VERSION} or later`);
  return match[1];
}
module.exports = { MINIMUM_LE_VERSION, atLeast, validateLeRoot };
