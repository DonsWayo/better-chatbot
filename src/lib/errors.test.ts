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
  extractApiErrorMessage,
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

describe("FileStorageError subclasses — inheritance", () => {
  it("FileNotFoundError is instanceof FileStorageError", () => {
    expect(new FileNotFoundError("f1")).toBeInstanceOf(FileStorageError);
  });

  it("FileTooLargeError is instanceof FileStorageError", () => {
    expect(new FileTooLargeError(100, 50)).toBeInstanceOf(FileStorageError);
  });

  it("StorageQuotaExceededError is instanceof FileStorageError", () => {
    expect(new StorageQuotaExceededError()).toBeInstanceOf(FileStorageError);
  });

  it("UnsupportedFileTypeError is instanceof FileStorageError", () => {
    expect(new UnsupportedFileTypeError("text/plain")).toBeInstanceOf(
      FileStorageError,
    );
  });
});

describe("AppError subclasses — inheritance", () => {
  it("UnauthorizedError is instanceof AppError", () => {
    expect(new UnauthorizedError()).toBeInstanceOf(AppError);
  });

  it("ForbiddenError is instanceof AppError", () => {
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
  });

  it("FileStorageError is instanceof Error (not AppError — separate hierarchy)", () => {
    const err = new FileStorageError("fs error", "FS_ERR");
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AppError);
  });

  it("all errors are also instanceof Error", () => {
    const errors = [
      new AppError("X", "x"),
      new UnauthorizedError(),
      new ForbiddenError(),
      new FileNotFoundError("f"),
      new FileTooLargeError(1, 0),
      new StorageQuotaExceededError(),
      new UnsupportedFileTypeError("t"),
      new NotImplementedError("ni"),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(Error);
    }
  });
});

describe("extractApiErrorMessage", () => {
  it("returns plain strings unchanged", () => {
    expect(extractApiErrorMessage("Something broke")).toBe("Something broke");
  });

  it("extracts message field from a JSON body string", () => {
    expect(extractApiErrorMessage('{"message":"Team budget exhausted"}')).toBe(
      "Team budget exhausted",
    );
  });

  it("extracts error field when message is absent", () => {
    expect(
      extractApiErrorMessage('{"error":"Voice chat is not enabled."}'),
    ).toBe("Voice chat is not enabled.");
  });

  it("prefers message over error code", () => {
    expect(
      extractApiErrorMessage(
        '{"error":"voice_not_configured","message":"Voice is not available on this deployment."}',
      ),
    ).toBe("Voice is not available on this deployment.");
  });

  it("handles nested error objects", () => {
    expect(
      extractApiErrorMessage('{"error":{"message":"Team budget exhausted"}}'),
    ).toBe("Team budget exhausted");
  });

  it("accepts already-parsed objects", () => {
    expect(extractApiErrorMessage({ message: "boom" })).toBe("boom");
    expect(extractApiErrorMessage({ error: "boom" })).toBe("boom");
  });

  it("returns invalid JSON as-is", () => {
    expect(extractApiErrorMessage("{not json")).toBe("{not json");
  });

  it("handles null/undefined safely", () => {
    expect(extractApiErrorMessage(null)).toBe("");
    expect(extractApiErrorMessage(undefined)).toBe("");
  });

  it("never returns a raw JSON object string for API-style bodies", () => {
    const result = extractApiErrorMessage(
      '{"message":"Team budget exhausted"}',
    );
    expect(result.startsWith("{")).toBe(false);
  });
});
