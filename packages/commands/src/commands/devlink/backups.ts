import type { Command } from "../../types";
import { listBackups, cleanupOldBackups, validateBackup, setBackupProtection, formatTimestampAge } from "@kb-labs/devlink-core";
import { colors } from "@kb-labs/cli-core";

export const backups: Command = {
  name: "backups",
  category: "devlink",
  describe: "Manage DevLink backups",
  longDescription: "List, validate, prune, and manage DevLink backups",
  aliases: ["devlink:backups"],
  flags: [
    { name: "json", type: "boolean", description: "Output in JSON format" },
    { name: "type", type: "string", description: "Filter by type: freeze|apply", choices: ["freeze", "apply"] },
    { name: "limit", type: "number", description: "Limit number of backups shown" },
    { name: "validate", type: "boolean", description: "Validate backup integrity" },
    { name: "all", type: "boolean", description: "Validate all backups" },
    { name: "prune", type: "boolean", description: "Prune old backups" },
    { name: "keep", type: "number", description: "Number of backups to keep (default: 20)" },
    { name: "keep-days", type: "number", description: "Keep backups younger than N days (default: 14)" },
    { name: "min-age", type: "string", description: "Minimum age before deletion (e.g., '1h', '30m')" },
    { name: "dry-run", type: "boolean", description: "Show what would be deleted without deleting" },
    { name: "protect", type: "string", description: "Mark backup as protected (timestamp)" },
    { name: "unprotect", type: "string", description: "Remove protected status (timestamp)" },
  ],
  examples: [
    "kb devlink backups",
    "kb devlink backups --type freeze",
    "kb devlink backups --limit 10",
    "kb devlink backups --validate --all",
    "kb devlink backups --prune --keep 20",
    "kb devlink backups --protect 2025-10-19T14-15-46.944Z",
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      json: false,
      type: undefined,
      limit: undefined,
      validate: false,
      all: false,
      prune: false,
      keep: 20,
      "keep-days": 14,
      "min-age": "1h",
      "dry-run": false,
      protect: undefined,
      unprotect: undefined,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { json, type, limit, validate, all, prune, keep, "keep-days": keepDays, "min-age": minAge, "dry-run": dryRun, protect, unprotect } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Handle protect/unprotect
      if (protect) {
        const success = await setBackupProtection(rootDir, protect as string, true);
        if (json) {
          ctx.presenter.json({ ok: success, action: "protect", timestamp: protect });
          ctx.sentJSON = true;
        } else {
          if (success) {
            ctx.presenter.write(`${colors.green("✓")} Backup protected: ${protect}\n`);
          } else {
            ctx.presenter.error(`${colors.red("✗")} Failed to protect backup: ${protect}\n`);
            return 1;
          }
        }
        return 0;
      }

      if (unprotect) {
        const success = await setBackupProtection(rootDir, unprotect as string, false);
        if (json) {
          ctx.presenter.json({ ok: success, action: "unprotect", timestamp: unprotect });
          ctx.sentJSON = true;
        } else {
          if (success) {
            ctx.presenter.write(`${colors.green("✓")} Backup unprotected: ${unprotect}\n`);
          } else {
            ctx.presenter.error(`${colors.red("✗")} Failed to unprotect backup: ${unprotect}\n`);
            return 1;
          }
        }
        return 0;
      }

      // Handle prune
      if (prune) {
        const minAgeMs = parseMinAge(minAge as string);
        const result = await cleanupOldBackups(
          rootDir,
          {
            keepCount: keep as number,
            keepDays: keepDays as number,
            minAge: minAgeMs,
          },
          dryRun as boolean
        );

        if (json) {
          ctx.presenter.json({
            ok: true,
            action: "prune",
            removed: result.removed.map((b) => b.timestamp),
            kept: result.kept.map((b) => b.timestamp),
            protected: result.skippedProtected.map((b) => b.timestamp),
            dryRun,
          });
          ctx.sentJSON = true;
        } else {
          ctx.presenter.write(colors.cyan(colors.bold("🗑️  Backup Cleanup")) + (dryRun ? colors.dim(" (dry-run)") : "") + "\n\n");

          ctx.presenter.write(`${colors.cyan("Would remove:")} ${result.removed.length}\n`);
          for (const backup of result.removed.slice(0, 10)) {
            ctx.presenter.write(`  ${colors.dim("•")} ${backup.timestamp}  ${colors.dim("•")}  ${formatTimestampAge(backup.timestamp)}  ${colors.dim("•")}  ${backup.type}\n`);
          }
          if (result.removed.length > 10) {
            ctx.presenter.write(`  ${colors.dim(`... +${result.removed.length - 10} more`)}\n`);
          }

          ctx.presenter.write(`\n${colors.cyan("Will keep:")} ${result.kept.length}\n`);
          if (result.skippedProtected.length > 0) {
            ctx.presenter.write(`${colors.cyan("Protected:")} ${result.skippedProtected.length}\n`);
          }

          if (dryRun) {
            ctx.presenter.write(`\n${colors.dim("💡 Run without --dry-run to actually delete")}\n`);
          }
        }

        return 0;
      }

      // List backups
      const backups = await listBackups(rootDir, {
        type: type as "freeze" | "apply" | undefined,
        validate: validate || all,
      });

      if (json) {
        const limitNum = typeof limit === "number" ? limit : backups.length;
        ctx.presenter.json({
          ok: true,
          total: backups.length,
          backups: backups.slice(0, limitNum),
        });
        ctx.sentJSON = true;
        return 0;
      }

      // Human-readable output
      ctx.presenter.write(colors.cyan(colors.bold("📦 DevLink Backups")) + colors.dim(` (${backups.length} total)`) + "\n\n");

      const limitNum = typeof limit === "number" ? limit : undefined;
      const displayBackups = limitNum ? backups.slice(0, limitNum) : backups.slice(0, 20);

      for (const backup of displayBackups) {
        const age = formatTimestampAge(backup.timestamp);
        const typeLabel = backup.type === "freeze" ? colors.blue("freeze") : colors.yellow("apply");
        const lockIcon = backup.hasLock ? colors.green("✓") : colors.dim("–");
        const protectIcon = backup.isProtected ? colors.yellow("🔒") : "";
        
        const details: string[] = [];
        if (backup.depsCount) details.push(`${backup.depsCount} deps`);
        if (backup.hasLock) details.push(`${lockIcon} lock`);
        if (backup.isProtected) details.push(protectIcon);

        ctx.presenter.write(`  ${backup.timestamp}  ${colors.dim("•")}  ${age}  ${colors.dim("•")}  ${typeLabel}  ${colors.dim("•")}  ${details.join(" ")}\n`);
      }

      if (backups.length > displayBackups.length) {
        ctx.presenter.write(`\n  ${colors.dim(`... +${backups.length - displayBackups.length} more`)}\n`);
      }

      ctx.presenter.write(`\n${colors.dim("💡 Use:")} ${colors.cyan("kb devlink undo --backup <timestamp>")}\n`);
      ctx.presenter.write(`${colors.dim("💡 Cleanup:")} ${colors.cyan("kb devlink backups --prune")}\n`);

      return 0;
    } catch (error: any) {
      if (json) {
        ctx.presenter.json({
          ok: false,
          error: {
            message: error.message,
            code: error.code || "BACKUPS_ERROR",
          },
        });
        ctx.sentJSON = true;
      } else {
        ctx.presenter.error(`❌ Backups operation failed\n`);
        ctx.presenter.error(`   Error: ${error.message}\n`);
      }

      return 1;
    }
  },
};

/**
 * Parse min-age string (e.g., "1h", "30m", "2d") to milliseconds
 */
function parseMinAge(str: string | undefined): number {
  if (!str) return 3600000; // Default 1h
  
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 3600000; // Default 1h

  const value = parseInt(match[1] || "1", 10);
  const unit = match[2] || "h";

  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return 3600000;
  }
}

