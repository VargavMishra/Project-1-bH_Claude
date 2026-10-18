import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createTestUser,
  deleteTestUser,
  publicClient,
  sleep,
  type TestUser,
} from './supabase-test-env.js';

/**
 * Proves the database enforces its own rules — schema, constraints, RLS, column grants,
 * triggers and storage policies — independently of the API. These run against the
 * real development project, the same PostgreSQL and REST layer production uses.
 */

type ProfileRow = {
  id: string;
  display_name: string;
  bio: string;
  gender: string | null;
  hobbies: string[];
  strengths: string[];
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  profile_id: string;
  actor_id: string | null;
  action: 'insert' | 'update';
  changed_fields: string[];
};

// Smallest valid PNG (1×1 pixel).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const CHECK_VIOLATION = '23514';
const INSUFFICIENT_PRIVILEGE = '42501';

let alice: TestUser;
let bob: TestUser;

async function readOwnProfile(user: TestUser): Promise<ProfileRow> {
  const { data, error } = await user.client.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return data as ProfileRow;
}

beforeAll(async () => {
  alice = await createTestUser('alice');
  bob = await createTestUser('bob');

  const { error } = await bob.client
    .from('profiles')
    .insert({ id: bob.id, display_name: 'Bob', bio: 'Original bio' });
  if (error) throw error;
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
});

