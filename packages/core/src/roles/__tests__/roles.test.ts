import { describe, it, expect } from "vitest";
import { ROLES, ROLE_IDS } from "../../roles.js";
import type { RoleId } from "../../roles.js";

describe("ROLE_IDS", () => {
  it("contains exactly 4 roles", () => {
    expect(ROLE_IDS).toHaveLength(4);
  });

  it("contains admin", () => {
    expect(ROLE_IDS).toContain("admin");
  });

  it("contains suite_owner", () => {
    expect(ROLE_IDS).toContain("suite_owner");
  });

  it("contains maintainer", () => {
    expect(ROLE_IDS).toContain("maintainer");
  });

  it("contains viewer", () => {
    expect(ROLE_IDS).toContain("viewer");
  });
});

describe("ROLES structure", () => {
  const roleIds: RoleId[] = ["admin", "suite_owner", "maintainer", "viewer"];

  it.each(roleIds)("%s has a label", (roleId) => {
    expect(typeof ROLES[roleId].label).toBe("string");
    expect(ROLES[roleId].label.length).toBeGreaterThan(0);
  });

  it.each(roleIds)("%s has a color", (roleId) => {
    expect(typeof ROLES[roleId].color).toBe("string");
    expect(ROLES[roleId].color.length).toBeGreaterThan(0);
  });

  it.each(roleIds)("%s has a description", (roleId) => {
    expect(typeof ROLES[roleId].description).toBe("string");
    expect(ROLES[roleId].description.length).toBeGreaterThan(0);
  });

  it.each(roleIds)("%s has all permission keys defined", (roleId) => {
    const perms = ROLES[roleId].permissions;
    expect(typeof perms.approveNaming).toBe("boolean");
    expect(typeof perms.rejectNaming).toBe("boolean");
    expect(typeof perms.assignReviewers).toBe("boolean");
    expect(typeof perms.createNaming).toBe("boolean");
    expect(typeof perms.editNaming).toBe("boolean");
    expect(typeof perms.deleteNaming).toBe("boolean");
    expect(typeof perms.manageUsers).toBe("boolean");
  });
});

describe("admin permissions", () => {
  const perms = ROLES.admin.permissions;

  it("can approve naming", () => {
    expect(perms.approveNaming).toBe(true);
  });

  it("can reject naming", () => {
    expect(perms.rejectNaming).toBe(true);
  });

  it("can assign reviewers", () => {
    expect(perms.assignReviewers).toBe(true);
  });

  it("can create naming", () => {
    expect(perms.createNaming).toBe(true);
  });

  it("can edit naming", () => {
    expect(perms.editNaming).toBe(true);
  });

  it("can delete naming", () => {
    expect(perms.deleteNaming).toBe(true);
  });

  it("can manage users", () => {
    expect(perms.manageUsers).toBe(true);
  });
});

describe("viewer permissions", () => {
  const perms = ROLES.viewer.permissions;

  it("cannot approve naming", () => {
    expect(perms.approveNaming).toBe(false);
  });

  it("cannot reject naming", () => {
    expect(perms.rejectNaming).toBe(false);
  });

  it("cannot assign reviewers", () => {
    expect(perms.assignReviewers).toBe(false);
  });

  it("cannot create naming", () => {
    expect(perms.createNaming).toBe(false);
  });

  it("cannot edit naming", () => {
    expect(perms.editNaming).toBe(false);
  });

  it("cannot delete naming", () => {
    expect(perms.deleteNaming).toBe(false);
  });

  it("cannot manage users", () => {
    expect(perms.manageUsers).toBe(false);
  });
});

describe("suite_owner permissions", () => {
  const perms = ROLES.suite_owner.permissions;

  it("can approve naming", () => {
    expect(perms.approveNaming).toBe(true);
  });

  it("can reject naming", () => {
    expect(perms.rejectNaming).toBe(true);
  });

  it("can assign reviewers", () => {
    expect(perms.assignReviewers).toBe(true);
  });

  it("can create naming", () => {
    expect(perms.createNaming).toBe(true);
  });

  it("can edit naming", () => {
    expect(perms.editNaming).toBe(true);
  });

  it("cannot delete naming", () => {
    expect(perms.deleteNaming).toBe(false);
  });

  it("cannot manage users", () => {
    expect(perms.manageUsers).toBe(false);
  });
});

describe("maintainer permissions", () => {
  const perms = ROLES.maintainer.permissions;

  it("can create naming", () => {
    expect(perms.createNaming).toBe(true);
  });

  it("can edit naming", () => {
    expect(perms.editNaming).toBe(true);
  });

  it("cannot approve naming", () => {
    expect(perms.approveNaming).toBe(false);
  });

  it("cannot reject naming", () => {
    expect(perms.rejectNaming).toBe(false);
  });

  it("cannot assign reviewers", () => {
    expect(perms.assignReviewers).toBe(false);
  });

  it("cannot delete naming", () => {
    expect(perms.deleteNaming).toBe(false);
  });

  it("cannot manage users", () => {
    expect(perms.manageUsers).toBe(false);
  });
});
