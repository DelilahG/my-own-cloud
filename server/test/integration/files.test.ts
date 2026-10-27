import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { binaryParser, makeApp, PNG_1x1, signUp, storedObjects, upload } from '../helpers.js';

let app: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  app = await makeApp();
});

describe('upload & download', () => {
  it('uploads a file and downloads identical bytes as an attachment', async () => {
    const { agent } = await signUp(app);
    const content = Buffer.from('Hello, cloud! ✓\n'.repeat(1000));
    const up = await upload(agent, 'greeting.txt', content);
    expect(up.status).toBe(201);
    expect(up.body.file).toMatchObject({ name: 'greeting.txt', sizeBytes: content.length, mimeType: 'text/plain' });
    expect(up.body.file).not.toHaveProperty('storageKey');
    expect(JSON.stringify(up.body)).not.toMatch(/storage|[\\/]objects[\\/]/i);

    const down = await agent.get(`/api/files/${up.body.file.id}/download`).buffer(true).parse(binaryParser);
    expect(down.status).toBe(200);
    expect(Buffer.compare(down.body as Buffer, content)).toBe(0);
    expect(down.headers['content-disposition']).toMatch(/^attachment; filename="?greeting\.txt"?$/);
    expect(down.headers['x-content-type-options']).toBe('nosniff');
    expect(down.headers['content-security-policy']).toMatch(/sandbox/);
  });

  it('keeps non-ASCII display names and encodes them safely for download', async () => {
    const { agent } = await signUp(app);
    const up = await upload(agent, 'résumé 2024.txt', 'cv');
    expect(up.body.file.name).toBe('résumé 2024.txt');
    const down = await agent.get(`/api/files/${up.body.file.id}/download`);
    expect(down.headers['content-disposition']).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9%202024.txt");
  });

  it('strips path components from uploaded filenames', async () => {
    const { agent } = await signUp(app);
    const up = await upload(agent, '../../../etc/passwd', 'x');
    expect(up.status).toBe(201);
    expect(up.body.file.name).toBe('passwd');
  });

  it('gives duplicate uploads a unique name instead of overwriting', async () => {
    const { agent } = await signUp(app);
    await upload(agent, 'notes.txt', 'one').expect(201);
    const second = await upload(agent, 'notes.txt', 'two').expect(201);
    const third = await upload(agent, 'NOTES.txt', 'three').expect(201);
    expect(second.body.file.name).toBe('notes (1).txt');
    expect(third.body.file.name).toBe('NOTES (2).txt');
  });

  it('detects the real type from content, not the browser-supplied type or extension', async () => {
    const { agent } = await signUp(app);
    const png = await agent.post('/api/files').attach('file', PNG_1x1, { filename: 'pic.dat', contentType: 'text/html' });
    expect(png.body.file.mimeType).toBe('image/png');
    expect(png.body.file.previewable).toBe(true);

    const fake = await agent
      .post('/api/files')
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.body.file.mimeType).toBe('application/octet-stream');
    expect(fake.body.file.previewable).toBe(false);
  });

  it('serves inline previews only for raster images', async () => {
    const { agent } = await signUp(app);
    const img = await upload(agent, 'pixel.png', PNG_1x1);
    const preview = await agent.get(`/api/files/${img.body.file.id}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toBe('image/png');
    expect(preview.headers['content-disposition']).toMatch(/^inline/);

    const txt = await upload(agent, 'a.txt', 'text');
    expect((await agent.get(`/api/files/${txt.body.file.id}/preview`)).status).toBe(415);
  });

  it('accepts empty files', async () => {
    const { agent } = await signUp(app);
    const res = await upload(agent, 'empty.txt', Buffer.alloc(0));
    expect(res.status).toBe(201);
    expect(res.body.file.sizeBytes).toBe(0);
  });

  it('rejects requests without a file', async () => {
    const { agent } = await signUp(app);
    const res = await agent.post('/api/files').field('note', 'no file');
    expect(res.status).toBe(400);
  });

  it('rejects more than one file per request', async () => {
    const { agent } = await signUp(app);
    const res = await agent
      .post('/api/files')
      .attach('file', Buffer.from('a'), 'a.txt')
      .attach('file', Buffer.from('b'), 'b.txt');
    expect(res.status).toBe(400);
    expect(await storedObjects()).toHaveLength(0);
  });

  it('enforces the maximum file size and leaves nothing behind', async () => {
    const small = await makeApp({ config: { maxFileSizeBytes: 1024 } });
    const { agent } = await signUp(small);
    const res = await upload(agent, 'big.bin', Buffer.alloc(4096, 1));
    expect(res.status).toBe(413);
    expect(await storedObjects()).toHaveLength(0);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM files');
    expect(rows[0].n).toBe(0);
  });
});

describe('storage quota', () => {
  it('enforces the per-user quota on the backend', async () => {
    const { agent, user } = await signUp(app);
    await pool.query('UPDATE users SET quota_bytes = 1000 WHERE id = $1', [user.id]);

    await upload(agent, 'a.bin', Buffer.alloc(600, 1)).expect(201);
    const over = await upload(agent, 'b.bin', Buffer.alloc(600, 2));
    expect(over.status).toBe(413);
    expect(over.body.error.code).toBe('QUOTA_EXCEEDED');
    await upload(agent, 'c.bin', Buffer.alloc(400, 3)).expect(201); // exactly fills the quota

    const summary = await agent.get('/api/storage');
    expect(summary.body).toMatchObject({ usedBytes: 1000, quotaBytes: 1000, availableBytes: 0, fileCount: 2 });
    expect(await storedObjects()).toHaveLength(2);
  });

  it('enforces the quota under concurrent uploads', async () => {
    const { agent, user } = await signUp(app);
    await pool.query('UPDATE users SET quota_bytes = 1000 WHERE id = $1', [user.id]);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => upload(agent, `c${i}.bin`, Buffer.alloc(300, i))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 413)).toHaveLength(2);
    expect((await agent.get('/api/storage')).body.usedBytes).toBe(900);
  });

  it('frees quota when files are deleted', async () => {
    const { agent, user } = await signUp(app);
    await pool.query('UPDATE users SET quota_bytes = 500 WHERE id = $1', [user.id]);
    const a = await upload(agent, 'a.bin', Buffer.alloc(400)).expect(201);
    await upload(agent, 'b.bin', Buffer.alloc(400)).expect(413);
    await agent.delete(`/api/files/${a.body.file.id}`).expect(204);
    await upload(agent, 'b.bin', Buffer.alloc(400)).expect(201);
  });
});

describe('manage files', () => {
  it('renames and moves a file between folders', async () => {
    const { agent } = await signUp(app);
    const folder = (await agent.post('/api/folders').send({ name: 'Docs' })).body.folder;
    const file = (await upload(agent, 'draft.txt', 'text')).body.file;

    const renamed = await agent.patch(`/api/files/${file.id}`).send({ name: 'final.txt' });
    expect(renamed.body.file.name).toBe('final.txt');

    const moved = await agent.patch(`/api/files/${file.id}`).send({ folderId: folder.id });
    expect(moved.body.file.folderId).toBe(folder.id);
    const inFolder = await agent.get(`/api/drive?folderId=${folder.id}`);
    expect(inFolder.body.files.map((f: { name: string }) => f.name)).toEqual(['final.txt']);

    const backToRoot = await agent.patch(`/api/files/${file.id}`).send({ folderId: null });
    expect(backToRoot.body.file.folderId).toBeNull();
  });

  it('rejects renaming onto an existing name in the same folder', async () => {
    const { agent } = await signUp(app);
    await upload(agent, 'a.txt', 'a');
    const b = (await upload(agent, 'b.txt', 'b')).body.file;
    const res = await agent.patch(`/api/files/${b.id}`).send({ name: 'A.TXT' });
    expect(res.status).toBe(409);
  });

  it('deletes a file and its stored bytes', async () => {
    const { agent } = await signUp(app);
    const file = (await upload(agent, 'gone.txt', 'bye')).body.file;
    expect(await storedObjects()).toHaveLength(1);
    await agent.delete(`/api/files/${file.id}`).expect(204);
    expect(await storedObjects()).toHaveLength(0);
    expect((await agent.get(`/api/files/${file.id}/download`)).status).toBe(404);
    expect((await agent.delete(`/api/files/${file.id}`)).status).toBe(404);
  });

  it('returns 410 if the database record exists but the bytes are missing', async () => {
    const { agent } = await signUp(app);
    const file = (await upload(agent, 'x.txt', 'x')).body.file;
    const { rows } = await pool.query('SELECT storage_key FROM files WHERE id = $1', [file.id]);
    const { LocalDiskStorage } = await import('../../src/storage/local-disk-storage.js');
    const { config } = await import('../../src/config/env.js');
    await new LocalDiskStorage(config.storageDir).delete(rows[0].storage_key);
    expect((await agent.get(`/api/files/${file.id}/download`)).status).toBe(410);
  });
});

describe('search & sorting', () => {
  it('searches names across all folders, case-insensitively, treating wildcards literally', async () => {
    const { agent } = await signUp(app);
    const folder = (await agent.post('/api/folders').send({ name: 'Taxes 2024' })).body.folder;
    await upload(agent, 'Invoice-March.pdf', 'x', folder.id);
    await upload(agent, 'invoice-april.pdf', 'x');
    await upload(agent, 'holiday.jpg', 'x');
    await upload(agent, '100% done.txt', 'x');

    const res = await agent.get('/api/drive/search?q=INVOICE');
    expect(res.status).toBe(200);
    expect(res.body.files.map((f: { name: string }) => f.name).sort()).toEqual(['Invoice-March.pdf', 'invoice-april.pdf']);
    expect(res.body.files.find((f: { name: string }) => f.name === 'Invoice-March.pdf').folderName).toBe('Taxes 2024');

    const folders = await agent.get('/api/drive/search?q=taxes');
    expect(folders.body.folders.map((f: { name: string }) => f.name)).toEqual(['Taxes 2024']);

    const pct = await agent.get('/api/drive/search?q=%25');
    expect(pct.body.files.map((f: { name: string }) => f.name)).toEqual(['100% done.txt']);

    expect((await agent.get('/api/drive/search?q=')).status).toBe(400);
  });

  it('sorts by name, size and date in both directions', async () => {
    const { agent } = await signUp(app);
    await upload(agent, 'b.txt', 'xx');
    await upload(agent, 'c.txt', 'x');
    await upload(agent, 'a.txt', 'xxx');
    const names = async (q: string) =>
      (await agent.get(`/api/drive?${q}`)).body.files.map((f: { name: string }) => f.name);

    expect(await names('sort=name&order=asc')).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(await names('sort=name&order=desc')).toEqual(['c.txt', 'b.txt', 'a.txt']);
    expect(await names('sort=size&order=desc')).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(await names('sort=created&order=asc')).toEqual(['b.txt', 'c.txt', 'a.txt']);
    expect((await agent.get('/api/drive?sort=password_hash')).status).toBe(400);
  });
});

describe('storage summary', () => {
  it('reports usage, counts and per-category totals', async () => {
    const { agent } = await signUp(app);
    await agent.post('/api/folders').send({ name: 'F' });
    await upload(agent, 'p.png', PNG_1x1);
    await upload(agent, 'd.txt', 'hello');
    const res = await agent.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.fileCount).toBe(2);
    expect(res.body.folderCount).toBe(1);
    expect(res.body.usedBytes).toBe(PNG_1x1.length + 5);
    const byCat = Object.fromEntries(res.body.categories.map((c: { category: string; count: number }) => [c.category, c.count]));
    expect(byCat).toMatchObject({ images: 1, documents: 1, videos: 0 });
    expect(res.body.recentFiles).toHaveLength(2);
  });
});
