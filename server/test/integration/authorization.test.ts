import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { binaryParser, makeApp, signUp, upload } from '../helpers.js';

// Two users: Alice owns everything; Mallory tries to reach it by guessing
// or tampering with ids. Every attempt must fail and leave Alice's data intact.

let app: Awaited<ReturnType<typeof makeApp>>;
let alice: Awaited<ReturnType<typeof signUp>>;
let mallory: Awaited<ReturnType<typeof signUp>>;
let aliceFolder: { id: string };
let aliceFile: { id: string };

beforeAll(async () => {
  app = await makeApp();
});

beforeEach(async () => {
  alice = await signUp(app, { displayName: 'Alice' });
  mallory = await signUp(app, { displayName: 'Mallory' });
  aliceFolder = (await alice.agent.post('/api/folders').send({ name: 'Private' })).body.folder;
  aliceFile = (await upload(alice.agent, 'secret.txt', 'top secret', aliceFolder.id)).body.file;
});

async function aliceStillHasEverything() {
  const contents = await alice.agent.get(`/api/drive?folderId=${aliceFolder.id}`);
  expect(contents.status).toBe(200);
  expect(contents.body.folder.name).toBe('Private');
  expect(contents.body.files.map((f: { name: string }) => f.name)).toEqual(['secret.txt']);
  const down = await alice.agent.get(`/api/files/${aliceFile.id}/download`).buffer(true).parse(binaryParser);
  expect((down.body as Buffer).toString()).toBe('top secret');
}

describe('cross-user access is denied', () => {
  it('cannot download or preview another user\'s file', async () => {
    const res = await mallory.agent.get(`/api/files/${aliceFile.id}/download`);
    expect(res.status).toBe(404); // indistinguishable from "does not exist"
    expect(res.text).not.toContain('top secret');
    expect((await mallory.agent.get(`/api/files/${aliceFile.id}/preview`)).status).toBe(404);
  });

  it('cannot list another user\'s folder', async () => {
    const res = await mallory.agent.get(`/api/drive?folderId=${aliceFolder.id}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('secret.txt');
  });

  it('cannot rename, move or delete another user\'s file', async () => {
    expect((await mallory.agent.patch(`/api/files/${aliceFile.id}`).send({ name: 'pwned.txt' })).status).toBe(404);
    expect((await mallory.agent.patch(`/api/files/${aliceFile.id}`).send({ folderId: null })).status).toBe(404);
    expect((await mallory.agent.delete(`/api/files/${aliceFile.id}`)).status).toBe(404);
    await aliceStillHasEverything();
  });

  it('cannot rename, move or delete another user\'s folder', async () => {
    expect((await mallory.agent.patch(`/api/folders/${aliceFolder.id}`).send({ name: 'pwned' })).status).toBe(404);
    expect((await mallory.agent.patch(`/api/folders/${aliceFolder.id}`).send({ parentId: null })).status).toBe(404);
    expect((await mallory.agent.delete(`/api/folders/${aliceFolder.id}`)).status).toBe(404);
    await aliceStillHasEverything();
  });

  it('cannot upload into another user\'s folder', async () => {
    const res = await upload(mallory.agent, 'planted.txt', 'x', aliceFolder.id);
    expect(res.status).toBe(404);
    await aliceStillHasEverything();
  });

  it('cannot create a subfolder inside another user\'s folder', async () => {
    const res = await mallory.agent.post('/api/folders').send({ name: 'planted', parentId: aliceFolder.id });
    expect(res.status).toBe(404);
  });

  it('cannot move own items into another user\'s folder', async () => {
    const ownFile = (await upload(mallory.agent, 'mine.txt', 'x')).body.file;
    const ownFolder = (await mallory.agent.post('/api/folders').send({ name: 'Mine' })).body.folder;
    expect((await mallory.agent.patch(`/api/files/${ownFile.id}`).send({ folderId: aliceFolder.id })).status).toBe(404);
    expect((await mallory.agent.patch(`/api/folders/${ownFolder.id}`).send({ parentId: aliceFolder.id })).status).toBe(
      404,
    );
    await aliceStillHasEverything();
  });

  it('search, folder list and storage summary only include the user\'s own data', async () => {
    const search = await mallory.agent.get('/api/drive/search?q=secret');
    expect(search.body.files).toEqual([]);
    expect((await mallory.agent.get('/api/folders')).body.folders).toEqual([]);
    const summary = await mallory.agent.get('/api/storage');
    expect(summary.body).toMatchObject({ usedBytes: 0, fileCount: 0, folderCount: 0, recentFiles: [] });
  });

  it('unauthenticated requests cannot touch anything', async () => {
    const { default: request } = await import('supertest');
    const anon = request(app);
    expect((await anon.get(`/api/files/${aliceFile.id}/download`)).status).toBe(401);
    expect((await anon.delete(`/api/files/${aliceFile.id}`).set('X-Requested-With', 'MyOwnCloud')).status).toBe(401);
    expect(
      (await anon.post('/api/files').set('X-Requested-With', 'MyOwnCloud').attach('file', Buffer.from('x'), 'x.txt'))
        .status,
    ).toBe(401);
    await aliceStillHasEverything();
  });
});
