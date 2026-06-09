import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const importActions = async () => {
  vi.resetModules();
  return await import("./actions");
};

describe("checkStorageAction — vercel-blob", () => {
  beforeEach(() => {
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

  it("provides solution hint when vercel-blob missing token", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.solution).toBeTruthy();
    expect(typeof res.solution).toBe("string");
  });

  it("valid when vercel-blob token is set", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_token_abc123";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });
});

describe("checkStorageAction — s3", () => {
  beforeEach(() => {
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("invalid when s3 bucket and region are both missing", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Missing S3 configuration/);
  });

  it("invalid when s3 bucket is set but region is missing", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "my-bucket";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
  });

  it("invalid when s3 region is set but bucket is missing", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/FILE_STORAGE_S3_BUCKET/);
  });

  it("valid with FILE_STORAGE_S3_REGION and bucket", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });

  it("accepts AWS_REGION as alternative to FILE_STORAGE_S3_REGION", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    process.env.FILE_STORAGE_S3_BUCKET = "bucket";
    process.env.AWS_REGION = "eu-west-1";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });

  it("s3 error message lists missing vars", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.error).toContain("FILE_STORAGE_S3_BUCKET");
  });

  it("s3 solution contains guidance text", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.solution).toContain("FILE_STORAGE_TYPE=s3");
  });
});

describe("checkStorageAction — local driver", () => {
  beforeEach(() => {
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("local driver is always valid", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });

  it("local driver has no error message", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.error).toBeUndefined();
  });
});


describe("getStorageInfoAction", () => {
  beforeEach(() => {
    delete process.env.FILE_STORAGE_TYPE;
  });

  it("returns an object with type field", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(res).toHaveProperty("type");
  });

  it("returns supportsDirectUpload boolean", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(typeof res.supportsDirectUpload).toBe("boolean");
  });

  it("supportsDirectUpload is true for vercel-blob", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(res.supportsDirectUpload).toBe(true);
  });

  it("supportsDirectUpload is true for s3", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(res.supportsDirectUpload).toBe(true);
  });

  it("supportsDirectUpload is true for local", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(res.supportsDirectUpload).toBe(true);
  });
});

describe("checkStorageAction — unknown/default driver", () => {
  beforeEach(() => {
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("defaults to local driver when FILE_STORAGE_TYPE is unset", async () => {
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.isValid).toBe(true);
  });

  it("result always has isValid boolean", async () => {
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(typeof res.isValid).toBe("boolean");
  });

  it("local driver result has no error message", async () => {
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.error).toBeUndefined();
  });
});

describe("getStorageInfoAction — type field values", () => {
  beforeEach(() => {
    delete process.env.FILE_STORAGE_TYPE;
  });

  it("type field is vercel-blob for vercel-blob driver", async () => {
    process.env.FILE_STORAGE_TYPE = "vercel-blob";
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(res.type).toBe("vercel-blob");
  });

  it("type field is s3 for s3 driver", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(res.type).toBe("s3");
  });

  it("type field is local for local driver", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(res.type).toBe("local");
  });
});
