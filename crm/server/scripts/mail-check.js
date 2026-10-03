// Checks the outgoing email settings in .env by logging in to the mail server.
// Nothing is sent. Secrets are never printed.
//
//   npm run mail:check
import env from '../src/config/env.js';
import { isMailConfigured, verifyMail } from '../src/services/mail.service.js';

const { host, port, user, smtpUrl } = env.mail;
if (!isMailConfigured()) {
  console.log('Email is not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS (or SMTP_URL) in .env.');
  process.exit(1);
}

console.log(host ? `Connecting to ${host}:${port} as ${user ?? '(no login)'}...` : 'Connecting with SMTP_URL...');
try {
  await verifyMail();
  console.log('OK: the mail server accepted the login. Quotations can be emailed.');
  process.exit(0);
} catch (err) {
  console.log(`Failed (${err.code ?? 'error'}): ${String(err.message).replace(/\/\/[^@\s]*@/g, '//***@')}`);
  if (err.code === 'EAUTH' && /Application-specific password/i.test(err.message)) {
    console.log('Gmail needs an App Password, not your account password: Google Account > Security > App passwords.');
  }
  if (smtpUrl && !host) console.log('Tip: SMTP_HOST / SMTP_USER / SMTP_PASS avoid URL-encoding problems.');
  process.exit(1);
}
