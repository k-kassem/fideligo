const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const ENCRYPTED_VALUE_PREFIX = 'enc:v1:';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath);
  const isUtf16Le = raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe;
  const isUtf16Be = raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff;

  const content = (isUtf16Le || isUtf16Be) ? raw.toString('utf16le') : raw.toString('utf8');
  return dotenv.parse(content);
}

function deriveEncryptionKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptValue(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_VALUE_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function toEnvFile(obj) {
  return Object.entries(obj)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n') + '\n';
}

function run() {
  const smtpEnvPath = path.join(process.cwd(), 'smtp.env');
  const data = loadEnvFile(smtpEnvPath);

  const configKey = process.argv[2] || process.env.SMTP_CONFIG_KEY;
  if (!configKey) {
    throw new Error('Clé manquante. Utilisez: node server/encrypt-smtp-config.js "<SMTP_CONFIG_KEY>"');
  }

  const fields = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];

  for (const field of fields) {
    const encryptedField = `${field}_ENC`;
    if (data[field] && !data[encryptedField]) {
      data[encryptedField] = encryptValue(data[field], configKey);
      delete data[field];
    }
  }

  fs.writeFileSync(smtpEnvPath, toEnvFile(data), 'utf8');
  console.log('smtp.env chiffré avec succès.');
  console.log('Définissez SMTP_CONFIG_KEY dans les variables d\'environnement du serveur.');
}

try {
  run();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
