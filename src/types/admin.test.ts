import { describe, expect, it } from "vitest";
import type {
  AdminUpdateUserDetailsData,
  AdminUserListItem,
  AdminUsersPaginated,
  AdminUsersQuery,
} from "./admin";

describe("AdminUsersQuery — shape", () => {
  it("accepts an empty query object", () => {
    const query: AdminUsersQuery = {};
    expect(query).toBeDefined();
  });

  it("accepts all fields populated", () => {
    const query: AdminUsersQuery = {
      searchValue: "alice",
      searchField: "email",
      searchOperator: "contains",
      limit: 20,
      offset: 0,
      sortBy: "createdAt",
      sortDirection: "asc",
      filterField: "role",
      filterValue: "admin",
      filterOperator: "eq",
    };
    expect(query.searchValue).toBe("alice");
    expect(query.limit).toBe(20);
    expect(query.offset).toBe(0);
  });

  it("searchField can be name or email", () => {
    const byName: AdminUsersQuery = { searchField: "name" };
    const byEmail: AdminUsersQuery = { searchField: "email" };
    expect(byName.searchField).toBe("name");
    expect(byEmail.searchField).toBe("email");
  });

  it("searchOperator covers all three variants", () => {
    const ops: Array<AdminUsersQuery["searchOperator"]> = [
      "contains",
      "starts_with",
      "ends_with",
    ];
    for (const op of ops) {
      const q: AdminUsersQuery = { searchOperator: op };
      expect(q.searchOperator).toBe(op);
    }
  });

  it("sortDirection can be asc or desc", () => {
    const asc: AdminUsersQuery = { sortDirection: "asc" };
    const desc: AdminUsersQuery = { sortDirection: "desc" };
    expect(asc.sortDirection).toBe("asc");
    expect(desc.sortDirection).toBe("desc");
  });

  it("filterOperator supports numeric and string comparison", () => {
    const ops: Array<NonNullable<AdminUsersQuery["filterOperator"]>> = [
      "lt",
      "eq",
      "ne",
      "lte",
      "gt",
      "gte",
      "contains",
    ];
    for (const op of ops) {
      const q: AdminUsersQuery = { filterOperator: op };
      expect(q.filterOperator).toBe(op);
    }
  });

  it("filterValue can be string, number, or boolean", () => {
    const strFilter: AdminUsersQuery = { filterValue: "admin" };
    const numFilter: AdminUsersQuery = { filterValue: 42 };
    const boolFilter: AdminUsersQuery = { filterValue: true };
    expect(typeof strFilter.filterValue).toBe("string");
    expect(typeof numFilter.filterValue).toBe("number");
    expect(typeof boolFilter.filterValue).toBe("boolean");
  });
});

describe("AdminUserListItem — shape", () => {
  it("requires id and email fields", () => {
    const user: AdminUserListItem = {
      id: "u-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAupAt: null,
    };
    expect(user.id).toBe("u-1");
    expect(user.email).toBe("alice@example.com");
  });

  it("optional fields can be undefined", () => {
    const user: AdminUserListItem = {
      id: "u-2",
      name: "Bob",
      email: "bob@example.com",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAupAt: null,
    };
    expect(user.image).toBeUndefined();
    expect(user.role).toBeUndefined();
    expect(user.banned).toBeUndefined();
  });

  it("optional fields can be null", () => {
    const user: AdminUserListItem = {
      id: "u-3",
      name: "Carol",
      email: "carol@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAupAt: null,
      image: null,
      role: null,
      banned: null,
      banReason: null,
      banExpires: null,
    };
    expect(user.image).toBeNull();
    expect(user.role).toBeNull();
    expect(user.banned).toBeNull();
  });

  it("does not include password field", () => {
    const user: AdminUserListItem = {
      id: "u-4",
      name: "Dan",
      email: "dan@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAupAt: null,
    };
    expect("password" in user).toBe(false);
  });

  it("does not include preferences field", () => {
    const user: AdminUserListItem = {
      id: "u-5",
      name: "Eve",
      email: "eve@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAupAt: null,
    };
    expect("preferences" in user).toBe(false);
  });
});

describe("AdminUsersPaginated — shape", () => {
  it("has users, total, limit, offset", () => {
    const paginated: AdminUsersPaginated = {
      users: [],
      total: 0,
      limit: 20,
      offset: 0,
    };
    expect(paginated.total).toBe(0);
    expect(paginated.limit).toBe(20);
    expect(paginated.offset).toBe(0);
    expect(Array.isArray(paginated.users)).toBe(true);
  });

  it("users array can hold multiple items", () => {
    const user: AdminUserListItem = {
      id: "u-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      acceptedAupAt: null,
    };
    const paginated: AdminUsersPaginated = {
      users: [
        user,
        { ...user, id: "u-2", email: "bob@example.com", name: "Bob" },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    };
    expect(paginated.users).toHaveLength(2);
    expect(paginated.total).toBe(2);
  });

  it("offset represents page skip", () => {
    const paginated: AdminUsersPaginated = {
      users: [],
      total: 100,
      limit: 10,
      offset: 50,
    };
    expect(paginated.offset).toBe(50);
  });
});

describe("AdminUpdateUserDetailsData — shape", () => {
  it("requires userId", () => {
    const update: AdminUpdateUserDetailsData = { userId: "u-1" };
    expect(update.userId).toBe("u-1");
  });

  it("accepts all optional fields", () => {
    const update: AdminUpdateUserDetailsData = {
      userId: "u-1",
      name: "New Name",
      email: "new@example.com",
      image: "https://example.com/avatar.png",
    };
    expect(update.name).toBe("New Name");
    expect(update.email).toBe("new@example.com");
    expect(update.image).toBe("https://example.com/avatar.png");
  });

  it("optional fields can be omitted", () => {
    const update: AdminUpdateUserDetailsData = { userId: "u-1" };
    expect(update.name).toBeUndefined();
    expect(update.email).toBeUndefined();
    expect(update.image).toBeUndefined();
  });

  it("partial update with only name", () => {
    const update: AdminUpdateUserDetailsData = { userId: "u-1", name: "Alice" };
    expect(update.name).toBe("Alice");
    expect(update.email).toBeUndefined();
  });
});
