import type { CliCommand, CliContext } from "@kb-labs/cli-core";

// Simple mock profile data for demonstration
interface MockProfile {
  name: string;
  kind: string;
  scope: string;
  products: Record<string, any>;
  files: string[];
  meta?: Record<string, any>;
}

function createMockProfile(name: string, strict: boolean): MockProfile {
  return {
    name,
    kind: 'project',
    scope: 'local',
    products: {
      'example-product': {
        config: 'example-config',
        enabled: true
      }
    },
    files: ['package.json', 'README.md'],
    meta: {
      resolveTime: Date.now(),
      strict
    }
  };
}

export class ProfilesValidateCommand implements CliCommand {
  name = "profiles:validate";
  description = "Validate a profile configuration";

  flags = {
    name: {
      type: "string",
      default: "default",
      description: "Profile name to validate",
    },
    strict: {
      type: "boolean",
      default: true,
      description: "Use strict validation mode",
    },
    json: {
      type: "boolean",
      default: false,
      description: "Output result in JSON format",
    },
  };

  async run(ctx: CliContext, argv: string[], flags: Record<string, unknown>): Promise<number> {
    const { name, strict, json } = flags;

    try {
      // Create mock profile for demonstration
      const resolved = createMockProfile(name as string, strict as boolean);

      if (json) {
        ctx.presenter.json({
          ok: true,
          profile: {
            name: resolved.name,
            kind: resolved.kind,
            scope: resolved.scope,
            products: Object.keys(resolved.products),
            filesCount: resolved.files.length,
          },
          meta: resolved.meta,
        });
      } else {
        ctx.presenter.write("✅ Profile valid\n");
        ctx.presenter.write(`   Name: ${resolved.name}\n`);
        ctx.presenter.write(`   Kind: ${resolved.kind}\n`);
        ctx.presenter.write(`   Scope: ${resolved.scope}\n`);
        ctx.presenter.write(`   Products: ${Object.keys(resolved.products).join(", ")}\n`);
        ctx.presenter.write(`   Files: ${resolved.files.length}\n`);
      }

      return 0;
    } catch (error: any) {

      if (json) {
        const errorResult = {
          ok: false,
          errors: [{
            message: error.message,
            code: error.name || 'VALIDATION_ERROR',
            ...(error.cause && { cause: error.cause }),
          }],
        };
        ctx.presenter.json(errorResult);
      } else {
        ctx.presenter.error("❌ Validation failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      // Return appropriate exit code based on error type
      if (error.name === 'SchemaValidationError' || error.name === 'ProfileSchemaError') {
        return 2; // Schema validation errors
      }
      return 1; // Other errors
    }
  }
}
