// Usage:
//   npm run ig:token -- <token>   first time: token generated in Meta dashboard -> Instagram ->
//                                 API setup with Instagram login. Saves a 60-day token and the
//                                 account id to backend/.env.
//   npm run ig:token              renew the saved token (works once it's >24h old, before it expires)
// The token never gets printed. Needs INSTAGRAM_APP_SECRET (the *Instagram* app secret shown on that
// same API setup page) in .env.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GRAPH = 'https://graph.instagram.com';
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const { INSTAGRAM_APP_SECRET, INSTAGRAM_ACCESS_TOKEN } = process.env;
const given = process.argv[2];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

async function call(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  return { ok: res.ok && !data?.error, data };
}

let token = given || INSTAGRAM_ACCESS_TOKEN;
if (!token) fail('Pass a token: npm run ig:token -- <token>');

if (given) {
  // Dashboard-generated tokens may already be long-lived; the exchange only works on short-lived
  // ones, so fall back to using the token as-is if it's rejected.
  if (!INSTAGRAM_APP_SECRET) fail('Set INSTAGRAM_APP_SECRET in backend/.env first.');
  const ex = await call(
    `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${encodeURIComponent(given)}`
  );
  if (ex.ok) token = ex.data.access_token;
} else {
  const rf = await call(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  if (!rf.ok) fail(`Could not renew the token: ${rf.data?.error?.message || 'unknown error'}`);
  token = rf.data.access_token;
}

const me = await call(`${GRAPH}/v21.0/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
if (!me.ok) fail(`Token was rejected by Instagram: ${me.data?.error?.message || 'unknown error'}`);
const accountId = me.data.user_id || me.data.id;

let envText = fs.readFileSync(envPath, 'utf8');
function setVar(name, value) {
  const re = new RegExp(`^${name}=.*$`, 'm');
  envText = re.test(envText) ? envText.replace(re, () => `${name}=${value}`) : `${envText.trimEnd()}\n${name}=${value}\n`;
}
setVar('INSTAGRAM_ACCESS_TOKEN', token);
setVar('INSTAGRAM_BUSINESS_ACCOUNT_ID', accountId);
fs.writeFileSync(envPath, envText);

console.log(`Saved token and account id for @${me.data.username} (${accountId}) to backend/.env. Restart the backend.`);
