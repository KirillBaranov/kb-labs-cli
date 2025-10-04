// Temporary simplified imports until @kb-labs/core-profiles is fixed
import {
  resolveConfig,
  createProfileServiceFromConfig,
  getLogger,
  type ProfilesConfig,
  type ResolvedProfile,
  type ResolveOptions,
  type ProfileService
} from './profiles-simple';

// Cache for profile services by cwd
const profileServiceCache = new Map<string, ProfileService>();

// Get logger with profiles-specific level
function getProfilesLogger() {
  const logLevel = process.env.KB_PROFILES_LOG_LEVEL || 'info';
  return getLogger('profiles', { level: logLevel });
}

export interface InitProfileServiceOptions {
  cwd?: string;
  overrides?: Partial<ProfilesConfig>;
  strict?: boolean;
  defaultName?: string;
}

/**
 * Initialize a profile service with the given options
 */
export async function initProfileService(
  opts: InitProfileServiceOptions = {}
): Promise<ProfileService> {
  const { cwd = process.cwd(), overrides, strict, defaultName } = opts;
  const logger = getProfilesLogger();

  logger.debug('Initializing profile service', { cwd, overrides, strict, defaultName });

  try {
    // Resolve configuration
    const config = await resolveConfig({ cwd });
    logger.debug('Resolved config', { config });

    // Merge profiles config with overrides
    const profilesConfig = {
      ...config.profiles,
      ...overrides,
    };

    // Apply option overrides if provided
    if (strict !== undefined) {
      profilesConfig.strict = strict;
    }
    if (defaultName !== undefined) {
      profilesConfig.defaultName = defaultName;
    }

    logger.debug('Merged profiles config', { profilesConfig });

    // Create profile service
    const service = createProfileServiceFromConfig(profilesConfig, cwd);

    logger.info('Profile service initialized successfully', { cwd });
    return service;
  } catch (error) {
    logger.error('Failed to initialize profile service', { error, cwd });
    throw error;
  }
}

/**
 * Get a cached profile service for the given cwd (lazy singleton)
 */
export async function getProfileService(cwd: string = process.cwd()): Promise<ProfileService> {
  const logger = getProfilesLogger();

  // Check cache first
  if (profileServiceCache.has(cwd)) {
    logger.debug('Using cached profile service', { cwd });
    return profileServiceCache.get(cwd)!;
  }

  logger.debug('Creating new profile service', { cwd });

  // Initialize and cache
  const service = await initProfileService({ cwd });
  profileServiceCache.set(cwd, service);

  logger.debug('Profile service cached', { cwd });
  return service;
}

/**
 * Resolve a profile with caching
 */
export async function resolveProfileCached(
  opts: Omit<ResolveOptions, 'cwd'> = {}
): Promise<ResolvedProfile> {
  const logger = getProfilesLogger();
  const { name = 'default', strict = false, ...restOpts } = opts;

  logger.debug('Resolving profile with cache', { name, strict, ...restOpts });

  try {
    const service = await getProfileService();
    const resolved = await service.resolveProfile({
      name,
      strict,
      ...restOpts,
    });

    logger.debug('Profile resolved successfully', {
      name: resolved.name,
      kind: resolved.kind,
      scope: resolved.scope,
      productsCount: Object.keys(resolved.products).length,
      filesCount: resolved.files.length,
    });

    return resolved;
  } catch (error) {
    logger.error('Failed to resolve profile', { error, name, strict });
    throw error;
  }
}

/**
 * Get product configuration from a resolved profile
 */
export function getProductConfig(resolved: ResolvedProfile, product: string): any {
  const logger = getProfilesLogger();

  logger.debug('Getting product config', { product, profileName: resolved.name });

  if (!(product in resolved.products)) {
    throw new Error(`Product '${product}' not found in profile '${resolved.name}'`);
  }

  return resolved.products[product];
}

/**
 * Clear the profile service cache (useful for testing)
 */
export function clearProfileServiceCache(): void {
  const logger = getProfilesLogger();
  logger.debug('Clearing profile service cache');
  profileServiceCache.clear();
}
