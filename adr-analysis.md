# Intent: ADR analysis and documentation review

This context pack provides information to help implement: ADR analysis and documentation review

# Product Overview: unknown

Files indexed: 0
Last updated: 2025-10-27T10:30:20.318Z

# API Signatures

## .yalc/@kb-labs/mind-query/src/api/execute-query.ts
- executeQuery (function): export async function executeQuery(
- QueryOptions (interface): export interface QueryOptions {

## .yalc/@kb-labs/mind-query/src/cache/query-cache.ts
- QueryCache (class): export class QueryCache {

## .yalc/@kb-labs/mind-query/src/index.ts
- createPathRegistry (const): createPathRegistry
- executeQuery (const): executeQuery
- loadIndexes (const): loadIndexes
- QueryCache (const): QueryCache

## .yalc/@kb-labs/mind-query/src/loader/index-loader.ts
- clearCache (function): export function clearCache(): void {
- createPathRegistry (function): export function createPathRegistry(files: string[]): Record<string, string> {
- LoadedIndexes (interface): export interface LoadedIndexes {
- loadIndexes (function): export async function loadIndexes(cwd: string): Promise<LoadedIndexes> {

## .yalc/@kb-labs/mind-query/src/queries/chain.ts
- queryChain (function): export function queryChain(

## .yalc/@kb-labs/mind-query/src/queries/docs.ts
- queryDocs (function): export function queryDocs(

## .yalc/@kb-labs/mind-query/src/queries/exports.ts
- queryExports (function): export function queryExports(file: string, api: ApiIndex): ExportsResult {

## .yalc/@kb-labs/mind-query/src/queries/externals.ts
- queryExternals (function): export function queryExternals(

## .yalc/@kb-labs/mind-query/src/queries/impact.ts
- queryImpact (function): export function queryImpact(file: string, deps: DepsGraph): ImpactResult {

## .yalc/@kb-labs/mind-query/src/queries/meta.ts
- queryMeta (function): export function queryMeta(



# Recent Changes

No recent changes detected.


# Implementation Snippets

## .yalc/@kb-labs/mind-query/src/api/execute-query.ts
Size: 7651 bytes
Exports: 2

### executeQuery
### QueryOptions

## .yalc/@kb-labs/mind-query/src/cache/query-cache.ts
Size: 2619 bytes
Exports: 1

### QueryCache

## .yalc/@kb-labs/mind-query/src/index.ts
Size: 521 bytes
Exports: 4

### createPathRegistry
### executeQuery
### loadIndexes

## .yalc/@kb-labs/mind-query/src/loader/index-loader.ts
Size: 1408 bytes
Exports: 4

### clearCache
### createPathRegistry
### LoadedIndexes

## .yalc/@kb-labs/mind-query/src/queries/chain.ts
Size: 1015 bytes
Exports: 1

### queryChain



# Configuration

No configuration files found in this context.