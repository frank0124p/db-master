import { Client } from "minio";
import path from "path";
import fs from "fs/promises";

// DATA_DIR is passed in rather than imported to avoid circular dependency with fileStore
let DATA_DIR_REF = "";
export function setDataDir(dir: string): void { DATA_DIR_REF = dir; }

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  pathPrefix: string;
}

let _client: Client | null = null;
let _config: MinioConfig | null = null;

export function initMinio(cfg: Partial<MinioConfig> | undefined): void {
  if (!cfg?.endpoint || !cfg.accessKey || !cfg.secretKey || !cfg.bucket) {
    _client = null;
    _config = null;
    return;
  }
  _config = {
    endpoint: cfg.endpoint,
    port: cfg.port ?? 9000,
    useSSL: cfg.useSSL ?? false,
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    bucket: cfg.bucket,
    pathPrefix: cfg.pathPrefix ?? "",
  };
  _client = new Client({
    endPoint: _config.endpoint,
    port: _config.port,
    useSSL: _config.useSSL,
    accessKey: _config.accessKey,
    secretKey: _config.secretKey,
  });
}

export function isMinioReady(): boolean {
  return _client !== null && _config !== null;
}

function objectKey(relPath: string): string {
  const prefix = _config?.pathPrefix ?? "";
  return prefix ? `${prefix}/${relPath}` : relPath;
}

function toRelPath(absPath: string): string {
  return DATA_DIR_REF ? path.relative(DATA_DIR_REF, absPath) : absPath;
}

export function uploadFileAsync(absPath: string, content: string): void {
  if (!_client || !_config) return;
  const key = objectKey(toRelPath(absPath));
  const buf = Buffer.from(content, "utf-8");
  _client.putObject(_config.bucket, key, buf, buf.length, { "Content-Type": "application/json" })
    .catch(() => {}); // silent — never block the main write
}

export function deleteObjectAsync(absPath: string): void {
  if (!_client || !_config) return;
  const key = objectKey(toRelPath(absPath));
  _client.removeObject(_config.bucket, key)
    .catch(() => {}); // silent — mirrors uploadFileAsync pattern
}

export async function deleteObjectsWithPrefixAsync(absDir: string): Promise<void> {
  if (!_client || !_config) return;
  const prefix = objectKey(toRelPath(absDir)) + "/";
  try {
    const keys = await listKeys(prefix);
    for (const key of keys) {
      await _client.removeObject(_config.bucket, key).catch(() => {});
    }
  } catch { /* silent */ }
}

export async function uploadRaw(relPath: string, content: string, contentType = "text/plain"): Promise<void> {
  if (!_client || !_config) return;
  const key = objectKey(relPath);
  const buf = Buffer.from(content, "utf-8");
  await _client.putObject(_config.bucket, key, buf, buf.length, { "Content-Type": contentType });
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  if (!_client || !_config) return { ok: false, message: "MinIO 未設定" };
  try {
    const exists = await _client.bucketExists(_config.bucket);
    if (!exists) return { ok: false, message: `Bucket "${_config.bucket}" 不存在` };
    return { ok: true, message: `✓ 已連線 ${_config.endpoint}:${_config.port} / ${_config.bucket}` };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

interface BucketItem { name?: string; }

async function listKeys(prefix: string): Promise<string[]> {
  if (!_client || !_config) return [];
  return new Promise<string[]>((resolve, reject) => {
    const keys: string[] = [];
    const stream = _client!.listObjectsV2(_config!.bucket, prefix, true);
    stream.on("data", (item: BucketItem) => { if (item.name) keys.push(item.name); });
    stream.on("end", () => resolve(keys));
    stream.on("error", reject);
  });
}

async function downloadKey(key: string): Promise<Buffer | null> {
  if (!_client || !_config) return null;
  try {
    const stream = await _client.getObject(_config.bucket, key);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  } catch { return null; }
}

// Push entire data directory to MinIO
export async function pushAll(): Promise<{ pushed: number; errors: number }> {
  if (!_client || !_config) throw new Error("MinIO 未設定");
  if (!DATA_DIR_REF) throw new Error("DATA_DIR 未初始化");

  let pushed = 0;
  let errors = 0;

  async function walk(dir: string): Promise<void> {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(full); }
      else if (e.isFile()) {
        try {
          const content = await fs.readFile(full, "utf-8");
          const key = objectKey(path.relative(DATA_DIR_REF, full));
          const buf = Buffer.from(content, "utf-8");
          await _client!.putObject(_config!.bucket, key, buf, buf.length);
          pushed++;
        } catch { errors++; }
      }
    }
  }

  await walk(DATA_DIR_REF);
  return { pushed, errors };
}

// Restore all data files from MinIO to local
export async function restoreAll(): Promise<{ restored: number; errors: number }> {
  if (!_client || !_config) throw new Error("MinIO 未設定");
  if (!DATA_DIR_REF) throw new Error("DATA_DIR 未初始化");

  const prefix = _config.pathPrefix ? `${_config.pathPrefix}/` : "";
  const keys = await listKeys(_config.pathPrefix ?? "");
  let restored = 0;
  let errors = 0;

  for (const key of keys) {
    try {
      const relPath = prefix ? key.slice(prefix.length) : key;
      const localPath = path.join(DATA_DIR_REF, relPath);
      const buf = await downloadKey(key);
      if (buf) {
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, buf);
        restored++;
      }
    } catch { errors++; }
  }

  return { restored, errors };
}
