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

/**
 * Send email via Forward Email API
 * Uses FORWARDEMAIL_KEY for authentication
 * Docs: https://forwardemail.net/en/email-api
 */
export async function sendEmail({ to, subject, html, text, fromOverride }: SendEmailParams) {
  const apiKey = getEnv('FORWARDEMAIL_KEY');
  if (!apiKey) {
    throw new Error('FORWARDEMAIL_KEY is required. Get one at https://forwardemail.net/en/my-account/security');
  }

  const from = fromOverride || getEnv('SMTP_FROM') || getEnv('EMAIL_FROM') || 'noreply@capyschool.com';

  // Forward Email API uses Nodemailer-compatible format
  const payload = {
    from,
    to,
    subject,
    text: text || html.replace(/<[^>]+>/g, ''),
    html,
  };

  // Basic Auth: API_KEY as username, empty password
  const auth = Buffer.from(`${apiKey}:`).toString('base64');

  const response = await fetch('https://api.forwardemail.net/v1/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Forward Email API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}
