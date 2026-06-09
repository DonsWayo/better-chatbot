import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const importActions = async () => await import("./actions");

describe("checkStorageAction", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("invalid when vercel-blob missing token", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/BLOB_READ_WRITE_TOKEN/);
  });

  it("s3 missing config", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Missing S3 configuration/);
  });

  it("s3 valid with required envs", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });
});

describe("checkStorageAction — return type invariants", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
  });

  it("returns an object", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(typeof res).toBe("object");
    expect(res).not.toBeNull();
  });

  it("result always has isValid key", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res).toHaveProperty("isValid");
  });

  it("isValid is a boolean", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(typeof res.isValid).toBe("boolean");
  });

  it("error field is a string when isValid is false", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect(typeof (res as { error?: string }).error).toBe("string");
  });
});

describe("checkStorageAction — s3 config edge cases", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("s3 missing bucket is invalid", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
  });

  it("s3 missing region is invalid", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "my-bucket";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
  });

  it("s3 uses AWS_REGION as fallback for region", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "bucket";
    process.env.AWS_REGION = "eu-west-1";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });
});

describe("checkStorageAction — no storage type configured", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("returns an object even with no env vars set", async () => {
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(typeof res).toBe("object");
    expect(res).not.toBeNull();
  });

  it("result has isValid key regardless of env configuration", async () => {
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res).toHaveProperty("isValid");
    expect(typeof res.isValid).toBe("boolean");
  });

  it("vercel-blob with valid token is valid", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "my-token";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });
});

describe("checkStorageAction — error message content", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("error is undefined when isValid is true", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
    expect((res as { error?: string }).error).toBeUndefined();
  });

  it("vercel-blob error mentions BLOB_READ_WRITE_TOKEN", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect((res as { error?: string }).error).toContain("BLOB_READ_WRITE_TOKEN");
  });

  it("s3 error mentions Missing S3 configuration", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect((res as { error?: string }).error).toContain("S3");
  });
});
