/**
 * @module @kb-labs/cli-core/generators/openapi
 * OpenAPI spec generation from manifests
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { generateOpenAPI } from '@kb-labs/plugin-adapter-rest';

/**
 * OpenAPI specification (simplified)
 */
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
  };
  'x-kb-plugin-id'?: string;
}

/**
 * Generate OpenAPI spec from manifest
 * Uses real generator from plugin-adapter-rest
 * @param manifest - Plugin manifest V2
 * @returns OpenAPI specification
 */
export function generateOpenAPISpec(manifest: ManifestV2): OpenAPISpec {
  return generateOpenAPI(manifest) as OpenAPISpec;
}

/**
 * Merge multiple OpenAPI specs into one (deterministic)
 * @param specs - Array of OpenAPI specs
 * @returns Merged OpenAPI spec
 */
export function mergeOpenAPISpecs(specs: OpenAPISpec[]): OpenAPISpec {
  if (specs.length === 0) {
    return {
      openapi: '3.1.0',
      info: {
        title: 'KB Labs API',
        version: '1.0.0',
      },
      paths: {},
    };
  }

  if (specs.length === 1) {
    return specs[0]!;
  }

  const merged: OpenAPISpec = {
    openapi: '3.1.0',
    info: {
      title: 'KB Labs API',
      version: '1.0.0',
      description: 'Aggregated API from all plugins',
    },
    paths: {},
    components: {
      schemas: {},
    },
  };

  // Sort specs by plugin ID for determinism
  const sortedSpecs = [...specs].sort((a, b) => {
    const aId = a['x-kb-plugin-id'] || '';
    const bId = b['x-kb-plugin-id'] || '';
    return aId.localeCompare(bId);
  });

  // Merge paths (deterministically sorted)
  const allPaths: Array<[string, any, string]> = [];
  
  for (const spec of sortedSpecs) {
    const pluginId = spec['x-kb-plugin-id'] || 'unknown';
    
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      // Add x-kb-plugin-id to each operation
      const enhancedPathItem = { ...pathItem };
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (enhancedPathItem[method]) {
          enhancedPathItem[method] = {
            ...enhancedPathItem[method],
            'x-kb-plugin-id': pluginId,
          };
        }
      }
      
      allPaths.push([path, enhancedPathItem, pluginId]);
    }
  }

  // Sort paths alphabetically
  allPaths.sort((a, b) => a[0].localeCompare(b[0]));
  
  for (const [path, pathItem] of allPaths) {
    merged.paths[path] = pathItem;
  }

  // Merge schemas with plugin ID prefix (deterministically sorted)
  for (const spec of sortedSpecs) {
    const pluginId = spec['x-kb-plugin-id'] || 'unknown';
    
    if (spec.components?.schemas) {
      const schemaEntries = Object.entries(spec.components.schemas).sort((a, b) =>
        a[0].localeCompare(b[0])
      );
      
      for (const [name, schema] of schemaEntries) {
        const prefixedName = `${pluginId}__${name}`;
        merged.components!.schemas![prefixedName] = schema;
      }
    }
  }

  return merged;
}

