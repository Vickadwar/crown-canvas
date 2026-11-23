/**
 * @file src/lib/__tests__/permissions.test.ts
 * @description Unit tests for granular RBAC permissions, custom role resolution,
 * navigation tab access, password policy validation, expiry calculation, and temp passwords.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_PERMISSIONS,
  DEFAULT_PASSWORD_POLICY,
  canAccessTab,
  computePasswordExpiryStatus,
  generateTemporaryPassword,
  resolveEffectivePermissions,
  validatePasswordPolicy,
} from "../permissions";

describe("permissions & password policy", () => {
  it("grants full permissions to super_admin", () => {
    const perms = resolveEffectivePermissions([{ role: "super_admin" }]);
    assert.equal(perms.length, ALL_PERMISSIONS.length);
    assert.equal(canAccessTab(perms, "team"), true);
    assert.equal(canAccessTab(perms, "broadcasts"), true);
  });

  it("restricts read-only auditor away from content mutations & team management", () => {
    const perms = resolveEffectivePermissions([{ role: "auditor" }]);
    assert.equal(canAccessTab(perms, "overview"), true);
    assert.equal(canAccessTab(perms, "fleet"), true);
    assert.equal(canAccessTab(perms, "analytics"), true);
    assert.equal(canAccessTab(perms, "media"), false);
    assert.equal(canAccessTab(perms, "team"), false);
    assert.equal(canAccessTab(perms, "broadcasts"), false);
  });

  it("merges custom role permissions across multiple scopes", () => {
    const customMap = new Map([
      [
        "role-designer",
        { permissions: ["overview:view" as const, "studio:design" as const, "media:upload" as const] },
      ],
    ]);
    const perms = resolveEffectivePermissions(
      [{ role: "content_editor", roleId: "role-designer" }],
      customMap
    );
    assert.equal(canAccessTab(perms, "studio"), true);
    assert.equal(canAccessTab(perms, "media"), true);
    assert.equal(canAccessTab(perms, "playlists"), false);
    assert.equal(canAccessTab(perms, "team"), false);
  });

  it("validates password policy complexity and blocks reusing current password", () => {
    const weak = validatePasswordPolicy("abc", DEFAULT_PASSWORD_POLICY);
    assert.equal(weak.valid, false);
    assert.ok(weak.errors.length >= 2);

    const same = validatePasswordPolicy(
      "Crown2026!",
      DEFAULT_PASSWORD_POLICY,
      "Crown2026!"
    );
    assert.equal(same.valid, false);
    assert.match(same.errors[0], /different/i);

    const strong = validatePasswordPolicy(
      "CrownCanvas2026",
      DEFAULT_PASSWORD_POLICY,
      "OldPass2025"
    );
    assert.equal(strong.valid, true);
  });

  it("calculates password expiry status accurately (disabled, active, expired)", () => {
    const now = Date.parse("2026-11-22T12:00:00Z");

    const disabled = computePasswordExpiryStatus("2020-01-01T00:00:00Z", 0, now);
    assert.equal(disabled.expired, false);
    assert.equal(disabled.expiresInDays, null);

    const fresh = computePasswordExpiryStatus("2026-11-12T12:00:00Z", 90, now);
    assert.equal(fresh.expired, false);
    assert.equal(fresh.expiresInDays, 80);

    const expired = computePasswordExpiryStatus("2026-08-01T12:00:00Z", 90, now);
    assert.equal(expired.expired, true);
    assert.equal(expired.expiresInDays, 0);
  });

  it("generates policy-compliant readable temporary passwords", () => {
    for (let i = 0; i < 10; i++) {
      const temp = generateTemporaryPassword(12);
      assert.equal(temp.length, 12);
      assert.equal(validatePasswordPolicy(temp, DEFAULT_PASSWORD_POLICY).valid, true);
      assert.equal(/[0O1lI]/.test(temp), false);
    }
  });
});
