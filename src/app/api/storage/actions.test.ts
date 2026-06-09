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

describe("checkStorageAction — response shape", () => {
  beforeEach(() => {
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("result always has isValid field", async () => {
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res).toHaveProperty("isValid");
  });

  it("isValid is always a boolean", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(typeof res.isValid).toBe("boolean");
  });

  it("s3 result has solution field when invalid", async () => {
    process.env.FILE_STORAGE_TYPE = "s3";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res).toHaveProperty("solution");
  });

  it("valid local result has no error field", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(res.error).toBeUndefined();
  });
});

describe("checkStorageAction and getStorageInfoAction — result invariants", () => {
  beforeEach(() => {
    delete process.env.FILE_STORAGE_TYPE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.FILE_STORAGE_S3_BUCKET;
    delete process.env.FILE_STORAGE_S3_REGION;
    delete process.env.AWS_REGION;
  });

  it("checkStorageAction result is always an object", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
    const { checkStorageAction } = await importActions();
    const res = await checkStorageAction();
    expect(typeof res).toBe("object");
    expect(res).not.toBeNull();
  });

  it("getStorageInfoAction result has type field", async () => {
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(res).toHaveProperty("type");
  });

  it("getStorageInfoAction result type is a string", async () => {
    const { getStorageInfoAction } = await importActions();
    const res = await getStorageInfoAction();
    expect(typeof res.type).toBe("string");
  });

  it("local storage returns isValid:true", async () => {
    process.env.FILE_STORAGE_TYPE = "local";
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
