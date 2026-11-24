/** Send one email through the mail API at MAIL_API_URL. */
export async function sendMail({ to, subject, body }) {
  const url = process.env.MAIL_API_URL;
  if (!url) throw new Error('MAIL_API_URL 환경 변수가 없다');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, subject, body }),
  });
  if (!response.ok) throw new Error(`메일 API 응답 ${response.status}`);
}
