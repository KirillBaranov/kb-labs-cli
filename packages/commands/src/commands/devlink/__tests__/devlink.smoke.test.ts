import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { devlinkPlan } from "../plan";
import { devlinkApply } from "../apply";
import { devlinkFreeze } from "../freeze";
import { devlinkLockApply } from "../lock-apply";
import { devlinkUndo } from "../undo";
import { devlinkStatus } from "../status";

// Mock context with presenter
const createMockContext = () => {
  const logs: string[] = [];
  const errors: string[] = [];
  const jsonOutputs: any[] = [];

  return {
    presenter: {
      write: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg),
      json: (data: any) => jsonOutputs.push(data),
    },
    logs,
    errors,
    jsonOutputs,
  };
};

describe("DevLink Commands - Smoke Tests", () => {
  const testDir = join(process.cwd(), ".kb-test-devlink");
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Full DevLink workflow", () => {
    it("should execute plan → apply (dry-run) → freeze → lock:apply (dry-run) → undo (dry-run)", async () => {
      // 1. Plan
      const planCtx = createMockContext();
      const planExitCode = await devlinkPlan.run(planCtx as any, [], { json: true });

      expect(planExitCode).toBeDefined();
      expect(planCtx.jsonOutputs.length).toBeGreaterThan(0);
      const planResult = planCtx.jsonOutputs[0];
      expect(planResult).toHaveProperty("ok");
      expect(planResult).toHaveProperty("plan");
      expect(planResult).toHaveProperty("timings");
      expect(planResult).toHaveProperty("diagnostics");
      expect(planResult).toHaveProperty("meta");
      expect(planResult.meta).toHaveProperty("actions");
      expect(planResult.meta).toHaveProperty("packages");

      // Check that plan was saved
      const planPath = join(process.cwd(), ".kb", "devlink", "last-plan.json");
      const planExists = await fs
        .access(planPath)
        .then(() => true)
        .catch(() => false);
      expect(planExists).toBe(true);

      // 2. Apply (dry-run)
      const applyCtx = createMockContext();
      const applyExitCode = await devlinkApply.run(applyCtx as any, [], {
        "dry-run": true,
        json: true,
      });

      expect(applyExitCode).toBeDefined();
      expect(applyCtx.jsonOutputs.length).toBeGreaterThan(0);
      const applyResult = applyCtx.jsonOutputs[0];
      expect(applyResult).toHaveProperty("ok");
      // Apply might fail or succeed, just check it returns something
      if (applyResult.ok) {
        expect(applyResult).toHaveProperty("dryRun", true);
        expect(applyResult).toHaveProperty("summary");
        expect(applyResult).toHaveProperty("executed");
        expect(applyResult).toHaveProperty("skipped");
        expect(applyResult).toHaveProperty("errors");
        expect(applyResult).toHaveProperty("meta");
        expect(applyResult.meta).toHaveProperty("executedCount");
        expect(applyResult.meta).toHaveProperty("skippedCount");
        expect(applyResult.meta).toHaveProperty("errorCount");
      }

      // 3. Freeze
      const freezeCtx = createMockContext();
      const freezeExitCode = await devlinkFreeze.run(freezeCtx as any, [], {
        pin: "caret",
        json: true,
      });

      expect(freezeExitCode).toBeDefined();
      expect(freezeCtx.jsonOutputs.length).toBeGreaterThan(0);
      const freezeResult = freezeCtx.jsonOutputs[0];
      expect(freezeResult).toHaveProperty("ok");

      // Freeze might fail or succeed
      if (freezeResult.ok) {
        expect(freezeResult).toHaveProperty("lockFile");
        expect(freezeResult).toHaveProperty("pin", "caret");
        expect(freezeResult).toHaveProperty("meta");
        expect(freezeResult.meta).toHaveProperty("lockPath");

        // Check that lock file was created
        const lockPath = join(process.cwd(), ".kb", "devlink", "lock.json");
        const lockExists = await fs
          .access(lockPath)
          .then(() => true)
          .catch(() => false);
        expect(lockExists).toBe(true);
      }

      // 4. Lock:Apply (dry-run)
      const lockApplyCtx = createMockContext();
      const lockApplyExitCode = await devlinkLockApply.run(
        lockApplyCtx as any,
        [],
        {
          "dry-run": true,
          json: true,
        }
      );

      expect(lockApplyExitCode).toBeDefined();
      expect(lockApplyCtx.jsonOutputs.length).toBeGreaterThan(0);
      const lockApplyResult = lockApplyCtx.jsonOutputs[0];
      expect(lockApplyResult).toHaveProperty("ok");
      expect(lockApplyResult).toHaveProperty("dryRun", true);
      if (lockApplyResult.ok) {
        expect(lockApplyResult).toHaveProperty("executed");
        expect(lockApplyResult).toHaveProperty("diagnostics");
        expect(lockApplyResult).toHaveProperty("meta");
      }

      // 5. Undo (dry-run)
      const undoCtx = createMockContext();
      const undoExitCode = await devlinkUndo.run(undoCtx as any, [], {
        "dry-run": true,
        json: true,
      });

      expect(undoExitCode).toBeDefined();
      expect(undoCtx.jsonOutputs.length).toBeGreaterThan(0);
      const undoResult = undoCtx.jsonOutputs[0];
      expect(undoResult).toHaveProperty("ok");
      expect(undoResult).toHaveProperty("dryRun", true);
      if (undoResult.ok) {
        expect(undoResult).toHaveProperty("reverted");
        expect(undoResult).toHaveProperty("diagnostics");
        expect(undoResult).toHaveProperty("meta");
        expect(undoResult.meta).toHaveProperty("revertedCount");
      }
    }, 30000); // 30 second timeout for full workflow

    it("should execute status command", async () => {
      const statusCtx = createMockContext();
      const statusExitCode = await devlinkStatus.run(statusCtx as any, [], {
        json: true,
      });

      expect(statusExitCode).toBeDefined();
      expect(statusCtx.jsonOutputs.length).toBeGreaterThan(0);
      const statusResult = statusCtx.jsonOutputs[0];
      expect(statusResult).toHaveProperty("ok");
      expect(statusResult).toHaveProperty("packages");
      expect(statusResult).toHaveProperty("links");
      expect(statusResult).toHaveProperty("unknown");
      expect(statusResult).toHaveProperty("entries");
      expect(statusResult).toHaveProperty("meta");
    });

    it("should validate files created under .kb/devlink/", async () => {
      const devlinkDir = join(process.cwd(), ".kb", "devlink");

      // Check that directory exists
      const dirExists = await fs
        .access(devlinkDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);

      // Check expected files - at least plan should exist
      const planPath = join(devlinkDir, "last-plan.json");
      const planExists = await fs
        .access(planPath)
        .then(() => true)
        .catch(() => false);
      expect(planExists).toBe(true);

      if (planExists) {
        const content = await fs.readFile(planPath, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed).toBeDefined();
      }

      // Lock file might not exist if freeze failed, so we check optionally
      const lockPath = join(devlinkDir, "lock.json");
      const lockExists = await fs
        .access(lockPath)
        .then(() => true)
        .catch(() => false);

      if (lockExists) {
        const content = await fs.readFile(lockPath, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed).toBeDefined();
      }
    });
  });

  describe("Command flag validation", () => {
    it("devlink:plan should accept --roots flag", async () => {
      const ctx = createMockContext();
      const exitCode = await devlinkPlan.run(ctx as any, [], {
        roots: process.cwd(),
        json: true,
      });

      expect(exitCode).toBeDefined();
      expect(ctx.jsonOutputs.length).toBeGreaterThan(0);
    });

    it("devlink:apply should accept --from-file flag", async () => {
      const ctx = createMockContext();
      const planPath = join(process.cwd(), ".kb", "devlink", "last-plan.json");

      const exitCode = await devlinkApply.run(ctx as any, [], {
        "from-file": planPath,
        "dry-run": true,
        json: true,
      });

      expect(exitCode).toBeDefined();
    });

    it("devlink:freeze should accept --pin flag", async () => {
      const ctx = createMockContext();

      // Test with exact pin
      const exitCodeExact = await devlinkFreeze.run(ctx as any, [], {
        pin: "exact",
        json: true,
      });
      expect(exitCodeExact).toBeDefined();

      // Test with caret pin
      const exitCodeCaret = await devlinkFreeze.run(ctx as any, [], {
        pin: "caret",
        json: true,
      });
      expect(exitCodeCaret).toBeDefined();
    });

    it("devlink:status should accept --roots flag", async () => {
      const ctx = createMockContext();
      const exitCode = await devlinkStatus.run(ctx as any, [], {
        roots: process.cwd(),
        json: true,
      });

      expect(exitCode).toBeDefined();
      expect(ctx.jsonOutputs.length).toBeGreaterThan(0);
    });

    it("devlink:plan should accept policy flags", async () => {
      const ctx = createMockContext();
      const exitCode = await devlinkPlan.run(ctx as any, [], {
        allow: "package-a,package-b",
        deny: "package-c",
        "force-local": "package-d",
        "force-npm": "package-e,package-f",
        json: true,
      });

      expect(exitCode).toBeDefined();
      expect(ctx.jsonOutputs.length).toBeGreaterThan(0);
      const result = ctx.jsonOutputs[0];
      expect(result).toHaveProperty("ok");
    });

    it("devlink:plan should return exitCode=2 on cycles", async () => {
      const ctx = createMockContext();
      const exitCode = await devlinkPlan.run(ctx as any, [], {
        json: true,
      });

      // If there are cycles, should return 2
      if (ctx.jsonOutputs.length > 0) {
        const result = ctx.jsonOutputs[0];
        if (result.plan?.cycles && result.plan.cycles.length > 0) {
          expect(exitCode).toBe(2);
        }
      }
    });

    it("devlink:plan should return exitCode=2 on deny-hit", async () => {
      const ctx = createMockContext();
      const exitCode = await devlinkPlan.run(ctx as any, [], {
        deny: "@kb-labs/cli-core",
        json: true,
      });

      expect(exitCode).toBeDefined();
      expect(ctx.jsonOutputs.length).toBeGreaterThan(0);
      const result = ctx.jsonOutputs[0];

      // If diagnostics contain deny-hit, should return 2
      if (result.diagnostics && result.diagnostics.some((d: string) =>
        d.toLowerCase().includes('deny') || d.toLowerCase().includes('denied')
      )) {
        expect(exitCode).toBe(2);
      }
    });

    it("devlink:apply should accept --yes flag", async () => {
      const ctx = createMockContext();
      const exitCode = await devlinkApply.run(ctx as any, [], {
        yes: true,
        "dry-run": true,
        json: true,
      });

      expect(exitCode).toBeDefined();
      expect(ctx.jsonOutputs.length).toBeGreaterThan(0);
    });

    it("devlink:lock:apply should accept --yes flag", async () => {
      const ctx = createMockContext();
      const exitCode = await devlinkLockApply.run(ctx as any, [], {
        yes: true,
        "dry-run": true,
        json: true,
      });

      expect(exitCode).toBeDefined();
      expect(ctx.jsonOutputs.length).toBeGreaterThan(0);
    });

    it("devlink:undo should accept --yes flag", async () => {
      const ctx = createMockContext();
      const exitCode = await devlinkUndo.run(ctx as any, [], {
        yes: true,
        "dry-run": true,
        json: true,
      });

      expect(exitCode).toBeDefined();
      expect(ctx.jsonOutputs.length).toBeGreaterThan(0);
    });
  });

  describe("JSON output consistency", () => {
    it("all commands should return consistent JSON schema", async () => {
      const commands = [
        { name: "plan", cmd: devlinkPlan, flags: {} },
        { name: "apply", cmd: devlinkApply, flags: { "dry-run": true } },
        { name: "freeze", cmd: devlinkFreeze, flags: {} },
        {
          name: "lock:apply",
          cmd: devlinkLockApply,
          flags: { "dry-run": true },
        },
        { name: "undo", cmd: devlinkUndo, flags: { "dry-run": true } },
        { name: "status", cmd: devlinkStatus, flags: {} },
      ];

      for (const { name, cmd, flags } of commands) {
        const ctx = createMockContext();
        await cmd.run(ctx as any, [], { ...flags, json: true });

        expect(ctx.jsonOutputs.length).toBeGreaterThan(0);
        const result = ctx.jsonOutputs[0];

        // All commands should return 'ok' field
        expect(result).toHaveProperty("ok");
        // ok might be undefined in error cases, so check if defined
        if (result.ok !== undefined) {
          expect(typeof result.ok).toBe("boolean");
        }

        // All successful commands should have diagnostics/warnings arrays
        if (result.ok) {
          // diagnostics and warnings are optional but if present should be arrays
          if (result.diagnostics) {
            expect(Array.isArray(result.diagnostics)).toBe(true);
          }
          if (result.warnings) {
            expect(Array.isArray(result.warnings)).toBe(true);
          }
        }
      }
    });
  });
});

