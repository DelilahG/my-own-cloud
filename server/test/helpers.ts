import { readdir } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { createApp, type AppOptions } from '../src/app.js';
import { config } from '../src/config/env.js';

export const CSRF = { 'X-Requested-With': 'MyOwnCloud' };

/** Builds a fresh app with its storage directory initialised. */
export async function makeApp(options: AppOptions = {}) {
  const { app, storage } = createApp(options);
  await storage.init();
  return app;
}

type App = Awaited<ReturnType<typeof makeApp>>;

let counter = 0;

/**
 * Registers a new user and returns a supertest agent that keeps the
 * session cookie and sends the CSRF header on every request.
 */
export async function signUp(app: App, overrides: Partial<{ email: string; password: string; displayName: string }> = {}) {
  counter += 1;
  const body = {
    email: overrides.email ?? `user${counter}-${Date.now()}@example.com`,
    password: overrides.password ?? 'correct horse 42',
    displayName: overrides.displayName ?? `User ${counter}`,
  };
  const agent = request.agent(app).set(CSRF);
  const res = await agent.post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`signUp failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as { id: string; email: string }, password: body.password };
}

/** Uploads a buffer as a file. */
export function upload(
  agent: ReturnType<typeof request.agent>,
  name: string,
  content: string | Buffer,
  folderId?: string | null,
) {
  const url = folderId ? `/api/files?folderId=${folderId}` : '/api/files';
  return agent.post(url).attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content), name);
}

/** Every committed object currently in storage (to verify bytes really get deleted). */
export async function storedObjects(): Promise<string[]> {
  const objectsDir = path.join(config.storageDir, 'objects');
  try {
    const shards = await readdir(objectsDir);
    const nested = await Promise.all(shards.map((s) => readdir(path.join(objectsDir, s))));
    return nested.flat();
  } catch {
    return [];
  }
}

/** Collects a binary response body into a Buffer. */
export function binaryParser(response: unknown, cb: (err: Error | null, body: Buffer) => void) {
  const res = response as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => cb(err, Buffer.alloc(0)));
}

/** A minimal valid 1x1 PNG. */
export const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
