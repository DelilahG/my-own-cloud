import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_FOLDER_DEPTH } from '../../src/modules/folders/folder.service.js';
import { makeApp, signUp, storedObjects, upload } from '../helpers.js';

let app: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  app = await makeApp();
});

type Agent = Awaited<ReturnType<typeof signUp>>['agent'];
async function mkdir(agent: Agent, name: string, parentId: string | null = null) {
  const res = await agent.post('/api/folders').send({ name, parentId });
  expect(res.status).toBe(201);
  return res.body.folder as { id: string; name: string; parentId: string | null };
}

describe('folders', () => {
  it('creates nested folders and lists contents with breadcrumbs', async () => {
    const { agent } = await signUp(app);
    const work = await mkdir(agent, 'Work');
    const projects = await mkdir(agent, 'Projects', work.id);
    const cloud = await mkdir(agent, 'Cloud', projects.id);

    const root = await agent.get('/api/drive');
    expect(root.body.folder).toBeNull();
    expect(root.body.folders.map((f: { name: string }) => f.name)).toEqual(['Work']);
    expect(root.body.folders[0].itemCount).toBe(1);

    const deep = await agent.get(`/api/drive?folderId=${cloud.id}`);
    expect(deep.status).toBe(200);
    expect(deep.body.folder.name).toBe('Cloud');
    expect(deep.body.breadcrumbs.map((b: { name: string }) => b.name)).toEqual(['Work', 'Projects', 'Cloud']);
  });

  it('rejects duplicate sibling names (case-insensitive) but allows them in different parents', async () => {
    const { agent } = await signUp(app);
    const a = await mkdir(agent, 'Photos');
    const dup = await agent.post('/api/folders').send({ name: 'photos' });
    expect(dup.status).toBe(409);
    await mkdir(agent, 'Photos', a.id); // same name, different parent: fine
  });

  it.each(['', '   ', '..', 'a/b', 'x'.repeat(256), 'bad|name'])('rejects invalid name %j', async (name) => {
    const { agent } = await signUp(app);
    const res = await agent.post('/api/folders').send({ name });
    expect(res.status).toBe(400);
  });

  it('rejects malformed ids with 400 and unknown ids with 404', async () => {
    const { agent } = await signUp(app);
    expect((await agent.get('/api/drive?folderId=not-a-uuid')).status).toBe(400);
    expect((await agent.post('/api/folders').send({ name: 'x', parentId: "1' OR '1'='1" })).status).toBe(400);
    expect((await agent.get('/api/drive?folderId=7b1e8e9e-1c55-4a0b-9d8e-2f1f4f6b2a10')).status).toBe(404);
  });

  it('renames a folder', async () => {
    const { agent } = await signUp(app);
    const f = await mkdir(agent, 'Old name');
    const res = await agent.patch(`/api/folders/${f.id}`).send({ name: 'New name' });
    expect(res.status).toBe(200);
    expect(res.body.folder.name).toBe('New name');
  });

  it('moves a folder to another parent and back to the top level', async () => {
    const { agent } = await signUp(app);
    const a = await mkdir(agent, 'A');
    const b = await mkdir(agent, 'B');
    const moved = await agent.patch(`/api/folders/${b.id}`).send({ parentId: a.id });
    expect(moved.body.folder.parentId).toBe(a.id);
    const back = await agent.patch(`/api/folders/${b.id}`).send({ parentId: null });
    expect(back.body.folder.parentId).toBeNull();
  });

  it('prevents moving a folder into itself or its own descendant (no cycles)', async () => {
    const { agent } = await signUp(app);
    const a = await mkdir(agent, 'A');
    const b = await mkdir(agent, 'B', a.id);
    const c = await mkdir(agent, 'C', b.id);

    const intoSelf = await agent.patch(`/api/folders/${a.id}`).send({ parentId: a.id });
    expect(intoSelf.status).toBe(400);
    const intoGrandchild = await agent.patch(`/api/folders/${a.id}`).send({ parentId: c.id });
    expect(intoGrandchild.status).toBe(400);
    expect(intoGrandchild.body.error.message).toMatch(/into itself or one of its subfolders/);
  });

  it(`limits nesting to ${MAX_FOLDER_DEPTH} levels`, async () => {
    const { agent } = await signUp(app);
    let parent: string | null = null;
    for (let i = 0; i < MAX_FOLDER_DEPTH; i++) parent = (await mkdir(agent, `L${i}`, parent)).id;
    const tooDeep = await agent.post('/api/folders').send({ name: 'deeper', parentId: parent });
    expect(tooDeep.status).toBe(400);
  });

  it('deletes a folder with its whole subtree, including the stored file bytes', async () => {
    const { agent } = await signUp(app);
    const top = await mkdir(agent, 'Top');
    const sub = await mkdir(agent, 'Sub', top.id);
    await upload(agent, 'a.txt', 'aaa', top.id).expect(201);
    await upload(agent, 'b.txt', 'bbb', sub.id).expect(201);
    const keep = await upload(agent, 'keep.txt', 'keep').expect(201);
    expect(await storedObjects()).toHaveLength(3);

    const res = await agent.delete(`/api/folders/${top.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deletedFiles).toBe(2);

    expect((await agent.get(`/api/drive?folderId=${sub.id}`)).status).toBe(404);
    const root = await agent.get('/api/drive');
    expect(root.body.folders).toHaveLength(0);
    expect(root.body.files.map((f: { id: string }) => f.id)).toEqual([keep.body.file.id]);
    expect(await storedObjects()).toHaveLength(1);

    const storage = await agent.get('/api/storage');
    expect(storage.body.usedBytes).toBe(4);
  });
});
