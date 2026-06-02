import * as path from "path";

// Per-language data-access vocabularies, the sibling of complexityProfiles. The structural
// detection (is this call inside a loop? does this string hold SQL?) is language-agnostic;
// only the *names* of the ORM/query methods differ across ecosystems. A profile supplies
// those names so the QueryAnalyzer can spot N+1 calls, unbounded fetches, and eager-load
// chains regardless of language.
//
// `queryCalls` deliberately lists only *unambiguous* database calls — names that would also
// match in-memory operations (Array.find, LINQ First/Count/ToList on a List) are left out,
// because an N+1 false positive on every `.find()` would make the signal worthless.
export interface QueryProfile {
  // Method names that clearly issue a database query (presence inside a loop ⇒ N+1 risk).
  readonly queryCalls: ReadonlySet<string>;
  // Collection fetches flagged when called with no argument (no filter): `findAll()`.
  readonly unboundedFinders: ReadonlySet<string>;
  // Eager-load / join-expansion calls; 3+ chained ⇒ over-fetching risk.
  readonly eagerLoaders: ReadonlySet<string>;
}

// TypeScript/JavaScript ORMs: TypeORM, Prisma, Sequelize, Mongoose.
const TS_PROFILE: QueryProfile = {
  queryCalls: new Set([
    "findOne",
    "findOneBy",
    "findBy",
    "findMany",
    "findUnique",
    "findFirst",
    "findAll",
    "findByPk",
    "findById",
    "save",
    "insert",
    "createQueryBuilder",
    "getMany",
    "getOne",
    "getRawMany",
  ]),
  unboundedFinders: new Set(["findAll", "findMany"]),
  eagerLoaders: new Set(["leftJoinAndSelect", "innerJoinAndSelect", "populate"]),
};

// Java: Spring Data repositories + JPA EntityManager.
const JAVA_PROFILE: QueryProfile = {
  queryCalls: new Set([
    "findAll",
    "findOne",
    "findById",
    "getOne",
    "getById",
    "getReferenceById",
    "save",
    "saveAll",
    "delete",
    "deleteById",
    "createQuery",
    "createNativeQuery",
    "getResultList",
    "getSingleResult",
  ]),
  unboundedFinders: new Set(["findAll"]),
  eagerLoaders: new Set(["fetch"]),
};

// C#: Entity Framework Core (DbContext LINQ) + Dapper. Only the async materialisers and raw
// SQL helpers are listed — the synchronous LINQ verbs (ToList/First/Count/Any) also run
// against in-memory collections, so flagging them would be noise.
const CSHARP_PROFILE: QueryProfile = {
  queryCalls: new Set([
    "ToListAsync",
    "ToArrayAsync",
    "FirstAsync",
    "FirstOrDefaultAsync",
    "SingleAsync",
    "SingleOrDefaultAsync",
    "FindAsync",
    "CountAsync",
    "AnyAsync",
    "FromSqlRaw",
    "FromSqlInterpolated",
    "ExecuteSqlRaw",
    "QueryAsync",
    "QueryFirstOrDefault",
  ]),
  unboundedFinders: new Set(["ToListAsync", "ToArrayAsync"]),
  eagerLoaders: new Set(["Include", "ThenInclude"]),
};

const PROFILE_BY_EXTENSION: Record<string, QueryProfile> = {
  ".cs": CSHARP_PROFILE,
  ".java": JAVA_PROFILE,
  ".ts": TS_PROFILE,
  ".tsx": TS_PROFILE,
  ".mts": TS_PROFILE,
  ".cts": TS_PROFILE,
  ".js": TS_PROFILE,
  ".jsx": TS_PROFILE,
  ".mjs": TS_PROFILE,
  ".cjs": TS_PROFILE,
};

// Union profile for unknown/absent extensions — conservative detection still works.
const DEFAULT_QUERY_PROFILE: QueryProfile = {
  queryCalls: new Set([
    ...TS_PROFILE.queryCalls,
    ...JAVA_PROFILE.queryCalls,
    ...CSHARP_PROFILE.queryCalls,
  ]),
  unboundedFinders: new Set(["findAll", "findMany", "ToListAsync"]),
  eagerLoaders: new Set(["Include", "populate", "leftJoinAndSelect"]),
};

export function queryProfileForFile(filePath?: string): QueryProfile {
  if (!filePath) {
    return DEFAULT_QUERY_PROFILE;
  }
  return PROFILE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? DEFAULT_QUERY_PROFILE;
}
