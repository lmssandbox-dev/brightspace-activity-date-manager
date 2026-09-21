// index.js
// LTI 1.3 + ltijs + MongoDB Atlas + Brightspace APIs via Private Key JWT

require('dotenv').config();

const axios = require('axios');
const { createBrightspaceAuth } = require('./brightspace-auth');
const { databaseConfig } = require('./database-config');
const lti = require('ltijs').Provider;

// ===============================
// Variáveis de ambiente
// ===============================
const {
  // Infra / ltijs
  MONGODB_URL,
  LTI_KEY,
  PORT,

  // Brightspace LTI Platform (Registration LTI 1.3)
  BS_URL,
  BS_NAME,
  BS_CLIENT_ID,
  BS_AUTH_ENDPOINT,
  BS_TOKEN_ENDPOINT,   // ex.: https://auth.brightspace.com/core/connect/token
  BS_KEYSET_URL,

  // OAuth2 Client Credentials / Service User
  D2L_OAUTH2_CLIENT_ID,
  D2L_OAUTH2_PRIVATE_KEY,
  D2L_OAUTH2_KEY_ID,
  D2L_OAUTH2_TOKEN_ENDPOINT,
  D2L_OAUTH2_SCOPES,

  // Versões APIs LP/LE
  D2L_LP_VERSION,
  D2L_LE_VERSION
} = process.env;

const port = PORT || 3000;

// ===============================
// Validação básica de env
// ===============================
if (!MONGODB_URL || !LTI_KEY) {
  console.error('❌ ERRO: MONGODB_URL e LTI_KEY devem estar definidas no .env');
  process.exit(1);
}

const missingPlatformVariables = Object.entries({
  BS_URL, BS_AUTH_ENDPOINT, BS_TOKEN_ENDPOINT, BS_KEYSET_URL
}).filter(([, value]) => !value || !value.trim()).map(([name]) => name);

if (missingPlatformVariables.length) {
  console.error(`❌ Missing Brightspace LTI environment variables: ${missingPlatformVariables.join(', ')}. Configure them in Render and redeploy.`);
  process.exit(1);
}

if (!D2L_OAUTH2_CLIENT_ID || !D2L_OAUTH2_PRIVATE_KEY || !D2L_OAUTH2_KEY_ID || !D2L_OAUTH2_SCOPES) {
  throw new Error('Configure D2L_OAUTH2_CLIENT_ID, D2L_OAUTH2_PRIVATE_KEY, D2L_OAUTH2_KEY_ID e D2L_OAUTH2_SCOPES');
}

if (!D2L_LP_VERSION || !D2L_LE_VERSION) {
  console.error('❌ ERRO: D2L_LP_VERSION e D2L_LE_VERSION devem estar definidas no .env');
  process.exit(1);
}

// Roots das APIs LP e LE
const lpRoot = `${BS_URL}/d2l/api/lp/${D2L_LP_VERSION}`;
const leRoot = `${BS_URL}/d2l/api/le/${D2L_LE_VERSION}`;

const oauth = createBrightspaceAuth({
  clientId: D2L_OAUTH2_CLIENT_ID,
  scope: D2L_OAUTH2_SCOPES,
  kid: D2L_OAUTH2_KEY_ID,
  privateKeyPem: D2L_OAUTH2_PRIVATE_KEY,
  tokenEndpoint: D2L_OAUTH2_TOKEN_ENDPOINT,
  http: axios
});

// ===============================
// Helpers genéricos para chamadas REST
// ===============================
function resolvePath(path) {
  const url = new URL(path, BS_URL);
  if (url.origin !== new URL(BS_URL).origin || url.protocol !== 'https:') {
    throw new Error('API URL must belong to the configured Brightspace HTTPS origin');
  }
  return url.href;
}

async function d2lRequest(method, path, options = {}) {
  const token = await oauth.getAccessToken();

  const config = {
    ...options,
    timeout: 15000,
    maxRedirects: 0,
    method,
    url: resolvePath(path),
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  };

  const res = await axios(config);
  return res.data;
}

async function d2lGet(path, config) {
  return d2lRequest('GET', path, config);
}

