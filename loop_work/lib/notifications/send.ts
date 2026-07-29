type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type SendResult = { sent: boolean; id: string | null; skipped: string | null; provider?: string };

function parseEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function normaliseRecipients(to: string) {
  return to
    .split(',')
    .map((item) => parseEmailAddress(item))
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function dotStuff(value: string) {
  return value.replace(/(^|\n)\./g, '$1..');
}

function htmlToTextFallback(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function sendViaResend({ to, subject, html, text }: SendEmailArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Loop <onboarding@resend.dev>";
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;

  if (!apiKey) {
    return { sent: false, id: null, skipped: "RESEND_API_KEY is not set", provider: "resend" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text, reply_to: replyTo }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || `Resend returned ${response.status}`);
  }

  return { sent: true, id: payload?.id || null, skipped: null, provider: "resend" };
}

async function sendViaSmtp({ to, subject, html, text }: SendEmailArgs): Promise<SendResult> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = (process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASSWORD || "").replace(/\s+/g, "");
  const from = process.env.EMAIL_FROM || (user ? `Loop <${user}>` : "Loop <no-reply@example.com>");
  const fromEmail = process.env.SMTP_FROM_EMAIL || parseEmailAddress(from);
  const recipients = normaliseRecipients(to);

  if (!host || !user || !pass || recipients.length === 0) {
    return { sent: false, id: null, skipped: "SMTP_HOST, SMTP_USER, SMTP_APP_PASSWORD and recipient are required", provider: "smtp" };
  }

  const tls = await import('node:tls');
  const crypto = await import('node:crypto');
  const boundary = `loop-${crypto.randomUUID()}`;
  const plainText = text || htmlToTextFallback(html);
  const messageId = `<${crypto.randomUUID()}@${fromEmail.split('@')[1] || 'loop.local'}>`;
  const message = [
    `From: ${escapeHeader(from)}`,
    `To: ${escapeHeader(to)}`,
    `Subject: ${escapeHeader(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    plainText,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
    ``,
  ].join('\r\n');

  const isLocalApp = (process.env.APP_BASE_URL || '').includes('localhost') || process.env.NODE_ENV !== 'production';
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false' ? false : !isLocalApp;
  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized });
  socket.setEncoding('utf8');

  let buffer = '';
  const readResponse = () => new Promise<string>((resolve, reject) => {
    const onData = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3}\s/.test(last)) {
        socket.off('data', onData);
        const response = buffer;
        buffer = '';
        resolve(response);
      }
    };
    const onError = (err: Error) => {
      socket.off('data', onData);
      reject(err);
    };
    socket.once('error', onError);
    socket.on('data', onData);
  });

  const command = async (line: string, expect: RegExp = /^[23]/) => {
    socket.write(`${line}\r\n`);
    const response = await readResponse();
    if (!expect.test(response)) throw new Error(`SMTP command failed for ${line.split(' ')[0]}: ${response.trim()}`);
    return response;
  };

  await readResponse();
  await command(`EHLO localhost`);
  const auth = Buffer.from(`\0${user}\0${pass}`).toString('base64');
  await command(`AUTH PLAIN ${auth}`, /^235/);
  await command(`MAIL FROM:<${fromEmail}>`);
  for (const recipient of recipients) await command(`RCPT TO:<${recipient}>`);
  await command(`DATA`, /^354/);
  socket.write(`${dotStuff(message)}\r\n.\r\n`);
  const dataResponse = await readResponse();
  if (!/^250/.test(dataResponse)) throw new Error(`SMTP DATA failed: ${dataResponse.trim()}`);
  await command(`QUIT`, /^221/).catch(() => null);
  socket.end();

  return { sent: true, id: messageId, skipped: null, provider: "smtp" };
}

export async function sendTransactionalEmail(args: SendEmailArgs): Promise<SendResult> {
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASSWORD));

  if (provider === 'smtp' || provider === 'gmail' || (!process.env.RESEND_API_KEY && hasSmtp)) {
    return sendViaSmtp(args);
  }

  return sendViaResend(args);
}

// Backwards-compatible name used by earlier routes/actions.
export async function sendEmailViaResend(args: SendEmailArgs) {
  return sendTransactionalEmail(args);
}