describe('profiles: creation', () => {
  it('lets a user create their own profile, with timestamps set by the database', async () => {
    const { data, error } = await alice.client
      .from('profiles')
      .insert({
        id: alice.id,
        display_name: 'Alice',
        bio: 'Hello',
        gender: 'female',
        hobbies: ['Chess', 'Hiking'],
        strengths: ['Patience'],
      })
      .select()
      .single();

    expect(error).toBeNull();
    const row = data as ProfileRow;
    expect(row).toMatchObject({
      id: alice.id,
      display_name: 'Alice',
      hobbies: ['Chess', 'Hiking'],
    });
    expect(row.created_at).toBe(row.updated_at);
  });

  it('rejects creating a profile for someone else (RLS)', async () => {
    const { error } = await alice.client
      .from('profiles')
      .insert({ id: '00000000-0000-4000-8000-000000000000', display_name: 'Mallory' });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('rejects a second profile for the same user (primary key)', async () => {
    const { error } = await alice.client
      .from('profiles')
      .insert({ id: alice.id, display_name: 'Alice again' });
    expect(error?.code).toBe('23505'); // unique_violation
  });
});

describe('profiles: isolation between users', () => {
  it("cannot read another user's profile", async () => {
    const { data, error } = await alice.client.from('profiles').select('*').eq('id', bob.id);
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS hides the row: it is as if it does not exist
  });

  it("cannot update another user's profile", async () => {
    const { data } = await alice.client
      .from('profiles')
      .update({ bio: 'hacked' })
      .eq('id', bob.id)
      .select();
    expect(data).toEqual([]);

    const bobRow = await readOwnProfile(bob);
    expect(bobRow.bio).toBe('Original bio');
  });

  it('gives signed-out (anonymous) requests no access at all', async () => {
    const { data, error } = await publicClient().from('profiles').select('*');
    expect(data).toBeNull();
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('profiles: protected columns', () => {
  it.each([
    ['created_at', '2000-01-01T00:00:00Z'],
    ['updated_at', '2000-01-01T00:00:00Z'],
    ['id', '00000000-0000-4000-8000-000000000000'],
  ])('a user cannot set %s', async (column, value) => {
    const { error } = await alice.client
      .from('profiles')
      .update({ [column]: value })
      .eq('id', alice.id);
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('profiles: constraints (enforced even if the API is bypassed)', () => {
  it.each([
    ['empty display name', { display_name: '' }],
    ['display name with surrounding spaces', { display_name: ' Alice ' }],
    ['display name over 60 characters', { display_name: 'x'.repeat(61) }],
    ['bio over 500 characters', { bio: 'x'.repeat(501) }],
    ['unknown gender', { gender: 'robot' }],
    ['more than 20 hobbies', { hobbies: Array.from({ length: 21 }, (_, i) => `hobby ${i}`) }],
    ['blank hobby', { hobbies: [''] }],
    ['hobby with surrounding spaces', { hobbies: [' chess'] }],
    ['hobby over 40 characters', { hobbies: ['x'.repeat(41)] }],
    ['duplicate hobbies (case-insensitive)', { hobbies: ['Chess', 'chess'] }],
    ['duplicate strengths', { strengths: ['Focus', 'FOCUS'] }],
    ['avatar outside own folder', { avatar_path: '00000000-0000-4000-8000-000000000000/a.png' }],
    ['avatar with unsafe file name', { avatar_path: 'ALICE/../x.png' }],
  ])('rejects %s', async (_label, change) => {
    const patch =
      'avatar_path' in change && change.avatar_path?.startsWith('ALICE')
        ? { avatar_path: change.avatar_path.replace('ALICE', alice.id) }
        : change;
    const { error } = await alice.client.from('profiles').update(patch).eq('id', alice.id);
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('accepts a valid avatar path inside the own folder', async () => {
    const { error } = await alice.client
      .from('profiles')
      .update({ avatar_path: `${alice.id}/avatar-1.png` })
      .eq('id', alice.id);
    expect(error).toBeNull();
  });
});

describe('trigger: updated_at', () => {
  it('moves forward when a field changes; created_at never changes', async () => {
    const before = await readOwnProfile(alice);
    await sleep(50);

    const { error } = await alice.client
      .from('profiles')
      .update({ bio: `Changed at ${Date.now()}` })
      .eq('id', alice.id);
    expect(error).toBeNull();

    const after = await readOwnProfile(alice);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    );
    expect(after.created_at).toBe(before.created_at);
  });

  it('does not move when an update changes nothing', async () => {
    const before = await readOwnProfile(alice);
    await sleep(50);

    await alice.client.from('profiles').update({ bio: before.bio }).eq('id', alice.id);

    const after = await readOwnProfile(alice);
    expect(after.updated_at).toBe(before.updated_at);
  });

  it('also fires for privileged changes that bypass the API (e.g. dashboard/secret key)', async () => {
    const before = await readOwnProfile(alice);
    await sleep(50);

    const { error } = await admin
      .from('profiles')
      .update({ strengths: ['Patience', 'Curiosity'] })
      .eq('id', alice.id);
    expect(error).toBeNull();

    const after = await readOwnProfile(alice);
    expect(after.strengths).toEqual(['Patience', 'Curiosity']);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    );
  });
});

describe('trigger: audit log', () => {
  async function auditFor(user: TestUser): Promise<AuditRow[]> {
    const { data, error } = await user.client
      .from('profile_audit_log')
      .select('profile_id, actor_id, action, changed_fields')
      .eq('profile_id', user.id)
      .order('id', { ascending: true });
    if (error) throw error;
    return data;
  }

  it('records the insert and each real update with field names and the acting user', async () => {
    await alice.client.from('profiles').update({ gender: 'other' }).eq('id', alice.id);
    const rows = await auditFor(alice);

    expect(rows[0]).toMatchObject({ action: 'insert', actor_id: alice.id });
    expect(rows.at(-1)).toEqual({
      profile_id: alice.id,
      actor_id: alice.id,
      action: 'update',
      changed_fields: ['gender'],
    });
  });

  it('marks privileged changes with a null actor', async () => {
    const rows = await auditFor(alice);
    expect(rows).toContainEqual(
      expect.objectContaining({ actor_id: null, changed_fields: ['strengths'] }),
    );
  });

  it('stores field names only, never values', async () => {
    const { data } = await alice.client.from('profile_audit_log').select('*').limit(50);
    expect(JSON.stringify(data)).not.toContain('Changed at');
  });

  it("hides other users' history and cannot be written directly", async () => {
    const { data } = await alice.client
      .from('profile_audit_log')
      .select('*')
      .eq('profile_id', bob.id);
    expect(data).toEqual([]);

    const { error } = await alice.client.from('profile_audit_log').insert({
      profile_id: alice.id,
      action: 'update',
      changed_fields: ['forged'],
    });
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('storage: avatars bucket', () => {
  const bucket = () => admin.storage.from('avatars');

  it('lets a user upload to and read from their own folder only', async () => {
    const own = await alice.client.storage
      .from('avatars')
      .upload(`${alice.id}/it-avatar.png`, PNG_1X1, { contentType: 'image/png', upsert: true });
    expect(own.error).toBeNull();

    const signed = await alice.client.storage
      .from('avatars')
      .createSignedUrl(`${alice.id}/it-avatar.png`, 60);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toMatch(/^https:\/\//);

    const foreign = await alice.client.storage
      .from('avatars')
      .upload(`${bob.id}/it-avatar.png`, PNG_1X1, { contentType: 'image/png' });
    expect(foreign.error).not.toBeNull();
  });

  it("cannot read another user's avatar", async () => {
    await bucket().upload(`${bob.id}/it-avatar.png`, PNG_1X1, {
      contentType: 'image/png',
      upsert: true,
    });
    const result = await alice.client.storage
      .from('avatars')
      .createSignedUrl(`${bob.id}/it-avatar.png`, 60);
    expect(result.error).not.toBeNull();
  });

  it('is private: no public URL access', async () => {
    const { data } = alice.client.storage.from('avatars').getPublicUrl(`${alice.id}/it-avatar.png`);
    const response = await fetch(data.publicUrl);
    expect(response.ok).toBe(false);
  });

  it('rejects non-image uploads', async () => {
    const { error } = await alice.client.storage
      .from('avatars')
      .upload(`${alice.id}/notes.txt`, Buffer.from('hello'), { contentType: 'text/plain' });
    expect(error).not.toBeNull();
  });

  afterAll(async () => {
    await bucket().remove([`${alice.id}/it-avatar.png`, `${bob.id}/it-avatar.png`]);
  });
});

describe('account deletion', () => {
  it('removes the profile and its audit history (ON DELETE CASCADE)', async () => {
    const carol = await createTestUser('carol');
    await carol.client.from('profiles').insert({ id: carol.id, display_name: 'Carol' });

    await deleteTestUser(carol);

    const profile = await admin.from('profiles').select('id').eq('id', carol.id);
    const audit = await admin.from('profile_audit_log').select('id').eq('profile_id', carol.id);
    expect(profile.data).toEqual([]);
    expect(audit.data).toEqual([]);
  });
});
