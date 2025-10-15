import nodemailer from 'nodemailer';

function getEnv(key: string, defaultValue?: string) {
  return (import.meta as any).env?.[key] || process.env[key] || defaultValue;
}

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromOverride?: string;
};

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;

  const host = getEnv('SMTP_HOST', 'smtp.forwardemail.net');
  const port = Number(getEnv('SMTP_PORT', '587'));
  const secure = getEnv('SMTP_SECURE', port === 465 ? 'true' : 'false') === 'true';
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');

  if (!host || !port || !user || !pass) {
    throw new Error('SMTP configuration missing. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
    }

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return cachedTransport;
}

export async function sendEmail({ to, subject, html, text, fromOverride }: SendEmailParams) {
  const transporter = getTransport();

  const from = fromOverride || getEnv('SMTP_FROM', `Capy School Auth <no-reply@capyschool.com>`);

  await transporter.sendMail({
    from,
    to,
    subject,
    text: text || html.replace(/<[^>]+>/g, ''),
    html,
  });
}
