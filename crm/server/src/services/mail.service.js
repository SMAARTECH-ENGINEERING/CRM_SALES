import nodemailer from 'nodemailer';
import env from '../config/env.js';
import { getSettings } from './settings.service.js';

// Outgoing email. Configured with SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS)
// or SMTP_URL; without either nothing can be sent and callers are told so (see
// isMailConfigured) rather than failing.
function createConfiguredTransport({ host, port, user, pass, smtpUrl }) {
  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      // Port 465 is TLS from the start; other ports upgrade with STARTTLS.
      secure: port === 465,
      ...(user ? { auth: { user, pass } } : {}),
    });
  }
  return smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
}

let transport = createConfiguredTransport(env.mail);

export function isMailConfigured() {
  return Boolean(transport);
}

// Lets tests capture mail instead of sending it:
//   setMailTransport(nodemailer.createTransport({ jsonTransport: true }))
// Pass null to return to "not configured".
export function setMailTransport(replacement) {
  transport = replacement;
}

// The sender is the address in Settings -> Email (MAIL_FROM by default),
// else `from`, else the mail account itself - shown with the configured name.
// Rejects if the server refuses the message.
export async function sendMail({ from, to, subject, text, attachments = [] }) {
  const { fromName, fromAddress, replyTo } = (await getSettings()).email;
  const address = fromAddress || from || env.mail.user;
  return transport.sendMail({
    from: fromName && address ? { name: fromName, address } : address,
    ...(replyTo ? { replyTo } : {}),
    to,
    subject,
    text,
    attachments,
  });
}

// Logs in to the mail server without sending anything. Used by
// `npm run mail:check`.
export function verifyMail() {
  return transport.verify();
}
