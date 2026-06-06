import { randomUUID } from "crypto";
import * as store from "../db/fileStore.js";
import { z } from "zod";
import type { AppUser } from "@schema-studio/core";
import type { RoleId } from "@schema-studio/core";

const USERS_FILE = () => store.sysPath("users.json");

export const CreateUserInput = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  role: z.enum(["admin", "suite_owner", "maintainer", "viewer"]),
  suiteIds: z.array(z.number()).default([]),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

async function readUsers(): Promise<AppUser[]> {
  const data = await store.readJson<AppUser[]>(USERS_FILE());
  return data ?? [];
}

async function writeUsers(users: AppUser[]): Promise<void> {
  await store.writeJson(USERS_FILE(), users);
}

export async function listUsers(): Promise<AppUser[]> {
  return readUsers();
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const users = await readUsers();
  return users.find(u => u.id === id) ?? null;
}

export async function createUser(input: CreateUserInput): Promise<AppUser> {
  const users = await readUsers();
  const id = `u_${randomUUID()}`;
  const user: AppUser = {
    id, name: input.name, email: input.email,
    role: input.role as RoleId,
    suiteIds: input.suiteIds ?? [],
    createdAt: new Date().toISOString(),
  };
  await writeUsers([...users, user]);
  return user;
}

export async function updateUser(id: string, patch: Partial<CreateUserInput>): Promise<AppUser | null> {
  const users = await readUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  const updated: AppUser = {
    ...users[idx]!,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.role !== undefined ? { role: patch.role as RoleId } : {}),
    ...(patch.suiteIds !== undefined ? { suiteIds: patch.suiteIds } : {}),
  };
  users[idx] = updated;
  await writeUsers(users);
  return updated;
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await readUsers();
  const filtered = users.filter(u => u.id !== id);
  if (filtered.length === users.length) return false;
  await writeUsers(filtered);
  return true;
}
