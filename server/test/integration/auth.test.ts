import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { CSRF, makeApp, signUp } from '../helpers.js';

let app: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  app = await makeApp();
});

const register = (body: object) => request(app).post('/api/auth/register').set(CSRF).send(body);
const login = (body: object) => request(app).post('/api/auth/login').set(CSRF).send(body);

describe('registration', () => {
  it('creates an account, starts a session and never returns the password hash', async () => {
    const res = await register({ email: 'Ada@Example.com', password: 'analytical1', displayName: 'Ada' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'ada@example.com', displayName: 'Ada' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const cookie = res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/^moc_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('stores a bcrypt hash, not the plaintext password', async () => {
    await register({ email: 'hash@example.com', password: 'plaintext99', displayName: 'H' });
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', ['hash@example.com']);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    expect(rows[0].password_hash).not.toContain('plaintext99');
  });

  it('stores only a hash of the session token', async () => {
    const res = await register({ email: 'tok@example.com', password: 'password12', displayName: 'T' });
    const token = /moc_session=([^;]+)/.exec(res.headers['set-cookie']![0]!)![1]!;
    const { rows } = await pool.query("SELECT encode(token_hash, 'hex') AS h FROM sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0].h).not.toContain(Buffer.from(token).toString('hex'));
  });

  it('rejects a duplicate email case-insensitively', async () => {
    await register({ email: 'dup@example.com', password: 'password12', displayName: 'A' });
    const res = await register({ email: 'DUP@example.com', password: 'password12', displayName: 'B' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already exists/);
  });

  it.each([
    [{ email: 'not-an-email', password: 'password12', displayName: 'A' }, /valid email/],
    [{ email: 'a@example.com', password: 'short1', displayName: 'A' }, /at least 8/],
    [{ email: 'a@example.com', password: 'lettersonly', displayName: 'A' }, /letter and one number/],
    [{ email: 'a@example.com', password: '12345678', displayName: 'A' }, /letter and one number/],
    [{ email: 'a@example.com', password: 'password12', displayName: '' }, /Name is required/],
    [{ email: 'a@example.com', password: `a1${'x'.repeat(80)}`, displayName: 'A' }, /72 bytes/],
  ])('validates input %#', async (body, message) => {
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(message);
  });
});

describe('login / session / logout', () => {
  it('logs in with correct credentials and /me returns the user', async () => {
    await register({ email: 'log@example.com', password: 'password12', displayName: 'L' });
    const agent = request.agent(app).set(CSRF);
    const res = await agent.post('/api/auth/login').send({ email: 'LOG@example.com', password: 'password12' });
    expect(res.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.email).toBe('log@example.com');
  });

  it('uses the same generic error for a wrong password and an unknown email', async () => {
    await register({ email: 'gen@example.com', password: 'password12', displayName: 'G' });
    const wrongPassword = await login({ email: 'gen@example.com', password: 'wrongpass1' });
    const unknownEmail = await login({ email: 'nobody@example.com', password: 'wrongpass1' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('/me returns null when signed out, and protected routes return 401', async () => {
    const me = await request(app).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toBeNull();
    expect((await request(app).get('/api/drive')).status).toBe(401);
    expect((await request(app).get('/api/storage')).status).toBe(401);
    expect((await request(app).get('/api/folders')).status).toBe(401);
  });

  it('logout invalidates the session server-side (old cookie stops working)', async () => {
    const { agent } = await signUp(app);
    const cookie = (await agent.get('/api/auth/me')).request.cookies;
    expect(cookie).toMatch(/moc_session=/);

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    // Replay the old cookie manually — the server must reject it.
    const replay = await request(app).get('/api/drive').set('Cookie', cookie);
    expect(replay.status).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const { agent } = await signUp(app);
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect((await agent.get('/api/drive')).status).toBe(401);
  });

  it('ignores a forged session cookie', async () => {
    const res = await request(app).get('/api/drive').set('Cookie', 'moc_session=forged-token-value');
    expect(res.status).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('rejects state-changing requests without the custom header', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@example.com', password: 'password12' });
    expect(res.status).toBe(403);
  });

  it('rejects requests from a foreign Origin even with the header', async () => {
    const { agent } = await signUp(app);
    const res = await agent.post('/api/folders').set('Origin', 'https://evil.example').send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('allows the configured client origin', async () => {
    const { agent } = await signUp(app);
    const res = await agent.post('/api/folders').set('Origin', 'http://localhost:5173').send({ name: 'ok' });
    expect(res.status).toBe(201);
  });

  it('CORS only allows the configured origin', async () => {
    const good = await request(app).options('/api/auth/login').set('Origin', 'http://localhost:5173');
    expect(good.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(good.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(app).options('/api/auth/login').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('limits repeated failed login attempts', async () => {
    const limited = await makeApp({ config: { authRateLimitMax: 3 } });
    const attempt = () =>
      request(limited).post('/api/auth/login').set(CSRF).send({ email: 'x@example.com', password: 'nope12345' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('security headers & errors', () => {
  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns JSON errors for malformed bodies and unknown endpoints', async () => {
    const bad = await request(app)
      .post('/api/auth/login')
      .set(CSRF)
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toBe('Malformed JSON body.');
    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});
