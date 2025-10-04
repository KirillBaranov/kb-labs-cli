#!/usr/bin/env tsx

import { getProfileService, resolveProfileCached } from '../runtime/profiles';
import type { ResolvedProfile } from '../runtime/profiles-simple';

interface SmokeOptions {
  json?: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const options: SmokeOptions = {
    json: args.includes('--json'),
  };

  try {
    console.log('🔍 KB Labs CLI Profiles Smoke Test');
    console.log('=====================================');

    const startTime = Date.now();

    // Get profile service
    console.log('📦 Initializing profile service...');
    const _service = await getProfileService();
    const serviceInitTime = Date.now() - startTime;
    console.log(`✅ Profile service initialized in ${serviceInitTime}ms`);

    // Resolve profile
    const profileName = process.env.KB_PROFILE ?? 'default';
    console.log(`🎯 Resolving profile: ${profileName}`);

    const resolveStartTime = Date.now();
    const resolved = await resolveProfileCached({
      name: profileName,
      strict: true,
    });
    const resolveTime = Date.now() - resolveStartTime;

    console.log(`✅ Profile resolved in ${resolveTime}ms`);

    // Generate summary
    const summary = generateSummary(resolved, {
      serviceInitTime,
      resolveTime,
      totalTime: Date.now() - startTime,
    });

    if (options.json) {
      // Raw JSON output
      console.log(JSON.stringify(resolved, null, 2));
    } else {
      // Human-readable summary
      printSummary(summary);
    }

    console.log('\n🎉 Smoke test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Smoke test failed:', error);

    if (options.json) {
      console.log(JSON.stringify({
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      }, null, 2));
    }

    process.exit(1);
  }
}

interface ProfileSummary {
  name: string;
  kind: string;
  scope: string;
  products: string[];
  filesCount: number;
  timing: {
    serviceInitTime: number;
    resolveTime: number;
    totalTime: number;
  };
  meta?: any;
}

function generateSummary(resolved: ResolvedProfile, timing: any): ProfileSummary {
  return {
    name: resolved.name,
    kind: resolved.kind,
    scope: resolved.scope,
    products: Object.keys(resolved.products),
    filesCount: resolved.files.length,
    timing,
    meta: resolved.meta,
  };
}

function printSummary(summary: ProfileSummary) {
  console.log('\n📊 Profile Summary');
  console.log('==================');
  console.log(`Name: ${summary.name}`);
  console.log(`Kind: ${summary.kind}`);
  console.log(`Scope: ${summary.scope}`);
  console.log(`Products: ${summary.products.length > 0 ? summary.products.join(', ') : 'none'}`);
  console.log(`Files: ${summary.filesCount}`);

  if (summary.timing) {
    console.log('\n⏱️  Timing');
    console.log('==========');
    console.log(`Service Init: ${summary.timing.serviceInitTime}ms`);
    console.log(`Resolve: ${summary.timing.resolveTime}ms`);
    console.log(`Total: ${summary.timing.totalTime}ms`);
  }

  if (summary.meta && Object.keys(summary.meta).length > 0) {
    console.log('\n📋 Metadata');
    console.log('============');
    for (const [key, value] of Object.entries(summary.meta)) {
      console.log(`${key}: ${value}`);
    }
  }
}

// Run the smoke test
main().catch((error) => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
