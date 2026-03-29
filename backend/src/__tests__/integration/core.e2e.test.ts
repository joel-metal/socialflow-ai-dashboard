import './setup';
import request from 'supertest';
import { randomUUID } from 'crypto';
import app from '../../app';
import { UserStore } from '../../models/User';

afterEach(() => {
  (UserStore as any).users = new Map();
});

async function getToken(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'ValidPass1!' });
  return res.body.accessToken as string;
}

// ── Organizations ─────────────────────────────────────────────────────────────
describe('POST /api/v1/organizations', () => {
  it('201 — creates an organization', async () => {
    const token = await getToken('org-create@example.com');
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme', slug: 'acme' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Acme', slug: 'acme' });
  });

  it('409 — duplicate slug', async () => {
    const token = await getToken('org-dup@example.com');
    await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme', slug: 'acme-dup' });
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme 2', slug: 'acme-dup' });
    expect(res.status).toBe(409);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/organizations')
      .send({ name: 'Acme', slug: 'acme-unauth' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/organizations', () => {
  it('200 — returns org list', async () => {
    const token = await getToken('org-list@example.com');
    const res = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('401 — unauthenticated', async () => {
    expect((await request(app).get('/api/v1/organizations')).status).toBe(401);
  });
});

// ── Posts ─────────────────────────────────────────────────────────────────────
describe('POST /api/v1/posts', () => {
  it('201 — creates a post', async () => {
    const token = await getToken('post-create@example.com');
    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello world!', platform: 'twitter', organizationId: randomUUID() });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ content: 'Hello world!', platform: 'twitter' });
  });

  it('422 — missing required fields', async () => {
    const token = await getToken('post-invalid@example.com');
    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'No platform or orgId' });
    expect(res.status).toBe(422);
  });

  it('422 — invalid platform', async () => {
    const token = await getToken('post-platform@example.com');
    const res = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hi', platform: 'myspace', organizationId: randomUUID() });
    expect(res.status).toBe(422);
  });

  it('401 — unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/posts')
      .send({ content: 'Hi', platform: 'twitter', organizationId: randomUUID() });
    expect(res.status).toBe(401);
  });
});

// ── Analytics ─────────────────────────────────────────────────────────────────
describe('GET /api/v1/analytics', () => {
  it('200 — returns analytics response', async () => {
    const token = await getToken('analytics@example.com');
    const res = await request(app)
      .get('/api/v1/analytics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('filters');
  });

  it('400 — invalid platform query param', async () => {
    const token = await getToken('analytics-bad@example.com');
    const res = await request(app)
      .get('/api/v1/analytics?platform=myspace')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