// Helpers específicos (exemplos)
async function getCourse(courseId) {
  return d2lGet(`${lpRoot}/courses/${encodeURIComponent(courseId)}`);
}

async function getCourseContentToc(courseId) {
  return d2lGet(`${leRoot}/${encodeURIComponent(courseId)}/content/toc`);
}

// ===============================
// Setup ltijs (LTI 1.3 Provider)
// ===============================
lti.setup(
  LTI_KEY,
  databaseConfig(MONGODB_URL),
  {
    appRoute: '/',       // Target Link URI
    loginRoute: '/login',
    cookies: {
      secure: true,
      sameSite: 'None'
    },
    devMode: false
  }
);

// Public discovery endpoints must be reachable without an LTI launch.
lti.whitelist({ route: '/.well-known/brightspace-jwks.json', method: 'get' }, { route: '/ping', method: 'get' });
lti.app.get('/.well-known/brightspace-jwks.json', (req, res) => res.json(oauth.jwks));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Registro da plataforma Brightspace
async function registerBrightspace() {
  const platform = await lti.registerPlatform({
    url: BS_URL,                        // Issuer
    name: BS_NAME || 'Brightspace',
    clientId: BS_CLIENT_ID,
    authenticationEndpoint: BS_AUTH_ENDPOINT,
    accesstokenEndpoint: BS_TOKEN_ENDPOINT,
    authConfig: {
      method: 'JWK_SET',
      key: BS_KEYSET_URL
    }
  });

  console.log('✅ Plataforma Brightspace registrada:', await platform.platformName());
}

// ===============================
// Handler do Launch LTI
// ===============================
lti.onConnect(async (token, req, res) => {
  try {

    const courseId = token.platformContext?.context?.id;
    if (!courseId) return res.status(400).send('Launch sem contexto de curso.');
    const nome =
      token.userInfo?.name ||
      token.userInfo?.given_name ||
      'Usuário';

    let courseData = null;
    let toc = null;

    try {
      courseData = await getCourse(courseId);
    } catch (err) {
      console.error('❌ Erro ao buscar dados do curso via API LP:', err.response?.status || err.message);
    }

    try {
      toc = await getCourseContentToc(courseId);
    } catch (err) {
      console.error('❌ Erro ao buscar TOC do curso via API LE:', err.response?.status || err.message);
    }

    res.send(`
      <h1>Olá, ${escapeHtml(nome)} 👋</h1>
      <p>Launch LTI 1.3 concluído com sucesso.</p>

      <h2>Dados do Launch LTI</h2>
      <pre>${escapeHtml(JSON.stringify({
        courseId,
        roles: token.roles,
        context: token.platformContext?.context
      }, null, 2))}</pre>

      <h2>Dados da API Brightspace (via OAuth2 Service User)</h2>

      <h3>Curso (LP /courses/${encodeURIComponent(courseId)})</h3>
      <pre>${courseData ? escapeHtml(JSON.stringify(courseData, null, 2)) : 'Falha ao carregar curso.'}</pre>

      <h3>TOC do Curso (LE /content/toc)</h3>
      <pre>${toc ? escapeHtml(JSON.stringify(toc, null, 2)) : 'Falha ao carregar TOC.'}</pre>
    `);
  } catch (err) {
    console.error('❌ Erro no onConnect:', err.response?.status || err.message);
    res.status(500).send('Erro interno ao processar o launch LTI / chamadas de API Brightspace.');
  }
});

// Health-check
lti.app.get('/ping', (req, res) => {
  res.send('App LTI no Render está viva 🚀');
});

// ===============================
// Inicialização
// ===============================
const start = async () => {
  try {
    await lti.deploy({ port });
    console.log(`🚀 Servidor LTI rodando na porta ${port}`);
    if (BS_CLIENT_ID && BS_CLIENT_ID.trim()) {
      await registerBrightspace();
    } else {
      console.log('Setup mode: key endpoints are available. Set BS_CLIENT_ID after creating the Brightspace LTI registration, then restart.');
    }
  } catch (err) {
    console.error('❌ Erro na inicialização:', err.message);
    process.exit(1);
  }
};

start();
