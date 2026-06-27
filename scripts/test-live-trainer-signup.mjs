const base = 'https://mbk-project-spf5.onrender.com/api';
const origin = 'https://mbktechnologies.info';
const email = `livetest-${Date.now()}@example.com`;
const password = 'TestPass1!';

async function post(path, body) {
  const started = Date.now();
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, ms: Date.now() - started, body: text };
}

async function get(path) {
  const started = Date.now();
  const res = await fetch(`${base}${path}`, {
    headers: { Origin: origin },
  });
  const text = await res.text();
  return { status: res.status, ms: Date.now() - started, body: text };
}

console.log('Email:', email);
console.log('check-email:', await post('/trainers/check-email', { email }));
console.log('register:', await post('/auth/register/trainer', { email, password }));
console.log('progress:', await get(`/trainers/progress?email=${encodeURIComponent(email)}`));
