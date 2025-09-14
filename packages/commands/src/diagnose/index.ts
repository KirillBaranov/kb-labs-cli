import type { CliCommand } from "../../core/command";
import { findRepoRoot } from "@kb-labs/core-sys/repo";
import { resolveProfile } from "@kb-labs/shared/profiles";

export const diagnoseCommand: CliCommand = {
    name: "diagnose",
    description: "Diagnose environment, repo, profiles",
    async run(ctx, _argv, flags) {
        const repoRoot = findRepoRoot();
        const profId = (flags.profile as string) || (process.env.SENTINEL_PROFILE ?? "default");
        const profilesDir = (flags.profilesDir as string) || "profiles";
        const { profile, diagnostics } = await resolveProfile({
            repoRoot,
            profileId: profId,
            profilesDir
        });
        const payload = { repoRoot, profileId: profId, profilesDir, diagnostics };
        if (ctx.presenter.isTTY) {
            ctx.presenter.section("Repo");
            ctx.presenter.table([{ repoRoot }]);
            ctx.presenter.section("Profile");
            ctx.presenter.table([{ id: profile.id, schema: profile.schemaVersion }]);
            if (diagnostics.length) {
                ctx.presenter.section("Diagnostics");
                ctx.presenter.table(diagnostics.map(d => ({ level: d.level, code: d.code, message: d.message })));
            }
        } else {
            ctx.presenter.json({ ok: true, ...payload });
        }
        return 0;
    }
};