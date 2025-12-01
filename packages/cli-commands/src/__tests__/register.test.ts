import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DiscoveryResult, RegisteredCommand, CommandManifest } from "../registry/types";
import type { ManifestRegistrationResult } from "../registry/register";

const mockRegister = vi.hoisted(() => vi.fn());
const mockRegisterGroup = vi.hoisted(() => vi.fn());
const mockMarkPartial = vi.hoisted(() => vi.fn());
const mockRegisterManifests = vi.hoisted(() =>
  vi.fn(async (): Promise<ManifestRegistrationResult> => ({
    registered: [],
    skipped: [],
    collisions: 0,
    errors: 0,
  })),
);
const mockPreflightManifests = vi.hoisted(() =>
  vi.fn((discovered: DiscoveryResult[]) => ({ valid: discovered, skipped: [] })),
);
const mockDiscoverManifests = vi.hoisted(() =>
  vi.fn(async (): Promise<DiscoveryResult[]> => []),
);
const mockDisposeAllPlugins = vi.hoisted(() => vi.fn());
const mockPluginRegistry = vi.hoisted(() =>
  vi.fn().mockImplementation(() => ({
    refresh: vi.fn(),
    list: vi.fn(() => []),
  })),
);

vi.mock("@kb-labs/cli-core", () => ({
  PluginRegistry: mockPluginRegistry,
}));

vi.mock("../registry/service", () => ({
  registry: {
    register: mockRegister,
    registerGroup: mockRegisterGroup,
    markPartial: mockMarkPartial,
    listManifests: vi.fn(() => []),
    listProductGroups: vi.fn(() => []),
  },
}));

vi.mock("../registry/register", () => ({
  registerManifests: mockRegisterManifests,
  disposeAllPlugins: mockDisposeAllPlugins,
  preflightManifests: mockPreflightManifests,
}));

vi.mock("../registry/discover.js", () => ({
  discoverManifests: mockDiscoverManifests,
}));

async function loadModules() {
  const { registerBuiltinCommands } = await import("../utils/register");
  const { registry } = await import("../registry/service");
  return { registerBuiltinCommands, registry };
}

describe("registerBuiltinCommands", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRegisterManifests.mockResolvedValue({
      registered: [],
      skipped: [],
      collisions: 0,
      errors: 0,
    });
    mockDiscoverManifests.mockResolvedValue([]);
  });

  it("registers core system commands", async () => {
    const discoveryFixture: DiscoveryResult[] = [
      {
        source: "workspace",
        packageName: "@kb-labs/test-package",
        manifestPath: "/virtual/manifest.mjs",
        pkgRoot: "/virtual/pkg",
        manifests: [
          {
            manifestVersion: "1.0" as const,
            id: "test:command",
            group: "test",
            describe: "Test command",
            loader: async () => ({ run: async () => 0 }),
          } satisfies CommandManifest,
        ],
      },
    ];

    mockDiscoverManifests.mockResolvedValueOnce(discoveryFixture);
    const registeredCommand: RegisteredCommand = {
      manifest: discoveryFixture[0]!.manifests[0]!,
      available: true,
      source: "workspace",
      shadowed: false,
      pkgRoot: "/virtual/pkg",
      packageName: "@kb-labs/test-package",
    };

    mockRegisterManifests.mockResolvedValueOnce({
      registered: [registeredCommand],
      skipped: [],
      collisions: 0,
      errors: 0,
    });

    const { registerBuiltinCommands } = await loadModules();

    await registerBuiltinCommands();

    expect(mockRegister).toHaveBeenCalled();
    const registeredNames = mockRegister.mock.calls.map((call) => call[0]?.name);
    expect(registeredNames).toEqual(
      expect.arrayContaining(["hello", "version", "diagnose"]),
    );
    expect(mockMarkPartial).toHaveBeenCalledWith(true);
    expect(mockMarkPartial).toHaveBeenLastCalledWith(false);
    expect(mockRegisterManifests).toHaveBeenCalled();
  });

  it("is idempotent on subsequent calls", async () => {
    const { registerBuiltinCommands } = await loadModules();

    await registerBuiltinCommands();
    const firstCount = mockRegister.mock.calls.length;

    await registerBuiltinCommands();
    expect(mockRegister.mock.calls.length).toBe(firstCount);
  });

  it("does not throw during registration", async () => {
    const { registerBuiltinCommands } = await loadModules();
    await expect(registerBuiltinCommands()).resolves.not.toThrow();
  });
});
