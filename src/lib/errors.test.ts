import { describe, it, expect } from "vitest";
import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  FileStorageError,
  FileNotFoundError,
  FileTooLargeError,
  StorageQuotaExceededError,
  UnsupportedFileTypeError,
  NotImplementedError,
} from "./errors";

describe("AppError", () => {
  it("stores code and message", () => {
    const err = new AppError("MY_CODE", "something went wrong");
    expect(err.code).toBe("MY_CODE");
    expect(err.message).toBe("something went wrong");
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("UnauthorizedError", () => {
  it("uses default message and UNAUTHORIZED code", () => {
    const err = new UnauthorizedError();
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Authentication required");
    expect(err.name).toBe("UnauthorizedError");
  });

  it("accepts custom message", () => {
    const err = new UnauthorizedError("Please log in");
    expect(err.message).toBe("Please log in");
  });
});

describe("ForbiddenError", () => {
  it("uses FORBIDDEN code and default message", () => {
    const err = new ForbiddenError();
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("Access forbidden");
    expect(err.name).toBe("ForbiddenError");
  });
});

describe("FileNotFoundError", () => {
  it("includes fileId in message with FILE_NOT_FOUND code", () => {
    const err = new FileNotFoundError("file-abc");
    expect(err.message).toContain("file-abc");
    expect(err.code).toBe("FILE_NOT_FOUND");
    expect(err.name).toBe("FileNotFoundError");
    expect(err).toBeInstanceOf(FileStorageError);
  });
});

describe("FileTooLargeError", () => {
  it("includes size and maxSize in message", () => {
    const err = new FileTooLargeError(10_000_000, 5_000_000);
    expect(err.message).toContain("10000000");
    expect(err.message).toContain("5000000");
    expect(err.code).toBe("FILE_TOO_LARGE");
  });
});

describe("StorageQuotaExceededError", () => {
  it("has QUOTA_EXCEEDED code", () => {
    const err = new StorageQuotaExceededError();
    expect(err.code).toBe("QUOTA_EXCEEDED");
    expect(err.message).toBe("Storage quota exceeded");
  });
});

describe("UnsupportedFileTypeError", () => {
  it("includes mimeType in message", () => {
    const err = new UnsupportedFileTypeError("application/x-evil");
    expect(err.message).toContain("application/x-evil");
    expect(err.code).toBe("UNSUPPORTED_TYPE");
  });
});

describe("NotImplementedError", () => {
  it("stores message and correct name", () => {
    const err = new NotImplementedError("not done yet");
    expect(err.message).toBe("not done yet");
    expect(err.name).toBe("NotImplementedError");
    expect(err).toBeInstanceOf(Error);
  });
});
