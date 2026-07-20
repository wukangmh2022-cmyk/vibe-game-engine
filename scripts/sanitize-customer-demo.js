#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..', 'customer-demo'));
const sceneDir = path.join(root, 'scene');

if (!fs.existsSync(sceneDir)) {
  throw new Error(`Customer demo scene directory not found: ${sceneDir}`);
}

const remoteScript = /\b(?:U|user|RemoteUser)\s*\.\s*(?:login|loginWithToken|logout|register|readData|writeData|get|set|add)\b/i;

function containsLoginRedirect(value) {
  if (Array.isArray(value)) return value.some(containsLoginRedirect);
  if (!value || typeof value !== 'object') return false;
  if (typeof value.url === 'string' && value.url.replace(/^\.\//, '') === 'scene/login.json') return true;
  return Object.values(value).some(containsLoginRedirect);
}

function shouldRemove(command) {
  if (!command || typeof command !== 'object') return false;
  const type = String(command.type || '').toUpperCase();
  if (!type) return false;
  const params = command.parameters || {};
  const text = String(params.text || '');

  if (type === 'SCRIPT' && remoteScript.test(String(params.code || ''))) return true;
  if (type === 'SCENE_REDIRECT' && String(params.url || '').replace(/^\.\//, '') === 'scene/login.json') return true;
  if (type === 'IF_CONDITION' && String(params.condition?.key || '').toLowerCase() === 'login') return true;
  if (type === 'SHOW_TEXT' && (/登录&数据加载中/.test(text) || /^已通过\s/.test(text))) return true;
  if (type === 'UPDATE_TEXT' && /finishTotal_/.test(text)) return true;
  if (type === 'SET_VARIABLE' && String(params.key || '') === '最大通过关卡' && (String(params.value || '') === '{tmp}' || (params.op === 'add' && Number(params.value) === 1))) return true;
  return ['SHOW_BUTTON', 'SHOW_CHOICES', 'SET_CLICKABLE'].includes(type) && containsLoginRedirect(command);
}

function sanitize(value) {
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) {
      const type = String(item?.type || '').toUpperCase();
      const code = String(item?.parameters?.code || '');
      if (type === 'SCRIPT' && /finishTotal_/.test(code)) {
        result.push({
          id: `${item.id || 'set_demo_max_level'}_customer_demo`,
          type: 'SET_VARIABLE',
          parameters: { key: '最大通过关卡', op: 'set', value: 10, temporary: false }
        });
      } else if (!shouldRemove(item)) {
        result.push(sanitize(item));
      }
    }
    return result;
  }
  if (!value || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) value[key] = sanitize(value[key]);
  return value;
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

const configFile = path.join(root, 'config.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
config.project_name = '智慧健脑客户演示';
delete config.user_data_sheet;
writeJson(configFile, config);

for (const name of fs.readdirSync(sceneDir)) {
  if (!name.endsWith('.json') || name === 'login.json') continue;
  const file = path.join(sceneDir, name);
  writeJson(file, sanitize(JSON.parse(fs.readFileSync(file, 'utf8'))));
}

fs.rmSync(path.join(sceneDir, 'login.json'), { force: true });
fs.rmSync(path.join(root, 'modify.json'), { force: true });

const remaining = [];
for (const name of fs.readdirSync(sceneDir)) {
  if (!name.endsWith('.json')) continue;
  const text = fs.readFileSync(path.join(sceneDir, name), 'utf8');
  if (remoteScript.test(text) || text.includes('scene/login.json')) remaining.push(name);
}
if (remaining.length) throw new Error(`Remote commands remain in: ${remaining.join(', ')}`);

console.log(`[customer-demo] Sanitized ${root}; removed remote login, progress, and upload commands.`);
