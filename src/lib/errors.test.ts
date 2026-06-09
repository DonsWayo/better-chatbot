import { describe, expect, it } from "vitest";
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
  it("has correct name", () => {
    const e = new AppError("CODE", "msg");
    expect(e.name).toBe("AppError");
  });

  it("message matches constructor arg", () => {
    const e = new AppError("X", "my message");
    expect(e.message).toBe("my message");
  });

  it("code matches constructor arg", () => {
    const e = new AppError("MY_CODE", "msg");
    expect(e.code).toBe("MY_CODE");
  });

  it("is an instance of Error", () => {
    expect(new AppError("C", "m")).toBeInstanceOf(Error);
  });
});

describe("UnauthorizedError", () => {
  it("name is UnauthorizedError", () => {
    expect(new UnauthorizedError().name).toBe("UnauthorizedError");
  });

  it("code is UNAUTHORIZED", () => {
    expect(new UnauthorizedError().code).toBe("UNAUTHORIZED");
  });

  it("has default message", () => {
    expect(new UnauthorizedError().message).toBeTruthy();
  });

  it("accepts custom message", () => {
    expect(new UnauthorizedError("custom").message).toBe("custom");
  });

  it("is an instance of AppError", () => {
    expect(new UnauthorizedError()).toBeInstanceOf(AppError);
  });
});

describe("ForbiddenError", () => {
  it("name is ForbiddenError", () => {
    expect(new ForbiddenError().name).toBe("ForbiddenError");
  });

  it("code is FORBIDDEN", () => {
    expect(new ForbiddenError().code).toBe("FORBIDDEN");
  });

  it("accepts custom message", () => {
    expect(new ForbiddenError("nope").message).toBe("nope");
  });

  it("is an instance of AppError", () => {
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
  });
});

describe("FileStorageError", () => {
  it("name is FileStorageError", () => {
    const e = new FileStorageError("msg", "CODE");
    expect(e.name).toBe("FileStorageError");
  });

  it("code is set", () => {
    const e = new FileStorageError("msg", "MY_CODE");
    expect(e.code).toBe("MY_CODE");
  });

  it("cause is stored when provided", () => {
    const cause = new Error("root");
    const e = new FileStorageError("msg", "C", cause);
    expect(e.cause).toBe(cause);
  });

  it("is an instance of Error", () => {
    expect(new FileStorageError("m", "c")).toBeInstanceOf(Error);
  });
});

describe("FileNotFoundError", () => {
  it("name is FileNotFoundError", () => {
    expect(new FileNotFoundError("file-123").name).toBe("FileNotFoundError");
  });

  it("code is FILE_NOT_FOUND", () => {
    expect(new FileNotFoundError("x").code).toBe("FILE_NOT_FOUND");
  });

  it("message includes the file id", () => {
    expect(new FileNotFoundError("abc-123").message).toContain("abc-123");
  });

  it("is a FileStorageError", () => {
    expect(new FileNotFoundError("x")).toBeInstanceOf(FileStorageError);
  });
});

describe("FileTooLargeError", () => {
  it("name is FileTooLargeError", () => {
    expect(new FileTooLargeError(100, 50).name).toBe("FileTooLargeError");
  });

  it("code is FILE_TOO_LARGE", () => {
    expect(new FileTooLargeError(100, 50).code).toBe("FILE_TOO_LARGE");
  });

  it("message includes size and max", () => {
    const e = new FileTooLargeError(1000, 500);
    expect(e.message).toContain("1000");
    expect(e.message).toContain("500");
  });
});

describe("StorageQuotaExceededError", () => {
  it("name is StorageQuotaExceededError", () => {
    expect(new StorageQuotaExceededError().name).toBe("StorageQuotaExceededError");
  });

  it("code is QUOTA_EXCEEDED", () => {
    expect(new StorageQuotaExceededError().code).toBe("QUOTA_EXCEEDED");
  });

  it("is a FileStorageError", () => {
    expect(new StorageQuotaExceededError()).toBeInstanceOf(FileStorageError);
  });
});

describe("UnsupportedFileTypeError", () => {
  it("name is UnsupportedFileTypeError", () => {
    expect(new UnsupportedFileTypeError("text/plain").name).toBe("UnsupportedFileTypeError");
  });

  it("code is UNSUPPORTED_TYPE", () => {
    expect(new UnsupportedFileTypeError("x/y").code).toBe("UNSUPPORTED_TYPE");
  });

  it("message includes mime type", () => {
    expect(new UnsupportedFileTypeError("application/x-custom").message).toContain("application/x-custom");
  });
});

describe("NotImplementedError", () => {
  it("name is NotImplementedError", () => {
    expect(new NotImplementedError("todo").name).toBe("NotImplementedError");
  });

  it("message matches arg", () => {
    expect(new NotImplementedError("not done yet").message).toBe("not done yet");
  });

  it("is an instance of Error", () => {
    expect(new NotImplementedError("x")).toBeInstanceOf(Error);
  });
});

describe("error hierarchy invariants", () => {
  it("UnauthorizedError is an Error", () => {
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
  });

  it("ForbiddenError is an Error", () => {
    expect(new ForbiddenError()).toBeInstanceOf(Error);
  });

  it("FileNotFoundError is an Error", () => {
    expect(new FileNotFoundError("id")).toBeInstanceOf(Error);
  });

  it("all error classes produce non-empty messages", () => {
    const errors = [
      new AppError("C", "m"),
      new UnauthorizedError(),
      new ForbiddenError(),
      new FileNotFoundError("f"),
      new FileTooLargeError(1, 2),
      new StorageQuotaExceededError(),
      new UnsupportedFileTypeError("x/y"),
      new NotImplementedError("todo"),
    ];
    for (const e of errors) {
      expect(typeof e.message).toBe("string");
      expect(e.message.length).toBeGreaterThan(0);
    }
  });
});
